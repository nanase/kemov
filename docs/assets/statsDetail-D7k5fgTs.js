const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/kemov-DetailView-Bg56CW1x.js","assets/kemov-StatsAppBase.vue_vue_type_script_setup_true_lang-CpG836Ar.js","assets/kemov-_plugin-vue_export-helper-BfvHD29s.js","assets/kemov-axios-CRW72lKU.js","assets/StatsAppBase-kVrpqJ3-.css","assets/kemov-youtube-BrzX_C6r.js","assets/DetailView-774QANZS.css"])))=>i.map(i=>d[i]);
import{s as at,u as F,v as lt,x as ut,d as Ge,y as ft,z as Y,k as T,A as De,B as le,j as ht,l as dt,_ as pt,i as _e,o as mt,c as gt,w as vt,g as yt,q as Et}from"./kemov-_plugin-vue_export-helper-BfvHD29s.js";import{c as te,a as Rt,b as wt,d as Pt}from"./kemov-main--jwohN0k.js";const St="modulepreload",kt=function(e){return"/kemov/"+e},be={},_t=function(t,n,r){let o=Promise.resolve();if(n&&n.length>0){document.getElementsByTagName("link");const l=document.querySelector("meta[property=csp-nonce]"),m=(l==null?void 0:l.nonce)||(l==null?void 0:l.getAttribute("nonce"));o=Promise.allSettled(n.map(c=>{if(c=kt(c),c in be)return;be[c]=!0;const h=c.endsWith(".css"),d=h?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${c}"]${d}`))return;const i=document.createElement("link");if(i.rel=h?"stylesheet":St,h||(i.as="script"),i.crossOrigin="",i.href=c,m&&i.setAttribute("nonce",m),document.head.appendChild(i),h)return new Promise((u,f)=>{i.addEventListener("load",u),i.addEventListener("error",()=>f(new Error(`Unable to preload CSS for ${c}`)))})}))}function a(l){const m=new Event("vite:preloadError",{cancelable:!0});if(m.payload=l,window.dispatchEvent(m),!m.defaultPrevented)throw l}return o.then(l=>{for(const m of l||[])m.status==="rejected"&&a(m.reason);return t().catch(a)})};/*!
  * vue-router v4.4.5
  * (c) 2024 Eduardo San Martin Morote
  * @license MIT
  */const V=typeof document<"u";function Ke(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function bt(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Ke(e.default)}const P=Object.assign;function ue(e,t){const n={};for(const r in t){const o=t[r];n[r]=M(o)?o.map(e):e(o)}return n}const W=()=>{},M=Array.isArray,Fe=/#/g,Ct=/&/g,At=/\//g,Ot=/=/g,xt=/\?/g,We=/\+/g,It=/%5B/g,Lt=/%5D/g,Qe=/%5E/g,Mt=/%60/g,Ye=/%7B/g,Tt=/%7C/g,Xe=/%7D/g,$t=/%20/g;function ge(e){return encodeURI(""+e).replace(Tt,"|").replace(It,"[").replace(Lt,"]")}function Nt(e){return ge(e).replace(Ye,"{").replace(Xe,"}").replace(Qe,"^")}function de(e){return ge(e).replace(We,"%2B").replace($t,"+").replace(Fe,"%23").replace(Ct,"%26").replace(Mt,"`").replace(Ye,"{").replace(Xe,"}").replace(Qe,"^")}function Bt(e){return de(e).replace(Ot,"%3D")}function jt(e){return ge(e).replace(Fe,"%23").replace(xt,"%3F")}function Ht(e){return e==null?"":jt(e).replace(At,"%2F")}function X(e){try{return decodeURIComponent(""+e)}catch{}return""+e}const qt=/\/$/,Vt=e=>e.replace(qt,"");function fe(e,t,n="/"){let r,o={},a="",l="";const m=t.indexOf("#");let c=t.indexOf("?");return m<c&&m>=0&&(c=-1),c>-1&&(r=t.slice(0,c),a=t.slice(c+1,m>-1?m:t.length),o=e(a)),m>-1&&(r=r||t.slice(0,m),l=t.slice(m,t.length)),r=Dt(r??t,n),{fullPath:r+(a&&"?")+a+l,path:r,query:o,hash:X(l)}}function zt(e,t){const n=t.query?e(t.query):"";return t.path+(n&&"?")+n+(t.hash||"")}function Ce(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Ut(e,t,n){const r=t.matched.length-1,o=n.matched.length-1;return r>-1&&r===o&&z(t.matched[r],n.matched[o])&&Ze(t.params,n.params)&&e(t.query)===e(n.query)&&t.hash===n.hash}function z(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Ze(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(const n in e)if(!Gt(e[n],t[n]))return!1;return!0}function Gt(e,t){return M(e)?Ae(e,t):M(t)?Ae(t,e):e===t}function Ae(e,t){return M(t)?e.length===t.length&&e.every((n,r)=>n===t[r]):e.length===1&&e[0]===t}function Dt(e,t){if(e.startsWith("/"))return e;if(!e)return t;const n=t.split("/"),r=e.split("/"),o=r[r.length-1];(o===".."||o===".")&&r.push("");let a=n.length-1,l,m;for(l=0;l<r.length;l++)if(m=r[l],m!==".")if(m==="..")a>1&&a--;else break;return n.slice(0,a).join("/")+"/"+r.slice(l).join("/")}const B={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};var Z;(function(e){e.pop="pop",e.push="push"})(Z||(Z={}));var Q;(function(e){e.back="back",e.forward="forward",e.unknown=""})(Q||(Q={}));function Kt(e){if(!e)if(V){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Vt(e)}const Ft=/^[^#]+#/;function Wt(e,t){return e.replace(Ft,"#")+t}function Qt(e,t){const n=document.documentElement.getBoundingClientRect(),r=e.getBoundingClientRect();return{behavior:t.behavior,left:r.left-n.left-(t.left||0),top:r.top-n.top-(t.top||0)}}const ne=()=>({left:window.scrollX,top:window.scrollY});function Yt(e){let t;if("el"in e){const n=e.el,r=typeof n=="string"&&n.startsWith("#"),o=typeof n=="string"?r?document.getElementById(n.slice(1)):document.querySelector(n):n;if(!o)return;t=Qt(o,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Oe(e,t){return(history.state?history.state.position-t:-1)+e}const pe=new Map;function Xt(e,t){pe.set(e,t)}function Zt(e){const t=pe.get(e);return pe.delete(e),t}let Jt=()=>location.protocol+"//"+location.host;function Je(e,t){const{pathname:n,search:r,hash:o}=t,a=e.indexOf("#");if(a>-1){let m=o.includes(e.slice(a))?e.slice(a).length:1,c=o.slice(m);return c[0]!=="/"&&(c="/"+c),Ce(c,"")}return Ce(n,e)+r+o}function en(e,t,n,r){let o=[],a=[],l=null;const m=({state:u})=>{const f=Je(e,location),w=n.value,S=t.value;let b=0;if(u){if(n.value=f,t.value=u,l&&l===w){l=null;return}b=S?u.position-S.position:0}else r(f);o.forEach(C=>{C(n.value,w,{delta:b,type:Z.pop,direction:b?b>0?Q.forward:Q.back:Q.unknown})})};function c(){l=n.value}function h(u){o.push(u);const f=()=>{const w=o.indexOf(u);w>-1&&o.splice(w,1)};return a.push(f),f}function d(){const{history:u}=window;u.state&&u.replaceState(P({},u.state,{scroll:ne()}),"")}function i(){for(const u of a)u();a=[],window.removeEventListener("popstate",m),window.removeEventListener("beforeunload",d)}return window.addEventListener("popstate",m),window.addEventListener("beforeunload",d,{passive:!0}),{pauseListeners:c,listen:h,destroy:i}}function xe(e,t,n,r=!1,o=!1){return{back:e,current:t,forward:n,replaced:r,position:window.history.length,scroll:o?ne():null}}function tn(e){const{history:t,location:n}=window,r={value:Je(e,n)},o={value:t.state};o.value||a(r.value,{back:null,current:r.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function a(c,h,d){const i=e.indexOf("#"),u=i>-1?(n.host&&document.querySelector("base")?e:e.slice(i))+c:Jt()+e+c;try{t[d?"replaceState":"pushState"](h,"",u),o.value=h}catch(f){console.error(f),n[d?"replace":"assign"](u)}}function l(c,h){const d=P({},t.state,xe(o.value.back,c,o.value.forward,!0),h,{position:o.value.position});a(c,d,!0),r.value=c}function m(c,h){const d=P({},o.value,t.state,{forward:c,scroll:ne()});a(d.current,d,!0);const i=P({},xe(r.value,c,null),{position:d.position+1},h);a(c,i,!1),r.value=c}return{location:r,state:o,push:m,replace:l}}function nn(e){e=Kt(e);const t=tn(e),n=en(e,t.state,t.location,t.replace);function r(a,l=!0){l||n.pauseListeners(),history.go(a)}const o=P({location:"",base:e,go:r,createHref:Wt.bind(null,e)},t,n);return Object.defineProperty(o,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(o,"state",{enumerable:!0,get:()=>t.state.value}),o}function rn(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),nn(e)}function on(e){return typeof e=="string"||e&&typeof e=="object"}function et(e){return typeof e=="string"||typeof e=="symbol"}const tt=Symbol("");var Ie;(function(e){e[e.aborted=4]="aborted",e[e.cancelled=8]="cancelled",e[e.duplicated=16]="duplicated"})(Ie||(Ie={}));function U(e,t){return P(new Error,{type:e,[tt]:!0},t)}function $(e,t){return e instanceof Error&&tt in e&&(t==null||!!(e.type&t))}const Le="[^/]+?",sn={sensitive:!1,strict:!1,start:!0,end:!0},cn=/[.+*?^${}()[\]/\\]/g;function an(e,t){const n=P({},sn,t),r=[];let o=n.start?"^":"";const a=[];for(const h of e){const d=h.length?[]:[90];n.strict&&!h.length&&(o+="/");for(let i=0;i<h.length;i++){const u=h[i];let f=40+(n.sensitive?.25:0);if(u.type===0)i||(o+="/"),o+=u.value.replace(cn,"\\$&"),f+=40;else if(u.type===1){const{value:w,repeatable:S,optional:b,regexp:C}=u;a.push({name:w,repeatable:S,optional:b});const R=C||Le;if(R!==Le){f+=10;try{new RegExp(`(${R})`)}catch(L){throw new Error(`Invalid custom RegExp for param "${w}" (${R}): `+L.message)}}let k=S?`((?:${R})(?:/(?:${R}))*)`:`(${R})`;i||(k=b&&h.length<2?`(?:/${k})`:"/"+k),b&&(k+="?"),o+=k,f+=20,b&&(f+=-8),S&&(f+=-20),R===".*"&&(f+=-50)}d.push(f)}r.push(d)}if(n.strict&&n.end){const h=r.length-1;r[h][r[h].length-1]+=.7000000000000001}n.strict||(o+="/?"),n.end?o+="$":n.strict&&(o+="(?:/|$)");const l=new RegExp(o,n.sensitive?"":"i");function m(h){const d=h.match(l),i={};if(!d)return null;for(let u=1;u<d.length;u++){const f=d[u]||"",w=a[u-1];i[w.name]=f&&w.repeatable?f.split("/"):f}return i}function c(h){let d="",i=!1;for(const u of e){(!i||!d.endsWith("/"))&&(d+="/"),i=!1;for(const f of u)if(f.type===0)d+=f.value;else if(f.type===1){const{value:w,repeatable:S,optional:b}=f,C=w in h?h[w]:"";if(M(C)&&!S)throw new Error(`Provided param "${w}" is an array but it is not repeatable (* or + modifiers)`);const R=M(C)?C.join("/"):C;if(!R)if(b)u.length<2&&(d.endsWith("/")?d=d.slice(0,-1):i=!0);else throw new Error(`Missing required param "${w}"`);d+=R}}return d||"/"}return{re:l,score:r,keys:a,parse:m,stringify:c}}function ln(e,t){let n=0;for(;n<e.length&&n<t.length;){const r=t[n]-e[n];if(r)return r;n++}return e.length<t.length?e.length===1&&e[0]===80?-1:1:e.length>t.length?t.length===1&&t[0]===80?1:-1:0}function nt(e,t){let n=0;const r=e.score,o=t.score;for(;n<r.length&&n<o.length;){const a=ln(r[n],o[n]);if(a)return a;n++}if(Math.abs(o.length-r.length)===1){if(Me(r))return 1;if(Me(o))return-1}return o.length-r.length}function Me(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const un={type:0,value:""},fn=/[a-zA-Z0-9_]/;function hn(e){if(!e)return[[]];if(e==="/")return[[un]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${n})/"${h}": ${f}`)}let n=0,r=n;const o=[];let a;function l(){a&&o.push(a),a=[]}let m=0,c,h="",d="";function i(){h&&(n===0?a.push({type:0,value:h}):n===1||n===2||n===3?(a.length>1&&(c==="*"||c==="+")&&t(`A repeatable param (${h}) must be alone in its segment. eg: '/:ids+.`),a.push({type:1,value:h,regexp:d,repeatable:c==="*"||c==="+",optional:c==="*"||c==="?"})):t("Invalid state to consume buffer"),h="")}function u(){h+=c}for(;m<e.length;){if(c=e[m++],c==="\\"&&n!==2){r=n,n=4;continue}switch(n){case 0:c==="/"?(h&&i(),l()):c===":"?(i(),n=1):u();break;case 4:u(),n=r;break;case 1:c==="("?n=2:fn.test(c)?u():(i(),n=0,c!=="*"&&c!=="?"&&c!=="+"&&m--);break;case 2:c===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+c:n=3:d+=c;break;case 3:i(),n=0,c!=="*"&&c!=="?"&&c!=="+"&&m--,d="";break;default:t("Unknown state");break}}return n===2&&t(`Unfinished custom RegExp for param "${h}"`),i(),l(),o}function dn(e,t,n){const r=an(hn(e.path),n),o=P(r,{record:e,parent:t,children:[],alias:[]});return t&&!o.record.aliasOf==!t.record.aliasOf&&t.children.push(o),o}function pn(e,t){const n=[],r=new Map;t=Be({strict:!1,end:!0,sensitive:!1},t);function o(i){return r.get(i)}function a(i,u,f){const w=!f,S=$e(i);S.aliasOf=f&&f.record;const b=Be(t,i),C=[S];if("alias"in i){const L=typeof i.alias=="string"?[i.alias]:i.alias;for(const H of L)C.push($e(P({},S,{components:f?f.record.components:S.components,path:H,aliasOf:f?f.record:S})))}let R,k;for(const L of C){const{path:H}=L;if(u&&H[0]!=="/"){const N=u.record.path,I=N[N.length-1]==="/"?"":"/";L.path=u.record.path+(H&&I+H)}if(R=dn(L,u,b),f?f.alias.push(R):(k=k||R,k!==R&&k.alias.push(R),w&&i.name&&!Ne(R)&&l(i.name)),rt(R)&&c(R),S.children){const N=S.children;for(let I=0;I<N.length;I++)a(N[I],R,f&&f.children[I])}f=f||R}return k?()=>{l(k)}:W}function l(i){if(et(i)){const u=r.get(i);u&&(r.delete(i),n.splice(n.indexOf(u),1),u.children.forEach(l),u.alias.forEach(l))}else{const u=n.indexOf(i);u>-1&&(n.splice(u,1),i.record.name&&r.delete(i.record.name),i.children.forEach(l),i.alias.forEach(l))}}function m(){return n}function c(i){const u=vn(i,n);n.splice(u,0,i),i.record.name&&!Ne(i)&&r.set(i.record.name,i)}function h(i,u){let f,w={},S,b;if("name"in i&&i.name){if(f=r.get(i.name),!f)throw U(1,{location:i});b=f.record.name,w=P(Te(u.params,f.keys.filter(k=>!k.optional).concat(f.parent?f.parent.keys.filter(k=>k.optional):[]).map(k=>k.name)),i.params&&Te(i.params,f.keys.map(k=>k.name))),S=f.stringify(w)}else if(i.path!=null)S=i.path,f=n.find(k=>k.re.test(S)),f&&(w=f.parse(S),b=f.record.name);else{if(f=u.name?r.get(u.name):n.find(k=>k.re.test(u.path)),!f)throw U(1,{location:i,currentLocation:u});b=f.record.name,w=P({},u.params,i.params),S=f.stringify(w)}const C=[];let R=f;for(;R;)C.unshift(R.record),R=R.parent;return{name:b,path:S,params:w,matched:C,meta:gn(C)}}e.forEach(i=>a(i));function d(){n.length=0,r.clear()}return{addRoute:a,resolve:h,removeRoute:l,clearRoutes:d,getRoutes:m,getRecordMatcher:o}}function Te(e,t){const n={};for(const r of t)r in e&&(n[r]=e[r]);return n}function $e(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:mn(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function mn(e){const t={},n=e.props||!1;if("component"in e)t.default=n;else for(const r in e.components)t[r]=typeof n=="object"?n[r]:n;return t}function Ne(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function gn(e){return e.reduce((t,n)=>P(t,n.meta),{})}function Be(e,t){const n={};for(const r in e)n[r]=r in t?t[r]:e[r];return n}function vn(e,t){let n=0,r=t.length;for(;n!==r;){const a=n+r>>1;nt(e,t[a])<0?r=a:n=a+1}const o=yn(e);return o&&(r=t.lastIndexOf(o,r-1)),r}function yn(e){let t=e;for(;t=t.parent;)if(rt(t)&&nt(e,t)===0)return t}function rt({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function En(e){const t={};if(e===""||e==="?")return t;const r=(e[0]==="?"?e.slice(1):e).split("&");for(let o=0;o<r.length;++o){const a=r[o].replace(We," "),l=a.indexOf("="),m=X(l<0?a:a.slice(0,l)),c=l<0?null:X(a.slice(l+1));if(m in t){let h=t[m];M(h)||(h=t[m]=[h]),h.push(c)}else t[m]=c}return t}function je(e){let t="";for(let n in e){const r=e[n];if(n=Bt(n),r==null){r!==void 0&&(t+=(t.length?"&":"")+n);continue}(M(r)?r.map(a=>a&&de(a)):[r&&de(r)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+n,a!=null&&(t+="="+a))})}return t}function Rn(e){const t={};for(const n in e){const r=e[n];r!==void 0&&(t[n]=M(r)?r.map(o=>o==null?null:""+o):r==null?r:""+r)}return t}const wn=Symbol(""),He=Symbol(""),ve=Symbol(""),ot=Symbol(""),me=Symbol("");function K(){let e=[];function t(r){return e.push(r),()=>{const o=e.indexOf(r);o>-1&&e.splice(o,1)}}function n(){e=[]}return{add:t,list:()=>e.slice(),reset:n}}function j(e,t,n,r,o,a=l=>l()){const l=r&&(r.enterCallbacks[o]=r.enterCallbacks[o]||[]);return()=>new Promise((m,c)=>{const h=u=>{u===!1?c(U(4,{from:n,to:t})):u instanceof Error?c(u):on(u)?c(U(2,{from:t,to:u})):(l&&r.enterCallbacks[o]===l&&typeof u=="function"&&l.push(u),m())},d=a(()=>e.call(r&&r.instances[o],t,n,h));let i=Promise.resolve(d);e.length<3&&(i=i.then(h)),i.catch(u=>c(u))})}function he(e,t,n,r,o=a=>a()){const a=[];for(const l of e)for(const m in l.components){let c=l.components[m];if(!(t!=="beforeRouteEnter"&&!l.instances[m]))if(Ke(c)){const d=(c.__vccOpts||c)[t];d&&a.push(j(d,n,r,l,m,o))}else{let h=c();a.push(()=>h.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${m}" at "${l.path}"`);const i=bt(d)?d.default:d;l.mods[m]=d,l.components[m]=i;const f=(i.__vccOpts||i)[t];return f&&j(f,n,r,l,m,o)()}))}}return a}function qe(e){const t=Y(ve),n=Y(ot),r=T(()=>{const c=F(e.to);return t.resolve(c)}),o=T(()=>{const{matched:c}=r.value,{length:h}=c,d=c[h-1],i=n.matched;if(!d||!i.length)return-1;const u=i.findIndex(z.bind(null,d));if(u>-1)return u;const f=Ve(c[h-2]);return h>1&&Ve(d)===f&&i[i.length-1].path!==f?i.findIndex(z.bind(null,c[h-2])):u}),a=T(()=>o.value>-1&&_n(n.params,r.value.params)),l=T(()=>o.value>-1&&o.value===n.matched.length-1&&Ze(n.params,r.value.params));function m(c={}){return kn(c)?t[F(e.replace)?"replace":"push"](F(e.to)).catch(W):Promise.resolve()}return{route:r,href:T(()=>r.value.href),isActive:a,isExactActive:l,navigate:m}}const Pn=Ge({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"}},useLink:qe,setup(e,{slots:t}){const n=ft(qe(e)),{options:r}=Y(ve),o=T(()=>({[ze(e.activeClass,r.linkActiveClass,"router-link-active")]:n.isActive,[ze(e.exactActiveClass,r.linkExactActiveClass,"router-link-exact-active")]:n.isExactActive}));return()=>{const a=t.default&&t.default(n);return e.custom?a:De("a",{"aria-current":n.isExactActive?e.ariaCurrentValue:null,href:n.href,onClick:n.navigate,class:o.value},a)}}}),Sn=Pn;function kn(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function _n(e,t){for(const n in t){const r=t[n],o=e[n];if(typeof r=="string"){if(r!==o)return!1}else if(!M(o)||o.length!==r.length||r.some((a,l)=>a!==o[l]))return!1}return!0}function Ve(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const ze=(e,t,n)=>e??t??n,bn=Ge({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:n}){const r=Y(me),o=T(()=>e.route||r.value),a=Y(He,0),l=T(()=>{let h=F(a);const{matched:d}=o.value;let i;for(;(i=d[h])&&!i.components;)h++;return h}),m=T(()=>o.value.matched[l.value]);le(He,T(()=>l.value+1)),le(wn,m),le(me,o);const c=ht();return dt(()=>[c.value,m.value,e.name],([h,d,i],[u,f,w])=>{d&&(d.instances[i]=h,f&&f!==d&&h&&h===u&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),h&&d&&(!f||!z(d,f)||!u)&&(d.enterCallbacks[i]||[]).forEach(S=>S(h))},{flush:"post"}),()=>{const h=o.value,d=e.name,i=m.value,u=i&&i.components[d];if(!u)return Ue(n.default,{Component:u,route:h});const f=i.props[d],w=f?f===!0?h.params:typeof f=="function"?f(h):f:null,b=De(u,P({},w,t,{onVnodeUnmounted:C=>{C.component.isUnmounted&&(i.instances[d]=null)},ref:c}));return Ue(n.default,{Component:b,route:h})||b}}});function Ue(e,t){if(!e)return null;const n=e(t);return n.length===1?n[0]:n}const Cn=bn;function An(e){const t=pn(e.routes,e),n=e.parseQuery||En,r=e.stringifyQuery||je,o=e.history,a=K(),l=K(),m=K(),c=at(B);let h=B;V&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=ue.bind(null,s=>""+s),i=ue.bind(null,Ht),u=ue.bind(null,X);function f(s,g){let p,v;return et(s)?(p=t.getRecordMatcher(s),v=g):v=s,t.addRoute(v,p)}function w(s){const g=t.getRecordMatcher(s);g&&t.removeRoute(g)}function S(){return t.getRoutes().map(s=>s.record)}function b(s){return!!t.getRecordMatcher(s)}function C(s,g){if(g=P({},g||c.value),typeof s=="string"){const y=fe(n,s,g.path),O=t.resolve({path:y.path},g),D=o.createHref(y.fullPath);return P(y,O,{params:u(O.params),hash:X(y.hash),redirectedFrom:void 0,href:D})}let p;if(s.path!=null)p=P({},s,{path:fe(n,s.path,g.path).path});else{const y=P({},s.params);for(const O in y)y[O]==null&&delete y[O];p=P({},s,{params:i(y)}),g.params=i(g.params)}const v=t.resolve(p,g),_=s.hash||"";v.params=d(u(v.params));const A=zt(r,P({},s,{hash:Nt(_),path:v.path})),E=o.createHref(A);return P({fullPath:A,hash:_,query:r===je?Rn(s.query):s.query||{}},v,{redirectedFrom:void 0,href:E})}function R(s){return typeof s=="string"?fe(n,s,c.value.path):P({},s)}function k(s,g){if(h!==s)return U(8,{from:g,to:s})}function L(s){return I(s)}function H(s){return L(P(R(s),{replace:!0}))}function N(s){const g=s.matched[s.matched.length-1];if(g&&g.redirect){const{redirect:p}=g;let v=typeof p=="function"?p(s):p;return typeof v=="string"&&(v=v.includes("?")||v.includes("#")?v=R(v):{path:v},v.params={}),P({query:s.query,hash:s.hash,params:v.path!=null?{}:s.params},v)}}function I(s,g){const p=h=C(s),v=c.value,_=s.state,A=s.force,E=s.replace===!0,y=N(p);if(y)return I(P(R(y),{state:typeof y=="object"?P({},_,y.state):_,force:A,replace:E}),g||p);const O=p;O.redirectedFrom=g;let D;return!A&&Ut(r,v,p)&&(D=U(16,{to:O,from:v}),Se(v,v,!0,!1)),(D?Promise.resolve(D):Ee(O,v)).catch(x=>$(x)?$(x,2)?x:ce(x):se(x,O,v)).then(x=>{if(x){if($(x,2))return I(P({replace:E},R(x.to),{state:typeof x.to=="object"?P({},_,x.to.state):_,force:A}),g||O)}else x=we(O,v,!0,E,_);return Re(O,v,x),x})}function st(s,g){const p=k(s,g);return p?Promise.reject(p):Promise.resolve()}function re(s){const g=ee.values().next().value;return g&&typeof g.runWithContext=="function"?g.runWithContext(s):s()}function Ee(s,g){let p;const[v,_,A]=On(s,g);p=he(v.reverse(),"beforeRouteLeave",s,g);for(const y of v)y.leaveGuards.forEach(O=>{p.push(j(O,s,g))});const E=st.bind(null,s,g);return p.push(E),q(p).then(()=>{p=[];for(const y of a.list())p.push(j(y,s,g));return p.push(E),q(p)}).then(()=>{p=he(_,"beforeRouteUpdate",s,g);for(const y of _)y.updateGuards.forEach(O=>{p.push(j(O,s,g))});return p.push(E),q(p)}).then(()=>{p=[];for(const y of A)if(y.beforeEnter)if(M(y.beforeEnter))for(const O of y.beforeEnter)p.push(j(O,s,g));else p.push(j(y.beforeEnter,s,g));return p.push(E),q(p)}).then(()=>(s.matched.forEach(y=>y.enterCallbacks={}),p=he(A,"beforeRouteEnter",s,g,re),p.push(E),q(p))).then(()=>{p=[];for(const y of l.list())p.push(j(y,s,g));return p.push(E),q(p)}).catch(y=>$(y,8)?y:Promise.reject(y))}function Re(s,g,p){m.list().forEach(v=>re(()=>v(s,g,p)))}function we(s,g,p,v,_){const A=k(s,g);if(A)return A;const E=g===B,y=V?history.state:{};p&&(v||E?o.replace(s.fullPath,P({scroll:E&&y&&y.scroll},_)):o.push(s.fullPath,_)),c.value=s,Se(s,g,p,E),ce()}let G;function ct(){G||(G=o.listen((s,g,p)=>{if(!ke.listening)return;const v=C(s),_=N(v);if(_){I(P(_,{replace:!0}),v).catch(W);return}h=v;const A=c.value;V&&Xt(Oe(A.fullPath,p.delta),ne()),Ee(v,A).catch(E=>$(E,12)?E:$(E,2)?(I(E.to,v).then(y=>{$(y,20)&&!p.delta&&p.type===Z.pop&&o.go(-1,!1)}).catch(W),Promise.reject()):(p.delta&&o.go(-p.delta,!1),se(E,v,A))).then(E=>{E=E||we(v,A,!1),E&&(p.delta&&!$(E,8)?o.go(-p.delta,!1):p.type===Z.pop&&$(E,20)&&o.go(-1,!1)),Re(v,A,E)}).catch(W)}))}let oe=K(),Pe=K(),J;function se(s,g,p){ce(s);const v=Pe.list();return v.length?v.forEach(_=>_(s,g,p)):console.error(s),Promise.reject(s)}function it(){return J&&c.value!==B?Promise.resolve():new Promise((s,g)=>{oe.add([s,g])})}function ce(s){return J||(J=!s,ct(),oe.list().forEach(([g,p])=>s?p(s):g()),oe.reset()),s}function Se(s,g,p,v){const{scrollBehavior:_}=e;if(!V||!_)return Promise.resolve();const A=!p&&Zt(Oe(s.fullPath,0))||(v||!p)&&history.state&&history.state.scroll||null;return ut().then(()=>_(s,g,A)).then(E=>E&&Yt(E)).catch(E=>se(E,s,g))}const ie=s=>o.go(s);let ae;const ee=new Set,ke={currentRoute:c,listening:!0,addRoute:f,removeRoute:w,clearRoutes:t.clearRoutes,hasRoute:b,getRoutes:S,resolve:C,options:e,push:L,replace:H,go:ie,back:()=>ie(-1),forward:()=>ie(1),beforeEach:a.add,beforeResolve:l.add,afterEach:m.add,onError:Pe.add,isReady:it,install(s){const g=this;s.component("RouterLink",Sn),s.component("RouterView",Cn),s.config.globalProperties.$router=g,Object.defineProperty(s.config.globalProperties,"$route",{enumerable:!0,get:()=>F(c)}),V&&!ae&&c.value===B&&(ae=!0,L(o.location).catch(_=>{}));const p={};for(const _ in B)Object.defineProperty(p,_,{get:()=>c.value[_],enumerable:!0});s.provide(ve,g),s.provide(ot,lt(p)),s.provide(me,c);const v=s.unmount;ee.add(s),s.unmount=function(){ee.delete(s),ee.size<1&&(h=B,G&&G(),G=null,c.value=B,ae=!1,J=!1),v()}}};function q(s){return s.reduce((g,p)=>g.then(()=>re(p)),Promise.resolve())}return ke}function On(e,t){const n=[],r=[],o=[],a=Math.max(t.matched.length,e.matched.length);for(let l=0;l<a;l++){const m=t.matched[l];m&&(e.matched.find(h=>z(h,m))?r.push(m):n.push(m));const c=e.matched[l];c&&(t.matched.find(h=>z(h,c))||o.push(c))}return[n,r,o]}const xn=An({history:rn(),routes:[{path:"/:channelId",name:"detail",component:async()=>await _t(()=>import("./kemov-DetailView-Bg56CW1x.js"),__vite__mapDeps([0,1,2,3,4,5,6])),props:!0},{path:"/",component:{template:""},beforeEnter:function(){window.location.href="../"}}]}),In={dark:!1,colors:{background:"#F4F5FA",primary:te.indigo.base,secondary:te.indigo.base}},Ln={dark:!0,colors:{background:"#121212",primary:te.indigo.lighten4,secondary:te.indigo.darken4}},Mn={themes:{defaultTheme:"light",light:In,dark:Ln},variations:{colors:["primary","secondary","positive","negative"],lighten:0,darken:0}},Tn={};function $n(e,t){const n=_e("RouterView"),r=_e("v-app");return mt(),gt(r,null,{default:vt(()=>[yt(n)]),_:1})}const Nn=pt(Tn,[["render",$n]]),Bn=Rt({components:wt,directives:Pt,icons:{defaultSet:"mdi"},theme:Mn}),ye=Et(Nn);ye.use(xn);ye.use(Bn);ye.mount("#app");
