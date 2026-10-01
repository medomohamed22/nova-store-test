const supported=p=>['compatible','openrouter','gemini'].includes(p?.type);
export function canFallback(error,output,signal){
  if(signal?.aborted||error?.name==='AbortError'||output.text||output.reason||output.toolEvents?.length)return false;
  const status=Number(error?.status||String(error?.message||'').match(/^(\d{3}):/)?.[1]);
  return error instanceof TypeError||status===408||status===429||(status>=500&&status<=599);
}
export async function runWithFallback({primary,backup,run,output,signal,onFallback=()=>{}}){
  try{return await run(primary)}catch(error){
    if(!supported(primary)||!supported(backup)||backup.id===primary.id||!backup.model||!canFallback(error,output,signal))throw error;
    onFallback(primary,backup,error);return await run(backup);
  }
}
