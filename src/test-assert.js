function fail(message='Assertion failed'){throw Error(message)}
function deep(a,b){if(Object.is(a,b))return true;if(typeof a!=='object'||typeof b!=='object'||!a||!b||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;if(a instanceof Date)return a.getTime()===b.getTime();if(a instanceof RegExp)return a.source===b.source&&a.flags===b.flags;if(Array.isArray(a)&&a.length!==b.length)return false;if(!Array.isArray(a)&&Object.getPrototypeOf(a)!==Object.prototype&&Object.getPrototypeOf(a)!==null)throw Error('نوع مقارنة غير مدعوم في اختبار المتصفح');const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&deep(a[k],b[k]))}
function matches(error,expected){return !expected||expected instanceof RegExp?(!expected||expected.test(String(error.message||error))):typeof expected==='function'?error instanceof expected:false}
function assert(value,message){if(!value)fail(message)}
export const ok=assert;
export function strictEqual(a,b,message){if(!Object.is(a,b))fail(message||'Expected '+String(a)+' to equal '+String(b))}
export function notStrictEqual(a,b,message){if(Object.is(a,b))fail(message||'Values must differ')}
export function deepStrictEqual(a,b,message){if(!deep(a,b))fail(message||'Objects are not deeply equal')}
export function notDeepStrictEqual(a,b,message){if(deep(a,b))fail(message||'Objects must differ')}
export function throws(fn,expected,message){let caught;try{fn()}catch(error){caught=error}if(!caught||!matches(caught,expected))fail(message||'Expected matching exception')}
export async function rejects(fn,expected,message){let caught;try{await(typeof fn==='function'?fn():fn)}catch(error){caught=error}if(!caught||!matches(caught,expected))fail(message||'Expected matching rejection')}
export function doesNotThrow(fn){fn()}
export async function doesNotReject(fn){await(typeof fn==='function'?fn():fn)}
export function match(value,pattern,message){if(!pattern.test(String(value)))fail(message||'Pattern did not match')}
export function notMatch(value,pattern,message){if(pattern.test(String(value)))fail(message||'Pattern unexpectedly matched')}
Object.assign(assert,{ok,strictEqual,equal:strictEqual,notStrictEqual,notEqual:notStrictEqual,deepStrictEqual,deepEqual:deepStrictEqual,notDeepStrictEqual,throws,rejects,doesNotThrow,doesNotReject,match,notMatch,fail});
assert.strict=assert;export {assert as strict,fail};export default assert;
