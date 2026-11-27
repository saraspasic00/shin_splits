begin;

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
  if exists(select 1 from public.training_plans where user_id=p_user and week_start < v_week) then
    if p_policy_version is distinct from 'follow-up-v1' then return 'later-week'; end if;
  elsif p_policy_version = 'follow-up-v1' then
    raise exception 'INVALID_POLICY';
  end if;
  select to_jsonb(r) into v_current from public.runner_profiles r where user_id=p_user;
  if v_current is null or v_current is distinct from p_row then raise exception 'PROFILE_CHANGED'; end if;
  if jsonb_strip_nulls(p_profile) is distinct from jsonb_strip_nulls(jsonb_build_object(
      'experience',v_current->'experience','goal',v_current->'goal','raceDate',v_current->'race_date',
      'currentRunsPerWeek',v_current->'current_runs_per_week','currentWeeklyMinutes',v_current->'current_weekly_minutes',
      'longestRecentRunMinutes',v_current->'longest_recent_run_minutes','availableDays',v_current->'available_days',
      'maxSessionMinutes',v_current->'max_session_minutes')) then raise exception 'INVALID_PROFILE'; end if;
  if (p_plan->>'version')::int is distinct from 1 or p_notes is null then raise exception 'INVALID_PLAN'; end if;
  -- Follow-up weeks use the same validated caps, days, and easy effort.
  perform public.validate_starter_week(p_profile, p_plan, v_week,
    case when p_policy_version = 'follow-up-v1' then 'starter-v1' else p_policy_version end);

  insert into public.training_plans(id,user_id,week_start,plan,notes,policy_version,profile_snapshot)
  values((p_plan->>'id')::uuid,p_user,v_week,p_plan,p_notes,p_policy_version,p_profile)
  on conflict(user_id,week_start) do nothing;
  if found then return 'created'; end if;
  return 'existing';
end; $$;

commit;
