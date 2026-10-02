create table if not exists public.berrex_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_name text not null default 'My BerreX Desk',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.berrex_workspaces enable row level security;

drop policy if exists "berrex workspace owner select" on public.berrex_workspaces;
create policy "berrex workspace owner select"
on public.berrex_workspaces for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "berrex workspace owner insert" on public.berrex_workspaces;
create policy "berrex workspace owner insert"
on public.berrex_workspaces for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "berrex workspace owner update" on public.berrex_workspaces;
create policy "berrex workspace owner update"
on public.berrex_workspaces for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.berrex_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  title text not null,
  bias text not null check (bias in ('Bullish','Bearish','Neutral')),
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.berrex_ideas enable row level security;

drop policy if exists "berrex ideas authenticated read" on public.berrex_ideas;
create policy "berrex ideas authenticated read"
on public.berrex_ideas for select
to authenticated
using (true);

drop policy if exists "berrex ideas owner insert" on public.berrex_ideas;
create policy "berrex ideas owner insert"
on public.berrex_ideas for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "berrex ideas owner update" on public.berrex_ideas;
create policy "berrex ideas owner update"
on public.berrex_ideas for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "berrex ideas owner delete" on public.berrex_ideas;
create policy "berrex ideas owner delete"
on public.berrex_ideas for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update on public.berrex_workspaces to authenticated;
grant select, insert, update, delete on public.berrex_ideas to authenticated;
