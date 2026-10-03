-- Helper functions and triggers.
--
-- Helpers used by RLS are SECURITY DEFINER with an empty search_path: they read
-- project_members without re-entering its own policies (no recursion) and can't
-- be hijacked by objects in another schema.
--
-- Trigger errors use SQLSTATE P0001 and messages written for the person who hit
-- them; the app shows them verbatim.

-- ───────────────────────────── membership helpers ─────────────────────────────
create function public.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = (select auth.uid())
  );
$$;

create function public.is_project_professor(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = (select auth.uid()) and m.role = 'professor'
  );
$$;

create function public.project_role(p_project uuid)
returns public.user_role language sql stable security definer set search_path = '' as $$
  select m.role from public.project_members m
  where m.project_id = p_project and m.user_id = (select auth.uid());
$$;

create function public.project_has_professor(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.role = 'professor'
  );
$$;

-- True when the two people are linked by supervision, in either direction.
create function public.is_supervision_pair(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.supervisions s
    where (s.professor_id = p_a and s.student_id = p_b)
       or (s.professor_id = p_b and s.student_id = p_a)
  );
$$;

-- People who may be put on a project together: a supervision pair, or two
-- students under the same professor (lab-mates).
create function public.are_linked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_supervision_pair(p_a, p_b)
    or exists (
      select 1 from public.supervisions s1
      join public.supervisions s2 on s2.professor_id = s1.professor_id
      where s1.student_id = p_a and s2.student_id = p_b
    );
$$;

create function public.supervises(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.supervisions s
    where s.professor_id = (select auth.uid()) and s.student_id = p_student
  );
$$;

