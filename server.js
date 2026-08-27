const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const CHATS_DIR = path.join(DATA_DIR, "chats");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(CHATS_DIR, { recursive: true });

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));


/* =========================
   数据读写
========================= */

function readUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch {
        return [];
    }
}

function writeUsers(users) {
    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(users, null, 2),
        "utf8"
    );
}

function getChatFile(username) {
    const id = crypto
        .createHash("sha256")
        .update(username)
        .digest("hex");

    return path.join(CHATS_DIR, `${id}.json`);
}

function readChats(username) {
    const file = getChatFile(username);

    if (!fs.existsSync(file)) {
        return [];
    }

    try {
        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );
    } catch {
        return [];
    }
}

function writeChats(username, chats) {
    fs.writeFileSync(
        getChatFile(username),
        JSON.stringify(chats, null, 2),
        "utf8"
    );
}


/* =========================
   密码加密
========================= */

function hashPassword(password, salt) {

    salt =
        salt ||
        crypto.randomBytes(16).toString("hex");

    const hash = crypto
        .scryptSync(password, salt, 64)
        .toString("hex");

    return `${salt}:${hash}`;
}

function verifyPassword(password, savedPassword) {

    try {

        const parts = savedPassword.split(":");

        const salt = parts[0];
        const originalHash = parts[1];

        const hash = crypto
            .scryptSync(password, salt, 64)
            .toString("hex");

        return crypto.timingSafeEqual(
            Buffer.from(hash, "hex"),
            Buffer.from(originalHash, "hex")
        );

    } catch {

        return false;

    }
}


/* =========================
   登录 Session
========================= */

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    "qingwu-ai-change-this-secret";


function createSession(username) {

    const payload = {

        username,

        expires:
            Date.now() +
            1000 * 60 * 60 * 24 * 30

    };

    const data =
        Buffer
            .from(JSON.stringify(payload))
            .toString("base64url");

    const signature =
        crypto
            .createHmac(
                "sha256",
                SESSION_SECRET
            )
            .update(data)
            .digest("base64url");

    return `${data}.${signature}`;
}


function getSession(req) {

    const cookie =
        req.headers.cookie || "";

    const sessionCookie =
        cookie
            .split(";")
            .map(x => x.trim())
            .find(x =>
                x.startsWith("qingwu_session=")
            );

    if (!sessionCookie) {
        return null;
    }

    const token =
        decodeURIComponent(
            sessionCookie.split("=")[1] || ""
        );

    const parts = token.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const data = parts[0];
    const signature = parts[1];

    const expected =
        crypto
            .createHmac(
                "sha256",
                SESSION_SECRET
            )
            .update(data)
            .digest("base64url");

    if (signature !== expected) {
        return null;
    }

    try {

        const payload =
            JSON.parse(
                Buffer
                    .from(data, "base64url")
                    .toString()
            );

        if (payload.expires < Date.now()) {
            return null;
        }

        return payload.username;

    } catch {

        return null;

    }
}


/* =========================
   登录验证中间件
========================= */

function requireLogin(req, res, next) {

    const username =
        getSession(req);

    if (!username) {

        return res.status(401).json({
            error: "请先登录"
        });

    }

    req.username = username;

    next();
}


/* =========================
   用户公开资料
========================= */

function publicUser(user) {

    return {

        username: user.username,

        nickname: user.nickname,

        avatar: user.avatar || "",

        createdAt: user.createdAt

    };
}


/* =========================
   注册
========================= */

app.post(
    "/api/register",
    (req, res) => {

        const {
            username,
            password,
            nickname
        } = req.body || {};


        if (
            !username ||
            !/^[A-Za-z0-9_]{3,20}$/.test(username)
        ) {

            return res.status(400).json({
                error:
                    "用户名需要 3-20 位字母、数字或下划线"
            });

        }


        if (
            typeof password !== "string" ||
            password.length < 6
        ) {

            return res.status(400).json({
                error:
                    "密码至少需要 6 位"
            });

        }


        const users = readUsers();


        const exists =
            users.some(
                user =>
                    user.username.toLowerCase() ===
                    username.toLowerCase()
            );


        if (exists) {

            return res.status(409).json({
                error: "用户名已经存在"
            });

        }


        const user = {

            username,

            password:
                hashPassword(password),

            nickname:
                String(
                    nickname ||
                    username
                )
                    .trim()
                    .slice(0, 24),

            avatar: "",

            createdAt:
                new Date().toISOString()

        };


        users.push(user);

        writeUsers(users);


        const session =
            createSession(username);


        res.setHeader(
            "Set-Cookie",
            `qingwu_session=${encodeURIComponent(session)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`
        );


        res.json({

            success: true,

            user:
                publicUser(user)

        });

    }
);


/* =========================
   登录
========================= */

app.post(
    "/api/login",
    (req, res) => {

        const {
            username,
            password
        } = req.body || {};


        const users = readUsers();


        const user =
            users.find(
                item =>
                    item.username.toLowerCase() ===
                    String(username || "")
                        .toLowerCase()
            );


        if (
            !user ||
            !verifyPassword(
                password || "",
                user.password
            )
        ) {

            return res.status(401).json({
                error:
                    "用户名或密码错误"
            });

        }


        const session =
            createSession(user.username);


        res.setHeader(
            "Set-Cookie",
            `qingwu_session=${encodeURIComponent(session)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`
        );


        res.json({

            success: true,

            user:
                publicUser(user)

        });

    }
);


/* =========================
   退出登录
========================= */

app.post(
    "/api/logout",
    (req, res) => {

        res.setHeader(
            "Set-Cookie",
            "qingwu_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
        );

        res.json({
            success: true
        });

    }
);


