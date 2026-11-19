begin;

create table public.runner_profiles (
  user_id uuid primary key
    references auth.users(id) on delete cascade,

  experience text not null
    check (experience in ('starting', 'returning', 'regular')),

  goal text not null
    check (goal in ('start-running', 'consistency', '5k', '10k')),

  race_date date,

  current_runs_per_week integer not null
    check (current_runs_per_week between 0 and 7),

  current_weekly_minutes integer not null
    check (current_weekly_minutes between 0 and 10080),

  longest_recent_run_minutes integer not null
    check (longest_recent_run_minutes between 0 and 1440),

  available_days text[] not null
    check (
      cardinality(available_days) between 1 and 7
      and available_days <@ array[
        'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'
      ]::text[]
      and array_position(available_days, null) is null
    ),

  max_session_minutes integer not null
    check (max_session_minutes between 1 and 1440),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (longest_recent_run_minutes <= current_weekly_minutes),

  check (
    (
      current_runs_per_week = 0
      and current_weekly_minutes = 0
      and longest_recent_run_minutes = 0
    )
    or
    (
      current_runs_per_week > 0
      and current_weekly_minutes > 0
      and longest_recent_run_minutes > 0
    )
  ),

  check (race_date is null or goal in ('5k', '10k'))
);

alter table public.runner_profiles enable row level security;

revoke all on public.runner_profiles from anon, authenticated;

grant select, insert, update, delete
  on public.runner_profiles to authenticated;

create policy "Read own runner profile"
  on public.runner_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Create own runner profile"
  on public.runner_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Update own runner profile"
  on public.runner_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own runner profile"
  on public.runner_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create function public.set_runner_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger runner_profiles_updated_at
  before update on public.runner_profiles
  for each row
  execute function public.set_runner_profile_updated_at();

commit;