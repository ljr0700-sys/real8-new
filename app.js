(() => {
"use strict";

const BUILD="2026.11.04-integrated2";
const cfg=window.REAL8_CONFIG||{};
const niceCfg=window.REAL8_NICE||{enabled:false,startUrl:""};

if(!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY){
  console.error("REAL8 configuration missing");
  return;
}

const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const TRADE_TYPES=["건축","매매","전세","월세","렌트","바꿔살기","펜션"];
const parties={
  "건축":["건축주","시공·설계 참여자"],
  "매매":["매도 희망","매수 희망"],
  "전세":["임대 희망","임차 희망"],
  "월세":["임대 희망","임차 희망"],
  "렌트":["대여 희망","이용 희망"],
  "바꿔살기":["교환 제안자","교환 상대"],
  "펜션":["운영·임대 제안","이용·인수 희망"]
};

let user=null;
let profile=null;
let rules={
  trade_rules:{},
  virtual_proposal_token:10,
  virtual_join_token:5,
  culture_register_token:10,
  culture_join_token:5,
  opinion_token:3,
  token_per_coin:100,
  coin_display_value:0,
  property_coin_per_100m:1
};

function show(id,text,ok=true){
  const el=$(id);
  if(!el)return;
  el.textContent=text||"";
  el.className="msg"+(ok?"":" error");
}
function setText(id,text){
  const el=$(id);
  if(el)el.textContent=text;
}
function numberFromText(v){
  const m=String(v||"").replace(/,/g,"").match(/[\d.]+/);
  return m?Number(m[0]):0;
}
function normalizeMemberId(v){ return String(v||"").trim().toLowerCase(); }
function validMemberId(v){ return /^[a-z0-9_]{4,20}$/.test(normalizeMemberId(v)); }
function safeHttpUrl(v){
  const s=String(v||"").trim();
  if(!s)return "";
  try{
    const u=new URL(s,location.origin);
    if(u.protocol!=="http:" && u.protocol!=="https:")return "";
    return u.href;
  }catch(_){ return ""; }
}
function identityVerified(){ return profile?.identity_verified===true; }
function isAdminUser(){ return profile?.role==="admin"; }
function niceEnabled(){ return niceCfg.enabled===true && typeof niceCfg.startUrl==="string" && niceCfg.startUrl.trim()!==""; }
function statusLabel(x){
  if(x?.owner_verified)return "관리자 확인";
  const s=String(x?.status||"등록");
  if(s==="등록")return "등록됨";
  if(s==="확인중")return "확인 중";
  if(s==="검증")return "검증됨";
  return s;
}
function statusBadge(x){
  const s=statusLabel(x);
  return `<span class="badge ${s==="관리자 확인"?"":"wait"}">${esc(s)}</span>`;
}
function rewardLabel(rule){
  if(!rule)return "0 TOKEN";
  return `${Number(rule.amount||0).toLocaleString()} ${esc(rule.unit||"TOKEN")}`;
}
function pageExists(id){ return Boolean($(id)?.classList.contains("page")); }

async function refreshSession(){
  const {data:{session}}=await db.auth.getSession();
  user=session?.user||null;
  profile=null;
  if(user){
    const {data,error}=await db.from("profiles").select("*").eq("user_id",user.id).maybeSingle();
    if(!error)profile=data||null;
  }
  renderAuthState();
  return user;
}
function renderAuthState(){
  if($("niceVerifyBtn")){
    $("niceVerifyBtn").disabled=!niceEnabled() || !user || identityVerified();
    $("niceVerifyBtn").textContent=identityVerified()
      ?"NICE 본인확인 완료"
      :(niceEnabled()?"NICE 휴대폰 본인확인":"NICE 본인확인 · 계약 준비중");
  }
  if($("phoneMsg")){
    if(identityVerified()) show("phoneMsg","NICE 본인확인이 완료된 회원입니다.");
    else if(!niceEnabled()) show("phoneMsg","현재 NICE 계약 전입니다. 계약 및 서버 연동 완료 후 본인확인이 활성화됩니다.");
    else if(!user) show("phoneMsg","로그인 후 NICE 본인확인을 진행할 수 있습니다.");
    else show("phoneMsg","NICE 본인확인을 완료하면 실제 등록 기능을 이용할 수 있습니다.");
  }
}

async function loadRules(){
  const res=await db.from("reward_rules").select("*").eq("id",1).maybeSingle();
  if(res.data)rules={...rules,...res.data};
}

async function requireLogin(messageId){
  await refreshSession();
  if(user)return true;
  show(messageId,"먼저 로그인해 주세요. 현재 입력한 내용은 그대로 유지됩니다.",false);
  return false;
}
async function requireVerified(messageId){
  await refreshSession();
  if(!user){
    show(messageId,"먼저 로그인해 주세요. 현재 입력한 내용은 그대로 유지됩니다.",false);
    return false;
  }
  if(isAdminUser())return true; // NICE 계약 전 개발 테스트용 관리자 우회
  if(!niceEnabled()){
    show(messageId,"현재 NICE 본인확인 계약·연동 준비중이라 일반 회원의 실제 등록은 잠겨 있습니다. 입력 내용은 그대로 유지됩니다.",false);
    return false;
  }
  if(!identityVerified()){
    show(messageId,"NICE 본인확인을 완료한 회원만 등록할 수 있습니다. 입력 내용은 그대로 유지됩니다.",false);
    return false;
  }
  return true;
}

/* -------------------- 페이지 이동 -------------------- */
function setPage(id,{persist=true,top=true}={}){
  if(!pageExists(id))return;
  document.querySelectorAll("nav button[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===id));
  if(persist)localStorage.setItem("real8_current_page",id);
  if(top)window.scrollTo(0,0);

  if(id==="trade" && $("matchList") && !$("matchList").textContent.trim())
    $("matchList").textContent="조건을 입력한 뒤 가까운 목록 보기를 눌러 주세요.";
  if(id==="virtual" && $("virtualList") && !$("virtualList").textContent.trim())
    $("virtualList").textContent="조건을 입력한 뒤 가까운 제안 찾기를 눌러 주세요.";
  if(id==="culture" && $("cultureList") && !$("cultureList").textContent.trim())
    $("cultureList").textContent="조건을 입력한 뒤 가까운 정보 보기를 눌러 주세요.";

  if(id==="mypage")loadMy();
  if(id==="rewards")loadRewards();
}
document.querySelectorAll("nav button[data-page]").forEach(b=>{
  b.addEventListener("click",()=>setPage(b.dataset.page));
});
document.querySelectorAll(".go").forEach(b=>{
  b.addEventListener("click",()=>{
    const target=b.dataset.go;
    if(target==="homeAuth"){
      setPage("home");
      $("homeAuth")?.scrollIntoView({block:"start"});
    }else{
      setPage(target);
    }
  });
});

/* -------------------- 회원가입 / 로그인 -------------------- */
$("signupForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  show("signupMsg","");
  const memberId=normalizeMemberId($("signupMemberId").value);
  const name=$("signupName").value.trim();
  const email=$("signupEmail").value.trim();
  const p1=$("signupPassword").value;
  const p2=$("signupPassword2").value;

  if(!validMemberId(memberId))return show("signupMsg","회원 ID는 영문 소문자·숫자·_만 사용하여 4~20자로 입력해 주세요.",false);
  if(!name)return show("signupMsg","이름을 입력해 주세요.",false);
  if(p1!==p2)return show("signupMsg","비밀번호가 서로 다릅니다.",false);

  const {data,error}=await db.auth.signUp({
    email,
    password:p1,
    options:{
      data:{display_name:name,member_id:memberId},
      emailRedirectTo:location.origin+location.pathname
    }
  });
  if(error){
    const msg=/duplicate|unique|member_id/i.test(error.message||"")
      ?"이미 사용 중인 회원 ID이거나 가입정보가 중복됩니다."
      :error.message;
    return show("signupMsg",msg,false);
  }
  show("signupMsg",data.session
    ?"회원가입과 로그인이 완료되었습니다. NICE 본인확인은 계약·연동 완료 후 사용할 수 있습니다."
    :"회원가입이 접수되었습니다. 이메일 확인 링크를 누른 뒤 로그인해 주세요.");
  await refreshSession();
});

$("loginForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  show("loginMsg","");
  const {error}=await db.auth.signInWithPassword({
    email:$("loginEmail").value.trim(),
    password:$("loginPassword").value
  });
  if(error)return show("loginMsg",error.message,false);
  await refreshSession();
  if(identityVerified()) show("loginMsg","로그인되었습니다. NICE 본인확인도 완료된 회원입니다.");
  else if(isAdminUser() && !niceEnabled()) show("loginMsg","로그인되었습니다. NICE 계약 전 관리자 개발 테스트 모드입니다.");
  else if(!niceEnabled()) show("loginMsg","로그인되었습니다. NICE 본인확인은 계약·연동 완료 후 사용할 수 있습니다.");
  else show("loginMsg","로그인되었습니다. 실제 등록 전 NICE 본인확인을 완료해 주세요.");
});

$("resetPasswordBtn")?.addEventListener("click",async()=>{
  const email=$("loginEmail").value.trim();
  if(!email)return show("loginMsg","이메일을 먼저 입력해 주세요.",false);
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  show("loginMsg",error?error.message:"비밀번호 재설정 이메일을 보냈습니다.",!error);
});

function openPasswordReset(){
  setPage("home",{persist:false,top:true});
  $("passwordResetPanel")?.classList.remove("hidden");
  $("homeAuth")?.classList.add("hidden");
}
if(location.hash.includes("type=recovery")||location.search.includes("type=recovery"))openPasswordReset();

$("passwordResetForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const p1=$("newPassword").value;
  const p2=$("newPassword2").value;
  if(p1.length<8)return show("passwordResetMsg","비밀번호는 8자 이상이어야 합니다.",false);
  if(p1!==p2)return show("passwordResetMsg","두 비밀번호가 서로 다릅니다.",false);
  const {error}=await db.auth.updateUser({password:p1});
  if(error)return show("passwordResetMsg",error.message,false);
  show("passwordResetMsg","비밀번호가 변경되었습니다. 다시 로그인해 주세요.");
  await db.auth.signOut();
  user=null; profile=null;
  $("passwordResetPanel")?.classList.add("hidden");
  $("homeAuth")?.classList.remove("hidden");
  history.replaceState({},document.title,location.pathname);
  renderAuthState();
});

