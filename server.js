/* =========================
   青雾 AI V7.0
   server.js · 第 1 部分
========================= */

"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const multer = require("multer");

/* =========================
   基础配置
========================= */

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const DATABASE_URL =
  process.env.DATABASE_URL;

const SESSION_SECRET =
  process.env.SESSION_SECRET;

const AI_API_URL =
  process.env.AI_API_URL ||
  "https://openrouter.ai/api/v1/chat/completions";

const AI_API_KEY =
  process.env.AI_API_KEY;

const AI_MODEL =
  process.env.AI_MODEL ||
  "openrouter/free";

if (!DATABASE_URL) {
  console.error(
    "缺少 DATABASE_URL 环境变量"
  );
  process.exit(1);
}

if (!SESSION_SECRET) {
  console.error(
    "缺少 SESSION_SECRET 环境变量"
  );
  process.exit(1);
}

if (!AI_API_KEY) {
  console.warn(
    "警告：没有设置 AI_API_KEY，AI 回复将无法使用。"
  );
}

/* =========================
   PostgreSQL
========================= */

const pool = new Pool({
  connectionString: DATABASE_URL,

  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false
        }
      : false
});

/* =========================
   Express
========================= */

app.set("trust proxy", 1);

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

/* =========================
   Session
========================= */

app.use(
  session({
    store: new pgSession({
      pool,
      createTableIfMissing: true
    }),

    secret: SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite: "lax",

      maxAge:
        1000 *
        60 *
        60 *
        24 *
        30
    }
  })
);

/* =========================
   文件上传
========================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize:
      10 * 1024 * 1024
  }
});

/* =========================
   初始化数据库
========================= */

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname VARCHAR(100) NOT NULL,
      avatar TEXT,
      settings JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      title VARCHAR(200) DEFAULT '新对话',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL
        REFERENCES chats(id)
        ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT DEFAULT '',
      attachments JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size BIGINT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log(
    "数据库初始化完成"
  );
}

/* =========================
   登录检查
========================= */

function requireLogin(
  req,
  res,
  next
) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "请先登录"
    });
  }

  next();
}

/* =========================
   当前用户
========================= */

async function getCurrentUser(
  userId
) {
  const result =
    await pool.query(
      `
      SELECT
        id,
        username,
        nickname,
        avatar,
        settings,
        created_at
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

  return result.rows[0] || null;
}

/* =========================
   Auth：当前登录用户
========================= */

app.get(
  "/api/auth/me",
  async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.json({
          user: null
        });
      }

      const user =
        await getCurrentUser(
          req.session.userId
        );

      if (!user) {
        req.session.destroy(
          () => {}
        );

        return res.json({
          user: null
        });
      }

      res.json({
        user
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "获取登录状态失败"
      });
    }
  }
);

/* =========================
   Auth：注册
========================= */

app.post(
  "/api/auth/register",
  async (req, res) => {
    try {
      const username =
        String(
          req.body.username || ""
        ).trim();

      const password =
        String(
          req.body.password || ""
        );

      const nickname =
        String(
          req.body.nickname || ""
        ).trim();

      if (
        username.length < 3 ||
        username.length > 50
      ) {
        return res.status(400).json({
          error:
            "账号长度需要 3～50 个字符"
        });
      }

      if (
        password.length < 6 ||
        password.length > 100
      ) {
        return res.status(400).json({
          error:
            "密码长度需要 6～100 个字符"
        });
      }

      if (
        !nickname ||
        nickname.length > 100
      ) {
        return res.status(400).json({
          error:
            "请输入有效昵称"
        });
      }

      const existing =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE username = $1
          `,
          [username]
        );

      if (existing.rows.length) {
        return res.status(409).json({
          error:
            "这个账号已经存在"
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const result =
        await pool.query(
          `
          INSERT INTO users
            (
              username,
              password_hash,
              nickname,
              settings
            )
          VALUES
            ($1, $2, $3, $4)
          RETURNING
            id,
            username,
            nickname,
            avatar,
            settings,
            created_at
          `,
          [
            username,
            passwordHash,
            nickname,
            {}
          ]
        );

      const user =
        result.rows[0];

      req.session.userId =
        user.id;

      res.status(201).json({
        user
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "注册失败"
      });
    }
  }
);

/* =========================
   Auth：登录
========================= */

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const username =
        String(
          req.body.username || ""
        ).trim();

      const password =
        String(
          req.body.password || ""
        );

      if (!username || !password) {
        return res.status(400).json({
          error:
            "请输入账号和密码"
        });
      }

      const result =
        await pool.query(
          `
          SELECT *
          FROM users
          WHERE username = $1
          `,
          [username]
        );

      const user =
        result.rows[0];

      if (!user) {
        return res.status(401).json({
          error:
            "账号或密码错误"
        });
      }

      const valid =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "账号或密码错误"
        });
      }

      req.session.userId =
        user.id;

      res.json({
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          settings: user.settings,
          created_at:
            user.created_at
        }
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "登录失败"
      });
    }
  }
);

