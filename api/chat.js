export default async function handler(req, res) {
  // ==========================================
  // 1. 跨網域設定 (CORS Headers) - 解決連線失敗
  // ==========================================
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // * 允許所有網域前端存取
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // 處理瀏覽器的預檢請求 (OPTIONS)，直接回覆 200 結束
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 限定只能用 POST 方法存取
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { message } = req.body;
  const apiKey = process.env.GEMINI_API_KEY; // 從 Vercel 環境變數讀取金鑰

  // 檢查 Vercel 後台有沒有設定 API Key
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 後台尚未設定 GEMINI_API_KEY 環境變數。' });
  }

  // ==========================================
  // 2. 你的現有文字知識庫 (請在這裡修改你的內容)
  // ==========================================
  const myKnowledgeBase = `
  【關於我們】
  這是一個測試用的 AI 客服機器人。
  我們的網站提供網頁開發、設計與白嫖 AI 工具的教學。
  營業時間為週一至週五 09:00 - 18:00。
  
  【常見問題】
  Q: 這個機器人要收費嗎？
  A: 完全不用，這是利用 Gemini 與 Vercel 免費額度搭建的零元方案。
  
  Q: 如果輸入 333 會怎樣？
  A: 這是一個連線測試，代表後端資料與 API 對接完全正常！
  `;

  // ==========================================
  // 3. 設定 AI 嚴格遵守的系統指令 (System Instruction)
  // ==========================================
  const systemInstruction = `
  你是專屬的 AI 線上客服助理。
  
  【嚴格規則】
  1. 你「只能」根據下方【現有資料】的內容來回答使用者的提問。
  2. 如果使用者的問題在【現有資料】中找不到答案，或是超出範圍（例如問天氣、寫程式、聊政治、日常閒聊），你必須一律禮貌地回答：「抱歉，我目前的資料庫中沒有相關資訊。您可以聯絡真人客服以取得更多協助。」
  3. 絕對不可編造任何【現有資料】以外的事實。
  
  【現有資料】
  ${myKnowledgeBase}
  `;

  // ==========================================
  // 4. 打包送給 Google Gemini API
  // ==========================================
  try {
    // 使用 Gemini 2.5 Flash 模型，速度快且免費額度非常慷慨
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
    
    const data = await response.json();

    // 檢查 Google API 是否回傳錯誤（例如 API Key 被封鎖或格式錯誤）
    if (data.error) {
      return res.status(200).json({ error: `Google API 錯誤: ${data.error.message}` });
    }

    // ==========================================
    // 5. 精准拆解 Gemini 回傳的資料結構，防止出現 undefined
    // ==========================================
    if (
      data.candidates && 
      data.candidates[0] && 
      data.candidates[0].content && 
      data.candidates[0].content.parts && 
      data.candidates[0].content.parts[0]
    ) {
      const reply = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ reply: reply });
    } else {
      // 萬一結構不符合預期，把完整的原始 JSON 吐回前端以便除錯
      return res.status(200).json({ error: '無法解析 Gemini 的回覆結構', raw: data });
    }

  } catch (error) {
    // 捕捉伺服器連線或程式碼執行錯誤
    return res.status(500).json({ error: `伺服器內部錯誤: ${error.message}` });
  }
}