$("logoutBtn")?.addEventListener("click",async()=>{
  await db.auth.signOut();
  user=null; profile=null;
  if($("loginEmail"))$("loginEmail").value="";
  if($("loginPassword"))$("loginPassword").value="";
  clearMyPage();
  show("loginMsg","로그아웃되었습니다.");
  renderAuthState();
});

db.auth.onAuthStateChange((event)=>{
  if(event==="PASSWORD_RECOVERY"){
    openPasswordReset();
    return;
  }
  // 로그인 상태 변화는 세션 정보만 갱신하고 사용자가 보고 있던 페이지를 절대 바꾸지 않는다.
  if(["INITIAL_SESSION","SIGNED_IN","SIGNED_OUT","USER_UPDATED","TOKEN_REFRESHED"].includes(event)){
    setTimeout(()=>refreshSession(),0);
  }
});

/* -------------------- NICE -------------------- */
$("niceVerifyBtn")?.addEventListener("click",async()=>{
  await refreshSession();
  if(!user)return show("phoneMsg","먼저 로그인해 주세요.",false);
  if(identityVerified())return show("phoneMsg","이미 NICE 본인확인이 완료된 회원입니다.");
  if(!niceEnabled())return show("phoneMsg","현재 NICE 계약 전입니다. 계약 및 서버 연동 완료 후 활성화됩니다.",false);

  const returnTo=location.origin+location.pathname+"?nice=done";
  const u=new URL(niceCfg.startUrl,location.href);
  u.searchParams.set("return_to",returnTo);
  location.href=u.toString();
});

