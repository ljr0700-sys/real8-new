(() => {
const cfg=window.REAL8_CONFIG;
const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const TRADE_TYPES=["건축","매매","전세","월세","렌트","바꿔살기","펜션"];
const CULTURE_TYPES=["거주문화","집수리","인테리어","정원·조경","건축기술","에너지절약","스마트홈","공동생활","지역생활정보"];
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
  return profile?.role==="admin" ||
    (user?.email||"").toLowerCase()==="ljr0700@naver.com";
}

async function session(){
  const {data:{session}}=await db.auth.getSession();
  user=session?.user||null;
  profile=null;
  if(user){
    const {data,error}=await db.from("profiles").select("*").eq("user_id",user.id).maybeSingle();
    if(!error)profile=data;
  }
  return user;
}
async function loadRules(){
  const {data}=await db.from("reward_rules_v4").select("*").eq("id",1).maybeSingle();
  if(data)rules={...rules,...data};
}
async function need(id){
  await session();
  if(!user){
    show(id,"먼저 로그인해 주세요.",false);
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
  window.scrollTo({top:0,behavior:"smooth"});
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
    setTimeout(()=>$("homeAuth")?.scrollIntoView({behavior:"smooth"}),50);
  } else setPage(b.dataset.go);
});

/* 회원가입·로그인 */
$("signupForm").onsubmit=async e=>{
  e.preventDefault();
  if($("signupPassword").value!==$("signupPassword2").value)
    return show("signupMsg","비밀번호가 서로 다릅니다.",false);
  const {data,error}=await db.auth.signUp({
    email:$("signupEmail").value.trim(),
    password:$("signupPassword").value,
    options:{
      data:{display_name:$("signupName").value.trim()},
      emailRedirectTo:location.href.split("#")[0]
    }
  });
  if(error)return show("signupMsg",error.message,false);
  show("signupMsg",data.session?
    "회원가입과 로그인이 완료되었습니다.":
    "회원가입이 접수되었습니다. 이메일 확인 링크를 누른 뒤 로그인해 주세요.");
  await session();
};

