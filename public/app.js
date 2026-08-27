const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => [
    ...document.querySelectorAll(selector)
];

const state = {
    user: null,
    chats: [],
    currentChatId: null,
    authMode: "login",
    busy: false,
    selectedAvatar: null
};


/* =========================
   API
========================= */

async function api(url, options = {}) {

    const config = {
        ...options,
        headers: {
            ...(options.body
                ? {
                    "Content-Type": "application/json"
                }
                : {}),
            ...(options.headers || {})
        }
    };

    const response = await fetch(url, config);

    const data = await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "服务器请求失败"
        );
    }

    return data;
}


/* =========================
   Toast
========================= */

let toastTimer = null;

function toast(message) {

    const element = $("#toast");

    if (!element) return;

    element.textContent = message;

    element.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        element.classList.remove("show");

    }, 2500);
}


/* =========================
   登录 / 注册
========================= */

function setAuthMode(mode) {

    state.authMode = mode;

    $$(".auth-tab").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.mode === mode
        );

    });

    const register = mode === "register";

    $("#nicknameGroup")
        .classList.toggle(
            "hidden",
            !register
        );

    $("#nicknameInput").required = register;

    $("#authSubmit").textContent =
        register
            ? "创建账号"
            : "登录";

    $("#authError").textContent = "";
}


function showAuthPage() {

    $("#authPage")
        .classList.remove("hidden");

    $("#app")
        .classList.add("hidden");
}


function showApp() {

    $("#authPage")
        .classList.add("hidden");

    $("#app")
        .classList.remove("hidden");

    updateUserUI();
}


/* =========================
   用户信息
========================= */

function updateUserUI() {

    if (!state.user) return;

    $("#sidebarNickname").textContent =
        state.user.nickname;

    $("#sidebarUsername").textContent =
        "@" + state.user.username;

    $("#modalUsername").textContent =
        "@" + state.user.username;

    $("#profileNickname").value =
        state.user.nickname;


    const sidebarAvatar =
        $("#sidebarAvatar");

    if (sidebarAvatar) {

        if (state.user.avatar) {

            sidebarAvatar.innerHTML =
                `<img src="${state.user.avatar}" alt="头像">`;

        } else {

            sidebarAvatar.textContent =
                state.user.nickname
                    .charAt(0)
                    .toUpperCase();

        }
    }


    const modalAvatar =
        $("#modalAvatar");

    if (modalAvatar) {

        if (state.user.avatar) {

            modalAvatar.innerHTML =
                `<img src="${state.user.avatar}" alt="头像">`;

        } else {

            modalAvatar.textContent =
                state.user.nickname
                    .charAt(0)
                    .toUpperCase();

        }
    }
}


/* =========================
   检查登录状态
========================= */

async function checkLogin() {

    try {

        const data =
            await api("/api/me");

        state.user = data.user;

        showApp();

        await loadChats();

    } catch {

        showAuthPage();

    }
}


/* =========================
   登录 / 注册提交
========================= */

async function handleAuth(event) {

    event.preventDefault();

    const username =
        $("#usernameInput")
            .value
            .trim();

    const password =
        $("#passwordInput")
            .value;

    const nickname =
        $("#nicknameInput")
            .value
            .trim();

    $("#authError").textContent = "";


    if (!username) {

        $("#authError").textContent =
            "请输入用户名";

        return;
    }


    if (!password) {

        $("#authError").textContent =
            "请输入密码";

        return;
    }


    try {

        $("#authSubmit").disabled = true;


        const url =
            state.authMode === "register"
                ? "/api/register"
                : "/api/login";


        const body = {
            username,
            password
        };


        if (state.authMode === "register") {

            body.nickname = nickname;

        }


        const data =
            await api(
                url,
                {
                    method: "POST",
                    body: JSON.stringify(body)
                }
            );


        state.user = data.user;

        $("#authForm").reset();

        showApp();

        await loadChats();


        toast(
            state.authMode === "register"
                ? "账号创建成功"
                : "登录成功"
        );


    } catch (error) {

        $("#authError").textContent =
            error.message;


    } finally {

        $("#authSubmit").disabled = false;

    }
}


/* =========================
   头像
========================= */

function createAvatar(user) {

    const avatar =
        document.createElement("div");

    avatar.className = "avatar";

    if (user && user.avatar) {

        const image =
            document.createElement("img");

        image.src = user.avatar;

        image.alt = "头像";

        avatar.appendChild(image);

    } else {

        avatar.textContent =
            (
                user?.nickname ||
                user?.username ||
                "Q"
            )
            .charAt(0)
            .toUpperCase();

    }

    return avatar;
}


