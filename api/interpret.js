// /api/interpret.js (Vercel serverless function)
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
      return;
    }

    // parse body defensively
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch {}
    }
    payload = payload || {};

    const { question = '(none provided)', spreadLabel = 'Unknown Spread', cards = [] } = payload;

    if (!Array.isArray(cards) || cards.length === 0) {
      res.status(400).json({ error: 'No cards provided. Draw cards before interpreting.' });
      return;
    }

    const prompt = [
      `ROLE: You are a compassionate, world-class tarot reader.`,
      `GOAL: Answer the user's question using the spread and drawn cards.`,
      `STYLE: Insightful, grounded, empowering. No medical/financial/legal directives.`,
      ``,
      `QUESTION: ${question}`,
      `SPREAD: ${spreadLabel}`,
      `CARDS:`,
      ...cards.map((c, i) => `  ${i+1}. ${c.position}: ${c.name} (${c.orientation})`),
      ``,
      `OUTPUT:`,
      `1) A short overview (2–3 sentences).`,
      `2) Position-by-position insight (1–3 sentences each).`,
      `3) Practical guidance and a gentle closing.`
    ].join('\n');

    // --- Try Chat Completions first (stable shape) ---
    const chatResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        messages: [
          { role: 'system', content: 'You are a precise, responsible tarot expert who explains upright vs reversed meanings and stays respectful and supportive.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!chatResp.ok) {
      // Fallback: Responses API
      const resp2 = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.8,
          input: [
            { role: 'system', content: 'You are a precise, responsible tarot expert who explains upright vs reversed meanings and stays respectful and supportive.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!resp2.ok) {
        const errText = await resp2.text();
        return res.status(resp2.status).json({ error: `OpenAI error (responses): ${errText}` });
      }

      const j2 = await resp2.json();
      const text2 = j2?.output_text ?? j2?.choices?.[0]?.message?.content ?? '';
      if (!text2.trim()) return res.status(500).json({ error: 'OpenAI returned empty text (responses).' });
      return res.status(200).json({ text: text2 });
    }

    const j1 = await chatResp.json();
    const text1 = j1?.choices?.[0]?.message?.content ?? '';
    if (!text1.trim()) return res.status(500).json({ error: 'OpenAI returned empty text (chat).' });

    return res.status(200).json({ text: text1 });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
