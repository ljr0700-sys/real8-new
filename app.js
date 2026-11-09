console.info("REAL8 targeted navigation fix 2026-11-04");
(() => {
const cfg=window.REAL8_CONFIG;
const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const TRADE_TYPES=["건축","매매","전세","월세","렌트","바꿔살기","펜션"];
const CULTURE_TYPES=["거주문화","집수리","인테리어","정원·조경 ","건축기술","에너지절약","스마트홈","공동생활","지역생활정보"];
const parties={
  "건축":["건축주","시공·설계 참여자"],"매매":["매도 희망","매수 희망"],
  "전세":["임대 희망","임차 희망"],"월세":["임대 희망","임차 희망"],
  "렌트":["대여 희망","이용 희망"],"바꿔살기":["교환 제안자","교환 상대"],
  "펜션":["운영·임대 제안","이용·인수 희망"]
};

let user=null,profile=null;
let rules={
  trade_rules:{},virtual_proposal_token:10,virtual_join_token:5,
  culture_register_token:10,culture_join_token:5,opinion_token:3,
  token_per_coin:100,coin_display_value:0,property_coin_per_100m:1
};

function show(id,t,ok=true){
  const e=$(id);
  if(!e)return;
  e.textContent=t||"";
  e.className="msg"+(ok?"":" error");
}
function shortHash(h){
  const s=String(h||"");
  if(!s)return "";
  return s.length>20?s.slice(0,10)+"…"+s.slice(-8):s;
}
function numberFromText(v){
  const m=String(v||"").replace(/,/g,"").match(/[\d.]+/);
  return m?Number(m[0]):0;
}
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
function isAdminUser(){
  return profile?.role==="admin";
}
function canContribute(){
  return Boolean(user && profile && (user.email_confirmed_at || profile.identity_verified || isAdminUser()));
}
function providerName(u=user){
  const p=u?.app_metadata?.provider;
  return p==="kakao"?"카카오":p==="email"?"이메일":(p||"회원");
}
function scrollToIdentity(message){
  // 안내 문구만 표시하고 현재 사용자가 보고 있는 페이지는 그대로 유지합니다.
  if(message)show("signupMsg",message,false);
}
async function session(){
  const {data:{session}}=await db.auth.getSession();
  user=session?.user||null;
  profile=null;
  if(user){
    const {data,error}=await db.from("profiles").select("*").eq("user_id",user.id).maybeSingle();
    if(!error)profile=data;
    const n=user.user_metadata?.display_name||user.user_metadata?.name||profile?.display_name||"";
    if($("identityName") && !$("identityName").value) $("identityName").value=n;
  }
  return user;
}
async function loadRules(){
  const {data}=await db.from("reward_rules").select("*").eq("id",1).maybeSingle();
  if(data)rules={...rules,...data};
}
async function need(id){
  await session();
  if(!user){
    show(id,"먼저 회원가입 또는 로그인해 주세요.",false);
    return false;
  }
  if(!canContribute()){
    show(id,"가입 이메일 확인을 완료해 주세요. 입력한 내용은 그대로 유지됩니다.",false);
    return false;
  }
  return true;
}
function rewardLabel(rule){
  if(!rule)return "0 TOKEN";
  return `${Number(rule.amount||0).toLocaleString()} ${esc(rule.unit||"TOKEN")}`;
}
function setPage(id){
  document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x.dataset.page===id));
  document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id===id));
  window.scrollTo(0,0);
  if(id==="trade")$("matchList").textContent="조건을 입력한 뒤 가까운 목록 보기를 눌러 주세요.";
  if(id==="virtual")$("virtualList").textContent="조건을 입력한 뒤 근접 제안 찾기를 눌러 주세요.";
  if(id==="culture")$("cultureList").textContent="분야 또는 지역 조건을 입력한 뒤 가까운 정보 찾기를 눌러 주세요.";
  if(id==="mypage")loadMy();
  if(id==="rewards")loadRewards();
}
document.querySelectorAll("nav button[data-page]").forEach(b=>b.onclick=()=>setPage(b.dataset.page));
document.querySelectorAll(".go").forEach(b=>b.onclick=()=>{
  if(b.dataset.go==="homeAuth"){
    setPage("home");
    setTimeout(()=>$("homeAuth")?.scrollIntoView({block:"start"}),50);
  } else setPage(b.dataset.go);
});

/* 회원가입·로그인 */
$("signupForm").onsubmit=async e=>{
  e.preventDefault();
  if($("signupPassword").value!==$("signupPassword2").value)
    return show("signupMsg","비밀번호가 서로 다릅니다.",false);
  const memberId=$("signupMemberId").value.trim().toLowerCase();
  if(!/^[a-z0-9_]{4,20}$/.test(memberId))
    return show("signupMsg","회원 ID는 영문 소문자, 숫자, 밑줄로 4~20자 입력해 주세요.",false);
  const contactPhone=$("signupPhone").value.trim().replace(/[\s-]/g,"").replace(/^\+82/,"0");
  if(contactPhone && !/^010\d{8}$/.test(contactPhone))
    return show("signupMsg","휴대폰 번호는 010으로 시작하는 11자리로 입력해 주세요.",false);
  const {data,error}=await db.auth.signUp({
    email:$("signupEmail").value.trim(),
    password:$("signupPassword").value,
    options:{
      data:{display_name:$("signupName").value.trim(),member_id:memberId,...(contactPhone?{contact_phone:contactPhone}:{})},
      emailRedirectTo:location.href.split("#")[0]
    }
  });
  if(error)return show("signupMsg",error.message,false);
  show("signupMsg",data.session?
    "회원가입이 완료되었습니다.":
    "회원가입이 접수되었습니다. 가입 이메일의 확인 링크를 누른 뒤 로그인해 주세요.");
  await session();
  if(data.session && !canContribute()) scrollToIdentity("가입 이메일을 확인해 주세요.");
};

