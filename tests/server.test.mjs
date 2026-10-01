import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {WebSocket} from 'ws';
import server from '../api/ws.js';

test('real Codex process replies to initialize sent immediately after WebSocket open',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  const socket=new WebSocket('ws://127.0.0.1:'+port+'/api/ws',{headers:{Origin:'http://127.0.0.1:'+port,Cookie:'aiway_sid='+randomBytes(32).toString('base64url')}});
  try{
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Native initialize timed out')),20000);
      socket.on('open',()=>socket.send(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'aiway-regression',version:'3.1.0'},capabilities:{experimentalApi:true}}})));
      socket.on('message',raw=>{const msg=JSON.parse(String(raw));if(msg.id===1){clearTimeout(timer);msg.error?reject(Error(msg.error.message)):resolve(msg.result)}});
      socket.on('error',error=>{clearTimeout(timer);reject(error)});
    });
    assert.ok(result&&typeof result==='object');
    socket.send(JSON.stringify({method:'initialized',params:{}}));
    const account=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('account/read timed out')),10000);
      socket.on('message',raw=>{const msg=JSON.parse(String(raw));if(msg.id===2){clearTimeout(timer);msg.error?reject(Error(msg.error.message)):resolve(msg.result)}});
      socket.send(JSON.stringify({id:2,method:'account/read',params:{refreshToken:false}}));
    });
    assert.equal(account.account,null); // Fresh isolated home; no user login used.
  }finally{socket.terminate();await new Promise(resolve=>server.close(resolve))}
});
