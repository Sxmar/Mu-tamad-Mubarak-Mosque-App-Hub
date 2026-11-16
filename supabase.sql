-- Mu'tamad Hub — run this once in Supabase → SQL Editor → New query → Run

-- 1) LINKS
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  subtitle    text,
  badge       text,
  url         text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 2) NOTES
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  title        text not null,
  time         time,
  department   text,
  description  text,
  extra_notes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notes_date_idx on public.notes (date);
create index if not exists notes_department_idx on public.notes (department);

-- 3) ROW LEVEL SECURITY (enabled, with open policies for the anon key so the app works immediately)
alter table public.links enable row level security;
alter table public.notes enable row level security;

drop policy if exists "anon full access links" on public.links;
create policy "anon full access links"
  on public.links for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon full access notes" on public.notes;
create policy "anon full access notes"
  on public.notes for all
  to anon, authenticated
  using (true) with check (true);

-- NOTE: anyone who has your Project URL + anon key can read/write these tables.
-- The key is stored only in your phone's localStorage (never in the GitHub repo),
-- so keep it private. For stricter security, add Supabase Auth later and change
-- the policies to "using (auth.uid() = <owner column>)".