/* =========================
   获取当前用户
========================= */

app.get(
    "/api/me",
    requireLogin,
    (req, res) => {

        const users =
            readUsers();

        const user =
            users.find(
                x =>
                    x.username ===
                    req.username
            );


        if (!user) {

            return res.status(404).json({
                error: "用户不存在"
            });

        }


        res.json({

            user:
                publicUser(user)

        });

    }
);


/* =========================
   修改个人资料
========================= */

app.patch(
    "/api/profile",
    requireLogin,
    (req, res) => {

        const users =
            readUsers();

        const user =
            users.find(
                x =>
                    x.username ===
                    req.username
            );


        if (!user) {

            return res.status(404).json({
                error: "用户不存在"
            });

        }


        if (
            typeof req.body.nickname ===
            "string"
        ) {

            user.nickname =
                req.body.nickname
                    .trim()
                    .slice(0, 24)
                    ||
                    user.username;

        }


        if (
            typeof req.body.avatar ===
            "string"
        ) {

            user.avatar =
                req.body.avatar
                    .slice(0, 500000);

        }


        writeUsers(users);


        res.json({

            success: true,

            user:
                publicUser(user)

        });

    }
);


/* =========================
   获取聊天列表
========================= */

app.get(
    "/api/chats",
    requireLogin,
    (req, res) => {

        const chats =
            readChats(
                req.username
            );


        res.json({
            chats
        });

    }
);


/* =========================
   新建聊天
========================= */

app.post(
    "/api/chats",
    requireLogin,
    (req, res) => {

        const chats =
            readChats(
                req.username
            );


        const chat = {

            id:
                crypto.randomUUID(),

            title:
                String(
                    req.body.title ||
                    "新对话"
                )
                    .slice(0, 80),

            updatedAt:
                new Date().toISOString(),

            messages: []

        };


        chats.unshift(chat);

        writeChats(
            req.username,
            chats
        );


        res.json({
            chat
        });

    }
);


/* =========================
   保存聊天
========================= */

app.put(
    "/api/chats/:id",
    requireLogin,
    (req, res) => {

        const chats =
            readChats(
                req.username
            );


        const chat =
            chats.find(
                item =>
                    item.id ===
                    req.params.id
            );


        if (!chat) {

            return res.status(404).json({
                error:
                    "聊天不存在"
            });

        }


        if (
            typeof req.body.title ===
            "string"
        ) {

            chat.title =
                req.body.title
                    .slice(0, 80)
                    ||
                    "新对话";

        }


        if (
            Array.isArray(
                req.body.messages
            )
        ) {

            chat.messages =
                req.body.messages
                    .slice(-100);

        }


        chat.updatedAt =
            new Date().toISOString();


        writeChats(
            req.username,
            chats
        );


        res.json({
            chat
        });

    }
);


/* =========================
   删除聊天
========================= */

app.delete(
    "/api/chats/:id",
    requireLogin,
    (req, res) => {

        const chats =
            readChats(
                req.username
            );


        const newChats =
            chats.filter(
                chat =>
                    chat.id !==
                    req.params.id
            );


        writeChats(
            req.username,
            newChats
        );


        res.json({
            success: true
        });

    }
);


/* =========================
   AI 对话
========================= */

app.post(
    "/api/chat",
    requireLogin,
    async (req, res) => {

        const message =
            String(
                req.body.message ||
                ""
            ).trim();


        const history =
            Array.isArray(
                req.body.history
            )
                ? req.body.history.slice(-20)
                : [];


        if (!message) {

            return res.status(400).json({
                error:
                    "消息不能为空"
            });

        }


        const apiKey =
            process.env.AI_API_KEY;


        if (!apiKey) {

            return res.status(503).json({
                error:
                    "AI_API_KEY 尚未配置"
            });

        }


        const model =
            process.env.AI_MODEL ||
            "openrouter/free";


        try {

            const messages = [

                {
                    role: "system",

                    content:
                        "你是青雾 AI，一个友好、清晰、可靠的中文 AI 助手。回答自然、准确、有帮助。"
                },

                ...history.map(
                    message => ({

                        role:
                            message.role ===
                            "assistant"
                                ? "assistant"
                                : "user",

                        content:
                            String(
                                message.content ||
                                ""
                            ).slice(
                                0,
                                12000
                            )

                    })
                ),

                {
                    role: "user",

                    content: message

                }

            ];


            const response =
                await fetch(
                    "https://openrouter.ai/api/v1/chat/completions",
                    {

                        method: "POST",

                        headers: {

                            "Authorization":
                                `Bearer ${apiKey}`,

                            "Content-Type":
                                "application/json",

                            "HTTP-Referer":
                                process.env.APP_URL ||
                                "https://qingwuai.onrender.com",

                            "X-Title":
                                "Qingwu AI"

                        },

                        body:
                            JSON.stringify({

                                model,

                                messages

                            })

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(502).json({

                    error:
                        data?.error?.message ||
                        "AI 请求失败"

                });

            }


            const answer =
                data?.choices?.[0]
                    ?.message
                    ?.content;


            if (!answer) {

                return res.status(502).json({

                    error:
                        "AI 没有返回内容"

                });

            }


            res.json({

                answer

            });


        } catch (error) {

            console.error(
                "AI Error:",
                error
            );


            res.status(502).json({

                error:
                    "无法连接 AI 服务"

            });

        }

    }
);


/* =========================
   前端页面
========================= */

app.get(
    "*",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);


/* =========================
   启动服务器
========================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `青雾 AI 已启动：${PORT}`
        );

    }
);
