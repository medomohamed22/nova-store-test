export function allowedOrigin(req) {
  const origin=req.headers.origin;
  if(!origin)return false;
  try {
    const url=new URL(origin),configured=(process.env.AIWAY_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
    if(configured.length)return configured.includes(url.origin);
    return ['http:','https:'].includes(url.protocol)&&url.host===req.headers.host;
  }catch{return false}
}
export function sessionId(req) {
  try {
    const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('aiway_sid='));
    const sid=value&&decodeURIComponent(value.slice(10));
    return /^[A-Za-z0-9_-]{32,128}$/.test(sid||'')?sid:null;
  }catch{return null}
}
