import {build} from 'esbuild';
import {mkdir,copyFile,cp,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
await mkdir('assets/vendor',{recursive:true});
await build({entryPoints:['src/app.js'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'assets/app.js',sourcemap:true,plugins:[{name:'raw-source',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}}]});
await build({entryPoints:['src/styles.css'],bundle:true,minify:true,outfile:'assets/app.css'});
await copyFile('node_modules/esbuild-wasm/esbuild.wasm','assets/esbuild.wasm');
for(const entry of ['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']){
  const plugins=entry==='react'?[]:[{name:'shared-react',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',external:true}))}}];
  const names=Object.keys(require(entry)).filter(name=>/^[A-Za-z_$][\w$]*$/.test(name)&&name!=='default'&&name!=='__esModule');
  await build({stdin:{contents:`import module from '${entry}';export const {${names.join(',')}}=module;export default module;`,resolveDir:process.cwd(),sourcefile:'vendor.js'},bundle:true,minify:true,format:'esm',platform:'browser',plugins,banner:entry==='react'?{}:{js:`import ReactDependency from 'react';const require=name=>{if(name==='react')return ReactDependency;throw Error('Unsupported package '+name)};`},define:{'process.env.NODE_ENV':'"production"'},outfile:'assets/vendor/'+entry.replaceAll('/','-')+'.js'});
}
await mkdir('public',{recursive:true});
await copyFile('index.html','public/index.html');
await cp('assets','public/assets',{recursive:true});
console.log('Built editor, preview engine, React vendors and public/ deployment output.');
