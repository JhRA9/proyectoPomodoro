begin;

create table public.studyhub_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint studyhub_states_state_is_object
    check (jsonb_typeof(state) = 'object'),
  constraint studyhub_states_revision_is_nonnegative
    check (revision >= 0)
);

comment on table public.studyhub_states is
  'Snapshot actual de StudyHub, con una fila independiente por usuario autenticado.';
comment on column public.studyhub_states.revision is
  'Version monotona del snapshot guardado por StudyHub.';

alter table public.studyhub_states enable row level security;

revoke all privileges on table public.studyhub_states
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.studyhub_states
  to authenticated;

create policy "studyhub_states_select_own"
  on public.studyhub_states
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "studyhub_states_insert_own"
  on public.studyhub_states
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "studyhub_states_update_own"
  on public.studyhub_states
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "studyhub_states_delete_own"
  on public.studyhub_states
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