-- You can see a profile if it is yours, you are linked (supervision or lab-mates),
-- or you share a project.
create function public.can_see_profile(p_target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_target = (select auth.uid())
    or public.are_linked(p_target, (select auth.uid()))
    or exists (
      select 1
      from public.project_members mine
      join public.project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = p_target
    );
$$;

create function public.task_project(p_task uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select project_id from public.tasks where id = p_task;
$$;

create function public.log_project(p_log uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select project_id from public.progress_logs where id = p_log;
$$;

-- Storage paths are user-supplied text; a malformed folder must deny, not error.
create function public.try_uuid(p_text text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function public.generate_join_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  -- No 0/O/1/I: codes get read aloud and copied off whiteboards.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where join_code = code);
  end loop;
  return code;
end;
$$;

-- ───────────────────────────── generic ─────────────────────────────
create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger progress_logs_updated_at before update on public.progress_logs
  for each row execute function public.set_updated_at();
create trigger weekly_reports_updated_at before update on public.weekly_reports
  for each row execute function public.set_updated_at();

-- ───────────────────────────── profiles ─────────────────────────────
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_name text;
begin
  v_role := case when new.raw_user_meta_data ->> 'role' = 'professor'
                 then 'professor'::public.user_role else 'student'::public.user_role end;
  v_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'New user');

  insert into public.profiles (id, full_name, role, join_code, timezone)
  values (
    new.id,
    left(v_name, 120),
    v_role,
    case when v_role = 'professor' then public.generate_join_code() end,
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Your role can''t be changed after sign-up.';
  end if;
  if new.join_code is distinct from old.join_code
     and coalesce(current_setting('researchflow.rotating_code', true), '') <> 'on' then
    raise exception 'Use "Regenerate code" to change your join code.';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ───────────────────────────── membership ─────────────────────────────
create function public.project_members_set_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.role into new.role from public.profiles p where p.id = new.user_id;
  if new.role is null then
    raise exception 'That user does not exist.';
  end if;
  return new;
end;
$$;

create trigger project_members_set_role before insert or update on public.project_members
  for each row execute function public.project_members_set_role();

-- ───────────────────────────── milestones ─────────────────────────────
create function public.milestones_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'A milestone can''t be moved to another project.';
  end if;

  if auth.uid() is not null
     and public.project_role(new.project_id) = 'student'
     and public.project_has_professor(new.project_id)
     and new.due_date is distinct from (case when tg_op = 'UPDATE' then old.due_date end) then
    raise exception 'Only your professor can set or move a milestone''s due date.';
  end if;
  return new;
end;
$$;

create trigger milestones_enforce before insert or update on public.milestones
  for each row execute function public.milestones_enforce();

-- ───────────────────────────── tasks ─────────────────────────────
-- The heart of the accountability model. Every rule here holds no matter which
-- client issues the write.
create function public.tasks_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_role      public.user_role;
  v_has_prof  boolean;
  v_dep_title text;
  v_closing   boolean;
begin
  v_has_prof := public.project_has_professor(new.project_id);
  v_role := public.project_role(new.project_id);

  if tg_op = 'INSERT' then
    -- A task is born open. Closing goes through the evidence checks below.
    if new.status not in ('todo', 'in_progress') then
      raise exception 'New tasks start as "To do" or "In progress".';
    end if;
    -- Review is the professor's call. A student can't opt their own task out.
    if new.requires_review is null or (v_role = 'student' and v_has_prof) then
      new.requires_review := v_has_prof;
    end if;
    if v_uid is not null and v_role = 'student' and v_has_prof and new.professor_deadline is not null then
      raise exception 'Only your professor can set a professor deadline on this project. Use your personal deadline instead.';
    end if;
  else
    if new.project_id <> old.project_id then
      raise exception 'A task can''t be moved to another project.';
    end if;

    if v_uid is not null and v_role = 'student' then
      if v_has_prof and new.professor_deadline is distinct from old.professor_deadline then
        raise exception 'Only your professor can move a professor deadline. Ask for an extension in a remark.';
      end if;
      if v_has_prof and new.requires_review is distinct from old.requires_review then
        raise exception 'Only your professor can change whether a task needs review.';
      end if;
      if new.status is distinct from old.status then
        if new.status = 'changes_requested' then
          raise exception 'Only your professor can request changes.';
        end if;
        if new.status = 'done' and new.requires_review then
          raise exception 'This task needs your professor''s approval. Submit it for review instead.';
        end if;
        if old.status = 'in_review' and new.status = 'done' then
          raise exception 'Only your professor can approve a task under review.';
        end if;
      end if;
    end if;

    -- Moving the professor deadline earlier pulls the personal one with it.
    if new.professor_deadline is distinct from old.professor_deadline
       and new.professor_deadline is not null
       and new.personal_deadline is not null
       and new.personal_deadline > new.professor_deadline then
      new.personal_deadline := new.professor_deadline;
    end if;

    -- Submitting or closing needs proof and finished prerequisites. Approval of
    -- something already under review was checked when it was submitted.
    v_closing := new.status in ('in_review', 'done')
                 and new.status is distinct from old.status
                 and old.status <> 'in_review';
    if v_closing and v_uid is not null then
      if not exists (select 1 from public.progress_log_tasks lt where lt.task_id = new.id)
         and not exists (select 1 from public.attachments a where a.task_id = new.id) then
        raise exception 'Add evidence first: link a progress log to this task, or attach a file or link.';
      end if;

      select t.title into v_dep_title
      from public.task_dependencies d
      join public.tasks t on t.id = d.depends_on_id
      where d.task_id = new.id and t.status <> 'done'
      limit 1;
      if v_dep_title is not null then
        raise exception 'Finish the dependency "%" first.', v_dep_title;
      end if;
    end if;
  end if;

  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m where m.id = new.milestone_id and m.project_id = new.project_id
  ) then
    raise exception 'That milestone belongs to a different project.';
  end if;

  if new.assignee_id is not null and not exists (
    select 1 from public.project_members m where m.project_id = new.project_id and m.user_id = new.assignee_id
  ) then
    raise exception 'Tasks can only be assigned to project members.';
  end if;

  if new.status = 'in_review' and (tg_op = 'INSERT' or old.status <> 'in_review') then
    new.submitted_at := now();
  end if;
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_enforce before insert or update on public.tasks
  for each row execute function public.tasks_enforce();

create function public.tasks_audit_deadlines()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.professor_deadline is distinct from old.professor_deadline then
    insert into public.deadline_changes (task_id, project_id, field, old_value, new_value, changed_by)
    values (new.id, new.project_id, 'professor', old.professor_deadline, new.professor_deadline, auth.uid());
  end if;
  if new.personal_deadline is distinct from old.personal_deadline then
    insert into public.deadline_changes (task_id, project_id, field, old_value, new_value, changed_by)
    values (new.id, new.project_id, 'personal', old.personal_deadline, new.personal_deadline, auth.uid());
  end if;
  return null;
end;
$$;

create trigger tasks_audit_deadlines after update on public.tasks
  for each row execute function public.tasks_audit_deadlines();

create function public.task_dependencies_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.task_project(new.task_id) is distinct from public.task_project(new.depends_on_id) then
    raise exception 'Dependencies must be within the same project.';
  end if;

  -- Adding task → dep closes a cycle if task is already reachable from dep.
  if exists (
    with recursive reachable(id) as (
      select d.depends_on_id from public.task_dependencies d where d.task_id = new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join reachable r on d.task_id = r.id
    )
    select 1 from reachable where id = new.task_id
  ) then
    raise exception 'That dependency would create a cycle.';
  end if;
  return new;
end;
$$;

create trigger task_dependencies_enforce before insert on public.task_dependencies
  for each row execute function public.task_dependencies_enforce();

-- ───────────────────────────── progress logs ─────────────────────────────
create function public.progress_log_tasks_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.log_project(new.log_id) is distinct from public.task_project(new.task_id) then
    raise exception 'A log can only reference tasks from its own project.';
  end if;
  return new;
end;
$$;

create trigger progress_log_tasks_enforce before insert on public.progress_log_tasks
  for each row execute function public.progress_log_tasks_enforce();

create function public.progress_logs_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.project_id <> old.project_id or new.author_id <> old.author_id or new.log_date <> old.log_date then
    raise exception 'A log''s project, author and date are fixed once written.';
  end if;
  return new;
end;
$$;

create trigger progress_logs_guard before update on public.progress_logs
  for each row execute function public.progress_logs_guard();

-- ───────────────────────────── remarks ─────────────────────────────
create function public.remarks_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent public.remarks;
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select * into v_parent from public.remarks where id = new.parent_id;
      if v_parent.project_id is distinct from new.project_id then
        raise exception 'A reply must be in the same project as the remark it answers.';
      end if;
      if v_parent.parent_id is not null then
        raise exception 'Reply to the original remark, not to a reply.';
      end if;
      new.task_id := v_parent.task_id;
    end if;
    if new.task_id is not null and public.task_project(new.task_id) is distinct from new.project_id then
      raise exception 'That task belongs to a different project.';
    end if;
    -- A remark is never born addressed; someone has to act on it.
    new.addressed_at := null;
    new.addressed_by := null;
    return new;
  end if;

  -- Remarks are a record. Only their "addressed" state may change.
  if (new.project_id, new.task_id, new.parent_id, new.author_id, new.kind, new.source, new.body, new.created_at)
     is distinct from
     (old.project_id, old.task_id, old.parent_id, old.author_id, old.kind, old.source, old.body, old.created_at) then
    raise exception 'Remarks can''t be edited once posted. Reply instead.';
  end if;
  if new.addressed_at is not null and old.addressed_at is null then
    new.addressed_by := auth.uid();
  elsif new.addressed_at is null then
    new.addressed_by := null;
  end if;
  return new;
end;
$$;

create trigger remarks_enforce before insert or update on public.remarks
  for each row execute function public.remarks_enforce();

-- ───────────────────────────── attachments ─────────────────────────────
create function public.attachments_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.storage_path is distinct from old.storage_path
                           or new.url is distinct from old.url or new.uploader_id <> old.uploader_id) then
    raise exception 'An attachment''s file and project can''t be changed.';
  end if;
  if new.task_id is not null and public.task_project(new.task_id) is distinct from new.project_id then
    raise exception 'That task belongs to a different project.';
  end if;
  if new.progress_log_id is not null and public.log_project(new.progress_log_id) is distinct from new.project_id then
    raise exception 'That log belongs to a different project.';
  end if;
  if new.remark_id is not null and not exists (
    select 1 from public.remarks r where r.id = new.remark_id and r.project_id = new.project_id
  ) then
    raise exception 'That remark belongs to a different project.';
  end if;
  return new;
end;
$$;

create trigger attachments_enforce before insert or update on public.attachments
  for each row execute function public.attachments_enforce();

-- ───────────────────────────── blockers ─────────────────────────────
create function public.blockers_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.task_id is not null and public.task_project(new.task_id) is distinct from new.project_id then
    raise exception 'That task belongs to a different project.';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.resolved_at := null;
    new.resolved_by := null;
    return new;
  end if;
  if new.project_id <> old.project_id or new.raised_by <> old.raised_by then
    raise exception 'A blocker''s project and author are fixed.';
  end if;
  if new.status = 'resolved' and old.status = 'open' then
    new.resolved_at := now();
    new.resolved_by := auth.uid();
  elsif new.status = 'open' then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;
  return new;
end;
$$;

create trigger blockers_enforce before insert or update on public.blockers
  for each row execute function public.blockers_enforce();

-- ───────────────────────────── decisions ─────────────────────────────
create function public.decisions_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.author_id <> old.author_id) then
    raise exception 'A decision''s project and author are fixed.';
  end if;
  if new.superseded_by is not null and not exists (
    select 1 from public.decisions d where d.id = new.superseded_by and d.project_id = new.project_id
  ) then
    raise exception 'A decision can only be superseded by one from the same project.';
  end if;
  return new;
