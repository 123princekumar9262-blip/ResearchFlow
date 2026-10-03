-- Extension requests: the legitimate way to move a professor deadline you
-- don't own. A student proposes a date with a reason; only the project's
-- professor can decide. Approval moves the deadline (audited by the task
-- trigger) and both outcomes are posted on the task as a remark.

create type public.extension_status as enum ('pending', 'approved', 'declined');

create table public.extension_requests (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  task_id            uuid not null references public.tasks (id) on delete cascade,
  requested_by       uuid not null references public.profiles (id) on delete cascade,
  -- The professor deadline when the request was made, for the record.
  current_deadline   date,
  proposed_deadline  date not null,
  reason             text not null check (char_length(btrim(reason)) between 1 and 2000),
  status             public.extension_status not null default 'pending',
  response           text check (response is null or char_length(response) <= 2000),
  decided_by         uuid references public.profiles (id) on delete set null,
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null))
);
create index extension_requests_project_idx on public.extension_requests (project_id, status);
-- One open request per task at a time.
create unique index extension_requests_one_pending on public.extension_requests (task_id) where status = 'pending';

create function public.extension_requests_enforce()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if v_task.id is null or v_task.project_id <> new.project_id then
    raise exception 'That task belongs to a different project.';
  end if;
  if not public.project_has_professor(new.project_id) then
    raise exception 'This project has no professor yet, so you set its deadlines yourself.';
  end if;
  if v_task.status = 'done' then
    raise exception 'This task is already done.';
  end if;
  if v_task.professor_deadline is not null and new.proposed_deadline <= v_task.professor_deadline then
    raise exception 'Propose a date after the current deadline (%).', to_char(v_task.professor_deadline, 'Dy FMDD Mon');
  end if;
  new.current_deadline := v_task.professor_deadline;
  new.status := 'pending';
  new.response := null;
  new.decided_by := null;
  new.decided_at := null;
  return new;
end;
$$;

create trigger extension_requests_enforce before insert on public.extension_requests
  for each row execute function public.extension_requests_enforce();

alter table public.extension_requests enable row level security;
grant select, insert, delete on public.extension_requests to authenticated;
grant all on public.extension_requests to service_role;

create policy "extension_requests: members read"
  on public.extension_requests for select to authenticated
  using (public.is_project_member(project_id));

create policy "extension_requests: members request for themselves"
  on public.extension_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and public.is_project_member(project_id));

-- The requester may withdraw while it's still pending.
create policy "extension_requests: requester withdraws pending"
  on public.extension_requests for delete to authenticated
  using (requested_by = (select auth.uid()) and status = 'pending');
-- Decisions happen only through respond_extension().

create function public.respond_extension(p_request uuid, p_approve boolean, p_response text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_req public.extension_requests;
  v_text text := btrim(coalesce(p_response, ''));
begin
  select * into v_req from public.extension_requests where id = p_request;
  if v_req.id is null then
    raise exception 'Request not found.';
  end if;
  if not public.is_project_professor(v_req.project_id) then
    raise exception 'Only the project''s professor can decide on an extension.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided.';
  end if;
  if not p_approve and v_text = '' then
    raise exception 'Say why, so the student knows what to do instead.';
  end if;

  if p_approve then
    -- Runs the task trigger as the professor, so the move is allowed and audited.
    update public.tasks set professor_deadline = v_req.proposed_deadline where id = v_req.task_id;
  end if;

  update public.extension_requests
  set status = case when p_approve then 'approved'::public.extension_status else 'declined'::public.extension_status end,
      response = nullif(v_text, ''),
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request;

  insert into public.remarks (project_id, task_id, author_id, kind, body)
  values (
    v_req.project_id, v_req.task_id, auth.uid(), 'comment',
    case when p_approve
      then 'Extension approved: new deadline ' || to_char(v_req.proposed_deadline, 'Dy FMDD Mon') || '.'
      else 'Extension declined. The deadline stays ' || coalesce(to_char(v_req.current_deadline, 'Dy FMDD Mon'), 'as it is') || '.'
    end || case when v_text <> '' then ' ' || v_text else '' end
  );
end;
$$;

revoke all on function public.respond_extension(uuid, boolean, text) from public, anon;
grant execute on function public.respond_extension(uuid, boolean, text) to authenticated;
revoke all on function public.extension_requests_enforce() from public, anon;
