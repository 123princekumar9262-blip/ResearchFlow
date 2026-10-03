-- RPCs: operations that touch several rows and must succeed or fail together.
-- SECURITY DEFINER ones re-check the caller themselves; INVOKER ones run under RLS
-- and the triggers.

-- Create a project with its first members in one step. (A plain insert can't
-- return the row: the creator isn't a member yet when RLS checks RETURNING.)
create function public.create_project(
  p_title text,
  p_description text default '',
  p_start_date date default current_date,
  p_target_end_date date default null,
  p_member_ids uuid[] default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to create a project.';
  end if;

  insert into public.projects (title, description, start_date, target_end_date, created_by)
  values (btrim(p_title), coalesce(p_description, ''), coalesce(p_start_date, current_date), p_target_end_date, v_uid)
  returning id into v_project;

  insert into public.project_members (project_id, user_id, role) values (v_project, v_uid, 'student');

  foreach v_member in array coalesce(p_member_ids, '{}') loop
    continue when v_member = v_uid;
    if not public.are_linked(v_uid, v_member) then
      raise exception 'You can only add your professor or lab-mates (students of the same professor).';
    end if;
    insert into public.project_members (project_id, user_id, role)
    values (v_project, v_member, 'student')
    on conflict do nothing;
  end loop;

  return v_project;
end;
$$;

-- Add a linked professor or student to an existing project. When a professor
-- joins, open tasks become reviewable: approval moves to them.
create function public.add_project_member(p_project uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_project_member(p_project) then
    raise exception 'You are not a member of this project.';
  end if;
  if not public.are_linked(v_uid, p_user) then
    raise exception 'You can only add your professor or lab-mates (students of the same professor).';
  end if;

  -- Flip review before the professor is a member: once they are, the task
  -- trigger rightly stops a student from changing requires_review.
  if (select role from public.profiles where id = p_user) = 'professor'
     and not public.project_has_professor(p_project) then
    update public.tasks set requires_review = true
    where project_id = p_project and status <> 'done' and not requires_review;
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project, p_user, 'student')
  on conflict do nothing;
end;
$$;

-- Student links to a professor with the professor's join code.
create function public.join_professor(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_professor uuid;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if (select role from public.profiles where id = v_uid) is distinct from 'student' then
    raise exception 'Only students can join a professor.';
  end if;
  select id into v_professor from public.profiles where join_code = v_code and role = 'professor';
  if v_professor is null then
    raise exception 'No professor has that code. Check it and try again.';
  end if;
  insert into public.supervisions (professor_id, student_id) values (v_professor, v_uid)
  on conflict do nothing;
  return v_professor;
end;
$$;

create function public.regenerate_join_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if (select role from public.profiles where id = auth.uid()) is distinct from 'professor' then
    raise exception 'Only professors have a join code.';
  end if;
  v_code := public.generate_join_code();
  perform set_config('researchflow.rotating_code', 'on', true);
  update public.profiles set join_code = v_code where id = auth.uid();
  perform set_config('researchflow.rotating_code', '', true);
  return v_code;
end;
$$;

-- Professor verdict on a task under review: status change and remark together.
-- Approval also closes the change requests it answers.
create function public.review_task(p_task uuid, p_approve boolean, p_comment text default '')
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_task public.tasks;
  v_comment text := btrim(coalesce(p_comment, ''));
begin
  select * into v_task from public.tasks where id = p_task;
  if v_task.id is null then
    raise exception 'Task not found.';
  end if;
  if not public.is_project_professor(v_task.project_id) then
    raise exception 'Only the project''s professor can review tasks.';
  end if;
  if v_task.status <> 'in_review' then
    raise exception 'This task is not awaiting review.';
  end if;
  if not p_approve and v_comment = '' then
    raise exception 'Say what needs to change so the student can act on it.';
  end if;

  update public.tasks
  set status = case when p_approve then 'done'::public.task_status else 'changes_requested'::public.task_status end
  where id = p_task;

  if p_approve then
    update public.remarks set addressed_at = now()
    where task_id = p_task and kind = 'change_request' and addressed_at is null;
  end if;

  if not p_approve or v_comment <> '' then
    insert into public.remarks (project_id, task_id, author_id, kind, body)
    values (
      v_task.project_id, p_task, auth.uid(),
      case when p_approve then 'approval'::public.remark_kind else 'change_request'::public.remark_kind end,
      case when v_comment = '' then 'Approved.' else v_comment end
    );
  end if;
end;
$$;

-- Turn a remark into a tracked task and mark the remark addressed. Can run
-- several times on one remark (a remark often holds several asks).
create function public.convert_remark_to_task(
  p_remark uuid,
  p_title text,
  p_description text default '',
  p_priority public.task_priority default 'medium',
  p_personal_deadline date default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_remark public.remarks;
  v_parent_task public.tasks;
  v_task uuid;
  v_assignee uuid;
begin
  select * into v_remark from public.remarks where id = p_remark;
  if v_remark.id is null then
    raise exception 'Remark not found.';
  end if;

  if v_remark.task_id is not null then
    select * into v_parent_task from public.tasks where id = v_remark.task_id;
  end if;

  v_assignee := case
    when public.project_role(v_remark.project_id) = 'student' then auth.uid()
    else v_parent_task.assignee_id
  end;

  insert into public.tasks (
    project_id, milestone_id, title, description, priority, assignee_id,
    created_by, personal_deadline, source_remark_id
  )
  values (
    v_remark.project_id, v_parent_task.milestone_id, btrim(p_title),
    coalesce(p_description, ''), coalesce(p_priority, 'medium'), v_assignee,
    auth.uid(), p_personal_deadline, p_remark
  )
  returning id into v_task;

  -- Work on the revision is a prerequisite for the reviewed task.
  if v_parent_task.id is not null and v_parent_task.status <> 'done' then
    insert into public.task_dependencies (task_id, depends_on_id) values (v_parent_task.id, v_task)
    on conflict do nothing;
  end if;

  update public.remarks set addressed_at = coalesce(addressed_at, now()) where id = p_remark;
  return v_task;
end;
$$;

-- Public, read-only view of one submitted report, for professors who haven't
-- signed up. Only works while the student has sharing switched on.
create function public.get_shared_report(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'week_start', r.week_start,
    'stats', r.stats,
    'highlights', r.highlights,
    'student_note', r.student_note,
    'submitted_at', r.submitted_at,
    'acknowledged_at', r.acknowledged_at,
    'student_name', p.full_name
  )
  from public.weekly_reports r
  join public.profiles p on p.id = r.student_id
  where r.share_token = p_token and r.share_enabled and r.submitted_at is not null;
$$;

revoke all on function public.create_project(text, text, date, date, uuid[]) from public, anon;
revoke all on function public.add_project_member(uuid, uuid) from public, anon;
revoke all on function public.join_professor(text) from public, anon;
revoke all on function public.regenerate_join_code() from public, anon;
revoke all on function public.review_task(uuid, boolean, text) from public, anon;
revoke all on function public.convert_remark_to_task(uuid, text, text, public.task_priority, date) from public, anon;
revoke all on function public.get_shared_report(uuid) from public;

grant execute on function public.create_project(text, text, date, date, uuid[]) to authenticated;
grant execute on function public.add_project_member(uuid, uuid) to authenticated;
grant execute on function public.join_professor(text) to authenticated;
grant execute on function public.regenerate_join_code() to authenticated;
grant execute on function public.review_task(uuid, boolean, text) to authenticated;
grant execute on function public.convert_remark_to_task(uuid, text, text, public.task_priority, date) to authenticated;
grant execute on function public.get_shared_report(uuid) to anon, authenticated;

-- People the caller may put on a project: their professor(s) or students, and lab-mates.
create function public.linked_people()
returns table (id uuid, full_name text, role public.user_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where p.id <> auth.uid() and public.are_linked(auth.uid(), p.id)
  order by p.role desc, p.full_name;
$$;

revoke all on function public.linked_people() from public, anon;
grant execute on function public.linked_people() to authenticated;
