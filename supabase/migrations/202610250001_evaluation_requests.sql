-- Prepared for review only. This development task does not apply remote migrations.
-- Contains no exercise source or credentials; responses are private to their owner.
create table if not exists public.studyhub_evaluation_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (length(request_id) between 1 and 200),
  payload_hash text not null,
  state text not null check (state in ('processing', 'completed', 'failed')),
  response jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (user_id, request_id)
);
alter table public.studyhub_evaluation_requests enable row level security;
revoke all on public.studyhub_evaluation_requests from anon, authenticated;
grant all on public.studyhub_evaluation_requests to service_role;

create table if not exists public.studyhub_evaluation_request_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_day date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key(user_id, request_day)
);
alter table public.studyhub_evaluation_request_limits enable row level security;
revoke all on public.studyhub_evaluation_request_limits from anon, authenticated;
grant all on public.studyhub_evaluation_request_limits to service_role;

create or replace function public.studyhub_claim_evaluation(p_user_id uuid, p_request_id text, p_hash text, p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.studyhub_evaluation_requests; used_count integer;
begin
  -- Serializes claims for the same account, including the daily safety ceiling.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into existing from public.studyhub_evaluation_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if existing.payload_hash <> p_hash then return jsonb_build_object('state','conflict'); end if;
    if existing.state <> 'failed' or not p_retry then
      return jsonb_build_object('state', existing.state, 'response', existing.response);
    end if;
  end if;
  select request_count into used_count from public.studyhub_evaluation_request_limits where user_id=p_user_id and request_day=(now() at time zone 'UTC')::date;
  if coalesce(used_count,0) >= 100 then return jsonb_build_object('state','quota'); end if;
  insert into public.studyhub_evaluation_request_limits(user_id,request_day,request_count)
    values(p_user_id,(now() at time zone 'UTC')::date,1)
    on conflict(user_id,request_day) do update set request_count=studyhub_evaluation_request_limits.request_count+1;
  insert into public.studyhub_evaluation_requests(user_id,request_id,payload_hash,state)
    values(p_user_id,p_request_id,p_hash,'processing')
    on conflict(user_id,request_id) do update set state='processing',response=null,started_at=now(),finished_at=null;
  return jsonb_build_object('state','claimed');
end;
$$;
revoke all on function public.studyhub_claim_evaluation(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.studyhub_claim_evaluation(uuid,text,text,boolean) to service_role;
