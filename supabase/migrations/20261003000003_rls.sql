-- Row-level security. Every table is closed by default; each policy below opens
-- exactly one door. Rows are scoped by project membership; the triggers in the
-- previous migration decide what a member may change.

-- Explicit grants: newer Supabase projects don't expose tables to the Data API
-- automatically, and the anonymous role should reach nothing but the share RPC.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- The secret key (service_role) is used only by scripts/seed.ts. It bypasses
-- RLS, but still needs table privileges when auto-exposure is off.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.supervisions enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.deadline_changes enable row level security;
alter table public.progress_logs enable row level security;
alter table public.progress_log_tasks enable row level security;
alter table public.remarks enable row level security;
alter table public.attachments enable row level security;
alter table public.blockers enable row level security;
alter table public.decisions enable row level security;
alter table public.weekly_reports enable row level security;

-- ───────────────────────────── people ─────────────────────────────
create policy "profiles: visible to self, supervision pairs and teammates"
  on public.profiles for select to authenticated
  using (public.can_see_profile(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "supervisions: visible to both sides"
  on public.supervisions for select to authenticated
  using (professor_id = (select auth.uid()) or student_id = (select auth.uid()));

create policy "supervisions: either side can unlink"
  on public.supervisions for delete to authenticated
  using (professor_id = (select auth.uid()) or student_id = (select auth.uid()));
-- Linking happens only through join_professor(code).

-- ───────────────────────────── projects ─────────────────────────────
create policy "projects: members read"
  on public.projects for select to authenticated
  using (public.is_project_member(id));

create policy "projects: members update"
  on public.projects for update to authenticated
  using (public.is_project_member(id)) with check (public.is_project_member(id));
-- Created only through create_project(); never deleted (archive instead), so the
-- record survives.

create policy "project_members: members read"
  on public.project_members for select to authenticated
  using (public.is_project_member(project_id));

-- Only a professor removes people. A student can't remove the professor to get
-- their deadlines back.
create policy "project_members: professor removes"
  on public.project_members for delete to authenticated
  using (public.is_project_professor(project_id));
-- Added only through create_project() / add_project_member().

create policy "milestones: members read"
  on public.milestones for select to authenticated
  using (public.is_project_member(project_id));

create policy "milestones: members create"
  on public.milestones for insert to authenticated
  with check (public.is_project_member(project_id) and created_by = (select auth.uid()));

create policy "milestones: members update"
  on public.milestones for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

create policy "milestones: professor deletes (or anyone before a professor joins)"
  on public.milestones for delete to authenticated
  using (
    public.is_project_professor(project_id)
    or (public.is_project_member(project_id) and not public.project_has_professor(project_id))
  );

-- ───────────────────────────── tasks ─────────────────────────────
create policy "tasks: members read"
  on public.tasks for select to authenticated
  using (public.is_project_member(project_id));

create policy "tasks: members create"
  on public.tasks for insert to authenticated
  with check (public.is_project_member(project_id) and created_by = (select auth.uid()));

create policy "tasks: members update"
  on public.tasks for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- Students can delete only their own unstarted tasks without a professor deadline.
create policy "tasks: delete"
  on public.tasks for delete to authenticated
  using (
    public.is_project_professor(project_id)
    or (
      public.is_project_member(project_id)
      and created_by = (select auth.uid())
      and professor_deadline is null
      and status in ('todo', 'in_progress')
    )
  );

create policy "task_dependencies: members read"
  on public.task_dependencies for select to authenticated
  using (public.is_project_member(public.task_project(task_id)));

create policy "task_dependencies: members create"
  on public.task_dependencies for insert to authenticated
  with check (public.is_project_member(public.task_project(task_id)));

create policy "task_dependencies: members delete"
  on public.task_dependencies for delete to authenticated
  using (public.is_project_member(public.task_project(task_id)));

create policy "deadline_changes: members read"
  on public.deadline_changes for select to authenticated
  using (public.is_project_member(project_id));
-- Written only by trigger.

-- ───────────────────────────── progress logs ─────────────────────────────
-- Grace window: a log may be dated from two days ago to tomorrow (tomorrow covers
-- timezones ahead of UTC). Outside it, history is read-only.
create policy "progress_logs: members read"
  on public.progress_logs for select to authenticated
  using (public.is_project_member(project_id));

create policy "progress_logs: author writes inside the grace window"
  on public.progress_logs for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_project_member(project_id)
    and log_date between current_date - 2 and current_date + 1
  );

create policy "progress_logs: author edits inside the grace window"
  on public.progress_logs for update to authenticated
  using (author_id = (select auth.uid()) and log_date >= current_date - 2)
  with check (author_id = (select auth.uid()) and log_date >= current_date - 2);
-- No delete: the log is the historical record.

create policy "progress_log_tasks: members read"
  on public.progress_log_tasks for select to authenticated
  using (public.is_project_member(public.log_project(log_id)));

create policy "progress_log_tasks: author links while editable"
  on public.progress_log_tasks for insert to authenticated
  with check (exists (
    select 1 from public.progress_logs l
    where l.id = log_id and l.author_id = (select auth.uid()) and l.log_date >= current_date - 2
  ));

-- Evidence can't be pulled out from under a task that's under review or done.
create policy "progress_log_tasks: author unlinks while editable"
  on public.progress_log_tasks for delete to authenticated
  using (
    exists (
      select 1 from public.progress_logs l
      where l.id = log_id and l.author_id = (select auth.uid()) and l.log_date >= current_date - 2
    )
    and not exists (
      select 1 from public.tasks t where t.id = task_id and t.status in ('in_review', 'done')
    )
  );

-- ───────────────────────────── remarks ─────────────────────────────
create policy "remarks: members read"
  on public.remarks for select to authenticated
  using (public.is_project_member(project_id));

-- Students post comments. They can record a change request or question only as
-- something said in a meeting. Approval is the professor's alone.
create policy "remarks: members post"
  on public.remarks for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_project_member(project_id)
    and (
      public.is_project_professor(project_id)
      or kind = 'comment'
      or (source = 'meeting' and kind in ('change_request', 'question'))
    )
  );

