import{j as B,p as q,l as I,u as _,R as ae,x as le,O as fe,K as re,al as pe,C as me,s as ve,E as Be,k as z,U as Me,am as Ce,z as he,d as Y,m as ge,b as O,f as L,ab as k,e as V,a9 as Z,c as E,w as i,o as w,a as D,t as j,F as ye,g as c,an as we,ao as be,i as m,a6 as ie,r as xe,h as Ee}from"./kemov-_plugin-vue_export-helper-BfvHD29s.js";import{d as ue,f as De}from"./kemov-axios-CRW72lKU.js";function Q(e){return pe()?(me(e),!0):!1}function G(e){return typeof e=="function"?e():_(e)}const X=typeof window<"u"&&typeof document<"u";typeof WorkerGlobalScope<"u"&&globalThis instanceof WorkerGlobalScope;const ze=Object.prototype.toString,Ve=e=>ze.call(e)==="[object Object]",ke=()=>{};function Le(e,t){function n(...o){return new Promise((a,l)=>{Promise.resolve(e(()=>t.apply(this,o),{fn:t,thisArg:this,args:o})).then(a).catch(l)})}return n}const _e=e=>e();function Ie(e=_e){const t=B(!0);function n(){t.value=!1}function o(){t.value=!0}const a=(...l)=>{t.value&&e(...l)};return{isActive:fe(t),pause:n,resume:o,eventFilter:a}}function Oe(e){return re()}function je(e,t,n={}){const{eventFilter:o=_e,...a}=n;return I(e,Le(o,t),a)}function Te(e,t,n={}){const{eventFilter:o,...a}=n,{eventFilter:l,pause:r,resume:s,isActive:f}=Ie(o);return{stop:je(e,t,{...a,eventFilter:l}),pause:r,resume:s,isActive:f}}function Ne(e,t=!0,n){Oe()?ae(e,n):t?e():le(e)}function At(e,t=1e3,n={}){const{immediate:o=!0,immediateCallback:a=!1}=n;let l=null;const r=B(!1);function s(){l&&(clearInterval(l),l=null)}function f(){r.value=!1,s()}function d(){const u=G(t);u<=0||(r.value=!0,a&&e(),s(),l=setInterval(e,u))}if(o&&X&&d(),q(t)||typeof t=="function"){const u=I(t,()=>{r.value&&X&&d()});Q(u)}return Q(f),{isActive:r,pause:f,resume:d}}function $t(e,t,n){let o;q(n)?o={evaluating:n}:o={};const{lazy:a=!1,evaluating:l=void 0,shallow:r=!0,onError:s=ke}=o,f=B(!a),d=r?ve(t):B(t);let u=0;return Be(async h=>{if(!f.value)return;u++;const g=u;let v=!1;l&&Promise.resolve().then(()=>{l.value=!0});try{const M=await e($=>{h(()=>{l&&(l.value=!1),v||$()})});g===u&&(d.value=M)}catch(M){s(M)}finally{l&&g===u&&(l.value=!1),v=!0}}),a?z(()=>(f.value=!0,d.value)):d}const ee=X?window:void 0;function Fe(e){var t;const n=G(e);return(t=n==null?void 0:n.$el)!=null?t:n}function ce(...e){let t,n,o,a;if(typeof e[0]=="string"||Array.isArray(e[0])?([n,o,a]=e,t=ee):[t,n,o,a]=e,!t)return ke;Array.isArray(n)||(n=[n]),Array.isArray(o)||(o=[o]);const l=[],r=()=>{l.forEach(u=>u()),l.length=0},s=(u,h,g,v)=>(u.addEventListener(h,g,v),()=>u.removeEventListener(h,g,v)),f=I(()=>[Fe(t),G(a)],([u,h])=>{if(r(),!u)return;const g=Ve(h)?{...h}:h;l.push(...n.flatMap(v=>o.map(M=>s(u,v,M,g))))},{immediate:!0,flush:"post"}),d=()=>{f(),r()};return Q(d),d}const P=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{},R="__vueuse_ssr_handlers__",Je=We();function We(){return R in P||(P[R]=P[R]||{}),P[R]}function Ue(e,t){return Je[e]||t}function He(e){return e==null?"any":e instanceof Set?"set":e instanceof Map?"map":e instanceof Date?"date":typeof e=="boolean"?"boolean":typeof e=="string"?"string":typeof e=="object"?"object":Number.isNaN(e)?"any":"number"}const Pe={boolean:{read:e=>e==="true",write:e=>String(e)},object:{read:e=>JSON.parse(e),write:e=>JSON.stringify(e)},number:{read:e=>Number.parseFloat(e),write:e=>String(e)},any:{read:e=>e,write:e=>String(e)},string:{read:e=>e,write:e=>String(e)},map:{read:e=>new Map(JSON.parse(e)),write:e=>JSON.stringify(Array.from(e.entries()))},set:{read:e=>new Set(JSON.parse(e)),write:e=>JSON.stringify(Array.from(e))},date:{read:e=>new Date(e),write:e=>e.toISOString()}},de="vueuse-storage";function Bt(e,t,n,o={}){var a;const{flush:l="pre",deep:r=!0,listenToStorageChanges:s=!0,writeDefaults:f=!0,mergeDefaults:d=!1,shallow:u,window:h=ee,eventFilter:g,onError:v=p=>{console.error(p)},initOnMounted:M}=o,$=(u?ve:B)(t);if(!n)try{n=Ue("getDefaultStorage",()=>{var p;return(p=ee)==null?void 0:p.localStorage})()}catch(p){v(p)}if(!n)return $;const C=G(t),S=He(C),y=(a=o.serializer)!=null?a:Pe[S],{pause:K,resume:W}=Te($,()=>U($.value),{flush:l,deep:r,eventFilter:g});h&&s&&Ne(()=>{n instanceof Storage?ce(h,"storage",H):ce(h,de,$e),M&&H()}),M||H();function A(p,b){if(h){const x={key:e,oldValue:p,newValue:b,storageArea:n};h.dispatchEvent(n instanceof Storage?new StorageEvent("storage",x):new CustomEvent(de,{detail:x}))}}function U(p){try{const b=n.getItem(e);if(p==null)A(b,null),n.removeItem(e);else{const x=y.write(p);b!==x&&(n.setItem(e,x),A(b,x))}}catch(b){v(b)}}function se(p){const b=p?p.newValue:n.getItem(e);if(b==null)return f&&C!=null&&n.setItem(e,y.write(C)),C;if(!p&&d){const x=y.read(b);return typeof d=="function"?d(x,C):S==="object"&&!Array.isArray(x)?{...C,...x}:x}else return typeof b!="string"?b:y.read(b)}function H(p){if(!(p&&p.storageArea!==n)){if(p&&p.key==null){$.value=C;return}if(!(p&&p.key!==e)){K();try{(p==null?void 0:p.newValue)!==y.write($.value)&&($.value=se(p))}catch(b){v(b)}finally{p?le(W):W()}}}}function $e(p){H(p.detail)}return $}function Mt(e){return e==null?"":e.toString().replace(/\B(?=(\d{3})+(?!\d))/g,",")}const Ct="https://nanase.cc/asset/kemov/channels.json",xt="https://d1zvseiqyto6c5.cloudfront.net/kemov/live.json",Et="https://d1zvseiqyto6c5.cloudfront.net/kemov/stats.json",Re="https://d1zvseiqyto6c5.cloudfront.net/kemov/stats/video/";function Dt(e){return`${Re}${e}.json`}function te(e){return pe()?(me(e),!0):!1}function N(e){return typeof e=="function"?e():_(e)}const ne=typeof window<"u"&&typeof document<"u";typeof WorkerGlobalScope<"u"&&globalThis instanceof WorkerGlobalScope;const qe=e=>e!=null,Ye=()=>{};function Ge(...e){if(e.length!==1)return Me(...e);const t=e[0];return typeof t=="function"?fe(Ce(()=>({get:t,set:Ye}))):B(t)}function Ke(e,t=1e3,n={}){const{immediate:o=!0,immediateCallback:a=!1}=n;let l=null;const r=B(!1);function s(){l&&(clearInterval(l),l=null)}function f(){r.value=!1,s()}function d(){const u=N(t);u<=0||(r.value=!0,a&&e(),s(),l=setInterval(e,u))}if(o&&ne&&d(),q(t)||typeof t=="function"){const u=I(t,()=>{r.value&&ne&&d()});te(u)}return te(f),{isActive:r,pause:f,resume:d}}const Ze=ne?window:void 0;function Qe(e){var t;const n=N(e);return(t=n==null?void 0:n.$el)!=null?t:n}function Xe(){const e=B(!1),t=re();return t&&ae(()=>{e.value=!0},t),e}function et(e){const t=Xe();return z(()=>(t.value,!!e()))}function tt(e,t,n={}){const{window:o=Ze,...a}=n;let l;const r=et(()=>o&&"MutationObserver"in o),s=()=>{l&&(l.disconnect(),l=void 0)},f=z(()=>{const g=N(e),v=(Array.isArray(g)?g:[g]).map(Qe).filter(qe);return new Set(v)}),d=I(()=>f.value,g=>{s(),r.value&&g.size&&(l=new MutationObserver(t),g.forEach(v=>l.observe(v,a)))},{immediate:!0,flush:"post"}),u=()=>l==null?void 0:l.takeRecords(),h=()=>{d(),s()};return te(h),{isSupported:r,stop:h,takeRecords:u}}function nt(e,t,n,o){const a=Ke(e,n,o);return I(()=>N(t),()=>N(t)?a.pause():a.resume(),{immediate:!0}),a}function ot(e,t){const n=e?Ge(e):B(window.pageId),o=z(()=>N(t).find(l=>l.pages.some(r=>r.id===n.value))),a=z(()=>{var l;return(l=o.value)==null?void 0:l.pages.find(r=>r.id===n.value)});return{pageId:n,section:o,page:a}}function J(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:"";if(J.cache.has(e))return J.cache.get(e);const t=e.replace(/[^a-z]/gi,"-").replace(/\B([A-Z])/g,"-$1").toLowerCase();return J.cache.set(e,t),t}J.cache=new Map;function Se(e,t){const n=re();if(!n)throw new Error(`[Vuetify] ${e} must be called from inside a setup function`);return n}function at(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:"composables";const t=Se(e).type;return J((t==null?void 0:t.aliasName)||(t==null?void 0:t.name))}const lt=Symbol.for("vuetify:theme");function rt(){Se("useTheme");const e=he(lt,null);if(!e)throw new Error("Could not find Vuetify theme injection");return e}const F="vuetify-color-scheme";function st(){return rt()}function T(e,t){t==="unspecified"?(e.global.name.value="",document.querySelectorAll(".color-responsive").forEach(n=>{var o;if(n.classList.remove("color-responsive-dark","color-responsive-light"),n instanceof HTMLObjectElement){const a=(o=n.contentDocument)==null?void 0:o.documentElement;a&&a.classList.remove("color-responsive-dark","color-responsive-light")}})):(e.global.name.value=t,document.querySelectorAll(".color-responsive").forEach(n=>{var o;if(t==="light"?(n.classList.add("color-responsive-light"),n.classList.remove("color-responsive-dark")):(n.classList.add("color-responsive-dark"),n.classList.remove("color-responsive-light")),n instanceof HTMLObjectElement){const a=(o=n.contentDocument)==null?void 0:o.documentElement;if(!a)return;t==="light"?(a.classList.add("color-responsive-light"),a.classList.remove("color-responsive-dark")):(a.classList.add("color-responsive-dark"),a.classList.remove("color-responsive-light"))}}))}function oe(){var e,t;return(e=window.matchMedia)!=null&&e.call(window,"(prefers-color-scheme: light)").matches?"light":(t=window.matchMedia)!=null&&t.call(window,"(prefers-color-scheme: dark)").matches?"dark":"unspecified"}function it(e){e.global.current.value.dark?(oe()==="light"?localStorage.removeItem(F):localStorage.setItem(F,"light"),T(e,"light")):(oe()==="dark"?localStorage.removeItem(F):localStorage.setItem(F,"dark"),T(e,"dark"))}function ut(e){const t=localStorage.getItem(F);t==="light"?T(e,"light"):t==="dark"||oe()==="dark"?T(e,"dark"):T(e,"light")}function ct(e={}){const t=st(),n=z({get:()=>t.global.current.value.dark,set:l=>T(t,l?"dark":"light")});function o(){ut(t)}function a(){it(t)}return e.immediate!==!1&&o(),{theme:t,reapply:o,toggle:a,isDark:n}}const dt=Symbol.for("vuetify:display");function ft(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:at();const n=he(dt);if(!n)throw new Error("Could not find Vuetify display injection");const o=z(()=>{if(e.mobile!=null)return e.mobile;if(!e.mobileBreakpoint)return n.mobile.value;const l=typeof e.mobileBreakpoint=="number"?e.mobileBreakpoint:n.thresholds.value[e.mobileBreakpoint];return n.width.value<l}),a=z(()=>t?{[`${t}--mobile`]:o.value}:{});return{...n,displayClasses:a,mobile:o}}const pt={class:"animated-clock"},mt={key:0,class:"date"},vt={key:0,class:"timezone"},ht={key:1,class:"time"};ge({time:null,updateInterval:null,stop:{type:Boolean},stopAnimation:{type:Boolean},hideDate:{type:Boolean},hideTime:{type:Boolean},hideTimezone:{type:Boolean},hideSeconds:{type:Boolean}},{time:ue(),updateInterval:200});const Ae=(e,t)=>{const n=e.__vccOpts||e;for(const[o,a]of t)n[o]=a;return n},gt={};function yt(e,t){const n=m("v-icon");return w(),E(n,{class:"shaking-icon"})}const wt=Ae(gt,[["render",yt]]),bt=Y({__name:"AppBaseV2",props:we({pageId:null,pageSections:null,title:null,icon:null},{errorSnackbarShown:{type:Boolean},errorSnackbarShownModifiers:{}}),emits:["update:errorSnackbarShown"],setup(e){const t=be(e,"errorSnackbarShown"),{smAndDown:n,mdAndDown:o}=ft(),{page:a}=ot(e.pageId,e.pageSections),l=B();return(r,s)=>{const f=m("v-list"),d=m("v-navigation-drawer"),u=m("v-col"),h=m("v-row"),g=m("v-icon"),v=m("v-btn"),M=m("v-snackbar"),$=m("v-app-bar-nav-icon"),C=m("v-toolbar-title"),S=m("v-app-bar"),y=m("v-container"),K=m("v-main"),W=m("v-app");return w(),E(W,null,{default:i(()=>[r.$slots.drawerMenu?(w(),E(d,{key:0,modelValue:l.value,"onUpdate:modelValue":s[0]||(s[0]=A=>l.value=A),floating:"","aria-label":"ナビゲーション",width:270,color:"v2DrawerBackground"},{default:i(()=>[c(f,{class:"px-0 pb-0 d-flex flex-column fill-height",role:"menu"},{default:i(()=>[k(r.$slots,"drawerMenu",{currentPage:_(a)},void 0,!0)]),_:3})]),_:3},8,["modelValue"])):L("",!0),c(M,{class:"error-snackbar",modelValue:t.value,"onUpdate:modelValue":s[2]||(s[2]=A=>t.value=A),timeout:"10000",color:"v2SnackbarBackground"},{actions:i(()=>[c(v,{color:"red-lighten-2",variant:"plain",onClick:s[1]||(s[1]=A=>t.value=!1)},{default:i(()=>[c(g,null,{default:i(()=>s[6]||(s[6]=[D("mdi-close")])),_:1})]),_:1})]),default:i(()=>[k(r.$slots,"errorSnackbar",{},()=>[c(h,null,{default:i(()=>[c(u,{cols:"1"},{default:i(()=>[c(wt,{icon:"mdi-alert",size:"medium",color:"warning"})]),_:1}),c(u,null,{default:i(()=>s[5]||(s[5]=[D("データを取得できませんでした。"),V("br",null,null,-1),D("しばらくしてから再読み込みしてください。")])),_:1})]),_:1})],!0)]),_:3},8,["modelValue"]),c(K,null,{default:i(()=>[c(S,{class:"app-bar",flat:"",floating:"",color:"v2AppBarBackground",density:_(n)?"compact":"comfortable","scroll-behavior":_(o)?"hide":void 0,"scroll-threshold":48},{append:i(()=>[k(r.$slots,"appbarAppend",{},void 0,!0)]),default:i(()=>[k(r.$slots,"appbarPrepend",{},()=>{var A,U;return[!l.value&&(e.icon??((A=_(a))==null?void 0:A.icon))?(w(),E($,{key:0,transition:"slide-x-transition",class:"mr-n3",variant:"plain",icon:e.icon??((U=_(a))==null?void 0:U.icon),ripple:!1,onClick:s[3]||(s[3]=ie(se=>l.value=!l.value,["stop"])),"aria-label":"ナビゲーションを表示"},null,8,["icon"])):L("",!0)]},!0),l.value?L("",!0):(w(),E(C,{key:0,transition:"slide-x-transition",class:"ml-5"},{default:i(()=>{var A;return[D(j(e.title??((A=_(a))==null?void 0:A.title)),1)]}),_:1}))]),_:3},8,["density","scroll-behavior"]),_(o)?(w(),E(S,{key:0,transition:"slide-y-transition",class:"app-bar-sub",flat:"",floating:"",color:"v2AppBarBackground",density:"compact",height:"48"},{default:i(()=>[c(v,{variant:"plain",density:"compact",onClick:s[4]||(s[4]=ie(A=>l.value=!l.value,["stop"])),"aria-label":"ナビゲーションを表示",ripple:!1},{default:i(()=>[c(g,{size:"small"},{default:i(()=>s[7]||(s[7]=[D("mdi-menu")])),_:1}),s[8]||(s[8]=V("div",{class:"ml-3 text-subtitle-2 opacity-90"},"Menu",-1))]),_:1})]),_:1})):L("",!0),k(r.$slots,"header",{},void 0,!0),c(y,{class:"pb-16 mb-16"},{default:i(()=>[k(r.$slots,"default",{},void 0,!0)]),_:3}),k(r.$slots,"footer",{},void 0,!0)]),_:3}),k(r.$slots,"mainAppend",{},void 0,!0)]),_:3})}}}),kt=Ae(bt,[["__scopeId","data-v-43a54272"]]);ge({tag:null,node:{type:Boolean},block:{type:Boolean},overlook:{type:Boolean}},{tag:"span"});const zt=Y({__name:"StatsAppBase",props:we({channels:null,pageId:null},{errorSnackbarShown:{type:Boolean},errorSnackbarShownModifiers:{}}),emits:["update:errorSnackbarShown"],setup(e){const t=be(e,"errorSnackbarShown"),{isDark:n,toggle:o}=ct();return(a,l)=>{const r=m("v-icon"),s=m("v-list-item-title"),f=m("v-list-item"),d=m("v-divider"),u=m("v-img"),h=m("v-avatar"),g=m("v-progress-circular"),v=m("v-list"),M=m("v-btn"),$=m("v-switch"),C=m("v-menu");return w(),E(_(kt),{"page-sections":[],"error-snackbar-shown":t.value,"onUpdate:errorSnackbarShown":l[1]||(l[1]=S=>t.value=S)},{drawerMenu:i(()=>[c(f,{class:"py-2",link:"",slim:"",title:"",href:"/kemov/stats/",role:"menuitem",density:"default","base-color":"v2DrawerList"},{prepend:i(()=>[c(r,{icon:"mdi-finance",size:"large"})]),default:i(()=>[c(s,{style:{"font-size":"100%"},class:"font-weight-bold"},{default:i(()=>l[2]||(l[2]=[D("けもV リアルタイム統計")])),_:1})]),_:1}),c(d,{class:"mx-4"}),c(v,{class:"flex-grow-1 flex-shrink-1 overflow-auto",role:"menu",density:"compact",nav:"",link:""},{default:i(()=>{var S;return[(w(!0),O(ye,null,xe(e.channels,y=>(w(),E(f,{key:y.id,title:y.name,subtitle:y.globalname,href:`/kemov/stats/detail/#/${y.id}`,role:"menuitem",link:"",color:"v2DrawerListActive","base-color":"v2DrawerList",style:{"font-size":"0.9rem"},active:e.pageId===`stats/detail/${y.id}`},{prepend:i(()=>[c(h,{color:y.color.key,variant:"outlined",size:"small"},{default:i(()=>[c(u,{src:y.thumbnails.default.url,alt:y.fullname},null,8,["src","alt"])]),_:2},1032,["color"])]),_:2},1032,["title","subtitle","href","active"]))),128)),((S=e.channels)==null?void 0:S.length)===0?(w(),E(f,{key:0,class:"pa-4 text-center"},{default:i(()=>[c(g,{color:"primary",indeterminate:""})]),_:1})):L("",!0)]}),_:1}),c(d),c(v,{density:"compact",link:"",nav:"",slim:"",class:"flex-grow-0 flex-shrink-0",role:"menu"},{default:i(()=>[c(f,{title:"ジェネット楽曲一覧",href:"/kemov/genet/music/",role:"menuitem"},{prepend:i(()=>[c(r,{icon:"mdi-music",size:"small"})]),_:1})]),_:1})]),appbarAppend:i(()=>[c(C,{"close-on-content-click":!1},{activator:i(({props:S})=>[c(M,Ee({icon:""},S,{variant:"plain","aria-label":"ページオプションを表示"}),{default:i(()=>[c(r,null,{default:i(()=>l[3]||(l[3]=[D("mdi-dots-horizontal")])),_:1})]),_:2},1040)]),default:i(()=>[c(v,{slim:"",density:"compact"},{default:i(()=>[c(f,{onClick:_(o)},{default:i(()=>[c($,{"hide-details":"",flat:"",ripple:!1,"model-value":_(n),"onUpdate:modelValue":l[0]||(l[0]=S=>q(n)?n.value=S:null),"aria-label":"テーマを切り替え","true-icon":"mdi-weather-night","false-icon":"mdi-white-balance-sunny"},{prepend:i(()=>l[4]||(l[4]=[D("テーマを切り替え")])),_:1},8,["model-value"])]),_:1},8,["onClick"])]),_:1})]),_:1})]),header:i(()=>[k(a.$slots,"header")]),footer:i(()=>[k(a.$slots,"footer")]),default:i(()=>[k(a.$slots,"default")]),_:3},8,["error-snackbar-shown"])}}});export{zt as _,Bt as a,$t as b,Ct as c,xt as l,Et as s,Mt as t,At as u,Dt as v};