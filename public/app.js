/* =========================
   青雾 AI V7.0
   app.js · 第 1 部分
========================= */

"use strict";

/* =========================
   全局状态
========================= */

const state = {
  user: null,
  chats: [],
  currentChat: null,
  messages: [],
  authMode: "login",
  pendingFiles: [],
  recognition: null,
  isRecording: false,
  isSpeaking: false,
  speechPaused: false,
  settings: {
    theme: "system",
    glass: 18,
    fontSize: "medium",
    autoSpeech: false,
    speechRate: 1,
    animation: true
  }
};

/* =========================
   DOM 工具
========================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => {
  return Array.from(document.querySelectorAll(selector));
};

function show(element) {
  if (element) {
    element.classList.remove("hidden");
  }
}

function hide(element) {
  if (element) {
    element.classList.add("hidden");
  }
}

function escapeHTML(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================
   Toast
========================= */

let toastTimer = null;

function toast(message) {
  const el = $("#toast");

  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2200);
}

/* =========================
   API 请求
========================= */

async function api(url, options = {}) {
  const config = {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {})
    }
  };

  if (
    config.body &&
    typeof config.body === "object" &&
    !(config.body instanceof FormData)
  ) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || "请求失败");
  }

  return data;
}

/* =========================
   页面初始化
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  bindAuthEvents();
  bindChatEvents();
  bindSettingsEvents();
  bindProfileEvents();
  bindUploadEvents();
  bindVoiceEvents();
  bindSpeechEvents();
  bindMenuEvents();

  await loadSettings();
  await checkLogin();
});

/* =========================
   登录状态
========================= */

async function checkLogin() {
  try {
    const data = await api("/api/auth/me");

    if (data.user) {
      state.user = data.user;

      showMainPage();
      await loadChats();

      if (state.chats.length > 0) {
        await openChat(state.chats[0].id);
      } else {
        await createChat();
      }
    } else {
      showAuthPage();
    }
  } catch (error) {
    console.error(error);
    showAuthPage();
  }
}

function showAuthPage() {
  show($("#authPage"));
  hide($("#mainPage"));
}

function showMainPage() {
  hide($("#authPage"));
  show($("#mainPage"));

  updateUserUI();
}

/* =========================
   登录 / 注册
========================= */

function bindAuthEvents() {
  $$(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;

      if (!mode) {
        return;
      }

      state.authMode = mode;

      $$(".auth-tab").forEach((item) => {
        item.classList.toggle(
          "active",
          item.dataset.mode === mode
        );
      });

      const nicknameGroup = $("#nicknameGroup");

      if (nicknameGroup) {
        nicknameGroup.classList.toggle(
          "hidden",
          mode !== "register"
        );
      }

      const submit = $("#authSubmit");

      if (submit) {
        submit.textContent =
          mode === "login" ? "登录" : "注册并登录";
      }

      const error = $("#authError");

      if (error) {
        error.textContent = "";
      }
    });
  });

  const form = $("#authForm");

  if (form) {
    form.addEventListener("submit", handleAuth);
  }
}

async function handleAuth(event) {
  event.preventDefault();

  const username = $("#usernameInput")?.value.trim();
  const password = $("#passwordInput")?.value;
  const nickname = $("#nicknameInput")?.value.trim();

  const error = $("#authError");
  const submit = $("#authSubmit");

  if (!username || !password) {
    if (error) {
      error.textContent = "请输入账号和密码";
    }
    return;
  }

  if (state.authMode === "register" && !nickname) {
    if (error) {
      error.textContent = "请输入昵称";
    }
    return;
  }

  try {
    submit.disabled = true;
    submit.textContent = "处理中…";

    const endpoint =
      state.authMode === "login"
        ? "/api/auth/login"
        : "/api/auth/register";

    const data = await api(endpoint, {
      method: "POST",
      body: {
        username,
        password,
        nickname
      }
    });

    state.user = data.user;

    showMainPage();

    await loadChats();

    if (state.chats.length > 0) {
      await openChat(state.chats[0].id);
    } else {
      await createChat();
    }

    toast(
      state.authMode === "login"
        ? "登录成功 ✨"
        : "注册成功，欢迎来到青雾 AI"
    );

  } catch (err) {
    if (error) {
      error.textContent = err.message;
    }
  } finally {
    submit.disabled = false;
    submit.textContent =
      state.authMode === "login"
        ? "登录"
        : "注册并登录";
  }
}

