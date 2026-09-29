function safeBase(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Invalid API Base URL"); }
  if (u.protocol !== "https:") throw new Error("Only HTTPS provider URLs are allowed");
  const h = u.hostname.toLowerCase();
  const blocked = h === "localhost" || h === "::1" || h.endsWith(".local") ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  if (blocked) throw new Error("Private/local provider URLs are blocked");
  return u.toString().replace(/\/$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { base_url, api_key, model, messages, temperature = 0.2, max_tokens = 5000 } = req.body || {};
    if (!base_url || !api_key || !model || !Array.isArray(messages)) {
      return res.status(400).json({ error: "base_url, api_key, model and messages are required" });
    }
    const base = safeBase(base_url);
    const upstream = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${api_key}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream: false }),
      signal: AbortSignal.timeout(115000)
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || data?.message || text || `Provider ${upstream.status}` });
    }
    const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? "";
    return res.status(200).json({ content, usage: data?.usage || null });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Proxy error" });
  }
}