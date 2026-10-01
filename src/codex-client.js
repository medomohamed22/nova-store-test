export class CodexClient {
  constructor({onMessage=()=>{},onState=()=>{},onReady=()=>{},onDisconnect=()=>{},fetchImpl=fetch,WebSocketImpl=WebSocket,retry=true}={}){
    Object.assign(this,{onMessage,onState,onReady,onDisconnect,WebSocketImpl,retry});
    this.fetchImpl=(...args)=>fetchImpl(...args);
    this.pending=new Map();this.id=0;this.generation=0;this.ready=false;this.connecting=null;this.retryAttempt=0;this.retryTimer=null;this.connectedAt=0;
  }
  rpc(method,params={},timeout=15000){
    return new Promise((resolve,reject)=>{
      if(!this.socket||this.socket.readyState!==1)return reject(Error('اتصال Codex غير جاهز'));
      const id=++this.id,t=setTimeout(()=>{this.pending.delete(id);reject(Error('انتهت مهلة '+method))},timeout);
      this.pending.set(id,{resolve,reject,t});
      try{this.socket.send(JSON.stringify({id,method,params}))}catch(error){clearTimeout(t);this.pending.delete(id);reject(error)}
    });
  }
  notify(method,params={}){if(this.socket?.readyState===1)this.socket.send(JSON.stringify({method,params}))}
  rejectPending(reason){for(const p of this.pending.values()){clearTimeout(p.t);p.reject(Error(reason))}this.pending.clear()}
  async connect({fresh=false}={}){
    if(this.connecting)return this.connecting;
    if(this.ready&&!fresh)return;
    clearTimeout(this.retryTimer);this.retryTimer=null;
    const generation=++this.generation;this.ready=false;this.rejectPending('تم تجديد اتصال Codex');this.socket?.close();
    this.connecting=this.open(generation).finally(()=>{if(this.generation===generation)this.connecting=null});
    return this.connecting;
  }
  async open(generation){
    this.onState('connecting','جارٍ تجهيز الجلسة…');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await this.fetchImpl('/api/session',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('تعذر تجهيز الجلسة (HTTP '+response.status+'). راجع نشر /api/session.');
    }catch(error){this.onState('error',error.name==='AbortError'?'خادم الجلسة لم يستجب خلال 10 ثوانٍ.':error.message);this.scheduleRetry();throw error}
    finally{clearTimeout(timer)}
    if(generation!==this.generation)return;
    const scheme=location.protocol==='https:'?'wss:':'ws:',socket=new this.WebSocketImpl(scheme+'//'+location.host+'/api/ws');this.socket=socket;
    socket.onmessage=event=>{
      if(generation!==this.generation)return;
      let message;try{message=JSON.parse(event.data)}catch{return}
      const pending=message.id!=null&&this.pending.get(message.id);
      if(pending){clearTimeout(pending.t);this.pending.delete(message.id);message.error?pending.reject(Error(message.error.message||'Codex RPC error')):pending.resolve(message.result);return}
      this.onMessage(message);
    };
    socket.onclose=event=>{
      if(generation!==this.generation)return;
      this.ready=false;this.rejectPending('انقطع اتصال Codex');this.onState('disconnected',event.code===4401?'الجلسة مفقودة؛ أعد الاتصال.':event.code===4429?'عدد الجلسات تجاوز الحد؛ أغلق التبويبات الأخرى.':'انقطع الاتصال؛ جارٍ الاستعادة…');this.onDisconnect(event);this.scheduleRetry();
    };
    try{
      this.onState('connecting','جارٍ فتح اتصال Codex…');
      await new Promise((resolve,reject)=>{
        const t=setTimeout(()=>{socket.close();reject(Error('تعذر فتح WebSocket خلال 12 ثانية. تحقق من /api/ws ودعم WebSocket في الاستضافة.'))},12000);
        socket.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});
        socket.addEventListener('error',()=>{clearTimeout(t);reject(Error('تعذر الاتصال بـ /api/ws. راجع سجل Function في Vercel.'))},{once:true});
        socket.addEventListener('close',()=>{clearTimeout(t);reject(Error('أغلق الخادم اتصال Codex قبل التهيئة.'))},{once:true});
      });
      await this.rpc('initialize',{clientInfo:{name:'aiway-web',title:'AiWay',version:'3.2.0'},capabilities:{experimentalApi:true}},15000);
      if(generation!==this.generation)return;
      this.notify('initialized',{});this.ready=true;this.connectedAt=Date.now();this.retryAttempt=0;this.onState('ready','متصل');this.onReady();
    }catch(error){if(generation===this.generation){this.ready=false;this.onState('error',error.message);socket.close();this.scheduleRetry()}throw error}
  }
  scheduleRetry(){
    if(!this.retry||this.retryTimer||!navigator.onLine||this.retryAttempt>=6)return;
    const delay=Math.min(30000,1000*2**this.retryAttempt++);
    this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connect().catch(()=>{})},delay);
  }
  ensureFresh(){return this.connect({fresh:this.ready&&Date.now()-this.connectedAt>45000})}
  disconnect(){this.generation++;this.ready=false;clearTimeout(this.retryTimer);this.retryTimer=null;this.socket?.close();this.rejectPending('تم إغلاق الاتصال')}
}