create policy "remarks: members mark addressed"
  on public.remarks for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- ───────────────────────────── attachments ─────────────────────────────
create policy "attachments: members read"
  on public.attachments for select to authenticated
  using (public.is_project_member(project_id));

create policy "attachments: members upload"
  on public.attachments for insert to authenticated
  with check (uploader_id = (select auth.uid()) and public.is_project_member(project_id));

create policy "attachments: uploader relinks"
  on public.attachments for update to authenticated
  using (uploader_id = (select auth.uid()) and public.is_project_member(project_id))
  with check (uploader_id = (select auth.uid()) and public.is_project_member(project_id));

create policy "attachments: uploader deletes fresh, non-evidence files"
  on public.attachments for delete to authenticated
  using (
    uploader_id = (select auth.uid())
    and created_at > now() - interval '24 hours'
    and not exists (
      select 1 from public.tasks t where t.id = task_id and t.status in ('in_review', 'done')
    )
  );

-- ───────────────────────────── blockers & decisions ─────────────────────────────
create policy "blockers: members read"
  on public.blockers for select to authenticated
  using (public.is_project_member(project_id));

create policy "blockers: members raise"
  on public.blockers for insert to authenticated
  with check (raised_by = (select auth.uid()) and public.is_project_member(project_id));

create policy "blockers: members update"
  on public.blockers for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

create policy "decisions: members read"
  on public.decisions for select to authenticated
  using (public.is_project_member(project_id));

create policy "decisions: members record"
  on public.decisions for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_project_member(project_id));

create policy "decisions: members update"
  on public.decisions for update to authenticated
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- ───────────────────────────── weekly reports ─────────────────────────────
-- Drafts are private; a supervisor sees a report once it is submitted.
create policy "weekly_reports: student, and supervisors once submitted"
  on public.weekly_reports for select to authenticated
  using (student_id = (select auth.uid()) or (submitted_at is not null and public.supervises(student_id)));

create policy "weekly_reports: student creates own"
  on public.weekly_reports for insert to authenticated
  with check (student_id = (select auth.uid()));

create policy "weekly_reports: student edits, supervisor acknowledges"
  on public.weekly_reports for update to authenticated
  using (student_id = (select auth.uid()) or public.supervises(student_id))
  with check (student_id = (select auth.uid()) or public.supervises(student_id));
