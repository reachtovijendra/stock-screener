-- Watchlist sharing persistence and row-level security.
-- Run this script in Supabase SQL Editor before enabling shared watchlists in production.

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol text not null,
  name text,
  market text not null default 'US' check (market in ('US', 'IN')),
  price_when_added numeric(18, 4) not null default 0,
  added_at timestamptz not null default now(),
  unique (watchlist_id, symbol, market)
);

alter table public.watchlists
  add column if not exists sort_order integer not null default 0;

create table if not exists public.watchlist_shares (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  shared_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (watchlist_id, shared_with_user_id),
  check (shared_with_user_id <> shared_by_user_id)
);

create index if not exists watchlists_user_sort_idx
  on public.watchlists (user_id, sort_order, created_at);

create index if not exists watchlist_items_watchlist_added_idx
  on public.watchlist_items (watchlist_id, added_at desc);

create index if not exists watchlist_shares_watchlist_idx
  on public.watchlist_shares (watchlist_id);

create index if not exists watchlist_shares_shared_user_idx
  on public.watchlist_shares (shared_with_user_id);

create index if not exists watchlist_shares_watchlist_role_idx
  on public.watchlist_shares (watchlist_id, role);

alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.watchlist_shares enable row level security;

drop policy if exists "Users can create own watchlists" on public.watchlists;
create policy "Users can create own watchlists"
  on public.watchlists
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can view own and shared watchlists" on public.watchlists;
create policy "Users can view own and shared watchlists"
  on public.watchlists
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.watchlist_shares s
      where s.watchlist_id = watchlists.id
        and s.shared_with_user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own watchlists" on public.watchlists;
create policy "Users can update own watchlists"
  on public.watchlists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own watchlists" on public.watchlists;
create policy "Users can delete own watchlists"
  on public.watchlists
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view own and shared watchlist items" on public.watchlist_items;
create policy "Users can view own and shared watchlist items"
  on public.watchlist_items
  for select
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.watchlist_shares s
      where s.watchlist_id = watchlist_items.watchlist_id
        and s.shared_with_user_id = auth.uid()
    )
  );

drop policy if exists "Owners and editors can add watchlist items" on public.watchlist_items;
create policy "Owners and editors can add watchlist items"
  on public.watchlist_items
  for insert
  with check (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.watchlist_shares s
      where s.watchlist_id = watchlist_items.watchlist_id
        and s.shared_with_user_id = auth.uid()
        and s.role = 'editor'
    )
  );

drop policy if exists "Owners and editors can update watchlist items" on public.watchlist_items;
create policy "Owners and editors can update watchlist items"
  on public.watchlist_items
  for update
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.watchlist_shares s
      where s.watchlist_id = watchlist_items.watchlist_id
        and s.shared_with_user_id = auth.uid()
        and s.role = 'editor'
    )
  )
  with check (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.watchlist_shares s
      where s.watchlist_id = watchlist_items.watchlist_id
        and s.shared_with_user_id = auth.uid()
        and s.role = 'editor'
    )
  );

drop policy if exists "Owners and editors can delete watchlist items" on public.watchlist_items;
create policy "Owners and editors can delete watchlist items"
  on public.watchlist_items
  for delete
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.watchlist_shares s
      where s.watchlist_id = watchlist_items.watchlist_id
        and s.shared_with_user_id = auth.uid()
        and s.role = 'editor'
    )
  );

drop policy if exists "Users can view relevant watchlist shares" on public.watchlist_shares;
create policy "Users can view relevant watchlist shares"
  on public.watchlist_shares
  for select
  using (
    shared_with_user_id = auth.uid()
    or shared_by_user_id = auth.uid()
  );

drop policy if exists "Owners can create watchlist shares" on public.watchlist_shares;
create policy "Owners can create watchlist shares"
  on public.watchlist_shares
  for insert
  with check (
    shared_by_user_id = auth.uid()
    and exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_shares.watchlist_id
        and w.user_id = auth.uid()
    )
  );

drop policy if exists "Owners can update watchlist shares" on public.watchlist_shares;
create policy "Owners can update watchlist shares"
  on public.watchlist_shares
  for update
  using (
    shared_by_user_id = auth.uid()
    and exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_shares.watchlist_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    shared_by_user_id = auth.uid()
    and exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_shares.watchlist_id
        and w.user_id = auth.uid()
    )
  );

drop policy if exists "Owners can delete watchlist shares" on public.watchlist_shares;
create policy "Owners can delete watchlist shares"
  on public.watchlist_shares
  for delete
  using (
    shared_by_user_id = auth.uid()
    and exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_shares.watchlist_id
        and w.user_id = auth.uid()
    )
  );
