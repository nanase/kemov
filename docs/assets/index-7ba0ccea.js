import{g as P}from"./axios-6631662c.js";function Y(e){return e==null?"":e.toString().replace(/\B(?=(\d{3})+(?!\d))/g,",")}const v=new Set(["ENOTFOUND","ENETUNREACH","UNABLE_TO_GET_ISSUER_CERT","UNABLE_TO_GET_CRL","UNABLE_TO_DECRYPT_CERT_SIGNATURE","UNABLE_TO_DECRYPT_CRL_SIGNATURE","UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY","CERT_SIGNATURE_FAILURE","CRL_SIGNATURE_FAILURE","CERT_NOT_YET_VALID","CERT_HAS_EXPIRED","CRL_NOT_YET_VALID","CRL_HAS_EXPIRED","ERROR_IN_CERT_NOT_BEFORE_FIELD","ERROR_IN_CERT_NOT_AFTER_FIELD","ERROR_IN_CRL_LAST_UPDATE_FIELD","ERROR_IN_CRL_NEXT_UPDATE_FIELD","OUT_OF_MEM","DEPTH_ZERO_SELF_SIGNED_CERT","SELF_SIGNED_CERT_IN_CHAIN","UNABLE_TO_GET_ISSUER_CERT_LOCALLY","UNABLE_TO_VERIFY_LEAF_SIGNATURE","CERT_CHAIN_TOO_LONG","CERT_REVOKED","INVALID_CA","PATH_LENGTH_EXCEEDED","INVALID_PURPOSE","CERT_UNTRUSTED","CERT_REJECTED","HOSTNAME_MISMATCH"]);var U=e=>!v.has(e&&e.code);const w=P(U);function d(e,t,r,n,E,u,s){try{var a=e[u](s),o=a.value}catch(R){r(R);return}a.done?t(o):Promise.resolve(o).then(n,E)}function y(e){return function(){var t=this,r=arguments;return new Promise(function(n,E){var u=e.apply(t,r);function s(o){d(u,n,E,s,a,"next",o)}function a(o){d(u,n,E,s,a,"throw",o)}s(void 0)})}}function C(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(E){return Object.getOwnPropertyDescriptor(e,E).enumerable})),r.push.apply(r,n)}return r}function N(e){for(var t=1;t<arguments.length;t++){var r=arguments[t]!=null?arguments[t]:{};t%2?C(Object(r),!0).forEach(function(n){F(e,n,r[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):C(Object(r)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(r,n))})}return e}function F(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}var T="axios-retry";function A(e){var t=["ERR_CANCELED","ECONNABORTED"];return!e.response&&!!e.code&&!t.includes(e.code)&&w(e)}var D=["get","head","options"],b=D.concat(["put","delete"]);function l(e){return e.code!=="ECONNABORTED"&&(!e.response||e.response.status>=500&&e.response.status<=599)}function G(e){return e.config?l(e)&&D.indexOf(e.config.method)!==-1:!1}function I(e){return e.config?l(e)&&b.indexOf(e.config.method)!==-1:!1}function S(e){return A(e)||I(e)}function H(){return 0}function q(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:0,t=arguments.length>2&&arguments[2]!==void 0?arguments[2]:100,r=Math.pow(2,e)*t,n=r*.2*Math.random();return r+n}function m(e){var t=e[T]||{};return t.retryCount=t.retryCount||0,e[T]=t,t}function B(e,t){return N(N({},t),e[T])}function j(e,t){e.defaults.agent===t.agent&&delete t.agent,e.defaults.httpAgent===t.httpAgent&&delete t.httpAgent,e.defaults.httpsAgent===t.httpsAgent&&delete t.httpsAgent}function x(e,t,r,n){return c.apply(this,arguments)}function c(){return c=y(function*(e,t,r,n){var E=r.retryCount<e&&t(n);if(typeof E=="object")try{var u=yield E;return u!==!1}catch{return!1}return E}),c.apply(this,arguments)}function _(e,t){var r=e.interceptors.request.use(E=>{var u=m(E);return u.lastRequestTime=Date.now(),E}),n=e.interceptors.response.use(null,function(){var E=y(function*(u){var{config:s}=u;if(!s)return Promise.reject(u);var{retries:a=3,retryCondition:o=S,retryDelay:R=H,shouldResetTimeout:L=!1,onRetry:g=()=>{}}=B(s,t),i=m(s);if(yield x(a,o,i,u)){i.retryCount+=1;var O=R(i.retryCount,u);if(j(e,s),!L&&s.timeout&&i.lastRequestTime){var h=Date.now()-i.lastRequestTime,p=s.timeout-h-O;if(p<=0)return Promise.reject(u);s.timeout=p}return s.transformRequest=[f=>f],yield g(i.retryCount,u,s),new Promise(f=>setTimeout(()=>f(e(s)),O))}return Promise.reject(u)});return function(u){return E.apply(this,arguments)}}());return{requestInterceptorId:r,responseInterceptorId:n}}_.isNetworkError=A;_.isSafeRequestError=G;_.isIdempotentRequestError=I;_.isNetworkOrIdempotentRequestError=S;_.exponentialDelay=q;_.isRetryableError=l;export{_ as a,Y as w};
