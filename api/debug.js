// api/debug.js
module.exports = (req, res) => {
  const hasKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-"));
  res.status(200).json({ ok: true, hasOpenAIKey: hasKey });
};
