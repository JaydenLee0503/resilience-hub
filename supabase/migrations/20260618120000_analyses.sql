-- Resilience Hub — Phase 2 schema
--
-- `analyses` stores the structured crisis plan (CLAUDE.md §10) for each user.
-- We store the re-hydrated plan (the owner's own data), NOT the raw document —
-- per CLAUDE.md §9.7 ("prefer storing the structured plan over the raw file").
--
-- Every row is owned by exactly one user and protected by Row Level Security:
-- a user can only ever read/write/delete their own rows (CLAUDE.md §9.4).

create extension if not exists "pgcrypto";

create table if not exists public.analyses (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  source        text,                       -- e.g. "USCIS notice.pdf", "Gmail reader"
  pipeline_type text        not null,        -- immigration | medical | ... | common
  urgency       text,                        -- low | medium | high | critical
  analysis      jsonb       not null,        -- the full canonical §10 object
  created_at    timestamptz not null default now()
);

create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.analyses enable row level security;

create policy "analyses_select_own"
  on public.analyses for select
  using (auth.uid() = user_id);

create policy "analyses_insert_own"
  on public.analyses for insert
  with check (auth.uid() = user_id);

create policy "analyses_update_own"
  on public.analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "analyses_delete_own"
  on public.analyses for delete
  using (auth.uid() = user_id);
