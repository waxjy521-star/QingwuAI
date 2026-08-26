const messagesBox = document.getElementById("messages");
const input = document.getElementById("input");
const sendButton = document.getElementById("send");

const messages = [];

function addMessage(text, role) {
  const div = document.createElement("div");

  div.className = `message ${role}`;
  div.textContent = text;

  messagesBox.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;

  return div;
}

async function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  input.value = "";
  sendButton.disabled = true;

  const welcome = document.querySelector(".welcome");

  if (welcome) {
    welcome.remove();
  }

  messages.push({
    role: "user",
    content: text
  });

  addMessage(text, "user");

  const aiMessage = addMessage("正在思考……", "ai");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "请求失败");
    }

    aiMessage.textContent = data.message;

    messages.push({
      role: "assistant",
      content: data.message
    });

  } catch (error) {

    aiMessage.textContent =
      "❌ " + error.message;

  } finally {

    sendButton.disabled = false;
    input.focus();

  }
}

sendButton.addEventListener(
  "click",
  sendMessage
);

input.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }

  }
);
