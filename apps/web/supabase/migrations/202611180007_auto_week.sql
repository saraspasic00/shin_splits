begin;
create function public.ensure_runner_week(p_user uuid, p_row jsonb, p_profile jsonb, p_plan jsonb, p_notes text[], p_policy_version text)
returns text language plpgsql security invoker set search_path='' as $$
declare
  v_week date := date_trunc('week',now() at time zone 'Europe/Amsterdam')::date + 7;
  v_day jsonb;
  v_index integer := 0;
  v_minutes integer := 0;
  v_runs integer := 0;
  v_duration integer;
  v_weekdays text[] := array['mon','tue','wed','thu','fri','sat','sun'];
  v_current jsonb;
begin
  if current_user <> 'service_role' and auth.uid() is distinct from p_user then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  if (p_plan->>'weekStart')::date is distinct from v_week then raise exception 'WEEK_CHANGED'; end if;
  if exists(select 1 from public.training_plans where user_id=p_user and week_start=v_week) then return 'existing'; end if;
  select to_jsonb(r) into v_current from public.runner_profiles r where user_id=p_user;
  if v_current is null or v_current is distinct from p_row then raise exception 'PROFILE_CHANGED'; end if;
  if p_profile->>'experience' is distinct from 'regular' or p_profile->>'goal' is distinct from 'consistency'
    or jsonb_strip_nulls(p_profile) is distinct from jsonb_strip_nulls(jsonb_build_object(
      'experience',v_current->'experience','goal',v_current->'goal','raceDate',v_current->'race_date',
      'currentRunsPerWeek',v_current->'current_runs_per_week','currentWeeklyMinutes',v_current->'current_weekly_minutes',
      'longestRecentRunMinutes',v_current->'longest_recent_run_minutes','availableDays',v_current->'available_days',
      'maxSessionMinutes',v_current->'max_session_minutes')) then raise exception 'INVALID_PROFILE'; end if;
  if p_plan->>'source' is distinct from 'baseline' or (p_plan->>'version')::int is distinct from 1
    or p_policy_version is distinct from 'consistency-v1' or p_notes is null
    or jsonb_array_length(p_plan->'sessions') is distinct from 7
    or (select count(distinct value->>'id') from jsonb_array_elements(p_plan->'sessions')) <> 7
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

  insert into public.training_plans(id,user_id,week_start,plan,notes,policy_version,profile_snapshot)
  values((p_plan->>'id')::uuid,p_user,v_week,p_plan,p_notes,p_policy_version,p_profile)
  on conflict(user_id,week_start) do nothing;
  if found then return 'created'; end if;
  return 'existing';
end; $$;
revoke all on function public.ensure_runner_week(uuid,jsonb,jsonb,jsonb,text[],text) from public,anon;
grant execute on function public.ensure_runner_week(uuid,jsonb,jsonb,jsonb,text[],text) to authenticated,service_role;
commit;
