-- Manual paper trading persistence.
-- Run this script in Supabase SQL Editor before enabling the manual page in production.

create table if not exists public.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null check (market in ('US', 'IN')),
  starting_cash numeric(18, 4) not null,
  cash_balance numeric(18, 4) not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, market)
);

create table if not exists public.paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null check (market in ('US', 'IN')),
  symbol text not null,
  name text,
  quantity numeric(18, 6) not null check (quantity > 0),
  average_cost numeric(18, 4) not null check (average_cost > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, market, symbol)
);

create table if not exists public.paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null check (market in ('US', 'IN')),
  symbol text not null,
  name text,
  action text not null check (action in ('BUY', 'SELL')),
  quantity numeric(18, 6) not null check (quantity > 0),
  execution_price numeric(18, 4) not null check (execution_price > 0),
  realized_pnl numeric(18, 4),
  realized_pnl_percent numeric(10, 4),
  executed_at timestamptz not null default now()
);

create index if not exists paper_positions_user_market_idx
  on public.paper_positions (user_id, market);

create index if not exists paper_trades_user_market_executed_idx
  on public.paper_trades (user_id, market, executed_at desc);

alter table public.paper_accounts enable row level security;
alter table public.paper_positions enable row level security;
alter table public.paper_trades enable row level security;

drop policy if exists "Users manage own paper accounts" on public.paper_accounts;
create policy "Users manage own paper accounts"
  on public.paper_accounts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own paper positions" on public.paper_positions;
create policy "Users manage own paper positions"
  on public.paper_positions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own paper trades" on public.paper_trades;
create policy "Users manage own paper trades"
  on public.paper_trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