/* =========================
   Auth：退出
========================= */

app.post(
  "/api/auth/logout",
  (req, res) => {
    req.session.destroy(
      (error) => {
        if (error) {
          console.error(error);

          return res.status(500).json({
            error:
              "退出登录失败"
          });
        }

        res.clearCookie(
          "connect.sid"
        );

        res.json({
          success: true
        });
      }
    );
  }
);

/* =========================
   用户设置
========================= */

app.get(
  "/api/settings",
  requireLogin,
  async (req, res) => {
    try {
      const user =
        await getCurrentUser(
          req.session.userId
        );

      res.json({
        settings:
          user?.settings || {}
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "获取设置失败"
      });
    }
  }
);

app.put(
  "/api/settings",
  requireLogin,
  async (req, res) => {
    try {
      const settings =
        req.body || {};

      await pool.query(
        `
        UPDATE users
        SET settings = $1
        WHERE id = $2
        `,
        [
          settings,
          req.session.userId
        ]
      );

      res.json({
        success: true,
        settings
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "保存设置失败"
      });
    }
  }
);

/* =========================
   用户资料
========================= */

app.put(
  "/api/profile",
  requireLogin,
  async (req, res) => {
    try {
      const nickname =
        String(
          req.body.nickname || ""
        ).trim();

      const avatar =
        req.body.avatar
          ? String(req.body.avatar)
          : null;

      if (
        !nickname ||
        nickname.length > 100
      ) {
        return res.status(400).json({
          error:
            "请输入有效昵称"
        });
      }

      await pool.query(
        `
        UPDATE users
        SET
          nickname = $1,
          avatar = $2
        WHERE id = $3
        `,
        [
          nickname,
          avatar,
          req.session.userId
        ]
      );

      const user =
        await getCurrentUser(
          req.session.userId
        );

      res.json({
        user
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "保存个人资料失败"
      });
    }
  }
);

/* =========================
   聊天列表
========================= */

