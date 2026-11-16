-- Mu'tamad Hub — run this in Supabase → SQL Editor → New query → Run
-- Safe to run more than once.
--
-- BEFORE RUNNING: create your login in Supabase → Authentication → Users → "Add user"
-- (tick "Auto Confirm User"). Then put that same email in STEP 4 below.

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

-- 3) OWNER COLUMN — every row belongs to the signed-in user who created it
alter table public.links add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid();
alter table public.notes add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid();
create index if not exists links_user_idx on public.links (user_id);
create index if not exists notes_user_idx on public.notes (user_id);

-- 4) CLAIM EXISTING ROWS — gives any links/notes you saved before sign-in to your account.
--    >>> Replace the email below with the one you created in Authentication → Users. <<<
update public.links set user_id = (select id from auth.users where email = 'Samarchughtai07@gmail.com')
  where user_id is null;
update public.notes set user_id = (select id from auth.users where email = 'Samarchughtai07@gmail.com')
  where user_id is null;

-- 5) ROW LEVEL SECURITY — only the signed-in owner can see or change their rows.
--    The anon key alone can no longer read or write anything.
alter table public.links enable row level security;
alter table public.notes enable row level security;

drop policy if exists "anon full access links" on public.links;
drop policy if exists "anon full access notes" on public.notes;
drop policy if exists "owner access links" on public.links;
drop policy if exists "owner access notes" on public.notes;

create policy "owner access links"
  on public.links for all
  to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner access notes"
  on public.notes for all
  to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ALSO: in Supabase → Authentication → Sign In / Providers, turn OFF
-- "Allow new users to sign up" so nobody else can create an account.