/* =========================
   用户资料 UI
========================= */

function updateUserUI() {
  if (!state.user) {
    return;
  }

  const nickname =
    state.user.nickname ||
    state.user.username ||
    "青雾用户";

  const username =
    state.user.username || "";

  const avatar =
    state.user.avatar ||
    createAvatar(nickname);

  const sidebarNickname = $("#sidebarNickname");
  const sidebarUsername = $("#sidebarUsername");
  const sidebarAvatar = $("#sidebarAvatar");

  if (sidebarNickname) {
    sidebarNickname.textContent = nickname;
  }

  if (sidebarUsername) {
    sidebarUsername.textContent = `@${username}`;
  }

  if (sidebarAvatar) {
    sidebarAvatar.src = avatar;
  }

  const modalAvatar = $("#modalAvatar");

  if (modalAvatar) {
    modalAvatar.src = avatar;
  }

  const modalUsername = $("#modalUsername");

  if (modalUsername) {
    modalUsername.value = username;
  }

  const profileNickname = $("#profileNickname");

  if (profileNickname) {
    profileNickname.value = nickname;
  }
}

function createAvatar(name) {
  const first =
    String(name || "青").trim().charAt(0) || "青";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="128"
         height="128"
         viewBox="0 0 128 128">
      <rect width="128" height="128" rx="64" fill="#7c5cff"/>
      <text x="64"
            y="78"
            text-anchor="middle"
            font-size="54"
            font-family="Arial, sans-serif"
            fill="white">${escapeHTML(first)}</text>
    </svg>
  `;

  return "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(svg);
}

/* =========================
   聊天列表
========================= */

async function loadChats() {
  try {
    const data = await api("/api/chats");

    state.chats = Array.isArray(data.chats)
      ? data.chats
      : [];

    renderChatList();

  } catch (error) {
    console.error(error);
    toast("聊天列表加载失败");
  }
}

function renderChatList() {
  const list = $("#chatList");

  if (!list) {
    return;
  }

  if (state.chats.length === 0) {
    list.innerHTML = `
      <div style="
        padding:20px 10px;
        text-align:center;
        color:var(--subtext);
        font-size:13px;
      ">
        还没有聊天记录
      </div>
    `;
    return;
  }

  list.innerHTML = state.chats.map((chat) => {
    const active =
      state.currentChat &&
      String(state.currentChat.id) === String(chat.id)
        ? "active"
        : "";

    return `
      <button
        class="chat-item ${active}"
        data-chat-id="${escapeHTML(chat.id)}"
        type="button"
      >
        <span>💬</span>
        <span class="chat-item-title">
          ${escapeHTML(chat.title || "新对话")}
        </span>
      </button>
    `;
  }).join("");

  $$(".chat-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.chatId;

      if (id) {
        await openChat(id);
        closeSidebarMobile();
      }
    });
  });
}

/* =========================
   创建聊天
========================= */

async function createChat() {
  try {
    const data = await api("/api/chats", {
      method: "POST",
      body: {
        title: "新对话"
      }
    });

    const chat = data.chat;

    state.chats.unshift(chat);
    state.currentChat = chat;
    state.messages = [];

    renderChatList();
    renderMessages();

    updateConversationTitle();

    return chat;

  } catch (error) {
    console.error(error);
    toast("创建聊天失败");
    return null;
  }
}

/* =========================
   打开聊天
========================= */

async function openChat(chatId) {
  try {
    const data = await api(
      `/api/chats/${encodeURIComponent(chatId)}`
    );

    state.currentChat = data.chat;
    state.messages = Array.isArray(data.messages)
      ? data.messages
      : [];

    renderChatList();
    renderMessages();
    updateConversationTitle();

  } catch (error) {
    console.error(error);
    toast("打开聊天失败");
  }
}

/* =========================
   删除聊天
========================= */

async function deleteCurrentChat() {
  if (!state.currentChat) {
    return;
  }

  const id = state.currentChat.id;

  try {
    await api(
      `/api/chats/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    state.chats = state.chats.filter(
      chat => String(chat.id) !== String(id)
    );

    state.currentChat = null;
    state.messages = [];

    if (state.chats.length > 0) {
      await openChat(state.chats[0].id);
    } else {
      await createChat();
    }

  } catch (error) {
    console.error(error);
    toast("删除失败");
  }
}

