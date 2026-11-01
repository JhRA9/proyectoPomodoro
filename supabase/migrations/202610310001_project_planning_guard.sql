-- Additive. No existing snapshot/data is rewritten. Install only in an authorized environment.
begin;
create or replace function public.studyhub_guard_planning()
returns trigger language plpgsql set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' and
     coalesce(new.state->'projectPlans','[]'::jsonb) is distinct from
     (case when TG_OP='INSERT' then '[]'::jsonb else coalesce(old.state->'projectPlans','[]'::jsonb) end)
  then raise exception 'Planning requires authenticated server validation' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger studyhub_planning_guard before insert or update on public.studyhub_states
for each row execute function public.studyhub_guard_planning();

create or replace function public.studyhub_save_planned_snapshot(p_owner uuid,p_state jsonb,p_expected_revision bigint)
returns setof public.studyhub_states
language plpgsql security definer set search_path='' as $$
declare current_row public.studyhub_states; next_revision bigint;
begin
  if auth.role() is distinct from 'service_role' or p_owner is null then raise exception 'Server only' using errcode='42501'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_state->'revision') is distinct from 'number' then raise exception 'Invalid snapshot'; end if;
  next_revision:=(p_state->>'revision')::bigint;
  if next_revision<0 or next_revision>9007199254740991 or (p_state->>'revision')::numeric<>next_revision then raise exception 'Invalid revision'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,1));
  select * into current_row from public.studyhub_states where user_id=p_owner;
  if found then
    if current_row.state=p_state and current_row.revision=next_revision then return next current_row;return;end if;
    if p_expected_revision is null or p_expected_revision<>current_row.revision or next_revision<=current_row.revision then return;end if;
    return query update public.studyhub_states set state=p_state,revision=next_revision,updated_at=now() where user_id=p_owner returning *;
  else
    if p_expected_revision is not null then return;end if;
    return query insert into public.studyhub_states(user_id,state,revision) values(p_owner,p_state,next_revision) returning *;
  end if;
end;
$$;
revoke all on function public.studyhub_guard_planning() from public,anon,authenticated;
revoke all on function public.studyhub_save_planned_snapshot(uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.studyhub_save_planned_snapshot(uuid,jsonb,bigint) to service_role;
-- Prevent old clients from deleting the entire snapshot and recreating it to bypass history.
revoke delete on public.studyhub_states from authenticated;
commit;
