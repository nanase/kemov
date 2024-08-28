import{d as I,m as K,o as v,c as $,w as a,n as Q,u as f,a as S,t as g,r as i,b as x,e as s,f as p,g as W,F as X,h as e,i as Z,j as tt,k as et,l as H,p as k,q as st,s as at,v as nt,x as ot,_ as lt,y as it}from"./kemov-_plugin-vue_export-helper-ChimKiKb.js";import{c as b,a as ct,b as rt,d as ut}from"./kemov-main-Cftlc_bp.js";import{w,_ as dt,c as mt,s as vt}from"./kemov-config-DYBF_cLY.js";import{s as y,d as N,a as F,m as ft}from"./kemov-axios-N4Rts__0.js";const _t={dark:!1,colors:{background:"#F4F5FA",primary:b.indigo.base,secondary:b.indigo.base,positive:b.green.darken3,negative:b.red.darken3}},gt={dark:!0,colors:{background:"#121212",primary:b.indigo.lighten4,secondary:b.indigo.darken4,positive:b.green.lighten2,negative:b.red.lighten1}},ht={themes:{defaultTheme:"light",light:_t,dark:gt},variations:{colors:["primary","secondary","positive","negative"],lighten:0,darken:0}},P=I({__name:"DifferenceValue",props:K({value:null,strong:null,positiveClass:null,negativeClass:null,strongClass:null,tag:null},{positiveClass:["text-positive"],negativeClass:["text-negative"],strongClass:["font-weight-bold"],tag:"span"}),setup(t){const c=t.tag;function r(n){return n===0?"":n>0?`+${w(n)}`:`${w(n)}`}function l(n){return n===0?[""]:n>=t.strong?[...t.positiveClass,...t.strongClass]:n<=-t.strong?[...t.negativeClass,...t.strongClass]:n>0?[...t.positiveClass]:[...t.negativeClass]}return(n,u)=>(v(),$(f(c),{class:Q(l(n.value))},{default:a(()=>[S(g(r(n.value)),1)]),_:1},8,["class"]))}}),pt={key:0},bt=s("th",{scope:"col",class:"pl-4 pr-2"}," ",-1),yt={scope:"col",class:"px-2 text-right font-weight-bold"},xt={key:0,scope:"col",class:"px-2 text-right font-weight-bold"},wt=s("th",{scope:"col",class:"pl-2 pr-4 text-right font-weight-bold"},"24時間",-1),Ct={scope:"row",class:"channel-name-head pl-4 pr-2"},kt={class:"channel-name-text"},$t={class:"px-2 text-h6"},St={key:0},Nt={colspan:"4",class:"pa-4 text-center"},Vt={key:1},Dt={class:"text-right text-h6"},Tt={scope:"row",class:"pl-4 pr-2 text-right text-body-1 font-weight-bold"},Bt=s("p",null," YouTube の制約により、チャンネル登録者数の正確な数値はチャンネルの所有者のみに開示されます。 それ以外の利用者には数値の上位3桁のみが開示されます。 ",-1),Pt=s("p",null," したがって、このサイトで表示している数値は上位3桁のみの最小値であり、正確な数値はこれ以上となります。 下記の数値は合計値の参考としてお考えください。 ",-1),It={class:"mt-n4"},Mt=s("div",{class:"font-weight-bold text-body-2"},"最小値",-1),Ot={class:"mt-n4"},Ut=s("div",{class:"font-weight-bold text-body-2"},"平均値",-1),At={class:"mt-n4"},Et=s("div",{class:"font-weight-bold text-body-2"},"最大値",-1),Ft={class:"px-2"},Ht=I({__name:"StatTable",props:{channels:null,type:null,activeOnly:{type:Boolean}},setup(t){function c(){switch(t.type){case"subscriber":return"登録数";case"view":return"再生数";case"video":return"動画数"}}function r(o){switch(t.type){case"subscriber":return o.statistics.subscriberCount;case"view":return o.statistics.viewCount;case"video":return o.statistics.videoCount}}function l(o){switch(t.type){case"subscriber":return o.statistics.subscriberCountPerHour;case"view":return o.statistics.viewCountPerHour;case"video":return o.statistics.videoCountPerHour}}function n(o){switch(t.type){case"subscriber":return o.statistics.subscriberCountPerDay;case"view":return o.statistics.viewCountPerDay;case"video":return o.statistics.videoCountPerDay}}function u(){switch(t.type){case"subscriber":return 100;case"view":return 1e3;case"video":return 10}}function _(o){return o>=1e3?o+10**(BigInt(o).toString().length-3)-1:o}function d(){const o=y(t.channels,r);return Math.round(o+(y(t.channels,V=>_(r(V)))-o)/2)}function h(o){return t.activeOnly&&typeof o.activityEndDate=="string"?N().isBefore(o.activityEndDate):!0}return(o,V)=>{const O=i("v-img"),D=i("v-avatar"),T=i("v-list-item"),U=i("v-progress-circular"),B=i("v-btn"),C=i("v-card-text"),A=i("v-timeline-item"),z=i("v-timeline"),J=i("v-spacer"),q=i("v-card-actions"),L=i("v-card"),R=i("v-dialog"),G=i("v-table");return v(),$(G,{density:"compact",hover:""},{default:a(()=>[t.channels.length!==0?(v(),x("thead",pt,[s("tr",null,[bt,s("th",yt,g(c()),1),t.type==="subscriber"?(v(),x("th",xt,"1時間")):p("",!0),wt])])):p("",!0),s("tbody",null,[(v(!0),x(X,null,W(t.channels.filter(h),m=>(v(),x("tr",{class:"channel text-right",key:m.id},[s("th",Ct,[e(T,{class:"channel-name text-left px-0",href:`https://www.youtube.com/${m.customUrl}`,ripple:!1,slim:""},{title:a(()=>[s("span",kt,g(m.name),1)]),prepend:a(()=>[e(D,{class:"avatar",color:m.color.key,variant:"outlined",size:"small"},{default:a(()=>[e(O,{src:m.thumbnails.default.url,alt:m.fullname},null,8,["src","alt"])]),_:2},1032,["color"])]),_:2},1032,["href"])]),s("td",$t,g(f(w)(r(m))),1),t.type==="subscriber"?(v(),$(P,{key:0,class:"px-2 text-h6",value:l(m),strong:u(),tag:"td"},null,8,["value","strong"])):p("",!0),e(P,{class:"pl-2 pr-4 text-h6",value:n(m),strong:u(),tag:"td"},null,8,["value","strong"])]))),128)),t.channels.length===0?(v(),x("tr",St,[s("td",Nt,[e(U,{color:"primary",indeterminate:""})])])):p("",!0)]),t.channels.length!==0?(v(),x("tfoot",Vt,[s("tr",Dt,[s("th",Tt,[t.type==="subscriber"?(v(),$(R,{key:0,"max-width":"640"},{activator:a(({props:m})=>[e(B,Z(m,{icon:"mdi-information-outline",variant:"plain",density:"compact","aria-label":"チャンネル登録者数について"}),null,16)]),default:a(({isActive:m})=>[e(L,{title:"チャンネル登録者数について"},{default:a(()=>[e(C,null,{default:a(()=>[Bt,Pt]),_:1}),e(C,null,{default:a(()=>[e(z,{class:"text-center",direction:"horizontal",side:"end",size:"small",density:"compact"},{default:a(()=>[e(A,{icon:"mdi-flag-checkered","dot-color":"green"},{default:a(()=>[s("div",It,[s("p",null,g(f(w)(f(y)(t.channels,r))),1),Mt])]),_:1}),e(A,{icon:"mdi-flag-checkered","dot-color":"orange-darken-1"},{default:a(()=>[s("div",Ot,[s("p",null,g(f(w)(d())),1),Ut])]),_:1}),e(A,{icon:"mdi-flag-checkered","dot-color":"red"},{default:a(()=>[s("div",At,[s("p",null,g(f(w)(f(y)(t.channels,E=>_(r(E))))),1),Et])]),_:1})]),_:1})]),_:1}),e(q,null,{default:a(()=>[e(J),e(B,{text:"閉じる",onClick:E=>m.value=!1},null,8,["onClick"])]),_:2},1024)]),_:2},1024)]),_:1})):p("",!0),S(" 合計 ")]),s("td",Ft,g(f(w)(f(y)(t.channels,r))),1),t.type==="subscriber"?(v(),$(P,{key:0,class:"px-2",value:f(y)(t.channels,l),strong:u(),tag:"td"},null,8,["value","strong"])):p("",!0),e(P,{class:"pl-2 pr-4",value:f(y)(t.channels,n),strong:u(),tag:"td"},null,8,["value","strong"])])])):p("",!0)]),_:1})}}});function Y(t,c){let r,l;const n=async function(){try{l=await t(),typeof l<"u"&&(r=setTimeout(n,l*1e3))}catch(u){c&&(l=await c(u),typeof l<"u"&&(r=setTimeout(n,l*1e3)))}};tt(async()=>{await n()}),et(()=>{clearInterval(r)})}function Yt(t,c,r){const l=localStorage,n=()=>{typeof t.value<"u"&&l.setItem(c,JSON.stringify(t.value))},u=()=>{const _=l.getItem(c);_!=null&&(t.value=JSON.parse(_))};return u(),H(()=>t.value,n,{immediate:!0}),{remove:()=>{l.removeItem(c)},save:n,load:u}}const jt={key:0,class:"update-time"},zt=I({__name:"UpdateTime",props:{time:null},setup(t){const c=k(Number.NaN),r=st(()=>c.value>=60?`${Math.floor(c.value/60)}分`:`${c.value}秒`);async function l(){return c.value=N().diff(t.time,"s"),1}return Y(l),H(()=>t.time,l),(n,u)=>t.time.isValid()&&!Number.isNaN(c.value)?(v(),x("div",jt,g(`${t.time.format("YYYY/MM/DD HH:mm:ss")} (${r.value}前) 更新`),1)):p("",!0)}}),M=t=>(nt("data-v-8d0d43a6"),t=t(),ot(),t),Jt=M(()=>s("span",{class:"font-weight-bold"},"チャンネル登録者数",-1)),qt=M(()=>s("span",{class:"font-weight-bold"},"総再生数",-1)),Lt=M(()=>s("span",{class:"font-weight-bold"},"配信・動画数",-1)),Rt=M(()=>s("ul",null,[s("li",null,"およそ10分ごとに自動で更新されます。数値は減少することがあります"),s("li",null,"総再生数と配信・動画数は配信終了後から反映されます"),s("li",null,"このサイトは非公式のファンサイトです")],-1)),Gt=I({__name:"StatsApp",setup(t){const c=k(),r=k([]),l=k(N(Number.NaN)),n=k("subscriber"),u=k();return Yt(u,"kemov/stats/activeOnly"),at("streamerChannels",r),Y(async()=>{var h;(h=c.value)==null||h.closeErrorSnackbar();const _=(await F.get(mt)).data,d=(await F.get(vt)).data;return r.value=ft("id",_,d.data),l.value=N.unix(d.fetched_at),Math.max(Math.floor(600-(N().unix()-d.fetched_at))+5,30)},async _=>{var d;return console.error(`Fetching error. Retrying in 10 minutes: ${_}`),(d=c.value)==null||d.showErrorSnackbar(),600}),(_,d)=>{const h=i("v-icon"),o=i("v-tab"),V=i("v-tabs"),O=i("v-card"),D=i("v-col"),T=i("v-row"),U=i("v-checkbox"),B=i("v-footer");return v(),$(dt,{ref_key:"appBase",ref:c,"page-id":"stats","toolbar-title":"けもV リアルタイム統計"},{footer:a(()=>[e(B,{class:"bg-secondary text-left d-flex flex-column mt-10"},{default:a(()=>[Rt]),_:1})]),default:a(()=>[e(T,{justify:"center"},{default:a(()=>[e(D,{cols:"12",md:"12",lg:"10",xl:"7",xxl:"6"},{default:a(()=>[e(V,{modelValue:n.value,"onUpdate:modelValue":d[0]||(d[0]=C=>n.value=C),color:"primary","align-tabs":"center",density:"compact"},{default:a(()=>[e(o,{value:"subscriber"},{default:a(()=>[e(h,{start:""},{default:a(()=>[S("mdi-account-check")]),_:1}),Jt]),_:1}),e(o,{value:"view"},{default:a(()=>[e(h,{start:""},{default:a(()=>[S("mdi-play")]),_:1}),qt]),_:1}),e(o,{value:"video"},{default:a(()=>[e(h,{start:""},{default:a(()=>[S("mdi-video")]),_:1}),Lt]),_:1})]),_:1},8,["modelValue"]),e(Ht,{channels:r.value,type:n.value,"active-only":u.value},null,8,["channels","type","active-only"]),e(O,{class:"text-right px-4 py-2",variant:"flat"},{default:a(()=>[e(zt,{class:"update-time",time:l.value},null,8,["time"])]),_:1})]),_:1})]),_:1}),e(T,null,{default:a(()=>[e(D,null,{default:a(()=>[e(U,{modelValue:u.value,"onUpdate:modelValue":d[1]||(d[1]=C=>u.value=C),class:"active-only",label:"活動中の配信者のみ表示"},null,8,["modelValue"])]),_:1})]),_:1})]),_:1},512)}}}),Kt=lt(Gt,[["__scopeId","data-v-8d0d43a6"]]),Qt=ct({components:rt,directives:ut,icons:{defaultSet:"mdi"},theme:ht}),j=it(Kt);j.use(Qt);j.mount("#app");