/* =========================
   聊天标题
========================= */

function updateConversationTitle() {
  const title = $("#conversationTitle");

  if (!title) {
    return;
  }

  title.textContent =
    state.currentChat?.title ||
    "新对话";
}

/* =========================
   消息渲染
========================= */

function renderMessages() {
  const container = $("#messages");

  if (!container) {
    return;
  }

  if (!state.messages.length) {
    container.innerHTML = `
      <div id="welcomeScreen" class="welcome-screen">
        <h2>你好，我是青雾 AI</h2>
        <p>有什么想聊的？现在就可以开始。</p>

        <div class="suggestions">
          <button
            class="suggestion"
            type="button"
            data-prompt="帮我制定一个学习计划">
            📚 帮我制定一个学习计划
          </button>

          <button
            class="suggestion"
            type="button"
            data-prompt="帮我写一个有创意的故事">
            ✍️ 帮我写一个有创意的故事
          </button>

          <button
            class="suggestion"
            type="button"
            data-prompt="解释一个我不懂的知识">
            🧠 解释一个我不懂的知识
          </button>

          <button
            class="suggestion"
            type="button"
            data-prompt="给我推荐几个有趣的网站">
            🌐 推荐几个有趣的网站
          </button>
        </div>
      </div>
    `;

    bindSuggestionEvents();
    return;
  }

  container.innerHTML = state.messages
    .map(renderMessage)
    .join("");

  scrollMessagesToBottom();
}

function renderMessage(message) {
  const role =
    message.role === "user"
      ? "user"
      : "assistant";

  const content =
    message.content || "";

  const avatar =
    role === "user"
      ? state.user?.avatar || createAvatar(state.user?.nickname)
      : createAvatar("青");

  return `
    <div class="message ${role}">
      ${role === "assistant"
        ? `<img class="message-avatar"
                src="${avatar}"
                alt="青雾 AI">`
        : ""
      }

      <div class="message-content">
        ${formatAIText(content)}
      </div>

      ${role === "user"
        ? `<img class="message-avatar"
                src="${avatar}"
                alt="用户头像">`
        : ""
      }
    </div>
  `;
}

/* =========================
   简单 Markdown
========================= */

function formatAIText(text) {
  let html = escapeHTML(text);

  html = html.replace(
    /```([\s\S]*?)```/g,
    "<pre><code>$1</code></pre>"
  );

  html = html.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  html = html.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  html = html.replace(
    /^### (.*)$/gm,
    "<h3>$1</h3>"
  );

  html = html.replace(
    /^## (.*)$/gm,
    "<h2>$1</h2>"
  );

  html = html.replace(
    /^# (.*)$/gm,
    "<h1>$1</h1>"
  );

  html = html.replace(
    /\n/g,
    "<br>"
  );

  return html;
}

/* =========================
   建议按钮
========================= */

function bindSuggestionEvents() {
  $$(".suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.dataset.prompt;

      const input = $("#messageInput");

      if (!input || !prompt) {
        return;
      }

      input.value = prompt;
      input.focus();

      autoResizeTextarea();
    });
  });
}