export class CodexLogin {
  constructor(client,{onState=()=>{},onAccount=()=>{},timeoutMs=180000,pollMs=2500}={}){Object.assign(this,{client,onState,onAccount,timeoutMs,pollMs});this.state={phase:'idle'};this.generation=0;this.starting=null;this.timer=null;this.loginId=null}
  update(phase,extra={}){this.state={...this.state,phase,...extra};this.onState(this.state)}
  clear(){clearInterval(this.timer);this.timer=null}
  start(){
    if(this.starting||['connecting','waiting','verifying'].includes(this.state.phase))return this.starting;
    // Reserve the window inside the click handler; opening after network awaits
    // is blocked by many browsers. The manual link remains available.
    let popup;try{popup=window.open('about:blank','aiway-chatgpt-login');if(popup){popup.opener=null;popup.document.body.textContent='جارٍ تجهيز تسجيل الدخول إلى ChatGPT…'}}catch{}
    const generation=++this.generation;this.clear();this.loginId=null;this.update('connecting',{error:'',popupBlocked:!popup,remaining:Math.ceil(this.timeoutMs/1000)});
    this.starting=this.begin(generation,popup).finally(()=>{this.starting=null});return this.starting;
  }
  async begin(generation,popup){
    try{
      await this.client.ensureFresh();
      const result=await this.client.rpc('account/login/start',{type:'chatgptDeviceCode'},20000);
      if(generation!==this.generation){if(result?.loginId)this.client.rpc('account/login/cancel',{loginId:result.loginId},5000).catch(()=>{});return}
      const url=new URL(result.verificationUrl||'');
      if(!result.loginId||!result.userCode||url.protocol!=='https:'||url.hostname!=='auth.openai.com')throw Error('الخادم لم يرجع رابط OpenAI وكودًا صالحين.');
      this.loginId=result.loginId;this.deadline=Date.now()+this.timeoutMs;this.update('waiting',{loginId:result.loginId,url:url.href,code:result.userCode,error:'',remaining:Math.ceil(this.timeoutMs/1000)});
      if(popup&&!popup.closed)popup.location.replace(url.href);
      this.timer=setInterval(()=>this.poll(generation),this.pollMs);
    }catch(error){if(generation===this.generation){this.clear();this.update('error',{error:error.message});try{popup?.close()}catch{}}}
  }
  async poll(generation=this.generation){
    if(generation!==this.generation||this.state.phase!=='waiting')return;
    const remaining=Math.max(0,Math.ceil((this.deadline-Date.now())/1000));this.update('waiting',{remaining});
    if(!remaining){const id=this.loginId;this.clear();this.generation++;this.client.rpc('account/login/cancel',{loginId:id},5000).catch(()=>{});this.update('expired',{error:'انتهت مهلة تسجيل الدخول. اطلب كودًا جديدًا وحاول مرة أخرى.'});return}
    if(this.polling)return;this.polling=true;
    try{const response=await this.client.rpc('account/read',{refreshToken:false},8000);if(generation===this.generation&&response.account?.type==='chatgpt')this.finish(response.account)}catch(error){if(generation===this.generation&&!this.client.ready)this.handleDisconnect()}
    finally{this.polling=false}
  }
  async handleMessage(message){
    if(message.method==='account/login/completed'&&message.params?.loginId===this.loginId&&this.state.phase==='waiting'){
      if(!message.params.success){this.clear();this.update('error',{error:message.params.error||'رفض تسجيل الدخول؛ تحقق من تفعيل Device Code في إعدادات الأمان بحساب ChatGPT.'});return}
      const generation=this.generation;this.clear();this.update('verifying');
      try{const result=await this.client.rpc('account/read',{refreshToken:false},8000);if(generation!==this.generation)return;if(result.account?.type!=='chatgpt')throw Error('تمت الموافقة، لكن حالة الحساب لم تُستعد. اضغط تحقق من الحساب.');this.finish(result.account)}catch(error){if(generation===this.generation)this.update('error',{error:error.message})}
    }
    if(message.method==='account/updated'&&this.state.phase==='waiting')this.poll();
  }
  finish(account){this.clear();this.update('authenticated',{error:'',remaining:0});this.onAccount(account)}
  async cancel(){const id=this.loginId;this.generation++;this.clear();this.loginId=null;this.update('cancelled',{error:''});if(id&&this.client.ready)await this.client.rpc('account/login/cancel',{loginId:id},5000).catch(()=>{})}
  handleDisconnect(){if(['waiting','verifying'].includes(this.state.phase)){this.generation++;this.clear();this.loginId=null;this.update('error',{error:'انقطع الاتصال أثناء تسجيل الدخول. انتظر عودة الاتصال ثم اطلب كودًا جديدًا.'})}}
}
