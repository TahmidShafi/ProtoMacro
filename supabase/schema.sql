-- ============================================================
-- ProtoMacro — Supabase schema
-- Run this in your Supabase project: SQL Editor → paste → Run.
-- One row per user holding the full normalized state document.
-- Row Level Security ensures users can ONLY touch their own row.
-- The anon key is safe in the browser; NEVER expose service-role.
-- ============================================================

create table if not exists public.protomacro_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.protomacro_state enable row level security;

drop policy if exists "Users can view own state" on public.protomacro_state;
create policy "Users can view own state"
  on public.protomacro_state
  for select
  using (auth.uid () = user_id);

drop policy if exists "Users can insert own state" on public.protomacro_state;
create policy "Users can insert own state"
  on public.protomacro_state
  for insert
  with check (auth.uid () = user_id);

drop policy if exists "Users can update own state" on public.protomacro_state;
create policy "Users can update own state"
  on public.protomacro_state
  for update
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

drop policy if exists "Users can delete own state" on public.protomacro_state;
create policy "Users can delete own state"
  on public.protomacro_state
  for delete
  using (auth.uid () = user_id);
