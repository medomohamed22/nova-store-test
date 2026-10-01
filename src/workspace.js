export function safePath(value) {
  const path = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || /[\x00-\x1f<>:"|?*]/.test(path) || path.split('/').some(p => !p || p === '..' || p === '.') || ['__proto__','constructor','prototype'].includes(path)) throw Error('مسار ملف غير صالح');
  return path;
}
export function changedFiles(base = {}, next = {}) {
  return [...new Set([...Object.keys(base), ...Object.keys(next)])].filter(path => Object.hasOwn(base,path) !== Object.hasOwn(next,path) || base[path] !== next[path]);
}
export function githubChanges(base, next) {
  return changedFiles(base,next).map(path => ({ path: safePath(path), kind: !Object.hasOwn(next,path) ? 'delete' : !Object.hasOwn(base,path) ? 'add' : 'modify', content: next[path] }));
}
export function applyReviewed(base, current, proposed, names = changedFiles(base,proposed)) {
  const next = {...current};
  for (const path of names) {
    if (Object.hasOwn(base,path) !== Object.hasOwn(current,path) || base[path] !== current[path]) throw Error('تعارض مع تعديل يدوي: '+path+' — ارفض التعديل وأعد الطلب');
    if (Object.hasOwn(proposed,path)) next[path] = proposed[path]; else delete next[path];
  }
  return next;
}
export function applyFileTool(files, call) {
  const args = call.arguments || call, path = safePath(args.path), next = {...files};
  switch (call.name) {
    case 'create_file': if(Object.hasOwn(next,path)) throw Error('الملف موجود: '+path); next[path]=String(args.content??''); break;
    case 'write_file': next[path]=String(args.content??''); break;
    case 'edit_file': {
      if(!Object.hasOwn(next,path)) throw Error('الملف غير موجود: '+path);
      const old = String(args.old_text??'');
      if(!old || !next[path].includes(old)) throw Error('النص المطلوب تعديله غير موجود: '+path);
      next[path]=next[path].replace(old,String(args.new_text??'')); break;
    }
    case 'delete_file': if(!Object.hasOwn(next,path)) throw Error('الملف غير موجود: '+path); delete next[path]; break;
    default: throw Error('أداة غير معروفة');
  }
  return {next,path};
}
