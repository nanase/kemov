import{d as F,m as W,c as $,n as X,u as m,o as f,w as o,a as T,t as k,b as x,e as a,f as w,r as Z,F as tt,g as e,h as et,i as l,j as N,k as st,l as nt,p as at,_ as ot,q as rt}from"./kemov-_plugin-vue_export-helper-BfvHD29s.js";import{c as _,a as it,b as lt,d as ct}from"./kemov-main--jwohN0k.js";import{t as V,u as ut,a as Y,b as dt,_ as vt,c as ft,s as mt,l as gt}from"./kemov-StatsAppBase.vue_vue_type_script_setup_true_lang-Cb9Bt2FO.js";import{c as pt,g as bt,d as C,r as A,a as H,b as ht}from"./kemov-axios-CRW72lKU.js";const yt={dark:!1,colors:{background:"#F4F5FA",primary:_.indigo.base,secondary:_.indigo.base,positive:_.green.darken3,negative:_.red.darken3,v2DrawerBackground:"#ffffff",v2DrawerList:"#3c3c43",v2DrawerListActive:_.indigo.base,v2AppBarBackground:"#ffffff",v2SnackbarBackground:"#171717"},variables:{"high-emphasis-opacity":"1.0","v2-content-color":"#3c3c43","v2-snackbar-border":"none"}},_t={dark:!0,colors:{background:"#121212",primary:_.indigo.lighten4,secondary:_.indigo.darken4,positive:_.green.lighten2,negative:_.red.lighten1,v2DrawerBackground:"#171717",v2DrawerList:"#bcbcbc",v2DrawerListActive:_.blue.lighten2,v2AppBarBackground:"#171717",v2SnackbarBackground:"#171717"},variables:{"high-emphasis-opacity":"0.86","v2-content-color":"rgba(255, 255, 245, .86)","v2-snackbar-border":"1px solid #3c3c43"}},xt={themes:{defaultTheme:"light",light:yt,dark:_t},variations:{colors:["primary","secondary","positive","negative"],lighten:0,darken:0}},P=F({__name:"DifferenceValue",props:W({value:null,strong:null,positiveClass:null,negativeClass:null,strongClass:null,tag:null},{positiveClass:["text-positive"],negativeClass:["text-negative"],strongClass:["font-weight-bold"],tag:"span"}),setup(t){const d=t.tag;function p(i){return i===0?"":i>0?`+${V(i)}`:`${V(i)}`}function c(i){return i===0?[""]:i>=t.strong?[...t.positiveClass,...t.strongClass]:i<=-t.strong?[...t.negativeClass,...t.strongClass]:i>0?[...t.positiveClass]:[...t.negativeClass]}return(i,g)=>(f(),$(m(d),{class:X(c(i.value))},{default:o(()=>[T(k(p(i.value)),1)]),_:1},8,["class"]))}});var z={exports:{}};(function(t,d){(function(p,c){t.exports=c()})(pt,function(){return function(p,c,i){c.prototype.isBetween=function(g,b,u,h){var n=i(g),y=i(b),B=(h=h||"()")[0]==="(",s=h[1]===")";return(B?this.isAfter(n,u):!this.isBefore(n,u))&&(s?this.isBefore(y,u):!this.isAfter(y,u))||(B?this.isBefore(n,u):!this.isAfter(n,u))&&(s?this.isAfter(y,u):!this.isBefore(y,u))}}})})(z);var wt=z.exports;const kt=bt(wt),Ct={key:0},Bt={scope:"col",class:"px-2 text-right font-weight-bold"},St={key:0,scope:"col",class:"px-2 text-right font-weight-bold"},Dt={scope:"row",class:"channel-name-head pl-4 pr-2"},At={class:"channel-name-box"},Nt={class:"channel-name-text"},Vt={key:0,class:"has-live"},$t={key:1,class:"has-live-before-start"},Tt={class:"px-2 text-h6"},Lt={key:0},Pt={colspan:"4",class:"pa-4 text-center"},Ft={key:1},Ut={class:"text-right text-h6"},Et={scope:"row",class:"pl-4 pr-2 text-right text-body-1 font-weight-bold"},Mt={class:"mt-n4"},Ht={class:"mt-n4"},It={class:"mt-n4"},jt={class:"px-2"},Yt=F({__name:"StatTable",props:{channels:null,latestStreamings:null,type:null,activeOnly:{type:Boolean}},setup(t){C.extend(kt);const d=ut({interval:5e3});function p(){switch(t.type){case"subscriber":return"登録数";case"view":return"再生数";case"video":return"動画数"}}function c(s){switch(t.type){case"subscriber":return s.statistics.subscriberCount;case"view":return s.statistics.viewCount;case"video":return s.statistics.videoCount}}function i(s){switch(t.type){case"subscriber":return s.statistics.subscriberCountPerHour;case"view":return s.statistics.viewCountPerHour;case"video":return s.statistics.videoCountPerHour}}function g(s){switch(t.type){case"subscriber":return s.statistics.subscriberCountPerDay;case"view":return s.statistics.viewCountPerDay;case"video":return s.statistics.videoCountPerDay}}function b(){switch(t.type){case"subscriber":return 100;case"view":return 1e3;case"video":return 10}}function u(s){return s>=1e3?s+10**(BigInt(s).toString().length-3)-1:s}function h(){const s=A(t.channels,c);return Math.round(s+(A(t.channels,r=>u(c(r)))-s)/2)}function n(s){return t.activeOnly&&typeof s.activityEndDate=="string"?C().isBefore(s.activityEndDate):!0}function y(s){const r=t.latestStreamings.find(S=>S.channelId===s);return typeof r<"u"&&r.success&&r.isLiveBroadcast===!0&&C(d.value).isAfter(r.startedAt)}function B(s){const r=t.latestStreamings.find(S=>S.channelId===s);return typeof r<"u"&&r.success&&r.isLiveBroadcast===!0&&C(d.value).isBetween(r.startedAt,C(r.startedAt).add(-1,"hour"))}return(s,r)=>{const S=l("v-img"),L=l("v-avatar"),U=l("v-list-item"),E=l("v-progress-circular"),D=l("v-btn"),I=l("v-card-text"),M=l("v-timeline-item"),R=l("v-timeline"),q=l("v-spacer"),G=l("v-card-actions"),J=l("v-card"),K=l("v-dialog"),Q=l("v-table");return f(),$(Q,{density:"compact",hover:""},{default:o(()=>[t.channels.length!==0?(f(),x("thead",Ct,[a("tr",null,[r[0]||(r[0]=a("th",{scope:"col",class:"pl-4 pr-2"}," ",-1)),a("th",Bt,k(p()),1),t.type==="subscriber"?(f(),x("th",St,"1時間")):w("",!0),r[1]||(r[1]=a("th",{scope:"col",class:"pl-2 pr-4 text-right font-weight-bold"},"24時間",-1))])])):w("",!0),a("tbody",null,[(f(!0),x(tt,null,Z(t.channels.filter(n),v=>(f(),x("tr",{class:"channel text-right",key:v.id},[a("th",Dt,[e(U,{class:"channel-name text-left px-0",href:`https://www.youtube.com/${v.customUrl}`,ripple:!1,slim:""},{title:o(()=>[a("div",At,[a("span",Nt,k(v.name),1)])]),prepend:o(()=>[y(v.id)?(f(),x("div",Vt)):B(v.id)?(f(),x("div",$t)):w("",!0),e(L,{class:"avatar",color:v.color.key,variant:"outlined",size:"small"},{default:o(()=>[e(S,{src:v.thumbnails.default.url,alt:v.fullname},null,8,["src","alt"])]),_:2},1032,["color"])]),_:2},1032,["href"])]),a("td",Tt,k(m(V)(c(v))),1),t.type==="subscriber"?(f(),$(P,{key:0,class:"px-2 text-h6",value:i(v),strong:b(),tag:"td"},null,8,["value","strong"])):w("",!0),e(P,{class:"pl-2 pr-4 text-h6",value:g(v),strong:b(),tag:"td"},null,8,["value","strong"])]))),128)),t.channels.length===0?(f(),x("tr",Lt,[a("td",Pt,[e(E,{color:"primary",indeterminate:""})])])):w("",!0)]),t.channels.length!==0?(f(),x("tfoot",Ft,[a("tr",Ut,[a("th",Et,[t.type==="subscriber"?(f(),$(K,{key:0,"max-width":"640"},{activator:o(({props:v})=>[e(D,et(v,{icon:"mdi-information-outline",variant:"plain",density:"compact","aria-label":"チャンネル登録者数について"}),null,16)]),default:o(({isActive:v})=>[e(J,{title:"チャンネル登録者数について"},{default:o(()=>[e(I,null,{default:o(()=>r[2]||(r[2]=[a("p",null," YouTube の制約により、チャンネル登録者数の正確な数値はチャンネルの所有者のみに開示されます。 それ以外の利用者には数値の上位3桁のみが開示されます。 ",-1),a("p",null," したがって、このサイトで表示している数値は上位3桁のみの最小値であり、正確な数値はこれ以上となります。 下記の数値は合計値の参考としてお考えください。 ",-1)])),_:1}),e(I,null,{default:o(()=>[e(R,{class:"text-center",direction:"horizontal",side:"end",size:"small",density:"compact"},{default:o(()=>[e(M,{icon:"mdi-flag-checkered","dot-color":"green"},{default:o(()=>[a("div",Mt,[a("p",null,k(m(V)(m(A)(t.channels,c))),1),r[3]||(r[3]=a("div",{class:"font-weight-bold text-body-2"},"最小値",-1))])]),_:1}),e(M,{icon:"mdi-flag-checkered","dot-color":"orange-darken-1"},{default:o(()=>[a("div",Ht,[a("p",null,k(m(V)(h())),1),r[4]||(r[4]=a("div",{class:"font-weight-bold text-body-2"},"平均値",-1))])]),_:1}),e(M,{icon:"mdi-flag-checkered","dot-color":"red"},{default:o(()=>[a("div",It,[a("p",null,k(m(V)(m(A)(t.channels,j=>u(c(j))))),1),r[5]||(r[5]=a("div",{class:"font-weight-bold text-body-2"},"最大値",-1))])]),_:1})]),_:1})]),_:1}),e(G,null,{default:o(()=>[e(q),e(D,{text:"閉じる",onClick:j=>v.value=!1},null,8,["onClick"])]),_:2},1024)]),_:2},1024)]),_:1})):w("",!0),r[6]||(r[6]=T(" 合計 "))]),a("td",jt,k(m(V)(m(A)(t.channels,c))),1),t.type==="subscriber"?(f(),$(P,{key:0,class:"px-2",value:m(A)(t.channels,i),strong:b(),tag:"td"},null,8,["value","strong"])):w("",!0),e(P,{class:"pl-2 pr-4",value:m(A)(t.channels,g),strong:b(),tag:"td"},null,8,["value","strong"])])])):w("",!0)]),_:1})}}}),zt={key:0,class:"update-time"},Ot=F({__name:"UpdateTime",props:{time:null},setup(t){const d=N(Number.NaN),p=st(()=>d.value>=60?`${Math.floor(d.value/60)}分`:`${d.value}秒`);function c(){d.value=C().diff(t.time,"s")}return Y(c,1e3),nt(()=>t.time,c),(i,g)=>t.time.isValid()&&!Number.isNaN(d.value)?(f(),x("div",zt,k(`${t.time.format("YYYY/MM/DD HH:mm:ss")} (${p.value}前) 更新`),1)):w("",!0)}}),Rt=F({__name:"StatsApp",setup(t){const d=N([]),p=N([]),c=N(C(Number.NaN)),i=N("subscriber"),g=dt("kemov/stats/activeOnly",!1),b=N(1e3),u=N();return Y(async()=>{try{u.value=!1;const h=(await H.get(ft)).data,n=(await H.get(mt)).data;d.value=ht("id",h,n.data),p.value=(await H.get(gt)).data.data,c.value=C.unix(n.fetched_at),b.value=Math.max(Math.floor(600-(C().unix()-n.fetched_at))+5,30)*1e3}catch(h){console.error(`Fetching error. Retrying in 10 minutes: ${h}`),u.value=!0,b.value=600*1e3}},b),(h,n)=>{const y=l("v-icon"),B=l("v-tab"),s=l("v-tabs"),r=l("v-card"),S=l("v-col"),L=l("v-row"),U=l("v-checkbox"),E=l("v-footer");return f(),$(vt,{"page-id":"stats",title:"けもV リアルタイム統計",channels:d.value,"error-snackbar-shown":u.value,"onUpdate:errorSnackbarShown":n[2]||(n[2]=D=>u.value=D)},{footer:o(()=>[e(E,{class:"bg-secondary text-left d-flex flex-column mt-10"},{default:o(()=>n[9]||(n[9]=[a("ul",null,[a("li",null,"およそ10分ごとに自動で更新されます。数値は減少することがあります"),a("li",null,"総再生数と配信・動画数は配信終了後から反映されます"),a("li",null,"このサイトは非公式のファンサイトです")],-1)])),_:1})]),default:o(()=>[e(L,{justify:"center"},{default:o(()=>[e(S,{cols:"12",md:"12",lg:"10",xl:"7",xxl:"6"},{default:o(()=>[e(s,{modelValue:i.value,"onUpdate:modelValue":n[0]||(n[0]=D=>i.value=D),color:"primary","align-tabs":"center",density:"compact"},{default:o(()=>[e(B,{value:"subscriber"},{default:o(()=>[e(y,{start:""},{default:o(()=>n[3]||(n[3]=[T("mdi-account-check")])),_:1}),n[4]||(n[4]=a("span",{class:"font-weight-bold"},"チャンネル登録者数",-1))]),_:1}),e(B,{value:"view"},{default:o(()=>[e(y,{start:""},{default:o(()=>n[5]||(n[5]=[T("mdi-play")])),_:1}),n[6]||(n[6]=a("span",{class:"font-weight-bold"},"総再生数",-1))]),_:1}),e(B,{value:"video"},{default:o(()=>[e(y,{start:""},{default:o(()=>n[7]||(n[7]=[T("mdi-video")])),_:1}),n[8]||(n[8]=a("span",{class:"font-weight-bold"},"配信・動画数",-1))]),_:1})]),_:1},8,["modelValue"]),e(Yt,{channels:d.value,"latest-streamings":p.value,type:i.value,"active-only":m(g)},null,8,["channels","latest-streamings","type","active-only"]),e(r,{class:"text-right px-4 py-2",variant:"flat"},{default:o(()=>[e(Ot,{class:"update-time",time:c.value},null,8,["time"])]),_:1})]),_:1})]),_:1}),e(L,null,{default:o(()=>[e(S,null,{default:o(()=>[e(U,{modelValue:m(g),"onUpdate:modelValue":n[1]||(n[1]=D=>at(g)?g.value=D:null),class:"active-only",label:"活動中の配信者のみ表示","hide-details":""},null,8,["modelValue"])]),_:1})]),_:1})]),_:1},8,["channels","error-snackbar-shown"])}}}),qt=ot(Rt,[["__scopeId","data-v-7ee1e910"]]),Gt=it({components:lt,directives:ct,icons:{defaultSet:"mdi"},theme:xt}),O=rt(qt);O.use(Gt);O.mount("#app");
