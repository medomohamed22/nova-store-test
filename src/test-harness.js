// This source is bundled into an isolated worker, never evaluated in AiWay's
// authenticated page. It supports the documented subset of node:test/assert.
const cases=[],root={name:'',before:[],after:[]};let scopes=[root];
export function test(name,options,fn){
  if(typeof options==='function'){fn=options;options={}}
  options ||= {};
  for(const key of Object.keys(options))if(key!=='skip')throw Error('خيار اختبار غير مدعوم في المتصفح: '+key);
  cases.push({name:scopes.map(s=>s.name).filter(Boolean).concat(String(name)).join(' / '),fn,skip:Boolean(options.skip),scopes:[...scopes]});
}
test.skip=(name,fn)=>test(name,{skip:true},fn);test.only=()=>{throw Error('test.only غير مدعوم في مشغّل اختبارات المتصفح')};
export const it=test;
export function describe(name,fn){const previous=scopes;scopes=[...scopes,{name:String(name),before:[],after:[]}];try{if(fn()?.then)throw Error('describe غير المتزامن غير مدعوم في المتصفح')}finally{scopes=previous}}
export function beforeEach(fn){scopes.at(-1).before.push(fn)}
export function afterEach(fn){scopes.at(-1).after.push(fn)}
export async function run(){
  const results=[];
  for(const entry of cases){
    if(entry.skip){results.push({name:entry.name,status:'skipped'});continue}
    const started=Date.now();let error;
    try{for(const scope of entry.scopes)for(const hook of scope.before)await hook();await entry.fn({name:entry.name})}catch(e){error=e}
    finally{for(const scope of [...entry.scopes].reverse())for(const hook of scope.after){try{await hook()}catch(e){error ||= e}}}
    results.push({name:entry.name,status:error?'failed':'passed',error:error?String(error.stack||error).replace(/data:(?:text|application)\/javascript[^\s)]+/g,'[workspace test]').slice(0,3000):'',durationMs:Date.now()-started});
  }
  postMessage({type:'result',results});
}
export default test;