$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  const {error}=await db.auth.signInWithPassword({
    email:$("loginEmail").value.trim(),
    password:$("loginPassword").value
  });
  if(error)return show("loginMsg",error.message,false);
  await session();
  show("loginMsg","로그인되었습니다.");
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
db.auth.onAuthStateChange(event=>{
  if(event==="PASSWORD_RECOVERY")openPasswordReset();
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
  if(!url)return "";
  return `<div class="media"><a href="${esc(url)}" target="_blank" rel="noopener">첨부 자료 열기</a></div>`;
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
  const details={area:$("tradeArea").value.trim(),period:$("tradePeriod").value.trim()};
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

  const {data:r,error:re}=await db.rpc("award_trade_registration",{p_post_id:data.id});
  if(re)return show("tradeMsg",`거래는 등록됐지만 보상 처리 오류: ${re.message}`,false);

  show("tradeMsg",
    `등록되었습니다. 지급: ${Number(r?.[0]?.token_amount||0)} TOKEN / ${Number(r?.[0]?.coin_amount||0)} COIN`+
    (owner?"\n소유자 공시가격 보상은 관리자 확인 후 지급됩니다.":"")
  );
  e.target.reset();
  $("publicPriceWrap").classList.add("hidden");
  $("tradeType").dispatchEvent(new Event("change"));
  loadMatches();
};

$("matchBtn").onclick=loadMatches;
async function loadMatches(){
  let q=db.from("posts").select("*").in("category",TRADE_TYPES).order("created_at",{ascending:false}).limit(150);
  const type=$("matchType").value;
  const region=$("matchRegion").value.trim().toLowerCase();
  const price=Number($("matchPrice").value||0);
  const area=numberFromText($("matchArea").value);

  if(!type && !region && !price && !area){
    $("matchList").textContent="거래종류·지역·희망금액·면적 중 한 가지 이상 입력해 주세요.";
    return;
  }

  if(type)q=q.eq("category",type);

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
    const side=x.transaction_side||"갑";
    const cond=side==="갑"?x.condition_a:x.condition_b;
    return `<details class="item">
<summary style="cursor:pointer;color:#d4af37;font-weight:bold;">상세 내용 보기 ▼</summary>
      <b>${esc(x.category)} · ${esc(side==="갑"?x.party_a_label:x.party_b_label)}</b>
      ${statusBadge(x)}
      <div>${esc(cond||x.content||"-")}</div>
      <div class="meta">지역 ${esc(x.region||"-")} / 금액 ${Number(x.price||0).toLocaleString()}원 / 면적 ${esc(d.area||"-")}</div>
 </div>
</details>  
  }).join("")||"조건에 가까운 등록정보가 없습니다.";
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
      file_url:fileUrl,link_url:$("virtualLink").value.trim()
    };
    const {data,error}=await db.from("posts").insert({
      author_id:user.id,category:"가상건축",
      title:$("virtualTitle").value.trim(),
      region:$("virtualRegion").value.trim(),
      content:$("virtualContent").value.trim(),
      details_json:details,status:"등록"
    }).select("id").single();
    if(error)throw error;

    const {error:re}=await db.rpc("award_simple_activity",{p_action:"virtual_register",p_reference_id:data.id});
    if(re)throw re;
    show("virtualMsg","가상건축 제안이 등록되고 제안 TOKEN이 지급되었습니다.");
    e.target.reset(); loadVirtual();
  }catch(err){show("virtualMsg",err.message,false);}
};
$("virtualFindBtn").onclick=loadVirtual;

async function loadVirtual(){
  const {data,error}=await db.from("posts").select("*").eq("category","가상건축").order("created_at",{ascending:false}).limit(150);
  if(error)return $("virtualList").textContent=error.message;

  const region=$("virtualFindRegion").value.trim().toLowerCase();
  const cat=$("virtualFindCategory").value;
  const budget=numberFromText($("virtualFindBudget").value);
  const scale=numberFromText($("virtualFindScale").value);

  if(!region && !cat && !budget && !scale){
    $("virtualList").textContent="지역·분류·예산·규모 중 한 가지 이상 입력해 주세요.";
    return;
  }

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
      <div class="participate">
        <textarea id="vp_${x.id}" placeholder="구체적인 의견·수정안·참여 내용을 적어 주세요."></textarea>
        <button class="secondary joinV" data-id="${x.id}">참여 등록 + TOKEN</button>
        <div id="vpm_${x.id}" class="msg"></div>
      </div>
    </div>`;
  }).join("")||"조건에 맞는 제안이 없습니다.";

  document.querySelectorAll(".joinV").forEach(b=>b.onclick=async()=>{
    if(!(await need("vpm_"+b.dataset.id)))return;
    const content=$("vp_"+b.dataset.id).value.trim();
    if(!content)return show("vpm_"+b.dataset.id,"참여 내용을 입력해 주세요.",false);
    const {error}=await db.from("participations").insert({post_id:b.dataset.id,user_id:user.id,kind:"virtual",content});
    if(error)return show("vpm_"+b.dataset.id,error.code==="23505"?"이미 참여 보상을 받은 제안입니다.":error.message,false);
    const {error:re}=await db.rpc("award_simple_activity",{p_action:"virtual_join",p_reference_id:b.dataset.id});
    show("vpm_"+b.dataset.id,re?re.message:"참여가 저장되고 TOKEN이 지급되었습니다.",!re); if(!re)loadMy();
  });
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
      details_json:{file_url:fileUrl,link_url:$("cultureLink").value.trim()},
      status:"등록"
    }).select("id").single();
    if(error)throw error;
    const {error:re}=await db.rpc("award_simple_activity",{p_action:"culture_register",p_reference_id:data.id});
    if(re)throw re;
    show("cultureMsg","정보가 등록되고 TOKEN이 지급되었습니다.");
    e.target.reset(); loadCulture();
  }catch(err){show("cultureMsg",err.message,false);}
};

