-- Run once in Supabase → SQL Editor. Creates the single table Organization 360 uses to share its demo data.
create table if not exists public.org360_state (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.org360_state enable row level security;

-- Demo only: anyone holding the publishable key can read and write the shared demo state.
-- Replace with authenticated-user policies before storing real data.
drop policy if exists "org360 read"   on public.org360_state;
drop policy if exists "org360 insert" on public.org360_state;
drop policy if exists "org360 update" on public.org360_state;
create policy "org360 read"   on public.org360_state for select to anon using (true);
create policy "org360 insert" on public.org360_state for insert to anon with check (id = 'main');
create policy "org360 update" on public.org360_state for update to anon using (id = 'main') with check (id = 'main');
