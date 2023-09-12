import{d as L,r as f,o as U,a as P,w as q,c as p,t as _,b as V,e as v,f as h,g as $,h as y,F as Y,i as X,j as u,u as l,k as K,l as z,m as J,n as Z,s as O,p as Q}from"./axios-a3384505.js";const W="https://raw.githubusercontent.com/nanase/asset/main/kemov/channels.json",ee="https://s3.ap-northeast-1.amazonaws.com/nanase.asset/kemov/stats.json";function m(e){return e.toString().replace(/\B(?=(\d{3})+(?!\d))/g,",")}const te={key:0,class:"update-time"},ne=L({__name:"UpdateTime",props:{time:{}},setup(e){const t=f(Number.NaN),n=f();function r(){return t.value>=60?`${Math.floor(t.value/60)}分`:`${t.value}秒`}function i(){t.value=v().diff(e.time,"s")}return U(async()=>{n.value=setInterval(i,1e3)}),P(()=>{clearInterval(n.value)}),q(()=>e.time,i),(o,a)=>o.time.isValid()&&!Number.isNaN(t.value)?(h(),p("div",te,_(`${o.time.format("YYYY/MM/DD HH:mm:ss")} (${r()}前) 更新`),1)):V("",!0)}}),re=new Set(["ENOTFOUND","ENETUNREACH","UNABLE_TO_GET_ISSUER_CERT","UNABLE_TO_GET_CRL","UNABLE_TO_DECRYPT_CERT_SIGNATURE","UNABLE_TO_DECRYPT_CRL_SIGNATURE","UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY","CERT_SIGNATURE_FAILURE","CRL_SIGNATURE_FAILURE","CERT_NOT_YET_VALID","CERT_HAS_EXPIRED","CRL_NOT_YET_VALID","CRL_HAS_EXPIRED","ERROR_IN_CERT_NOT_BEFORE_FIELD","ERROR_IN_CERT_NOT_AFTER_FIELD","ERROR_IN_CRL_LAST_UPDATE_FIELD","ERROR_IN_CRL_NEXT_UPDATE_FIELD","OUT_OF_MEM","DEPTH_ZERO_SELF_SIGNED_CERT","SELF_SIGNED_CERT_IN_CHAIN","UNABLE_TO_GET_ISSUER_CERT_LOCALLY","UNABLE_TO_VERIFY_LEAF_SIGNATURE","CERT_CHAIN_TOO_LONG","CERT_REVOKED","INVALID_CA","PATH_LENGTH_EXCEEDED","INVALID_PURPOSE","CERT_UNTRUSTED","CERT_REJECTED","HOSTNAME_MISMATCH"]);var se=e=>!re.has(e&&e.code);const ae=$(se);function I(e,t,n,r,i,o,a){try{var c=e[o](a),s=c.value}catch(R){n(R);return}c.done?t(s):Promise.resolve(s).then(r,i)}function F(e){return function(){var t=this,n=arguments;return new Promise(function(r,i){var o=e.apply(t,n);function a(s){I(o,r,i,a,c,"next",s)}function c(s){I(o,r,i,a,c,"throw",s)}a(void 0)})}}function S(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(i){return Object.getOwnPropertyDescriptor(e,i).enumerable})),n.push.apply(n,r)}return n}function w(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]!=null?arguments[t]:{};t%2?S(Object(n),!0).forEach(function(r){oe(e,r,n[r])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):S(Object(n)).forEach(function(r){Object.defineProperty(e,r,Object.getOwnPropertyDescriptor(n,r))})}return e}function oe(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var N="axios-retry";function B(e){return!e.response&&!!e.code&&e.code!=="ECONNABORTED"&&ae(e)}var j=["get","head","options"],ie=j.concat(["put","delete"]);function g(e){return e.code!=="ECONNABORTED"&&(!e.response||e.response.status>=500&&e.response.status<=599)}function ue(e){return e.config?g(e)&&j.indexOf(e.config.method)!==-1:!1}function x(e){return e.config?g(e)&&ie.indexOf(e.config.method)!==-1:!1}function H(e){return B(e)||x(e)}function ce(){return 0}function le(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:0,t=arguments.length>2&&arguments[2]!==void 0?arguments[2]:100,n=Math.pow(2,e)*t,r=n*.2*Math.random();return n+r}function b(e){var t=e[N]||{};return t.retryCount=t.retryCount||0,e[N]=t,t}function _e(e,t){return w(w({},t),e[N])}function de(e,t){e.defaults.agent===t.agent&&delete t.agent,e.defaults.httpAgent===t.httpAgent&&delete t.httpAgent,e.defaults.httpsAgent===t.httpsAgent&&delete t.httpsAgent}function Ee(e,t,n,r){return C.apply(this,arguments)}function C(){return C=F(function*(e,t,n,r){var i=n.retryCount<e&&t(r);if(typeof i=="object")try{var o=yield i;return o!==!1}catch{return!1}return i}),C.apply(this,arguments)}function d(e,t){var n=e.interceptors.request.use(i=>{var o=b(i);return o.lastRequestTime=Date.now(),i}),r=e.interceptors.response.use(null,function(){var i=F(function*(o){var{config:a}=o;if(!a)return Promise.reject(o);var{retries:c=3,retryCondition:s=H,retryDelay:R=ce,shouldResetTimeout:M=!1,onRetry:G=()=>{}}=_e(a,t),E=b(a);if(yield Ee(c,s,E,o)){E.retryCount+=1;var A=R(E.retryCount,o);if(de(e,a),!M&&a.timeout&&E.lastRequestTime){var k=Date.now()-E.lastRequestTime,D=a.timeout-k-A;if(D<=0)return Promise.reject(o);a.timeout=D}return a.transformRequest=[T=>T],G(E.retryCount,o,a),new Promise(T=>setTimeout(()=>T(e(a)),A))}return Promise.reject(o)});return function(o){return i.apply(this,arguments)}}());return{requestInterceptorId:n,responseInterceptorId:r}}d.isNetworkError=B;d.isSafeRequestError=ue;d.isIdempotentRequestError=x;d.isNetworkOrIdempotentRequestError=H;d.exponentialDelay=le;d.isRetryableError=g;const me={class:"vtuber-list"},fe=z('<div class="vtuber header"><div class="avatar header"></div><div class="name header"></div><div class="subscriber-count header">チャンネル登録</div><div class="view-count header">総再生回数</div><div class="video-count header">動画数</div></div>',1),pe=["href","title"],ve={class:"name"},he=["href","title"],Re={class:"subscriber-count"},Te={class:"view-count"},ye={class:"video-count"},Oe={class:"vtuber total"},Ne=u("div",{class:"avatar total"},null,-1),Ce=u("div",{class:"name total"},"合計",-1),ge={class:"subscriber-count total"},Ae={class:"view-count total"},De={class:"video-count total"},Ie=L({__name:"StatsApp",setup(e){const t=f([]),n=f(v(Number.NaN)),r=f();let i;d(y,{retries:3,retryDelay:d.exponentialDelay});async function o(){try{const a=(await y.get(ee)).data;t.value=J("id",i,a.data),n.value=v.unix(a.fetched_at);const c=Math.floor(6e5-(v().unix()-a.fetched_at)*1e3)+5e3;r.value=setTimeout(o,c)}catch(a){console.error(`Fetching error. Retrying in 10 minutes: ${a}`),r.value=setTimeout(o,6e5)}}return U(async()=>{i=(await y.get(W)).data,await o()}),P(()=>{clearInterval(r.value)}),(a,c)=>(h(),p("div",me,[fe,(h(!0),p(Y,null,X(t.value,s=>(h(),p("div",{class:"vtuber",key:s.id},[u("a",{href:`https://www.youtube.com/${s.customUrl}`,target:"_blank",title:s.name},[u("div",{class:"avatar",style:Z(`background-image:url('${s.thumbnails.medium.url}'); border-color: ${s.color.key};`)},null,4)],8,pe),u("div",ve,[u("a",{href:`https://www.youtube.com/${s.customUrl}`,target:"_blank",title:s.name},_(s.name),9,he)]),u("div",Re,_(l(m)(s.statistics.subscriberCount)),1),u("div",Te,_(l(m)(s.statistics.viewCount)),1),u("div",ye,_(l(m)(s.statistics.videoCount)),1)]))),128)),u("div",Oe,[Ne,Ce,u("div",ge,_(l(m)(l(O)(t.value,s=>s.statistics.subscriberCount))),1),u("div",Ae,_(l(m)(l(O)(t.value,s=>s.statistics.viewCount))),1),u("div",De,_(l(m)(l(O)(t.value,s=>s.statistics.videoCount))),1)]),K(ne,{class:"update-time",time:n.value},null,8,["time"])]))}});Q(Ie).mount("#app");
