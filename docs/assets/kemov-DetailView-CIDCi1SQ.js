import{a as K,r as T,d as B}from"./kemov-axios-DhS8gzt2.js";import{t as C,g as Q,r as F,f as X,u as Z,_ as tt}from"./kemov-StatsAppBase.vue_vue_type_script_setup_true_lang-Cu82DotR.js";import{a as et,u as E,b as O}from"./kemov-youtube-BrzX_C6r.js";import{d as $,m as L,b as w,u as a,ac as j,o as b,j as N,i as c,c as I,w as e,g as t,e as o,t as i,a as s,k as R,r as lt,F as Y,q as at,l as st}from"./kemov-runtime-dom.esm-bundler-DyuC_rl0.js";import{_ as nt}from"./kemov-_plugin-vue_export-helper-DlAUqK2U.js";import"./kemov-main-CdQEV6nj.js";function ot(n,f,m){return n!==n&&f!==f?0:n!==n?1:f!==f?-1:n==null&&f==null?0:n==null?1:f==null?-1:n<f?m==="descending"?1:-1:n>f?m==="descending"?-1:1:0}const dt=["href"],A=$({__name:"VideoThumbnail",props:L({videoId:null,link:{type:Boolean},size:null},{link:!1,size:"hq"}),setup(n){return(f,m)=>f.link?(b(),w("a",{key:0,class:"video-link",href:a(et)(f.videoId),target:"_blank",style:j({backgroundImage:a(E)(a(O)(f.videoId,{size:f.size}))})},null,12,dt)):(b(),w("div",{key:1,class:"video-link",style:j({backgroundImage:a(E)(a(O)(f.videoId,{size:f.size}))})},null,4))}}),it={class:"mb-2 text-h6 font-weight-bold"},ut={class:"font-weight-bold"},rt=$({__name:"VideoDetail",props:{video:null},setup(n){const f=N();function m(y){return K("ja-JP",y)}return(y,d)=>{const r=c("v-col"),u=c("v-icon"),v=c("v-card-text"),g=c("v-card"),M=c("v-row"),P=c("v-container"),U=c("v-spacer"),l=c("v-btn"),V=c("v-card-actions"),x=c("v-dialog");return b(),I(x,{modelValue:f.value,"onUpdate:modelValue":d[1]||(d[1]=k=>f.value=k),activator:"parent","max-width":"1200"},{default:e(()=>[t(g,null,{default:e(()=>[t(P,null,{default:e(()=>[t(M,null,{default:e(()=>[t(r,{cols:"12",sm:"6"},{default:e(()=>{var k;return[t(A,{videoId:n.video.videoId,size:"max",link:"",style:{width:"100%"}},null,8,["videoId"]),o("div",it,i(n.video.title),1),o("div",ut,i((k=n.video.duration)==null?void 0:k.format("H:mm:ss"))+" - "+i(m(n.video.publishedAt).format("YYYY/MM/DD HH:mm:ss"))+" 公開 ",1),o("div",null,"ID: "+i(n.video.videoId)+" - "+i(n.video.type),1),o("div",null,i(m(n.video.fetchedAt).format("YYYY/MM/DD HH:mm:ss"))+" 情報取得",1)]}),_:1}),t(r,{cols:"12",sm:"6"},{default:e(()=>[t(P,null,{default:e(()=>[t(M,null,{default:e(()=>[t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"indigo",variant:"outlined",class:"summary-card"},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-play"}),d[2]||(d[2]=s(" 再生数 "))]),_:1}),t(v,{class:"py-2 mt-n3 text-h6 text-right"},{default:e(()=>[s(i(a(C)(n.video.viewCount??0))+" ",1),d[3]||(d[3]=o("span",{class:"text-subtitle-2"},"回",-1))]),_:1})]),_:1})]),_:1}),t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"orange-darken-1",variant:"outlined",class:"summary-card"},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-thumb-up"}),d[4]||(d[4]=s(" 高評価数 "))]),_:1}),t(v,{class:"pa-2 mt-n3 text-h6 text-right"},{default:e(()=>[s(i(a(C)(n.video.likeCount??0))+" ",1),d[5]||(d[5]=o("span",{class:"text-subtitle-2"}," ",-1))]),_:1})]),_:1})]),_:1}),t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"deep-purple-lighten-3",variant:"outlined",class:"summary-card"},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-comment"}),d[6]||(d[6]=s(" コメント数 "))]),_:1}),t(v,{class:"py-2 mt-n3 text-h6 text-right"},{default:e(()=>[s(i(a(C)(n.video.commentCount??0))+" ",1),d[7]||(d[7]=o("span",{class:"text-subtitle-2"},"個",-1))]),_:1})]),_:1})]),_:1}),t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"red",variant:"outlined",class:"summary-card",disabled:(n.video.chatMessageCount??0)===0},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-chat"}),d[8]||(d[8]=s(" チャット数 "))]),_:1}),t(v,{class:"py-2 mt-n3 text-h6 text-right"},{default:e(()=>[s(i(a(C)(n.video.chatMessageCount))+" ",1),d[9]||(d[9]=o("span",{class:"text-subtitle-2"},null,-1))]),_:1})]),_:1},8,["disabled"])]),_:1}),t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"teal",variant:"outlined",class:"summary-card",disabled:(n.video.chatUniqueUserCount??0)===0},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-account-multiple"}),d[10]||(d[10]=s(" チャットユーザ数 "))]),_:1}),t(v,{class:"pa-2 mt-n3 text-h6 text-right"},{default:e(()=>[s(i(a(C)(n.video.chatUniqueUserCount))+" ",1),d[11]||(d[11]=o("span",{class:"text-subtitle-2"}," ",-1))]),_:1})]),_:1},8,["disabled"])]),_:1}),t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"blue",variant:"outlined",class:"summary-card",disabled:n.video.scheduledStartTime==null},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-calendar"}),d[12]||(d[12]=s(" 配信開始予定日時 "))]),_:1}),t(v,{class:"py-2 mt-n3 text-body-2 text-right"},{default:e(()=>[s(i(n.video.scheduledStartTime?m(n.video.scheduledStartTime).format("YYYY/MM/DD HH:mm:ss"):"なし")+" ",1),d[13]||(d[13]=o("span",{class:"text-subtitle-2"},null,-1))]),_:1})]),_:1},8,["disabled"])]),_:1}),t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"blue",variant:"outlined",class:"summary-card",disabled:n.video.actualStartTime==null},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-calendar-start"}),d[14]||(d[14]=s(" 配信開始日時 "))]),_:1}),t(v,{class:"py-2 mt-n3 text-body-2 text-right"},{default:e(()=>[s(i(n.video.actualStartTime?m(n.video.actualStartTime).format("YYYY/MM/DD HH:mm:ss"):"なし")+" ",1),d[15]||(d[15]=o("span",{class:"text-subtitle-2"},null,-1))]),_:1})]),_:1},8,["disabled"])]),_:1}),t(r,{cols:"6",sm:"12",md:"6",class:"pa-1"},{default:e(()=>[t(g,{color:"blue",variant:"outlined",class:"summary-card",disabled:n.video.actualEndTime==null},{default:e(()=>[t(v,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(u,{icon:"mdi-calendar-end"}),d[16]||(d[16]=s(" 配信終了日時 "))]),_:1}),t(v,{class:"py-2 mt-n3 text-body-2 text-right"},{default:e(()=>[s(i(n.video.actualEndTime?m(n.video.actualEndTime).format("YYYY/MM/DD HH:mm:ss"):"なし")+" ",1),d[17]||(d[17]=o("span",{class:"text-subtitle-2"},null,-1))]),_:1})]),_:1},8,["disabled"])]),_:1})]),_:1})]),_:1})]),_:1})]),_:1})]),_:1}),t(V,null,{default:e(()=>[t(U),t(l,{color:"green-darken-1",variant:"text",onClick:d[0]||(d[0]=k=>f.value=!1)},{default:e(()=>d[18]||(d[18]=[s("閉じる")])),_:1})]),_:1})]),_:1})]),_:1},8,["modelValue"])}}}),mt={class:"text-left"},vt=$({__name:"VideoRanking",props:L({data:null,targetProperty:null,filterType:null,sortOrder:null,maxNumber:null},{filterType:()=>["streaming","video","shorts"],sortOrder:"descending",maxNumber:10}),setup(n){const f=R(()=>n.data.filter(m=>m.availability==="public").filter(m=>m.type&&n.filterType.includes(m.type)).filter(m=>{const y=F(m,n.targetProperty)??0;return isFinite(y)&&y>0}).sort((m,y)=>ot(F(m,n.targetProperty),F(y,n.targetProperty),n.sortOrder)).slice(0,n.maxNumber));return(m,y)=>{const d=c("v-table");return b(),I(d,{height:"600px",density:"compact",hover:""},{default:e(()=>[o("thead",null,[o("tr",null,[y[0]||(y[0]=o("th",null,"#",-1)),o("th",mt,i(a(Q)(m.targetProperty)),1),y[1]||(y[1]=o("th",null,null,-1)),y[2]||(y[2]=o("th",{class:"text-left"},"タイトル",-1))])]),o("tbody",null,[(b(!0),w(Y,null,lt(f.value,(r,u)=>(b(),w("tr",{key:r.videoId,style:{cursor:"pointer"}},[o("td",null,i(u+1),1),o("td",null,i(a(X)(m.targetProperty,a(F)(r,m.targetProperty))),1),o("td",null,[t(A,{videoId:r.videoId,size:"mq"},null,8,["videoId"])]),o("td",null,i(r.title),1),t(rt,{video:r},null,8,["video"])]))),128))])]),_:1})}}}),ft={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},pt={class:"pr-1 pt-0 mt-n2 text-h6 text-right"},ct={class:"pt-0 mt-n2 text-h6 text-right"},xt={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},bt={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},yt={class:"pr-2 pt-0 mt-n2 text-h6 text-right"},gt=$({__name:"DetailView",props:{channelId:null},setup(n){const{channels:f,fetching:m,errorOccurred:y,setChannelId:d,channel:r,videos:u}=Z(),v=R(()=>{var U,l;return B(((U=r.value)==null?void 0:U.activityEndDate)??void 0).diff(B((l=r.value)==null?void 0:l.activityStartDate),"days",!0)}),g=N("viewCount"),M=N(["video","streaming","shorts"]),P=N("descending");return at(async()=>await m.channels.invoke()),st(()=>n.channelId,()=>d(n.channelId),{immediate:!0}),(U,l)=>{var q;const V=c("v-icon"),x=c("v-card-text"),k=c("v-skeleton-loader"),D=c("v-card"),S=c("v-col"),J=c("v-row"),_=c("v-tab"),W=c("v-tabs"),H=c("v-btn"),z=c("v-btn-toggle"),h=c("v-container"),G=c("v-footer");return b(),I(tt,{"page-id":`stats/detail/${n.channelId}`,title:(q=a(r))==null?void 0:q.fullname,channels:a(f),"error-snackbar-shown":a(y)},{footer:e(()=>[t(G,{class:"bg-secondary text-center d-flex flex-column mt-10"},{default:e(()=>l[40]||(l[40]=[o("ul",null,[o("li",null,"数値の反映に数日かかることがあります"),o("li",null,"このサイトは非公式のファンサイトです")],-1)])),_:1})]),default:e(()=>[t(J,{class:"ma-0"},{default:e(()=>[t(S,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(D,{color:"red",variant:"flat",class:"summary-card"},{default:e(()=>{var p;return[t(x,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(V,{icon:"mdi-check"}),l[3]||(l[3]=s(" チャンネル登録者 "))]),_:1}),!((p=a(r))!=null&&p.statistics)||!Number.isFinite(v.value)||v.value===0?(b(),I(k,{key:0,color:"transparent",type:"text@2"})):(b(),w(Y,{key:1},[t(x,{class:"pa-2 mt-n3 text-h5 text-right"},{default:e(()=>[s(i(a(C)(a(r).statistics.subscriberCount))+" ",1),l[4]||(l[4]=o("span",{class:"text-subtitle-2"}," ",-1))]),_:1}),t(x,{class:"pa-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[l[5]||(l[5]=s(" 1日あたり ")),o("span",ft," +"+i(((a(r).statistics.subscriberCount??0)/v.value).toFixed(1)),1),l[6]||(l[6]=o("span",{class:"text-subtitle-2"}," ",-1))]),_:1})],64))]}),_:1})]),_:1}),t(S,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(D,{color:"green",variant:"flat",class:"summary-card"},{default:e(()=>[t(x,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(V,{icon:"mdi-video"}),l[7]||(l[7]=s(" 公開中の配信・動画 "))]),_:1}),a(u).length===0||!Number.isFinite(v.value)?(b(),I(k,{key:0,color:"transparent",type:"text@2"})):(b(),w(Y,{key:1},[t(x,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[s(i(a(C)(a(u).length))+" ",1),l[8]||(l[8]=o("span",{class:"text-subtitle-2"},"個",-1))]),_:1}),t(x,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[o("span",pt,i((v.value/a(u).length).toFixed(2)),1),l[9]||(l[9]=o("span",{class:"text-subtitle-2"},"日に1回",-1))]),_:1})],64))]),_:1})]),_:1}),t(S,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(D,{color:"teal",variant:"flat",class:"summary-card"},{default:e(()=>[t(x,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(V,{icon:"mdi-calendar-clock"}),l[10]||(l[10]=s(" 配信活動日数 "))]),_:1}),!a(r)||!Number.isFinite(v.value)?(b(),I(k,{key:0,color:"transparent",type:"text@2"})):(b(),w(Y,{key:1},[t(x,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[s(i(a(C)(Math.floor(v.value)))+" ",1),l[11]||(l[11]=o("span",{class:"text-subtitle-2"},"日",-1))]),_:1}),t(x,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>{var p;return[o("span",ct,i((p=a(r))==null?void 0:p.activityStartDate),1),l[12]||(l[12]=s(" 開始 "))]}),_:1})],64))]),_:1})]),_:1}),t(S,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(D,{color:"indigo",variant:"flat",class:"summary-card"},{default:e(()=>[t(x,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(V,{icon:"mdi-play"}),l[13]||(l[13]=s(" 総再生数 "))]),_:1}),a(u).length===0?(b(),I(k,{key:0,color:"transparent",type:"text@2"})):(b(),w(Y,{key:1},[t(x,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[s(i(a(C)(a(T)(a(u),p=>p.viewCount??0)))+" ",1),l[14]||(l[14]=o("span",{class:"text-subtitle-2"},"回",-1))]),_:1}),t(x,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[l[15]||(l[15]=s(" 1配信あたり ")),o("span",xt,i(a(C)(Math.floor(a(T)(a(u),p=>p.viewCount??0)/a(u).length))),1),l[16]||(l[16]=o("span",{class:"text-subtitle-2"},"回",-1))]),_:1})],64))]),_:1})]),_:1}),t(S,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(D,{color:"orange-darken-1",variant:"flat",class:"summary-card"},{default:e(()=>[t(x,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(V,{icon:"mdi-thumb-up"}),l[17]||(l[17]=s(" 総高評価数 "))]),_:1}),a(u).length===0?(b(),I(k,{key:0,color:"transparent",type:"text@2"})):(b(),w(Y,{key:1},[t(x,{class:"pa-2 mt-n3 text-h5 text-right"},{default:e(()=>[s(i(a(C)(a(T)(a(u),p=>p.likeCount??0)))+" ",1),l[18]||(l[18]=o("span",{class:"text-subtitle-2"}," ",-1))]),_:1}),t(x,{class:"pa-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[l[19]||(l[19]=s(" 1配信あたり ")),o("span",bt,i((a(T)(a(u),p=>p.likeCount??0)/a(u).length).toFixed(1)),1),l[20]||(l[20]=o("span",{class:"text-subtitle-2"}," ",-1))]),_:1})],64))]),_:1})]),_:1}),t(S,{cols:"6",sm:"4",class:"pa-1"},{default:e(()=>[t(D,{color:"deep-purple",variant:"flat",class:"summary-card"},{default:e(()=>[t(x,{class:"pa-2 text-subtitle-2"},{default:e(()=>[t(V,{icon:"mdi-comment"}),l[21]||(l[21]=s(" 総コメント数 "))]),_:1}),a(u).length===0?(b(),I(k,{key:0,color:"transparent",type:"text@2"})):(b(),w(Y,{key:1},[t(x,{class:"py-2 mt-n3 text-h5 text-right"},{default:e(()=>[s(i(a(C)(a(T)(a(u),p=>p.commentCount??0)))+" ",1),l[22]||(l[22]=o("span",{class:"text-subtitle-2"},"個",-1))]),_:1}),t(x,{class:"py-2 pt-0 mt-n2 text-subtitle-2 text-right"},{default:e(()=>[l[23]||(l[23]=s(" 1配信あたり ")),o("span",yt,i((a(T)(a(u),p=>p.commentCount??0)/a(u).length).toFixed(1)),1),l[24]||(l[24]=o("span",{class:"text-subtitle-2"},"個",-1))]),_:1})],64))]),_:1})]),_:1})]),_:1}),t(h,{class:"pa-1 mt-4"},{default:e(()=>[t(D,null,{default:e(()=>[t(W,{modelValue:g.value,"onUpdate:modelValue":l[0]||(l[0]=p=>g.value=p),"bg-color":"primary","center-active":"","show-arrows":""},{default:e(()=>[t(_,{value:"viewCount"},{default:e(()=>l[25]||(l[25]=[s("再生数")])),_:1}),t(_,{value:"likeCount"},{default:e(()=>l[26]||(l[26]=[s("高評価数")])),_:1}),t(_,{value:"commentCount"},{default:e(()=>l[27]||(l[27]=[s("コメント数")])),_:1}),t(_,{value:"chatMessageCount"},{default:e(()=>l[28]||(l[28]=[s("チャット数")])),_:1}),t(_,{value:"chatUniqueUserCount"},{default:e(()=>l[29]||(l[29]=[s("チャットユーザ数")])),_:1}),t(_,{value:"chatMessageCountPerUniqueUser"},{default:e(()=>l[30]||(l[30]=[s("ユーザあたりチャット数")])),_:1}),t(_,{value:"duration"},{default:e(()=>l[31]||(l[31]=[s("再生時間")])),_:1}),t(_,{value:"viewCountPerSecond"},{default:e(()=>l[32]||(l[32]=[s("時間あたり再生数")])),_:1}),t(_,{value:"likeCountPerSecond"},{default:e(()=>l[33]||(l[33]=[s("時間あたり高評価数")])),_:1}),t(_,{value:"commentCountPerSecond"},{default:e(()=>l[34]||(l[34]=[s("時間あたりコメント数")])),_:1}),t(_,{value:"chatMessageCountPerSecond"},{default:e(()=>l[35]||(l[35]=[s("時間あたりチャット数")])),_:1})]),_:1},8,["modelValue"]),t(z,{modelValue:M.value,"onUpdate:modelValue":l[1]||(l[1]=p=>M.value=p),multiple:"",divided:"",color:"secondary"},{default:e(()=>[t(x,null,{default:e(()=>l[36]||(l[36]=[s("対象")])),_:1}),t(H,{"prepend-icon":"mdi-microphone",value:"streaming"},{default:e(()=>l[37]||(l[37]=[s("配信")])),_:1}),t(H,{"prepend-icon":"mdi-video",value:"video"},{default:e(()=>l[38]||(l[38]=[s("動画")])),_:1}),t(H,{"prepend-icon":"mdi-cellphone-play",value:"shorts"},{default:e(()=>l[39]||(l[39]=[s("ショート")])),_:1})]),_:1},8,["modelValue"]),t(z,{modelValue:P.value,"onUpdate:modelValue":l[2]||(l[2]=p=>P.value=p),class:"ml-2",divided:"",color:"secondary",mandatory:""},{default:e(()=>[t(H,{icon:"mdi-sort-descending",value:"descending","aria-label":"降順"}),t(H,{icon:"mdi-sort-ascending",value:"ascending","aria-label":"昇順"})]),_:1},8,["modelValue"]),t(D,{flat:""},{default:e(()=>[t(vt,{data:a(u),"sort-order":P.value,"filter-type":M.value,"target-property":g.value,"max-number":30},null,8,["data","sort-order","filter-type","target-property"])]),_:1})]),_:1})]),_:1})]),_:1},8,["page-id","title","channels","error-snackbar-shown"])}}}),Dt=nt(gt,[["__scopeId","data-v-113240c4"]]);export{Dt as default};