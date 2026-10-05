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
  const apiKey = process.env.OPENROUTER_API_KEY; // 從 Vercel 環境變數讀取 OpenRouter 金鑰

  // 檢查 Vercel 後台有沒有設定 API Key
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 後台尚未設定 OPENROUTER_API_KEY 環境變數。' });
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
  // 4. 打包送給 OpenRouter API (OpenAI 相容格式)
  // ==========================================
  try {
    // 使用 OpenRouter，支援 400+ 模型，包含 Gemini 全系列
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://1200-klnes.vercel.app',  // 你的網域 (OpenRouter 建議提供)
        'X-Title': '1200 English Learning'  // 你的應用名稱 (OpenRouter 建議提供)
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',  // 可改為 google/gemini-2.5-pro, anthropic/claude-3.5-sonnet 等
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: message }
        ],
        max_tokens: 2048,
        temperature: 0.7
      })
    });
    
    const data = await response.json();

    // 檢查 OpenRouter API 是否回傳錯誤
    if (data.error) {
      return res.status(200).json({ error: `OpenRouter 錯誤: ${data.error.message}` });
    }

    // ==========================================
    // 5. 精准拆解 OpenRouter 回傳的資料結構 (OpenAI 格式)
    // ==========================================
    if (
      data.choices && 
      data.choices[0] && 
      data.choices[0].message && 
      data.choices[0].message.content
    ) {
      const reply = data.choices[0].message.content;
      return res.status(200).json({ reply: reply });
    } else {
      // 萬一結構不符合預期，把完整的原始 JSON 吐回前端以便除錯
      return res.status(200).json({ error: '無法解析 OpenRouter 的回覆結構', raw: data });
    }

  } catch (error) {
    // 捕捉伺服器連線或程式碼執行錯誤
    return res.status(500).json({ error: `伺服器內部錯誤: ${error.message}` });
  }
}