app.get(
  "/api/chats",
  requireLogin,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
            title,
            created_at,
            updated_at
          FROM chats
          WHERE user_id = $1
          ORDER BY updated_at DESC
          `,
          [req.session.userId]
        );

      res.json({
        chats: result.rows
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "获取聊天列表失败"
      });
    }
  }
);

/* =========================
   创建聊天
========================= */

app.post(
  "/api/chats",
  requireLogin,
  async (req, res) => {
    try {
      const title =
        String(
          req.body.title ||
          "新对话"
        ).trim();

      const result =
        await pool.query(
          `
          INSERT INTO chats
            (
              user_id,
              title
            )
          VALUES
            ($1, $2)
          RETURNING
            id,
            title,
            created_at,
            updated_at
          `,
          [
            req.session.userId,
            title || "新对话"
          ]
        );

      res.status(201).json({
        chat: result.rows[0]
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "创建聊天失败"
      });
    }
  }
);

/* =========================
   获取单个聊天
========================= */

app.get(
  "/api/chats/:id",
  requireLogin,
  async (req, res) => {
    try {
      const chatId =
        Number(req.params.id);

      if (!Number.isInteger(chatId)) {
        return res.status(400).json({
          error:
            "无效的聊天 ID"
        });
      }

      const chatResult =
        await pool.query(
          `
          SELECT
            id,
            title,
            created_at,
            updated_at
          FROM chats
          WHERE
            id = $1
            AND user_id = $2
          `,
          [
            chatId,
            req.session.userId
          ]
        );

      const chat =
        chatResult.rows[0];

      if (!chat) {
        return res.status(404).json({
          error:
            "聊天不存在"
        });
      }

      const messageResult =
        await pool.query(
          `
          SELECT
            id,
            role,
            content,
            attachments,
            created_at
          FROM messages
          WHERE chat_id = $1
          ORDER BY created_at ASC
          `,
          [chatId]
        );

      res.json({
        chat,
        messages:
          messageResult.rows
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "获取聊天失败"
      });
    }
  }
);

/* =========================
   删除聊天
========================= */

app.delete(
  "/api/chats/:id",
  requireLogin,
  async (req, res) => {
    try {
      const chatId =
        Number(req.params.id);

      const result =
        await pool.query(
          `
          DELETE FROM chats
          WHERE
            id = $1
            AND user_id = $2
          RETURNING id
          `,
          [
            chatId,
            req.session.userId
          ]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "聊天不存在"
        });
      }

      res.json({
        success: true
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "删除聊天失败"
      });
    }
  }
);

/* =========================
   上传文件
========================= */

app.post(
  "/api/uploads",
  requireLogin,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error:
            "没有收到文件"
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO uploads
            (
              user_id,
              filename,
              mimetype,
              size,
              data
            )
          VALUES
            ($1, $2, $3, $4, $5)
          RETURNING
            id,
            filename,
            mimetype,
            size,
            created_at
          `,
          [
            req.session.userId,
            req.file.originalname,
            req.file.mimetype ||
              "application/octet-stream",
            req.file.size,
            req.file.buffer
          ]
        );

      res.status(201).json({
        file: result.rows[0]
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "文件上传失败"
      });
    }
  }
);

/* =========================
   获取上传文件
========================= */

app.get(
  "/api/uploads/:id",
  requireLogin,
  async (req, res) => {
    try {
      const id =
        Number(req.params.id);

      const result =
        await pool.query(
          `
          SELECT
            filename,
            mimetype,
            size,
            data
          FROM uploads
          WHERE
            id = $1
            AND user_id = $2
          `,
          [
            id,
            req.session.userId
          ]
        );

      const file =
        result.rows[0];

      if (!file) {
        return res.status(404).send(
          "文件不存在"
        );
      }

      res.setHeader(
        "Content-Type",
        file.mimetype
      );

      res.setHeader(
        "Content-Length",
        String(file.size)
      );

      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(
          file.filename
        )}`
      );

      res.send(file.data);

    } catch (error) {
      console.error(error);

      res.status(500).send(
        "读取文件失败"
      );
    }
  }
);
/* =========================
   AI：读取上传文件
========================= */

async function getUploadData(
  uploadId,
  userId
) {
  const result = await pool.query(
    `
    SELECT
      id,
      filename,
      mimetype,
      size,
      data
    FROM uploads
    WHERE
      id = $1
      AND user_id = $2
    `,
    [uploadId, userId]
  );

  return result.rows[0] || null;
}

/* =========================
   AI：提取普通文本
========================= */

function extractTextFromUpload(file) {
  if (!file || !file.data) {
    return "";
  }

  const filename =
    String(file.filename || "").toLowerCase();

  const mimetype =
    String(file.mimetype || "").toLowerCase();

  const textLike =
    mimetype.startsWith("text/") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".md") ||
    filename.endsWith(".csv") ||
    filename.endsWith(".json");

  if (!textLike) {
    return "";
  }

  try {
    return file.data
      .toString("utf8")
      .slice(0, 12000);
  } catch {
    return "";
  }
}

/* =========================
   AI：获取聊天记录
========================= */

async function getChatHistory(
  chatId
) {
  const result = await pool.query(
    `
    SELECT
      id,
      role,
      content,
      attachments
    FROM messages
    WHERE chat_id = $1
    ORDER BY created_at ASC
    LIMIT 50
    `,
    [chatId]
  );

  return result.rows;
}

/* =========================
   AI：发送请求
========================= */

async function requestAI(
  messages
) {
  if (!AI_API_KEY) {
    throw new Error(
      "AI_API_KEY 未配置"
    );
  }

  const response =
    await fetch(
      AI_API_URL,
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${AI_API_KEY}`,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://qingwu-ai.onrender.com",

          "X-Title":
            "青雾 AI"
        },

        body: JSON.stringify({
          model: AI_MODEL,

          messages,

          temperature: 0.7,

          max_tokens: 4000
        })
      }
    );

  const raw =
    await response.text();

  let data = null;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `AI 返回了无法解析的数据：${raw.slice(
        0,
        300
      )}`
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `AI 请求失败：HTTP ${response.status}`;

    throw new Error(message);
  }

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "AI 没有返回有效内容"
    );
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (
          typeof item === "string"
        ) {
          return item;
        }

        return item?.text || "";
      })
      .join("");
  }

  return String(content);
}