async function loadCulture(){
  await session();

  const filter=$("cultureFilter").value;
  const region=$("cultureFindRegion").value.trim().toLowerCase();

  if(!filter && !region){
    $("cultureList").textContent="분야 또는 지역을 한 가지 이상 입력해 주세요.";
    return;
  }

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
      <div class="participate">
        <textarea id="cp_${x.id}" placeholder="도움되는 의견·추가 정보·경험을 적어 주세요."></textarea>
        <button class="secondary joinC" data-id="${x.id}">의견·정보 보태기 + TOKEN</button>
        <div id="cpm_${x.id}" class="msg"></div>
      </div>
    </div>
  `).join("")||"조건에 가까운 다른 회원의 정보가 없습니다.";

  document.querySelectorAll(".joinC").forEach(b=>b.onclick=async()=>{
    if(!(await need("cpm_"+b.dataset.id)))return;
    const content=$("cp_"+b.dataset.id).value.trim();
    if(!content)return show("cpm_"+b.dataset.id,"내용을 입력해 주세요.",false);
    const {error}=await db.from("participations").insert({post_id:b.dataset.id,user_id:user.id,kind:"culture",content});
    if(error)return show("cpm_"+b.dataset.id,error.code==="23505"?"이미 참여 보상을 받은 정보입니다.":error.message,false);
    const {error:re}=await db.rpc("award_simple_activity",{p_action:"culture_join",p_reference_id:b.dataset.id});
    show("cpm_"+b.dataset.id,re?re.message:"의견이 저장되고 TOKEN이 지급되었습니다.",!re);
    if(!re)loadMy();
  });
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
    <div><b>토큰→코인</b><span>${Number(rules.token_per_coin||0)} TOKEN = 1 COIN</span></div>`;
  return html;
}
async function loadRewards(){
  await loadRules();
  $("publicRuleList").innerHTML=publicRulesHtml();
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
    return;
  }

  $("profileBox").innerHTML=`
    <b>${esc(profile?.display_name||user.user_metadata?.display_name||user.email)}</b><br>
    ${esc(user.email)}<br>
    <span class="badge">${user.email_confirmed_at?"이메일 확인":"이메일 확인 필요"}</span>
    ${isAdminUser()?'<br><span class="badge">관리자</span>':""}`;

  const [rr,pp,parts]=await Promise.all([
    db.from("reward_ledger").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
    db.from("posts").select("*").eq("author_id",user.id).order("created_at",{ascending:false}),
    db.from("participations").select("kind,created_at,post_id").eq("user_id",user.id).order("created_at",{ascending:false})
  ]);

  const r=rr.data||[], p=pp.data||[], pa=parts.data||[];
  if(rr.error)show("convertMsg","보상내역 조회 오류: "+rr.error.message,false);

  renderBalances(r);
  $("myTradeCount").textContent=p.filter(x=>TRADE_TYPES.includes(x.category)).length.toLocaleString();
  $("myPostCount").textContent=p.length.toLocaleString();
  $("myParticipationCount").textContent=pa.length.toLocaleString();

  const acts=[
    ...p.map(x=>({
      t:`등록 ${x.category}${x.transaction_side?` · ${x.transaction_side}`:""}${x.title?` · ${x.title}`:""} · ${statusLabel(x)}`,
      d:x.created_at,h:x.record_hash
    })),
    ...pa.map(x=>({t:`참여 ${x.kind}`,d:x.created_at,h:""})),
    ...r.map(x=>({
      t:`보상 ${x.action||"활동"} / TOKEN ${Number(x.token_amount||0)} / COIN ${Number(x.coin_amount||0)}`,
      d:x.created_at,h:x.issue_hash
    }))
  ].sort((a,b)=>new Date(b.d)-new Date(a.d));

  $("myActivity").innerHTML=acts.map(x=>`
    <div class="item">
      <b>${esc(x.t)}</b>
      <div class="meta">${new Date(x.d).toLocaleString("ko-KR")}</div>
      ${x.h?`<div class="hash">해시 ${esc(x.h)}</div>`:""}
    </div>
  `).join("")||"아직 활동 내역이 없습니다.";

  const admin=isAdminUser();
  $("adminArea").classList.toggle("hidden",!admin);
  if(admin)loadAdmin();
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
  $("rulePropertyCoin").value=rules.property_coin_per_100m;

  const [hist,owners]=await Promise.all([
    db.from("reward_rule_history_v4").select("*").order("changed_at",{ascending:false}).limit(100),
    db.from("posts").select("id,author_id,category,asset_address,public_price,owner_verified,status,created_at").eq("owner_claim",true).order("created_at",{ascending:false})
  ]);

  $("ruleHistory").innerHTML=(hist.data||[]).map(x=>`
    <div class="item"><b>${esc(x.field_name)}</b>
    <div>${esc(x.old_value)} → ${esc(x.new_value)}</div>
    <div class="meta">${new Date(x.changed_at).toLocaleString("ko-KR")}</div></div>
  `).join("")||"변경 이력이 없습니다.";

  $("ownerReviewList").innerHTML=(owners.data||[]).map(x=>`
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
    property_coin_per_100m:Number($("rulePropertyCoin").value||1)
  };
  const {error}=await db.rpc("update_reward_rules_v4",{p_rules:payload});
  if(error){
    show("adminMsg",error.message,false);
    return;
  }

  const {error:syncError}=await db.from("reward_rules").upsert({id:1,...payload},{onConflict:"id"});
  show("adminMsg",
    syncError ? "표시 기준은 저장됐지만 실제 보상기준 연동 오류: "+syncError.message
              : "지급 기준이 저장되고 실제 회원 보상에도 연동되었습니다.",
    !syncError
  );
  await loadRules();
  loadAdmin();
};

/* 시작 */
$("tradeType").dispatchEvent(new Event("change"));
session();
loadRules();
// 휴대폰 문자 인증
const phonePanel = [...document.querySelectorAll(".panel")]
  .find(p => p.textContent.includes("휴대폰 문자 로그인"));

if (phonePanel) {
  const inputs = phonePanel.querySelectorAll("input");
  const phoneInput = inputs[0];
  const otpInput = inputs[1];

  const buttons = [...phonePanel.querySelectorAll("button")];
  const sendBtn = buttons.find(b => b.textContent.includes("인증번호 받기"));
  const verifyBtn = buttons.find(b => b.textContent.includes("인증번호 확인"));

  function real8Phone(v) {
    let n = String(v || "").replace(/\D/g, "");
    if (n.startsWith("0")) n = n.slice(1);
    return "+82" + n;
  }

  if (sendBtn) {
    sendBtn.onclick = async () => {
      const phone = real8Phone(phoneInput.value);
      if (phone.length < 12) {
        alert("휴대폰 번호를 확인해 주세요.");
        return;
      }

      const { error } = await db.auth.signInWithOtp({ phone });

      if (error) {
        alert("인증번호 발송 실패: " + error.message);
      } else {
        alert("인증번호를 문자로 보냈습니다.");
      }
    };
  }

  if (verifyBtn) {
    verifyBtn.onclick = async () => {
      const phone = real8Phone(phoneInput.value);
      const token = otpInput.value.trim();

      const { error } = await db.auth.verifyOtp({
        phone,
        token,
        type: "sms"
      });

      if (error) {
        alert("인증번호가 맞지 않습니다: " + error.message);
      } else {
        alert("휴대폰 인증이 완료되었습니다.");
        await session();
      }
    };
  }
}
})();
