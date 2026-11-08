begin;

-- Verified email is the temporary requirement for ordinary member activity.
-- Ownership, administrator roles and existing identity flags remain separate.
create or replace function public.real8_verified_or_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=auth.uid()
      and (p.identity_verified or p.role='admin' or u.email_confirmed_at is not null)
  );
$$;

create or replace function public.real8_reward_totals()
returns table(issued_tokens numeric, issued_coins numeric, token_factor numeric, coin_factor numeric, token_per_coin numeric)
language sql stable security definer set search_path = ''
as $$
  with totals as (
    select coalesce(sum(greatest(l.token_amount,0)),0) as tokens,
           coalesce(sum(greatest(l.coin_amount,0)),0) as coins
    from public.reward_ledger l
  ), factors as (
    select *, greatest(0.10, 1/(1+tokens/10000)) as tf,
              greatest(0.10, 1/(1+coins/1000)) as cf
    from totals
  )
  select tokens, coins, tf, cf, ceil(greatest(coalesce(r.token_per_coin,100),1)/least(tf,cf))
  from factors left join public.reward_rules r on r.id=1;
$$;
revoke all on function public.real8_reward_totals() from public;
grant execute on function public.real8_reward_totals() to anon, authenticated;

create or replace function public.real8_scale_issuance()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare f record;
begin
  if new.action='token_convert' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(822981473);
  select * into f from public.real8_reward_totals();
  if new.token_amount>0 then new.token_amount:=round(new.token_amount*f.token_factor,6); end if;
  if new.coin_amount>0 then new.coin_amount:=round(new.coin_amount*f.coin_factor,6); end if;
  return new;
end;
$$;
revoke all on function public.real8_scale_issuance() from public, anon, authenticated;
-- Bring forward rewards issued by the old registration flow at their original amounts.
insert into public.reward_ledger(user_id,action,reference_id,token_amount,coin_amount,created_at)
select r.user_id,r.action,r.reference_id::text,r.token_amount,r.coin_amount,r.created_at
from public.rewards r
join public.posts p on p.id=r.reference_id and p.author_id=r.user_id
where r.action in ('trade_register','virtual_register')
on conflict(user_id,action,reference_id) do nothing;

create trigger real8_scale_issuance before insert on public.reward_ledger
for each row execute function public.real8_scale_issuance();

create or replace function public.convert_my_tokens_to_coin()
returns table(tokens_used numeric,coins_added numeric)
language plpgsql security definer set search_path = ''
as $$
declare balance numeric; rate numeric; coins numeric; used numeric;
begin
  if not public.real8_verified_or_admin() then raise exception '가입 이메일을 확인해 주세요'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  perform pg_catalog.pg_advisory_xact_lock(822981473);
  select coalesce(sum(token_amount),0) into balance from public.reward_ledger where user_id=auth.uid();
  select t.token_per_coin into rate from public.real8_reward_totals() t;
  coins:=greatest(floor(balance/rate),0);
  used:=coins*rate;
  if coins>0 then
    insert into public.reward_ledger(user_id,action,reference_id,token_amount,coin_amount)
    values(auth.uid(),'token_convert',gen_random_uuid()::text,-used,coins);
  end if;
  return query select used,coins;
end;
$$;

alter table public.participations add column if not exists is_public boolean not null default false;