/* =========================
   聊天记录
========================= */

async function loadChats() {

    const data =
        await api("/api/chats");

    state.chats =
        data.chats || [];

    renderChatList();


    if (
        state.currentChatId &&
        getCurrentChat()
    ) {

        renderMessages();

        return;
    }


    if (state.chats.length > 0) {

        state.currentChatId =
            state.chats[0].id;

        renderMessages();

    } else {

        createLocalChat();

    }
}


function getCurrentChat() {

    return state.chats.find(
        chat =>
            chat.id ===
            state.currentChatId
    );
}


function createLocalChat() {

    const chat = {

        id:
            "local-" +
            Date.now(),

        title:
            "新对话",

        messages: [],

        local: true

    };

    state.chats.unshift(chat);

    state.currentChatId =
        chat.id;

    renderChatList();

    renderMessages();
}


/* =========================
   新建聊天
========================= */

async function createNewChat() {

    try {

        const data =
            await api(
                "/api/chats",
                {
                    method: "POST",
                    body: JSON.stringify({
                        title: "新对话"
                    })
                }
            );


        state.chats.unshift(
            data.chat
        );

        state.currentChatId =
            data.chat.id;

        renderChatList();

        renderMessages();

        closeSidebar();

        $("#messageInput").focus();


    } catch (error) {

        toast(error.message);

    }
}


/* =========================
   聊天列表
========================= */

function renderChatList() {

    const container =
        $("#chatList");

    container.innerHTML = "";


    state.chats.forEach(chat => {

        const item =
            document.createElement("div");

        item.className =
            "chat-item";


        if (
            chat.id ===
            state.currentChatId
        ) {

            item.classList.add("active");

        }


        const title =
            document.createElement("span");

        title.className =
            "chat-item-title";

        title.textContent =
            chat.title || "新对话";


        const deleteButton =
            document.createElement("button");

        deleteButton.className =
            "chat-delete";

        deleteButton.textContent =
            "×";

        deleteButton.type =
            "button";


        item.appendChild(title);

        item.appendChild(deleteButton);


        item.addEventListener(
            "click",
            () => {

                state.currentChatId =
                    chat.id;

                renderChatList();

                renderMessages();

                closeSidebar();

            }
        );


        deleteButton.addEventListener(
            "click",
            async event => {

                event.stopPropagation();

                await deleteChat(chat);

            }
        );


        container.appendChild(item);

    });
}


/* =========================
   删除聊天
========================= */

async function deleteChat(chat) {

    if (
        !window.confirm(
            "确定删除这个对话吗？"
        )
    ) return;


    try {

        if (!chat.local) {

            await api(
                `/api/chats/${chat.id}`,
                {
                    method: "DELETE"
                }
            );

        }


        state.chats =
            state.chats.filter(
                item =>
                    item.id !== chat.id
            );


        if (
            state.currentChatId ===
            chat.id
        ) {

            if (state.chats.length) {

                state.currentChatId =
                    state.chats[0].id;

            } else {

                createLocalChat();

                return;
            }
        }


        renderChatList();

        renderMessages();

        toast("对话已删除");


    } catch (error) {

        toast(error.message);

    }
}
/* =========================
   渲染消息
========================= */

function renderMessages() {

    const container =
        $("#messages");

    container.innerHTML = "";

    const chat =
        getCurrentChat();

    if (!chat) {

        $("#welcomeScreen")
            .classList.remove("hidden");

        $("#conversationTitle")
            .textContent = "新对话";

        return;
    }

    $("#conversationTitle")
        .textContent =
        chat.title || "新对话";

    const messages =
        chat.messages || [];

    $("#welcomeScreen")
        .classList.toggle(
            "hidden",
            messages.length > 0
        );

    messages.forEach(message => {

        appendMessageToDOM(
            message.role,
            message.content
        );

    });

    requestAnimationFrame(
        scrollMessagesToBottom
    );
}


/* =========================
   添加消息
========================= */

