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
    const { base_url, api_key } = req.body || {};
    if (!base_url || !api_key) return res.status(400).json({ error: "base_url and api_key are required" });
    const base = safeBase(base_url);
    const upstream = await fetch(base + "/models", {
      headers: { "Authorization": `Bearer ${api_key}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(30000)
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || data?.message || text || `Provider ${upstream.status}` });
    }
    const list = Array.isArray(data?.data) ? data.data.map(x => x.id || x.name).filter(Boolean)
      : Array.isArray(data?.models) ? data.models.map(x => typeof x === "string" ? x : (x.id || x.name)).filter(Boolean)
      : [];
    list.sort((a,b)=>a.localeCompare(b));
    return res.status(200).json({ models: list });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Model refresh failed" });
  }
}