import ReactDependency from 'react';const require=name=>{if(name==='react')return ReactDependency;throw Error('Unsupported package '+name)};
var d=Object.create;var u=Object.defineProperty;var x=Object.getOwnPropertyDescriptor;var E=Object.getOwnPropertyNames;var l=Object.getPrototypeOf,f=Object.prototype.hasOwnProperty;var c=(r,e)=>()=>{try{return e||r((e={exports:{}}).exports,e),e.exports}catch(t){throw e=0,t}};var j=(r,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of E(e))!f.call(r,o)&&o!==t&&u(r,o,{get:()=>e[o],enumerable:!(i=x(e,o))||i.enumerable});return r};var v=(r,e,t)=>(t=r!=null?d(l(r)):{},j(e||!r||!r.__esModule?u(t,"default",{value:r,enumerable:!0}):t,r));var n=c(s=>{"use strict";var g=Symbol.for("react.fragment");s.Fragment=g;s.jsxDEV=void 0});var a=c((N,p)=>{"use strict";p.exports=n()});var m=v(a()),{Fragment:T,jsxDEV:V}=m.default,_=m.default;export{T as Fragment,_ as default,V as jsxDEV};
/*! Bundled license information:

react/cjs/react-jsx-dev-runtime.production.js:
  (**
   * @license React
   * react-jsx-dev-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
