export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const payload = req.body; // { question, spreadKey, spreadLabel, positions, cards:[...] }

    const prompt = [
      `ROLE: You are a compassionate, world-class tarot reader.`,
      `GOAL: Answer the user's question using the spread and drawn cards.`,
      `STYLE: Insightful, grounded, empowering. No medical/financial/legal directives.`,
      ``,
      `QUESTION: ${payload.question || '(none provided)'}`,
      `SPREAD: ${payload.spreadLabel}`,
      `CARDS:`,
      ...payload.cards.map((c, i) => `  ${i+1}. ${c.position}: ${c.name} (${c.orientation})`),
      ``,
      `OUTPUT:`,
      `1) A short overview (2–3 sentences).`,
      `2) Position-by-position insight (1–3 sentences each).`,
      `3) Practical guidance and a gentle closing.`
    ].join('\n');

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          { role: 'system', content: 'You are a precise, responsible tarot expert who explains upright vs reversed meanings and stays respectful and supportive.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      res.status(500).json({ error: `OpenAI error: ${r.status} ${errText}` });
      return;
    }

    const json = await r.json();
    const text = json.output_text ?? json.choices?.[0]?.message?.content ?? '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