function scrollMessagesToBottom() {
  const container = $("#messages");

  if (!container) {
    return;
  }

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

/* =========================
   聊天事件
========================= */

function bindChatEvents() {
  const newChat = $("#newChatButton");

  if (newChat) {
    newChat.addEventListener("click", async () => {
      await createChat();
      closeSidebarMobile();
    });
  }

  const input = $("#messageInput");

  if (input) {
    input.addEventListener("input", autoResizeTextarea);

    input.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  const send = $("#sendButton");

  if (send) {
    send.addEventListener("click", sendMessage);
  }

  const search = $("#chatSearchInput");

  if (search) {
    search.addEventListener("input", () => {
      const keyword =
        search.value.trim().toLowerCase();

      $$(".chat-item").forEach((item) => {
        const text =
          item.textContent.toLowerCase();

        item.style.display =
          !keyword || text.includes(keyword)
            ? ""
            : "none";
      });
    });
  }
}

function autoResizeTextarea() {
  const input = $("#messageInput");

  if (!input) {
    return;
  }

  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 160) + "px";
}

/* =========================
   发送消息
========================= */

async function sendMessage() {
  const input = $("#messageInput");
  const send = $("#sendButton");

  if (!input) {
    return;
  }

  const text = input.value.trim();

  if (!text && state.pendingFiles.length === 0) {
    return;
  }

  if (!state.currentChat) {
    await createChat();
  }

  if (!state.currentChat) {
    return;
  }

  try {
    if (send) {
      send.disabled = true;
    }

    showTyping(true);

    const attachments =
      await uploadPendingFiles();

    const userMessage = {
      role: "user",
      content: text,
      attachments
    };

    state.messages.push(userMessage);
    renderMessages();

    input.value = "";
    autoResizeTextarea();

    clearUploadPreview();

    const data = await api(
      `/api/chats/${encodeURIComponent(
        state.currentChat.id
      )}/messages`,
      {
        method: "POST",
        body: {
          content: text,
          attachments
        }
      }
    );

    if (data.userMessage) {
      state.messages[state.messages.length - 1] =
        data.userMessage;
    }

    if (data.assistantMessage) {
      state.messages.push(data.assistantMessage);
    }

    if (data.chat) {
      state.currentChat = data.chat;

      const index = state.chats.findIndex(
        chat =>
          String(chat.id) ===
          String(data.chat.id)
      );

      if (index >= 0) {
        state.chats[index] = data.chat;
      } else {
        state.chats.unshift(data.chat);
      }
    }

    renderChatList();
    renderMessages();
    updateConversationTitle();

    if (
      state.settings.autoSpeech &&
      data.assistantMessage?.content
    ) {
      speakText(data.assistantMessage.content);
    }

  } catch (error) {
    console.error(error);
    toast(error.message || "发送失败");
  } finally {
    showTyping(false);

    if (send) {
      send.disabled = false;
    }
  }
}

/* =========================
   正在输入
========================= */

function showTyping(showing) {
  const indicator = $("#typingIndicator");

  if (!indicator) {
    return;
  }

  if (showing) {
    indicator.textContent = "青雾 AI 正在思考…";
    show(indicator);
  } else {
    hide(indicator);
  }
}
/* =========================
   青雾 AI V7.0
   app.js · 第 2 部分
========================= */

/* =========================
   上传文件
========================= */

function bindUploadEvents() {
  const fileButton = $("#fileButton");
  const imageButton = $("#imageButton");
  const fileInput = $("#fileInput");
  const imageInput = $("#imageInput");

  if (fileButton && fileInput) {
    fileButton.addEventListener("click", () => {
      fileInput.click();
    });
  }

  if (imageButton && imageInput) {
    imageButton.addEventListener("click", () => {
      imageInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      addFiles(fileInput.files);
      fileInput.value = "";
    });
  }

  if (imageInput) {
    imageInput.addEventListener("change", () => {
      addFiles(imageInput.files);
      imageInput.value = "";
    });
  }
}

function addFiles(files) {
  if (!files || !files.length) {
    return;
  }

  for (const file of files) {
    if (state.pendingFiles.length >= 5) {
      toast("最多同时上传 5 个文件");
      break;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast(`${file.name} 超过 10MB`);
      continue;
    }

    state.pendingFiles.push(file);
  }

  renderUploadPreview();
}

function renderUploadPreview() {
  const preview = $("#uploadPreview");

  if (!preview) {
    return;
  }

  if (!state.pendingFiles.length) {
    preview.innerHTML = "";
    hide(preview);
    return;
  }

  show(preview);

  preview.innerHTML = state.pendingFiles
    .map((file, index) => {
      const isImage =
        file.type &&
        file.type.startsWith("image/");

      return `
        <div class="upload-item">
          ${
            isImage
              ? `<img
                   src="${URL.createObjectURL(file)}"
                   alt="${escapeHTML(file.name)}"
                 >`
              : `<span>📎</span>`
          }

          <span>
            ${escapeHTML(file.name)}
          </span>

          <button
            class="upload-remove"
            type="button"
            data-index="${index}">
            ×
          </button>
        </div>
      `;
    })
    .join("");

  $$(".upload-remove").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);

      state.pendingFiles.splice(index, 1);

      renderUploadPreview();
    });
  });
}

