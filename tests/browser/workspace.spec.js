import {test,expect} from '@playwright/test';
import JSZip from 'jszip';

async function boot(page){
  // No account, provider key or remote repository is used in browser checks.
  await page.route('**/api/session',route=>route.fulfill({status:503,body:'Test mode'}));
  await page.goto('/');await expect(page.locator('#chatTitle')).toBeVisible();
  await page.locator('#workspaceToggle').click();
}
async function loadProject(page,files){
  const zip=new JSZip();for(const [path,content] of Object.entries(files))zip.file(path,content);
  await page.locator('#projectInput').setInputFiles({name:'project.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await expect(page.locator('#editingName')).not.toHaveText('لا يوجد ملف محدد');
}
test('editor, dark mode, ZIP roundtrip and project recovery',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  await loadProject(page,{'index.html':'<h1>Hello AiWay</h1>','src/app.js':'const answer = 42;'});
  await expect(page.locator('.cm-lineNumbers')).toBeVisible();
  await expect(page.locator('.folder-heading').filter({hasText:'src'})).toBeVisible();
  await page.locator('#themeToggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('[data-file="src/app.js"]').first().click();
  await page.locator('.cm-content').click();await page.keyboard.press('Control+End');await page.keyboard.type('\nconsole.log(answer);');
  await expect(page.locator('#saveStatus')).toHaveText('محفوظ محليًا');
  const downloaded=page.waitForEvent('download');await page.locator('#exportProject').click();const download=await downloaded;
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const zip=await JSZip.loadAsync(Buffer.concat(chunks));
  expect(await zip.file('src/app.js').async('string')).toContain('console.log(answer)');
  await page.reload();await page.locator('#workspaceToggle').click();await expect(page.locator('#editingName')).toHaveText('src/app.js');await expect(page.locator('.cm-content')).toContainText('console.log(answer)');expect(errors).toEqual([]);
});
test('multi-file scripts preserve execution order and React TSX compiles',async({page})=>{
  await boot(page);
  await loadProject(page,{'index.html':'<div id="out"></div><script src="first.js"></script><script src="second.js"></script>','first.js':'window.answer = 42;','second.js':'document.getElementById("out").textContent="Answer "+window.answer;','unused.js':'throw Error("must not execute")'});
  await page.locator('[data-tab="preview"]').click();await expect(page.frameLocator('#previewFrame').locator('#out')).toHaveText('Answer 42',{timeout:30000});
  await page.locator('[data-tab="files"]').click();
  await loadProject(page,{'index.html':'<div id="root"></div><script type="module" src="src/main.tsx"></script>','src/main.tsx':'import React from "react";import {createRoot} from "react-dom/client";import {App} from "./App";createRoot(document.getElementById("root")!).render(<App/>);','src/App.tsx':'export function App(){const title:string="React works";return <h1>{title}</h1>}'});
  await page.locator('[data-tab="preview"]').click();await expect(page.frameLocator('#previewFrame').locator('h1')).toHaveText('React works',{timeout:30000});
  await page.locator('#previewSize').selectOption('390px');await expect(page.locator('#previewFrame')).toHaveCSS('width','390px');
});
test('partial GitHub import never deletes unimported files',async({page})=>{
  let treePayload,patchPayload;
  await page.route('https://api.github.com/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    let body;
    if(request.method()==='GET'&&path.includes('/git/ref/'))body={object:{sha:'head-sha'}};
    else if(request.method()==='GET'&&path.includes('/git/commits/'))body={tree:{sha:'base-tree'}};
    else if(request.method()==='GET'&&path.includes('/git/trees/'))body={tree:[{path:'index.html',mode:'100644',type:'blob',size:20,sha:'html-blob'},{path:'photo.png',mode:'100644',type:'blob',size:200,sha:'image-blob'}]};
    else if(request.method()==='GET'&&path.includes('/git/blobs/'))body={encoding:'base64',content:Buffer.from('<h1>old</h1>').toString('base64')};
    else if(request.method()==='POST'&&path.endsWith('/git/blobs'))body={sha:'new-blob'};
    else if(request.method()==='POST'&&path.endsWith('/git/trees')){treePayload=request.postDataJSON();body={sha:'new-tree'}}
    else if(request.method()==='POST'&&path.endsWith('/git/commits'))body={sha:'new-commit'};
    else if(request.method()==='PATCH'){patchPayload=request.postDataJSON();body={object:{sha:'new-commit'}}}
    else throw Error('Unexpected GitHub call: '+path);
    await route.fulfill({json:body});
  });
  await boot(page);await page.locator('[data-tab="github"]').click();await page.locator('#githubRepo').fill('owner/repo');await page.locator('#githubToken').fill('mock-token');await page.locator('#githubLoad').click();await expect(page.locator('#githubStatus')).toContainText('تم تحميل 1');
  await page.locator('[data-tab="files"]').click();await page.locator('.cm-content').click();await page.keyboard.press('Control+A');await page.keyboard.type('<h1>new</h1>');
  await page.locator('[data-tab="github"]').click();await page.locator('#githubPush').click();await expect(page.locator('#githubReviewModal')).toBeVisible();await expect(page.locator('#githubReviewList')).not.toContainText('photo.png');await page.locator('#githubReviewConfirm').click();await expect(page.locator('#githubStatus')).toContainText('تم رفع');
  expect(treePayload.base_tree).toBe('base-tree');expect(treePayload.tree).toHaveLength(1);expect(treePayload.tree[0].path).toBe('index.html');expect(patchPayload.force).toBe(false);
});
test('mobile layout stays within viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await boot(page);await loadProject(page,{'index.html':'<h1>Mobile</h1>'});
  await expect(page.locator('.cm-editor')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile.png',fullPage:true,animations:'disabled'});
});
test('AI proposals stay pending through reload and only apply after acceptance',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('aiway.providers',JSON.stringify([{id:'mock',name:'Mock provider',type:'compatible',url:'https://mock.ai/v1',model:'mock-model'}]));localStorage.setItem('aiway.active','mock')});
  await page.route('https://mock.ai/v1/chat/completions',route=>{
    const content='```aiway-tool\n'+JSON.stringify({name:'write_file',path:'index.html',content:'<h1>AI proposal</h1>'})+'\n```\nالتعديل جاهز للمراجعة';
    return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\ndata: [DONE]\n\n'});
  });
  await boot(page);await loadProject(page,{'index.html':'<h1>Original</h1>'});await page.locator('#prompt').fill('عدّل الصفحة');await page.locator('#sendBtn').click();
  await expect(page.locator('#diffList')).toContainText('AI proposal');await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/);
  await page.locator('[data-tab="files"]').click();await expect(page.locator('.cm-content')).toContainText('Original');
  await page.reload();await page.locator('#workspaceToggle').click();await page.locator('[data-tab="diff"]').click();await expect(page.locator('#diffList')).toContainText('AI proposal');
  await page.locator('#rejectAllDiff').click();await page.locator('[data-tab="files"]').click();await expect(page.locator('.cm-content')).toContainText('Original');
  await page.locator('#prompt').fill('عدّل مرة أخرى');await page.locator('#sendBtn').click();await expect(page.locator('#diffList')).toContainText('AI proposal');await expect(page.locator('#sendBtn')).not.toHaveClass(/stop/);await page.locator('#acceptAllDiff').click();await page.locator('[data-tab="files"]').click();await expect(page.locator('.cm-content')).toContainText('AI proposal');
});
test('backup restores independent projects without provider credentials',async({page})=>{
  await boot(page);await loadProject(page,{'index.html':'<h1>Backup test</h1>'});
  await page.locator('#assistantHubButton').click();await page.locator('#hubTodoText').fill('BACKUP_PLAN_STEP');await page.locator('#hubTodoForm button').click();
  const downloaded=page.waitForEvent('download');await page.locator('#backupExport').click();const download=await downloaded,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const buffer=Buffer.concat(chunks),backup=JSON.parse(buffer.toString());
  expect(backup.format).toBe('aiway-backup');expect(backup.projects[0].files['index.html']).toContain('Backup test');expect(backup.providers).toBeUndefined();
  await page.locator('#backupInput').setInputFiles({name:'backup.json',mimeType:'application/json',buffer});await expect(page.locator('#history')).toContainText('مستعاد');
  await page.locator('.history-item').filter({hasText:'مستعاد'}).click();await page.locator('#assistantHubButton').click();await expect(page.locator('#hubTodoList')).toContainText('BACKUP_PLAN_STEP');
});
test('split editor and preview, dark layout and keyboard resize',async({page})=>{
  await page.setViewportSize({width:1600,height:1000});await boot(page);await loadProject(page,{'index.html':'<html><head><link rel="stylesheet" href="style.css"></head><body><h1>AiWay Preview</h1><p>Build, review and restore.</p></body></html>','style.css':'body{background:#101b2c;color:#e7f0ff;font-family:system-ui;padding:40px}h1{color:#79a9ff}'});
  const before=await page.locator('#workspace').evaluate(el=>el.getBoundingClientRect().width);await page.locator('#workspaceResize').focus();await page.keyboard.press('ArrowRight');expect(await page.locator('#workspace').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(before);
  await page.locator('#themeToggle').click();await page.locator('#splitPreview').click();await expect(page.locator('#filesTab')).toBeVisible();await expect(page.locator('#previewTab')).toBeVisible();await expect(page.frameLocator('#previewFrame').locator('h1')).toHaveText('AiWay Preview');await expect(page.frameLocator('#previewFrame').locator('h1')).toBeVisible();
  await page.screenshot({path:'test-results/desktop.png',fullPage:true,animations:'disabled'});
  await page.locator('[data-tab="versions"]').click();await expect(page.locator('#versionsTab')).toBeVisible();await expect(page.locator('#previewTab')).not.toBeVisible();
});
test('Codex reconnects automatically after a dropped socket',async({page})=>{
  let connections=0;
  await page.route('**/api/session',route=>route.fulfill({status:204}));
  await page.routeWebSocket('**/api/ws',socket=>{
    connections++;
    socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.method==='initialize'){socket.send(JSON.stringify({id:m.id,result:{}}));if(connections===1)setTimeout(()=>socket.close({code:1012,reason:'renew'}),300)}else if(m.method==='account/read')socket.send(JSON.stringify({id:m.id,result:{account:null}}))});
  });
  await page.goto('/');await expect.poll(()=>connections,{timeout:10000}).toBeGreaterThanOrEqual(2);await page.locator('#headerSettings').click();await expect(page.locator('#codexStatus')).toContainText('متصل');
});
test('deleting the current project does not recreate its files',async({page})=>{
  await boot(page);await loadProject(page,{'index.html':'<h1>delete-me</h1>'});await expect(page.locator('#saveStatus')).toHaveText('محفوظ محليًا');
  page.on('dialog',dialog=>dialog.accept());await page.locator('[data-delete]').first().click();await expect(page.locator('#editingName')).toHaveText('لا يوجد ملف محدد');
  await page.reload();await page.locator('#workspaceToggle').click();await expect(page.locator('#fileList')).not.toContainText('index.html');
});
