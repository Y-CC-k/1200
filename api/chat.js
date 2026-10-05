// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { message } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. 在這裡放入你「現有的文字資料」（例如你的產品說明、常見問題）
  const myKnowledgeBase = `
  【關於我們公司】
  我們是一間手工接睫毛工作室，店名叫「美麗密碼」。
  地址在台北市大安區忠孝東路四段100號3樓。
  營業時間為每天早上 10:00 到晚上 22:00。
  
  【服務與價目表】
  - 自然裸妝型（120根）：1,200 元。
  - 濃密電眼型（200根）：1,800 元。
  
  【常見問題】
  Q: 接睫毛可以維持多久？
  A: 通常可以維持 3 到 4 週，因個人生活習慣而異。
  
  Q: 有提供刷卡嗎？
  A: 我們現場只接受現金與 LINE Pay，沒有提供刷卡。
  `;

  // 2. 設定嚴格的防線（System Instruction）
  const systemInstruction = `
  你是「美麗密碼」的專屬 AI 客服助理。
  
  【極重要規則】
  1. 你「只能」根據下方提供的【現有資料】來回答使用者的問題。
  2. 如果使用者的問題在【現有資料】中找不到答案，你必須禮貌地回答：「抱歉，我目前的資料庫中沒有相關資訊。您可以於營業時間內致電或透過 LINE 官方帳號與真人客服聯絡。」
  3. 絕對、絕對不能使用你原本具備的外部知識來回答。例如，如果使用者問你「明天天氣如何」或「微積分怎麼算」，你必須拒絕回答。
  4. 保持口氣親切、專業、精簡。
  
  【現有資料】
  ${myKnowledgeBase}
  `;

  try {
    // 3. 組裝送給 Gemini 的請求（將提示詞與使用者訊息綁在一起）
    const response = await fetch(`https://googleapis.com{apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              // 告訴 Gemini 它的角色、規則與現有資料
              { text: systemInstruction },
              // 帶入使用者剛輸入的問題
              { text: `使用者提問：${message}` }
            ]
          }
        ]
      })
    });
    
    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