function clearUploadPreview() {
  state.pendingFiles = [];
  renderUploadPreview();
}

/* =========================
   上传到服务器
========================= */

async function uploadPendingFiles() {
  if (!state.pendingFiles.length) {
    return [];
  }

  const results = [];

  for (const file of state.pendingFiles) {
    try {
      const formData = new FormData();

      formData.append("file", file);

      const data = await api("/api/uploads", {
        method: "POST",
        body: formData
      });

      if (data.file) {
        results.push(data.file);
      }

    } catch (error) {
      console.error(error);
      toast(`${file.name} 上传失败`);
    }
  }

  return results;
}

/* =========================
   语音输入
========================= */

function bindVoiceEvents() {
  const voiceButton = $("#voiceButton");

  if (!voiceButton) {
    return;
  }

  voiceButton.addEventListener("click", toggleVoiceRecognition);

  const stopButton = $("#stopVoiceButton");

  if (stopButton) {
    stopButton.addEventListener("click", stopVoiceRecognition);
  }
}

function getSpeechRecognition() {
  const Recognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!Recognition) {
    return null;
  }

  const recognition = new Recognition();

  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isRecording = true;

    showVoiceStatus("🎙️ 正在听，请说话…");
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      const result = event.results[i];

      if (result.isFinal) {
        finalText += result[0].transcript;
      } else {
        interimText += result[0].transcript;
      }
    }

    const input = $("#messageInput");

    if (!input) {
      return;
    }

    if (finalText) {
      input.value += finalText;
      autoResizeTextarea();
    }

    if (interimText) {
      showVoiceStatus(
        `🎙️ ${interimText}`
      );
    }
  };

  recognition.onerror = (event) => {
    console.error(
      "SpeechRecognition:",
      event.error
    );

    if (event.error === "not-allowed") {
      showVoiceStatus(
        "麦克风权限被拒绝，请允许浏览器使用麦克风"
      );
    } else {
      showVoiceStatus("语音识别失败");
    }
  };

  recognition.onend = () => {
    state.isRecording = false;

    setTimeout(() => {
      hideVoiceStatus();
    }, 1000);
  };

  return recognition;
}

function toggleVoiceRecognition() {
  if (state.isRecording) {
    stopVoiceRecognition();
    return;
  }

  const recognition = getSpeechRecognition();

  if (!recognition) {
    toast("当前浏览器不支持语音输入");
    return;
  }

  state.recognition = recognition;

  try {
    recognition.start();
  } catch (error) {
    console.error(error);
  }
}

function stopVoiceRecognition() {
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch {
      // 已经停止
    }
  }

  state.isRecording = false;
  hideVoiceStatus();
}

function showVoiceStatus(text) {
  const status = $("#voiceStatus");
  const statusText = $("#voiceStatusText");

  if (!status) {
    return;
  }

  if (statusText) {
    statusText.textContent = text;
  }

  show(status);
}

function hideVoiceStatus() {
  hide($("#voiceStatus"));
}

/* =========================
   AI 自动朗读
========================= */

