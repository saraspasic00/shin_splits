-- Run AFTER migration 005 in a development Supabase project SQL editor.
-- Creates fresh synthetic accounts/plans and rolls EVERYTHING back.
-- This needs the SQL editor's administrative role; never run as a browser client.
begin;

create temporary table run_log_fixture (
  user_a uuid, user_b uuid, plan_a uuid, plan_b uuid, session_a uuid, rest_a uuid
);
insert into run_log_fixture values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
);
grant select on run_log_fixture to authenticated;

insert into auth.users(id, email)
  select user_a, 'run-log-a-' || user_a || '@example.test' from run_log_fixture
  union all
  select user_b, 'run-log-b-' || user_b || '@example.test' from run_log_fixture;

do $$
declare
  f record;
  w date := date_trunc('week', now() at time zone 'Europe/Amsterdam')::date - 7;
  sessions jsonb;
begin
  select * into f from run_log_fixture;
  select jsonb_agg(
    case when d = 0 then jsonb_build_object(
      'id', f.session_a, 'date', w, 'kind', 'run', 'title', 'Easy run',
      'durationMinutes', 32, 'effort', 'easy'
    ) else jsonb_build_object(
      'id', case when d = 1 then f.rest_a else gen_random_uuid() end,
      'date', w + d, 'kind', 'rest', 'title', 'Rest day'
    ) end order by d
  ) into sessions from generate_series(0,6) d;

  insert into public.training_plans(id, user_id, week_start, plan, notes, policy_version, profile_snapshot)
  values (
    f.plan_a, f.user_a, w,
    jsonb_build_object('id', f.plan_a, 'version', 1, 'weekStart', w, 'source', 'baseline', 'sessions', sessions),
    array[]::text[], 'consistency-v1', '{}'::jsonb
  ), (
    f.plan_b, f.user_b, w,
    jsonb_build_object('id', f.plan_b, 'version', 1, 'weekStart', w, 'source', 'baseline', 'sessions', sessions),
    array[]::text[], 'consistency-v1', '{}'::jsonb
  );
end;
$$;

select set_config('request.jwt.claim.sub', user_a::text, true) from run_log_fixture;
select set_config('request.jwt.claims', jsonb_build_object('sub',user_a,'role','authenticated')::text, true) from run_log_fixture;
set local role authenticated;

do $$
declare
  f record;
  today date := (now() at time zone 'Europe/Amsterdam')::date;
  saved jsonb;
  replay jsonb;
begin
  select * into f from run_log_fixture;
  saved := public.save_run_log(f.plan_a,1,f.session_a,0,'completed',today,32,5,'Test log');
  if saved->>'revision' <> '1' then raise exception 'FAILED: first save'; end if;
  replay := public.save_run_log(f.plan_a,1,f.session_a,0,'completed',today,32,5,'Test log');
  if replay is distinct from saved then raise exception 'FAILED: retry changed record'; end if;
  if (select count(*) from public.run_logs) <> 1 then raise exception 'FAILED: duplicate log'; end if;

  begin
    perform public.save_run_log(f.plan_a,1,f.session_a,0,'completed',today,33,5,'Changed');
    raise exception 'FAILED: stale update allowed';
  exception when others then
    if sqlerrm <> 'LOG_CONFLICT' then raise; end if;
  end;
  begin
    perform public.save_run_log(f.plan_a,1,f.session_a,1,'completed',today+1,32,5,'Future');
    raise exception 'FAILED: future activity allowed';
  exception when others then
    if sqlerrm <> 'INVALID_LOG' then raise; end if;
  end;
  begin
    perform public.save_run_log(f.plan_a,1,f.session_a,1,'completed',today,0,5,'Zero');
    raise exception 'FAILED: zero duration allowed';
  exception when others then
    if sqlerrm <> 'INVALID_LOG' then raise; end if;
  end;
  begin
    perform public.save_run_log(f.plan_a,1,f.session_a,1,'skipped',null,32,null,'Invalid skip');
    raise exception 'FAILED: skipped minutes allowed';
  exception when others then
    if sqlerrm <> 'INVALID_LOG' then raise; end if;
  end;
  begin
    perform public.save_run_log(f.plan_a,1,f.rest_a,0,'completed',today,32,5,'Rest');
    raise exception 'FAILED: rest session logged as run';
  exception when others then
    if sqlerrm <> 'SESSION_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.save_run_log(f.plan_b,1,f.session_a,0,'completed',today,32,5,'Other user');
    raise exception 'FAILED: other account plan writable';
  exception when others then
    if sqlerrm <> 'SESSION_NOT_FOUND' then raise; end if;
  end;
  begin
    update public.run_logs set actual_minutes = 99;
    raise exception 'FAILED: direct table update allowed';
  exception when insufficient_privilege then null;
  end;

  saved := public.save_run_log(f.plan_a,1,f.session_a,1,'skipped',null,null,null,'Skipped');
  if saved->>'revision' <> '2' or saved->'actual_minutes' <> 'null'::jsonb then
    raise exception 'FAILED: skipped outcome';
  end if;
end;
$$;

reset role;
-- Simulate a later plan revision. The original log snapshot must survive.
update public.training_plans set plan = jsonb_set(jsonb_set(plan,'{version}','2'),'{sessions,0,durationMinutes}','45')
  where id = (select plan_a from run_log_fixture);
set local role authenticated;
do $$
declare f record; saved jsonb;
begin
  select * into f from run_log_fixture;
  saved := public.save_run_log(f.plan_a,1,f.session_a,2,'completed',
    (now() at time zone 'Europe/Amsterdam')::date,34,null,'Corrected');
  if saved->>'revision' <> '3' or saved->'planned_session'->>'durationMinutes' <> '32' then
    raise exception 'FAILED: original snapshot lost';
  end if;
  begin
    perform public.save_run_log(f.plan_a,1,f.rest_a,0,'completed',
      (now() at time zone 'Europe/Amsterdam')::date,32,5,'Stale plan');
    raise exception 'FAILED: obsolete plan accepted for a new log';
  exception when others then
    if sqlerrm <> 'PLAN_CHANGED' then raise; end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', user_b::text, true) from run_log_fixture;
select set_config('request.jwt.claims', jsonb_build_object('sub',user_b,'role','authenticated')::text, true) from run_log_fixture;
set local role authenticated;
do $$
begin
  if exists (select 1 from public.run_logs) then raise exception 'FAILED: another account can read logs'; end if;
end;
$$;
reset role;

do $$
begin
  if has_table_privilege('anon','public.run_logs','SELECT') then raise exception 'FAILED: anonymous reads'; end if;
  if has_function_privilege('anon','public.save_run_log(uuid,integer,uuid,integer,text,date,integer,integer,text)','EXECUTE') then
    raise exception 'FAILED: anonymous writes';
  end if;
end;
$$;

rollback;
select 'PASS: save, retry, conflict, validation, snapshot retention, and account isolation. All fixtures rolled back.' as result;