/* =========================
   AI：聊天消息
========================= */

app.post(
  "/api/chats/:id/messages",
  requireLogin,
  async (req, res) => {
    try {
      const chatId =
        Number(req.params.id);

      if (
        !Number.isInteger(chatId)
      ) {
        return res.status(400).json({
          error:
            "无效的聊天 ID"
        });
      }

      const chatResult =
        await pool.query(
          `
          SELECT
            id,
            title,
            created_at,
            updated_at
          FROM chats
          WHERE
            id = $1
            AND user_id = $2
          `,
          [
            chatId,
            req.session.userId
          ]
        );

      const chat =
        chatResult.rows[0];

      if (!chat) {
        return res.status(404).json({
          error:
            "聊天不存在"
        });
      }

      const content =
        String(
          req.body.content || ""
        ).trim();

      let attachments =
        req.body.attachments || [];

      if (
        !Array.isArray(
          attachments
        )
      ) {
        attachments = [];
      }

      attachments =
        attachments.slice(0, 5);

      if (
        !content &&
        attachments.length === 0
      ) {
        return res.status(400).json({
          error:
            "消息不能为空"
        });
      }

      /* 保存用户消息 */

      const userMessageResult =
        await pool.query(
          `
          INSERT INTO messages
            (
              chat_id,
              role,
              content,
              attachments
            )
          VALUES
            ($1, 'user', $2, $3)
          RETURNING
            id,
            role,
            content,
            attachments,
            created_at
          `,
          [
            chatId,
            content,
            JSON.stringify(
              attachments
            )
          ]
        );

      const userMessage =
        userMessageResult.rows[0];

      /* 第一条消息自动设置标题 */

      const countResult =
        await pool.query(
          `
          SELECT COUNT(*)::int AS count
          FROM messages
          WHERE chat_id = $1
          `,
          [chatId]
        );

      const messageCount =
        countResult.rows[0].count;

      if (
        messageCount === 1 &&
        content
      ) {
        let title =
          content
            .replace(/\s+/g, " ")
            .slice(0, 30);

        if (!title) {
          title = "新对话";
        }

        await pool.query(
          `
          UPDATE chats
          SET
            title = $1,
            updated_at = NOW()
          WHERE id = $2
          `,
          [
            title,
            chatId
          ]
        );

        chat.title = title;
      }

      /* =========================
         构造 AI 历史
      ========================= */

      const history =
        await getChatHistory(
          chatId
        );

      const aiMessages = [
        {
          role: "system",
          content:
            "你是青雾 AI，一个友善、可靠、自然的中文 AI 助手。请直接回答用户的问题，尽量清晰、准确、有帮助。"
        }
      ];

      for (
        const message of history
      ) {
        let messageContent =
          message.content || "";

        /*
         * 如果是当前用户消息，
         * 加入附件内容。
         */

        if (
          String(message.id) ===
          String(userMessage.id)
        ) {
          const parts = [];

          if (messageContent) {
            parts.push({
              type: "text",
              text: messageContent
            });
          }

          for (
            const attachment
              of attachments
          ) {
            const uploadId =
              Number(
                attachment.id ||
                attachment.uploadId
              );

            if (
              !Number.isInteger(
                uploadId
              )
            ) {
              continue;
            }

            const file =
              await getUploadData(
                uploadId,
                req.session.userId
              );

            if (!file) {
              continue;
            }

            const text =
              extractTextFromUpload(
                file
              );

            if (text) {
              parts.push({
                type: "text",
                text:
                  `文件：${file.filename}\n\n${text}`
              });
            }

            /*
             * 图片转换为 data URL，
             * 直接交给支持视觉的模型。
             */

            if (
              String(
                file.mimetype
              ).startsWith("image/")
            ) {
              const base64 =
                file.data.toString(
                  "base64"
                );

              parts.push({
                type: "image_url",
                image_url: {
                  url:
                    `data:${file.mimetype};base64,${base64}`
                }
              });
            }
          }

          if (parts.length === 1) {
            messageContent =
              parts[0].text || "";
          } else {
            messageContent =
              parts;
          }
        }

        /*
         * AI API 只接受 user / assistant / system
         */

        if (
          message.role !==
            "user" &&
          message.role !==
            "assistant"
        ) {
          continue;
        }

        aiMessages.push({
          role: message.role,
          content:
            messageContent
        });
      }

      /* =========================
         请求 AI
      ========================= */

      let aiText = "";

      try {
        aiText =
          await requestAI(
            aiMessages
          );
      } catch (aiError) {
        console.error(
          "AI 请求失败：",
          aiError.message
        );

        /*
         * 如果图片导致模型不支持，
         * 自动尝试纯文本请求。
         */

        const fallbackMessages =
          aiMessages.map(
            message => {
              if (
                Array.isArray(
                  message.content
                )
              ) {
                const text =
                  message.content
                    .filter(
                      item =>
                        item?.type ===
                        "text"
                    )
                    .map(
                      item =>
                        item.text
                    )
                    .join("\n");

                return {
                  role:
                    message.role,
                  content:
                    text
                };
              }

              return message;
            }
          );

        try {
          aiText =
            await requestAI(
              fallbackMessages
            );
        } catch {
          return res.status(502).json({
            error:
              `AI 暂时无法回复：${aiError.message}`
          });
        }
      }

      /* =========================
         保存 AI 回复
      ========================= */

      const assistantResult =
        await pool.query(
          `
          INSERT INTO messages
            (
              chat_id,
              role,
              content,
              attachments
            )
          VALUES
            (
              $1,
              'assistant',
              $2,
              '[]'::jsonb
            )
          RETURNING
            id,
            role,
            content,
            attachments,
            created_at
          `,
          [
            chatId,
            aiText
          ]
        );

      const assistantMessage =
        assistantResult.rows[0];

      /* 更新聊天时间 */

      const updatedChatResult =
        await pool.query(
          `
          UPDATE chats
          SET updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            title,
            created_at,
            updated_at
          `,
          [chatId]
        );

      const updatedChat =
        updatedChatResult.rows[0];

      res.json({
        userMessage,
        assistantMessage,
        chat:
          updatedChat || chat
      });

    } catch (error) {
      console.error(
        "消息处理失败：",
        error
      );

      res.status(500).json({
        error:
          "发送消息失败"
      });
    }
  }
);

/* =========================
   静态网页
========================= */

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

/* =========================
   API 404
========================= */

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      error:
        "API 接口不存在"
    });
  }
);

/* =========================
   网页入口
========================= */

app.get(
  /.*/,
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
   错误处理
========================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "服务器错误：",
      error
    );

    if (
      error instanceof
      multer.MulterError
    ) {
      return res.status(400).json({
        error:
          "文件上传失败：" +
          error.message
      });
    }

    res.status(500).json({
      error:
        "服务器内部错误"
    });
  }
);

/* =========================
   启动
========================= */

async function startServer() {
  try {
    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `青雾 AI 已启动：http://0.0.0.0:${PORT}`
        );
      }
    );

  } catch (error) {
    console.error(
      "服务器启动失败：",
      error
    );

    process.exit(1);
  }
}

startServer();
