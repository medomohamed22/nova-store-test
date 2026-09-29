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
const wait = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const {
      base_url, api_key, model, messages,
      temperature = 0.2, max_tokens = 5000,
      retries = 3
    } = req.body || {};

    if (!base_url || !api_key || !model || !Array.isArray(messages)) {
      return res.status(400).json({ error: "base_url, api_key, model and messages are required" });
    }

    const base = safeBase(base_url);
    let lastError = null;

    for (let attempt = 0; attempt <= Math.min(Number(retries) || 0, 4); attempt++) {
      const upstream = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${api_key}`
        },
        body: JSON.stringify({
          model, messages, temperature, max_tokens, stream: false
        }),
        signal: AbortSignal.timeout(110000)
      });

      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (upstream.ok) {
        const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? "";
        return res.status(200).json({
          content,
          usage: data?.usage || null,
          attempts: attempt + 1
        });
      }

      const msg = data?.error?.message || data?.message || text || `Provider ${upstream.status}`;
      lastError = { status: upstream.status, msg };

      const retryable =
        upstream.status === 429 ||
        upstream.status === 503 ||
        /ResourceExhausted|request limit|rate limit|temporarily unavailable/i.test(msg);

      if (!retryable || attempt >= Math.min(Number(retries) || 0, 4)) {
        return res.status(upstream.status).json({
          error: msg,
          retryable,
          hint: retryable
            ? "The hosted model is saturated/rate-limited. Wait briefly, switch model/provider, or use Nebius Token Factory."
            : undefined
        });
      }

      const retryAfter = Number(upstream.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : [1500, 3500, 7000, 12000][attempt] || 12000;

      await wait(delay);
    }

    return res.status(lastError?.status || 503).json({ error: lastError?.msg || "Provider unavailable" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Proxy error" });
  }
}