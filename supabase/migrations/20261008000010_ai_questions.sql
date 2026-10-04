-- The AI assistant's daily allowance: one row per question asked, so the
-- server can count a person's last 24 hours. Only the asker can see or add
-- their own rows; nothing else is stored (no question text, no answers).

create table public.ai_questions (
  id        bigint generated always as identity primary key,
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  asked_at  timestamptz not null default now()
);

create index ai_questions_user_time on public.ai_questions (user_id, asked_at desc);

alter table public.ai_questions enable row level security;

create policy "ai_questions: own read"
  on public.ai_questions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "ai_questions: own add"
  on public.ai_questions for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.ai_questions to authenticated;
grant all on public.ai_questions to service_role;
