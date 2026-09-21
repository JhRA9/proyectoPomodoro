begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studyhub-task-files', 'studyhub-task-files', false, 20971520, null)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "studyhub_task_files_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'studyhub-task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "studyhub_task_files_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'studyhub-task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "studyhub_task_files_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'studyhub-task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'studyhub-task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "studyhub_task_files_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'studyhub-task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
