# ResearchFlow

**Accountability through deadlines and proof-based progress.** A project system for
research students and their professors: deadlines with owners, progress with
evidence, feedback that turns into tracked work, and a weekly report that writes
itself.

- Product, system and UX design (Phases 1–6 and 8): [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)
- Stack: Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui, Supabase (Postgres, Auth, Storage), Zod, Claude API (optional)

## What it enforces

The rules live in Postgres (RLS policies and triggers), so they hold for every
client, not just this UI:

| Rule | Where |
|---|---|
| Members see only their projects; anonymous visitors see only reports shared by link | RLS, `20261003000003_rls.sql` |
| Once a professor is on a project, only they can set or move professor deadlines | `tasks_enforce` trigger |
| A personal deadline can't be later than the professor's; pulling the professor's earlier clamps it | check constraint + trigger |
| Every deadline move is recorded | `tasks_audit_deadlines` trigger |
| Submitting or closing a task needs evidence (a linked log or attachment) and finished dependencies | `tasks_enforce` trigger |
| Only the professor approves or requests changes, and a change request needs a reason | trigger + `review_task()` RPC |
| Logs can't be backdated more than 2 days or edited after that, and are never deleted | RLS |
| Evidence on a task under review or done can't be removed | RLS |
| Submitted weekly reports are frozen; drafts are private to the student | trigger + RLS |
| No dependency cycles | trigger (recursive CTE) |

All of it is tested against a real Postgres (PGlite): `npm run test:db`.

## Run it locally

Requires Node 20.9+.

1. **Install:** `npm install`
2. **Create a Supabase project** at [supabase.com](https://supabase.com). The free tier is fine.
3. **Apply the schema.** Either paste each file in `supabase/migrations/` into the
   SQL editor, in filename order, or with the Supabase CLI:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
4. **Configure:** `cp .env.example .env.local`, then fill in `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project settings → API).
5. **Auth settings:** in Authentication → URL configuration, add
   `http://localhost:3000/auth/confirm` to the redirect URLs. Email confirmation can
   stay on (users confirm through `/auth/confirm`) or be turned off for local testing.
6. **Optional demo data:** set `SUPABASE_SECRET_KEY` in `.env.local` and run
   `npm run seed`. It creates a professor and two students mid-project (password
   `researchflow-demo`). Development projects only: the secret key bypasses RLS.
7. **Start:** `npm run dev` and open http://localhost:3000.

To enable **AI remark splitting** (Phase 8.1), set `ANTHROPIC_API_KEY`. Without it,
the feature is hidden and manual remark → task conversion still works.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:unit` | Domain logic (dates, deadlines, next action, risk, weekly report, analytics) |
| `npm run test:db` | Migrations + RLS + triggers + RPCs, run as real users on PGlite |
| `npm test` | Both |
| `npm run seed` | Demo data into your Supabase project |
| `npm run db:types` | Regenerate `src/types/database.ts` from a linked project (`SUPABASE_PROJECT_ID`) |

## Layout

```
docs/PRODUCT_SPEC.md       product, system, UX, MVP, architecture, AI plan
supabase/migrations/       schema → helpers & triggers → RLS → RPCs → storage
supabase/tests/            PGlite harness + rule tests
scripts/seed.ts            demo data
src/proxy.ts               session refresh + sign-in redirect (Next 16's middleware)
src/app/(auth)/            login, signup
src/app/(app)/             dashboard, projects/[id]/{tasks,timeline,logs,remarks,files,blockers,decisions},
                           tasks/[id], log, calendar, reports, students/[id], settings
src/app/r/[token]/         public shared weekly report
src/app/api/files/[id]/    access-checked, short-lived download links
src/lib/domain/            pure logic + tests (no I/O)
src/lib/data/              server-side queries (RLS-scoped)
src/server/actions/        Server Actions (auth re-check → Zod → write)
src/lib/ai/                Claude-powered remark splitting
src/components/            UI (shadcn primitives in components/ui)
```

## Keyboard

`⌘K`/`Ctrl K` palette · `g` then `d`/`p`/`l`/`c`/`r`/`s` to navigate · `n` new log ·
`c` new task (project tasks page) · `Enter` opens the Next Action · `←`/`→` change
calendar month · `?` all shortcuts.
