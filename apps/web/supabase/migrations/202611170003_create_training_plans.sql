begin;

create table public.training_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  plan jsonb not null,
  notes text[] not null default '{}',
  policy_version text not null,
  profile_snapshot jsonb not null,
  created_at timestamptz not null default now(),

  unique (user_id, week_start),

  check (extract(isodow from week_start) = 1),
  check (jsonb_typeof(plan) = 'object'),
  check (jsonb_typeof(profile_snapshot) = 'object'),
  check ((plan ->> 'id') is not distinct from id::text),
  check ((plan ->> 'weekStart') is not distinct from week_start::text)
);

alter table public.training_plans enable row level security;

revoke all on public.training_plans from anon, authenticated;
grant select, insert on public.training_plans to authenticated;

create policy "Read own training plans"
on public.training_plans
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Create own training plans"
on public.training_plans
for insert to authenticated
with check ((select auth.uid()) = user_id);

commit;