-- Onboarding and product-tour progress, one small record per account, so a
-- phone and a laptop agree on what has been shown. Written only by its owner
-- (the existing "profiles: update own" policy).

alter table public.profiles
  add column onboarding jsonb not null default '{}'::jsonb
  constraint profiles_onboarding_small check (octet_length(onboarding::text) <= 4096);

-- Accounts that existed before onboarding shipped skip the welcome flow; the
-- tour stays one click away under Help.
update public.profiles set onboarding = '{"setup":"skipped","legacy":true}'::jsonb;
