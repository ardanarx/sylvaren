-- Run in Supabase Dashboard > SQL Editor.
-- This table is ready for per-user cloud saves. Never use the service_role key in a browser app.
create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_saves enable row level security;

drop policy if exists "Players can read their own save" on public.game_saves;
create policy "Players can read their own save"
  on public.game_saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can insert their own save" on public.game_saves;
create policy "Players can insert their own save"
  on public.game_saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update their own save" on public.game_saves;
create policy "Players can update their own save"
  on public.game_saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists game_saves_updated_at_idx on public.game_saves (updated_at desc);
