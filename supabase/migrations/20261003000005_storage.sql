-- Private bucket for evidence files. Object names are "{project_id}/{uuid}-{filename}",
-- so access derives from the first folder segment and the same membership check
-- as the tables.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create policy "attachments bucket: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "attachments bucket: members upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "attachments bucket: uploader deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and owner_id = (select auth.uid())::text);
