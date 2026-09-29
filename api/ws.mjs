import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { get, put, del } from '@vercel/blob';

const require=createRequire(import.meta.url);
const app=express();
const server=createServer(app);
const wss=new WebSocketServer({server});

app.get('/',(_req,res)=>res.status(426).json({error:'WebSocket upgrade required'}));

function cookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('='); return i<0?[v,'']:[v.slice(0,i), decodeURIComponent(v.slice(i+1))];
  }));
}
function sessionHash(sid){return createHash('sha256').update(sid).digest('hex');}
function encryptionKey(){
  const s=process.env.AIWAY_CREDENTIAL_KEY;
  return s ? createHash('sha256').update(s).digest() : null;
}
function encrypt(buf){
  const key=encryptionKey(); if(!key) throw new Error('AIWAY_CREDENTIAL_KEY is not configured');
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(buf),cipher.final()]), tag=cipher.getAuthTag();
  return Buffer.concat([Buffer.from('AIWAY1'),iv,tag,body]);
}
function decrypt(buf){
  const key=encryptionKey(); if(!key) throw new Error('AIWAY_CREDENTIAL_KEY is not configured');
  if(buf.subarray(0,6).toString()!=='AIWAY1') throw new Error('Invalid encrypted credential format');
  const iv=buf.subarray(6,18), tag=buf.subarray(18,34), body=buf.subarray(34);
  const decipher=createDecipheriv('aes-256-gcm',key,iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body),decipher.final()]);
}
async function streamToBuffer(stream){const chunks=[];for await(const c of stream)chunks.push(Buffer.from(c));return Buffer.concat(chunks);}
function blobPath(hash){return `codex-auth/${hash}.bin`;}
function persistenceConfigured(req){return Boolean(process.env.AIWAY_CREDENTIAL_KEY && (process.env.BLOB_READ_WRITE_TOKEN || req?.headers?.['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN));}

async function restoreAuth(hash,codexHome,enabled){
  if(!enabled) return false;
  try{
    const r=await get(blobPath(hash),{access:'private',useCache:false});
    if(!r) return false;
    const encrypted=await streamToBuffer(r.stream);
    await writeFile(join(codexHome,'auth.json'),decrypt(encrypted),{mode:0o600});
    return true;
  }catch(e){
    if(String(e?.message||e).match(/404|not found|BlobNotFound/i)) return false;
    console.error('restoreAuth',e); return false;
  }
}
async function persistAuth(hash,codexHome,enabled){
  if(!enabled) return false;
  try{
    const path=join(codexHome,'auth.json'); await stat(path);
    const raw=await readFile(path);
    await put(blobPath(hash),encrypt(raw),{access:'private',allowOverwrite:true,contentType:'application/octet-stream',cacheControlMaxAge:60});
    return true;
  }catch(e){console.error('persistAuth',e);return false;}
}
async function removePersistedAuth(hash,enabled){
  if(!enabled) return;
  try{await del(blobPath(hash));}catch(e){console.error('removePersistedAuth',e);}
}
function codexBin(){
  const pkg=require.resolve('@openai/codex/package.json');
  return join(dirname(pkg),'bin','codex.js');
}

wss.on('connection',async(ws,req)=>{
  const sid=cookies(req.headers.cookie||'').aiway_sid;
  if(!sid || !/^[A-Za-z0-9_-]{32,128}$/.test(sid)){
    ws.close(4401,'Session cookie required'); return;
  }
  const hash=sessionHash(sid);
  const canPersist=persistenceConfigured(req);
  const codexHome=await mkdtemp(join(tmpdir(),`aiway-${hash.slice(0,12)}-`));
  const workDir=join(codexHome,'workspace'); await mkdir(workDir,{recursive:true});
  await writeFile(join(codexHome,'config.toml'),'cli_auth_credentials_store = "file"\ncheck_for_update_on_startup = false\n',{mode:0o600});
  const restored=await restoreAuth(hash,codexHome,canPersist);
  const child=spawn(process.execPath,[codexBin(),'app-server','--stdio'],{
    cwd:workDir,
    env:{...process.env,CODEX_HOME:codexHome,HOME:codexHome},
    stdio:['pipe','pipe','pipe']
  });
  let stdoutBuffer=''; let closed=false; let saveTimer=null;
  const safeSend=obj=>{if(ws.readyState===WebSocket.OPEN)ws.send(typeof obj==='string'?obj:JSON.stringify(obj));};
  safeSend({method:'aiway/server',params:{persistence:canPersist,restored,workDir:'/workspace'}});
  const schedulePersist=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistAuth(hash,codexHome,canPersist),700);};

  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    stdoutBuffer+=chunk;
    let i;
    while((i=stdoutBuffer.indexOf('\n'))>=0){
      const line=stdoutBuffer.slice(0,i).trim(); stdoutBuffer=stdoutBuffer.slice(i+1);
      if(!line) continue;
      safeSend(line);
      try{
        const msg=JSON.parse(line);
        if(msg.method==='account/login/completed' && msg.params?.success) schedulePersist();
        if(msg.method==='account/updated') schedulePersist();
        if(msg.method==='account/logout') removePersistedAuth(hash,canPersist);
      }catch{}
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',d=>console.error('[codex]',String(d).slice(0,2000)));
  child.on('exit',(code,signal)=>{
    safeSend({method:'aiway/codexExited',params:{code,signal}});
    if(!closed) ws.close(1011,'Codex process exited');
  });

  ws.on('message',data=>{
    if(child.stdin.destroyed) return;
    let text=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    // Browser speaks JSON-RPC directly to Codex; one JSON object per line over stdio.
    child.stdin.write(text.replace(/[\r\n]+$/,'')+'\n');
    try{
      const m=JSON.parse(text);
      if(m.method==='account/logout') setTimeout(()=>removePersistedAuth(hash,canPersist),500);
    }catch{}
  });
  ws.on('close',async()=>{
    closed=true; clearTimeout(saveTimer);
    await persistAuth(hash,codexHome,canPersist);
    try{child.kill('SIGTERM')}catch{}
    setTimeout(()=>{try{child.kill('SIGKILL')}catch{}},1200).unref?.();
    await rm(codexHome,{recursive:true,force:true}).catch(()=>{});
  });
  ws.on('error',()=>{});
});

export default server;
