-- Additive protection for explicitly immutable originals. Legacy uploads retain
-- their replacement behavior. Install first in a disposable environment.
begin;
create or replace function public.studyhub_original_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare immutable boolean; owner_id uuid;
begin
 if old.bucket_id <> 'studyhub-task-files' then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;
 immutable:=coalesce(to_jsonb(old)->'user_metadata'->>'immutable',old.metadata->'user_metadata'->>'immutable',old.metadata->>'immutable','false')='true';
 if immutable and tg_op='UPDATE' then
   if to_jsonb(new)-'last_accessed_at' is distinct from to_jsonb(old)-'last_accessed_at' then
     raise exception 'Originals are immutable; create another version' using errcode='42501';
   end if;
 end if;
 if immutable and tg_op='DELETE' then
   -- Historical submission references are retained even after their task closes.
   -- Delete the project through the validated snapshot before removing originals.
   if exists(select 1 from public.studyhub_states s,
      lateral jsonb_array_elements(coalesce(s.state->'exercises','[]')) x,
      lateral jsonb_array_elements(coalesce(x->'submissionVersions','[]')) v,
      lateral jsonb_array_elements(coalesce(v->'payload'->'files','[]')) f
      where f->>'path'=old.name) then
     raise exception 'Original still referenced by submission history' using errcode='42501';
   end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.studyhub_original_guard() from public,anon,authenticated;
drop trigger if exists studyhub_original_guard on storage.objects;
create trigger studyhub_original_guard before update or delete on storage.objects for each row execute function public.studyhub_original_guard();
commit;
