// Vercel 後端程式碼：api/chat.js
export default async function handler(req, res) {
  // 1. 允許任何網頁來源（CORS 設定），讓你的前端網頁可以順利連線
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // * 代表允許所有網站連線
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // 如果瀏覽器發送預檢請求 (OPTIONS)，直接回覆 200 成功
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { message } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // 你的現有文字知識庫
  const myKnowledgeBase = `
  【此處放你原本限定的文字資料，例如產品、地址、營業時間等】
  `;

  const systemInstruction = `
  你是專屬 AI 客服助理。請嚴格根據現有資料回答，若找不到答案請禮貌拒絕。
  【現有資料】
  ${myKnowledgeBase}
  `;

  try {
    const response = await fetch(`https://googleapis.com{apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemInstruction },
              { text: `使用者提問：${message}` }
            ]
          }
        ]
      })
    });
    
 //   const data = await response.json();
 //   const reply = data.candidates[0].content.parts[0].text; // 修正了原本語法可能漏掉的陣列索引
 //   return res.status(200).json({ reply });


    // 呼叫 Google Gemini API 之後...
    const data = await response.json();
    
    // ⚠️ 請確保這行有精準寫到陣列索引 [0]
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      const reply = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ reply: reply });
    } else {
      // 如果 Google 噴出錯誤（例如 API Key 錯了、或被限制流量），把完整的錯誤丟回前端
      return res.status(200).json({ error: JSON.stringify(data) });
    }


















    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