create or replace function public.real8_submit_opinion(p_post_id uuid,p_content text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  member_id uuid:=auth.uid();
  author uuid;
  category_name text;
  opinion_kind text;
  amount numeric;
begin
  if not public.real8_verified_or_admin() then raise exception '가입 이메일을 확인해 주세요'; end if;
  if p_content is null or char_length(btrim(p_content)) not between 1 and 2000 then
    raise exception '의견을 1~2000자로 입력해 주세요';
  end if;
  select p.author_id,p.category into author,category_name from public.posts p where p.id=p_post_id for update;
  if author is null then raise exception '등록정보를 찾을 수 없습니다'; end if;
  if author=member_id then raise exception '본인 등록글에는 참여 보상이 지급되지 않습니다'; end if;
  opinion_kind:=case
    when category_name='가상건축' then 'virtual'
    when category_name in ('건축','매매','임대','전세','월세','렌트','바꿔살기','펜션') then 'trade'
    else 'culture' end;
  select case opinion_kind when 'virtual' then virtual_join_token when 'culture' then culture_join_token else opinion_token end
    into amount from public.reward_rules where id=1;
  if amount is null or amount<0 then raise exception '참여 보상 기준을 확인해 주세요'; end if;

  insert into public.participations(post_id,user_id,kind,content,is_public)
    values(p_post_id,member_id,opinion_kind,btrim(p_content),true)
    on conflict(post_id,user_id,kind) do update set content=excluded.content,is_public=true;

  insert into public.reward_ledger(user_id,action,reference_id,token_amount)
    values(member_id,case when opinion_kind='trade' then 'trade_opinion' else opinion_kind||'_join' end,p_post_id::text,amount)
    on conflict(user_id,action,reference_id) do nothing;

  -- The author receives a coin bonus once per participating member.
  insert into public.reward_ledger(user_id,action,reference_id,coin_amount)
    values(author,'participation_bonus',p_post_id::text||':'||member_id::text,1)
    on conflict(user_id,action,reference_id) do nothing;
end;
$$;
revoke all on function public.real8_submit_opinion(uuid,text) from public,anon;
grant execute on function public.real8_submit_opinion(uuid,text) to authenticated;

create or replace function public.real8_read_opinions(p_post_ids uuid[])
returns table(post_id uuid,content text)
language sql stable security definer set search_path = ''
as $$
  select items.post_id,items.content
  from unnest(p_post_ids[1:30]) as wanted(id)
  cross join lateral (
    select p.post_id,p.content from public.participations p
    where p.post_id=wanted.id and p.is_public order by p.created_at desc limit 20
  ) items
  where auth.uid() is not null;
$$;
revoke all on function public.real8_read_opinions(uuid[]) from public,anon;
grant execute on function public.real8_read_opinions(uuid[]) to authenticated;

-- Award in the same transaction as registration. Legacy RPCs use the same keys.
create or replace function public.real8_award_new_post()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare settings public.reward_rules; rule jsonb; amount numeric; action_name text; unit text:='TOKEN';
begin
  select * into settings from public.reward_rules where id=1;
  if settings.id is null then raise exception '등록 보상 기준이 없습니다'; end if;
  if new.category='가상건축' then
    amount:=settings.virtual_proposal_token; action_name:='virtual_register';
  elsif new.category in ('건축','매매','임대','전세','월세','렌트','바꿔살기','펜션') then
    rule:=settings.trade_rules->new.category;
    amount:=coalesce((rule->>'amount')::numeric,0);
    unit:=coalesce(rule->>'unit','TOKEN'); action_name:='trade_register';
  else
    amount:=settings.culture_register_token; action_name:='culture_register';
  end if;
  insert into public.reward_ledger(user_id,action,reference_id,token_amount,coin_amount)
    values(new.author_id,action_name,new.id::text,case when unit='TOKEN' then greatest(amount,0) else 0 end,
      case when unit='COIN' then greatest(amount,0) else 0 end)
    on conflict(user_id,action,reference_id) do nothing;
  return new;
end;
$$;
revoke all on function public.real8_award_new_post() from public,anon,authenticated;
create trigger real8_award_new_post after insert on public.posts
for each row execute function public.real8_award_new_post();

-- Preserve registration history, but prevent legacy reward RPCs from minting
-- extra categories after the server-side registration and opinion writes.
revoke execute on function public.award_trade_registration(uuid), public.award_trade_registration(bigint),
  public.award_simple_activity(text,uuid), public.award_simple_activity(text,bigint)
from public,anon,authenticated;

create or replace function public.approve_owner_reward(p_post_id uuid)
returns table(coins_added numeric)
language plpgsql security definer set search_path = ''
as $$
declare post public.posts; rate numeric; credited numeric;
begin
  if not public.real8_is_admin() then raise exception '관리자만 승인할 수 있습니다'; end if;
  select * into post from public.posts where id=p_post_id for update;
  if post.id is null or not coalesce(post.owner_claim,false) then
    raise exception '소유자 확인 요청을 찾을 수 없습니다';
  end if;
  if post.owner_verified then return query select 0::numeric; return; end if;
  select property_coin_per_100m into rate from public.reward_rules where id=1;
  if rate is null or rate<0 then raise exception '소유자 보상 기준을 확인해 주세요'; end if;
  insert into public.reward_ledger(user_id,action,reference_id,coin_amount)
  values(post.author_id,'owner_verified',p_post_id::text,round(greatest(post.public_price,0)/100000000*rate,6))
  on conflict(user_id,action,reference_id) do nothing
  returning coin_amount into credited;
  update public.posts set owner_verified=true,status='검증',updated_at=now() where id=p_post_id;
  return query select coalesce(credited,0);
end;
$$;
revoke execute on function public.approve_owner_reward(bigint) from public,anon,authenticated;
revoke execute on function public.approve_owner_reward(uuid) from public,anon;
grant execute on function public.approve_owner_reward(uuid) to authenticated;

create or replace function public.real8_skip_unchanged_reward_history()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.old_value is not distinct from new.new_value then return null; end if;
  return new;
end;
$$;
create trigger real8_skip_unchanged_reward_history before insert on public.reward_rule_history_v4
for each row execute function public.real8_skip_unchanged_reward_history();

-- Protected ownership and verification fields are managed by server routines.
revoke insert,update on public.posts from public,anon,authenticated;
grant insert (author_id,category,title,region,asset_address,price,party_a_label,party_b_label,
  transaction_side,condition_a,condition_b,content,details_json,owner_claim,public_price,status)
  on public.posts to authenticated;
grant update (title,region,asset_address,price,condition_a,condition_b,content,details_json)
  on public.posts to authenticated;
revoke insert,update on public.participations from public,anon,authenticated;

commit;
