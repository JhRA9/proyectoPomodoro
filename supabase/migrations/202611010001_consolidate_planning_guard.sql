-- Additive protection: unchanged plan JSON can still lose its task/project
-- references through an old client's write. Validate the whole transition.
begin;
create or replace function public.studyhub_guard_planning()
returns trigger language plpgsql set search_path='' as $$
declare new_has_plan boolean; old_has_plan boolean;
begin
  new_has_plan := coalesce(new.state->'projectPlans','[]'::jsonb) <> '[]'::jsonb;
  old_has_plan := case when TG_OP='INSERT' then false else coalesce(old.state->'projectPlans','[]'::jsonb) <> '[]'::jsonb end;
  if auth.role() is distinct from 'service_role' and (new_has_plan or old_has_plan)
  then raise exception 'Planning snapshots require authenticated server validation' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function public.studyhub_guard_planning() from public,anon,authenticated;
commit;