/* -------------------- 파일 -------------------- */
async function uploadFile(input,folder){
  const file=input?.files?.[0];
  if(!file)return null;
  if(!(await requireVerified(folder==="virtual"?"virtualMsg":"cultureMsg")))throw new Error("등록 권한이 없습니다.");
  if(file.size>20*1024*1024)throw new Error("파일은 20MB 이하로 올려 주세요.");

  const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf","video/mp4"]);
  if(!allowed.has(file.type))throw new Error("허용 파일: JPG, PNG, WebP, PDF, MP4");

  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${user.id}/${folder}/${Date.now()}_${safeName}`;

  if(file.type==="application/pdf"){
    const {error}=await db.storage.from("private_documents").upload(path,file,{upsert:false,contentType:file.type});
    if(error)throw error;
    return {file_bucket:"private_documents",file_path:path,file_name:file.name};
  }

  const {error}=await db.storage.from("media").upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  const publicUrl=db.storage.from("media").getPublicUrl(path).data.publicUrl;
  return {file_bucket:"media",file_path:path,file_url:publicUrl,file_name:file.name};
}
async function attachmentHtml(x){
  const d=x?.details_json||{};
  const external=safeHttpUrl(d.link_url);
  let fileUrl=safeHttpUrl(d.file_url);

  if(d.file_bucket==="private_documents" && d.file_path){
    const {data,error}=await db.storage.from("private_documents").createSignedUrl(d.file_path,300);
    if(!error)fileUrl=data?.signedUrl||"";
  }else if(!fileUrl && d.file_bucket==="media" && d.file_path){
    fileUrl=db.storage.from("media").getPublicUrl(d.file_path).data.publicUrl;
  }

  const links=[];
  if(fileUrl)links.push(`<a href="${esc(fileUrl)}" target="_blank" rel="noopener noreferrer">첨부 자료 열기</a>`);
  if(external)links.push(`<a href="${esc(external)}" target="_blank" rel="noopener noreferrer">외부 자료 링크</a>`);
  return links.length?`<div class="media">${links.join(" · ")}</div>`:"";
}

/* -------------------- 부동산 -------------------- */
function updateTradeParties(){
  const type=$("tradeType")?.value||"건축";
  const [a,b]=parties[type]||["갑","을"];
  setText("partyA",a);
  setText("partyB",b);
}
$("tradeType")?.addEventListener("change",updateTradeParties);
$("ownerClaim")?.addEventListener("change",()=>{
  $("publicPriceWrap")?.classList.toggle("hidden",!$("ownerClaim").checked);
});

$("tradeForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  e.stopPropagation();
  show("tradeMsg","");
  if(!(await requireVerified("tradeMsg")))return;

  const type=$("tradeType").value;
  const side=document.querySelector('input[name="tradeSide"]:checked')?.value||"갑";
  const [pa,pb]=parties[type];
  const condition=$("tradeCondition").value.trim();
  const owner=$("ownerClaim").checked;
  const details={
    area:$("tradeArea").value.trim(),
    period:$("tradePeriod").value.trim(),
    contact_name:$("tradeContactName").value.trim(),
    contact_phone:$("tradeContactPhone").value.trim(),
    contact_email:$("tradeContactEmail").value.trim()
  };

  if(!details.contact_name||!details.contact_phone||!details.contact_email)
    return show("tradeMsg","연락처 이름·전화·이메일을 모두 입력해 주세요.",false);

  const {data,error}=await db.from("posts").insert({
    author_id:user.id,
    category:type,
    title:null,
    region:$("tradeRegion").value.trim(),
    asset_address:$("tradeAddress").value.trim(),
    price:numberFromText($("tradePrice").value),
    party_a_label:pa,
    party_b_label:pb,
    transaction_side:side,
    condition_a:side==="갑"?condition:null,
    condition_b:side==="을"?condition:null,
    content:$("tradeContent").value.trim()||condition,
    details_json:details,
    owner_claim:owner,
    public_price:owner?numberFromText($("publicPrice").value):0,
    status:"등록"
  }).select("id,record_hash").single();

  if(error)return show("tradeMsg","등록 오류: "+error.message,false);

  let rewardText="";
  const reward=await db.rpc("award_trade_registration",{p_post_id:data.id});
  if(reward.error){
    rewardText=" 등록은 완료됐지만 보상 처리는 확인이 필요합니다.";
  }else{
    rewardText=` 지급: ${Number(reward.data?.[0]?.token_amount||0)} TOKEN / ${Number(reward.data?.[0]?.coin_amount||0)} COIN`;
  }

  show("tradeMsg","등록되었습니다."+rewardText+(owner?" 소유확인 보상은 관리자 검정 후 지급됩니다.":""));
  e.currentTarget.reset();
  $("publicPriceWrap")?.classList.add("hidden");
  updateTradeParties();
});

$("matchBtn")?.addEventListener("click",loadMatches);
async function loadMatches(){
  if(!(await requireLogin("tradeMsg"))){
    if($("matchList"))$("matchList").textContent="로그인한 회원만 상세 목록을 볼 수 있습니다.";
    return;
  }
  const type=$("matchType").value;
  const region=$("matchRegion").value.trim().toLowerCase();
  const price=numberFromText($("matchPrice").value);
  const area=numberFromText($("matchArea").value);

  if(!type&&!region&&!price&&!area){
    $("matchList").textContent="거래종류·지역·희망금액·면적 중 한 가지 이상 입력해 주세요.";
    return;
  }

  let q=db.from("posts").select("*").in("category",TRADE_TYPES).order("created_at",{ascending:false}).limit(150);
  if(type)q=q.eq("category",type);
  const {data,error}=await q;
  if(error)return $("matchList").textContent="조회 오류: "+error.message;

  let rows=(data||[]).map(x=>{
    const d=x.details_json||{};
    let score=0;
    if(region){
      const xr=String(x.region||"").toLowerCase();
      if(xr===region)score+=100;
      else if(xr.includes(region)||region.includes(xr))score+=60;
      else score-=80;
    }
    if(price){
      const xp=Number(x.price||0);
      const diff=Math.abs(xp-price)/Math.max(price,1);
      score+=Math.max(0,60-diff*60);
    }
    if(area){
      const xa=numberFromText(d.area);
      if(xa){
        const diff=Math.abs(xa-area)/Math.max(area,1);
        score+=Math.max(0,40-diff*40);
      }
    }
    return {...x,_score:score};
  });
  if(region)rows=rows.filter(x=>x._score>-40);
  rows.sort((a,b)=>b._score-a._score||new Date(b.created_at)-new Date(a.created_at));
  rows=rows.slice(0,30);

  $("matchList").innerHTML=rows.map(x=>{
    const d=x.details_json||{};
    const cond=x.transaction_side==="을"?x.condition_b:x.condition_a;
    return `<details class="item">
      <summary>${esc(x.category)} · ${esc(x.region||"-")} · ${Number(x.price||0).toLocaleString()}원 — 상세 내용 보기</summary>
      ${statusBadge(x)}
      <div><b>부동산 주소</b> ${esc(x.asset_address||"-")}</div>
      <div><b>지역</b> ${esc(x.region||"-")}</div>
      <div><b>희망 금액</b> ${Number(x.price||0).toLocaleString()}원</div>
      <div><b>면적/규모</b> ${esc(d.area||"-")}</div>
      <div><b>희망 기간</b> ${esc(d.period||"-")}</div>
      <div><b>희망 조건</b> ${esc(cond||"-")}</div>
      <div><b>추가 설명</b> ${esc(x.content||"-")}</div>
      <div><b>연락처 이름</b> ${esc(d.contact_name||"-")}</div>
      <div><b>연락처 전화</b> ${esc(d.contact_phone||"-")}</div>
      <div><b>연락처 이메일</b> ${esc(d.contact_email||"-")}</div>
      ${x.public_price?`<div><b>공시가격</b> ${Number(x.public_price).toLocaleString()}원</div>`:""}
      ${x.record_hash?`<div class="hash"><b>해시</b> ${esc(x.record_hash)}</div>`:""}
    </details>`;
  }).join("")||"조건에 가까운 등록정보가 없습니다.";
}

/* -------------------- 가상건축 -------------------- */
$("virtualForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  e.stopPropagation();
  show("virtualMsg","");
  if(!(await requireVerified("virtualMsg")))return;
  try{
    const upload=await uploadFile($("virtualFile"),"virtual");
    const link=safeHttpUrl($("virtualLink").value);
    if($("virtualLink").value.trim()&&!link)throw new Error("자료 링크는 http:// 또는 https:// 주소만 사용할 수 있습니다.");

    const details={
      sub_category:$("virtualCategory").value,
      purpose:$("virtualPurpose").value.trim(),
      scale:$("virtualScale").value.trim(),
      budget:$("virtualBudget").value.trim(),
      style:$("virtualStyle").value.trim(),
      link_url:link,
      ...(upload||{})
    };
    const {data,error}=await db.from("posts").insert({
      author_id:user.id,
      category:"가상건축",
      title:$("virtualTitle").value.trim(),
      region:$("virtualRegion").value.trim(),
      content:$("virtualContent").value.trim(),
      details_json:details,
      status:"등록"
    }).select("id").single();
    if(error)throw error;

    const reward=await db.rpc("award_simple_activity",{p_action:"virtual_register",p_reference_id:data.id});
    show("virtualMsg",reward.error
      ?"제안은 등록됐지만 보상 처리는 확인이 필요합니다."
      :"가상건축 제안이 등록되고 TOKEN이 지급되었습니다.",!reward.error);
    e.currentTarget.reset();
  }catch(err){
    show("virtualMsg",err.message||String(err),false);
  }
});

$("virtualFindBtn")?.addEventListener("click",loadVirtual);
async function loadVirtual(){
  if(!(await requireLogin("virtualMsg"))){
    $("virtualList").textContent="로그인한 회원만 목록을 볼 수 있습니다.";
    return;
  }
  const region=$("virtualFindRegion").value.trim().toLowerCase();
  const cat=$("virtualFindCategory").value;
  const budget=numberFromText($("virtualFindBudget").value);
  const scale=numberFromText($("virtualFindScale").value);
  if(!region&&!cat&&!budget&&!scale){
    $("virtualList").textContent="지역·분류·예산·규모 중 한 가지 이상 입력해 주세요.";
    return;
  }

  const {data,error}=await db.from("posts").select("*").eq("category","가상건축").order("created_at",{ascending:false}).limit(150);
  if(error)return $("virtualList").textContent="조회 오류: "+error.message;

  let rows=(data||[]).map(x=>{
    const d=x.details_json||{};
    let score=0;
    if(cat)score+=d.sub_category===cat?100:-100;
    if(region){
      const xr=String(x.region||"").toLowerCase();
      if(xr===region)score+=80;
      else if(xr.includes(region)||region.includes(xr))score+=50;
      else score-=60;
    }
    if(budget){
      const xb=numberFromText(d.budget);
      if(xb)score+=Math.max(0,50-Math.abs(xb-budget)/Math.max(budget,1)*50);
    }
    if(scale){
      const xs=numberFromText(d.scale);
      if(xs)score+=Math.max(0,40-Math.abs(xs-scale)/Math.max(scale,1)*40);
    }
    return {...x,_score:score};
  });
  if(cat)rows=rows.filter(x=>(x.details_json||{}).sub_category===cat);
  if(region)rows=rows.filter(x=>x._score>-40);
  rows.sort((a,b)=>b._score-a._score||new Date(b.created_at)-new Date(a.created_at));
  rows=rows.slice(0,30);

  const rendered=await Promise.all(rows.map(async x=>{
    const d=x.details_json||{};
    return `<div class="item">
      <b>${esc(d.sub_category||"가상건축")} · ${esc(x.title||"")}</b>
      ${statusBadge(x)}
      <div class="meta">지역 ${esc(x.region||"-")} / 목적 ${esc(d.purpose||"-")} / 규모 ${esc(d.scale||"-")} / 예산 ${esc(d.budget||"-")}</div>
      <div>${esc(x.content||"")}</div>
      ${await attachmentHtml(x)}
      <div class="participate">
        <textarea id="vp_${x.id}" placeholder="구체적인 의견·수정안·참여 내용을 적어 주세요."></textarea>
        <button type="button" class="secondary joinV" data-id="${x.id}">참여 등록</button>
        <div id="vpm_${x.id}" class="msg"></div>
      </div>
    </div>`;
  }));
  $("virtualList").innerHTML=rendered.join("")||"조건에 가까운 제안이 없습니다.";

  document.querySelectorAll(".joinV").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      if(!(await requireVerified("vpm_"+btn.dataset.id)))return;
      const content=$("vp_"+btn.dataset.id)?.value.trim();
      if(!content)return show("vpm_"+btn.dataset.id,"참여 내용을 입력해 주세요.",false);
      const {error}=await db.from("participations").insert({
        post_id:Number(btn.dataset.id),user_id:user.id,kind:"virtual",content
      });
      if(error)return show("vpm_"+btn.dataset.id,error.message,false);
      const reward=await db.rpc("award_simple_activity",{p_action:"virtual_join",p_reference_id:Number(btn.dataset.id)});
      show("vpm_"+btn.dataset.id,reward.error?"참여는 저장됐지만 보상 처리는 확인이 필요합니다.":"참여가 저장되고 TOKEN이 지급되었습니다.",!reward.error);
    });
  });
}

/* -------------------- 거주문화 -------------------- */
$("cultureForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  e.stopPropagation();
  show("cultureMsg","");
  if(!(await requireVerified("cultureMsg")))return;
  try{
    const upload=await uploadFile($("cultureFile"),"culture");
    const link=safeHttpUrl($("cultureLink").value);
    if($("cultureLink").value.trim()&&!link)throw new Error("자료 링크는 http:// 또는 https:// 주소만 사용할 수 있습니다.");

    const details={link_url:link,...(upload||{})};
    const {data,error}=await db.from("posts").insert({
      author_id:user.id,
      category:$("cultureCategory").value,
      title:$("cultureTitle").value.trim(),
      region:$("cultureRegion").value.trim(),
      content:$("cultureContent").value.trim(),
      details_json:details,
      status:"등록"
    }).select("id").single();
    if(error)throw error;

    const reward=await db.rpc("award_simple_activity",{p_action:"culture_register",p_reference_id:data.id});
    show("cultureMsg",reward.error
      ?"정보는 등록됐지만 보상 처리는 확인이 필요합니다."
      :"거주문화 정보가 등록되고 TOKEN이 지급되었습니다.",!reward.error);
    e.currentTarget.reset();
  }catch(err){
    show("cultureMsg",err.message||String(err),false);
  }
});

$("cultureFindBtn")?.addEventListener("click",loadCulture);
async function loadCulture(){
  if(!(await requireLogin("cultureMsg"))){
    $("cultureList").textContent="로그인한 회원만 목록을 볼 수 있습니다.";
    return;
  }
  const region=$("cultureFindRegion").value.trim().toLowerCase();
  const cat=$("cultureFilter").value;
  if(!region&&!cat){
    $("cultureList").textContent="지역 또는 분야 중 한 가지 이상 입력해 주세요.";
    return;
  }

  let q=db.from("posts").select("*").not("category","in",`(${TRADE_TYPES.map(x=>`"${x}"`).join(",")},"가상건축")`).order("created_at",{ascending:false}).limit(150);
  if(cat)q=q.eq("category",cat);
  let {data,error}=await q;
  // PostgREST의 not/in 조합이 환경에 따라 실패할 수 있어 안전한 fallback 사용
  if(error){
    const fallback=await db.from("posts").select("*").order("created_at",{ascending:false}).limit(150);
    data=(fallback.data||[]).filter(x=>!TRADE_TYPES.includes(x.category)&&x.category!=="가상건축");
    error=fallback.error;
  }
  if(error)return $("cultureList").textContent="조회 오류: "+error.message;

  let rows=(data||[]).map(x=>{
    let score=0;
    if(cat)score+=x.category===cat?100:-100;
    if(region){
      const xr=String(x.region||"").toLowerCase();
      if(xr===region)score+=80;
      else if(xr.includes(region)||region.includes(xr))score+=50;
      else score-=60;
    }
    return {...x,_score:score};
  });
  if(cat)rows=rows.filter(x=>x.category===cat);
  if(region)rows=rows.filter(x=>x._score>-40);
  rows.sort((a,b)=>b._score-a._score||new Date(b.created_at)-new Date(a.created_at));
  rows=rows.slice(0,30);

  const rendered=await Promise.all(rows.map(async x=>`<div class="item">
    <b>${esc(x.category)} · ${esc(x.title||"")}</b>
    ${statusBadge(x)}
    <div class="meta">지역 ${esc(x.region||"-")}</div>
    <div>${esc(x.content||"")}</div>
    ${await attachmentHtml(x)}
    <div class="participate">
      <textarea id="cp_${x.id}" placeholder="경험·보완 의견·검증 내용을 적어 주세요."></textarea>
      <button type="button" class="secondary joinC" data-id="${x.id}">참여 등록</button>
      <div id="cpm_${x.id}" class="msg"></div>
    </div>
  </div>`));
  $("cultureList").innerHTML=rendered.join("")||"조건에 가까운 정보가 없습니다.";

  document.querySelectorAll(".joinC").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      if(!(await requireVerified("cpm_"+btn.dataset.id)))return;
      const content=$("cp_"+btn.dataset.id)?.value.trim();
      if(!content)return show("cpm_"+btn.dataset.id,"참여 내용을 입력해 주세요.",false);
      const {error}=await db.from("participations").insert({
        post_id:Number(btn.dataset.id),user_id:user.id,kind:"culture",content
      });
      if(error)return show("cpm_"+btn.dataset.id,error.message,false);
      const reward=await db.rpc("award_simple_activity",{p_action:"culture_join",p_reference_id:Number(btn.dataset.id)});
      show("cpm_"+btn.dataset.id,reward.error?"참여는 저장됐지만 보상 처리는 확인이 필요합니다.":"참여가 저장되고 TOKEN이 지급되었습니다.",!reward.error);
    });
  });
}

/* -------------------- 보상 -------------------- */
async function loadRewards(){
  await loadRules();
  const tr=rules.trade_rules||{};
  let html=TRADE_TYPES.map(t=>`<div class="item"><b>${esc(t)}</b><span>${rewardLabel(tr[t])}</span></div>`).join("");
  html+=`<div class="item"><b>가상건축 제안</b><span>${Number(rules.virtual_proposal_token||0).toLocaleString()} TOKEN</span></div>`;
  html+=`<div class="item"><b>가상건축 참여</b><span>${Number(rules.virtual_join_token||0).toLocaleString()} TOKEN</span></div>`;
  html+=`<div class="item"><b>거주문화 등록</b><span>${Number(rules.culture_register_token||0).toLocaleString()} TOKEN</span></div>`;
  html+=`<div class="item"><b>거주문화 참여</b><span>${Number(rules.culture_join_token||0).toLocaleString()} TOKEN</span></div>`;
  html+=`<div class="item"><b>전환</b><span>${Number(rules.token_per_coin||100).toLocaleString()} TOKEN = 1 COIN</span></div>`;
  $("publicRuleList").innerHTML=html;
}

$("convertBtn")?.addEventListener("click",async()=>{
  if(!(await requireVerified("convertMsg")))return;
  const {data,error}=await db.rpc("convert_my_tokens_to_coin");
  if(error)return show("convertMsg",error.message,false);
  const row=data?.[0]||{};
  show("convertMsg",`${Number(row.tokens_used||0).toLocaleString()} TOKEN을 ${Number(row.coins_added||0).toLocaleString()} COIN으로 전환했습니다.`);
  loadMy();
});

/* -------------------- 마이페이지 -------------------- */
function clearMyPage(){
  setText("profileBox","로그인 후 표시됩니다.");
  ["myToken","myCoin","myTradeCount","myPostCount","myParticipationCount"].forEach(id=>setText(id,"0"));
  setText("myValue","0원");
  ["myPosts","myRewards","myConversions","myActivity"].forEach(id=>setText(id,""));
  $("adminArea")?.classList.add("hidden");
}
function editPanelHtml(post){
  const d=post.details_json||{};
  const isTrade=TRADE_TYPES.includes(post.category);
  const condition=post.transaction_side==="을"?(post.condition_b||""):(post.condition_a||"");

  if(isTrade){
    return `<div class="edit-card">
      <label>지역<input data-f="region" value="${esc(post.region||"")}"></label>
      <label>부동산 주소<input data-f="asset_address" value="${esc(post.asset_address||"")}"></label>
      <label>희망 금액(원)<input data-f="price" type="number" min="0" value="${Number(post.price||0)}"></label>
      <label>면적/규모<input data-f="area" value="${esc(d.area||"")}"></label>
      <label>희망 기간<input data-f="period" value="${esc(d.period||"")}"></label>
      <label>희망 조건<textarea data-f="condition">${esc(condition)}</textarea></label>
      <label>추가 설명<textarea data-f="content">${esc(post.content||"")}</textarea></label>
      <label>연락처 이름<input data-f="contact_name" value="${esc(d.contact_name||"")}"></label>
      <label>연락처 전화<input data-f="contact_phone" value="${esc(d.contact_phone||"")}"></label>
      <label>연락처 이메일<input data-f="contact_email" type="email" value="${esc(d.contact_email||"")}"></label>
      <div class="button-row">
        <button type="button" class="primary saveEdit" data-id="${post.id}">수정 내용 저장</button>
        <button type="button" class="secondary cancelEdit" data-id="${post.id}">취소</button>
      </div>
    </div>`;
  }
  return `<div class="edit-card">
    <label>제목<input data-f="title" value="${esc(post.title||"")}"></label>
    <label>지역<input data-f="region" value="${esc(post.region||"")}"></label>
    <label>내용<textarea data-f="content">${esc(post.content||"")}</textarea></label>
    <div class="button-row">
      <button type="button" class="primary saveEdit" data-id="${post.id}">수정 내용 저장</button>
      <button type="button" class="secondary cancelEdit" data-id="${post.id}">취소</button>
    </div>
  </div>`;
}
async function loadMy(){
  await refreshSession();
  if(!user){
    clearMyPage();
    return;
  }
  await loadRules();

  const memberName=profile?.display_name||user.user_metadata?.display_name||user.email||"회원";
  $("profileBox").innerHTML=`
    <b>${esc(memberName)}</b>
    ${profile?.member_id?`<div class="meta">회원 ID: ${esc(profile.member_id)}</div>`:""}
    <div class="meta">이메일: ${esc(user.email||profile?.email||"-")}</div>
    <div class="meta">권한: ${esc(profile?.role||"member")}</div>
    ${identityVerified()?'<span class="badge">NICE 본인확인 완료</span>':'<span class="badge wait">NICE 본인확인 필요</span>'}
    ${isAdminUser()&&!niceEnabled()?'<div class="meta">NICE 계약 전 관리자 개발 테스트 가능</div>':""}
  `;

  const [postsRes,rewardRes,partRes]=await Promise.all([
    db.from("posts").select("*").eq("author_id",user.id).order("created_at",{ascending:false}),
    db.from("reward_ledger").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
    db.from("participations").select("*").eq("user_id",user.id).order("created_at",{ascending:false})
  ]);
  const p=postsRes.data||[];
  const r=rewardRes.data||[];
  const pa=partRes.data||[];

  const token=r.reduce((s,x)=>s+Number(x.token_amount||0),0);
  const coin=r.reduce((s,x)=>s+Number(x.coin_amount||0),0);
  setText("myToken",token.toLocaleString());
  setText("myCoin",coin.toLocaleString());
  setText("myValue",Math.round(coin*Number(rules.coin_display_value||0)).toLocaleString()+"원");
  setText("myTradeCount",p.filter(x=>TRADE_TYPES.includes(x.category)).length.toLocaleString());
  setText("myPostCount",p.length.toLocaleString());
  setText("myParticipationCount",pa.length.toLocaleString());

  $("myPosts").innerHTML=p.map(post=>{
    const d=post.details_json||{};
    const condition=post.transaction_side==="을"?post.condition_b:post.condition_a;
    return `<div class="item" data-post="${post.id}">
      <b>${esc(post.category)}${post.title?` · ${esc(post.title)}`:""}</b>
      ${statusBadge(post)}
      <div class="meta">${new Date(post.created_at).toLocaleString("ko-KR")}</div>
      ${post.asset_address?`<div><b>주소</b> ${esc(post.asset_address)}</div>`:""}
      ${post.region?`<div><b>지역</b> ${esc(post.region)}</div>`:""}
      ${Number(post.price||0)?`<div><b>금액</b> ${Number(post.price||0).toLocaleString()}원</div>`:""}
      ${d.area?`<div><b>면적/규모</b> ${esc(d.area)}</div>`:""}
      ${d.period?`<div><b>희망 기간</b> ${esc(d.period)}</div>`:""}
      ${condition?`<div><b>희망 조건</b> ${esc(condition)}</div>`:""}
      ${post.content?`<div><b>내용</b> ${esc(post.content)}</div>`:""}
      ${d.contact_name?`<div><b>연락처 이름</b> ${esc(d.contact_name)}</div>`:""}
      ${d.contact_phone?`<div><b>연락처 전화</b> ${esc(d.contact_phone)}</div>`:""}
      ${d.contact_email?`<div><b>연락처 이메일</b> ${esc(d.contact_email)}</div>`:""}
      ${post.public_price?`<div><b>공시가격</b> ${Number(post.public_price).toLocaleString()}원</div>`:""}
      ${post.record_hash?`<div class="hash">해시 ${esc(post.record_hash)}</div>`:""}
      <div class="button-row">
        <button type="button" class="secondary openEdit" data-id="${post.id}">수정</button>
        <button type="button" class="danger deletePost" data-id="${post.id}">삭제</button>
      </div>
      <div id="editPanel_${post.id}" class="hidden">${editPanelHtml(post)}</div>
      <div id="editMsg_${post.id}" class="msg"></div>
    </div>`;
  }).join("")||"아직 등록한 정보가 없습니다.";

  $("myRewards").innerHTML=r.filter(x=>x.action!=="token_convert").map(x=>`
    <div class="item">
      <b>보상 ${esc(x.action||"활동")}</b>
      <div>TOKEN ${Number(x.token_amount||0).toLocaleString()} / COIN ${Number(x.coin_amount||0).toLocaleString()}</div>
      <div class="meta">${new Date(x.created_at).toLocaleString("ko-KR")}</div>
      ${x.issue_hash?`<div class="hash">해시 ${esc(x.issue_hash)}</div>`:""}
    </div>`).join("")||"아직 보상 기록이 없습니다.";

  $("myConversions").innerHTML=r.filter(x=>x.action==="token_convert").map(x=>`
    <div class="item">
      <b>전환</b>
      <div>${Math.abs(Number(x.token_amount||0)).toLocaleString()} TOKEN → ${Number(x.coin_amount||0).toLocaleString()} COIN</div>
      <div class="meta">${new Date(x.created_at).toLocaleString("ko-KR")}</div>
    </div>`).join("")||"아직 전환 기록이 없습니다.";

  $("myActivity").innerHTML=pa.map(x=>`
    <div class="item"><b>참여 ${esc(x.kind||"")}</b><div>${esc(x.content||"")}</div><div class="meta">${new Date(x.created_at).toLocaleString("ko-KR")}</div></div>
  `).join("")||"아직 참여 기록이 없습니다.";

  bindMyPageEditors(p);

  $("adminArea")?.classList.toggle("hidden",!isAdminUser());
  if(isAdminUser())loadAdmin();
}
function bindMyPageEditors(posts){
  document.querySelectorAll(".openEdit").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const panel=$("editPanel_"+btn.dataset.id);
      if(!panel)return;
      const hidden=panel.classList.toggle("hidden");
      btn.textContent=hidden?"수정":"수정창 닫기";
    });
  });
  document.querySelectorAll(".cancelEdit").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const panel=$("editPanel_"+btn.dataset.id);
      if(panel)panel.classList.add("hidden");
    });
  });
  document.querySelectorAll(".saveEdit").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const id=Number(btn.dataset.id);
      const post=posts.find(x=>Number(x.id)===id);
      const panel=$("editPanel_"+id);
      if(!post||!panel)return;
      if(!(await requireVerified("editMsg_"+id)))return;

      const get=f=>panel.querySelector(`[data-f="${f}"]`)?.value?.trim()||"";
      let updateData={};
      if(TRADE_TYPES.includes(post.category)){
        const d={...(post.details_json||{})};
        const region=get("region");
        const contactName=get("contact_name");
        const contactPhone=get("contact_phone");
        const contactEmail=get("contact_email");
        if(!region||!contactName||!contactPhone||!contactEmail)
          return show("editMsg_"+id,"지역·연락처 이름·전화·이메일은 입력해 주세요.",false);

        d.area=get("area");
        d.period=get("period");
        d.contact_name=contactName;
        d.contact_phone=contactPhone;
        d.contact_email=contactEmail;
        updateData={
          region,
          asset_address:get("asset_address"),
          price:numberFromText(get("price")),
          content:get("content"),
          details_json:d
        };
        if(post.transaction_side==="을")updateData.condition_b=get("condition");
        else updateData.condition_a=get("condition");
      }else{
        const content=get("content");
        if(!content)return show("editMsg_"+id,"내용을 입력해 주세요.",false);
        updateData={title:get("title"),region:get("region"),content};
      }

      const {error}=await db.from("posts").update(updateData).eq("id",id).eq("author_id",user.id);
      if(error)return show("editMsg_"+id,"수정 오류: "+error.message,false);
      show("editMsg_"+id,"수정되었습니다.");
      await loadMy();
    });
  });
  document.querySelectorAll(".deletePost").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const id=Number(btn.dataset.id);
      if(!(await requireVerified("editMsg_"+id)))return;
      if(!confirm("이 등록정보를 삭제하시겠습니까?"))return;
      const {error}=await db.from("posts").delete().eq("id",id).eq("author_id",user.id);
      if(error)return show("editMsg_"+id,"삭제 오류: "+error.message,false);
      await loadMy();
    });
  });
}

/* -------------------- 관리자 -------------------- */
function renderTradeRuleInputs(){
  const tr=rules.trade_rules||{};
  $("tradeRuleInputs").innerHTML=TRADE_TYPES.map(t=>{
    const r=tr[t]||{unit:"TOKEN",amount:0};
    return `<div class="minirow">
      <label>${esc(t)} 지급량<input class="tradeAmount" data-type="${esc(t)}" type="number" min="0" value="${Number(r.amount||0)}"></label>
      <label>단위<select class="tradeUnit" data-type="${esc(t)}">
        <option ${r.unit==="TOKEN"?"selected":""}>TOKEN</option>
        <option ${r.unit==="COIN"?"selected":""}>COIN</option>
      </select></label>
    </div>`;
  }).join("");
}
async function loadAdmin(){
  await refreshSession();
  if(!isAdminUser())return;
  await loadRules();
  renderTradeRuleInputs();
  setTextValue("ruleVirtual",rules.virtual_proposal_token);
  setTextValue("ruleVirtualJoin",rules.virtual_join_token);
  setTextValue("ruleCulture",rules.culture_register_token);
  setTextValue("ruleCultureJoin",rules.culture_join_token);
  setTextValue("ruleOpinion",rules.opinion_token);
  setTextValue("ruleConversion",rules.token_per_coin);
  setTextValue("ruleCoinValue",rules.coin_display_value);
  setTextValue("rulePropertyCoin",rules.property_coin_per_100m);

  const hist=await db.from("reward_rule_history_v4").select("*").order("changed_at",{ascending:false}).limit(100);
  $("ruleHistory").innerHTML=hist.error?"변경 이력 테이블이 아직 연결되지 않았습니다.":(hist.data||[]).map(x=>`
    <div class="item"><b>${esc(x.field_name||"기준")}</b><div>${esc(x.old_value)} → ${esc(x.new_value)}</div><div class="meta">${new Date(x.changed_at).toLocaleString("ko-KR")}</div></div>
  `).join("")||"변경 이력이 없습니다.";

  const owners=await db.from("posts").select("id,category,asset_address,public_price,owner_verified,status,created_at").eq("owner_claim",true).order("created_at",{ascending:false});
  $("ownerReviewList").innerHTML=owners.error?"검정 목록을 불러오지 못했습니다.":(owners.data||[]).map(x=>`
    <div class="item">
      <b>${esc(x.category)} · ${esc(x.asset_address||"주소 미입력")}</b>
      <span class="badge ${x.owner_verified?"":"wait"}">${x.owner_verified?"검정 완료":"검정 대기"}</span>
      <div>공시가격 ${Number(x.public_price||0).toLocaleString()}원</div>
      ${x.owner_verified?"":`<button type="button" class="primary approveOwner" data-id="${x.id}">실사·검정 승인 및 COIN 지급</button>`}
    </div>
  `).join("")||"검정 요청이 없습니다.";

  document.querySelectorAll(".approveOwner").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const {data,error}=await db.rpc("approve_owner_reward",{p_post_id:Number(btn.dataset.id)});
      show("adminMsg",error?error.message:`승인 완료. ${Number(data?.[0]?.coins_added||0)} COIN 지급`,!error);
      if(!error)loadAdmin();
    });
  });
}
function setTextValue(id,v){ const el=$(id); if(el)el.value=Number(v||0); }

$("rewardRuleForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  await refreshSession();
  if(!isAdminUser())return show("adminMsg","관리자만 변경할 수 있습니다.",false);

  const trade={};
  TRADE_TYPES.forEach(t=>{
    const amount=document.querySelector(`.tradeAmount[data-type="${CSS.escape(t)}"]`);
    const unit=document.querySelector(`.tradeUnit[data-type="${CSS.escape(t)}"]`);
    trade[t]={amount:Number(amount?.value||0),unit:unit?.value||"TOKEN"};
  });
  const payload={
    trade_rules:trade,
    virtual_proposal_token:Number($("ruleVirtual").value||0),
    virtual_join_token:Number($("ruleVirtualJoin").value||0),
    culture_register_token:Number($("ruleCulture").value||0),
    culture_join_token:Number($("ruleCultureJoin").value||0),
    opinion_token:Number($("ruleOpinion").value||0),
    token_per_coin:Number($("ruleConversion").value||100),
    coin_display_value:Number($("ruleCoinValue").value||0),
    property_coin_per_100m:Number($("rulePropertyCoin").value||1)
  };
  const {error}=await db.rpc("update_reward_rules_v4",{p_rules:payload});
  if(error)return show("adminMsg","보상 기준 저장 오류: "+error.message,false);
  show("adminMsg","지급 기준이 저장되었습니다.");
  await loadRules();
  loadAdmin();
});

/* -------------------- 시작 -------------------- */
async function init(){
  updateTradeParties();
  await refreshSession();
  await loadRules();
  renderAuthState();

  const saved=localStorage.getItem("real8_current_page");
  const startPage=pageExists(saved)?saved:"home";
  setPage(startPage,{persist:false,top:false});

  if(location.search.includes("nice=done")){
    await refreshSession();
    show("phoneMsg",identityVerified()?"NICE 본인확인이 완료되었습니다.":"본인확인 결과를 확인 중입니다. 완료되지 않았다면 다시 시도해 주세요.",identityVerified());
    history.replaceState({},document.title,location.pathname);
  }

  console.info("REAL8 build",BUILD);
}
init().catch(err=>console.error("REAL8 init error",err));

})();