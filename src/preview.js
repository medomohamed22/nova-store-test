import * as esbuild from 'esbuild-wasm';
let initialized;
const vendors=new Map();
function init(){return initialized ||= esbuild.initialize({wasmURL:'/assets/esbuild.wasm',worker:false})}
export {init as initializeBuilder};
export function resolvePath(from,request) {
  const parts=(request.startsWith('/')?request.slice(1):(from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'')+request).split('/'),out=[];
  for(const part of parts){if(part==='..')out.pop();else if(part&&part!=='.')out.push(part)}return out.join('/');
}
function lookup(files,path){return [path,path+'.js',path+'.jsx',path+'.ts',path+'.tsx',path+'.json',path+'/index.js',path+'/index.jsx',path+'/index.tsx'].find(p=>Object.hasOwn(files,p))}
async function vendor(path){if(!vendors.has(path)){const r=await fetch('/assets/vendor/'+path+'.js');if(!r.ok)throw Error('تعذر تحميل React');vendors.set(path,await r.text())}return vendors.get(path)}
async function bundle(files,entry,module) {
  await init();
  const result=await esbuild.build({entryPoints:[entry],bundle:true,write:false,outdir:'/out',format:module?'esm':'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'workspace',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(/^https?:/.test(args.path))return {path:args.path,external:true};
      if(['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime'].includes(args.path))return {path:args.path,namespace:'vendor'};
      if(args.kind==='entry-point')return {path:args.path,namespace:'workspace'};
      if(!args.path.startsWith('.')&&!args.path.startsWith('/'))return {errors:[{text:'المعاينة لا تدعم الحزمة '+args.path+' بعد. الحزم المتاحة: React وReact DOM.'}]};
      const path=lookup(files,resolvePath(args.importer,args.path));
      return path?{path,namespace:'workspace'}:{errors:[{text:'ملف غير موجود: '+args.path+' من '+args.importer}]};
    });
    build.onLoad({filter:/.*/,namespace:'workspace'},args=>({contents:files[args.path],loader:({js:'jsx',mjs:'js',jsx:'jsx',ts:'ts',tsx:'tsx',css:'css',json:'json',svg:'dataurl'})[args.path.split('.').pop()]||'text',resolveDir:'/'}));
    build.onLoad({filter:/.*/,namespace:'vendor'},async args=>({contents:await vendor(args.path.replaceAll('/','-')),loader:'js',resolveDir:'/'}));
  }}]});
  return {js:result.outputFiles.find(f=>f.path.endsWith('.js'))?.text||'',css:result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||''};
}
export async function buildPreview(files) {
  const urls=[],makeURL=(text,type)=>{const url=URL.createObjectURL(new Blob([text],{type}));urls.push(url);return url};
  try {
    const entry=Object.hasOwn(files,'index.html')?'index.html':Object.keys(files).find(p=>p.endsWith('/index.html'))||Object.keys(files).find(p=>p.endsWith('.html'));
    const doc=new DOMParser().parseFromString(entry?files[entry]:'<html><body><div id="root"></div></body></html>','text/html');
    // Keep document order and script types; compile only referenced entries.
    for(const link of doc.querySelectorAll('link[rel="stylesheet"]')){
      const request=link.getAttribute('href');if(!request||/^https?:|^\/\//.test(request))continue;
      const path=resolvePath(entry||'index.html',request.split('?')[0]);
      if(!Object.hasOwn(files,path))throw Error('CSS غير موجود: '+path);
      const result=await bundle(files,path,false);
      const style=doc.createElement('style');style.textContent=result.css;link.replaceWith(style);
    }
    let scripts=[...doc.querySelectorAll('script[src]')];
    if(!entry){const main=['src/main.tsx','src/main.jsx','src/index.tsx','src/index.jsx','main.jsx','App.jsx'].find(p=>Object.hasOwn(files,p));if(!main)throw Error('أنشئ index.html أو src/main.jsx لتشغيل المعاينة');const s=doc.createElement('script');s.type='module';s.setAttribute('src',main);doc.body.append(s);scripts=[s]}
    for(const script of scripts){
      const request=script.getAttribute('src');if(/^https?:|^\/\//.test(request))continue;
      const path=resolvePath(entry||'index.html',request.split('?')[0]),found=lookup(files,path);
      if(!found)throw Error('JavaScript غير موجود: '+path);
      const result=await bundle(files,found,script.type==='module');
      // Sandboxed documents have an opaque origin. Data URLs work for both
      // classic and module scripts without granting parent-origin access.
      const bytes=new TextEncoder().encode(result.js);let binary='';
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      script.src='data:text/javascript;base64,'+btoa(binary);
      if(result.css){const style=doc.createElement('style');style.textContent=result.css;doc.head.append(style)}
    }
    for(const image of doc.querySelectorAll('img[src]')){const path=resolvePath(entry||'index.html',image.getAttribute('src'));if(path.endsWith('.svg')&&Object.hasOwn(files,path))image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(files[path])}
    const bridge=doc.createElement('script');bridge.textContent=`addEventListener('error',e=>parent.postMessage({type:'aiway-preview-error',message:e.message,line:e.lineno},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({type:'aiway-preview-error',message:String(e.reason?.message||e.reason)},'*'));`;
    doc.head.prepend(bridge);
    return {html:'<!doctype html>'+doc.documentElement.outerHTML,dispose(){urls.forEach(URL.revokeObjectURL)}};
  }catch(error){urls.forEach(URL.revokeObjectURL);throw error}
}
