import test from 'node:test';
import assert from 'node:assert/strict';
import {githubChanges,applyReviewed,applyFileTool,safePath} from '../src/workspace.js';
import {allowedOrigin,sessionId} from '../server/security.js';

test('partial GitHub import only publishes changed tracked files',()=>{
  const base={'index.html':'before','src/app.js':'unchanged'},next={'index.html':'after','src/app.js':'unchanged'};
  assert.deepEqual(githubChanges(base,next),[{path:'index.html',kind:'modify',content:'after'}]);
  assert(!githubChanges(base,next).some(c=>c.path==='public/photo.png'));
});
test('explicit deletion and empty file creation are included',()=>{
  assert.deepEqual(githubChanges({'old.js':'x'},{'empty.js':''}).map(c=>[c.path,c.kind]),[['old.js','delete'],['empty.js','add']]);
});
test('AI tools build a proposal without mutating project files',()=>{
  const files={'app.js':'const x=1'};const result=applyFileTool(files,{name:'edit_file',path:'app.js',old_text:'1',new_text:'2'});
  assert.equal(files['app.js'],'const x=1');assert.equal(result.next['app.js'],'const x=2');
});
test('review preserves unrelated manual work and rejects conflicts',()=>{
  const base={'a.js':'old'},proposal={'a.js':'new'};
  assert.deepEqual(applyReviewed(base,{...base,'manual.js':'keep'},proposal),{'a.js':'new','manual.js':'keep'});
  assert.throws(()=>applyReviewed(base,{'a.js':'manual'},proposal),/تعارض/);
});
test('safe paths accept nested and dot files but reject traversal and prototype keys',()=>{
  assert.equal(safePath('src/components/App.tsx'),'src/components/App.tsx');assert.equal(safePath('.gitignore'),'.gitignore');
  for(const path of ['../secret','/etc/passwd','C:\\secret','src/../key','__proto__','src//app.js'])assert.throws(()=>safePath(path));
});
test('WebSocket origin and session parsing deny forged origins and malformed cookies',()=>{
  assert.equal(allowedOrigin({headers:{origin:'https://aiway.test',host:'aiway.test'}}),true);
  assert.equal(allowedOrigin({headers:{origin:'https://evil.test',host:'aiway.test'}}),false);
  assert.equal(allowedOrigin({headers:{host:'aiway.test'}}),false);
  assert.equal(sessionId({headers:{cookie:'aiway_sid='+'a'.repeat(43)}}),'a'.repeat(43));
  assert.equal(sessionId({headers:{cookie:'aiway_sid=%ZZ'}}),null);
});

