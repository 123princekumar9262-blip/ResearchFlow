-- ResearchFlow schema: tables, enums, constraints, indexes.
-- Rules that span rows or depend on who is asking live in the next migrations
-- (triggers, RLS). Rules about a single row live here as CHECK constraints.

-- ───────────────────────────── enums ─────────────────────────────
create type public.user_role as enum ('student', 'professor');
create type public.project_status as enum ('active', 'on_hold', 'completed', 'archived');
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'changes_requested', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.remark_kind as enum ('comment', 'change_request', 'question', 'approval');
create type public.remark_source as enum ('app', 'meeting');
create type public.blocker_severity as enum ('low', 'medium', 'high');
create type public.blocker_status as enum ('open', 'resolved');
create type public.attachment_kind as enum ('file', 'link');
create type public.deadline_field as enum ('professor', 'personal');

-- ───────────────────────────── people ─────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 1 and 120),
  role        public.user_role not null,
  -- Professors hand this to students; students never have one.
  join_code   text unique,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now(),
  constraint profiles_join_code_matches_role check ((role = 'professor') = (join_code is not null))
);

create table public.supervisions (
  professor_id uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (professor_id, student_id),
  check (professor_id <> student_id)
);
create index supervisions_student_idx on public.supervisions (student_id);

-- ───────────────────────────── projects ─────────────────────────────
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 200),
  description      text not null default '' check (char_length(description) <= 10000),
  status           public.project_status not null default 'active',
  start_date       date not null default current_date,
  target_end_date  date,
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (target_end_date is null or target_end_date >= start_date)
);

create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- Copied from profiles.role by trigger so policies don't need a join.
  role        public.user_role not null,
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  due_date    date,
  position    integer not null default 0,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index milestones_project_idx on public.milestones (project_id, position);

-- ───────────────────────────── tasks ─────────────────────────────
-- Deadlines are calendar dates: "due Monday" means by the end of Monday in the
-- student's timezone. Dates avoid a whole class of timezone bugs.
create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  milestone_id        uuid references public.milestones (id) on delete set null,
  title               text not null check (char_length(title) between 1 and 200),
  description         text not null default '' check (char_length(description) <= 10000),
  status              public.task_status not null default 'todo',
  priority            public.task_priority not null default 'medium',
  assignee_id         uuid references public.profiles (id) on delete set null,
  created_by          uuid not null references public.profiles (id),
  professor_deadline  date,
  personal_deadline   date,
  effective_deadline  date generated always as (least(personal_deadline, professor_deadline)) stored,
  -- Filled by trigger on insert: true whenever the project has a professor.
  requires_review     boolean not null,
  estimate_hours      numeric(5, 1) check (estimate_hours is null or estimate_hours > 0),
  source_remark_id    uuid,
  position            double precision not null default 0,
  submitted_at        timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tasks_personal_before_professor
    check (personal_deadline is null or professor_deadline is null or personal_deadline <= professor_deadline)
);
create index tasks_project_status_idx on public.tasks (project_id, status);
create index tasks_assignee_idx on public.tasks (assignee_id, effective_deadline);
create index tasks_milestone_idx on public.tasks (milestone_id);

create table public.task_dependencies (
  task_id        uuid not null references public.tasks (id) on delete cascade,
  depends_on_id  uuid not null references public.tasks (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);
create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_id);

-- Every move of either deadline, written by trigger. Makes slips visible.
create table public.deadline_changes (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  field       public.deadline_field not null,
  old_value   date,
  new_value   date,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index deadline_changes_task_idx on public.deadline_changes (task_id, changed_at);

-- ───────────────────────────── progress ─────────────────────────────
create table public.progress_logs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  log_date        date not null,
  completed_work  text not null check (char_length(completed_work) between 1 and 5000),
  problems        text not null default '' check (char_length(problems) <= 5000),
  next_steps      text not null default '' check (char_length(next_steps) <= 5000),
  minutes_spent   integer not null default 0 check (minutes_spent between 0 and 1440),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One entry per person, project and day: the ritual is "update today's log".
  unique (author_id, project_id, log_date)
);
create index progress_logs_project_idx on public.progress_logs (project_id, log_date desc);
create index progress_logs_author_idx on public.progress_logs (author_id, log_date desc);

