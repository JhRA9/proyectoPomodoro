-- OPTIONAL PUBLICATION GATE. Not part of automatic migrations.
-- Apply only after verified backups and explicit authorization for the target.
begin;
create or replace function public.studyhub_save_snapshot(p_state jsonb, p_expected_revision bigint)
returns setof public.studyhub_states
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_row public.studyhub_states; next_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_state->'revision') is distinct from 'number' then raise exception 'Invalid snapshot'; end if;
  next_revision := (p_state->>'revision')::bigint;
  if next_revision < 0 or next_revision > 9007199254740991 or (p_state->>'revision')::numeric <> next_revision then raise exception 'Invalid revision'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 1));
  select * into current_row from public.studyhub_states where user_id=owner_id;
  if found then
    -- Recovery after a lost acknowledgement, never a second write.
    if current_row.state = p_state and current_row.revision = next_revision then return next current_row; return; end if;
    if p_expected_revision is null or p_expected_revision <> current_row.revision or next_revision <= current_row.revision then return; end if;
    return query update public.studyhub_states set state=p_state, revision=next_revision, updated_at=now() where user_id=owner_id returning *;
  else
    if p_expected_revision is not null then return; end if;
    return query insert into public.studyhub_states(user_id,state,revision) values(owner_id,p_state,next_revision) returning *;
  end if;
end;
$$;
revoke all on function public.studyhub_save_snapshot(jsonb,bigint) from public, anon;
grant execute on function public.studyhub_save_snapshot(jsonb,bigint) to authenticated;
-- RLS remains enabled; direct reads retain the existing owner policy.
-- Old upsert/update clients cannot bypass the compare-and-swap RPC.
revoke insert, update, delete on public.studyhub_states from authenticated;
commit;
