begin;

create function public.validate_starter_week(p_profile jsonb, p_plan jsonb, p_week date, p_policy_version text)
returns void language plpgsql immutable set search_path = '' as $$
declare
  v_day jsonb;
  v_index integer := 0;
  v_minutes integer := 0;
  v_runs integer := 0;
  v_duration integer;
  v_weekdays text[] := array['mon','tue','wed','thu','fri','sat','sun'];
  v_week date := p_week;
  v_run_cap integer := (p_profile->>'currentRunsPerWeek')::integer;
  v_session_cap integer := (p_profile->>'longestRecentRunMinutes')::integer;
  v_week_cap integer := (p_profile->>'currentWeeklyMinutes')::integer;
begin
  if p_policy_version is distinct from 'starter-v1' and
     (p_policy_version is distinct from 'consistency-v1' or p_profile->>'experience' is distinct from 'regular'
      or p_profile->>'goal' is distinct from 'consistency' or v_run_cap = 0)
  then raise exception 'INVALID_POLICY'; end if;
  if v_week_cap > v_run_cap * v_session_cap then raise exception 'INVALID_BASELINE'; end if;
  if v_run_cap = 0 then
    v_run_cap := 2;
    v_session_cap := 15;
    v_week_cap := v_run_cap * v_session_cap;
  end if;
  if p_plan->>'source' is distinct from 'baseline' or jsonb_typeof(p_plan->'sessions') is distinct from 'array'
     or jsonb_array_length(p_plan->'sessions') <> 7
     or (select count(distinct value->>'id') from jsonb_array_elements(p_plan->'sessions')) <> 7
  then raise exception 'INVALID_PLAN'; end if;
  for v_day in select value from jsonb_array_elements(p_plan->'sessions') loop
    if (v_day->>'date')::date is distinct from v_week + v_index
       or nullif(v_day->>'title', '') is null
       or (v_day->>'id')::uuid is null
    then raise exception 'INVALID_SESSION'; end if;
    if v_day->>'kind' = 'run' then
      v_duration := (v_day->>'durationMinutes')::integer;
      if v_duration is null or v_duration < 1
         or v_duration > (p_profile->>'maxSessionMinutes')::integer
         or v_duration > v_session_cap
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

  if v_runs < 1 or v_runs > v_run_cap or v_minutes > v_week_cap
  then raise exception 'INVALID_BASELINE'; end if;
end;
$$;

create or replace function public.save_profile_and_next_plan(
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
  v_profile_only boolean;
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

  select exists(select 1 from public.training_plans where user_id = v_user and week_start < v_next_week)
    into v_profile_only;
  if jsonb_typeof(p_profile) is distinct from 'object'
     or (p_profile->>'currentWeeklyMinutes')::int >
        (p_profile->>'currentRunsPerWeek')::int * (p_profile->>'longestRecentRunMinutes')::int
  then raise exception 'INVALID_INPUT'; end if;

  if v_profile_only then
    select * into strict v_old from public.training_plans where user_id = v_user
      order by week_start desc limit 1;
    v_id := v_old.id;
    v_version := (v_old.plan->>'version')::integer;
    v_week := v_old.week_start;
  else
    if p_plan is null or p_notes is null then raise exception 'PLAN_CONFLICT'; end if;
    v_week := (p_plan->>'weekStart')::date;
    if v_week is distinct from v_next_week then raise exception 'WEEK_CHANGED'; end if;
    perform public.validate_starter_week(p_profile, p_plan, v_week, p_policy_version);
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
  end if;

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

  if not v_profile_only and v_old.id is not null then
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
  elsif not v_profile_only then
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


create or replace function public.ensure_runner_week(p_user uuid, p_row jsonb, p_profile jsonb, p_plan jsonb, p_notes text[], p_policy_version text)
returns text language plpgsql security invoker set search_path='' as $$
declare
  v_week date := date_trunc('week',now() at time zone 'Europe/Amsterdam')::date + 7;
  v_current jsonb;
begin
  if current_user <> 'service_role' and auth.uid() is distinct from p_user then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  if (p_plan->>'weekStart')::date is distinct from v_week then raise exception 'WEEK_CHANGED'; end if;
  if exists(select 1 from public.training_plans where user_id=p_user and week_start=v_week) then return 'existing'; end if;
  if exists(select 1 from public.training_plans where user_id=p_user and week_start < v_week) then return 'later-week'; end if;
  select to_jsonb(r) into v_current from public.runner_profiles r where user_id=p_user;
  if v_current is null or v_current is distinct from p_row then raise exception 'PROFILE_CHANGED'; end if;
  if jsonb_strip_nulls(p_profile) is distinct from jsonb_strip_nulls(jsonb_build_object(
      'experience',v_current->'experience','goal',v_current->'goal','raceDate',v_current->'race_date',
      'currentRunsPerWeek',v_current->'current_runs_per_week','currentWeeklyMinutes',v_current->'current_weekly_minutes',
      'longestRecentRunMinutes',v_current->'longest_recent_run_minutes','availableDays',v_current->'available_days',
      'maxSessionMinutes',v_current->'max_session_minutes')) then raise exception 'INVALID_PROFILE'; end if;
  if (p_plan->>'version')::int is distinct from 1 or p_notes is null then raise exception 'INVALID_PLAN'; end if;
  perform public.validate_starter_week(p_profile, p_plan, v_week, p_policy_version);

  insert into public.training_plans(id,user_id,week_start,plan,notes,policy_version,profile_snapshot)
  values((p_plan->>'id')::uuid,p_user,v_week,p_plan,p_notes,p_policy_version,p_profile)
  on conflict(user_id,week_start) do nothing;
  if found then return 'created'; end if;
  return 'existing';
end; $$;

commit;
