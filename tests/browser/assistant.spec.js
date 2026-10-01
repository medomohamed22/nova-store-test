import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
const providers=[{id:'main',name:'Primary test',type:'compatible',url:'https://primary.ai/v1',model:'test-model'},{id:'backup',name:'Backup test',type:'compatible',url:'https://backup.ai/v1',model:'test-model'}];
const stream=text=>'data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\ndata: [DONE]\n\n';
async function boot(page,reply='تم التحقق من السياق'){
  await page.addInitScript(values=>{if(window.top!==window)return;localStorage.setItem('aiway.providers',JSON.stringify(values));localStorage.setItem('aiway.active','main');localStorage.setItem('aiway.auto','0')},providers);
  const requests=[];await page.route('**/api/session',route=>route.fulfill({status:503}));await page.route('https://primary.ai/v1/chat/completions',route=>{requests.push(route.request().postDataJSON());return route.fulfill({contentType:'text/event-stream',body:stream(typeof reply==='function'?reply(requests.length):reply)})});
  await page.goto('/');await expect(page.locator('#chatTitle')).toBeVisible();return requests;
}
async function hub(page){await page.locator('#assistantHubButton').click();await expect(page.locator('#assistantTab')).toBeVisible()}
async function section(page,label){const root=page.locator('.hub-section').filter({has:page.locator('summary').filter({hasText:label})});if(!await root.evaluate(el=>el.open))await root.locator('summary').click();return root}
async function ask(page,text){await page.locator('#prompt').fill(text);await page.locator('#sendBtn').click();await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/);await expect(page.locator('.message.assistant').last()).toBeVisible()}
async function loadFiles(page,files){const zip=new JSZip();for(const [path,text] of Object.entries(files))zip.file(path,text);await page.locator('#projectInput').setInputFiles({name:'project.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});await expect(page.locator('#editingName')).not.toHaveText('لا يوجد ملف محدد')}
async function downloadedText(download){const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks).toString('utf8')}

test('memory persists, is scoped to the project and enters real request bodies',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));const requests=await boot(page);await hub(page);await expect(page.locator('.hub-features span')).toHaveCount(10);
  await page.locator('#hubMemoryTitle').fill('تفضيل عام');await page.locator('#hubMemoryText').fill('GLOBAL_MEMORY_TEST');await page.locator('#hubMemoryForm button').first().click();
  await page.locator('#hubMemoryTitle').fill('تفضيل المشروع');await page.locator('#hubMemoryText').fill('PROJECT_MEMORY_TEST');await page.locator('#hubMemoryScope').selectOption('project');await page.locator('#hubMemoryForm button').first().click();await ask(page,'طلب أول');
  expect(requests[0].messages[0].content).toContain('GLOBAL_MEMORY_TEST');expect(requests[0].messages[0].content).toContain('PROJECT_MEMORY_TEST');
  await page.locator('#newChat').click();await ask(page,'طلب ثان');expect(requests[1].messages[0].content).toContain('GLOBAL_MEMORY_TEST');expect(requests[1].messages[0].content).not.toContain('PROJECT_MEMORY_TEST');
  await page.reload();await hub(page);await expect(page.locator('#hubMemoryList')).toContainText('GLOBAL_MEMORY_TEST');await expect(page.locator('#hubMemoryList')).not.toContainText('PROJECT_MEMORY_TEST');
  await page.setViewportSize({width:1500,height:1000});await page.locator('#themeToggle').click();await page.screenshot({path:'test-results/assistant-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/assistant-mobile.png',fullPage:true,animations:'disabled'});expect(errors).toEqual([]);
});
test('imported skills, persona, context files and autocomplete references reach the provider',async({page})=>{
  const requests=await boot(page);await hub(page);await loadFiles(page,{'AGENTS.md':'CONVENTION_GUIDE_TEST','src/my file.js':'export const selectedMarker="REFERENCE_BODY_TEST";'});await hub(page);
  await section(page,'مكتبة المهارات');await page.locator('#hubSkillInput').setInputFiles({name:'SKILL.md',mimeType:'text/markdown',buffer:Buffer.from('---\nname: review-accessibility\ndescription: UI review\n---\n\nSKILL_BODY_TEST: check keyboard navigation.')});await page.locator('#hubSkillForm button').first().click();await page.locator('[data-skill-enable]').check();
  await section(page,'شخصية الوكيل');await page.locator('#hubPersona').selectOption('custom');await page.locator('#hubCustomPersona').fill('PERSONA_TEST: explain clearly');await page.locator('#hubSavePersona').click();
  await page.locator('#prompt').fill('راجع @src/');await page.locator('#referencePicker [data-reference="src/my file.js"]').click();await expect(page.locator('#prompt')).toHaveValue(/@\{src\/my file.js\}/);await page.locator('#sendBtn').click();await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/);
  expect(requests[0].messages[0].content).toContain('SKILL_BODY_TEST');expect(requests[0].messages[0].content).toContain('PERSONA_TEST');expect(requests[0].messages[0].content).toContain('CONVENTION_GUIDE_TEST');expect(requests[0].messages.at(-1).content).toContain('REFERENCE_BODY_TEST');
  await page.reload();await hub(page);await section(page,'مكتبة المهارات');await expect(page.locator('[data-skill-enable]')).toBeChecked();
  const wait=page.waitForEvent('download');await page.locator('[data-skill-export]').click();expect(await downloadedText(await wait)).toContain('SKILL_BODY_TEST');
});
test('the agent updates persisted to-do steps and a missing reference cannot send a request',async({page})=>{
  const reply='```aiway-tool\n'+JSON.stringify({name:'todo_list',items:[{id:'a',content:'افحص الملفات',status:'completed'},{id:'b',content:'تحقق من التعديل',status:'in_progress'}]})+'\n```\nالخطة محدثة';
  const requests=await boot(page,reply);await hub(page);await ask(page,'خطط للمهمة');await expect(page.locator('#hubTodoList')).toContainText('افحص الملفات');await expect(page.locator('#hubTodoProgress')).toHaveText('1 / 2 مهمة مكتملة');
  await page.locator('[data-todo-status="b"]').selectOption('completed');await expect(page.locator('#hubTodoProgress')).toHaveText('2 / 2 مهمة مكتملة');await page.reload();await hub(page);await expect(page.locator('#hubTodoProgress')).toHaveText('2 / 2 مهمة مكتملة');
  const count=requests.length;await page.locator('#prompt').fill('اقرأ @missing.js');await page.locator('#sendBtn').click();await expect(page.locator('#toast')).toContainText('مرجع غير موجود');expect(requests.length).toBe(count);await expect(page.locator('#prompt')).toHaveValue('اقرأ @missing.js');
});
test('cross-session search finds answer text and opens the matching project',async({page})=>{
  await boot(page,count=>count===1?'حل HYDRATION_MARKER_OLD في React':'الرد الثاني');await ask(page,'مشروع أول');const oldTitle=await page.locator('#chatTitle').textContent();await page.locator('#newChat').click();await ask(page,'مشروع ثان');await hub(page);await section(page,'البحث في المحادثات');await page.locator('#hubSessionQuery').fill('HYDRATION_MARKER_OLD');await expect(page.locator('.hub-search-result')).toHaveCount(1);await page.locator('.hub-search-result').click();await expect(page.locator('#chatTitle')).toHaveText(oldTitle);await expect(page.locator('#messages')).toContainText('HYDRATION_MARKER_OLD');
});
test('fallback is opt-in, uses the selected provider once and leaves the primary selected',async({page})=>{
  await boot(page);let primary=0,backup=0;await page.route('https://primary.ai/v1/chat/completions',route=>{primary++;return route.fulfill({status:503,body:'unavailable'})});await page.route('https://backup.ai/v1/chat/completions',route=>{backup++;return route.fulfill({contentType:'text/event-stream',body:stream('BACKUP_RESULT')})});
  await hub(page);await section(page,'المزود الاحتياطي');await page.locator('#hubFallback').selectOption('backup');await ask(page,'اختبر التحويل');await expect(page.locator('.message.assistant')).toContainText('BACKUP_RESULT');await expect(page.locator('.message.assistant .msg-head')).toContainText('Backup test');expect(primary).toBe(1);expect(backup).toBe(1);expect(await page.evaluate(()=>localStorage.getItem('aiway.active'))).toBe('main');
});
test('a partial reply is preserved and never replayed through a backup',async({page})=>{
  await boot(page);let backup=0;await page.route('https://primary.ai/v1/chat/completions',route=>route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content:'PARTIAL_REPLY'}}]})+'\n\ndata: '+JSON.stringify({error:{message:'503: stream failure'}})+'\n\n'}));await page.route('https://backup.ai/**',route=>{backup++;return route.fulfill({body:''})});
  await hub(page);await section(page,'المزود الاحتياطي');await page.locator('#hubFallback').selectOption('backup');await ask(page,'رد جزئي');await expect(page.locator('.message.assistant')).toContainText('PARTIAL_REPLY');await expect(page.locator('.message.assistant')).toContainText('stream failure');expect(backup).toBe(0);
});
test('conversation export downloads redacted JSON and readable Markdown without stored credentials',async({page})=>{
  await boot(page,'EXPORTED_REPLY');await page.evaluate(()=>sessionStorage.setItem('aiway.key.main','sk-stored12345678901234567890'));await ask(page,'افحص sk-pasted12345678901234567890');await hub(page);await section(page,'تصدير المحادثة');
  const first=page.waitForEvent('download');await page.locator('#hubExportJSON').click();const json=await downloadedText(await first),record=JSON.parse(json);expect(record.format).toBe('aiway-session');expect(record.messages).toHaveLength(2);expect(json).toContain('REDACTED');expect(json).not.toContain('sk-stored');expect(json).not.toContain('sk-pasted');
  const second=page.waitForEvent('download');await page.locator('#hubExportMD').click();expect(await downloadedText(await second)).toContain('EXPORTED_REPLY');
});
test('reply speech and skill drafting use the selected message without saving a draft automatically',async({page})=>{
  await page.addInitScript(()=>{window.__voice={spoken:[],stops:0};window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){window.__voice.stops++},getVoices(){return [{lang:'ar-EG',name:'test'}]},speak(item){window.__voice.spoken.push({text:item.text,lang:item.lang,rate:item.rate})}}})});
  await boot(page,'ANSWER_FOR_VOICE_AND_SKILL');await ask(page,'اشرح خطوة');await page.locator('[data-speak-message]').click();expect(await page.evaluate(()=>window.__voice.spoken[0].text)).toBe('ANSWER_FOR_VOICE_AND_SKILL');
  await page.locator('[data-skill-from-message]').click();await expect(page.locator('#hubSkillMarkdown')).toHaveValue(/ANSWER_FOR_VOICE_AND_SKILL/);await expect(page.locator('[data-skill-enable]')).toHaveCount(0);await page.locator('#hubSkillForm button').first().click();await expect(page.locator('[data-skill-enable]')).toHaveCount(1);await expect(page.locator('[data-skill-enable]')).not.toBeChecked();
  await section(page,'قراءة الردود');await page.locator('#hubStopVoice').click();await expect(page.locator('#hubVoiceStatus')).toHaveText('تم إيقاف الصوت');
});