function bindSpeechEvents() {
  const pauseButton = $("#pauseSpeechButton");
  const stopButton = $("#stopSpeechButton");

  if (pauseButton) {
    pauseButton.addEventListener(
      "click",
      toggleSpeechPause
    );
  }

  if (stopButton) {
    stopButton.addEventListener(
      "click",
      stopSpeech
    );
  }
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    toast("当前浏览器不支持语音朗读");
    return;
  }

  stopSpeech();

  const cleanText = String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`]/g, "")
    .replace(/$begin:math:display$\(\.\*\?\)$end:math:display$$begin:math:text$\.\*\?$end:math:text$/g, "$1");

  if (!cleanText.trim()) {
    return;
  }

  const utterance =
    new SpeechSynthesisUtterance(cleanText);

  utterance.lang = "zh-CN";
  utterance.rate =
    Number(state.settings.speechRate) || 1;

  utterance.onstart = () => {
    state.isSpeaking = true;
    state.speechPaused = false;

    showSpeechBar();
  };

  utterance.onend = () => {
    state.isSpeaking = false;
    state.speechPaused = false;

    hideSpeechBar();
  };

  utterance.onerror = () => {
    state.isSpeaking = false;
    state.speechPaused = false;

    hideSpeechBar();
  };

  window.speechSynthesis.speak(utterance);
}

function toggleSpeechPause() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  if (!state.isSpeaking) {
    return;
  }

  if (state.speechPaused) {
    window.speechSynthesis.resume();
    state.speechPaused = false;
  } else {
    window.speechSynthesis.pause();
    state.speechPaused = true;
  }
}

function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  state.isSpeaking = false;
  state.speechPaused = false;

  hideSpeechBar();
}

function showSpeechBar() {
  show($("#speechBar"));
}

function hideSpeechBar() {
  hide($("#speechBar"));
}

/* =========================
   设置
========================= */

function bindSettingsEvents() {
  const settingsButton = $("#settingsButton");
  const closeSettings = $("#closeSettings");
  const saveSettings = $("#saveSettings");
  const resetSettings = $("#resetSettings");

  if (settingsButton) {
    settingsButton.addEventListener(
      "click",
      openSettings
    );
  }

  if (closeSettings) {
    closeSettings.addEventListener(
      "click",
      closeSettingsModal
    );
  }

  if (saveSettings) {
    saveSettings.addEventListener(
      "click",
      saveSettingsData
    );
  }

  if (resetSettings) {
    resetSettings.addEventListener(
      "click",
      resetSettingsData
    );
  }

  const theme = $("#themeSelect");

  if (theme) {
    theme.addEventListener(
      "change",
      () => {
        applyTheme(theme.value);
      }
    );
  }

  const glass = $("#glassRange");

  if (glass) {
    glass.addEventListener(
      "input",
      () => {
        document.documentElement.style.setProperty(
          "--glass",
          `${glass.value}px`
        );
      }
    );
  }

  const animation = $("#animationToggle");

  if (animation) {
    animation.addEventListener(
      "change",
      () => {
        document.body.classList.toggle(
          "no-animation",
          !animation.checked
        );
      }
    );
  }
}

async function loadSettings() {
  try {
    const data = await api("/api/settings");

    if (data.settings) {
      state.settings = {
        ...state.settings,
        ...data.settings
      };
    }
  } catch (error) {
    console.warn(
      "设置加载失败，使用默认设置",
      error
    );
  }

  applyAllSettings();
}

function applyAllSettings() {
  applyTheme(state.settings.theme);

  document.documentElement.style.setProperty(
    "--glass",
    `${Number(state.settings.glass) || 18}px`
  );

  document.documentElement.style.setProperty(
    "font-size",
    getFontSize(state.settings.fontSize)
  );

  document.body.classList.toggle(
    "no-animation",
    state.settings.animation === false
  );
}

function getFontSize(size) {
  switch (size) {
    case "small":
      return "14px";

    case "large":
      return "18px";

    default:
      return "16px";
  }
}

function applyTheme(theme) {
  let dark = false;

  if (theme === "dark") {
    dark = true;
  }

  if (theme === "light") {
    dark = false;
  }

  if (theme === "system") {
    dark =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
  }

  document.body.classList.toggle(
    "dark",
    dark
  );
}

function openSettings() {
  const modal = $("#settingsModal");

  if (!modal) {
    return;
  }

  fillSettingsForm();

  show(modal);
}

function closeSettingsModal() {
  hide($("#settingsModal"));
}

function fillSettingsForm() {
  const theme = $("#themeSelect");
  const glass = $("#glassRange");
  const fontSize = $("#fontSizeSelect");
  const autoSpeech = $("#autoSpeechToggle");
  const speechRate = $("#speechRate");
  const animation = $("#animationToggle");

  if (theme) {
    theme.value = state.settings.theme;
  }

  if (glass) {
    glass.value = state.settings.glass;
  }

  if (fontSize) {
    fontSize.value =
      state.settings.fontSize;
  }

  if (autoSpeech) {
    autoSpeech.checked =
      !!state.settings.autoSpeech;
  }

  if (speechRate) {
    speechRate.value =
      state.settings.speechRate;
  }

  if (animation) {
    animation.checked =
      state.settings.animation !== false;
  }
}

async function saveSettingsData() {
  const theme = $("#themeSelect");
  const glass = $("#glassRange");
  const fontSize = $("#fontSizeSelect");
  const autoSpeech = $("#autoSpeechToggle");
  const speechRate = $("#speechRate");
  const animation = $("#animationToggle");

  state.settings = {
    theme: theme?.value || "system",
    glass: Number(glass?.value || 18),
    fontSize: fontSize?.value || "medium",
    autoSpeech: !!autoSpeech?.checked,
    speechRate: Number(
      speechRate?.value || 1
    ),
    animation: animation
      ? !!animation.checked
      : true
  };

  try {
    await api("/api/settings", {
      method: "PUT",
      body: state.settings
    });

    applyAllSettings();
    closeSettingsModal();

    toast("设置已保存 ✨");

  } catch (error) {
    console.error(error);
    toast("设置保存失败");
  }
}

async function resetSettingsData() {
  state.settings = {
    theme: "system",
    glass: 18,
    fontSize: "medium",
    autoSpeech: false,
    speechRate: 1,
    animation: true
  };

  try {
    await api("/api/settings", {
      method: "PUT",
      body: state.settings
    });
  } catch (error) {
    console.error(error);
  }

  applyAllSettings();
  fillSettingsForm();

  toast("已恢复默认设置");
}

/* =========================
   个人资料
========================= */

function bindProfileEvents() {
  const profileButton = $("#profileButton");
  const closeProfile = $("#closeProfile");
  const saveProfile = $("#saveProfile");
  const logoutButton = $("#logoutButton");
  const avatarFile = $("#avatarFile");

  if (profileButton) {
    profileButton.addEventListener(
      "click",
      openProfile
    );
  }

  if (closeProfile) {
    closeProfile.addEventListener(
      "click",
      closeProfileModal
    );
  }

  if (saveProfile) {
    saveProfile.addEventListener(
      "click",
      saveProfileData
    );
  }

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }

  if (avatarFile) {
    avatarFile.addEventListener(
      "change",
      previewAvatar
    );
  }
}

function openProfile() {
  updateUserUI();
  show($("#profileModal"));
}

function closeProfileModal() {
  hide($("#profileModal"));
}

function previewAvatar(event) {
  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    toast("请选择图片文件");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    toast("头像不能超过 5MB");
    return;
  }

  const url =
    URL.createObjectURL(file);

  const avatar =
    $("#modalAvatar");

  if (avatar) {
    avatar.src = url;
  }
}

async function saveProfileData() {
  const nickname =
    $("#profileNickname")?.value.trim();

  const avatarFile =
    $("#avatarFile")?.files?.[0];

  if (!nickname) {
    toast("昵称不能为空");
    return;
  }

  try {
    let avatar =
      state.user?.avatar || null;

    if (avatarFile) {
      const formData = new FormData();

      formData.append(
        "file",
        avatarFile
      );

      const upload =
        await api("/api/uploads", {
          method: "POST",
          body: formData
        });

      if (upload.file?.id) {
        avatar =
          `/api/uploads/${upload.file.id}`;
      }
    }

    const data = await api(
      "/api/profile",
      {
        method: "PUT",
        body: {
          nickname,
          avatar
        }
      }
    );

    state.user = data.user;

    updateUserUI();

    closeProfileModal();

    toast("个人资料已更新 ✨");

  } catch (error) {
    console.error(error);
    toast(
      error.message ||
      "保存个人资料失败"
    );
  }
}

/* =========================
   登出
========================= */

async function logout() {
  try {
    stopSpeech();
    stopVoiceRecognition();

    await api("/api/auth/logout", {
      method: "POST"
    });

    state.user = null;
    state.chats = [];
    state.currentChat = null;
    state.messages = [];

    closeProfileModal();

    showAuthPage();

    const form =
      $("#authForm");

    if (form) {
      form.reset();
    }

    toast("已退出登录");

  } catch (error) {
    console.error(error);
    toast("退出登录失败");
  }
}

/* =========================
   菜单
========================= */

function bindMenuEvents() {
  const menuButton = $("#menuButton");
  const closeSidebar = $("#closeSidebar");
  const overlay = $("#sidebarOverlay");
  const moreButton = $("#moreButton");

  if (menuButton) {
    menuButton.addEventListener(
      "click",
      openSidebarMobile
    );
  }

  if (closeSidebar) {
    closeSidebar.addEventListener(
      "click",
      closeSidebarMobile
    );
  }

  if (overlay) {
    overlay.addEventListener(
      "click",
      closeSidebarMobile
    );
  }

  if (moreButton) {
    moreButton.addEventListener(
      "click",
      toggleMoreMenu
    );
  }

  const copyButton =
    $("#copyLastMessage");

  if (copyButton) {
    copyButton.addEventListener(
      "click",
      copyLastMessage
    );
  }

  const readButton =
    $("#readLastMessage");

  if (readButton) {
    readButton.addEventListener(
      "click",
      readLastMessage
    );
  }

  const downloadButton =
    $("#downloadChat");

  if (downloadButton) {
    downloadButton.addEventListener(
      "click",
      downloadChat
    );
  }
}

function openSidebarMobile() {
  const sidebar = $(".sidebar");

  if (sidebar) {
    sidebar.classList.add("open");
  }
}

function closeSidebarMobile() {
  const sidebar = $(".sidebar");

  if (sidebar) {
    sidebar.classList.remove("open");
  }
}

function toggleMoreMenu() {
  const menu = $("#moreMenu");

  if (!menu) {
    return;
  }

  menu.classList.toggle("hidden");
}

async function copyLastMessage() {
  const last = [...state.messages]
    .reverse()
    .find(
      message =>
        message.role === "assistant"
    );

  if (!last?.content) {
    toast("还没有 AI 回复");
    return;
  }

  try {
    await navigator.clipboard.writeText(
      last.content
    );

    toast("已复制 📋");

  } catch {
    toast("复制失败");
  }

  hide($("#moreMenu"));
}

function readLastMessage() {
  const last = [...state.messages]
    .reverse()
    .find(
      message =>
        message.role === "assistant"
    );

  if (!last?.content) {
    toast("还没有 AI 回复");
    return;
  }

  speakText(last.content);

  hide($("#moreMenu"));
}

function downloadChat() {
  if (!state.messages.length) {
    toast("当前聊天没有内容");
    return;
  }

  const title =
    state.currentChat?.title ||
    "青雾 AI 对话";

  const content =
    state.messages
      .map(message => {
        const role =
          message.role === "user"
            ? "用户"
            : "青雾 AI";

        return `${role}：\n${message.content || ""}`;
      })
      .join("\n\n");

  const blob = new Blob(
    [
      `# ${title}\n\n${content}`
    ],
    {
      type: "text/plain;charset=utf-8"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download =
    `${title}.txt`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  hide($("#moreMenu"));

  toast("聊天记录已导出 📄");
}

/* =========================
   点击弹窗外部关闭
========================= */

document.addEventListener("click", (event) => {
  const moreMenu = $("#moreMenu");
  const moreButton = $("#moreButton");

  if (
    moreMenu &&
    !moreMenu.classList.contains("hidden") &&
    !moreMenu.contains(event.target) &&
    !moreButton?.contains(event.target)
  ) {
    hide(moreMenu);
  }
});

/* =========================
   系统主题变化
========================= */

if (window.matchMedia) {
  const media =
    window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

  media.addEventListener?.(
    "change",
    () => {
      if (
        state.settings.theme ===
        "system"
      ) {
        applyTheme("system");
      }
    }
  );
}

/* =========================
   防止页面拖拽文件打开
========================= */

window.addEventListener(
  "dragover",
  event => {
    event.preventDefault();
  }
);

window.addEventListener(
  "drop",
  event => {
    event.preventDefault();
  }
);

/* =========================
   全局错误提示
========================= */

window.addEventListener(
  "unhandledrejection",
  event => {
    console.error(
      "Unhandled promise rejection:",
      event.reason
    );
  }
);

console.log(
  "青雾 AI V7.0 已启动 ✨"
);
