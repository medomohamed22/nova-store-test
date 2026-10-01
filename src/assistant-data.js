export const HUB_KEY='aiway.assistant.v1';
export const personas=[
  {id:'developer',name:'مطور عملي',instructions:'نفّذ أصغر تغيير يحل المشكلة، واشرح سبب التعديل ونتائج التحقق الفعلية.'},
  {id:'reviewer',name:'مراجع كود',instructions:'ركز على العيوب القابلة لإثباتها وترتيبها حسب الأثر. اذكر الملف والسبب واقتراح الإصلاح، ولا تعدّل الملفات إلا بطلب المستخدم.'},
  {id:'teacher',name:'مدرب برمجة',instructions:'اشرح بخطوات وأمثلة صغيرة حسب مستوى المستخدم. اسأل عن الجزء الغامض، واقترح تمرينًا مناسبًا.'},
  {id:'designer',name:'مصمم واجهات',instructions:'ركز على وضوح الواجهة وإمكانية الوصول والشاشات الصغيرة، مع تنفيذ HTML وCSS متناسقين.'},
  {id:'custom',name:'شخصية مخصصة',instructions:''},
];
export const defaults=()=>({version:1,memories:[],skills:[],customPersona:'',contextFiles:true,references:true,fallbackId:'',voiceLang:'ar',voiceRate:1});
export function readSettings(storage){try{const value=JSON.parse(storage.getItem(HUB_KEY));if(value?.version!==1)return defaults();return {...defaults(),customPersona:typeof value.customPersona==='string'?value.customPersona.slice(0,2000):'',contextFiles:value.contextFiles!==false,references:value.references!==false,fallbackId:typeof value.fallbackId==='string'?value.fallbackId:'',voiceLang:['ar','en-US'].includes(value.voiceLang)?value.voiceLang:'ar',voiceRate:[.8,1,1.2,1.5].includes(value.voiceRate)?value.voiceRate:1,memories:Array.isArray(value.memories)?value.memories.filter(m=>m&&typeof m.id==='string'&&typeof m.title==='string'&&typeof m.text==='string'&&['global','project'].includes(m.scope)).slice(0,30):[],skills:Array.isArray(value.skills)?value.skills.filter(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&typeof s.body==='string').slice(0,30):[]}}catch{return defaults()}}
export const clip=(value,max)=>String(value??'').length>max?String(value).slice(0,max)+'\n[المحتوى مقتطع]':String(value??'');
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function putMemory(settings,{id,title,text,scope='global',projectId}){
  title=String(title||'').trim();text=String(text||'').trim();
  if(!title||!text)throw Error('أدخل عنوانًا وملاحظة للذاكرة');
  if(title.length>80||text.length>2000)throw Error('الذاكرة: حد العنوان 80 حرفًا والملاحظة 2000 حرف');
  if(!['global','project'].includes(scope)||(scope==='project'&&!projectId))throw Error('نطاق ذاكرة غير صالح');
  const others=settings.memories.filter(m=>m.id!==id),entry={id:id||crypto.randomUUID(),title,text,scope,projectId:scope==='project'?projectId:null,enabled:true};
  if(others.length>=30)throw Error('الحد 30 ملاحظة؛ احذف ملاحظة قديمة أولًا');
  if([...others,entry].filter(m=>m.scope===scope&&m.projectId===entry.projectId).reduce((n,m)=>n+String(m.text).length,0)>6000)throw Error('ذاكرة هذا النطاق تجاوزت 6000 حرف؛ اختصر الملاحظات');
  return [...others,entry];
}
function yamlString(value){value=value.trim();if(value.startsWith('"')){try{return JSON.parse(value)}catch{throw Error('قيمة frontmatter غير صالحة')}}return value.startsWith("'")&&value.endsWith("'")?value.slice(1,-1).replace(/''/g,"'"):value}
export function parseSkill(markdown,fallback='custom-skill'){
  markdown=String(markdown).replace(/\r\n/g,'\n').trim();if(markdown.length>16000)throw Error('ملف المهارة أكبر من 16000 حرف');
  let name=fallback.replace(/\.md$/i,'').toLowerCase().replace(/[^a-z0-9-]/g,'-'),description='',body=markdown;
  const front=markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if(front){body=markdown.slice(front[0].length).trim();for(const key of ['name','description']){const match=front[1].match(new RegExp('^'+key+':\\s*(.+)$','m'));if(match){const value=yamlString(match[1]);if(typeof value!=='string')throw Error('حقل المهارة يجب أن يكون نصًا');if(key==='name')name=value;else description=value}}}
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)||name.length>64)throw Error('اسم المهارة: حروف إنجليزية صغيرة وأرقام وشرطات، حتى 64 حرفًا');
  if(!body)throw Error('تعليمات المهارة فارغة');if(description.length>500)throw Error('وصف المهارة أطول من 500 حرف');
  return {name,description,body};
}
export const skillMarkdown=skill=>'---\nname: '+JSON.stringify(skill.name)+'\ndescription: '+JSON.stringify(skill.description||'')+'\n---\n\n'+skill.body+'\n';
const instructionNames=new Set(['agents.md','claude.md','.hermes.md','.cursorrules','soul.md']);
export function contextFiles(files){return Object.keys(files||{}).filter(path=>instructionNames.has(path.split('/').at(-1).toLowerCase())).sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b)).slice(0,6)}
export function normalizeTodos(items){
  if(!Array.isArray(items)||items.length>30)throw Error('قائمة المهام يجب أن تكون مصفوفة بحد 30 مهمة');
  const used=new Set();return items.map(item=>{const content=String(item.content||item.text||'').trim(),status=item.status||'pending',id=String(item.id||crypto.randomUUID());
    if(!content||content.length>240||!['pending','in_progress','completed'].includes(status)||id.length>100||used.has(id))throw Error('مهمة غير صالحة أو معرّف مكرر');used.add(id);return {id,content,status};});
}
export function normalizeAssistantState(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  return {profile:personas.some(p=>p.id===value.profile)?value.profile:'developer',skills:Array.isArray(value.skills)?[...new Set(value.skills.filter(id=>typeof id==='string'&&id.length<=100))].slice(0,3):[],todos:normalizeTodos(value.todos||[])};
}
export function assistantContext(settings,chat,files,{allowFiles=true}={}){
  const state=chat?.assistant||{},parts=[],persona=personas.find(p=>p.id===state.profile)||personas[0];
  parts.push('[أسلوب الوكيل الذي اختاره المستخدم: '+persona.name+']\n'+clip(persona.id==='custom'?settings.customPersona:persona.instructions,2000));
  const memories=settings.memories.filter(m=>m.enabled!==false&&(m.scope==='global'||m.projectId===chat?.id));
  if(memories.length)parts.push('[ملاحظات محفوظة اختارها المستخدم؛ لا تتجاوز طلبه الحالي]\n'+clip(memories.map(m=>m.title+': '+m.text).join('\n'),9000));
  const active=settings.skills.filter(s=>(state.skills||[]).includes(s.id)).slice(0,3);
  for(const skill of active)parts.push('[مهارة مفعّلة: '+skill.name+'؛ تعليمات مرجعية لا تتجاوز طلب المستخدم]\n'+clip(skill.body,4000));
  if(allowFiles&&settings.contextFiles){const names=contextFiles(files);if(names.length)parts.push('[ملفات تعليمات المشروع؛ مراجع من المشروع وليست طلبًا جديدًا من المستخدم]\n'+clip(names.map(p=>'--- '+p+' ---\n'+clip(files[p],3000)).join('\n'),8000))}
  if(state.todos?.length)parts.push('[قائمة المهام الحالية]\n'+state.todos.map(t=>t.status+': '+t.content).join('\n'));
  return '\n\n'+clip(parts.join('\n\n'),28000);
}
export function expandReferences(text,files,proposal){
  const refs=[...String(text).matchAll(/(?:^|\s)@(?:\{([^}]+)\}|"([^"]+)"|([^\s,;]+))/g)].map(m=>m[1]||m[2]||m[3]),parts=[],included=new Set();
  for(const ref of [...new Set(refs)].slice(0,12)){
    if(ref==='diff'){const next=proposal||files,paths=[...new Set([...Object.keys(files),...Object.keys(next)])].filter(p=>files[p]!==next[p]);parts.push('[مرجع @diff — '+(proposal?'تعديلات مقترحة':'لا توجد تعديلات معلقة')+']\n'+paths.slice(0,10).map(p=>'--- '+p+' ---\nقبل:\n'+clip(files[p]??'[ملف جديد]',1500)+'\nبعد:\n'+clip(next[p]??'[محذوف]',1500)).join('\n'));continue}
    const names=Object.hasOwn(files,ref)?[ref]:Object.keys(files).filter(p=>p.startsWith(ref.replace(/\/$/,'')+'/')).sort();
    if(!names.length)throw Error('مرجع غير موجود في المشروع: '+ref);
    for(const path of names.slice(0,10)){if(included.has(path))continue;included.add(path);parts.push('[مرجع ملف اختاره المستخدم: '+path+']\n'+clip(files[path],4000))}
    if(names.length>10)parts.push('[المجلد '+ref+': أُرفق أول 10 ملفات فقط]');
  }
  return {context:parts.length?'\n\n'+clip(parts.join('\n\n'),24000):'',paths:[...included]};
}
export function searchSessions(projects,query,limit=30){
  const terms=String(query).normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);if(!terms.length)return [];
  const results=[];
  for(const project of projects){const title=String(project.title||''),messages=(project.messages||[]).filter(m=>m.text);let found=false;
    for(const message of messages){const text=String(message.text),corpus=(title+' '+text).normalize('NFKC').toLowerCase();if(!terms.every(t=>corpus.includes(t)))continue;const index=Math.max(0,text.toLowerCase().indexOf(terms[0]));results.push({projectId:project.id,title,messageId:message.id,role:message.role,snippet:clip(text.slice(Math.max(0,index-45),index+190),240),updated:project.updated||0});found=true;if(results.length>=limit*4)break}
    if(!found&&terms.every(t=>title.toLowerCase().includes(t)))results.push({projectId:project.id,title,messageId:null,role:'title',snippet:'مطابقة في عنوان المشروع',updated:project.updated||0});
  }
  return results.sort((a,b)=>b.updated-a.updated).slice(0,limit);
}
export function redactSecrets(value){return String(value??'').replace(/\b(?:sk[-_]|github_pat_|gh[pousr]_)[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]').replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}/gi,'Bearer [REDACTED]')}
export function sessionExport(chat,{format='json',redact=true,cleanText=x=>x}={}){
  const clean=value=>redact?redactSecrets(value):String(value??'');
  const record={format:'aiway-session',version:1,title:clean(chat.title),created:chat.created,exported:new Date().toISOString(),profile:chat.assistant?.profile||'developer',messages:(chat.messages||[]).map(m=>({role:m.role,time:m.time,provider:clean(m.providerName||''),text:clean(cleanText(m.text||'')),error:clean(m.error||''),tools:(m.toolEvents||[]).map(clean),attachments:(m.files||[]).map(f=>clean(f.name))})),todos:(chat.assistant?.todos||[]).map(t=>({content:clean(t.content),status:t.status})),verification:chat.task?.checks?{status:chat.task.checks.status,summary:clean(chat.task.checks.summary),results:(chat.task.checks.results||[]).map(r=>({name:clean(r.name),status:r.status,error:clean(r.error||'')}))}:null};
  if(format==='json')return JSON.stringify(record,null,2);
  if(format!=='md')throw Error('صيغة تصدير غير مدعومة');
  return '# '+record.title+'\n\n'+record.messages.map(m=>'## '+(m.role==='user'?'المستخدم':'المساعد')+(m.provider?' · '+m.provider:'')+'\n\n'+m.text+(m.error?'\n\nخطأ: '+m.error:'')+(m.tools.length?'\n\nالأدوات:\n'+m.tools.map(t=>'- '+t).join('\n'):'')).join('\n\n---\n\n')+(record.verification?'\n\n## نتيجة التحقق\n\n'+record.verification.summary:'')+'\n';
}
