import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { get, put, del } from '@vercel/blob';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/generative-language.retriever',
];

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return i < 0 ? [v, ''] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}

function sidFrom(req) {
  const sid = parseCookies(req.headers.cookie || '').aiway_sid;
  return sid && /^[A-Za-z0-9_-]{32,128}$/.test(sid) ? sid : null;
}

function sessionHash(sid) { return createHash('sha256').update(sid).digest('hex'); }
function key() {
  const value = process.env.AIWAY_CREDENTIAL_KEY;
  return value ? createHash('sha256').update(value).digest() : null;
}
function encrypt(buf) {
  const k = key();
  if (!k) throw new Error('AIWAY_CREDENTIAL_KEY is not configured');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([Buffer.from('AIWAYG1'), iv, cipher.getAuthTag(), body]);
}
function decrypt(buf) {
  const k = key();
  if (!k) throw new Error('AIWAY_CREDENTIAL_KEY is not configured');
  if (buf.subarray(0, 7).toString() !== 'AIWAYG1') throw new Error('Invalid Google credential format');
  const iv = buf.subarray(7, 19), tag = buf.subarray(19, 35), body = buf.subarray(35);
  const decipher = createDecipheriv('aes-256-gcm', k, iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
function blobPath(hash) { return `google-auth/${hash}.bin`; }
function configured(req) {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_CLOUD_PROJECT && process.env.AIWAY_CREDENTIAL_KEY &&
    (process.env.BLOB_READ_WRITE_TOKEN || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN));
}
async function streamToBuffer(stream) { const chunks=[]; for await (const c of stream) chunks.push(Buffer.from(c)); return Buffer.concat(chunks); }
async function loadTokens(hash) {
  const r = await get(blobPath(hash), { access:'private', useCache:false });
  if (!r) return null;
  return JSON.parse(decrypt(await streamToBuffer(r.stream)).toString('utf8'));
}
async function saveTokens(hash, tokens) {
  await put(blobPath(hash), encrypt(Buffer.from(JSON.stringify(tokens))), { access:'private', allowOverwrite:true, contentType:'application/octet-stream', cacheControlMaxAge:60 });
}
function origin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
function redirectUri(req) { return `${origin(req)}/api/google?action=callback`; }
function stateFor(sid, ts) {
  const secret = process.env.AIWAY_CREDENTIAL_KEY || '';
  return `${ts}.${createHmac('sha256', secret).update(`${sid}|${ts}|google`).digest('base64url')}`;
}
function verifyState(sid, state) {
  const [tsText, sig] = String(state || '').split('.');
  const ts = Number(tsText);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 10 * 60_000) return false;
  return stateFor(sid, ts) === `${tsText}.${sig}`;
}
async function refreshIfNeeded(hash, tokens) {
  if (tokens.access_token && Number(tokens.expires_at || 0) > Date.now() + 60_000) return tokens;
  if (!tokens.refresh_token) throw new Error('Google session expired; sign in again');
  const body = new URLSearchParams({ client_id:process.env.GOOGLE_OAUTH_CLIENT_ID, client_secret:process.env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token:tokens.refresh_token, grant_type:'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || 'Could not refresh Google token');
  const merged = { ...tokens, ...data, refresh_token: data.refresh_token || tokens.refresh_token, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
  await saveTokens(hash, merged);
  return merged;
}
async function googleFetch(hash, path, options={}) {
  let tokens = await loadTokens(hash);
  if (!tokens) throw new Error('Google account not connected');
  tokens = await refreshIfNeeded(hash, tokens);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${tokens.access_token}`);
  headers.set('x-goog-user-project', process.env.GOOGLE_CLOUD_PROJECT);
  return fetch(`https://generativelanguage.googleapis.com${path}`, { ...options, headers });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  const sid = sidFrom(req);
  if (!sid) return res.status(401).json({ error:'Session cookie required' });
  const hash = sessionHash(sid), action = String(req.query?.action || 'status');

  try {
    if (action === 'status') {
      let connected = false;
      if (configured(req)) { try { connected = Boolean(await loadTokens(hash)); } catch {} }
      return res.status(200).json({ configured: configured(req), connected, project: Boolean(process.env.GOOGLE_CLOUD_PROJECT) });
    }
    if (!configured(req)) return res.status(503).json({ error:'Google OAuth is not configured on this deployment' });

    if (action === 'start') {
      const ts = Date.now();
      const q = new URLSearchParams({ client_id:process.env.GOOGLE_OAUTH_CLIENT_ID, redirect_uri:redirectUri(req), response_type:'code', scope:SCOPES.join(' '), access_type:'offline', prompt:'consent', include_granted_scopes:'true', state:stateFor(sid,ts) });
      res.statusCode = 302; res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${q}`); return res.end();
    }
    if (action === 'callback') {
      if (!verifyState(sid, req.query?.state)) return res.status(400).send('Invalid or expired OAuth state');
      if (req.query?.error) return res.status(400).send(`Google OAuth error: ${req.query.error}`);
      const body = new URLSearchParams({ code:String(req.query?.code || ''), client_id:process.env.GOOGLE_OAUTH_CLIENT_ID, client_secret:process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri:redirectUri(req), grant_type:'authorization_code' });
      const r = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
      const data = await r.json();
      if (!r.ok) return res.status(400).send(data.error_description || data.error || 'OAuth token exchange failed');
      data.expires_at = Date.now() + Number(data.expires_in || 3600) * 1000;
      await saveTokens(hash, data);
      res.statusCode=302; res.setHeader('Location','/?gemini_oauth=connected'); return res.end();
    }
    if (action === 'logout') { await del(blobPath(hash)).catch(()=>{}); return res.status(204).end(); }
    if (action === 'models') {
      const r = await googleFetch(hash, '/v1beta/models');
      const text = await r.text(); res.status(r.status); res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json'); return res.send(text);
    }
    if (action === 'stream') {
      const model = String(req.query?.model || '').replace(/^models\//,'');
      if (!/^[A-Za-z0-9._:-]{1,120}$/.test(model)) return res.status(400).json({error:'Invalid model'});
      const r = await googleFetch(hash, `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { method:'POST', headers:{'Content-Type':'application/json'}, body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}) });
      res.status(r.status); res.setHeader('Content-Type', r.headers.get('content-type') || 'text/event-stream');
      if (!r.body) return res.end(await r.text());
      for await (const chunk of r.body) res.write(Buffer.from(chunk));
      return res.end();
    }
    return res.status(404).json({error:'Unknown action'});
  } catch (error) {
    console.error('google auth', error);
    return res.status(500).json({ error:error.message || String(error) });
  }
}
