import JSZip from 'jszip';
import {safePath} from './workspace.js';
export async function exportZip(files) {
  const zip=new JSZip();
  for(const [path,content] of Object.entries(files))zip.file(safePath(path),content);
  return zip.generateAsync({type:'blob',compression:'DEFLATE'});
}
export async function importZip(file) {
  const zip=await JSZip.loadAsync(file), files=Object.create(null); let bytes=0;
  for(const entry of Object.values(zip.files)) {
    if(entry.dir)continue;
    if(entry.unsafeOriginalName&&entry.unsafeOriginalName!==entry.name)throw Error('ZIP يحتوي مسار غير آمن');
    const path=safePath(entry.name);
    if(/(^|\/)(node_modules|\.git)\//.test(path))continue;
    if(Object.keys(files).length>=200)throw Error('الحد الأقصى 200 ملف');
    if(entry._data?.uncompressedSize>2*1024*1024)throw Error('ملف أكبر من 2MB: '+path);
    const data=await entry.async('uint8array'); bytes+=data.length;
    if(data.length>2*1024*1024||bytes>12*1024*1024)throw Error('المشروع أكبر من الحد المسموح');
    if(data.includes(0))throw Error('الاستيراد يدعم ملفات النص وSVG؛ ملف ثنائي: '+path);
    files[path]=new TextDecoder('utf-8',{fatal:true}).decode(data);
  }
  return files;
}
