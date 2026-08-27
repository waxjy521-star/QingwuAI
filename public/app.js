const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");

//发送按钮点击
sendBtn.addEventListener("click", sendChat);
//回车发送，Shift+Enter换行
userInput.addEventListener("keydown",(e)=>{
    if(e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        sendChat();
    }
})
//清空对话
clearBtn.addEventListener("click",()=>{
    chatBox.innerHTML = `
    <div class="welcome-card">
        <div class="welcome-icon">🌫️</div>
        <h2>你好，我是青雾 AI</h2>
        <p>随时向我提问，开启对话</p>
    </div>`;
})

//发送消息函数
async function sendChat(){
    const text = userInput.value.trim();
    if(!text) return;

    //移除欢迎卡片
    const welcome = chatBox.querySelector(".welcome-card");
    if(welcome) welcome.remove();

    //用户消息
    const userDiv = document.createElement("div");
    userDiv.className = "msg-item msg-user";
    userDiv.innerHTML = `<div class="bubble-user">${escapeHtml(text)}</div>`;
    chatBox.appendChild(userDiv);

    userInput.value = "";
    sendBtn.disabled = true;
    scrollBottom();

    //========这里以后对接你的AI接口========
    //现在是模拟AI回复占位，后面替换成真实API请求
    setTimeout(()=>{
        appendAiMessage("我是青雾AI，这里后续接入真实接口就可以回复内容啦。");
        sendBtn.disabled = false;
        scrollBottom();
    },600)
}

//追加AI消息
function appendAiMessage(content){
    const aiDiv = document.createElement("div");
    aiDiv.className = "msg-item msg-ai";
    aiDiv.innerHTML = `<div class="bubble-ai">${escapeHtml(content)}</div>`;
    chatBox.appendChild(aiDiv);
}

//滚动到底部
function scrollBottom(){
    chatBox.scrollTop = chatBox.scrollHeight;
}

//简单转义防止XSS
function escapeHtml(str){
    return str
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
}
