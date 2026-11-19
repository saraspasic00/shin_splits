begin;

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id) on delete cascade,

  date date not null,

  energy text not null
    check (energy in ('low', 'okay', 'good')),

  sleep text not null
    check (sleep in ('poor', 'okay', 'good')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint check_ins_user_date_unique unique (user_id, date)
);

alter table public.check_ins enable row level security;

-- Explicitly restrict access through the public API roles.
revoke all on table public.check_ins from anon, authenticated;

grant select, insert, update, delete
  on table public.check_ins
  to authenticated;

create policy "Users can read their own check-ins"
  on public.check_ins
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own check-ins"
  on public.check_ins
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own check-ins"
  on public.check_ins
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own check-ins"
  on public.check_ins
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.set_check_in_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger check_ins_set_updated_at
  before update on public.check_ins
  for each row
  execute function public.set_check_in_updated_at();

commit;