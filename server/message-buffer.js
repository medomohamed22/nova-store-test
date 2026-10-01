// Attach before the first async setup step: WebSocket clients can send their
// initialize request immediately after the upgrade succeeds.
export function bufferMessages(socket,maxBytes=16*1024*1024){
  let receiver=null,queue=[],bytes=0;
  socket.on('message',data=>{
    if(receiver)return receiver(data);
    bytes+=typeof data==='string'?Buffer.byteLength(data):data.length;
    if(bytes>maxBytes||queue.length>=32){queue=[];socket.close(4409,'Startup queue exceeded');return}
    queue.push(data);
  });
  return receive=>{receiver=receive;const pending=queue;queue=[];bytes=0;for(const data of pending)receiver(data)};
}
