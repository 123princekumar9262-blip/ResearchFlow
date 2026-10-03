-- Notifications (phone push and the morning email digest) and comments on
-- progress-log entries.

-- ───────────────────────────── comments on log entries ─────────────────────────────
-- A remark can be about one day's log entry instead of a task: feedback lands
-- on the work it's about (spec §3.4). Comments only; replies inherit the entry.
alter table public.remarks
  add column progress_log_id uuid references public.progress_logs (id) on delete cascade;
create index remarks_progress_log_idx on public.remarks (progress_log_id) where progress_log_id is not null;

create or replace function public.remarks_enforce()
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
      new.progress_log_id := v_parent.progress_log_id;
    end if;
    if new.task_id is not null and public.task_project(new.task_id) is distinct from new.project_id then
      raise exception 'That task belongs to a different project.';
    end if;
    if new.progress_log_id is not null then
      if public.log_project(new.progress_log_id) is distinct from new.project_id then
        raise exception 'That log entry belongs to a different project.';
      end if;
      if new.task_id is not null then
        raise exception 'A remark is about a task or a log entry, not both.';
      end if;
      if new.kind <> 'comment' then
        raise exception 'Log entries take comments. For a change request, comment on the task instead.';
      end if;
    end if;
    -- A remark is never born addressed; someone has to act on it.
    new.addressed_at := null;
    new.addressed_by := null;
    return new;
  end if;

  -- Remarks are a record. Only their "addressed" state may change.
  if (new.project_id, new.task_id, new.progress_log_id, new.parent_id, new.author_id, new.kind, new.source, new.body, new.created_at)
     is distinct from
     (old.project_id, old.task_id, old.progress_log_id, old.parent_id, old.author_id, old.kind, old.source, old.body, old.created_at) then
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

-- ───────────────────────────── push subscriptions ─────────────────────────────
-- One row per device that agreed to notifications. The browser's push service
-- gives the endpoint and keys; only the owner can see or remove them.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint like 'https://%'),
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '' check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create policy "push_subscriptions: own read"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push_subscriptions: own add"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "push_subscriptions: own remove"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── digest preference ─────────────────────────────
alter table public.profiles
  add column digest_email boolean not null default true;
