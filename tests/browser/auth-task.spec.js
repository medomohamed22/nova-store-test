import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
async function project(page,files){const zip=new JSZip();for(const [p,c] of Object.entries(files))zip.file(p,c);await page.locator('#projectInput').setInputFiles({name:'test.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});await expect(page.locator('#editingName')).not.toHaveText('لا يوجد ملف محدد')}
async function connect(page,{loginError=false,delay=0}={}){
  let initialized=0,account=null,loginSocket,loginAttempts=0;
  await page.route('**/api/session',async route=>{if(delay)await new Promise(resolve=>setTimeout(resolve,delay));await route.fulfill({status:204})});
  await page.routeWebSocket('**/api/ws',socket=>{
    loginSocket=socket;
    socket.onMessage(raw=>{const message=JSON.parse(String(raw));
      if(message.method==='initialize'){initialized++;socket.send(JSON.stringify({id:message.id,result:{}}))}
      else if(message.method==='account/read')socket.send(JSON.stringify({id:message.id,result:{account}}));
      else if(message.method==='account/login/start'){loginAttempts++;socket.send(JSON.stringify({id:message.id,result:{loginId:'login-1',type:'chatgptDeviceCode',verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-1234'}}));if(loginError)setTimeout(()=>socket.send(JSON.stringify({method:'account/login/completed',params:{loginId:'login-1',success:false,error:'Device code authentication is disabled'}})),100)}
      else if(message.method==='account/login/cancel')socket.send(JSON.stringify({id:message.id,result:{}}));
      else if(message.method==='account/rateLimits/read')socket.send(JSON.stringify({id:message.id,result:{}}));
      else if(message.method==='model/list')socket.send(JSON.stringify({id:message.id,result:{data:[{model:'mock-model',isDefault:true}]}}));
    });
  });
  await page.route('https://auth.openai.com/**',route=>route.fulfill({body:'OpenAI login mock'}));
  return {get initialized(){return initialized},get loginAttempts(){return loginAttempts},approve({notification=true}={}){account={type:'chatgpt',email:'test@example.com',planType:'plus'};if(notification)loginSocket.send(JSON.stringify({method:'account/login/completed',params:{loginId:'login-1',success:true,error:null}}))}};
}
test('login remains responsive, supports cancel and recovers a missed completion event',async({page})=>{
  const mock=await connect(page);await page.goto('/');await page.locator('#headerSettings').click();await expect(page.locator('#codexStatus')).toContainText('متصل');
  await page.locator('#codexLogin').click();await expect(page.locator('#codexUserCode')).toHaveText('TEST-1234');await expect(page.locator('#codexLogin')).toBeDisabled();await page.locator('#settingsTitle').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/login.png',fullPage:true,animations:'disabled'});await page.locator('#codexCancelLogin').click();await expect(page.locator('#codexLogin')).toBeEnabled();await expect(page.locator('#codexDevice')).not.toBeVisible();
  await page.locator('#codexLogin').click();await expect(page.locator('#codexDevice')).toBeVisible();mock.approve({notification:false});await expect(page.locator('#codexEmail')).toHaveText('test@example.com',{timeout:10000});await expect(page.locator('#codexLoginProgress')).toContainText('تم ربط');expect(mock.loginAttempts).toBe(2);
});
test('disabled device authentication reports a concrete error and clears busy state',async({page})=>{
  await connect(page,{loginError:true});await page.goto('/');await page.locator('#headerSettings').click();await expect(page.locator('#codexStatus')).toContainText('متصل');await page.locator('#codexLogin').click();await expect(page.locator('#codexError')).toContainText('disabled');await expect(page.locator('#codexLogin')).toBeEnabled();
});
test('automatic connection and a fast login click share one handshake',async({page})=>{
  const mock=await connect(page,{delay:1500});await page.goto('/');await page.locator('#headerSettings').click();await page.locator('#codexLogin').click();await expect(page.locator('#codexDevice')).toBeVisible({timeout:10000});expect(mock.initialized).toBe(1);
});
test('workspace tests execute code, show real failures and retain the project for review',async({page})=>{
  await page.route('**/api/session',route=>route.fulfill({status:503}));await page.goto('/');await page.locator('#workspaceToggle').click();
  await project(page,{'src/math.js':'export const add=(a,b)=>a+b;','src/math.test.js':'import test from "node:test";import assert from "node:assert/strict";import {add} from "./math.js";test("adds two values",()=>assert.equal(add(2,3),5));test("intentional failure",()=>assert.equal(add(1,2),99));'});
  await page.locator('[data-tab="task"]').click();
  // A task is created on the first verification request from the review toolbar.
  await page.locator('[data-tab="diff"]').click();await page.locator('#runReviewTests').click();await expect(page.locator('#taskContent')).toContainText('1 نجح · 1 فشل',{timeout:15000});await expect(page.locator('.test-result.failed')).toContainText('intentional failure');
  await expect(page.locator('.test-result.failed')).toContainText('Expected 3 to equal 99');await expect(page.locator('.test-result.failed')).not.toContainText('base64,');
  await page.screenshot({path:'test-results/task.png',fullPage:true,animations:'disabled'});
  await page.locator('[data-tab="files"]').click();await expect(page.locator('#fileList')).toContainText('src/math.js');
});
test('task templates and English navigation preserve code direction',async({page})=>{
  await page.route('**/api/session',route=>route.fulfill({status:503}));await page.goto('/');await expect(page.locator('[data-task-template]')).toHaveCount(3);await page.locator('[data-task-template="add-test"]').click();await expect(page.locator('#prompt')).toHaveValue(/node:test/);await page.locator('#languageToggle').click();await expect(page.locator('html')).toHaveAttribute('dir','ltr');await expect(page.locator('[data-tab="task"]')).toHaveText('Task');await page.locator('#workspaceToggle').click();await expect(page.locator('#editorHost')).toHaveCSS('direction','ltr');
});

test('AI verification executes proposed files while the original stays unchanged',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('aiway.providers',JSON.stringify([{id:'mock',name:'Mock provider',type:'compatible',url:'https://mock.ai/v1',model:'mock-model'}]));localStorage.setItem('aiway.active','mock')});
  await page.route('**/api/session',route=>route.fulfill({status:503}));
  await page.route('https://mock.ai/v1/chat/completions',route=>{
    const content='```aiway-tool\n'+JSON.stringify({name:'write_file',path:'math.js',content:'export const add=(a,b)=>a+b;'})+'\n```\n```aiway-tool\n'+JSON.stringify({name:'run_tests'})+'\n```\nالتعديل جاهز للمراجعة';
    return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\ndata: [DONE]\n\n'});
  });
  await page.goto('/');await page.locator('#workspaceToggle').click();await project(page,{'math.js':'export const add=(a,b)=>a-b;','math.test.js':'import test from "node:test";import assert from "node:assert/strict";import {add} from "./math.js";test("adds",()=>assert.equal(add(2,3),5));'});
  await page.locator('#prompt').fill('أصلح الجمع وتحقق منه');await page.locator('#sendBtn').click();await expect(page.locator('#taskContent')).toContainText('1 نجح · 0 فشل',{timeout:15000});
  await page.locator('[data-tab="files"]').click();await page.locator('[data-file="math.js"]').first().click();await expect(page.locator('.cm-content')).toContainText('a-b');
  await page.locator('[data-tab="diff"]').click();await page.locator('#rejectAllDiff').click();await page.locator('#runReviewTests').click();await expect(page.locator('#taskContent')).toContainText('0 نجح · 1 فشل',{timeout:15000});
});

test('a runaway test is stopped while the app remains responsive',async({page})=>{
  await page.route('**/api/session',route=>route.fulfill({status:503}));await page.goto('/');await page.locator('#workspaceToggle').click();await project(page,{'loop.test.js':'import test from "node:test";test("loop",()=>{while(true){}});'});
  await page.locator('[data-tab="diff"]').click();await page.locator('#runReviewTests').click();await expect(page.locator('#taskContent')).toContainText('جارٍ تشغيل');await page.locator('#languageToggle').click();await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('#taskContent')).toContainText('أُوقِف عامل التنفيذ',{timeout:15000});
});

test('project tests cannot access the app DOM, storage or network',async({page})=>{
  let networkRequests=0;await page.route('https://worker-network.test/**',route=>{networkRequests++;return route.fulfill({body:'unexpected'})});
  await page.route('**/api/session',route=>route.fulfill({status:503}));await page.goto('/');await page.locator('#workspaceToggle').click();
  await project(page,{'isolation.test.js':'import test from "node:test";import assert from "node:assert/strict";test("isolated",async()=>{assert.equal(typeof document,"undefined");assert.equal(typeof localStorage,"undefined");await assert.rejects(()=>fetch("https://worker-network.test/credentials"));});'});
  await page.locator('[data-tab="diff"]').click();await page.locator('#runReviewTests').click();await expect(page.locator('#taskContent')).toContainText('1 نجح · 0 فشل',{timeout:15000});expect(networkRequests).toBe(0);
});