test('Codex native plans update the current project and late plans cannot leak into another project',async({page})=>{
  let channel;await page.route('**/api/session',route=>route.fulfill({status:204}));
  await page.routeWebSocket('**/api/ws',socket=>{channel=socket;socket.onMessage(raw=>{const m=JSON.parse(String(raw));let result={};
    if(m.method==='account/read')result={account:{type:'chatgpt',email:'mock-plan@example.com',planType:'plus'}};
    if(m.method==='model/list')result={data:[]};if(m.method==='thread/start')result={thread:{id:'thread-plan'}};
    if(m.method==='turn/start'){result={turn:{id:'turn-plan'}};setTimeout(()=>{socket.send(JSON.stringify({method:'turn/plan/updated',params:{threadId:'thread-plan',turnId:'turn-plan',plan:[{step:'قراءة الملفات',status:'completed'},{step:'فحص النتيجة',status:'inProgress'}]}}));socket.send(JSON.stringify({method:'item/agentMessage/delta',params:{turnId:'turn-plan',delta:'الخطة جاهزة'}}));socket.send(JSON.stringify({method:'turn/completed',params:{turn:{id:'turn-plan',status:'completed'}}}))},50)}
    if(m.method==='aiway/workspace/pull')result={files:{}};if(m.id!=null)socket.send(JSON.stringify({id:m.id,result}));
  })});
  await page.goto('/');await page.locator('#headerSettings').click();await expect(page.locator('#codexEmail')).toHaveText('mock-plan@example.com');await page.locator('#closeSettings').click();await hub(page);await ask(page,'خطط للفحص');await expect(page.locator('#hubTodoList')).toContainText('قراءة الملفات');await expect(page.locator('#hubTodoProgress')).toHaveText('1 / 2 مهمة مكتملة');
  await page.locator('#newChat').click();channel.send(JSON.stringify({method:'turn/plan/updated',params:{threadId:'thread-plan',turnId:'turn-plan',plan:[{step:'OLD_PLAN_SHOULD_NOT_LEAK',status:'pending'}]}}));await hub(page);await expect(page.locator('#hubTodoList')).not.toContainText('OLD_PLAN_SHOULD_NOT_LEAK');await expect(page.locator('#hubTodoProgress')).toHaveText('0 / 0 مهمة مكتملة');
});
