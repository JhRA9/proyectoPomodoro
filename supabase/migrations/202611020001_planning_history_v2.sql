-- Additive, disposable staging first. Logs are authoritative; snapshots hold refs.
begin;
create table if not exists public.studyhub_plan_heads (
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_id text not null, document jsonb not null,
 primary key(user_id,plan_id)
);
create table if not exists public.studyhub_plan_events (
 user_id uuid not null, plan_id text not null, sequence bigint not null, command_id text not null, document jsonb not null,
 primary key(user_id,plan_id,sequence), unique(user_id,plan_id,command_id),
 foreign key(user_id,plan_id) references public.studyhub_plan_heads(user_id,plan_id) on delete cascade
);
create table if not exists public.studyhub_plan_versions (
 user_id uuid not null, plan_id text not null, version bigint not null, document jsonb not null,
 primary key(user_id,plan_id,version),
 foreign key(user_id,plan_id) references public.studyhub_plan_heads(user_id,plan_id) on delete cascade
);
alter table public.studyhub_plan_heads enable row level security;
alter table public.studyhub_plan_events enable row level security;
alter table public.studyhub_plan_versions enable row level security;
drop policy if exists plan_heads_owner on public.studyhub_plan_heads;
create policy plan_heads_owner on public.studyhub_plan_heads for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists plan_events_owner on public.studyhub_plan_events;
create policy plan_events_owner on public.studyhub_plan_events for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists plan_versions_owner on public.studyhub_plan_versions;
create policy plan_versions_owner on public.studyhub_plan_versions for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.studyhub_plan_heads,public.studyhub_plan_events,public.studyhub_plan_versions from anon,authenticated;
grant select on public.studyhub_plan_heads,public.studyhub_plan_events,public.studyhub_plan_versions to authenticated;
grant all on public.studyhub_plan_heads,public.studyhub_plan_events,public.studyhub_plan_versions to service_role;

create or replace function public.studyhub_read_planned_snapshot(p_owner uuid default null)
returns setof public.studyhub_states language plpgsql security definer set search_path='' as $$
declare owner_id uuid; result public.studyhub_states; plans jsonb; descriptor jsonb; head jsonb;
begin
 owner_id:=coalesce(p_owner,auth.uid());
 if owner_id is null or (auth.role() is distinct from 'service_role' and owner_id is distinct from auth.uid()) then raise exception 'Owner required' using errcode='42501';end if;
 select * into result from public.studyhub_states where user_id=owner_id;
 if not found then return;end if;
 plans:='[]'::jsonb;
 for descriptor in select value from jsonb_array_elements(coalesce(result.state->'projectPlans','[]')) loop
   if descriptor->>'externalHistory'='true' then
     select document into head from public.studyhub_plan_heads where user_id=owner_id and plan_id=descriptor->>'id';
     if head is null then raise exception 'Missing planning checkpoint';end if;
     head:=head||jsonb_build_object('events',coalesce((select jsonb_agg(document order by sequence) from public.studyhub_plan_events where user_id=owner_id and plan_id=descriptor->>'id'),'[]'::jsonb),
       'versions',coalesce((select jsonb_agg(document order by version) from public.studyhub_plan_versions where user_id=owner_id and plan_id=descriptor->>'id'),'[]'::jsonb));
     plans:=plans||jsonb_build_array(head);
   else plans:=plans||jsonb_build_array(descriptor);end if;
 end loop;
 result.state:=jsonb_set(result.state,'{projectPlans}',plans);
 return next result;
end;
$$;
revoke all on function public.studyhub_read_planned_snapshot(uuid) from public,anon;
grant execute on function public.studyhub_read_planned_snapshot(uuid) to authenticated,service_role;

create or replace function public.studyhub_save_planned_snapshot(p_owner uuid,p_state jsonb,p_expected_revision bigint)
returns setof public.studyhub_states language plpgsql security definer set search_path='' as $$
declare current_row public.studyhub_states; next_revision bigint; stored jsonb; refs jsonb:='[]'; plan jsonb; event jsonb; v jsonb; existing jsonb;
begin
 if auth.role() is distinct from 'service_role' or p_owner is null then raise exception 'Server only' using errcode='42501';end if;
 if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_state->'revision') is distinct from 'number' then raise exception 'Invalid snapshot';end if;
 next_revision:=(p_state->>'revision')::bigint;
 if next_revision<0 or next_revision>9007199254740991 or (p_state->>'revision')::numeric<>next_revision then raise exception 'Invalid revision';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,1));
 select * into current_row from public.studyhub_read_planned_snapshot(p_owner);
 if found then
   if current_row.state=p_state and current_row.revision=next_revision then return next current_row;return;end if;
   if p_expected_revision is null or p_expected_revision<>current_row.revision or next_revision<=current_row.revision then return;end if;
 elsif p_expected_revision is not null then return;end if;
 for plan in select value from jsonb_array_elements(coalesce(p_state->'projectPlans','[]')) loop
   if plan->>'modelVersion'='2' then
     insert into public.studyhub_plan_heads values(p_owner,plan->>'id',plan-'events'-'versions') on conflict(user_id,plan_id) do update set document=excluded.document;
     for event in select value from jsonb_array_elements(plan->'events') loop
       select document into existing from public.studyhub_plan_events where user_id=p_owner and plan_id=plan->>'id' and sequence=(event->>'revision')::bigint;
       if existing is not null and existing<>event then raise exception 'Immutable planning event';end if;
       insert into public.studyhub_plan_events values(p_owner,plan->>'id',(event->>'revision')::bigint,event->>'id',event) on conflict(user_id,plan_id,sequence) do nothing;
     end loop;
     if (select count(*) from public.studyhub_plan_events where user_id=p_owner and plan_id=plan->>'id')<>jsonb_array_length(plan->'events') then raise exception 'History cannot shrink';end if;
     -- Checkpoint representation changes are validated by replay in the handler.
     for v in select value from jsonb_array_elements(plan->'versions') loop
       insert into public.studyhub_plan_versions values(p_owner,plan->>'id',(v->>'version')::bigint,v) on conflict(user_id,plan_id,version) do update set document=excluded.document;
     end loop;
     if (select count(*) from public.studyhub_plan_versions where user_id=p_owner and plan_id=plan->>'id')<>jsonb_array_length(plan->'versions') then raise exception 'Versions cannot shrink';end if;
     refs:=refs||jsonb_build_array(jsonb_build_object('id',plan->>'id','projectId',plan->>'projectId','modelVersion',2,'externalHistory',true,'revision',(plan->>'revision')::bigint));
   else refs:=refs||jsonb_build_array(plan);end if;
 end loop;
 -- Explicit project deletion is authorized by the handler, never by client table writes.
 delete from public.studyhub_plan_heads h where h.user_id=p_owner and not exists(select 1 from jsonb_array_elements(p_state->'projects') p where p->>'id'=h.document->>'projectId');
 stored:=jsonb_set(p_state,'{projectPlans}',refs);
 insert into public.studyhub_states(user_id,state,revision) values(p_owner,stored,next_revision)
 on conflict(user_id) do update set state=excluded.state,revision=excluded.revision,updated_at=now();
 return query select * from public.studyhub_read_planned_snapshot(p_owner);
end;
$$;
revoke all on function public.studyhub_save_planned_snapshot(uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.studyhub_save_planned_snapshot(uuid,jsonb,bigint) to service_role;
commit;
