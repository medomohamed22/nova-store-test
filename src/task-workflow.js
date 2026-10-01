export const taskTemplates=[
  {id:'fix-test',ar:'أصلح اختبارًا فاشلًا',en:'Fix a failing test',prompt:'افحص ملفات المشروع والاختبارات الموجودة، حدّد سبب الاختبار الفاشل، واقترح أقل تعديل يصلحه. استخدم run_tests للتحقق، ثم اشرح السبب ونتيجة الفحص.'},
  {id:'refactor',ar:'بسّط دالة',en:'Simplify a function',prompt:'راجع الدوال في الملف الحالي وحدّد دالة يمكن تبسيطها دون تغيير سلوكها. عدّلها وأضف اختبارًا يحمي السلوك، ثم استخدم run_tests واعرض النتيجة للمراجعة.'},
  {id:'add-test',ar:'أضف اختبارًا ناقصًا',en:'Add missing coverage',prompt:'افحص المشروع وحدّد حالة حدّية غير مغطاة، واكتب لها اختبار JavaScript باستخدام node:test وnode:assert/strict، ثم شغّله باستخدام run_tests. لا تدّعِ نجاح أي اختبار دون نتيجة فعلية.'}
];
const labels={ar:['السياق','التعديلات','الاختبارات','المراجعة'],en:['Context','Changes','Tests','Review']};
export function startTask(chat,title){
  chat.task={id:crypto.randomUUID(),title:title.slice(0,150),started:Date.now(),phase:'context',running:true,events:[],checks:null};
  addTaskEvent(chat,'context','المشروع يحتوي '+Object.keys(chat.files||{}).length+' ملفًا؛ السياق يتبع خيارات الإرفاق');return chat.task;
}
export function addTaskEvent(chat,phase,detail){if(!chat?.task)return;chat.task.phase=phase;chat.task.events.push({time:Date.now(),phase,detail:String(detail).slice(0,500)});chat.task.events=chat.task.events.slice(-40)}
export function renderTask(root,task,{language='ar',pending=false,busy=false}={}){
  if(!root)return;const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),en=language==='en';
  if(!task){root.innerHTML='<div class="empty-mini">'+(en?'Start a task from chat or pick a template.':'ابدأ مهمة من الشات أو اختر أحد القوالب.')+'</div>';return}
  const checks=task.checks,phases=['context','changes','tests','review'];
  root.innerHTML='<div class="task-title">'+escape(task.title)+'</div><div class="task-steps">'+phases.map((phase,i)=>'<div class="task-step '+(task.phase===phase?'active':'')+'"><b>'+String(i+1).padStart(2,'0')+'</b><span>'+labels[language][i]+'</span><small>'+escape(phase==='tests'?(checks?(checks.status==='passed'?(en?'Passed':'نجح'):checks.status==='running'?(en?'Running':'يعمل'):checks.status==='no-tests'?(en?'No tests':'لا توجد اختبارات'):(en?'Needs attention':'يحتاج مراجعة')):(en?'Not run':'لم تُشغّل')):phase==='review'?(pending?(en?'Your decision':'بانتظار قرارك'):(en?'No pending changes':'لا توجد تعديلات معلقة')):task.events.some(e=>e.phase===phase)?(en?'Recorded':'موثّق'):(en?'Waiting':'انتظار'))+'</small></div>').join('')+'</div><div class="task-check-card"><strong>'+(en?'Verification evidence':'نتيجة التحقق')+'</strong><p>'+escape(checks?checks.summary:(en?'No test results yet.':'لم تُنفذ اختبارات حتى الآن.'))+'</p>'+(checks?.results||[]).map(r=>'<div class="test-result '+escape(r.status)+'"><span>'+escape(r.status==='passed'?'✓':r.status==='skipped'?'–':'✕')+'</span><div><strong>'+escape(r.name)+'</strong>'+(r.error?'<pre>'+escape(r.error)+'</pre>':'')+'</div></div>').join('')+'<button class="primary-mini" id="runTaskTests" '+(busy||checks?.status==='running'?'disabled':'')+'>'+(en?'Run JavaScript tests':'تشغيل اختبارات JavaScript')+'</button></div><div class="task-event-list">'+[...task.events].reverse().map(e=>'<div><time>'+new Date(e.time).toLocaleTimeString(en?'en':'ar',{hour:'2-digit',minute:'2-digit'})+'</time><span>'+escape(e.detail)+'</span></div>').join('')+'</div>';
}
export function observeCodexTask(chat,message){
  const item=message.params?.item;if(!chat?.task||!item)return;
  if(item.type==='fileChange'&&message.method==='item/completed')addTaskEvent(chat,'changes',(item.changes||[]).map(c=>c.path).join(', ')||'تعديل ملفات من Codex');
  if(item.type==='commandExecution'&&message.method==='item/completed'){
    const command=String(item.command||''),isTest=/\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\b(node\s+--test|pytest|vitest|jest)\b/.test(command);
    addTaskEvent(chat,isTest?'tests':'context',command+' · exit '+item.exitCode);
    if(isTest&&item.exitCode!=null)chat.task.checks={status:item.exitCode===0?'passed':'failed',summary:'Codex: '+command+' · exit '+item.exitCode,results:[{name:command,status:item.exitCode===0?'passed':'failed',error:item.exitCode===0?'':String(item.aggregatedOutput||'').slice(-3000)}],time:Date.now()};
  }
}
