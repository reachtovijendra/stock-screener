-- FIRE goals persistence.
-- Run this script in Supabase SQL Editor before enabling the FIRE Goals page in production.

create table if not exists public.fire_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My FIRE Plan',
  current_age integer not null check (current_age >= 0 and current_age <= 120),
  target_retirement_age integer not null check (target_retirement_age >= 0 and target_retirement_age <= 120),
  fire_amount numeric(18, 4) not null check (fire_amount >= 0),
  expected_annual_return numeric(8, 4) not null default 7,
  inflation_rate numeric(8, 4) not null default 3,
  annual_income numeric(18, 4) not null default 0 check (annual_income >= 0),
  tax_rate numeric(8, 4) not null default 20 check (tax_rate >= 0 and tax_rate <= 100),
  annual_spending numeric(18, 4) not null default 0 check (annual_spending >= 0),
  preferred_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.fire_goals
  add column if not exists tax_rate numeric(8, 4) not null default 20 check (tax_rate >= 0 and tax_rate <= 100);

create table if not exists public.fire_assets (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.fire_goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('cash', 'brokerage', 'retirement', 'real_estate', 'business', 'other')),
  current_value numeric(18, 4) not null default 0 check (current_value >= 0),
  annual_growth_rate numeric(8, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fire_liabilities (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.fire_goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('mortgage', 'student_loan', 'auto', 'credit_card', 'personal', 'other')),
  balance numeric(18, 4) not null default 0 check (balance >= 0),
  interest_rate numeric(8, 4) not null default 0,
  monthly_payment numeric(18, 4) not null default 0 check (monthly_payment >= 0),
  payoff_months integer check (payoff_months is null or payoff_months >= 0),
  payoff_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fire_goals_user_idx
  on public.fire_goals (user_id, updated_at desc);

create index if not exists fire_assets_goal_user_idx
  on public.fire_assets (goal_id, user_id);

create index if not exists fire_assets_user_idx
  on public.fire_assets (user_id);

create index if not exists fire_liabilities_goal_user_idx
  on public.fire_liabilities (goal_id, user_id);

create index if not exists fire_liabilities_user_idx
  on public.fire_liabilities (user_id);

alter table public.fire_goals enable row level security;
alter table public.fire_assets enable row level security;
alter table public.fire_liabilities enable row level security;

drop policy if exists "Users manage own FIRE goals" on public.fire_goals;
create policy "Users manage own FIRE goals"
  on public.fire_goals
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own FIRE assets" on public.fire_assets;
create policy "Users manage own FIRE assets"
  on public.fire_assets
  for all
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.fire_goals g
      where g.id = fire_assets.goal_id
        and g.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.fire_goals g
      where g.id = fire_assets.goal_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users manage own FIRE liabilities" on public.fire_liabilities;
create policy "Users manage own FIRE liabilities"
  on public.fire_liabilities
  for all
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.fire_goals g
      where g.id = fire_liabilities.goal_id
        and g.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.fire_goals g
      where g.id = fire_liabilities.goal_id
        and g.user_id = (select auth.uid())
    )
  );
