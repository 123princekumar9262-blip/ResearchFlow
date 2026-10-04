-- Meetings: the weekly one-to-one between a professor and a student.
-- The agenda is built live from what's open between them (requests, blockers,
-- reviews, overdue work, last week's report); only what people add is stored:
-- the time, shared notes, extra topics, and the action items, which are
-- ordinary tasks that remember the meeting they came from.

create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid not null references public.profiles (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  starts_at     timestamptz not null,
  notes         text not null default '' check (char_length(notes) <= 20000),
  status        text not null default 'scheduled' check (status in ('scheduled', 'done')),
  ended_at      timestamptz,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index meetings_professor_idx on public.meetings (professor_id, starts_at desc);
create index meetings_student_idx on public.meetings (student_id, starts_at desc);

create table public.meeting_topics (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index meeting_topics_meeting_idx on public.meeting_topics (meeting_id, created_at);

-- Action items are tasks; deleting the meeting keeps them.
alter table public.tasks
  add column meeting_id uuid references public.meetings (id) on delete set null;
create index tasks_meeting_idx on public.tasks (meeting_id) where meeting_id is not null;

-- ───────────────────────────── helpers ─────────────────────────────
-- SECURITY DEFINER so policies can ask without re-entering the meetings policies.
create function public.is_meeting_participant(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting and (select auth.uid()) in (m.professor_id, m.student_id)
  );
$$;

create function public.supervision_exists(p_professor uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.supervisions s
    where s.professor_id = p_professor and s.student_id = p_student
  );
$$;

-- Who and when-created are fixed; "done" stamps when the meeting ended.
create function public.meetings_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.professor_id, new.student_id, new.created_by, new.created_at)
     is distinct from (old.professor_id, old.student_id, old.created_by, old.created_at) then
    raise exception 'A meeting''s people can''t be changed. Schedule a new one instead.';
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.ended_at := now();
  elsif new.status = 'scheduled' then
    new.ended_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger meetings_guard before update on public.meetings
  for each row execute function public.meetings_guard();

-- Topics: anyone in the meeting can tick one off; only its author can reword it.
create function public.meeting_topics_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.meeting_id is distinct from old.meeting_id or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'That can''t be changed.';
  end if;
  if new.body is distinct from old.body and old.author_id <> (select auth.uid()) then
    raise exception 'Only the person who added a topic can reword it.';
  end if;
  return new;
end;
$$;
create trigger meeting_topics_guard before update on public.meeting_topics
  for each row execute function public.meeting_topics_guard();

-- ───────────────────────────── row-level security ─────────────────────────────
alter table public.meetings enable row level security;
alter table public.meeting_topics enable row level security;

create policy "meetings: participants read"
  on public.meetings for select to authenticated
  using ((select auth.uid()) in (professor_id, student_id));

-- Either side can book it, but only between a professor and their own student.
create policy "meetings: participants create"
  on public.meetings for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select auth.uid()) in (professor_id, student_id)
    and public.supervision_exists(professor_id, student_id)
  );

create policy "meetings: participants update"
  on public.meetings for update to authenticated
  using ((select auth.uid()) in (professor_id, student_id))
  with check ((select auth.uid()) in (professor_id, student_id));

create policy "meetings: creator cancels"
  on public.meetings for delete to authenticated
  using (created_by = (select auth.uid()) and status = 'scheduled');

create policy "meeting_topics: participants read"
  on public.meeting_topics for select to authenticated
  using (public.is_meeting_participant(meeting_id));

create policy "meeting_topics: participants add"
  on public.meeting_topics for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_meeting_participant(meeting_id));

create policy "meeting_topics: participants tick"
  on public.meeting_topics for update to authenticated
  using (public.is_meeting_participant(meeting_id))
  with check (public.is_meeting_participant(meeting_id));

create policy "meeting_topics: author removes"
  on public.meeting_topics for delete to authenticated
  using (author_id = (select auth.uid()));

grant select, insert, update, delete on public.meetings, public.meeting_topics to authenticated;
grant all on public.meetings, public.meeting_topics to service_role;
