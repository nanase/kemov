import{d as N,ah as D,ai as L,r as c,o as h,c as g,w as l,h as a,b as k,g as w,F as U,f as P,j as b,k as B,O as F}from"./kemov-runtime-dom.esm-bundler-XfsTaaA0.js";import{u as M}from"./kemov-main-UmdB_Eur.js";import{g as q}from"./kemov-axios--MCeKlca.js";const te=N({__name:"NavigationDrawer",props:D({channels:null,activeChannelId:null},{opened:{type:Boolean}}),emits:["update:opened"],setup(e){const t=L(e,"opened");return(s,i)=>{const o=c("v-icon"),n=c("v-list-item"),r=c("v-img"),R=c("v-avatar"),p=c("v-progress-circular"),u=c("v-list"),T=c("v-divider"),m=c("v-navigation-drawer");return h(),g(m,{class:"bg-background",modelValue:t.value,"onUpdate:modelValue":i[0]||(i[0]=_=>t.value=_),floating:""},{default:l(()=>[a(u,{class:"pb-0 d-flex flex-column fill-height"},{default:l(()=>[a(n,{link:"",title:"リアルタイム統計",href:"/kemov/stats/"},{prepend:l(()=>[a(o,{icon:"mdi-finance",size:"large"})]),_:1}),a(u,{nav:"",link:"","active-class":"bg-primary",density:"compact",class:"flex-grow-1 flex-shrink-1 overflow-auto"},{default:l(()=>{var _;return[(h(!0),k(U,null,w(e.channels,d=>(h(),g(n,{key:d.id,title:d.name,subtitle:d.globalname,href:`/kemov/stats/detail/#/${d.id}`,active:e.activeChannelId===d.id},{prepend:l(()=>[a(R,{color:d.color.key,variant:"outlined",size:"small"},{default:l(()=>[a(r,{src:d.thumbnails.default.url},null,8,["src"])]),_:2},1032,["color"])]),_:2},1032,["title","subtitle","href","active"]))),128)),((_=e.channels)==null?void 0:_.length)===0?(h(),g(n,{key:0,class:"pa-4 text-center"},{default:l(()=>[a(p,{color:"primary",indeterminate:""})]),_:1})):P("",!0)]}),_:1}),a(T),a(u,{density:"compact",link:"",nav:"",class:"flex-grow-0 flex-shrink-0"},{default:l(()=>[a(n,{title:"ジェネット楽曲一覧",href:"/kemov/genet/music/","prepend-icon":"mdi-music"},{prepend:l(()=>[a(o,{icon:"mdi-music",size:"small"})]),_:1})]),_:1})]),_:1})]),_:1},8,["modelValue"])}}}),E="vuetify-color-scheme",ne=N({__name:"ThemeToggleButton",setup(e){const t=M();function s(){return window.matchMedia?window.matchMedia("(prefers-color-scheme: light)").matches?"light":window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"unspecified":"unspecified"}function i(){t.global.current.value.dark?(s()==="light"?localStorage.removeItem(E):localStorage.setItem(E,"light"),t.global.name.value="light"):(s()==="dark"?localStorage.removeItem(E):localStorage.setItem(E,"dark"),t.global.name.value="dark")}function o(n){const r=localStorage.getItem(E);r===null?t.global.name.value=n.matches?"dark":"light":(r==="dark"&&n.matches||r==="light"&&!n.matches)&&localStorage.removeItem(E)}return b(()=>{window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",o);const n=localStorage.getItem(E);n==="light"?t.global.name.value="light":n==="dark"||s()==="dark"?t.global.name.value="dark":t.global.name.value="light"}),B(()=>{window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change",o)}),(n,r)=>{const R=c("v-btn"),p=c("v-tooltip");return h(),g(p,{text:"テーマを切り替え"},{activator:l(({props:u})=>[a(R,F(u,{icon:"mdi-theme-light-dark",onClick:i}),null,16)]),_:1})}}});function oe(e){return e==null?"":e.toString().replace(/\B(?=(\d{3})+(?!\d))/g,",")}const se="https://nanase.cc/asset/kemov/channels.json",re="https://s3.ap-northeast-1.amazonaws.com/nanase.asset/kemov/stats.json",x="https://s3.ap-northeast-1.amazonaws.com/nanase.asset/kemov/stats/video/";function ae(e){return`${x}${e}.json`}const H=new Set(["ENOTFOUND","ENETUNREACH","UNABLE_TO_GET_ISSUER_CERT","UNABLE_TO_GET_CRL","UNABLE_TO_DECRYPT_CERT_SIGNATURE","UNABLE_TO_DECRYPT_CRL_SIGNATURE","UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY","CERT_SIGNATURE_FAILURE","CRL_SIGNATURE_FAILURE","CERT_NOT_YET_VALID","CERT_HAS_EXPIRED","CRL_NOT_YET_VALID","CRL_HAS_EXPIRED","ERROR_IN_CERT_NOT_BEFORE_FIELD","ERROR_IN_CERT_NOT_AFTER_FIELD","ERROR_IN_CRL_LAST_UPDATE_FIELD","ERROR_IN_CRL_NEXT_UPDATE_FIELD","OUT_OF_MEM","DEPTH_ZERO_SELF_SIGNED_CERT","SELF_SIGNED_CERT_IN_CHAIN","UNABLE_TO_GET_ISSUER_CERT_LOCALLY","UNABLE_TO_VERIFY_LEAF_SIGNATURE","CERT_CHAIN_TOO_LONG","CERT_REVOKED","INVALID_CA","PATH_LENGTH_EXCEEDED","INVALID_PURPOSE","CERT_UNTRUSTED","CERT_REJECTED","HOSTNAME_MISMATCH"]);var G=e=>!H.has(e&&e.code);const V=q(G),I="axios-retry";function A(e){const t=["ERR_CANCELED","ECONNABORTED"];return e.response||!e.code||t.includes(e.code)?!1:V(e)}const S=["get","head","options"],j=S.concat(["put","delete"]);function v(e){return e.code!=="ECONNABORTED"&&(!e.response||e.response.status>=500&&e.response.status<=599)}function Y(e){var t;return(t=e.config)!=null&&t.method?v(e)&&S.indexOf(e.config.method)!==-1:!1}function O(e){var t;return(t=e.config)!=null&&t.method?v(e)&&j.indexOf(e.config.method)!==-1:!1}function y(e){return A(e)||O(e)}function z(){return 0}function X(e=0,t=void 0,s=100){const i=2**e*s,o=i*.2*Math.random();return i+o}const $={retries:3,retryCondition:y,retryDelay:z,shouldResetTimeout:!1,onRetry:()=>{}};function K(e,t){return{...$,...t,...e[I]}}function C(e,t){const s=K(e,t||{});return s.retryCount=s.retryCount||0,s.lastRequestTime=s.lastRequestTime||Date.now(),e[I]=s,s}function J(e,t){e.defaults.agent===t.agent&&delete t.agent,e.defaults.httpAgent===t.httpAgent&&delete t.httpAgent,e.defaults.httpsAgent===t.httpsAgent&&delete t.httpsAgent}async function Z(e,t){const{retries:s,retryCondition:i}=e,o=(e.retryCount||0)<s&&i(t);if(typeof o=="object")try{return await o!==!1}catch{return!1}return o}const f=(e,t)=>{const s=e.interceptors.request.use(o=>(C(o,t),o)),i=e.interceptors.response.use(null,async o=>{const{config:n}=o;if(!n)return Promise.reject(o);const r=C(n,t);if(await Z(r,o)){r.retryCount+=1;const{retryDelay:R,shouldResetTimeout:p,onRetry:u}=r,T=R(r.retryCount,o);if(J(e,n),!p&&n.timeout&&r.lastRequestTime){const m=Date.now()-r.lastRequestTime,_=n.timeout-m-T;if(_<=0)return Promise.reject(o);n.timeout=_}return n.transformRequest=[m=>m],await u(r.retryCount,o,n),new Promise(m=>{setTimeout(()=>m(e(n)),T)})}return Promise.reject(o)});return{requestInterceptorId:s,responseInterceptorId:i}};f.isNetworkError=A;f.isSafeRequestError=Y;f.isIdempotentRequestError=O;f.isNetworkOrIdempotentRequestError=y;f.exponentialDelay=X;f.isRetryableError=v;export{te as _,f as a,ne as b,se as c,re as s,ae as v,oe as w};
