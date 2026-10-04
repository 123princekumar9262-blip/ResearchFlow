-- Projects can now be deleted, by the person who created them, with the
-- project's title typed back as confirmation. Everything in the project
-- (milestones, tasks, logs, remarks, files, blockers, decisions, extension
-- requests) goes with it through the existing ON DELETE CASCADE keys. Archiving
-- is still the way to keep a record and hide a project.

create policy "projects: creator deletes"
  on public.projects for delete to authenticated
  using (created_by = (select auth.uid()));

create function public.delete_project(p_project uuid, p_confirm_title text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_project public.projects;
begin
  select * into v_project from public.projects where id = p_project;
  if v_project.id is null then
    raise exception 'Project not found.';
  end if;
  if v_project.created_by is distinct from auth.uid() then
    raise exception 'Only the person who created this project can delete it.';
  end if;
  if lower(btrim(coalesce(p_confirm_title, ''))) <> lower(btrim(v_project.title)) then
    raise exception 'Type the project''s name exactly to confirm.';
  end if;
  delete from public.projects where id = p_project;
end;
$$;

revoke all on function public.delete_project(uuid, text) from public, anon;
grant execute on function public.delete_project(uuid, text) to authenticated;
