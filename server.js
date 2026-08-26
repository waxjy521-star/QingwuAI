require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    name: "青雾 AI",
    version: "1.0.0",
    aiConfigured: Boolean(process.env.AI_API_KEY)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        error: "messages 必须是数组"
      });
    }

    if (!process.env.AI_API_KEY) {
      return res.status(500).json({
        error: "AI_API_KEY 尚未配置"
      });
    }

    const apiUrl =
      process.env.AI_API_URL ||
      "https://api.openai.com/v1/chat/completions";

    const model =
      process.env.AI_MODEL ||
      "gpt-4o-mini";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "AI API 请求失败"
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      "AI 没有返回内容。";

    res.json({
      success: true,
      message: answer
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "服务器发生错误",
      detail: error.message
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`青雾 AI 已启动：http://0.0.0.0:${PORT}`);
});
