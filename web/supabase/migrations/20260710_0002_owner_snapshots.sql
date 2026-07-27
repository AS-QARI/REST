-- Offline-first cloud mirror for REST's single owner application state.
-- The normalized core schema remains available for future granular queries;
-- this row keeps v1 reliable while offline mutations are batched client-side.

create table if not exists public.owner_snapshots (
  owner_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.owner_snapshots enable row level security;

create policy "owner snapshot private" on public.owner_snapshots
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create trigger owner_snapshot_updated_at
  before update on public.owner_snapshots
  for each row execute function public.set_updated_at();
