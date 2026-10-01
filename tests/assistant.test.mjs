import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readSettings,putMemory,parseSkill,skillMarkdown,contextFiles,assistantContext,expandReferences,normalizeTodos,normalizeAssistantState,searchSessions,sessionExport} from '../src/assistant-data.js';
import {canFallback,runWithFallback} from '../src/fallback.js';

test('memory survives serialization, obeys project scopes and can be disabled',()=>{
  let settings=defaults();settings.memories=putMemory(settings,{title:'GLOBAL',text:'global-note'});settings.memories=putMemory(settings,{title:'PRIVATE',text:'project-note',scope:'project',projectId:'a'});
  settings=readSettings({getItem:()=>JSON.stringify(settings)});
  assert.match(assistantContext(settings,{id:'a'},{}),/global-note[\s\S]*project-note/);
  assert.doesNotMatch(assistantContext(settings,{id:'b'},{}),/project-note/);
  settings.memories[0].enabled=false;assert.doesNotMatch(assistantContext(settings,{id:'b'},{}),/global-note/);
  assert.throws(()=>putMemory(settings,{title:'x',text:'y'.repeat(2001)}));
});
test('SKILL.md roundtrips and malformed or oversized instructions are rejected',()=>{
  const skill=parseSkill('---\nname: ui-review\ndescription: "Arabic واجهة"\n---\n\nCheck keyboard access.');
  assert.deepEqual(parseSkill(skillMarkdown(skill)),skill);
  assert.throws(()=>parseSkill('---\nname: invalid name\n---\nDo work'));assert.throws(()=>parseSkill('x'.repeat(16001)));
  const settings=defaults();settings.skills=[{id:'s',...skill}];assert.match(assistantContext(settings,{assistant:{skills:['s']}},{}),/Check keyboard access/);assert.doesNotMatch(assistantContext(settings,{assistant:{skills:[]}},{}),/Check keyboard access/);
});
test('context files are discovered by exact names and honor the project-context switch',()=>{
  const files={'AGENTS.md':'ROOT_GUIDE','src/.hermes.md':'SUB_GUIDE','.env':'secret','AGENTS.md.js':'not instructions','SOUL.md':'PERSONA'};
  assert.deepEqual(contextFiles(files),['AGENTS.md','SOUL.md','src/.hermes.md']);
  const text=assistantContext(defaults(),{},files);assert.match(text,/ROOT_GUIDE/);assert.doesNotMatch(text,/secret/);assert.doesNotMatch(assistantContext(defaults(),{},files,{allowFiles:false}),/ROOT_GUIDE/);
});
test('explicit references resolve files, spaced paths, folders and staged differences',()=>{
  const files={'src/a.js':'one','src/my file.js':'two','other.js':'unrelated'};
  const value=expandReferences('راجع @src/ و @{src/my file.js} و @diff',files,{...files,'src/a.js':'changed'});
  assert.deepEqual(value.paths,['src/a.js','src/my file.js']);assert.match(value.context,/changed/);assert.doesNotMatch(value.context,/unrelated/);assert.throws(()=>expandReferences('@missing.js',files),/غير موجود/);
  assert.equal(expandReferences('user@example.com',files).context,'');
});
test('custom persona and validated to-do states enter the request context',()=>{
  const settings=defaults();settings.customPersona='MY_PERSONA';const todos=normalizeTodos([{id:'one',content:'check',status:'in_progress'}]);assert.match(assistantContext(settings,{assistant:{profile:'custom',todos}},{}),/MY_PERSONA[\s\S]*in_progress: check/);
  assert.throws(()=>normalizeTodos([{id:'one',content:'a'},{id:'one',content:'b'}]));assert.throws(()=>normalizeTodos([{content:'a',status:'fake_success'}]));
});
test('session recall searches message bodies with all query terms and preserves project identity',()=>{
  const projects=[{id:'one',title:'Website',updated:1,messages:[{id:'m',role:'assistant',text:'Resolved hydration warning in React'}]},{id:'two',title:'Other',updated:2,messages:[{text:'Only React'}]}];
  assert.deepEqual(searchSessions(projects,'React hydration').map(r=>r.projectId),['one']);assert.equal(searchSessions(projects,'').length,0);assert.match(searchSessions(projects,'hydration')[0].snippet,/hydration/);
});
test('conversation exports whitelist fields and redact common token patterns',()=>{
  const secret='sk-test12345678901234567890',chat={title:'Export',created:1,github:{token:'hidden'},providerKey:'hidden',assistant:{profile:'teacher',todos:[]},messages:[{role:'user',text:'token '+secret,context:'private reference',attachments:[{data:'private-binary'}],files:[{name:'a.js'}]}]};
  const json=sessionExport(chat);assert.match(json,/REDACTED/);for(const value of ['hidden',secret,'private reference','private-binary'])assert(!json.includes(value));assert.match(sessionExport(chat,{format:'md'}),/## المستخدم/);assert(sessionExport(chat,{redact:false}).includes(secret));
});
test('fallback uses the chosen backup only once for a temporary pre-response error',async()=>{
  const primary={id:'a',type:'compatible',model:'m'},backup={id:'b',type:'compatible',model:'m'},calls=[];let announced=0;
  const result=await runWithFallback({primary,backup,output:{text:'',reason:''},run:async p=>{calls.push(p.id);if(p.id==='a')throw Error('503: unavailable');return 'reply'},onFallback:()=>announced++});
  assert.equal(result,'reply');assert.deepEqual(calls,['a','b']);assert.equal(announced,1);
});
test('fallback cannot duplicate partial replies, tool effects, cancellations or native backend operations',async()=>{
  assert.equal(canFallback(Error('503: down'),{text:'partial'}),false);assert.equal(canFallback(Error('503: down'),{toolEvents:['file edited']}),false);assert.equal(canFallback(Error('401: invalid key'),{}),false);assert.equal(canFallback(Object.assign(Error(),{name:'AbortError'}),{}),false);
  let count=0;await assert.rejects(runWithFallback({primary:{id:'a',type:'codex'},backup:{id:'b',type:'compatible',model:'m'},output:{},run:async()=>{count++;throw Error('503: down')}}));assert.equal(count,1);
});
test('corrupt saved settings recover without executable or invalid list entries',()=>{
  assert.deepEqual(readSettings({getItem:()=>'{bad'}),defaults());const result=readSettings({getItem:()=>JSON.stringify({version:1,memories:[null,{}],skills:[null],voiceRate:99})});assert.equal(result.memories.length,0);assert.equal(result.skills.length,0);assert.equal(result.voiceRate,1);
});
test('restored project state preserves plans and persona without arbitrary credential fields',()=>{
  const value=normalizeAssistantState({profile:'reviewer',skills:['s','s'],todos:[{content:'restore me',status:'completed'}],apiKey:'should not be copied'});
  assert.equal(value.profile,'reviewer');assert.deepEqual(value.skills,['s']);assert.equal(value.todos[0].content,'restore me');assert(!Object.hasOwn(value,'apiKey'));assert.equal(normalizeAssistantState().profile,'developer');
});