function appendMessageToDOM(
    role,
    content
) {

    const container =
        $("#messages");

    const message =
        document.createElement("div");

    message.className =
        "message " +
        (
            role === "assistant"
                ? "ai"
                : "user"
        );


    const bubble =
        document.createElement("div");

    bubble.className =
        "message-bubble";

    bubble.textContent =
        content;


    if (role === "assistant") {

        const avatar =
            createAvatar({
                username: "QingwuAI",
                nickname: "Q"
            });

        message.appendChild(avatar);

        message.appendChild(bubble);

    } else {

        message.appendChild(bubble);

        const avatar =
            createAvatar(state.user);

        message.appendChild(avatar);
    }


    container.appendChild(message);
}


/* =========================
   滚动到底部
========================= */

function scrollMessagesToBottom() {

    const container =
        $("#messages");

    container.scrollTop =
        container.scrollHeight;
}


/* =========================
   保存聊天
========================= */

async function saveCurrentChat() {

    const chat =
        getCurrentChat();

    if (!chat) return;


    if (chat.local) {

        if (
            !chat.messages ||
            chat.messages.length === 0
        ) {
            return;
        }


        const data =
            await api(
                "/api/chats",
                {
                    method: "POST",

                    body: JSON.stringify({
                        title: chat.title
                    })
                }
            );


        const serverChat =
            data.chat;


        serverChat.messages =
            chat.messages;


        await api(
            `/api/chats/${serverChat.id}`,
            {
                method: "PUT",

                body: JSON.stringify({
                    title:
                        serverChat.title,

                    messages:
                        serverChat.messages
                })
            }
        );


        const index =
            state.chats.indexOf(chat);


        if (index !== -1) {

            state.chats.splice(
                index,
                1,
                serverChat
            );

        }


        state.currentChatId =
            serverChat.id;

        return;
    }


    await api(
        `/api/chats/${chat.id}`,
        {
            method: "PUT",

            body: JSON.stringify({
                title: chat.title,

                messages:
                    chat.messages
            })
        }
    );
}


/* =========================
   清空聊天
========================= */

async function clearCurrentChat() {

    const chat =
        getCurrentChat();

    if (!chat) return;


    if (
        !chat.messages ||
        chat.messages.length === 0
    ) {

        toast(
            "当前对话已经是空的"
        );

        return;
    }


    if (
        !window.confirm(
            "确定清空当前对话吗？"
        )
    ) {
        return;
    }


    chat.messages = [];


    try {

        await saveCurrentChat();

        renderMessages();

        toast("聊天已经清空");

    } catch (error) {

        toast(error.message);

    }
}


/* =========================
   发送消息
========================= */

async function sendMessage(text) {

    text =
        String(text || "")
            .trim();


    if (!text || state.busy) {
        return;
    }


    let chat =
        getCurrentChat();


    if (!chat) {

        createLocalChat();

        chat =
            getCurrentChat();

    }


    chat.messages.push({

        role: "user",

        content: text

    });


    if (
        !chat.title ||
        chat.title === "新对话"
    ) {

        chat.title =
            text
                .replace(/\s+/g, " ")
                .slice(0, 28);

    }


    $("#messageInput")
        .value = "";


    resizeTextarea();

    renderChatList();

    renderMessages();


    state.busy = true;

    $("#sendButton")
        .disabled = true;


    $("#typingIndicator")
        .classList.remove(
            "hidden"
        );


    try {

        const history =
            chat.messages.slice(-20);


        const data =
            await api(
                "/api/chat",
                {
                    method: "POST",

                    body: JSON.stringify({

                        message: text,

                        history: history

                    })
                }
            );


        const answer =
            data.answer ||
            "AI 没有返回内容。";


        chat.messages.push({

            role: "assistant",

            content: answer

        });


        await saveCurrentChat();


        renderChatList();

        renderMessages();


    } catch (error) {

        chat.messages.push({

            role: "assistant",

            content:
                "⚠️ " +
                error.message

        });


        renderMessages();


    } finally {

        state.busy = false;

        $("#sendButton")
            .disabled = false;

        $("#typingIndicator")
            .classList.add(
                "hidden"
            );

        $("#messageInput")
            .focus();
    }
}


/* =========================
   输入框
========================= */

function resizeTextarea() {

    const textarea =
        $("#messageInput");

    textarea.style.height =
        "auto";

    textarea.style.height =
        Math.min(
            textarea.scrollHeight,
            150
        ) + "px";
}


/* =========================
   侧边栏
========================= */

function openSidebar() {

    $("#sidebar")
        .classList.add("open");
}


function closeSidebar() {

    $("#sidebar")
        .classList.remove("open");
}


/* =========================
   用户资料
========================= */

