import ReactDependency from 'react';const require=name=>{if(name==='react')return ReactDependency;throw Error('Unsupported package '+name)};
var p=Object.create;var n=Object.defineProperty;var v=Object.getOwnPropertyDescriptor;var k=Object.getOwnPropertyNames;var T=Object.getPrototypeOf,_=Object.prototype.hasOwnProperty;var x=(t,r)=>()=>{try{return r||t((r={exports:{}}).exports,r),r.exports}catch(e){throw r=0,e}};var a=(t,r,e,o)=>{if(r&&typeof r=="object"||typeof r=="function")for(let s of k(r))!_.call(t,s)&&s!==e&&n(t,s,{get:()=>r[s],enumerable:!(o=v(r,s))||o.enumerable});return t};var f=(t,r,e)=>(e=t!=null?p(T(t)):{},a(r||!t||!t.__esModule?n(e,"default",{value:t,enumerable:!0}):e,t));var d=x(l=>{"use strict";var m=Symbol.for("react.transitional.element"),A=Symbol.for("react.fragment");function E(t,r,e){var o=null;if(e!==void 0&&(o=""+e),r.key!==void 0&&(o=""+r.key),"key"in r){e={};for(var s in r)s!=="key"&&(e[s]=r[s])}else e=r;return r=e.ref,{$$typeof:m,type:t,key:o,ref:r!==void 0?r:null,props:e}}l.Fragment=A;l.jsx=E;l.jsxs=E});var j=x((R,i)=>{"use strict";i.exports=d()});var u=f(j()),{Fragment:c,jsx:q,jsxs:C}=u.default,M=u.default;export{c as Fragment,M as default,q as jsx,C as jsxs};
/*! Bundled license information:

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
