// api/interpret.js — CANDID / NO-SUGARCOAT VERSION (CommonJS for Vercel)
const fetch = global.fetch; // Node 18+ has fetch

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
    }

    // Parse body defensively
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch {}
    }
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }

    const {
      question = '(none provided)',
      spreadLabel = 'Unknown Spread',
      cards = []
    } = payload;

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'No cards provided. Draw cards before interpreting.' });
    }

    // Build the reading prompt
    const prompt = [
      `QUESTION: ${question}`,
      `SPREAD: ${spreadLabel}`,
      `CARDS (in order):`,
      ...cards.map((c, i) => `  ${i+1}. ${c.position}: ${c.name} (${c.orientation})`),
      ``,
      `INTERPRETATION RULES (very important):`,
      `- Be candid and precise. Do NOT sugarcoat. Reflect the cards exactly as they are presented.`,
      `- If the cards indicate difficult themes, state them plainly and include appropriate WARNINGS.`,
      `- If the cards are favorable, say so directly. Do not manufacture negativity.`,
      `- Use reversed meanings when orientation is "reversed".`,
      `- Avoid vague platitudes. Give concrete, card-grounded insights.`,
      `- No fatalism: acknowledge uncertainty and human agency; do not claim guaranteed outcomes.`,
      `- No medical, legal, or financial directives. Offer general guidance only.`,
      `- Structure the answer like this:`,
      `  1) Overview (2–4 sentences, frank tone)`,
      `  2) Position-by-position reading (1–3 sentences each; name the position before the analysis)`,
      `  3) Guidance (direct, realistic next steps; include warnings if indicated)`,
      `- Keep it under ~400 words.`,
    ].join('\n');

    // Call OpenAI Chat Completions (stable response shape)
    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7, // slightly lower for sharper, less fluffy output
        messages: [
          {
            role: 'system',
            content: [
              `You are a professional tarot reader.`,
              `Your style is candid, unsentimental, and exacting.`,
              `You do not sugarcoat or bypass difficult messages.`,
              `You reflect upright vs. reversed meanings faithfully and warn clearly when cards indicate risk.`,
              `You avoid fatalism and false certainty; you acknowledge probabilities and agency.`,
              `You do not provide medical, legal, or financial advice.`
            ].join(' ')
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!oaiRes.ok) {
      const errText = await oaiRes.text().catch(() => '');
      return res.status(oaiRes.status).json({
        error: `OpenAI error ${oaiRes.status}`,
        details: errText || '(no body)'
      });
    }

    const json = await oaiRes.json().catch(() => ({}));
    const text = json?.choices?.[0]?.message?.content;

    if (!text || !String(text).trim()) {
      return res.status(502).json({ error: 'OpenAI returned empty text.' });
    }

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
