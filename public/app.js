const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");

sendBtn.addEventListener("click", sendChat);

userInput.addEventListener("keydown",(e)=>{
    if(e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        sendChat();
    }
})

clearBtn.addEventListener("click",()=>{
    chatBox.innerHTML = `
    <div class="welcome-card">
        <div class="welcome-icon">🌫️</div>
        <h2>你好，我是青雾 AI</h2>
        <p>随时向我提问，开启对话</p>
    </div>`;
})

async function sendChat(){
    const text = userInput.value.trim();
    if(!text) return;

    const welcome = chatBox.querySelector(".welcome-card");
    if(welcome) welcome.remove();

    const userDiv = document.createElement("div");
    userDiv.className = "msg-item msg-user";
    userDiv.innerHTML = `<div class="bubble-user">${escapeHtml(text)}</div>`;
    chatBox.appendChild(userDiv);

    userInput.value = "";
    sendBtn.disabled = true;
    scrollBottom();

    // 在这里粘贴你原本调用真实AI接口的代码
    // 收到AI返回结果后调用 appendAiMessage("AI返回文本")
    // 完成之后记得 sendBtn.disabled = false;
}

function appendAiMessage(content){
    const aiDiv = document.createElement("div");
    aiDiv.className = "msg-item msg-ai";
    aiDiv.innerHTML = `<div class="bubble-ai">${escapeHtml(content)}</div>`;
    chatBox.appendChild(aiDiv);
    scrollBottom();
}

function scrollBottom(){
    chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(str){
    return str
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
}