end;
$$;

create trigger decisions_enforce before insert or update on public.decisions
  for each row execute function public.decisions_enforce();

-- ───────────────────────────── weekly reports ─────────────────────────────
create function public.weekly_reports_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.acknowledged_at := null;
    new.acknowledged_by := null;
    return new;
  end if;

  if new.student_id <> old.student_id or new.week_start <> old.week_start then
    raise exception 'A report''s student and week are fixed.';
  end if;

  if v_uid is not null and v_uid <> old.student_id then
    -- A supervising professor may only acknowledge.
    if (new.stats, new.highlights, new.student_note, new.submitted_at, new.share_enabled, new.share_token)
       is distinct from
       (old.stats, old.highlights, old.student_note, old.submitted_at, old.share_enabled, old.share_token) then
      raise exception 'Only the student can edit their report.';
    end if;
    if new.acknowledged_at is not null and old.acknowledged_at is null then
      new.acknowledged_by := v_uid;
    end if;
    return new;
  end if;

  if v_uid is not null then
    if new.acknowledged_at is distinct from old.acknowledged_at
       or new.acknowledged_by is distinct from old.acknowledged_by then
      raise exception 'Only your professor can acknowledge a report.';
    end if;
  end if;

  if old.submitted_at is not null
     and (new.stats, new.highlights, new.student_note, new.submitted_at)
         is distinct from (old.stats, old.highlights, old.student_note, old.submitted_at) then
    raise exception 'This report was submitted and is now read-only.';
  end if;
  return new;
end;
$$;

create trigger weekly_reports_enforce before insert or update on public.weekly_reports
  for each row execute function public.weekly_reports_enforce();