function openProfile() {

    if (!state.user) return;

    state.selectedAvatar = null;

    $("#profileNickname")
        .value =
        state.user.nickname;

    $("#avatarFile")
        .value = "";

    updateUserUI();

    $("#profileModal")
        .classList.remove(
            "hidden"
        );
}


function closeProfile() {

    $("#profileModal")
        .classList.add(
            "hidden"
        );
}


/* =========================
   头像选择
========================= */

function handleAvatarSelect(event) {

    const file =
        event.target.files?.[0];

    if (!file) return;


    if (
        !file.type.startsWith("image/")
    ) {

        toast(
            "请选择图片文件"
        );

        return;
    }


    const reader =
        new FileReader();


    reader.onload = () => {

        state.selectedAvatar =
            reader.result;

    };


    reader.readAsDataURL(file);
}


/* =========================
   保存资料
========================= */

async function saveProfile() {

    const nickname =
        $("#profileNickname")
            .value
            .trim();


    if (!nickname) {

        toast(
            "昵称不能为空"
        );

        return;
    }


    try {

        const data =
            await api(
                "/api/profile",
                {
                    method: "PATCH",

                    body: JSON.stringify({

                        nickname: nickname,

                        avatar:
                            state.selectedAvatar ||
                            state.user.avatar ||
                            ""

                    })
                }
            );


        state.user =
            data.user;


        updateUserUI();

        closeProfile();

        toast(
            "资料保存成功"
        );


    } catch (error) {

        toast(error.message);

    }
}


/* =========================
   退出登录
========================= */

async function logout() {

    if (
        !window.confirm(
            "确定退出登录吗？"
        )
    ) {
        return;
    }


    try {

        await api(
            "/api/logout",
            {
                method: "POST"
            }
        );


        state.user = null;

        state.chats = [];

        state.currentChatId = null;


        closeProfile();

        showAuthPage();

        setAuthMode("login");

        toast("已退出登录");


    } catch (error) {

        toast(error.message);

    }
}


/* =========================
   快捷提问
========================= */

function setupSuggestions() {

    $$(".suggestion")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const text =
                        button.textContent
                            .trim()
                            .replace(
                                /^[^\u4e00-\u9fa5A-Za-z]+/,
                                ""
                            );


                    $("#messageInput")
                        .value = text;


                    resizeTextarea();


                    $("#messageInput")
                        .focus();

                }
            );

        });
}


/* =========================
   键盘
========================= */

function setupKeyboard() {

    $("#messageInput")
        .addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    $("#chatForm")
                        .requestSubmit();

                }

            }
        );
}


/* =========================
   更多按钮
========================= */

function showMoreMenu() {

    toast(
        "更多功能正在开发中 ✦"
    );
}


/* =========================
   绑定事件
========================= */

function bindEvents() {

    $$(".auth-tab")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    setAuthMode(
                        button.dataset.mode
                    );

                }
            );

        });


    $("#authForm")
        .addEventListener(
            "submit",
            handleAuth
        );


    $("#newChatButton")
        .addEventListener(
            "click",
            createNewChat
        );


    $("#menuButton")
        .addEventListener(
            "click",
            openSidebar
        );


    $("#closeSidebar")
        .addEventListener(
            "click",
            closeSidebar
        );


    $("#profileButton")
        .addEventListener(
            "click",
            openProfile
        );


    $("#closeProfile")
        .addEventListener(
            "click",
            closeProfile
        );


    $("#saveProfile")
        .addEventListener(
            "click",
            saveProfile
        );


    $("#logoutButton")
        .addEventListener(
            "click",
            logout
        );


    $("#avatarFile")
        .addEventListener(
            "change",
            handleAvatarSelect
        );


    $("#chatForm")
        .addEventListener(
            "submit",
            event => {

                event.preventDefault();

                sendMessage(
                    $("#messageInput").value
                );

            }
        );


    $("#messageInput")
        .addEventListener(
            "input",
            resizeTextarea
        );


    $("#clearChatButton")
        .addEventListener(
            "click",
            clearCurrentChat
        );


    $("#moreButton")
        .addEventListener(
            "click",
            showMoreMenu
        );


    setupSuggestions();

    setupKeyboard();
}


/* =========================
   点击弹窗背景关闭
========================= */

$("#profileModal")
    .addEventListener(
        "click",
        event => {

            if (
                event.target ===
                $("#profileModal")
            ) {

                closeProfile();

            }

        }
    );


/* =========================
   启动
========================= */

bindEvents();

setAuthMode("login");

checkLogin();