create table public.progress_log_tasks (
  log_id   uuid not null references public.progress_logs (id) on delete cascade,
  task_id  uuid not null references public.tasks (id) on delete cascade,
  primary key (log_id, task_id)
);
create index progress_log_tasks_task_idx on public.progress_log_tasks (task_id);

-- ───────────────────────────── feedback ─────────────────────────────
create table public.remarks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  task_id       uuid references public.tasks (id) on delete cascade,
  parent_id     uuid references public.remarks (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  kind          public.remark_kind not null default 'comment',
  -- 'meeting' = a student recording what the professor said offline.
  source        public.remark_source not null default 'app',
  body          text not null check (char_length(body) between 1 and 5000),
  addressed_at  timestamptz,
  addressed_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index remarks_project_idx on public.remarks (project_id, created_at desc);
create index remarks_task_idx on public.remarks (task_id);
create index remarks_parent_idx on public.remarks (parent_id);

alter table public.tasks
  add constraint tasks_source_remark_fk
  foreign key (source_remark_id) references public.remarks (id) on delete set null;
create index tasks_source_remark_idx on public.tasks (source_remark_id);

-- ───────────────────────────── evidence ─────────────────────────────
create table public.attachments (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  uploader_id      uuid not null references public.profiles (id) on delete cascade,
  kind             public.attachment_kind not null,
  name             text not null check (char_length(name) between 1 and 300),
  storage_path     text unique,
  url              text,
  mime_type        text,
  size_bytes       bigint check (size_bytes is null or size_bytes between 0 and 52428800),
  task_id          uuid references public.tasks (id) on delete set null,
  progress_log_id  uuid references public.progress_logs (id) on delete set null,
  remark_id        uuid references public.remarks (id) on delete set null,
  created_at       timestamptz not null default now(),
  check (
    (kind = 'file' and storage_path is not null and url is null)
    or (kind = 'link' and url is not null and storage_path is null)
  ),
  check (url is null or url ~* '^https?://'),
  -- Files live under their project's folder; storage policies rely on it.
  check (storage_path is null or starts_with(storage_path, project_id::text || '/'))
);
create index attachments_project_idx on public.attachments (project_id, created_at desc);
create index attachments_task_idx on public.attachments (task_id);
create index attachments_log_idx on public.attachments (progress_log_id);

-- ───────────────────────────── blockers & decisions ─────────────────────────────
create table public.blockers (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  task_id          uuid references public.tasks (id) on delete set null,
  raised_by        uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  description      text not null default '' check (char_length(description) <= 5000),
  severity         public.blocker_severity not null default 'medium',
  needs_professor  boolean not null default false,
  status           public.blocker_status not null default 'open',
  resolution       text check (resolution is null or char_length(resolution) <= 5000),
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null)),
  constraint blockers_resolution_required
    check (status = 'open' or char_length(btrim(coalesce(resolution, ''))) > 0)
);
create index blockers_project_idx on public.blockers (project_id, status);

create table public.decisions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 200),
  context        text not null default '' check (char_length(context) <= 5000),
  decision       text not null check (char_length(decision) between 1 and 5000),
  alternatives   text not null default '' check (char_length(alternatives) <= 5000),
  decided_on     date not null default current_date,
  superseded_by  uuid references public.decisions (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (superseded_by is null or superseded_by <> id)
);
create index decisions_project_idx on public.decisions (project_id, decided_on desc);

-- ───────────────────────────── reporting ─────────────────────────────
create table public.weekly_reports (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles (id) on delete cascade,
  week_start       date not null check (extract(isodow from week_start) = 1),
  stats            jsonb not null default '{}'::jsonb,
  highlights       text not null default '' check (char_length(highlights) <= 20000),
  student_note     text not null default '' check (char_length(student_note) <= 5000),
  submitted_at     timestamptz,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references public.profiles (id) on delete set null,
  share_enabled    boolean not null default false,
  share_token      uuid not null default gen_random_uuid() unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, week_start),
  check (acknowledged_at is null or submitted_at is not null),
  check (not share_enabled or submitted_at is not null)
);