$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  const {error}=await db.auth.signInWithPassword({
    email:$("loginEmail").value.trim(),
    password:$("loginPassword").value
  });
  if(error)return show("loginMsg",error.message,false);
  await session();
  if(canContribute()){
    show("loginMsg","로그인되었습니다. 등록 및 참여 기능을 이용할 수 있습니다.");
  }else{
    show("loginMsg","로그인되었습니다. 가입 이메일을 확인해 주세요.");
  }
};

$("resetPasswordBtn").onclick=async()=>{
  const email=$("loginEmail").value.trim();
  if(!email)return show("loginMsg","이메일을 먼저 입력해 주세요.",false);
  const redirectTo=`${location.origin}${location.pathname}`;
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo});
  show("loginMsg",error?error.message:"비밀번호 재설정 이메일을 보냈습니다.",!error);
};

function openPasswordReset(){
  setPage("home");
  $("passwordResetPanel").classList.remove("hidden");
  $("homeAuth").classList.add("hidden");
}
db.auth.onAuthStateChange((event,newSession)=>{
  if(event==="PASSWORD_RECOVERY")return openPasswordReset();
  if(event==="SIGNED_IN" || event==="INITIAL_SESSION" || event==="USER_UPDATED"){
    setTimeout(async()=>{
      await session();
      if(user && !canContribute() && event!=="USER_UPDATED"){
        show("loginMsg",`${providerName()} 로그인되었습니다.`);
      }
    },0);
  }
});
if(location.hash.includes("type=recovery")||location.search.includes("type=recovery"))openPasswordReset();

$("passwordResetForm").onsubmit=async e=>{
  e.preventDefault();
  const p1=$("newPassword").value,p2=$("newPassword2").value;
  if(p1.length<8)return show("passwordResetMsg","비밀번호는 8자 이상이어야 합니다.",false);
  if(p1!==p2)return show("passwordResetMsg","두 비밀번호가 서로 다릅니다.",false);
  const {error}=await db.auth.updateUser({password:p1});
  if(error)return show("passwordResetMsg",error.message,false);
  show("passwordResetMsg","비밀번호가 변경되었습니다.");
  setTimeout(async()=>{
    await db.auth.signOut();
    user=null; profile=null;
    $("passwordResetPanel").classList.add("hidden");
    $("homeAuth").classList.remove("hidden");
    history.replaceState({},document.title,location.pathname);
  },1000);
};

