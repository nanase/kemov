import{S as ft,r as E,s as ht,y as vt,q as J,d as tt,ad as rt,b as z,c as B,u as r,n as nt,a0 as h,a1 as at,a2 as e,f as t,g as c,t as p,Z as o,h as ut,F as st,ae as _t,a5 as pt,a6 as gt}from"./kemov-runtime-dom.esm-bundler-729503b1.js";import{c as yt,g as bt,d as F,u as ot,a as K,s as j,m as xt}from"./kemov-axios-6631662c.js";import{w as D,a as lt}from"./kemov-index-f9db5d93.js";import{g as Ct,a as it,J as R}from"./kemov-date-ac89d2ae.js";import{u as $t}from"./miscDetail-a734e995.js";import{_ as kt}from"./kemov-_plugin-vue_export-helper-c27b6911.js";/* empty css                   */const wt=()=>{};function Q(s,v,g){let n;ft(g)?n={evaluating:g}:n=g||{};const{lazy:d=!1,evaluating:f=void 0,shallow:i=!0,onError:k=wt}=n,Y=E(!d),U=i?ht(v):E(v);let P=0;return vt(async H=>{if(!Y.value)return;P++;const V=P;let w=!1;f&&Promise.resolve().then(()=>{f.value=!0});try{const _=await s(M=>{H(()=>{f&&(f.value=!1),w||M()})});V===P&&(U.value=_)}catch(_){k(_)}finally{f&&V===P&&(f.value=!1),w=!0}}),d?J(()=>(Y.value=!0,U.value)):U}const Mt="https://nanase.cc/asset/kemov/channels.json",St="https://s3.ap-northeast-1.amazonaws.com/nanase.asset/kemov/stats.json",Ut="https://s3.ap-northeast-1.amazonaws.com/nanase.asset/kemov/stats/video/";function Pt(s){return`${Ut}${s}.json`}var ct={exports:{}};(function(s,v){(function(g,n){s.exports=n()})(yt,function(){var g,n,d=1e3,f=6e4,i=36e5,k=864e5,Y=/\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,U=31536e6,P=2628e6,H=/^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/,V={years:U,months:P,days:k,hours:i,minutes:f,seconds:d,milliseconds:1,weeks:6048e5},w=function(b){return b instanceof L},_=function(b,l,a){return new L(b,a,l.$l)},M=function(b){return n.p(b)+"s"},N=function(b){return b<0},q=function(b){return N(b)?Math.ceil(b):Math.floor(b)},et=function(b){return Math.abs(b)},T=function(b,l){return b?N(b)?{negative:!0,format:""+et(b)+l}:{negative:!1,format:""+b+l}:{negative:!1,format:""}},L=function(){function b(a,x,m){var y=this;if(this.$d={},this.$l=m,a===void 0&&(this.$ms=0,this.parseFromMilliseconds()),x)return _(a*V[M(x)],this);if(typeof a=="number")return this.$ms=a,this.parseFromMilliseconds(),this;if(typeof a=="object")return Object.keys(a).forEach(function(C){y.$d[M(C)]=a[C]}),this.calMilliseconds(),this;if(typeof a=="string"){var $=a.match(H);if($){var S=$.slice(2).map(function(C){return C!=null?Number(C):0});return this.$d.years=S[0],this.$d.months=S[1],this.$d.weeks=S[2],this.$d.days=S[3],this.$d.hours=S[4],this.$d.minutes=S[5],this.$d.seconds=S[6],this.calMilliseconds(),this}}return this}var l=b.prototype;return l.calMilliseconds=function(){var a=this;this.$ms=Object.keys(this.$d).reduce(function(x,m){return x+(a.$d[m]||0)*V[m]},0)},l.parseFromMilliseconds=function(){var a=this.$ms;this.$d.years=q(a/U),a%=U,this.$d.months=q(a/P),a%=P,this.$d.days=q(a/k),a%=k,this.$d.hours=q(a/i),a%=i,this.$d.minutes=q(a/f),a%=f,this.$d.seconds=q(a/d),a%=d,this.$d.milliseconds=a},l.toISOString=function(){var a=T(this.$d.years,"Y"),x=T(this.$d.months,"M"),m=+this.$d.days||0;this.$d.weeks&&(m+=7*this.$d.weeks);var y=T(m,"D"),$=T(this.$d.hours,"H"),S=T(this.$d.minutes,"M"),C=this.$d.seconds||0;this.$d.milliseconds&&(C+=this.$d.milliseconds/1e3,C=Math.round(1e3*C)/1e3);var A=T(C,"S"),Z=a.negative||x.negative||y.negative||$.negative||S.negative||A.negative,G=$.format||S.format||A.format?"T":"",O=(Z?"-":"")+"P"+a.format+x.format+y.format+G+$.format+S.format+A.format;return O==="P"||O==="-P"?"P0D":O},l.toJSON=function(){return this.toISOString()},l.format=function(a){var x=a||"YYYY-MM-DDTHH:mm:ss",m={Y:this.$d.years,YY:n.s(this.$d.years,2,"0"),YYYY:n.s(this.$d.years,4,"0"),M:this.$d.months,MM:n.s(this.$d.months,2,"0"),D:this.$d.days,DD:n.s(this.$d.days,2,"0"),H:this.$d.hours,HH:n.s(this.$d.hours,2,"0"),m:this.$d.minutes,mm:n.s(this.$d.minutes,2,"0"),s:this.$d.seconds,ss:n.s(this.$d.seconds,2,"0"),SSS:n.s(this.$d.milliseconds,3,"0")};return x.replace(Y,function(y,$){return $||String(m[y])})},l.as=function(a){return this.$ms/V[M(a)]},l.get=function(a){var x=this.$ms,m=M(a);return m==="milliseconds"?x%=1e3:x=m==="weeks"?q(x/V[m]):this.$d[m],x||0},l.add=function(a,x,m){var y;return y=x?a*V[M(x)]:w(a)?a.$ms:_(a,this).$ms,_(this.$ms+y*(m?-1:1),this)},l.subtract=function(a,x){return this.add(a,x,!0)},l.locale=function(a){var x=this.clone();return x.$l=a,x},l.clone=function(){return _(this.$ms,this)},l.humanize=function(a){return g().add(this.$ms,"ms").locale(this.$l).fromNow(!a)},l.valueOf=function(){return this.asMilliseconds()},l.milliseconds=function(){return this.get("milliseconds")},l.asMilliseconds=function(){return this.as("milliseconds")},l.seconds=function(){return this.get("seconds")},l.asSeconds=function(){return this.as("seconds")},l.minutes=function(){return this.get("minutes")},l.asMinutes=function(){return this.as("minutes")},l.hours=function(){return this.get("hours")},l.asHours=function(){return this.as("hours")},l.days=function(){return this.get("days")},l.asDays=function(){return this.as("days")},l.weeks=function(){return this.get("weeks")},l.asWeeks=function(){return this.as("weeks")},l.months=function(){return this.get("months")},l.asMonths=function(){return this.as("months")},l.years=function(){return this.get("years")},l.asYears=function(){return this.as("years")},b}(),W=function(b,l,a){return b.add(l.years()*a,"y").add(l.months()*a,"M").add(l.days()*a,"d").add(l.hours()*a,"h").add(l.minutes()*a,"m").add(l.seconds()*a,"s").add(l.milliseconds()*a,"ms")};return function(b,l,a){g=a,n=a().$utils(),a.duration=function(y,$){var S=a.locale();return _(y,{$l:S},$)},a.isDuration=w;var x=l.prototype.add,m=l.prototype.subtract;l.prototype.add=function(y,$){return w(y)?W(this,y,1):x.bind(this)(y,$)},l.prototype.subtract=function(y,$){return w(y)?W(this,y,-1):m.bind(this)(y,$)}}})})(ct);var Dt=ct.exports;const Yt=bt(Dt);F.extend(Yt);function Vt(s){return JSON.parse(s,(v,g)=>{switch(v){case"videoId":case"title":case"liveBroadcastContent":case"availability":return g.toString();case"publishedAt":return F(g);case"fetchedAt":case"scheduledStartTime":case"actualStartTime":case"actualEndTime":return g?F(g):void 0;case"type":return g??void 0;case"duration":return g?F.duration(g):void 0;case"viewCount":case"likeCount":case"commentCount":case"chatMessageCount":case"chatUniqueUserCount":{if(g==="")return;{const n=Number(g);return Number.isFinite(n)?n:void 0}}default:return g}})}const It=["href"],dt=tt({__name:"VideoThumbnail",props:rt({videoId:null,link:{type:Boolean},size:null},{link:!1,size:"hq"}),setup(s){return(v,g)=>v.link?(z(),B("a",{key:0,class:"video-link",href:r(Ct)(v.videoId),target:"_blank",style:nt({backgroundImage:r(ot)(r(it)(v.videoId,{size:v.size}))})},null,12,It)):(z(),B("div",{key:1,class:"video-link",style:nt({backgroundImage:r(ot)(r(it)(v.videoId,{size:v.size}))})},null,4))}});const Tt={class:"mb-2 text-h6 font-weight-bold"},Ht={class:"font-weight-bold"},qt=c("span",{class:"text-subtitle-2"},"回",-1),zt=c("span",{class:"text-subtitle-2"}," ",-1),Ft=c("span",{class:"text-subtitle-2"},"個",-1),Nt=c("span",{class:"text-subtitle-2"},null,-1),Et=c("span",{class:"text-subtitle-2"}," ",-1),jt=c("span",{class:"text-subtitle-2"},null,-1),Bt=c("span",{class:"text-subtitle-2"},null,-1),At=c("span",{class:"text-subtitle-2"},null,-1),Ot=tt({__name:"VideoDetail",props:{video:null},setup(s){const v=E();return(g,n)=>{const d=h("v-col"),f=h("v-icon"),i=h("v-card-text"),k=h("v-card"),Y=h("v-row"),U=h("v-container"),P=h("v-spacer"),H=h("v-btn"),V=h("v-card-actions"),w=h("v-dialog");return z(),at(w,{modelValue:v.value,"onUpdate:modelValue":n[1]||(n[1]=_=>v.value=_),activator:"parent","max-width":"1200"},{default:e(()=>[t(k,null,{default:e(()=>[t(U,null,{default:e(()=>[t(Y,null,{default:e(()=>[t(d,{cols:"12",sm:"6"},{default:e(()=>{var _;return[t(dt,{videoId:s.video.videoId,size:"max",link:"",style:{width:"100%"}},null,8,["videoId"]),c("div",Tt,p(s.video.title),1),c("div",Ht,p((_=s.video.duration)==null?void 0:_.format("H:mm:ss"))+" - "+p(r(R)(s.video.publishedAt).format("YYYY/MM/DD HH:mm:ss"))+" 公開 ",1),c("div",null,"ID: "+p(s.video.videoId)+" - "+p(s.video.type),1),c("div",null,p(r(R)(s.video.fetchedAt).format("YYYY/MM/DD HH:mm:ss"))+" 情報取得",1)]}),_:1}),t(d,{cols:"12",sm:"6"},{default:e(()=>[t(U,null,{default:e(()=>[t(Y,null,{default:e(()=>[t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"indigo",variant:"outlined",class:"summary-card"},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-play"}),o(" 再生数 ")]),_:1}),t(i,{class:"py-2 mt-n3 text-h6 text-right"},{default:e(()=>[o(p(r(D)(s.video.viewCount??0))+" ",1),qt]),_:1})]),_:1})]),_:1}),t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"orange-darken-1",variant:"outlined",class:"summary-card"},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-thumb-up"}),o(" 高評価数 ")]),_:1}),t(i,{class:"pa-2 mt-n3 text-h6 text-right"},{default:e(()=>[o(p(r(D)(s.video.likeCount??0))+" ",1),zt]),_:1})]),_:1})]),_:1}),t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"deep-purple-lighten-3",variant:"outlined",class:"summary-card"},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-comment"}),o(" コメント数 ")]),_:1}),t(i,{class:"py-2 mt-n3 text-h6 text-right"},{default:e(()=>[o(p(r(D)(s.video.commentCount??0))+" ",1),Ft]),_:1})]),_:1})]),_:1}),t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"red",variant:"outlined",class:"summary-card",disabled:(s.video.chatMessageCount??0)===0},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-chat"}),o(" チャット数 ")]),_:1}),t(i,{class:"py-2 mt-n3 text-h6 text-right"},{default:e(()=>[o(p(r(D)(s.video.chatMessageCount))+" ",1),Nt]),_:1})]),_:1},8,["disabled"])]),_:1}),t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"teal",variant:"outlined",class:"summary-card",disabled:(s.video.chatUniqueUserCount??0)===0},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-account-multiple"}),o(" チャットユーザ数 ")]),_:1}),t(i,{class:"pa-2 mt-n3 text-h6 text-right"},{default:e(()=>[o(p(r(D)(s.video.chatUniqueUserCount))+" ",1),Et]),_:1})]),_:1},8,["disabled"])]),_:1}),t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"blue",variant:"outlined",class:"summary-card",disabled:s.video.scheduledStartTime==null},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-calendar"}),o(" 配信開始予定日時 ")]),_:1}),t(i,{class:"py-2 mt-n3 text-body-2 text-right"},{default:e(()=>[o(p(s.video.scheduledStartTime?r(R)(s.video.scheduledStartTime).format("YYYY/MM/DD HH:mm:ss"):"なし")+" ",1),jt]),_:1})]),_:1},8,["disabled"])]),_:1}),t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"blue",variant:"outlined",class:"summary-card",disabled:s.video.actualStartTime==null},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-calendar-start"}),o(" 配信開始日時 ")]),_:1}),t(i,{class:"py-2 mt-n3 text-body-2 text-right"},{default:e(()=>[o(p(s.video.actualStartTime?r(R)(s.video.actualStartTime).format("YYYY/MM/DD HH:mm:ss"):"なし")+" ",1),Bt]),_:1})]),_:1},8,["disabled"])]),_:1}),t(d,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(k,{color:"blue",variant:"outlined",class:"summary-card",disabled:s.video.actualEndTime==null},{default:e(()=>[t(i,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(f,{icon:"mdi-calendar-end"}),o(" 配信終了日時 ")]),_:1}),t(i,{class:"py-2 mt-n3 text-body-2 text-right"},{default:e(()=>[o(p(s.video.actualEndTime?r(R)(s.video.actualEndTime).format("YYYY/MM/DD HH:mm:ss"):"なし")+" ",1),At]),_:1})]),_:1},8,["disabled"])]),_:1})]),_:1})]),_:1})]),_:1})]),_:1})]),_:1}),t(V,null,{default:e(()=>[t(P),t(H,{color:"green-darken-1",variant:"text",onClick:n[0]||(n[0]=_=>v.value=!1)},{default:e(()=>[o("閉じる")]),_:1})]),_:1})]),_:1})]),_:1},8,["modelValue"])}}}),Rt=c("th",null,"#",-1),Jt={class:"text-left"},Lt=c("th",null,null,-1),Wt=c("th",{class:"text-left"},"タイトル",-1);function X(s,v){var g,n,d,f,i;switch(v){case"viewCount":return s.viewCount;case"likeCount":return s.likeCount;case"commentCount":return s.commentCount;case"chatMessageCount":return s.chatMessageCount;case"chatUniqueUserCount":return s.chatUniqueUserCount;case"chatMessageCountPerUniqueUser":return s.chatMessageCount==null||s.chatUniqueUserCount==null?0:s.chatMessageCount/s.chatUniqueUserCount;case"duration":return(g=s.duration)==null?void 0:g.asSeconds();case"viewCountPerSecond":return s.viewCount==null||s.duration==null?0:s.viewCount/((n=s.duration)==null?void 0:n.asSeconds());case"likeCountPerSecond":return s.likeCount==null||s.duration==null?0:s.likeCount/((d=s.duration)==null?void 0:d.asSeconds());case"commentCountPerSecond":return s.commentCount==null||s.duration==null?0:s.commentCount/((f=s.duration)==null?void 0:f.asSeconds());case"chatMessageCountPerSecond":return s.chatMessageCount==null||s.duration==null?0:s.chatMessageCount/((i=s.duration)==null?void 0:i.asSeconds())}}function Zt(s){switch(s){case"viewCount":return"再生数";case"likeCount":return"高評価数";case"commentCount":return"コメント数";case"chatMessageCount":return"チャット数";case"chatUniqueUserCount":return"チャットユーザ数";case"chatMessageCountPerUniqueUser":return"ユーザあたりチャット数";case"duration":return"再生時間";case"viewCountPerSecond":return"時間あたり再生数";case"likeCountPerSecond":return"時間あたり高評価数";case"commentCountPerSecond":return"時間あたりコメント数";case"chatMessageCountPerSecond":return"時間あたりチャット数"}}function Gt(s,v){switch(s){case"viewCount":case"likeCount":case"commentCount":case"chatMessageCount":case"chatUniqueUserCount":return D(v);case"duration":return v?v<3600?F.duration(v,"seconds").format("mm:ss"):F.duration(v,"seconds").format("H:mm:ss"):"00:00";case"chatMessageCountPerUniqueUser":case"viewCountPerSecond":case"likeCountPerSecond":case"commentCountPerSecond":case"chatMessageCountPerSecond":return v?v.toFixed(1):"0"}}const Kt=tt({__name:"VideoRanking",props:rt({data:null,targetProperty:null,filterType:null,sorting:null,maxNumber:null},{filterType:["streaming","video","shorts"],sorting:"descending",maxNumber:10}),setup(s){const v=J(()=>[...s.data]),g=J(()=>v.value.filter(n=>n.availability==="public").filter(n=>n.type&&s.filterType.includes(n.type)).filter(n=>{const d=X(n,s.targetProperty)??0;return isFinite(d)&&d>0}).sort((n,d)=>{const f=X(n,s.targetProperty),i=X(d,s.targetProperty);return f!==f&&i!==i?0:f!==f?1:i!==i?-1:f==null&&i==null?0:f==null?1:i==null?-1:f<i?s.sorting==="descending"?1:-1:f>i?s.sorting==="descending"?-1:1:0}).slice(0,s.maxNumber));return(n,d)=>{const f=h("v-table");return z(),at(f,{height:"600px",density:"compact",hover:""},{default:e(()=>[c("thead",null,[c("tr",null,[Rt,c("th",Jt,p(Zt(n.targetProperty)),1),Lt,Wt])]),c("tbody",null,[(z(!0),B(st,null,ut(g.value,(i,k)=>(z(),B("tr",{key:i.videoId},[c("td",null,p(k+1),1),c("td",null,p(Gt(n.targetProperty,X(i,n.targetProperty))),1),c("td",null,[t(dt,{videoId:i.videoId,size:"mq"},null,8,["videoId"])]),c("td",null,p(i.title),1),t(Ot,{video:i},null,8,["video"])]))),128))])]),_:1})}}}),I=s=>(pt("data-v-c320c284"),s=s(),gt(),s),Qt=I(()=>c("span",{class:"text-subtitle-2"}," ",-1)),Xt={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},te=I(()=>c("span",{class:"text-subtitle-2"}," ",-1)),ee=I(()=>c("span",{class:"text-subtitle-2"},"個",-1)),se={class:"pr-1 pt-0 mt-n2 text-h6 text-right"},ae=I(()=>c("span",{class:"text-subtitle-2"},"日に1回",-1)),ne=I(()=>c("span",{class:"text-subtitle-2"},"日",-1)),oe={class:"pt-0 mt-n2 text-h6 text-right"},le=I(()=>c("span",{class:"text-subtitle-2"},"回",-1)),ie={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},re=I(()=>c("span",{class:"text-subtitle-2"},"回",-1)),ue=I(()=>c("span",{class:"text-subtitle-2"}," ",-1)),ce={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},de=I(()=>c("span",{class:"text-subtitle-2"}," ",-1)),me=I(()=>c("span",{class:"text-subtitle-2"},"個",-1)),fe={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},he=I(()=>c("span",{class:"text-subtitle-2"},"個",-1)),ve=tt({__name:"DetailView",props:{channelId:null},setup(s){lt(K,{retries:3,retryDelay:lt.exponentialDelay});const v=Q(async()=>(await K.get(St)).data.data,[]),g=Q(async()=>xt("id",(await K.get(Mt)).data,v.value)),n=J(()=>g.value.find(w=>w.id===s.channelId)),d=Q(async()=>n.value!=null?(await K.get(Pt(n.value.id),{transformResponse:Vt})).data.filter(w=>w.availability==="public"):[],[]),f=Q(async()=>{var w;return(w=v.value.find(_=>_.id===s.channelId))==null?void 0:w.statistics}),i=J(()=>{var w,_;return F(((w=n==null?void 0:n.value)==null?void 0:w.activityEndDate)??void 0).diff(F((_=n==null?void 0:n.value)==null?void 0:_.activityStartDate),"days",!0)}),k=$t(),Y=E(),U=E("viewCount"),P=E(["video","streaming","shorts"]),H=E("descending");function V(){k.global.name.value=k.global.current.value.dark?"light":"dark"}return(w,_)=>{const M=h("v-icon"),N=h("v-list-item"),q=h("v-img"),et=h("v-avatar"),T=h("v-list"),L=h("v-divider"),W=h("v-navigation-drawer"),b=h("v-app-bar-nav-icon"),l=h("v-toolbar-title"),a=h("v-btn"),x=h("v-app-bar"),m=h("v-card-text"),y=h("v-card"),$=h("v-col"),S=h("v-row"),C=h("v-tab"),A=h("v-tabs"),Z=h("v-btn-toggle"),G=h("v-container"),O=h("v-footer"),mt=h("v-main");return z(),B(st,null,[t(W,{class:"bg-background",modelValue:Y.value,"onUpdate:modelValue":_[0]||(_[0]=u=>Y.value=u),floating:""},{default:e(()=>[t(T,{class:"pb-0 d-flex flex-column fill-height"},{default:e(()=>[t(N,{link:"",title:"けもV いろいろ統計",href:"../"},{prepend:e(()=>[t(M,{icon:"mdi-finance",size:"large"})]),_:1}),t(T,{nav:"",link:"","active-class":"bg-primary",density:"compact",class:"flex-grow-1 flex-shrink-1 overflow-auto"},{default:e(()=>[(z(!0),B(st,null,ut(r(g),u=>(z(),at(N,{key:u.id,title:u.name,subtitle:u.globalname,href:`./#/${u.id}`,active:s.channelId===u.id},{prepend:e(()=>[t(et,{color:u.color.key,variant:"outlined",size:"small"},{default:e(()=>[t(q,{src:u.thumbnails.default.url},null,8,["src"])]),_:2},1032,["color"])]),_:2},1032,["title","subtitle","href","active"]))),128))]),_:1}),t(L),t(T,{density:"compact",link:"",nav:"",class:"flex-grow-0 flex-shrink-0"},{default:e(()=>[t(N,{title:"リアルタイム統計",href:"/kemov/stats/","prepend-icon":"mdi-chart-line"},{prepend:e(()=>[t(M,{icon:"mdi-chart-line",size:"small"})]),_:1}),t(N,{title:"ジェネット楽曲一覧",href:"/kemov/genet/music/","prepend-icon":"mdi-music"},{prepend:e(()=>[t(M,{icon:"mdi-music",size:"small"})]),_:1})]),_:1})]),_:1})]),_:1},8,["modelValue"]),t(mt,null,{default:e(()=>[t(x,{flat:"",density:"compact"},{append:e(()=>[t(a,{icon:"mdi-theme-light-dark",onClick:V})]),default:e(()=>[t(b,{variant:"text",onClick:_[1]||(_[1]=_t(u=>Y.value=!Y.value,["stop"]))}),t(l,null,{default:e(()=>{var u;return[o(p((u=n.value)==null?void 0:u.fullname),1)]}),_:1})]),_:1}),t(G,null,{default:e(()=>[t(S,{class:"ma-0"},{default:e(()=>[t($,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(y,{color:"red",variant:"flat",class:"summary-card"},{default:e(()=>[t(m,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(M,{icon:"mdi-check"}),o(" チャンネル登録者 ")]),_:1}),t(m,{class:"pa-2 mt-n3 text-h5 text-right"},{default:e(()=>{var u;return[o(p(r(D)((u=r(f))==null?void 0:u.subscriberCount))+" ",1),Qt]}),_:1}),t(m,{class:"pa-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>{var u;return[o(" 1日あたり "),c("span",Xt," +"+p(((((u=r(f))==null?void 0:u.subscriberCount)??0)/i.value).toFixed(1)),1),te]}),_:1})]),_:1})]),_:1}),t($,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(y,{color:"green",variant:"flat",class:"summary-card"},{default:e(()=>[t(m,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(M,{icon:"mdi-video"}),o(" 公開中の配信・動画 ")]),_:1}),t(m,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[o(p(r(D)(r(d).length))+" ",1),ee]),_:1}),t(m,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[c("span",se,p((i.value/r(d).length).toFixed(2)),1),ae]),_:1})]),_:1})]),_:1}),t($,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(y,{color:"teal",variant:"flat",class:"summary-card"},{default:e(()=>[t(m,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(M,{icon:"mdi-calendar-clock"}),o(" 配信活動日数 ")]),_:1}),t(m,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[o(p(r(D)(Math.floor(i.value)))+" ",1),ne]),_:1}),t(m,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>{var u;return[c("span",oe,p((u=n.value)==null?void 0:u.activityStartDate),1),o(" 開始 ")]}),_:1})]),_:1})]),_:1}),t($,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(y,{color:"indigo",variant:"flat",class:"summary-card"},{default:e(()=>[t(m,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(M,{icon:"mdi-play"}),o(" 総再生数 ")]),_:1}),t(m,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[o(p(r(D)(r(j)(r(d),u=>u.viewCount??0)))+" ",1),le]),_:1}),t(m,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[o(" 1配信あたり "),c("span",ie,p(r(D)(Math.floor(r(j)(r(d),u=>u.viewCount??0)/r(d).length))),1),re]),_:1})]),_:1})]),_:1}),t($,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(y,{color:"orange-darken-1",variant:"flat",class:"summary-card"},{default:e(()=>[t(m,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(M,{icon:"mdi-thumb-up"}),o(" 総高評価数 ")]),_:1}),t(m,{class:"pa-2 mt-n3 text-h5 text-right"},{default:e(()=>[o(p(r(D)(r(j)(r(d),u=>u.likeCount??0)))+" ",1),ue]),_:1}),t(m,{class:"pa-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[o(" 1配信あたり "),c("span",ce,p((r(j)(r(d),u=>u.likeCount??0)/r(d).length).toFixed(1)),1),de]),_:1})]),_:1})]),_:1}),t($,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(y,{color:"deep-purple",variant:"flat",class:"summary-card"},{default:e(()=>[t(m,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(M,{icon:"mdi-comment"}),o(" 総コメント数 ")]),_:1}),t(m,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[o(p(r(D)(r(j)(r(d),u=>u.commentCount??0)))+" ",1),me]),_:1}),t(m,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[o(" 1配信あたり "),c("span",fe,p((r(j)(r(d),u=>u.commentCount??0)/r(d).length).toFixed(1)),1),he]),_:1})]),_:1})]),_:1})]),_:1}),t(G,{class:"pa-1 mt-4"},{default:e(()=>[t(y,null,{default:e(()=>[t(A,{modelValue:U.value,"onUpdate:modelValue":_[2]||(_[2]=u=>U.value=u),"bg-color":"primary","center-active":"","show-arrows":""},{default:e(()=>[t(C,{value:"viewCount"},{default:e(()=>[o("再生数")]),_:1}),t(C,{value:"likeCount"},{default:e(()=>[o("高評価数")]),_:1}),t(C,{value:"commentCount"},{default:e(()=>[o("コメント数")]),_:1}),t(C,{value:"chatMessageCount"},{default:e(()=>[o("チャット数")]),_:1}),t(C,{value:"chatUniqueUserCount"},{default:e(()=>[o("チャットユーザ数")]),_:1}),t(C,{value:"chatMessageCountPerUniqueUser"},{default:e(()=>[o("ユーザあたりチャット数")]),_:1}),t(C,{value:"duration"},{default:e(()=>[o("再生時間")]),_:1}),t(C,{value:"viewCountPerSecond"},{default:e(()=>[o("時間あたり再生数")]),_:1}),t(C,{value:"likeCountPerSecond"},{default:e(()=>[o("時間あたり高評価数")]),_:1}),t(C,{value:"commentCountPerSecond"},{default:e(()=>[o("時間あたりコメント数")]),_:1}),t(C,{value:"chatMessageCountPerSecond"},{default:e(()=>[o("時間あたりチャット数")]),_:1})]),_:1},8,["modelValue"]),t(Z,{modelValue:P.value,"onUpdate:modelValue":_[3]||(_[3]=u=>P.value=u),multiple:"",divided:"",color:"secondary"},{default:e(()=>[t(m,null,{default:e(()=>[o("対象")]),_:1}),t(a,{"prepend-icon":"mdi-microphone",value:"streaming"},{default:e(()=>[o("配信")]),_:1}),t(a,{"prepend-icon":"mdi-video",value:"video"},{default:e(()=>[o("動画")]),_:1}),t(a,{"prepend-icon":"mdi-cellphone-play",value:"shorts"},{default:e(()=>[o("ショート")]),_:1})]),_:1},8,["modelValue"]),t(Z,{modelValue:H.value,"onUpdate:modelValue":_[4]||(_[4]=u=>H.value=u),class:"ml-2",divided:"",color:"secondary",mandatory:""},{default:e(()=>[t(a,{icon:"mdi-sort-descending",value:"descending"}),t(a,{icon:"mdi-sort-ascending",value:"ascending"})]),_:1},8,["modelValue"]),t(y,{flat:""},{default:e(()=>[t(Kt,{data:r(d),sorting:H.value,"filter-type":P.value,"target-property":U.value,"max-number":30},null,8,["data","sorting","filter-type","target-property"])]),_:1})]),_:1})]),_:1})]),_:1}),t(O,{class:"bg-primary text-center d-flex flex-column mt-10"},{default:e(()=>[o("このサイトは非公式のファンサイトです")]),_:1})]),_:1})],64)}}});const $e=kt(ve,[["__scopeId","data-v-c320c284"]]);export{$e as default};
