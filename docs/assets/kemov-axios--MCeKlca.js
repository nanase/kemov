function Fe(e,t,n){for(const r of n)if(!(typeof r[e]>"u")&&r[e]===t)return r;return null}function Ln(e,t,n){return t.map(r=>{const s=Fe(e,r[e],t),o=Fe(e,r[e],n);return s==null||o==null?null:{...s,...o}}).filter(r=>r!==null)}function Bn(e,t){return t==null?e.reduce((n,r)=>n+Number(r),0):e.reduce((n,r)=>n+t(r),0)}function jn(e){return e==null||e.length===0}function Un(e){return e.some((t,n)=>e.indexOf(t)!==n)}var pt=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};function mt(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}var We={exports:{}};(function(e,t){(function(n,r){e.exports=r()})(pt,function(){var n=1e3,r=6e4,s=36e5,o="millisecond",i="second",c="minute",b="hour",y="day",h="week",u="month",T="quarter",x="year",p="date",w="Invalid Date",N=/^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/,_=/\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,U={name:"en",weekdays:"Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),months:"January_February_March_April_May_June_July_August_September_October_November_December".split("_"),ordinal:function(S){var d=["th","st","nd","rd"],l=S%100;return"["+S+(d[(l-20)%10]||d[l]||d[0])+"]"}},L=function(S,d,l){var m=String(S);return!m||m.length>=d?S:""+Array(d+1-m.length).join(l)+S},me={s:L,z:function(S){var d=-S.utcOffset(),l=Math.abs(d),m=Math.floor(l/60),f=l%60;return(d<=0?"+":"-")+L(m,2,"0")+":"+L(f,2,"0")},m:function S(d,l){if(d.date()<l.date())return-S(l,d);var m=12*(l.year()-d.year())+(l.month()-d.month()),f=d.clone().add(m,u),E=l-f<0,O=d.clone().add(m+(E?-1:1),u);return+(-(m+(l-f)/(E?f-O:O-f))||0)},a:function(S){return S<0?Math.ceil(S)||0:Math.floor(S)},p:function(S){return{M:u,y:x,w:h,d:y,D:p,h:b,m:c,s:i,ms:o,Q:T}[S]||String(S||"").toLowerCase().replace(/s$/,"")},u:function(S){return S===void 0}},G="en",z={};z[G]=U;var _e="$isDayjsObject",ye=function(S){return S instanceof se||!(!S||!S[_e])},re=function S(d,l,m){var f;if(!d)return G;if(typeof d=="string"){var E=d.toLowerCase();z[E]&&(f=E),l&&(z[E]=l,f=E);var O=d.split("-");if(!f&&O.length>1)return S(O[0])}else{var A=d.name;z[A]=d,f=A}return!m&&f&&(G=f),f||!m&&G},C=function(S,d){if(ye(S))return S.clone();var l=typeof d=="object"?d:{};return l.date=S,l.args=arguments,new se(l)},R=me;R.l=re,R.i=ye,R.w=function(S,d){return C(S,{locale:d.$L,utc:d.$u,x:d.$x,$offset:d.$offset})};var se=function(){function S(l){this.$L=re(l.locale,null,!0),this.parse(l),this.$x=this.$x||l.x||{},this[_e]=!0}var d=S.prototype;return d.parse=function(l){this.$d=function(m){var f=m.date,E=m.utc;if(f===null)return new Date(NaN);if(R.u(f))return new Date;if(f instanceof Date)return new Date(f);if(typeof f=="string"&&!/Z$/i.test(f)){var O=f.match(N);if(O){var A=O[2]-1||0,$=(O[7]||"0").substring(0,3);return E?new Date(Date.UTC(O[1],A,O[3]||1,O[4]||0,O[5]||0,O[6]||0,$)):new Date(O[1],A,O[3]||1,O[4]||0,O[5]||0,O[6]||0,$)}}return new Date(f)}(l),this.init()},d.init=function(){var l=this.$d;this.$y=l.getFullYear(),this.$M=l.getMonth(),this.$D=l.getDate(),this.$W=l.getDay(),this.$H=l.getHours(),this.$m=l.getMinutes(),this.$s=l.getSeconds(),this.$ms=l.getMilliseconds()},d.$utils=function(){return R},d.isValid=function(){return this.$d.toString()!==w},d.isSame=function(l,m){var f=C(l);return this.startOf(m)<=f&&f<=this.endOf(m)},d.isAfter=function(l,m){return C(l)<this.startOf(m)},d.isBefore=function(l,m){return this.endOf(m)<C(l)},d.$g=function(l,m,f){return R.u(l)?this[m]:this.set(f,l)},d.unix=function(){return Math.floor(this.valueOf()/1e3)},d.valueOf=function(){return this.$d.getTime()},d.startOf=function(l,m){var f=this,E=!!R.u(m)||m,O=R.p(l),A=function(W,F){var v=R.w(f.$u?Date.UTC(f.$y,F,W):new Date(f.$y,F,W),f);return E?v:v.endOf(y)},$=function(W,F){return R.w(f.toDate()[W].apply(f.toDate("s"),(E?[0,0,0,0]:[23,59,59,999]).slice(F)),f)},P=this.$W,M=this.$M,B=this.$D,V="set"+(this.$u?"UTC":"");switch(O){case x:return E?A(1,0):A(31,11);case u:return E?A(1,M):A(0,M+1);case h:var J=this.$locale().weekStart||0,X=(P<J?P+7:P)-J;return A(E?B-X:B+(6-X),M);case y:case p:return $(V+"Hours",0);case b:return $(V+"Minutes",1);case c:return $(V+"Seconds",2);case i:return $(V+"Milliseconds",3);default:return this.clone()}},d.endOf=function(l){return this.startOf(l,!1)},d.$set=function(l,m){var f,E=R.p(l),O="set"+(this.$u?"UTC":""),A=(f={},f[y]=O+"Date",f[p]=O+"Date",f[u]=O+"Month",f[x]=O+"FullYear",f[b]=O+"Hours",f[c]=O+"Minutes",f[i]=O+"Seconds",f[o]=O+"Milliseconds",f)[E],$=E===y?this.$D+(m-this.$W):m;if(E===u||E===x){var P=this.clone().set(p,1);P.$d[A]($),P.init(),this.$d=P.set(p,Math.min(this.$D,P.daysInMonth())).$d}else A&&this.$d[A]($);return this.init(),this},d.set=function(l,m){return this.clone().$set(l,m)},d.get=function(l){return this[R.p(l)]()},d.add=function(l,m){var f,E=this;l=Number(l);var O=R.p(m),A=function(M){var B=C(E);return R.w(B.date(B.date()+Math.round(M*l)),E)};if(O===u)return this.set(u,this.$M+l);if(O===x)return this.set(x,this.$y+l);if(O===y)return A(1);if(O===h)return A(7);var $=(f={},f[c]=r,f[b]=s,f[i]=n,f)[O]||1,P=this.$d.getTime()+l*$;return R.w(P,this)},d.subtract=function(l,m){return this.add(-1*l,m)},d.format=function(l){var m=this,f=this.$locale();if(!this.isValid())return f.invalidDate||w;var E=l||"YYYY-MM-DDTHH:mm:ssZ",O=R.z(this),A=this.$H,$=this.$m,P=this.$M,M=f.weekdays,B=f.months,V=f.meridiem,J=function(F,v,Z,oe){return F&&(F[v]||F(m,E))||Z[v].slice(0,oe)},X=function(F){return R.s(A%12||12,F,"0")},W=V||function(F,v,Z){var oe=F<12?"AM":"PM";return Z?oe.toLowerCase():oe};return E.replace(_,function(F,v){return v||function(Z){switch(Z){case"YY":return String(m.$y).slice(-2);case"YYYY":return R.s(m.$y,4,"0");case"M":return P+1;case"MM":return R.s(P+1,2,"0");case"MMM":return J(f.monthsShort,P,B,3);case"MMMM":return J(B,P);case"D":return m.$D;case"DD":return R.s(m.$D,2,"0");case"d":return String(m.$W);case"dd":return J(f.weekdaysMin,m.$W,M,2);case"ddd":return J(f.weekdaysShort,m.$W,M,3);case"dddd":return M[m.$W];case"H":return String(A);case"HH":return R.s(A,2,"0");case"h":return X(1);case"hh":return X(2);case"a":return W(A,$,!0);case"A":return W(A,$,!1);case"m":return String($);case"mm":return R.s($,2,"0");case"s":return String(m.$s);case"ss":return R.s(m.$s,2,"0");case"SSS":return R.s(m.$ms,3,"0");case"Z":return O}return null}(F)||O.replace(":","")})},d.utcOffset=function(){return 15*-Math.round(this.$d.getTimezoneOffset()/15)},d.diff=function(l,m,f){var E,O=this,A=R.p(m),$=C(l),P=($.utcOffset()-this.utcOffset())*r,M=this-$,B=function(){return R.m(O,$)};switch(A){case x:E=B()/12;break;case u:E=B();break;case T:E=B()/3;break;case h:E=(M-P)/6048e5;break;case y:E=(M-P)/864e5;break;case b:E=M/s;break;case c:E=M/r;break;case i:E=M/n;break;default:E=M}return f?E:R.a(E)},d.daysInMonth=function(){return this.endOf(u).$D},d.$locale=function(){return z[this.$L]},d.locale=function(l,m){if(!l)return this.$L;var f=this.clone(),E=re(l,m,!0);return E&&(f.$L=E),f},d.clone=function(){return R.w(this.$d,this)},d.toDate=function(){return new Date(this.valueOf())},d.toJSON=function(){return this.isValid()?this.toISOString():null},d.toISOString=function(){return this.$d.toISOString()},d.toString=function(){return this.$d.toUTCString()},S}(),Me=se.prototype;return C.prototype=Me,[["$ms",o],["$s",i],["$m",c],["$H",b],["$W",y],["$M",u],["$y",x],["$D",p]].forEach(function(S){Me[S[1]]=function(d){return this.$g(d,S[0],S[1])}}),C.extend=function(S,d){return S.$i||(S(d,se,C),S.$i=!0),C},C.locale=re,C.isDayjs=ye,C.unix=function(S){return C(1e3*S)},C.en=z[G],C.Ls=z,C.p={},C})})(We);var yt=We.exports;const kn=mt(yt);function Ve(e,t){return function(){return e.apply(t,arguments)}}const{toString:wt}=Object.prototype,{getPrototypeOf:xe}=Object,le=(e=>t=>{const n=wt.call(t);return e[n]||(e[n]=n.slice(8,-1).toLowerCase())})(Object.create(null)),H=e=>(e=e.toLowerCase(),t=>le(t)===e),fe=e=>t=>typeof t===e,{isArray:Y}=Array,ee=fe("undefined");function bt(e){return e!==null&&!ee(e)&&e.constructor!==null&&!ee(e.constructor)&&j(e.constructor.isBuffer)&&e.constructor.isBuffer(e)}const Ke=H("ArrayBuffer");function St(e){let t;return typeof ArrayBuffer<"u"&&ArrayBuffer.isView?t=ArrayBuffer.isView(e):t=e&&e.buffer&&Ke(e.buffer),t}const Et=fe("string"),j=fe("function"),Ye=fe("number"),de=e=>e!==null&&typeof e=="object",Ot=e=>e===!0||e===!1,ie=e=>{if(le(e)!=="object")return!1;const t=xe(e);return(t===null||t===Object.prototype||Object.getPrototypeOf(t)===null)&&!(Symbol.toStringTag in e)&&!(Symbol.iterator in e)},gt=H("Date"),Rt=H("File"),At=H("Blob"),Tt=H("FileList"),xt=e=>de(e)&&j(e.pipe),$t=e=>{let t;return e&&(typeof FormData=="function"&&e instanceof FormData||j(e.append)&&((t=le(e))==="formdata"||t==="object"&&j(e.toString)&&e.toString()==="[object FormData]"))},Dt=H("URLSearchParams"),Nt=e=>e.trim?e.trim():e.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,"");function te(e,t,{allOwnKeys:n=!1}={}){if(e===null||typeof e>"u")return;let r,s;if(typeof e!="object"&&(e=[e]),Y(e))for(r=0,s=e.length;r<s;r++)t.call(null,e[r],r,e);else{const o=n?Object.getOwnPropertyNames(e):Object.keys(e),i=o.length;let c;for(r=0;r<i;r++)c=o[r],t.call(null,e[c],c,e)}}function Ge(e,t){t=t.toLowerCase();const n=Object.keys(e);let r=n.length,s;for(;r-- >0;)if(s=n[r],t===s.toLowerCase())return s;return null}const Xe=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:global,Ze=e=>!ee(e)&&e!==Xe;function Oe(){const{caseless:e}=Ze(this)&&this||{},t={},n=(r,s)=>{const o=e&&Ge(t,s)||s;ie(t[o])&&ie(r)?t[o]=Oe(t[o],r):ie(r)?t[o]=Oe({},r):Y(r)?t[o]=r.slice():t[o]=r};for(let r=0,s=arguments.length;r<s;r++)arguments[r]&&te(arguments[r],n);return t}const Ct=(e,t,n,{allOwnKeys:r}={})=>(te(t,(s,o)=>{n&&j(s)?e[o]=Ve(s,n):e[o]=s},{allOwnKeys:r}),e),Pt=e=>(e.charCodeAt(0)===65279&&(e=e.slice(1)),e),_t=(e,t,n,r)=>{e.prototype=Object.create(t.prototype,r),e.prototype.constructor=e,Object.defineProperty(e,"super",{value:t.prototype}),n&&Object.assign(e.prototype,n)},Mt=(e,t,n,r)=>{let s,o,i;const c={};if(t=t||{},e==null)return t;do{for(s=Object.getOwnPropertyNames(e),o=s.length;o-- >0;)i=s[o],(!r||r(i,e,t))&&!c[i]&&(t[i]=e[i],c[i]=!0);e=n!==!1&&xe(e)}while(e&&(!n||n(e,t))&&e!==Object.prototype);return t},Ft=(e,t,n)=>{e=String(e),(n===void 0||n>e.length)&&(n=e.length),n-=t.length;const r=e.indexOf(t,n);return r!==-1&&r===n},Lt=e=>{if(!e)return null;if(Y(e))return e;let t=e.length;if(!Ye(t))return null;const n=new Array(t);for(;t-- >0;)n[t]=e[t];return n},Bt=(e=>t=>e&&t instanceof e)(typeof Uint8Array<"u"&&xe(Uint8Array)),jt=(e,t)=>{const r=(e&&e[Symbol.iterator]).call(e);let s;for(;(s=r.next())&&!s.done;){const o=s.value;t.call(e,o[0],o[1])}},Ut=(e,t)=>{let n;const r=[];for(;(n=e.exec(t))!==null;)r.push(n);return r},kt=H("HTMLFormElement"),Ht=e=>e.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g,function(n,r,s){return r.toUpperCase()+s}),Le=(({hasOwnProperty:e})=>(t,n)=>e.call(t,n))(Object.prototype),It=H("RegExp"),Qe=(e,t)=>{const n=Object.getOwnPropertyDescriptors(e),r={};te(n,(s,o)=>{let i;(i=t(s,o,e))!==!1&&(r[o]=i||s)}),Object.defineProperties(e,r)},vt=e=>{Qe(e,(t,n)=>{if(j(e)&&["arguments","caller","callee"].indexOf(n)!==-1)return!1;const r=e[n];if(j(r)){if(t.enumerable=!1,"writable"in t){t.writable=!1;return}t.set||(t.set=()=>{throw Error("Can not rewrite read-only method '"+n+"'")})}})},qt=(e,t)=>{const n={},r=s=>{s.forEach(o=>{n[o]=!0})};return Y(e)?r(e):r(String(e).split(t)),n},zt=()=>{},Jt=(e,t)=>(e=+e,Number.isFinite(e)?e:t),we="abcdefghijklmnopqrstuvwxyz",Be="0123456789",et={DIGIT:Be,ALPHA:we,ALPHA_DIGIT:we+we.toUpperCase()+Be},Wt=(e=16,t=et.ALPHA_DIGIT)=>{let n="";const{length:r}=t;for(;e--;)n+=t[Math.random()*r|0];return n};function Vt(e){return!!(e&&j(e.append)&&e[Symbol.toStringTag]==="FormData"&&e[Symbol.iterator])}const Kt=e=>{const t=new Array(10),n=(r,s)=>{if(de(r)){if(t.indexOf(r)>=0)return;if(!("toJSON"in r)){t[s]=r;const o=Y(r)?[]:{};return te(r,(i,c)=>{const b=n(i,s+1);!ee(b)&&(o[c]=b)}),t[s]=void 0,o}}return r};return n(e,0)},Yt=H("AsyncFunction"),Gt=e=>e&&(de(e)||j(e))&&j(e.then)&&j(e.catch),a={isArray:Y,isArrayBuffer:Ke,isBuffer:bt,isFormData:$t,isArrayBufferView:St,isString:Et,isNumber:Ye,isBoolean:Ot,isObject:de,isPlainObject:ie,isUndefined:ee,isDate:gt,isFile:Rt,isBlob:At,isRegExp:It,isFunction:j,isStream:xt,isURLSearchParams:Dt,isTypedArray:Bt,isFileList:Tt,forEach:te,merge:Oe,extend:Ct,trim:Nt,stripBOM:Pt,inherits:_t,toFlatObject:Mt,kindOf:le,kindOfTest:H,endsWith:Ft,toArray:Lt,forEachEntry:jt,matchAll:Ut,isHTMLForm:kt,hasOwnProperty:Le,hasOwnProp:Le,reduceDescriptors:Qe,freezeMethods:vt,toObjectSet:qt,toCamelCase:Ht,noop:zt,toFiniteNumber:Jt,findKey:Ge,global:Xe,isContextDefined:Ze,ALPHABET:et,generateString:Wt,isSpecCompliantForm:Vt,toJSONObject:Kt,isAsyncFn:Yt,isThenable:Gt};function g(e,t,n,r,s){Error.call(this),Error.captureStackTrace?Error.captureStackTrace(this,this.constructor):this.stack=new Error().stack,this.message=e,this.name="AxiosError",t&&(this.code=t),n&&(this.config=n),r&&(this.request=r),s&&(this.response=s)}a.inherits(g,Error,{toJSON:function(){return{message:this.message,name:this.name,description:this.description,number:this.number,fileName:this.fileName,lineNumber:this.lineNumber,columnNumber:this.columnNumber,stack:this.stack,config:a.toJSONObject(this.config),code:this.code,status:this.response&&this.response.status?this.response.status:null}}});const tt=g.prototype,nt={};["ERR_BAD_OPTION_VALUE","ERR_BAD_OPTION","ECONNABORTED","ETIMEDOUT","ERR_NETWORK","ERR_FR_TOO_MANY_REDIRECTS","ERR_DEPRECATED","ERR_BAD_RESPONSE","ERR_BAD_REQUEST","ERR_CANCELED","ERR_NOT_SUPPORT","ERR_INVALID_URL"].forEach(e=>{nt[e]={value:e}});Object.defineProperties(g,nt);Object.defineProperty(tt,"isAxiosError",{value:!0});g.from=(e,t,n,r,s,o)=>{const i=Object.create(tt);return a.toFlatObject(e,i,function(b){return b!==Error.prototype},c=>c!=="isAxiosError"),g.call(i,e.message,t,n,r,s),i.cause=e,i.name=e.name,o&&Object.assign(i,o),i};const Xt=null;function ge(e){return a.isPlainObject(e)||a.isArray(e)}function rt(e){return a.endsWith(e,"[]")?e.slice(0,-2):e}function je(e,t,n){return e?e.concat(t).map(function(s,o){return s=rt(s),!n&&o?"["+s+"]":s}).join(n?".":""):t}function Zt(e){return a.isArray(e)&&!e.some(ge)}const Qt=a.toFlatObject(a,{},null,function(t){return/^is[A-Z]/.test(t)});function he(e,t,n){if(!a.isObject(e))throw new TypeError("target must be an object");t=t||new FormData,n=a.toFlatObject(n,{metaTokens:!0,dots:!1,indexes:!1},!1,function(w,N){return!a.isUndefined(N[w])});const r=n.metaTokens,s=n.visitor||h,o=n.dots,i=n.indexes,b=(n.Blob||typeof Blob<"u"&&Blob)&&a.isSpecCompliantForm(t);if(!a.isFunction(s))throw new TypeError("visitor must be a function");function y(p){if(p===null)return"";if(a.isDate(p))return p.toISOString();if(!b&&a.isBlob(p))throw new g("Blob is not supported. Use a Buffer instead.");return a.isArrayBuffer(p)||a.isTypedArray(p)?b&&typeof Blob=="function"?new Blob([p]):Buffer.from(p):p}function h(p,w,N){let _=p;if(p&&!N&&typeof p=="object"){if(a.endsWith(w,"{}"))w=r?w:w.slice(0,-2),p=JSON.stringify(p);else if(a.isArray(p)&&Zt(p)||(a.isFileList(p)||a.endsWith(w,"[]"))&&(_=a.toArray(p)))return w=rt(w),_.forEach(function(L,me){!(a.isUndefined(L)||L===null)&&t.append(i===!0?je([w],me,o):i===null?w:w+"[]",y(L))}),!1}return ge(p)?!0:(t.append(je(N,w,o),y(p)),!1)}const u=[],T=Object.assign(Qt,{defaultVisitor:h,convertValue:y,isVisitable:ge});function x(p,w){if(!a.isUndefined(p)){if(u.indexOf(p)!==-1)throw Error("Circular reference detected in "+w.join("."));u.push(p),a.forEach(p,function(_,U){(!(a.isUndefined(_)||_===null)&&s.call(t,_,a.isString(U)?U.trim():U,w,T))===!0&&x(_,w?w.concat(U):[U])}),u.pop()}}if(!a.isObject(e))throw new TypeError("data must be an object");return x(e),t}function Ue(e){const t={"!":"%21","'":"%27","(":"%28",")":"%29","~":"%7E","%20":"+","%00":"\0"};return encodeURIComponent(e).replace(/[!'()~]|%20|%00/g,function(r){return t[r]})}function $e(e,t){this._pairs=[],e&&he(e,this,t)}const st=$e.prototype;st.append=function(t,n){this._pairs.push([t,n])};st.toString=function(t){const n=t?function(r){return t.call(this,r,Ue)}:Ue;return this._pairs.map(function(s){return n(s[0])+"="+n(s[1])},"").join("&")};function en(e){return encodeURIComponent(e).replace(/%3A/gi,":").replace(/%24/g,"$").replace(/%2C/gi,",").replace(/%20/g,"+").replace(/%5B/gi,"[").replace(/%5D/gi,"]")}function ot(e,t,n){if(!t)return e;const r=n&&n.encode||en,s=n&&n.serialize;let o;if(s?o=s(t,n):o=a.isURLSearchParams(t)?t.toString():new $e(t,n).toString(r),o){const i=e.indexOf("#");i!==-1&&(e=e.slice(0,i)),e+=(e.indexOf("?")===-1?"?":"&")+o}return e}class tn{constructor(){this.handlers=[]}use(t,n,r){return this.handlers.push({fulfilled:t,rejected:n,synchronous:r?r.synchronous:!1,runWhen:r?r.runWhen:null}),this.handlers.length-1}eject(t){this.handlers[t]&&(this.handlers[t]=null)}clear(){this.handlers&&(this.handlers=[])}forEach(t){a.forEach(this.handlers,function(r){r!==null&&t(r)})}}const ke=tn,it={silentJSONParsing:!0,forcedJSONParsing:!0,clarifyTimeoutError:!1},nn=typeof URLSearchParams<"u"?URLSearchParams:$e,rn=typeof FormData<"u"?FormData:null,sn=typeof Blob<"u"?Blob:null,on={isBrowser:!0,classes:{URLSearchParams:nn,FormData:rn,Blob:sn},protocols:["http","https","file","blob","url","data"]},at=typeof window<"u"&&typeof document<"u",an=(e=>at&&["ReactNative","NativeScript","NS"].indexOf(e)<0)(typeof navigator<"u"&&navigator.product),un=typeof WorkerGlobalScope<"u"&&self instanceof WorkerGlobalScope&&typeof self.importScripts=="function",cn=Object.freeze(Object.defineProperty({__proto__:null,hasBrowserEnv:at,hasStandardBrowserEnv:an,hasStandardBrowserWebWorkerEnv:un},Symbol.toStringTag,{value:"Module"})),k={...cn,...on};function ln(e,t){return he(e,new k.classes.URLSearchParams,Object.assign({visitor:function(n,r,s,o){return k.isNode&&a.isBuffer(n)?(this.append(r,n.toString("base64")),!1):o.defaultVisitor.apply(this,arguments)}},t))}function fn(e){return a.matchAll(/\w+|\[(\w*)]/g,e).map(t=>t[0]==="[]"?"":t[1]||t[0])}function dn(e){const t={},n=Object.keys(e);let r;const s=n.length;let o;for(r=0;r<s;r++)o=n[r],t[o]=e[o];return t}function ut(e){function t(n,r,s,o){let i=n[o++];const c=Number.isFinite(+i),b=o>=n.length;return i=!i&&a.isArray(s)?s.length:i,b?(a.hasOwnProp(s,i)?s[i]=[s[i],r]:s[i]=r,!c):((!s[i]||!a.isObject(s[i]))&&(s[i]=[]),t(n,r,s[i],o)&&a.isArray(s[i])&&(s[i]=dn(s[i])),!c)}if(a.isFormData(e)&&a.isFunction(e.entries)){const n={};return a.forEachEntry(e,(r,s)=>{t(fn(r),s,n,0)}),n}return null}function hn(e,t,n){if(a.isString(e))try{return(t||JSON.parse)(e),a.trim(e)}catch(r){if(r.name!=="SyntaxError")throw r}return(n||JSON.stringify)(e)}const De={transitional:it,adapter:["xhr","http"],transformRequest:[function(t,n){const r=n.getContentType()||"",s=r.indexOf("application/json")>-1,o=a.isObject(t);if(o&&a.isHTMLForm(t)&&(t=new FormData(t)),a.isFormData(t))return s&&s?JSON.stringify(ut(t)):t;if(a.isArrayBuffer(t)||a.isBuffer(t)||a.isStream(t)||a.isFile(t)||a.isBlob(t))return t;if(a.isArrayBufferView(t))return t.buffer;if(a.isURLSearchParams(t))return n.setContentType("application/x-www-form-urlencoded;charset=utf-8",!1),t.toString();let c;if(o){if(r.indexOf("application/x-www-form-urlencoded")>-1)return ln(t,this.formSerializer).toString();if((c=a.isFileList(t))||r.indexOf("multipart/form-data")>-1){const b=this.env&&this.env.FormData;return he(c?{"files[]":t}:t,b&&new b,this.formSerializer)}}return o||s?(n.setContentType("application/json",!1),hn(t)):t}],transformResponse:[function(t){const n=this.transitional||De.transitional,r=n&&n.forcedJSONParsing,s=this.responseType==="json";if(t&&a.isString(t)&&(r&&!this.responseType||s)){const i=!(n&&n.silentJSONParsing)&&s;try{return JSON.parse(t)}catch(c){if(i)throw c.name==="SyntaxError"?g.from(c,g.ERR_BAD_RESPONSE,this,null,this.response):c}}return t}],timeout:0,xsrfCookieName:"XSRF-TOKEN",xsrfHeaderName:"X-XSRF-TOKEN",maxContentLength:-1,maxBodyLength:-1,env:{FormData:k.classes.FormData,Blob:k.classes.Blob},validateStatus:function(t){return t>=200&&t<300},headers:{common:{Accept:"application/json, text/plain, */*","Content-Type":void 0}}};a.forEach(["delete","get","head","post","put","patch"],e=>{De.headers[e]={}});const Ne=De,pn=a.toObjectSet(["age","authorization","content-length","content-type","etag","expires","from","host","if-modified-since","if-unmodified-since","last-modified","location","max-forwards","proxy-authorization","referer","retry-after","user-agent"]),mn=e=>{const t={};let n,r,s;return e&&e.split(`
`).forEach(function(i){s=i.indexOf(":"),n=i.substring(0,s).trim().toLowerCase(),r=i.substring(s+1).trim(),!(!n||t[n]&&pn[n])&&(n==="set-cookie"?t[n]?t[n].push(r):t[n]=[r]:t[n]=t[n]?t[n]+", "+r:r)}),t},He=Symbol("internals");function Q(e){return e&&String(e).trim().toLowerCase()}function ae(e){return e===!1||e==null?e:a.isArray(e)?e.map(ae):String(e)}function yn(e){const t=Object.create(null),n=/([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;let r;for(;r=n.exec(e);)t[r[1]]=r[2];return t}const wn=e=>/^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(e.trim());function be(e,t,n,r,s){if(a.isFunction(r))return r.call(this,t,n);if(s&&(t=n),!!a.isString(t)){if(a.isString(r))return t.indexOf(r)!==-1;if(a.isRegExp(r))return r.test(t)}}function bn(e){return e.trim().toLowerCase().replace(/([a-z\d])(\w*)/g,(t,n,r)=>n.toUpperCase()+r)}function Sn(e,t){const n=a.toCamelCase(" "+t);["get","set","has"].forEach(r=>{Object.defineProperty(e,r+n,{value:function(s,o,i){return this[r].call(this,t,s,o,i)},configurable:!0})})}class pe{constructor(t){t&&this.set(t)}set(t,n,r){const s=this;function o(c,b,y){const h=Q(b);if(!h)throw new Error("header name must be a non-empty string");const u=a.findKey(s,h);(!u||s[u]===void 0||y===!0||y===void 0&&s[u]!==!1)&&(s[u||b]=ae(c))}const i=(c,b)=>a.forEach(c,(y,h)=>o(y,h,b));return a.isPlainObject(t)||t instanceof this.constructor?i(t,n):a.isString(t)&&(t=t.trim())&&!wn(t)?i(mn(t),n):t!=null&&o(n,t,r),this}get(t,n){if(t=Q(t),t){const r=a.findKey(this,t);if(r){const s=this[r];if(!n)return s;if(n===!0)return yn(s);if(a.isFunction(n))return n.call(this,s,r);if(a.isRegExp(n))return n.exec(s);throw new TypeError("parser must be boolean|regexp|function")}}}has(t,n){if(t=Q(t),t){const r=a.findKey(this,t);return!!(r&&this[r]!==void 0&&(!n||be(this,this[r],r,n)))}return!1}delete(t,n){const r=this;let s=!1;function o(i){if(i=Q(i),i){const c=a.findKey(r,i);c&&(!n||be(r,r[c],c,n))&&(delete r[c],s=!0)}}return a.isArray(t)?t.forEach(o):o(t),s}clear(t){const n=Object.keys(this);let r=n.length,s=!1;for(;r--;){const o=n[r];(!t||be(this,this[o],o,t,!0))&&(delete this[o],s=!0)}return s}normalize(t){const n=this,r={};return a.forEach(this,(s,o)=>{const i=a.findKey(r,o);if(i){n[i]=ae(s),delete n[o];return}const c=t?bn(o):String(o).trim();c!==o&&delete n[o],n[c]=ae(s),r[c]=!0}),this}concat(...t){return this.constructor.concat(this,...t)}toJSON(t){const n=Object.create(null);return a.forEach(this,(r,s)=>{r!=null&&r!==!1&&(n[s]=t&&a.isArray(r)?r.join(", "):r)}),n}[Symbol.iterator](){return Object.entries(this.toJSON())[Symbol.iterator]()}toString(){return Object.entries(this.toJSON()).map(([t,n])=>t+": "+n).join(`
`)}get[Symbol.toStringTag](){return"AxiosHeaders"}static from(t){return t instanceof this?t:new this(t)}static concat(t,...n){const r=new this(t);return n.forEach(s=>r.set(s)),r}static accessor(t){const r=(this[He]=this[He]={accessors:{}}).accessors,s=this.prototype;function o(i){const c=Q(i);r[c]||(Sn(s,i),r[c]=!0)}return a.isArray(t)?t.forEach(o):o(t),this}}pe.accessor(["Content-Type","Content-Length","Accept","Accept-Encoding","User-Agent","Authorization"]);a.reduceDescriptors(pe.prototype,({value:e},t)=>{let n=t[0].toUpperCase()+t.slice(1);return{get:()=>e,set(r){this[n]=r}}});a.freezeMethods(pe);const I=pe;function Se(e,t){const n=this||Ne,r=t||n,s=I.from(r.headers);let o=r.data;return a.forEach(e,function(c){o=c.call(n,o,s.normalize(),t?t.status:void 0)}),s.normalize(),o}function ct(e){return!!(e&&e.__CANCEL__)}function ne(e,t,n){g.call(this,e??"canceled",g.ERR_CANCELED,t,n),this.name="CanceledError"}a.inherits(ne,g,{__CANCEL__:!0});function En(e,t,n){const r=n.config.validateStatus;!n.status||!r||r(n.status)?e(n):t(new g("Request failed with status code "+n.status,[g.ERR_BAD_REQUEST,g.ERR_BAD_RESPONSE][Math.floor(n.status/100)-4],n.config,n.request,n))}const On=k.hasStandardBrowserEnv?{write(e,t,n,r,s,o){const i=[e+"="+encodeURIComponent(t)];a.isNumber(n)&&i.push("expires="+new Date(n).toGMTString()),a.isString(r)&&i.push("path="+r),a.isString(s)&&i.push("domain="+s),o===!0&&i.push("secure"),document.cookie=i.join("; ")},read(e){const t=document.cookie.match(new RegExp("(^|;\\s*)("+e+")=([^;]*)"));return t?decodeURIComponent(t[3]):null},remove(e){this.write(e,"",Date.now()-864e5)}}:{write(){},read(){return null},remove(){}};function gn(e){return/^([a-z][a-z\d+\-.]*:)?\/\//i.test(e)}function Rn(e,t){return t?e.replace(/\/+$/,"")+"/"+t.replace(/^\/+/,""):e}function lt(e,t){return e&&!gn(t)?Rn(e,t):t}const An=k.hasStandardBrowserEnv?function(){const t=/(msie|trident)/i.test(navigator.userAgent),n=document.createElement("a");let r;function s(o){let i=o;return t&&(n.setAttribute("href",i),i=n.href),n.setAttribute("href",i),{href:n.href,protocol:n.protocol?n.protocol.replace(/:$/,""):"",host:n.host,search:n.search?n.search.replace(/^\?/,""):"",hash:n.hash?n.hash.replace(/^#/,""):"",hostname:n.hostname,port:n.port,pathname:n.pathname.charAt(0)==="/"?n.pathname:"/"+n.pathname}}return r=s(window.location.href),function(i){const c=a.isString(i)?s(i):i;return c.protocol===r.protocol&&c.host===r.host}}():function(){return function(){return!0}}();function Tn(e){const t=/^([-+\w]{1,25})(:?\/\/|:)/.exec(e);return t&&t[1]||""}function xn(e,t){e=e||10;const n=new Array(e),r=new Array(e);let s=0,o=0,i;return t=t!==void 0?t:1e3,function(b){const y=Date.now(),h=r[o];i||(i=y),n[s]=b,r[s]=y;let u=o,T=0;for(;u!==s;)T+=n[u++],u=u%e;if(s=(s+1)%e,s===o&&(o=(o+1)%e),y-i<t)return;const x=h&&y-h;return x?Math.round(T*1e3/x):void 0}}function Ie(e,t){let n=0;const r=xn(50,250);return s=>{const o=s.loaded,i=s.lengthComputable?s.total:void 0,c=o-n,b=r(c),y=o<=i;n=o;const h={loaded:o,total:i,progress:i?o/i:void 0,bytes:c,rate:b||void 0,estimated:b&&i&&y?(i-o)/b:void 0,event:s};h[t?"download":"upload"]=!0,e(h)}}const $n=typeof XMLHttpRequest<"u",Dn=$n&&function(e){return new Promise(function(n,r){let s=e.data;const o=I.from(e.headers).normalize();let{responseType:i,withXSRFToken:c}=e,b;function y(){e.cancelToken&&e.cancelToken.unsubscribe(b),e.signal&&e.signal.removeEventListener("abort",b)}let h;if(a.isFormData(s)){if(k.hasStandardBrowserEnv||k.hasStandardBrowserWebWorkerEnv)o.setContentType(!1);else if((h=o.getContentType())!==!1){const[w,...N]=h?h.split(";").map(_=>_.trim()).filter(Boolean):[];o.setContentType([w||"multipart/form-data",...N].join("; "))}}let u=new XMLHttpRequest;if(e.auth){const w=e.auth.username||"",N=e.auth.password?unescape(encodeURIComponent(e.auth.password)):"";o.set("Authorization","Basic "+btoa(w+":"+N))}const T=lt(e.baseURL,e.url);u.open(e.method.toUpperCase(),ot(T,e.params,e.paramsSerializer),!0),u.timeout=e.timeout;function x(){if(!u)return;const w=I.from("getAllResponseHeaders"in u&&u.getAllResponseHeaders()),_={data:!i||i==="text"||i==="json"?u.responseText:u.response,status:u.status,statusText:u.statusText,headers:w,config:e,request:u};En(function(L){n(L),y()},function(L){r(L),y()},_),u=null}if("onloadend"in u?u.onloadend=x:u.onreadystatechange=function(){!u||u.readyState!==4||u.status===0&&!(u.responseURL&&u.responseURL.indexOf("file:")===0)||setTimeout(x)},u.onabort=function(){u&&(r(new g("Request aborted",g.ECONNABORTED,e,u)),u=null)},u.onerror=function(){r(new g("Network Error",g.ERR_NETWORK,e,u)),u=null},u.ontimeout=function(){let N=e.timeout?"timeout of "+e.timeout+"ms exceeded":"timeout exceeded";const _=e.transitional||it;e.timeoutErrorMessage&&(N=e.timeoutErrorMessage),r(new g(N,_.clarifyTimeoutError?g.ETIMEDOUT:g.ECONNABORTED,e,u)),u=null},k.hasStandardBrowserEnv&&(c&&a.isFunction(c)&&(c=c(e)),c||c!==!1&&An(T))){const w=e.xsrfHeaderName&&e.xsrfCookieName&&On.read(e.xsrfCookieName);w&&o.set(e.xsrfHeaderName,w)}s===void 0&&o.setContentType(null),"setRequestHeader"in u&&a.forEach(o.toJSON(),function(N,_){u.setRequestHeader(_,N)}),a.isUndefined(e.withCredentials)||(u.withCredentials=!!e.withCredentials),i&&i!=="json"&&(u.responseType=e.responseType),typeof e.onDownloadProgress=="function"&&u.addEventListener("progress",Ie(e.onDownloadProgress,!0)),typeof e.onUploadProgress=="function"&&u.upload&&u.upload.addEventListener("progress",Ie(e.onUploadProgress)),(e.cancelToken||e.signal)&&(b=w=>{u&&(r(!w||w.type?new ne(null,e,u):w),u.abort(),u=null)},e.cancelToken&&e.cancelToken.subscribe(b),e.signal&&(e.signal.aborted?b():e.signal.addEventListener("abort",b)));const p=Tn(T);if(p&&k.protocols.indexOf(p)===-1){r(new g("Unsupported protocol "+p+":",g.ERR_BAD_REQUEST,e));return}u.send(s||null)})},Re={http:Xt,xhr:Dn};a.forEach(Re,(e,t)=>{if(e){try{Object.defineProperty(e,"name",{value:t})}catch{}Object.defineProperty(e,"adapterName",{value:t})}});const ve=e=>`- ${e}`,Nn=e=>a.isFunction(e)||e===null||e===!1,ft={getAdapter:e=>{e=a.isArray(e)?e:[e];const{length:t}=e;let n,r;const s={};for(let o=0;o<t;o++){n=e[o];let i;if(r=n,!Nn(n)&&(r=Re[(i=String(n)).toLowerCase()],r===void 0))throw new g(`Unknown adapter '${i}'`);if(r)break;s[i||"#"+o]=r}if(!r){const o=Object.entries(s).map(([c,b])=>`adapter ${c} `+(b===!1?"is not supported by the environment":"is not available in the build"));let i=t?o.length>1?`since :
`+o.map(ve).join(`
`):" "+ve(o[0]):"as no adapter specified";throw new g("There is no suitable adapter to dispatch the request "+i,"ERR_NOT_SUPPORT")}return r},adapters:Re};function Ee(e){if(e.cancelToken&&e.cancelToken.throwIfRequested(),e.signal&&e.signal.aborted)throw new ne(null,e)}function qe(e){return Ee(e),e.headers=I.from(e.headers),e.data=Se.call(e,e.transformRequest),["post","put","patch"].indexOf(e.method)!==-1&&e.headers.setContentType("application/x-www-form-urlencoded",!1),ft.getAdapter(e.adapter||Ne.adapter)(e).then(function(r){return Ee(e),r.data=Se.call(e,e.transformResponse,r),r.headers=I.from(r.headers),r},function(r){return ct(r)||(Ee(e),r&&r.response&&(r.response.data=Se.call(e,e.transformResponse,r.response),r.response.headers=I.from(r.response.headers))),Promise.reject(r)})}const ze=e=>e instanceof I?e.toJSON():e;function K(e,t){t=t||{};const n={};function r(y,h,u){return a.isPlainObject(y)&&a.isPlainObject(h)?a.merge.call({caseless:u},y,h):a.isPlainObject(h)?a.merge({},h):a.isArray(h)?h.slice():h}function s(y,h,u){if(a.isUndefined(h)){if(!a.isUndefined(y))return r(void 0,y,u)}else return r(y,h,u)}function o(y,h){if(!a.isUndefined(h))return r(void 0,h)}function i(y,h){if(a.isUndefined(h)){if(!a.isUndefined(y))return r(void 0,y)}else return r(void 0,h)}function c(y,h,u){if(u in t)return r(y,h);if(u in e)return r(void 0,y)}const b={url:o,method:o,data:o,baseURL:i,transformRequest:i,transformResponse:i,paramsSerializer:i,timeout:i,timeoutMessage:i,withCredentials:i,withXSRFToken:i,adapter:i,responseType:i,xsrfCookieName:i,xsrfHeaderName:i,onUploadProgress:i,onDownloadProgress:i,decompress:i,maxContentLength:i,maxBodyLength:i,beforeRedirect:i,transport:i,httpAgent:i,httpsAgent:i,cancelToken:i,socketPath:i,responseEncoding:i,validateStatus:c,headers:(y,h)=>s(ze(y),ze(h),!0)};return a.forEach(Object.keys(Object.assign({},e,t)),function(h){const u=b[h]||s,T=u(e[h],t[h],h);a.isUndefined(T)&&u!==c||(n[h]=T)}),n}const dt="1.6.2",Ce={};["object","boolean","number","function","string","symbol"].forEach((e,t)=>{Ce[e]=function(r){return typeof r===e||"a"+(t<1?"n ":" ")+e}});const Je={};Ce.transitional=function(t,n,r){function s(o,i){return"[Axios v"+dt+"] Transitional option '"+o+"'"+i+(r?". "+r:"")}return(o,i,c)=>{if(t===!1)throw new g(s(i," has been removed"+(n?" in "+n:"")),g.ERR_DEPRECATED);return n&&!Je[i]&&(Je[i]=!0,console.warn(s(i," has been deprecated since v"+n+" and will be removed in the near future"))),t?t(o,i,c):!0}};function Cn(e,t,n){if(typeof e!="object")throw new g("options must be an object",g.ERR_BAD_OPTION_VALUE);const r=Object.keys(e);let s=r.length;for(;s-- >0;){const o=r[s],i=t[o];if(i){const c=e[o],b=c===void 0||i(c,o,e);if(b!==!0)throw new g("option "+o+" must be "+b,g.ERR_BAD_OPTION_VALUE);continue}if(n!==!0)throw new g("Unknown option "+o,g.ERR_BAD_OPTION)}}const Ae={assertOptions:Cn,validators:Ce},q=Ae.validators;class ce{constructor(t){this.defaults=t,this.interceptors={request:new ke,response:new ke}}request(t,n){typeof t=="string"?(n=n||{},n.url=t):n=t||{},n=K(this.defaults,n);const{transitional:r,paramsSerializer:s,headers:o}=n;r!==void 0&&Ae.assertOptions(r,{silentJSONParsing:q.transitional(q.boolean),forcedJSONParsing:q.transitional(q.boolean),clarifyTimeoutError:q.transitional(q.boolean)},!1),s!=null&&(a.isFunction(s)?n.paramsSerializer={serialize:s}:Ae.assertOptions(s,{encode:q.function,serialize:q.function},!0)),n.method=(n.method||this.defaults.method||"get").toLowerCase();let i=o&&a.merge(o.common,o[n.method]);o&&a.forEach(["delete","get","head","post","put","patch","common"],p=>{delete o[p]}),n.headers=I.concat(i,o);const c=[];let b=!0;this.interceptors.request.forEach(function(w){typeof w.runWhen=="function"&&w.runWhen(n)===!1||(b=b&&w.synchronous,c.unshift(w.fulfilled,w.rejected))});const y=[];this.interceptors.response.forEach(function(w){y.push(w.fulfilled,w.rejected)});let h,u=0,T;if(!b){const p=[qe.bind(this),void 0];for(p.unshift.apply(p,c),p.push.apply(p,y),T=p.length,h=Promise.resolve(n);u<T;)h=h.then(p[u++],p[u++]);return h}T=c.length;let x=n;for(u=0;u<T;){const p=c[u++],w=c[u++];try{x=p(x)}catch(N){w.call(this,N);break}}try{h=qe.call(this,x)}catch(p){return Promise.reject(p)}for(u=0,T=y.length;u<T;)h=h.then(y[u++],y[u++]);return h}getUri(t){t=K(this.defaults,t);const n=lt(t.baseURL,t.url);return ot(n,t.params,t.paramsSerializer)}}a.forEach(["delete","get","head","options"],function(t){ce.prototype[t]=function(n,r){return this.request(K(r||{},{method:t,url:n,data:(r||{}).data}))}});a.forEach(["post","put","patch"],function(t){function n(r){return function(o,i,c){return this.request(K(c||{},{method:t,headers:r?{"Content-Type":"multipart/form-data"}:{},url:o,data:i}))}}ce.prototype[t]=n(),ce.prototype[t+"Form"]=n(!0)});const ue=ce;class Pe{constructor(t){if(typeof t!="function")throw new TypeError("executor must be a function.");let n;this.promise=new Promise(function(o){n=o});const r=this;this.promise.then(s=>{if(!r._listeners)return;let o=r._listeners.length;for(;o-- >0;)r._listeners[o](s);r._listeners=null}),this.promise.then=s=>{let o;const i=new Promise(c=>{r.subscribe(c),o=c}).then(s);return i.cancel=function(){r.unsubscribe(o)},i},t(function(o,i,c){r.reason||(r.reason=new ne(o,i,c),n(r.reason))})}throwIfRequested(){if(this.reason)throw this.reason}subscribe(t){if(this.reason){t(this.reason);return}this._listeners?this._listeners.push(t):this._listeners=[t]}unsubscribe(t){if(!this._listeners)return;const n=this._listeners.indexOf(t);n!==-1&&this._listeners.splice(n,1)}static source(){let t;return{token:new Pe(function(s){t=s}),cancel:t}}}const Pn=Pe;function _n(e){return function(n){return e.apply(null,n)}}function Mn(e){return a.isObject(e)&&e.isAxiosError===!0}const Te={Continue:100,SwitchingProtocols:101,Processing:102,EarlyHints:103,Ok:200,Created:201,Accepted:202,NonAuthoritativeInformation:203,NoContent:204,ResetContent:205,PartialContent:206,MultiStatus:207,AlreadyReported:208,ImUsed:226,MultipleChoices:300,MovedPermanently:301,Found:302,SeeOther:303,NotModified:304,UseProxy:305,Unused:306,TemporaryRedirect:307,PermanentRedirect:308,BadRequest:400,Unauthorized:401,PaymentRequired:402,Forbidden:403,NotFound:404,MethodNotAllowed:405,NotAcceptable:406,ProxyAuthenticationRequired:407,RequestTimeout:408,Conflict:409,Gone:410,LengthRequired:411,PreconditionFailed:412,PayloadTooLarge:413,UriTooLong:414,UnsupportedMediaType:415,RangeNotSatisfiable:416,ExpectationFailed:417,ImATeapot:418,MisdirectedRequest:421,UnprocessableEntity:422,Locked:423,FailedDependency:424,TooEarly:425,UpgradeRequired:426,PreconditionRequired:428,TooManyRequests:429,RequestHeaderFieldsTooLarge:431,UnavailableForLegalReasons:451,InternalServerError:500,NotImplemented:501,BadGateway:502,ServiceUnavailable:503,GatewayTimeout:504,HttpVersionNotSupported:505,VariantAlsoNegotiates:506,InsufficientStorage:507,LoopDetected:508,NotExtended:510,NetworkAuthenticationRequired:511};Object.entries(Te).forEach(([e,t])=>{Te[t]=e});const Fn=Te;function ht(e){const t=new ue(e),n=Ve(ue.prototype.request,t);return a.extend(n,ue.prototype,t,{allOwnKeys:!0}),a.extend(n,t,null,{allOwnKeys:!0}),n.create=function(s){return ht(K(e,s))},n}const D=ht(Ne);D.Axios=ue;D.CanceledError=ne;D.CancelToken=Pn;D.isCancel=ct;D.VERSION=dt;D.toFormData=he;D.AxiosError=g;D.Cancel=D.CanceledError;D.all=function(t){return Promise.all(t)};D.spread=_n;D.isAxiosError=Mn;D.mergeConfig=K;D.AxiosHeaders=I;D.formToJSON=e=>ut(a.isHTMLForm(e)?new FormData(e):e);D.getAdapter=ft.getAdapter;D.HttpStatusCode=Fn;D.default=D;const Hn=D;export{Hn as a,Un as b,pt as c,kn as d,jn as e,yt as f,mt as g,Ln as m,Bn as s};
