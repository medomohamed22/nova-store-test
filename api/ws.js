import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, put, del } from '@vercel/blob';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const here = path.dirname(fileURLToPath(import.meta.url));
const codexJs = path.resolve(here, '../node_modules/@openai/codex/bin/codex.js');

function sessionId(req) {
  return (req.headers.cookie || '').match(/(?:^|;\s*)aiway_sid=([a-f0-9]{48})(?:;|$)/)?.[1] || null;
}
function keyBytes() {
  const raw = process.env.CODEX_CREDENTIALS_KEY;
  return raw ? createHash('sha256').update(raw).digest() : null;
}
function encrypt(data) {
  const key = keyBytes();
  if (!key) return null;
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.from('AICX1'), iv, cipher.getAuthTag(), body]);
}
function decrypt(data) {
  const key = keyBytes();
  if (!key || data.subarray(0,5).toString() !== 'AICX1') return null;
  const iv=data.subarray(5,17), tag=data.subarray(17,33), body=data.subarray(33);
  const decipher=createDecipheriv('aes-256-gcm',key,iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body),decipher.final()]);
}
async function streamToBuffer(stream) {
  const chunks=[]; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks);
}
async function restoreAuth(sid, home) {
  if (!process.env.CODEX_CREDENTIALS_KEY) return;
  try {
    const r = await get(`codex-auth/${sid}.bin`, { access:'private', useCache:false });
    if (!r) return;
    const enc=await streamToBuffer(r.stream), plain=decrypt(enc);
    if (plain) await writeFile(path.join(home,'auth.json'), plain, { mode:0o600 });
  } catch (e) {
    if (!String(e?.message||e).toLowerCase().includes('not found')) console.error('restore auth:', e);
  }
}
async function persistAuth(sid, home) {
  if (!process.env.CODEX_CREDENTIALS_KEY) return;
  try {
    const raw=await readFile(path.join(home,'auth.json'));
    const enc=encrypt(raw); if (!enc) return;
    await put(`codex-auth/${sid}.bin`, enc, { access:'private', allowOverwrite:true, contentType:'application/octet-stream' });
  } catch (e) {
    if (e?.code === 'ENOENT') {
      try { await del(`codex-auth/${sid}.bin`); } catch {}
    } else console.error('persist auth:', e);
  }
}

wss.on('connection', async (ws, req) => {
  const sid=sessionId(req);
  if (!sid) { ws.close(1008,'Missing session'); return; }
  const home=path.join('/tmp',`aiway-codex-${sid}`);
  await mkdir(home,{recursive:true});
  await restoreAuth(sid,home);
  const child=spawn(process.execPath,[codexJs,'app-server','--listen','stdio://'],{
    env:{...process.env,CODEX_HOME:home,HOME:home},stdio:['pipe','pipe','pipe']
  });
  let buffer='', saveTimer=null;
  const scheduleSave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistAuth(sid,home).catch(()=>{}),700)};
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    buffer+=chunk;
    let i; while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(!line)continue;if(ws.readyState===WebSocket.OPEN)ws.send(line);try{const m=JSON.parse(line);if(['account/login/completed','account/updated','turn/completed'].includes(m.method))scheduleSave()}catch{}}
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',d=>console.error('codex:',d.trim()));
  child.on('error',e=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({method:'aiway/error',params:{message:e.message}}))});
  child.on('exit',(code)=>{persistAuth(sid,home).catch(()=>{});if(ws.readyState===WebSocket.OPEN)ws.close(1011,`Codex exited ${code}`)});
  ws.on('message',data=>{const line=data.toString();try{const m=JSON.parse(line);if(m.method==='account/logout')setTimeout(scheduleSave,500)}catch{};if(child.stdin.writable)child.stdin.write(line+'\n')});
  ws.on('close',async()=>{clearTimeout(saveTimer);await persistAuth(sid,home).catch(()=>{});if(!child.killed)child.kill('SIGTERM');setTimeout(()=>rm(home,{recursive:true,force:true}).catch(()=>{}),1500)});
});

app.get('/api/ws',(req,res)=>res.status(426).send('WebSocket upgrade required'));
export default server;
