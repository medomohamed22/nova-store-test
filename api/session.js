import { randomBytes } from 'node:crypto';

export default function handler(req, res) {
  const cookies = req.headers.cookie || '';
  const hasSession = /(?:^|;\s*)aiway_sid=([a-f0-9]{48})(?:;|$)/.test(cookies);
  if (!hasSession) {
    const sid = randomBytes(24).toString('hex');
    const secure = (req.headers['x-forwarded-proto'] || 'https') === 'https';
    res.setHeader('Set-Cookie', `aiway_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true });
}
