begin;

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
  v_has_history boolean;
  active_week public.training_plans%rowtype;
  today date := (now() at time zone 'Europe/Amsterdam')::date;
  active_version integer;
  locked_ids uuid[];
  remaining_runs integer;
  remaining_minutes integer;
  old_day jsonb;
  new_day jsonb;
  duration integer;
  revised_sessions jsonb := '[]'::jsonb;
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
    into v_has_history;
  if jsonb_typeof(p_profile) is distinct from 'object'
     or (p_profile->>'currentWeeklyMinutes')::int >
        (p_profile->>'currentRunsPerWeek')::int * (p_profile->>'longestRecentRunMinutes')::int
  then raise exception 'INVALID_INPUT'; end if;

  if p_plan is null or p_notes is null then raise exception 'PLAN_CONFLICT'; end if;
  v_week := (p_plan->>'weekStart')::date;
  if v_week is distinct from v_next_week then raise exception 'WEEK_CHANGED'; end if;
  if v_has_history is distinct from (p_policy_version = 'follow-up-v1') then
    raise exception 'PLAN_CONFLICT';
  end if;
  perform public.validate_starter_week(p_profile, p_plan, v_week,
    case when v_has_history then 'starter-v1' else p_policy_version end);
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

  -- Both weeks and the save receipt share the per-runner lock and transaction.
  select * into active_week from public.training_plans
    where user_id = v_user and week_start = v_next_week - 7 for update;
  if found then
    active_version := (active_week.plan->>'version')::integer;
    select coalesce(array_agg(session_id), '{}'::uuid[]) into locked_ids
      from public.run_logs where user_id = v_user and plan_id = active_week.id
        and plan_version = active_version;

    -- Reserve the original minutes of past or logged runs before allocating any new ones.
    select count(*), coalesce(sum((value->>'durationMinutes')::integer), 0)
      into remaining_runs, remaining_minutes from jsonb_array_elements(p_plan->'sessions')
      where value->>'kind' = 'run';
    for old_day in select value from jsonb_array_elements(active_week.plan->'sessions') loop
      if old_day->>'kind' = 'run' and ((old_day->>'date')::date < today
          or (old_day->>'id')::uuid = any(locked_ids)) then
        remaining_runs := remaining_runs - 1;
        remaining_minutes := remaining_minutes - (old_day->>'durationMinutes')::integer;
      end if;
    end loop;

    for i in 0..6 loop
      old_day := active_week.plan->'sessions'->i;
      new_day := old_day;
      if (old_day->>'date')::date >= today and not ((old_day->>'id')::uuid = any(locked_ids)) then
        new_day := (p_plan->'sessions'->i) || jsonb_build_object('date', old_day->>'date', 'id', old_day->>'id');
        if new_day->>'kind' = 'run' then
          if remaining_runs > 0 and remaining_minutes > 0 then
            duration := least(remaining_minutes, (new_day->>'durationMinutes')::integer);
            new_day := new_day || jsonb_build_object('durationMinutes', duration);
            remaining_minutes := remaining_minutes - duration;
            remaining_runs := remaining_runs - 1;
          else
            new_day := jsonb_build_object('date', old_day->>'date', 'id', old_day->>'id',
                                          'kind', 'rest', 'title', 'Rest day');
          end if;
        end if;
      end if;
      revised_sessions := revised_sessions || jsonb_build_array(new_day);
    end loop;

    if revised_sessions is distinct from active_week.plan->'sessions'
        or active_week.profile_snapshot is distinct from p_profile then
      insert into public.training_plan_versions(plan_id, plan_version, user_id, week_start,
        plan, notes, policy_version, profile_snapshot)
        values(active_week.id, active_version, v_user, active_week.week_start,
          active_week.plan, active_week.notes, active_week.policy_version, active_week.profile_snapshot);
      update public.training_plans set plan = active_week.plan || jsonb_build_object(
        'version', active_version + 1, 'sessions', revised_sessions),
        profile_snapshot = p_profile, policy_version = 'current-week-edit-v1',
        notes = array['Your updated profile applies from today. Earlier days and logged sessions keep their original schedule.']
        where id = active_week.id and user_id = v_user;
      -- The calendar reads logs by plan version. Move each live log once, keeping its snapshot and ID.
      update public.run_logs set plan_version = active_version + 1
        where user_id = v_user and plan_id = active_week.id and plan_version = active_version;
      active_version := active_version + 1;
    end if;
    v_week := active_week.week_start;
    v_id := active_week.id;
    v_version := active_version;
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


commit;

