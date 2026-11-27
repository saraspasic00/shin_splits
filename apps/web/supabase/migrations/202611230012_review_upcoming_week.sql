begin;

alter table public.training_plans
  add column if not exists review_key text,
  add column if not exists review_version integer;

create or replace function public.review_upcoming_week(
  p_user uuid, p_id uuid, p_version integer, p_previous_key text,
  p_key text, p_minutes jsonb, p_notes text[]
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  saved public.training_plans%rowtype;
  target date := date_trunc('week',now() at time zone 'Europe/Amsterdam')::date + 7;
  sessions jsonb := '[]'::jsonb;
  item jsonb;
  minutes integer;
  updated_plan jsonb;
  outcome text := 'existing';
  version_after integer := p_version;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into saved from public.training_plans
    where id = p_id and user_id = p_user and week_start = target for update;
  -- A concurrent profile edit or another review has already won this write.
  if not found or (saved.plan->>'version')::integer is distinct from p_version
      or saved.review_key is distinct from p_previous_key
      or (saved.review_version = p_version and saved.review_key = p_key)
    then return outcome; end if;

  for item in select value from jsonb_array_elements(saved.plan->'sessions') loop
    if item->>'kind' = 'run' and not exists (
      select 1 from public.run_logs where user_id = p_user and plan_id = p_id
        and plan_version = p_version and session_id = (item->>'id')::uuid
    ) then
      minutes := (p_minutes->>(item->>'date'))::integer;
      if minutes is null or minutes < 1 then raise exception 'INVALID_REVIEW_DURATION'; end if;
      item := item || jsonb_build_object('durationMinutes', minutes);
    end if;
    sessions := sessions || jsonb_build_array(item);
  end loop;

  if sessions is distinct from saved.plan->'sessions' then
    version_after := p_version + 1;
    updated_plan := saved.plan || jsonb_build_object('sessions', sessions, 'version', version_after);
    perform public.validate_starter_week(saved.profile_snapshot, updated_plan, target, 'starter-v1');
    insert into public.training_plan_versions
      (plan_id,plan_version,user_id,week_start,plan,notes,policy_version,profile_snapshot)
      values (p_id,p_version,p_user,target,saved.plan,saved.notes,saved.policy_version,saved.profile_snapshot);
    update public.training_plans set plan = updated_plan, notes = p_notes, policy_version = 'follow-up-v1'
      where id = p_id;
    update public.run_logs set plan_version = version_after
      where plan_id = p_id and user_id = p_user and plan_version = p_version;
    outcome := 'updated';
  end if;

  update public.training_plans set review_key = p_key, review_version = version_after where id = p_id;
  return outcome;
end;
$$;
revoke all on function public.review_upcoming_week(uuid,uuid,integer,text,text,jsonb,text[])
  from public, anon, authenticated;
grant execute on function public.review_upcoming_week(uuid,uuid,integer,text,text,jsonb,text[])
  to service_role;
commit;
