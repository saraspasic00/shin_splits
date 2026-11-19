-- Requires training_plans and migration 004 (profile/plan versioning).
begin;

create table public.run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  session_id uuid not null,
  planned_session jsonb not null,
  status text not null check (status in ('completed', 'skipped')),
  completed_on date,
  actual_minutes integer,
  perceived_effort integer,
  note text not null default '' check (char_length(note) <= 1000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_id, plan_version, session_id),
  constraint run_log_snapshot check (
    jsonb_typeof(planned_session) = 'object'
    and (planned_session->>'kind' = 'run') is true
    and (planned_session->>'id' = session_id::text) is true
  ),
  constraint run_log_outcome check (
    (
      status = 'completed'
      and completed_on is not null and completed_on >= date '1900-01-01'
      and actual_minutes is not null and actual_minutes between 1 and 1440
      and (perceived_effort is null or perceived_effort between 1 and 10)
    ) or (
      status = 'skipped'
      and completed_on is null and actual_minutes is null and perceived_effort is null
    )
  )
);

create index run_logs_user_date_idx on public.run_logs(user_id, completed_on desc);
create index run_logs_plan_idx on public.run_logs(plan_id);

alter table public.run_logs enable row level security;
revoke all on public.run_logs from public, anon, authenticated;
grant select on public.run_logs to authenticated;
create policy "Read own run logs" on public.run_logs
  for select to authenticated using ((select auth.uid()) = user_id);

-- All writes pass through this function. It verifies the caller and derives
-- the planned-session snapshot from saved data, never from client JSON.
create function public.save_run_log(
  p_plan_id uuid,
  p_plan_version integer,
  p_session_id uuid,
  p_expected_revision integer,
  p_status text,
  p_completed_on date,
  p_actual_minutes integer,
  p_perceived_effort integer,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_plan jsonb;
  v_session jsonb;
  v_old public.run_logs%rowtype;
  v_saved public.run_logs%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
  v_has_old boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_plan_id is null or p_session_id is null
     or p_plan_version is null or p_plan_version < 1
     or p_expected_revision is null or p_expected_revision < 0
     or p_status is null or p_status not in ('completed', 'skipped')
     or char_length(v_note) > 1000
  then raise exception 'INVALID_LOG'; end if;

  if p_status = 'completed' then
    if p_completed_on is null or p_completed_on < date '1900-01-01'
       or p_completed_on > v_today
       or p_actual_minutes is null or p_actual_minutes not between 1 and 1440
       or (p_perceived_effort is not null and p_perceived_effort not between 1 and 10)
    then raise exception 'INVALID_LOG'; end if;
  elsif p_completed_on is not null or p_actual_minutes is not null or p_perceived_effort is not null then
    raise exception 'INVALID_LOG';
  end if;

  -- Same lock key as profile/plan saves; prevents a rewrite halfway through logging.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select plan into v_plan from public.training_plans
    where id = p_plan_id and user_id = v_user for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select * into v_old from public.run_logs
    where user_id = v_user and plan_id = p_plan_id
      and plan_version = p_plan_version and session_id = p_session_id for update;
  v_has_old := found;

  if v_has_old then
    -- Keep the original snapshot even if the plan has since been regenerated.
    v_session := v_old.planned_session;
  else
    if (v_plan->>'version')::integer is distinct from p_plan_version then
      raise exception 'PLAN_CHANGED';
    end if;
    select value into v_session from jsonb_array_elements(v_plan->'sessions')
      where value->>'id' = p_session_id::text and value->>'kind' = 'run';
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  end if;

  if p_status = 'skipped' and (v_session->>'date')::date > v_today then
    raise exception 'FUTURE_SKIP';
  end if;

  if v_has_old then
    -- Identical retries return the same record, even after a response was lost.
    if v_old.status = p_status
       and v_old.completed_on is not distinct from p_completed_on
       and v_old.actual_minutes is not distinct from p_actual_minutes
       and v_old.perceived_effort is not distinct from p_perceived_effort
       and v_old.note = v_note
    then return to_jsonb(v_old); end if;

    if v_old.revision <> p_expected_revision then raise exception 'LOG_CONFLICT'; end if;
    update public.run_logs set
      status = p_status, completed_on = p_completed_on,
      actual_minutes = p_actual_minutes, perceived_effort = p_perceived_effort,
      note = v_note, revision = revision + 1, updated_at = clock_timestamp()
    where id = v_old.id and user_id = v_user returning * into v_saved;
  else
    if p_expected_revision <> 0 then raise exception 'LOG_CONFLICT'; end if;
    insert into public.run_logs (
      user_id, plan_id, plan_version, session_id, planned_session,
      status, completed_on, actual_minutes, perceived_effort, note
    ) values (
      v_user, p_plan_id, p_plan_version, p_session_id, v_session,
      p_status, p_completed_on, p_actual_minutes, p_perceived_effort, v_note
    ) returning * into v_saved;
  end if;
  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.save_run_log(uuid,integer,uuid,integer,text,date,integer,integer,text)
  from public, anon, authenticated;
grant execute on function public.save_run_log(uuid,integer,uuid,integer,text,date,integer,integer,text)
  to authenticated;

commit;
