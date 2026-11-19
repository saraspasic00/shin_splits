-- Requires the existing runner_profiles and training_plans migrations.
begin;

create table public.training_plan_versions (
  plan_id uuid not null,
  plan_version integer not null check (plan_version > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  plan jsonb not null,
  notes text[] not null,
  policy_version text not null,
  profile_snapshot jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (plan_id, plan_version)
);

create table public.profile_plan_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  profile jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.training_plan_versions enable row level security;
alter table public.profile_plan_saves enable row level security;
revoke all on public.training_plan_versions, public.profile_plan_saves from anon, authenticated;
grant select on public.training_plan_versions, public.profile_plan_saves to authenticated;

create policy "Read own plan versions" on public.training_plan_versions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own profile plan receipts" on public.profile_plan_saves
  for select to authenticated using ((select auth.uid()) = user_id);

-- The function owns writes to the archive/receipts. No browser update grant
-- is added to training_plans. Its owner must remain a trusted DB role.
create function public.save_profile_and_next_plan(
  p_profile jsonb,
  p_plan jsonb,
  p_notes text[],
  p_policy_version text,
  p_request_id uuid,
  p_expected_plan_id uuid,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_week date;
  v_next_week date := date_trunc('week', now() at time zone 'Europe/Amsterdam')::date + 7;
  v_old public.training_plans%rowtype;
  v_receipt public.profile_plan_saves%rowtype;
  v_id uuid;
  v_version integer;
  v_result jsonb;
  v_day jsonb;
  v_index integer := 0;
  v_minutes integer := 0;
  v_runs integer := 0;
  v_duration integer;
  v_weekdays text[] := array['mon','tue','wed','thu','fri','sat','sun'];
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'INVALID_REQUEST'; end if;

  -- Serialize saves for this user, including the case where no plan exists.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select * into v_receipt from public.profile_plan_saves
    where user_id = v_user and request_id = p_request_id;
  if found then
    if v_receipt.profile is distinct from p_profile then raise exception 'REQUEST_REUSED'; end if;
    return v_receipt.receipt;
  end if;

  if jsonb_typeof(p_profile) is distinct from 'object'
     or jsonb_typeof(p_plan) is distinct from 'object'
     or jsonb_typeof(p_plan->'sessions') is distinct from 'array'
     or p_notes is null or p_policy_version is distinct from 'consistency-v1'
     or p_plan->>'source' is distinct from 'baseline'
     or p_profile->>'experience' is distinct from 'regular'
     or p_profile->>'goal' is distinct from 'consistency'
  then raise exception 'INVALID_INPUT'; end if;

  v_week := (p_plan->>'weekStart')::date;
  if v_week is distinct from v_next_week then raise exception 'WEEK_CHANGED'; end if;
  if jsonb_array_length(p_plan->'sessions') <> 7 then raise exception 'INVALID_PLAN'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_plan->'sessions')) <> 7
  then raise exception 'INVALID_SESSION'; end if;

  select * into v_old from public.training_plans
    where user_id = v_user and week_start = v_week for update;
  if found then
    if v_old.id is distinct from p_expected_plan_id
       or (v_old.plan->>'version')::integer is distinct from p_expected_version
    then raise exception 'PLAN_CONFLICT'; end if;
    v_id := v_old.id;
    v_version := p_expected_version + 1;
  else
    if p_expected_plan_id is not null or p_expected_version is not null
    then raise exception 'PLAN_CONFLICT'; end if;
    v_id := (p_plan->>'id')::uuid;
    v_version := 1;
  end if;

  if v_id is null
     or (p_plan->>'id')::uuid is distinct from v_id
     or (p_plan->>'version')::integer is distinct from v_version
  then raise exception 'INVALID_PLAN'; end if;

  -- Validate essential plan constraints even for callers invoking RPC directly.
  for v_day in select value from jsonb_array_elements(p_plan->'sessions') loop
    if (v_day->>'date')::date is distinct from v_week + v_index
       or nullif(v_day->>'title', '') is null
       or (v_day->>'id')::uuid is null
    then raise exception 'INVALID_SESSION'; end if;
    if v_day->>'kind' = 'run' then
      v_duration := (v_day->>'durationMinutes')::integer;
      if v_duration is null or v_duration < 1
         or v_duration > (p_profile->>'maxSessionMinutes')::integer
         or v_duration > (p_profile->>'longestRecentRunMinutes')::integer
         or v_day->>'effort' is distinct from 'easy'
         or not coalesce((p_profile->'availableDays') ? v_weekdays[v_index + 1], false)
      then raise exception 'INVALID_SESSION'; end if;
      v_minutes := v_minutes + v_duration;
      v_runs := v_runs + 1;
    elsif v_day->>'kind' is distinct from 'rest' then
      raise exception 'INVALID_SESSION';
    end if;
    v_index := v_index + 1;
  end loop;

  if v_runs < 1 or v_runs > (p_profile->>'currentRunsPerWeek')::integer
     or v_minutes > (p_profile->>'currentWeeklyMinutes')::integer
     or (p_profile->>'currentWeeklyMinutes')::integer >
        (p_profile->>'currentRunsPerWeek')::integer * (p_profile->>'longestRecentRunMinutes')::integer
  then raise exception 'INVALID_BASELINE'; end if;

  -- Existing runner_profiles constraints validate ranges and required fields.
  insert into public.runner_profiles (
    user_id, experience, goal, race_date, current_runs_per_week,
    current_weekly_minutes, longest_recent_run_minutes, available_days, max_session_minutes
  ) values (
    v_user, p_profile->>'experience', p_profile->>'goal',
    (p_profile->>'raceDate')::date,
    (p_profile->>'currentRunsPerWeek')::integer,
    (p_profile->>'currentWeeklyMinutes')::integer,
    (p_profile->>'longestRecentRunMinutes')::integer,
    array(select jsonb_array_elements_text(p_profile->'availableDays')),
    (p_profile->>'maxSessionMinutes')::integer
  ) on conflict (user_id) do update set
    experience = excluded.experience, goal = excluded.goal, race_date = excluded.race_date,
    current_runs_per_week = excluded.current_runs_per_week,
    current_weekly_minutes = excluded.current_weekly_minutes,
    longest_recent_run_minutes = excluded.longest_recent_run_minutes,
    available_days = excluded.available_days, max_session_minutes = excluded.max_session_minutes;

  if v_old.id is not null then
    insert into public.training_plan_versions (
      plan_id, plan_version, user_id, week_start, plan, notes, policy_version, profile_snapshot
    ) values (
      v_old.id, (v_old.plan->>'version')::integer, v_user, v_week,
      v_old.plan, v_old.notes, v_old.policy_version, v_old.profile_snapshot
    );
    update public.training_plans set
      plan = p_plan, notes = p_notes, policy_version = p_policy_version,
      profile_snapshot = p_profile
    where id = v_id and user_id = v_user;
  else
    insert into public.training_plans (
      id, user_id, week_start, plan, notes, policy_version, profile_snapshot
    ) values (v_id, v_user, v_week, p_plan, p_notes, p_policy_version, p_profile);
  end if;

  v_result := jsonb_build_object(
    'status', 'saved', 'profile', p_profile,
    'planId', v_id, 'planVersion', v_version, 'weekStart', v_week, 'redirectTo', '/plan'
  );
  insert into public.profile_plan_saves(user_id, request_id, profile, receipt)
    values (v_user, p_request_id, p_profile, v_result);
  return v_result;
end;
$$;

revoke all on function public.save_profile_and_next_plan(jsonb,jsonb,text[],text,uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.save_profile_and_next_plan(jsonb,jsonb,text[],text,uuid,uuid,integer)
  to authenticated;

commit;