$("logoutBtn").onclick=async()=>{
  await db.auth.signOut();
  user=null; profile=null;
  $("profileBox").textContent="로그아웃되었습니다.";
  $("adminArea").classList.add("hidden");
  $("myToken").textContent="0";
  $("myCoin").textContent="0";
  $("myValue").textContent="0원";
  $("myTradeCount").textContent="0";
  $("myPostCount").textContent="0";
  $("myParticipationCount").textContent="0";
  $("myActivity").textContent="";
  show("loginMsg","");
};
// 첫 카카오 로그인으로 회원 계정도 생성됩니다.
async function loginWithKakao(){
  show("loginMsg","카카오 로그인 화면으로 이동합니다.");
  const {error}=await db.auth.signInWithOAuth({
    provider:"kakao",
    options:{redirectTo:window.location.origin+window.location.pathname}
  });
  if(error)show("loginMsg","카카오 로그인 오류: "+error.message,false);
}
window.loginWithKakao=loginWithKakao;
if($("kakaoLoginBtn")) $("kakaoLoginBtn").onclick=loginWithKakao;
if($("naverLoginBtn")) $("naverLoginBtn").onclick=()=>show("loginMsg","네이버 로그인은 아직 연결 전입니다. 이메일 또는 카카오 로그인을 이용해 주세요.",false);
/* 파일 */
async function uploadFile(input,folder){
  const f=input.files?.[0];
  if(!f)return null;
  await session();
  if(!user)throw new Error("로그인이 필요합니다.");
  if(f.size>20*1024*1024)throw new Error("파일은 20MB 이하로 올려 주세요.");
  const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${user.id}/${folder}/${Date.now()}_${safe}`;
  const {error}=await db.storage.from("media").upload(path,f,{upsert:false});
  if(error)throw error;
  return db.storage.from("media").getPublicUrl(path).data.publicUrl;
}
function mediaHtml(x){
  const d=x.details_json||{},url=d.file_url||d.link_url;
  if(!/^https?:\/\//i.test(url||""))return "";
  return `<div class="media"><a href="${esc(url)}" target="_blank" rel="noopener">첨부 자료 열기</a></div>`;
}

function contactFields(prefix){
  if(!$(prefix+"ShareContact").checked)return {};
  return {share_contact:true,...Object.fromEntries(["name","phone","email"].map(key=>[
    "contact_"+key,$(prefix+"Contact"+key[0].toUpperCase()+key.slice(1)).value.trim()
  ]))};
}
function contactHtml(details,own=false){
  if(!own && details.share_contact!==true)return "";
  return [["이름",details.contact_name],["전화",details.contact_phone],["이메일",details.contact_email]]
    .filter(([,value])=>value).map(([label,value])=>`<div class="meta">연락처 ${label} ${esc(value)}</div>`).join("");
}
function opinionForm(post){
  if(post.author_id===user?.id)return "";
  return `<form class="participate postOpinion" data-id="${esc(post.id)}">
    <label>참여 의견 (등록 회원에게만 전달)<textarea name="opinion" required maxlength="2000"></textarea></label>
    <button class="secondary" type="submit">의견 등록</button>
    <div class="msg" role="status"></div>
  </form>`;
}
function bindOpinions(listId){
  $(listId).querySelectorAll(".postOpinion").forEach(form=>{
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector("button");
      const status=form.querySelector('[role="status"]');
      const input=form.elements.opinion;
      if(!input.value.trim())return;
      button.disabled=true;
      try{
        const {error}=await db.rpc("real8_submit_opinion",{p_post_id:form.dataset.id,p_content:input.value.trim()});
        status.textContent=error?error.message:"의견이 등록 회원에게 전달됐습니다.";
        if(!error)input.value="";
      }finally{button.disabled=false;}
    };
  });
}

/* 거래 */
$("tradeType").onchange=()=>{
  const [a,b]=parties[$("tradeType").value];
  $("partyA").textContent=a; $("partyB").textContent=b;
};
$("ownerClaim").onchange=()=>$("publicPriceWrap").classList.toggle("hidden",!$("ownerClaim").checked);

$("tradeForm").onsubmit=async e=>{
  e.preventDefault();
  if(!(await need("tradeMsg")))return;
  const type=$("tradeType").value;
  const side=document.querySelector('input[name="tradeSide"]:checked').value;
  const [pa,pb]=parties[type];
  const condition=$("tradeCondition").value.trim();
  const owner=$("ownerClaim").checked;
  const details={area:$("tradeArea").value.trim(),period:$("tradePeriod").value.trim(),...contactFields("trade")};
  const {data,error}=await db.from("posts").insert({
    author_id:user.id,category:type,title:null,
    region:$("tradeRegion").value.trim(),
    asset_address:$("tradeAddress").value.trim(),
    price:Number($("tradePrice").value||0),
    party_a_label:pa,party_b_label:pb,transaction_side:side,
    condition_a:side==="갑"?condition:null,
    condition_b:side==="을"?condition:null,
    content:$("tradeContent").value.trim()||condition,
    details_json:details,owner_claim:owner,
    public_price:Number($("publicPrice").value||0),
    status:"등록"
  }).select("id,record_hash").single();

  if(error)return show("tradeMsg",error.message,false);

  show("tradeMsg",
    "등록되었습니다. 실제 지급량은 마이페이지에서 확인할 수 있습니다."+
    (owner?"\n소유자 공시가격 보상은 관리자 확인 후 지급됩니다.":"")
  );
  e.target.reset();
  $("publicPriceWrap").classList.add("hidden");
  $("tradeType").dispatchEvent(new Event("change"));
  loadMatches();
};

$("matchBtn").onclick=loadMatches;
async function loadMatches(){
  await session();
  if(!user)return $("matchList").textContent="로그인 후 목록을 볼 수 있습니다.";
  let q=db.from("posts").select("*").order("created_at",{ascending:false}).limit(150);
  const type=$("matchType").value;
  const region=$("matchRegion").value.trim().toLowerCase();
  const price=Number($("matchPrice").value||0);
  const area=numberFromText($("matchArea").value);



  const cultureTypes=[...new Set(CULTURE_TYPES.flatMap(category=>[category,category.trim()]))];
  if(type==="culture")q=q.in("category",cultureTypes);
  else if(type)q=q.eq("category",type);
  else q=q.in("category",[...TRADE_TYPES,"가상건축",...cultureTypes]);

  const {data,error}=await q;
  if(error)return $("matchList").textContent=error.message;

  let rows=(data||[]).map(x=>{
    const d=x.details_json||{};
    let score=0;
    if(region){
      const xr=String(x.region||"").toLowerCase();
      if(xr===region)score+=100;
      else if(xr.includes(region)||region.includes(xr))score+=60;
      else score-=80;
    }
    if(price && (TRADE_TYPES.includes(x.category)||x.category==="가상건축")){
      const xp=x.category==="가상건축"?numberFromText(d.budget):Number(x.price||0);
      const diff=Math.abs(xp-price)/Math.max(price,1);
      score+=Math.max(0,60-diff*60);
    }
    if(area){
      const xa=numberFromText(d.area||d.scale);
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
    if(!TRADE_TYPES.includes(x.category)){
      const virtual=x.category==="가상건축";
      return `<details class="item">
        <summary>${esc(virtual?"가상건축":"거주문화 · "+x.category)} · ${esc(x.title||x.region||"상세 보기")}</summary>
        ${statusBadge(x)}
        <div class="meta">지역 ${esc(x.region||"-")}</div>
        ${virtual?`<div class="meta">목적 ${esc(d.purpose||"-")} / 규모 ${esc(d.scale||"-")} / 예산 ${esc(d.budget||"-")}</div>`:""}
        <div>${esc(x.content||"")}</div>
        ${mediaHtml(x)}
        ${contactHtml(d)}
        ${opinionForm(x)}
      </details>`;
    }
    const side=x.transaction_side||"갑";
    const cond=side==="갑"?x.condition_a:x.condition_b;
    return `<details class="item">
<summary style="cursor:pointer;color:#d4af37;font-weight:bold;">${esc(x.category)} · ${esc(x.region||"지역 미입력")} · 상세 보기</summary>
      <b>${esc(x.category)} · ${esc(side==="갑"?x.party_a_label:x.party_b_label)}</b>
      ${statusBadge(x)}
      <div>${esc(cond||x.content||"-")}</div>
      <div class="meta">지역 ${esc(x.region||"-")} / 금액 ${Number(x.price||0).toLocaleString()}원 / 면적 ${esc(d.area||"-")}</div>
      <div class="meta">주소 ${esc(x.asset_address||"-")} / 희망 기간 ${esc(d.period||"-")}</div>
      ${x.content&&x.content!==cond?`<div>${esc(x.content)}</div>`:""}
      ${contactHtml(d)}
      ${opinionForm(x)}
</details>`;  
  }).join("")||"조건에 가까운 등록정보가 없습니다.";
  bindOpinions("matchList");
}

/* 가상건축 */
$("virtualForm").onsubmit=async e=>{
  e.preventDefault();
  if(!(await need("virtualMsg")))return;
  try{
    const fileUrl=await uploadFile($("virtualFile"),"virtual");
    const details={
      sub_category:$("virtualCategory").value,
      purpose:$("virtualPurpose").value.trim(),
      scale:$("virtualScale").value.trim(),
      budget:$("virtualBudget").value.trim(),
      style:$("virtualStyle").value.trim(),
      file_url:fileUrl,link_url:$("virtualLink").value.trim(),...contactFields("virtual")
    };
    const {data,error}=await db.from("posts").insert({
      author_id:user.id,category:"가상건축",
      title:$("virtualTitle").value.trim(),
      region:$("virtualRegion").value.trim(),
      content:$("virtualContent").value.trim(),
      details_json:details,status:"등록"
    }).select("id").single();
    if(error)throw error;

    show("virtualMsg","가상건축 제안이 등록되었습니다. 실제 지급량은 마이페이지에서 확인할 수 있습니다.");
    e.target.reset(); loadVirtual();
  }catch(err){show("virtualMsg",err.message,false);}
};
$("virtualFindBtn").onclick=loadVirtual;

async function loadVirtual(){
  await session();
  if(!user)return $("virtualList").textContent="로그인 후 목록을 볼 수 있습니다.";
  const {data,error}=await db.from("posts").select("*").eq("category","가상건축").order("created_at",{ascending:false}).limit(150);
  if(error)return $("virtualList").textContent=error.message;

  const region=$("virtualFindRegion").value.trim().toLowerCase();
  const cat=$("virtualFindCategory").value;
  const budget=numberFromText($("virtualFindBudget").value);
  const scale=numberFromText($("virtualFindScale").value);



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
      if(xb){
        const diff=Math.abs(xb-budget)/Math.max(budget,1);
        score+=Math.max(0,50-diff*50);
      }
    }
    if(scale){
      const xs=numberFromText(d.scale);
      if(xs){
        const diff=Math.abs(xs-scale)/Math.max(scale,1);
        score+=Math.max(0,40-diff*40);
      }
    }
    return {...x,_score:score};
  });

  if(cat)rows=rows.filter(x=>(x.details_json||{}).sub_category===cat);
  if(region)rows=rows.filter(x=>x._score>-40);
  rows.sort((a,b)=>b._score-a._score||new Date(b.created_at)-new Date(a.created_at));
  rows=rows.slice(0,30);

  $("virtualList").innerHTML=rows.map(x=>{
    const d=x.details_json||{};
    return `<div class="item">
      <b>${esc(d.sub_category||"가상건축")} · ${esc(x.title)}</b>
      ${statusBadge(x)}
      <div class="meta">지역 ${esc(x.region||"-")} / 목적 ${esc(d.purpose||"-")} / 규모 ${esc(d.scale||"-")} / 예산 ${esc(d.budget||"-")}</div>
      <div>${esc(x.content||"")}</div>
      ${mediaHtml(x)}
      ${contactHtml(x.details_json||{})}
      ${opinionForm(x)}
    </div>`;
  }).join("")||"조건에 맞는 제안이 없습니다.";

  bindOpinions("virtualList");
}

/* 거주문화 */
$("cultureFindBtn").onclick=loadCulture;
$("cultureForm").onsubmit=async e=>{
  e.preventDefault();
  if(!(await need("cultureMsg")))return;
  try{
    const fileUrl=await uploadFile($("cultureFile"),"culture");
    const {data,error}=await db.from("posts").insert({
      author_id:user.id,category:$("cultureCategory").value,
      title:$("cultureTitle").value.trim(),
      region:$("cultureRegion").value.trim(),
      content:$("cultureContent").value.trim(),
      details_json:{file_url:fileUrl,link_url:$("cultureLink").value.trim(),...contactFields("culture")},
      status:"등록"
    }).select("id").single();
    if(error)throw error;
    show("cultureMsg","정보가 등록되었습니다. 실제 지급량은 마이페이지에서 확인할 수 있습니다.");
    e.target.reset(); loadCulture();
  }catch(err){show("cultureMsg",err.message,false);}
};

async function loadCulture(){
  await session();
  if(!user)return $("cultureList").textContent="로그인 후 목록을 볼 수 있습니다.";

  const filter=$("cultureFilter").value;
  const region=$("cultureFindRegion").value.trim().toLowerCase();



  let q=db.from("posts").select("*").in("category",CULTURE_TYPES).order("created_at",{ascending:false}).limit(150);
  if(filter)q=q.eq("category",filter);

  const {data,error}=await q;
  if(error)return $("cultureList").textContent=error.message;

  let rows=(data||[])
    .filter(x=>!user || x.author_id!==user.id)
    .map(x=>{
      let score=0;
      if(filter)score+=x.category===filter?80:-80;
      if(region){
        const xr=String(x.region||"").toLowerCase();
        if(xr===region)score+=100;
        else if(xr.includes(region)||region.includes(xr))score+=60;
        else score-=100;
      }
      return {...x,_score:score};
    });

  if(region)rows=rows.filter(x=>x._score>=0);
  rows.sort((a,b)=>b._score-a._score||new Date(b.created_at)-new Date(a.created_at));
  rows=rows.slice(0,30);

  $("cultureList").innerHTML=rows.map(x=>`
    <div class="item">
      <b>${esc(x.category)} · ${esc(x.title)}</b>
      ${statusBadge(x)}
      <div class="meta">지역 ${esc(x.region||"-")}</div>
      <div>${esc(x.content||"")}</div>
      ${mediaHtml(x)}
      ${contactHtml(x.details_json||{})}
      ${opinionForm(x)}
    </div>
  `).join("")||"조건에 가까운 다른 회원의 정보가 없습니다.";

  bindOpinions("cultureList");
}

/* 보상제도 페이지 */
function publicRulesHtml(){
  const tr=rules.trade_rules||{};
  let html=TRADE_TYPES.map(t=>`<div><b>${esc(t)} 등록</b><span>${rewardLabel(tr[t])}</span></div>`).join("");
  html+=`
    <div><b>가상건축 제안</b><span>${Number(rules.virtual_proposal_token||0)} TOKEN</span></div>
    <div><b>가상건축 참여</b><span>${Number(rules.virtual_join_token||0)} TOKEN</span></div>
    <div><b>거주문화 등록</b><span>${Number(rules.culture_register_token||0)} TOKEN</span></div>
    <div><b>거주문화 참여</b><span>${Number(rules.culture_join_token||0)} TOKEN</span></div>
    <div><b>의견·검증</b><span>${Number(rules.opinion_token||0)} TOKEN</span></div>
    <div><b>기본 토큰→코인 전환 기준</b><span>${Number(rules.token_per_coin||0)} TOKEN = 1 COIN</span></div>`;
  return html;
}
async function loadRewards(){
  await loadRules();
  $("publicRuleList").innerHTML=publicRulesHtml();
  const {data,error}=await db.rpc("real8_reward_totals");
  const summary=data?.[0];
  $("dynamicRewardSummary").textContent=error||!summary?"현재 전환율을 확인하지 못했습니다.":
    `현재 전환율 ${Number(summary.token_per_coin).toLocaleString()} TOKEN = 1 COIN. 누적 발행 TOKEN ${Number(summary.issued_tokens).toLocaleString()}, COIN ${Number(summary.issued_coins).toLocaleString()}.`;
}
function renderBalances(data){
  const t=(data||[]).reduce((s,x)=>s+Number(x.token_amount||0),0);
  const c=(data||[]).reduce((s,x)=>s+Number(x.coin_amount||0),0);
  $("myToken").textContent=t.toLocaleString();
  $("myCoin").textContent=c.toLocaleString();
  $("myValue").textContent=(c*Number(rules.coin_display_value||0)).toLocaleString()+"원";
}

/* 마이페이지 */
$("convertBtn").onclick=async()=>{
  if(!(await need("convertMsg")))return;
  const {data,error}=await db.rpc("convert_my_tokens_to_coin");
  show("convertMsg",error?error.message:
    `전환 완료: ${Number(data?.[0]?.tokens_used||0)} TOKEN → ${Number(data?.[0]?.coins_added||0)} COIN`,!error);
  if(!error)loadMy();
};

async function loadMy(){
  await session(); await loadRules();

  if(!user){
    $("profileBox").textContent="로그인 후 이용할 수 있습니다.";
    $("adminArea").classList.add("hidden");
    if($("myPosts")) $("myPosts").textContent="";
    if($("myRewards")) $("myRewards").textContent="";
    if($("myConversions")) $("myConversions").textContent="";
    if($("myActivity")) $("myActivity").textContent="";
    return;
  }

  $("profileBox").innerHTML=`
    <b>${esc(profile?.display_name||user.user_metadata?.display_name||user.email)}</b><br>
    ${esc(user.email)}<br>
    <span class="badge">${user.email_confirmed_at?"이메일 확인":"이메일 확인 필요"}</span>
    ${isAdminUser()?'<br><span class="badge">관리자</span>':""}`;

  const accountId=user.id;
  const [rr,pp,parts]=await Promise.all([
    db.from("reward_ledger").select("*").eq("user_id",accountId).order("created_at",{ascending:false}),
    db.from("posts").select("*").eq("author_id",accountId).order("created_at",{ascending:false}),
    db.from("participations").select("kind,created_at,post_id").eq("user_id",accountId).order("created_at",{ascending:false})
  ]);
  if(user?.id!==accountId)return;

  const r=rr.data||[];
  const p=pp.data||[];
  const pa=parts.data||[];

  if(rr.error) show("convertMsg","보상내역 조회 오류: "+rr.error.message,false);

  renderBalances(r);

  if($("myTradeCount"))
    $("myTradeCount").textContent=pp.error?"—":p.filter(x=>TRADE_TYPES.includes(x.category)).length.toLocaleString();

  if($("myPostCount"))
    $("myPostCount").textContent=pp.error?"—":p.length.toLocaleString();

  if($("myParticipationCount"))
    $("myParticipationCount").textContent=pa.length.toLocaleString();

  if($("myPosts")){
    const groups=new Map();
    for(const post of p){
      const category=["임대","전세","월세","렌트"].includes(post.category)?"임대":post.category||"기타";
      if(!groups.has(category))groups.set(category,[]);
      groups.get(category).push(post);
    }

    const renderPost=x=>{
      const d=x.details_json||{};
      const condition=x.transaction_side==="을"?x.condition_b:x.condition_a;

      return `
        <div class="item">
          <b>${esc(x.category)}${x.title?` · ${esc(x.title)}`:""}</b>
          ${statusBadge(x)}

          <div class="meta">
            ${x.asset_address?`주소 ${esc(x.asset_address)} / `:""}
            ${x.region?`지역 ${esc(x.region)} / `:""}
            ${Number(x.price||0)?`금액 ${Number(x.price||0).toLocaleString()}원 / `:""}
            ${new Date(x.created_at).toLocaleString("ko-KR")}
          </div>

          <div>${esc(condition||x.content||"")}</div>

          ${d.area?`<div class="meta">면적 ${esc(d.area)}</div>`:""}
          ${d.period?`<div class="meta">희망 기간 ${esc(d.period)}</div>`:""}
          ${x.category==="가상건축"?[
            ["세부 분류",d.sub_category],
            ["용도",d.purpose],
            ["규모",d.scale],
            ["예산",d.budget],
            ["스타일",d.style]
          ].filter(([,value])=>value).map(([label,value])=>`<div class="meta"><b>${label}</b> ${esc(value)}</div>`).join(""):""}
          ${contactHtml(d,true)}
          ${mediaHtml(x)}
          ${x.record_hash?`<div class="hash">해시 ${esc(x.record_hash)}</div>`:""}

          <details class="receivedOpinions" data-id="${esc(x.id)}">
            <summary>받은 의견 보기</summary>
            <div class="list" role="status"></div>
          </details>
          <button class="secondary editMyPost" data-id="${x.id}">
            수정
          </button>

          <div></div><div id="editMsg_${x.id}" class="msg" role="status"></div>
        </div>
      `;
    };
    const categories=["건축","매매","임대","가상건축",...groups.keys()];
    const sections=[...new Set(categories)].filter(category=>groups.has(category)).map(category=>{
      const posts=groups.get(category);
      return `<section class="list">
        <h4>${esc(category)} · ${posts.length}건</h4>
        ${posts.map(renderPost).join("")}
      </section>`;
    });
    $("myPosts").innerHTML=pp.error
      ? '<div role="alert">등록자료를 불러오지 못했습니다. <button id="retryMyPosts" class="secondary" type="button">다시 불러오기</button></div>'
      : sections.join("")||"아직 등록한 정보가 없습니다.";
    if(pp.error)$("retryMyPosts").onclick=loadMy;
  }

  if($("myRewards")){
    const rewards=r.filter(x=>x.action!=="token_convert");

    $("myRewards").innerHTML=rewards.map(x=>`
      <div class="item">
        <b>보상 ${esc(x.action||"활동")}</b>
        <div>
          TOKEN ${Number(x.token_amount||0).toLocaleString()}
          / COIN ${Number(x.coin_amount||0).toLocaleString()}
        </div>
        <div class="meta">${new Date(x.created_at).toLocaleString("ko-KR")}</div>
        ${x.issue_hash?`<div class="hash">해시 ${esc(x.issue_hash)}</div>`:""}
      </div>
    `).join("")||"아직 보상 기록이 없습니다.";
  }

  if($("myConversions")){
    const conversions=r.filter(x=>x.action==="token_convert");

    $("myConversions").innerHTML=conversions.map(x=>`
      <div class="item">
        <b>전환</b>
        <div>
          ${Math.abs(Number(x.token_amount||0)).toLocaleString()} TOKEN
          → ${Number(x.coin_amount||0).toLocaleString()} COIN
        </div>
        <div class="meta">${new Date(x.created_at).toLocaleString("ko-KR")}</div>
      </div>
    `).join("")||"아직 전환 기록이 없습니다.";
  }

  if($("myActivity")){
    $("myActivity").innerHTML=pa.map(x=>`
      <div class="item">
        <b>참여 ${esc(x.kind)}</b>
        <div class="meta">${new Date(x.created_at).toLocaleString("ko-KR")}</div>
      </div>
    `).join("")||"아직 참여 기록이 없습니다.";
  }

  $("myPosts").querySelectorAll(".receivedOpinions").forEach(panel=>{
    panel.ontoggle=async()=>{
      if(!panel.open||user?.id!==accountId)return;
      const output=panel.querySelector('[role="status"]');
      output.textContent="불러오는 중입니다.";
      const {data,error}=await db.rpc("real8_read_opinions",{p_post_ids:[panel.dataset.id]});
      if(user?.id!==accountId)return;
      output.innerHTML=error?"의견을 불러오지 못했습니다. 다시 열어 주세요.":
        (data||[]).map(row=>`<div class="meta">${esc(row.content)}</div>`).join("")||"받은 의견이 없습니다.";
    };
  });

  document.querySelectorAll(".editMyPost").forEach(b=>{
    b.onclick=async()=>{
      const id=b.dataset.id;
      const post=p.find(x=>String(x.id)===String(id));
      if(!post)return;

      const panel=b.nextElementSibling;
      const d=post.details_json||{};
      const fields=[
        ["title","제목",post.title],["region","지역",post.region],
        ["content","상세 설명",post.content],["contact_name","공개 연락처 이름",d.contact_name],
        ["contact_phone","공개 연락처 전화",d.contact_phone],["contact_email","공개 연락처 이메일",d.contact_email]
      ];
      if(TRADE_TYPES.includes(post.category)){
        const condition=post.transaction_side==="을"?"condition_b":"condition_a";
        fields.push(["asset_address","주소",post.asset_address],["price","희망 금액",post.price],
          [condition,"희망 조건",post[condition]],["area","면적",d.area],["period","기간",d.period]);
      }
      if(post.category==="가상건축")fields.push(["sub_category","세부 분류",d.sub_category],
        ["purpose","용도",d.purpose],["scale","규모",d.scale],["budget","예산",d.budget],["style","스타일",d.style]);
      const hasAttachments=!TRADE_TYPES.includes(post.category);
      if(hasAttachments)fields.push(["link_url","자료 링크",d.link_url]);
      panel.innerHTML=`<form>
        ${fields.map(([key,label,value])=>key==="content"
          ? `<label>${label}<textarea name="${key}">${esc(value)}</textarea></label>`
          : `<label>${label}<input name="${key}" value="${esc(value)}"></label>`).join("")}
        ${hasAttachments?`<label>첨부 교체<input type="file" name="attachment" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"></label>`:""}
        <p class="note">연락처를 입력해 저장하면 로그인 회원에게 공개됩니다. 공개를 중단하려면 비워 주세요.</p>
        <button class="primary" type="submit">저장</button>
        <button class="secondary" type="button">취소</button>
      </form>`;
      const form=panel.querySelector("form");
      form.querySelector('button[type="button"]').onclick=()=>{panel.innerHTML="";};
      form.onsubmit=async event=>{
        event.preventDefault();
        if(user?.id!==accountId)return;
        const details={...d};
        const patch={details_json:details};
        for(const [key] of fields){
          const value=form.elements.namedItem(key).value.trim();
          if(key==="price"){
            const price=Number(value.replace(/,/g,""));
            if(!Number.isFinite(price)||price<0)return show("editMsg_"+id,"금액을 확인해 주세요.",false);
            patch.price=price;
          }else if(["title","region","content","asset_address","condition_a","condition_b"].includes(key)){
            patch[key]=value;
          }else details[key]=value;
        }
        if(form.elements.attachment?.files.length){
          try{
            details.file_url=await uploadFile(form.elements.attachment,post.category==="가상건축"?"virtual":"culture");
          }catch(error){
            return show("editMsg_"+id,error.message,false);
          }
          if(user?.id!==accountId)return;
        }
        details.share_contact=["contact_name","contact_phone","contact_email"].some(key=>Boolean(details[key]));
        const {data,error}=await db.from("posts").update(patch)
          .eq("id",id).eq("author_id",accountId).select("id").maybeSingle();
        if(error||!data)return show("editMsg_"+id,error?.message||"수정 권한을 확인해 주세요.",false);
        loadMy();
      };
    };
  });

  const admin=isAdminUser();
  $("adminArea").classList.toggle("hidden",!admin);
  if(admin) loadAdmin();
}

/* 관리자 */
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
  await session(); await loadRules();
  if(!isAdminUser())return;

  renderTradeRuleInputs();
  $("ruleVirtual").value=rules.virtual_proposal_token;
  $("ruleVirtualJoin").value=rules.virtual_join_token;
  $("ruleCulture").value=rules.culture_register_token;
  $("ruleCultureJoin").value=rules.culture_join_token;
  $("ruleOpinion").value=rules.opinion_token;
  $("ruleConversion").value=rules.token_per_coin;
  $("ruleCoinValue").value=rules.coin_display_value;
  if($("rulePropertyCoin")) $("rulePropertyCoin").value=rules.property_coin_per_100m;
  const ruleLabels={
    trade_rules:"거래 유형별 등록 보상",virtual_proposal_token:"가상건축 등록 TOKEN",
    virtual_join_token:"가상건축 참여 TOKEN",culture_register_token:"거주문화 등록 TOKEN",
    culture_join_token:"거주문화 참여 TOKEN",opinion_token:"거래 의견 TOKEN",
    token_per_coin:"기본 전환율",coin_display_value:"COIN 표시값",
    property_coin_per_100m:"공시가격 1억 원당 COIN"
  };
  const formatRuleChanges=(entry)=>{
    if(entry.field_name!=="trade_rules")
      return [`${entry.old_value ?? "미설정"} → ${entry.new_value ?? "미설정"}`];
    const decode=value=>{
      for(let pass=0;typeof value==="string" && pass<2;pass++)value=JSON.parse(value);
      return value||{};
    };
    try{
      const before=decode(entry.old_value), after=decode(entry.new_value);
      const display=rule=>rule?`${rule.amount} ${rule.unit}`:"미설정";
      return [...new Set([...Object.keys(before),...Object.keys(after)])]
        .filter(key=>display(before[key])!==display(after[key]))
        .map(key=>`${key} ${display(before[key])} → ${display(after[key])}`);
    }catch{return ["이전 형식의 변경 기록입니다."];}
  };
  const [hist,owners]=await Promise.all([
    db.from("reward_rule_history_v4").select("*").order("changed_at",{ascending:false}).limit(500),
    db.from("posts").select("id,author_id,category,asset_address,public_price,owner_verified,status,created_at").eq("owner_claim",true).order("created_at",{ascending:false})
  ]);

 if($("ruleHistory") && hist.error) $("ruleHistory").textContent="변경 이력을 불러오지 못했습니다.";
 else if($("ruleHistory")) $("ruleHistory").innerHTML=(hist.data||[]).map(x=>({x,changes:formatRuleChanges(x)})).filter(({x,changes})=>x.old_value!==x.new_value && changes.length).map(({x,changes})=>`
    <div class="item"><b>${esc(ruleLabels[x.field_name]||x.field_name)}</b>
    ${changes.map(change=>`<div>${esc(change)}</div>`).join("")}
    <div class="meta">${new Date(x.changed_at).toLocaleString("ko-KR")}</div></div>
  `).join("")||"변경 이력이 없습니다.";

if($("ownerReviewList")) $("ownerReviewList").innerHTML=(owners.data||[]).map(x=>`
    <div class="item">
      <b>${esc(x.category)} · ${esc(x.asset_address||"주소 미입력")}</b>
      <span class="badge ${x.owner_verified?"":"wait"}">${x.owner_verified?"검정 완료":"검정 대기"}</span>
      <div>공시가격 ${Number(x.public_price||0).toLocaleString()}원</div>
      ${x.owner_verified?"":`<button class="primary approveOwner" data-id="${x.id}">실사·검정 승인 및 COIN 지급</button>`}
    </div>
  `).join("")||"검정 요청이 없습니다.";

  document.querySelectorAll(".approveOwner").forEach(b=>b.onclick=async()=>{
    const {data,error}=await db.rpc("approve_owner_reward",{p_post_id:b.dataset.id});
    show("adminMsg",error?error.message:`승인 완료. ${Number(data?.[0]?.coins_added||0)} COIN 지급`,!error);
    if(!error)loadAdmin();
  });
}

$("rewardRuleForm").onsubmit=async e=>{
  e.preventDefault();
  await session();
  if(!isAdminUser())return show("adminMsg","관리자만 변경할 수 있습니다.",false);

  const trade={};
  TRADE_TYPES.forEach(t=>{
    trade[t]={
      amount:Number(document.querySelector(`.tradeAmount[data-type="${CSS.escape(t)}"]`).value||0),
      unit:document.querySelector(`.tradeUnit[data-type="${CSS.escape(t)}"]`).value
    };
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
property_coin_per_100m:Number($("rulePropertyCoin")?.value||rules.property_coin_per_100m||1)
  };
  const {error}=await db.rpc("update_reward_rules_v4",{p_rules:payload});
  if(error){
    show("adminMsg",error.message,false);
    return;
  }

  show("adminMsg","보상 기준이 저장되었습니다.");
  await loadRules();
  loadAdmin();
};

/* 시작 */
$("tradeType").dispatchEvent(new Event("change"));
session();
loadRules();
})();
