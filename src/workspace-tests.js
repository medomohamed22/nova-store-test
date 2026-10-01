import * as esbuild from 'esbuild-wasm';
import harnessSource from './test-harness.js?raw';
import assertSource from './test-assert.js?raw';
import {initializeBuilder,resolvePath} from './preview.js';
export async function runWorkspaceTests(files,{timeoutMs=10000}={}){
  const tests=Object.keys(files).filter(path=>/\.(test|spec)\.[cm]?[jt]sx?$|(?:^|\/)tests?\/[^/]+\.[jt]s$/.test(path)).sort();
  if(!tests.length)return {status:'no-tests',summary:'لا توجد ملفات .test.js أو .spec.js. أضف اختبارًا باستخدام node:test وnode:assert/strict.',results:[]};
  await initializeBuilder();
  const synthetic='__aiway_test_entry__.js',virtual={...files,[synthetic]:'import {run} from "aiway:runner";'+tests.map(p=>'import '+JSON.stringify('./'+p)+';').join('')+'run().catch(e=>postMessage({type:"fatal",error:String(e.stack||e)}));'};
  const built=await esbuild.build({entryPoints:[synthetic],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',plugins:[{name:'test-workspace',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(['node:test','aiway:runner'].includes(args.path))return {path:'test',namespace:'harness'};
      if(['node:assert','node:assert/strict'].includes(args.path))return {path:'assert',namespace:'harness'};
      if(args.kind==='entry-point')return {path:args.path,namespace:'files'};
      if(!args.path.startsWith('.')&&!args.path.startsWith('/'))return {errors:[{text:'اختبارات المتصفح لا تدعم الحزمة '+args.path+'. استخدم node:test وnode:assert/strict ووحدات المشروع.'}]};
      const path=resolvePath(args.importer,args.path),found=[path,path+'.js',path+'.ts',path+'/index.js'].find(p=>Object.hasOwn(virtual,p));
      return found?{path:found,namespace:'files'}:{errors:[{text:'ملف اختبار غير موجود: '+path}]};
    });
    build.onLoad({filter:/.*/,namespace:'harness'},args=>({contents:args.path==='test'?harnessSource:assertSource,loader:'js'}));
    build.onLoad({filter:/.*/,namespace:'files'},args=>({contents:virtual[args.path],loader:args.path.endsWith('.ts')?'ts':'js'}));
  }}]});
  const code=built.outputFiles[0].text,bytes=new TextEncoder().encode(code);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const workerURL='data:text/javascript;base64,'+btoa(binary),nonce=crypto.randomUUID(),frame=document.createElement('iframe');frame.hidden=true;frame.sandbox='allow-scripts';
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',message);frame.remove()};
    const message=event=>{if(event.source!==frame.contentWindow||event.data?.nonce!==nonce)return;const data=event.data.payload;if(data.type==='fatal'){cleanup();reject(Error(data.error));return}if(data.type!=='result')return;cleanup();const passed=data.results.filter(r=>r.status==='passed').length,failed=data.results.filter(r=>r.status==='failed').length,skipped=data.results.filter(r=>r.status==='skipped').length;resolve({status:failed?'failed':passed?'passed':'no-tests',summary:passed+' نجح · '+failed+' فشل · '+skipped+' متخطى',results:data.results,time:Date.now()})};
    const timer=setTimeout(()=>{cleanup();reject(Error('تجاوز الاختبار مهلة '+timeoutMs/1000+' ثوانٍ؛ أُوقِف عامل التنفيذ.'))},timeoutMs);
    window.addEventListener('message',message);
    frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;unsafe-inline&#39; data:; worker-src data:; connect-src &#39;none&#39;"><script>const nonce='+JSON.stringify(nonce)+';try{const worker=new Worker('+JSON.stringify(workerURL)+');worker.onmessage=e=>parent.postMessage({nonce,payload:e.data},"*");worker.onerror=e=>parent.postMessage({nonce,payload:{type:"fatal",error:e.message}},"*")}catch(e){parent.postMessage({nonce,payload:{type:"fatal",error:e.message}},"*")}</script>';
    document.body.append(frame);
  });
}
