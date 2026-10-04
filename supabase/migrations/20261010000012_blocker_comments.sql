-- Replies on a blocker: the professor asks "still stuck?", the student answers,
-- without anyone having to mark it resolved. A record, like remarks: posted
-- replies can't be edited, only deleted by their author.

create table public.blocker_comments (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.blockers (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);
create index blocker_comments_blocker_idx on public.blocker_comments (blocker_id, created_at);

create function public.blocker_project(p_blocker uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select project_id from public.blockers where id = p_blocker;
$$;

alter table public.blocker_comments enable row level security;

create policy "blocker_comments: members read"
  on public.blocker_comments for select to authenticated
  using (public.is_project_member(public.blocker_project(blocker_id)));

create policy "blocker_comments: members reply"
  on public.blocker_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_project_member(public.blocker_project(blocker_id)));

create policy "blocker_comments: author deletes"
  on public.blocker_comments for delete to authenticated
  using (author_id = (select auth.uid()));

grant select, insert, delete on public.blocker_comments to authenticated;
grant all on public.blocker_comments to service_role;
