-- Home Together · Supabase/Postgres schema
-- Run this file once in the Supabase SQL editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '家庭成员' check (char_length(display_name) between 1 and 40),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  timezone text not null default 'America/Chicago',
  week_start smallint not null default 1 check (week_start in (0, 1)),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('recurring', 'one_off')),
  one_off_timing text check (one_off_timing in ('week', 'deadline')),
  title text not null check (char_length(title) between 1 and 80),
  category text not null default 'home',
  description text,
  assignee_mode text not null default 'unassigned' check (assignee_mode in ('member', 'shared', 'unassigned')),
  assignee_profile_id uuid references public.profiles(id),
  recurrence_rule jsonb,
  active boolean not null default true,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rule_required check (
    (type = 'recurring' and recurrence_rule is not null)
    or (type = 'one_off' and recurrence_rule is null)
  ),
  constraint one_off_timing_required check (
    (type = 'recurring' and one_off_timing is null)
    or (type = 'one_off' and one_off_timing in ('week', 'deadline'))
  )
);

create table if not exists public.task_instances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  template_id uuid not null references public.task_templates(id) on delete restrict,
  scheduled_date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  assignee_profile_id uuid references public.profiles(id),
  generated_from_completion_id uuid,
  skipped_at timestamptz,
  skipped_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, scheduled_date)
);

create table if not exists public.completion_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  instance_id uuid not null references public.task_instances(id) on delete restrict,
  completed_by uuid not null references public.profiles(id),
  completed_at timestamptz not null default now(),
  note text check (char_length(note) <= 500),
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.household_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('family', 'environment', 'finance', 'maintenance', 'milestone')),
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text check (description is null or char_length(description) <= 1000),
  occurred_at timestamptz not null,
  amount numeric(12, 2) check (amount is null or amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_instances
  drop constraint if exists task_instances_generated_from_completion_id_fkey;
alter table public.task_instances
  add constraint task_instances_generated_from_completion_id_fkey
  foreign key (generated_from_completion_id) references public.completion_records(id) on delete set null;

create unique index if not exists completion_records_one_active_per_instance
  on public.completion_records(instance_id) where is_voided = false;

create table if not exists public.task_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  template_id uuid references public.task_templates(id) on delete cascade,
  instance_id uuid references public.task_instances(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint note_target_required check (template_id is not null or instance_id is not null)
);

-- A profile can create or join exactly one household. The unique index also
-- protects against concurrent create/join requests that pass application checks.
create unique index if not exists household_members_one_household_per_profile
  on public.household_members(profile_id);
create index if not exists task_templates_household_idx on public.task_templates(household_id);
create index if not exists task_instances_household_date_idx on public.task_instances(household_id, scheduled_date);
create index if not exists completion_records_household_idx on public.completion_records(household_id, completed_at desc);
create index if not exists task_notes_household_idx on public.task_notes(household_id);
create index if not exists household_events_household_occurred_idx on public.household_events(household_id, occurred_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
drop trigger if exists households_touch_updated_at on public.households;
create trigger households_touch_updated_at before update on public.households
for each row execute function public.touch_updated_at();
drop trigger if exists task_templates_touch_updated_at on public.task_templates;
create trigger task_templates_touch_updated_at before update on public.task_templates
for each row execute function public.touch_updated_at();
drop trigger if exists task_instances_touch_updated_at on public.task_instances;
create trigger task_instances_touch_updated_at before update on public.task_instances
for each row execute function public.touch_updated_at();
drop trigger if exists household_events_touch_updated_at on public.household_events;
create trigger household_events_touch_updated_at before update on public.household_events
for each row execute function public.touch_updated_at();
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, '家庭成员'), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id
      and hm.profile_id = (select auth.uid())
  );
$$;

create or replace function public.shares_household(p_profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs using (household_id)
    where mine.profile_id = (select auth.uid())
      and theirs.profile_id = p_profile_id
  );
$$;

create or replace function public.create_household(p_name text, p_timezone text default 'America/Chicago')
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  new_household_id uuid;
  existing_household_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;

  select household_id into existing_household_id
  from public.household_members
  where profile_id = (select auth.uid());

  if existing_household_id is not null then
    raise exception '每个账号只能属于一个家庭，你已经加入了一个家庭';
  end if;

  insert into public.households (name, timezone, created_by)
  values (trim(p_name), coalesce(nullif(p_timezone, ''), 'America/Chicago'), (select auth.uid()))
  returning id into new_household_id;

  begin
    insert into public.household_members (household_id, profile_id, role)
    values (new_household_id, (select auth.uid()), 'owner');
  exception when unique_violation then
    raise exception '每个账号只能属于一个家庭，你已经加入了一个家庭';
  end;
  return new_household_id;
end;
$$;

create or replace function public.create_household_invite(p_household_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  new_code text;
begin
  if not public.is_household_member(p_household_id) then raise exception 'Access denied'; end if;

  loop
    new_code := upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.household_invites (household_id, code, created_by)
      values (p_household_id, new_code, (select auth.uid()));
      exit;
    exception when unique_violation then
      -- An eight-character code collision is unlikely; generate another code.
      null;
    end;
  end loop;

  return new_code;
end;
$$;

create or replace function public.join_household_by_invite(p_code text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  matched public.household_invites%rowtype;
  existing_household_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;

  select household_id into existing_household_id
  from public.household_members
  where profile_id = (select auth.uid());

  if existing_household_id is not null then
    raise exception '每个账号只能属于一个家庭，你已经加入了一个家庭';
  end if;

  select * into matched
  from public.household_invites
  where code = upper(trim(p_code))
    and accepted_at is null
    and expires_at > now()
  for update;

  if matched.id is null then raise exception '邀请码无效或已过期'; end if;
  begin
    insert into public.household_members (household_id, profile_id, role)
    values (matched.household_id, (select auth.uid()), 'member');
  exception when unique_violation then
    raise exception '每个账号只能属于一个家庭，你已经加入了一个家庭';
  end;
  update public.household_invites
  set accepted_by = (select auth.uid()), accepted_at = now()
  where id = matched.id;
  return matched.household_id;
end;
$$;

create or replace function public.next_scheduled_date(
  p_current date,
  p_completed_at timestamptz,
  p_timezone text,
  p_rule jsonb
)
returns date
language plpgsql
immutable
as $$
declare
  anchor_date date;
  interval_count integer := greatest(coalesce((p_rule ->> 'interval')::integer, 1), 1);
begin
  anchor_date := (p_completed_at at time zone p_timezone)::date;
  case p_rule ->> 'kind'
    when 'daily' then return anchor_date + interval_count;
    when 'weekly' then return anchor_date + (interval_count * 7);
    when 'monthly' then return (anchor_date + make_interval(months => interval_count))::date;
    when 'interval_days' then return anchor_date + interval_count;
    else return anchor_date + 7;
  end case;
end;
$$;

create or replace function public.complete_task(p_instance_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  instance_row public.task_instances%rowtype;
  template_row public.task_templates%rowtype;
  household_timezone text;
  completion_id uuid;
  next_date date;
begin
  select * into instance_row from public.task_instances where id = p_instance_id for update;
  if instance_row.id is null or not public.is_household_member(instance_row.household_id) then
    raise exception 'Access denied';
  end if;
  if instance_row.status = 'completed' then return null; end if;

  select * into template_row from public.task_templates where id = instance_row.template_id;
  select timezone into household_timezone from public.households where id = instance_row.household_id;

  insert into public.completion_records (household_id, instance_id, completed_by, note)
  values (instance_row.household_id, instance_row.id, (select auth.uid()), nullif(trim(p_note), ''))
  returning id into completion_id;

  update public.task_instances set status = 'completed' where id = instance_row.id;

  if template_row.type = 'recurring' and template_row.active then
    next_date := public.next_scheduled_date(
      instance_row.scheduled_date,
      now(),
      household_timezone,
      template_row.recurrence_rule
    );
    insert into public.task_instances (
      household_id, template_id, scheduled_date, assignee_profile_id, generated_from_completion_id
    ) values (
      instance_row.household_id, instance_row.template_id, next_date,
      template_row.assignee_profile_id, completion_id
    ) on conflict (template_id, scheduled_date) do nothing;
  end if;
  return completion_id;
end;
$$;

create or replace function public.undo_task_completion(p_instance_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  instance_row public.task_instances%rowtype;
  completion_id uuid;
begin
  select * into instance_row from public.task_instances where id = p_instance_id for update;
  if instance_row.id is null or not public.is_household_member(instance_row.household_id) then
    raise exception 'Access denied';
  end if;

  select id into completion_id from public.completion_records
  where instance_id = p_instance_id and is_voided = false
  order by completed_at desc limit 1 for update;

  if completion_id is not null then
    delete from public.task_instances
    where generated_from_completion_id = completion_id and status = 'pending';
    update public.completion_records
    set is_voided = true, voided_at = now(), voided_by = (select auth.uid())
    where id = completion_id;
  end if;
  update public.task_instances set status = 'pending' where id = p_instance_id;
end;
$$;

create or replace function public.update_household_task(
  p_instance_id uuid,
  p_title text,
  p_type text,
  p_one_off_timing text,
  p_assignee_mode text,
  p_assignee_profile_id uuid,
  p_scheduled_date date,
  p_recurrence_rule jsonb,
  p_completed_at timestamptz
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  instance_row public.task_instances%rowtype;
  template_row public.task_templates%rowtype;
  completion_row public.completion_records%rowtype;
  household_timezone text;
  next_date date;
begin
  select * into instance_row
  from public.task_instances
  where id = p_instance_id
  for update;

  if instance_row.id is null or not public.is_household_member(instance_row.household_id) then
    raise exception 'Access denied';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 80 then
    raise exception '事项名称需要 1 到 80 个字符';
  end if;
  if p_type is null or p_type not in ('recurring', 'one_off') then
    raise exception '无效的事项类型';
  end if;
  if p_assignee_mode is null or p_assignee_mode not in ('member', 'shared', 'unassigned') then
    raise exception '无效的负责人类型';
  end if;
  if p_scheduled_date is null then
    raise exception '请选择计划日期';
  end if;
  if p_type = 'recurring' and p_recurrence_rule is null then
    raise exception '周期家务需要重复规则';
  end if;
  if p_type = 'one_off' and (p_one_off_timing is null or p_one_off_timing not in ('week', 'deadline')) then
    raise exception '一次性家务必须选择按周完成或截止日期';
  end if;
  if instance_row.status = 'completed' and p_completed_at is null then
    raise exception '已完成家务需要实际完成时间';
  end if;
  if p_completed_at is not null and p_completed_at > now() + interval '5 minutes' then
    raise exception '完成时间不能晚于当前时间';
  end if;

  if p_assignee_mode = 'member' then
    if p_assignee_profile_id is null or not exists (
      select 1 from public.household_members
      where household_id = instance_row.household_id
        and profile_id = p_assignee_profile_id
    ) then
      raise exception '负责人不属于这个家庭';
    end if;
  else
    p_assignee_profile_id := null;
  end if;

  update public.task_templates
  set title = trim(p_title),
      type = p_type,
      one_off_timing = case when p_type = 'one_off' then p_one_off_timing else null end,
      assignee_mode = p_assignee_mode,
      assignee_profile_id = p_assignee_profile_id,
      recurrence_rule = case when p_type = 'recurring' then p_recurrence_rule else null end
  where id = instance_row.template_id;

  update public.task_instances
  set assignee_profile_id = p_assignee_profile_id
  where template_id = instance_row.template_id
    and status = 'pending';

  update public.task_instances
  set scheduled_date = p_scheduled_date,
      assignee_profile_id = p_assignee_profile_id
  where id = instance_row.id;

  if p_type = 'one_off' then
    delete from public.task_instances
    where template_id = instance_row.template_id
      and id <> instance_row.id
      and status = 'pending';
  end if;

  if instance_row.status = 'completed' then
    select * into completion_row
    from public.completion_records
    where instance_id = instance_row.id and is_voided = false
    order by completed_at desc
    limit 1
    for update;

    if completion_row.id is null then
      raise exception '找不到有效的完成记录';
    end if;

    update public.completion_records
    set completed_at = p_completed_at
    where id = completion_row.id;

    select * into template_row
    from public.task_templates
    where id = instance_row.template_id;

    if template_row.type = 'recurring' and template_row.active then
      select timezone into household_timezone
      from public.households
      where id = instance_row.household_id;

      next_date := public.next_scheduled_date(
        p_scheduled_date,
        p_completed_at,
        household_timezone,
        template_row.recurrence_rule
      );

      update public.task_instances
      set scheduled_date = next_date
      where generated_from_completion_id = completion_row.id
        and status = 'pending';
    end if;
  end if;
end;
$$;

create or replace function public.delete_household_task(p_instance_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  instance_row public.task_instances%rowtype;
begin
  select * into instance_row
  from public.task_instances
  where id = p_instance_id
  for update;

  if instance_row.id is null or not public.is_household_member(instance_row.household_id) then
    raise exception 'Access denied';
  end if;

  delete from public.task_notes
  where template_id = instance_row.template_id
     or instance_id in (
       select id from public.task_instances where template_id = instance_row.template_id
     );
  delete from public.completion_records
  where instance_id in (
    select id from public.task_instances where template_id = instance_row.template_id
  );
  delete from public.task_instances where template_id = instance_row.template_id;
  delete from public.task_templates where id = instance_row.template_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_instances enable row level security;
alter table public.completion_records enable row level security;
alter table public.task_notes enable row level security;
alter table public.household_events enable row level security;

drop policy if exists "Profiles visible within shared households" on public.profiles;
create policy "Profiles visible within shared households" on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.shares_household(id));
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "Members read households" on public.households;
create policy "Members read households" on public.households for select to authenticated
using (public.is_household_member(id));
drop policy if exists "Members update households" on public.households;
create policy "Members update households" on public.households for update to authenticated
using (public.is_household_member(id)) with check (public.is_household_member(id));

drop policy if exists "Members read household members" on public.household_members;
create policy "Members read household members" on public.household_members for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members manage invites" on public.household_invites;
create policy "Members manage invites" on public.household_invites for all to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

drop policy if exists "Members manage task templates" on public.task_templates;
create policy "Members manage task templates" on public.task_templates for all to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "Members manage task instances" on public.task_instances;
create policy "Members manage task instances" on public.task_instances for all to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "Members manage completions" on public.completion_records;
create policy "Members manage completions" on public.completion_records for all to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "Members manage task notes" on public.task_notes;
create policy "Members manage task notes" on public.task_notes for all to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

drop policy if exists "Members manage household events" on public.household_events;
create policy "Members manage household events" on public.household_events for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id) and created_by = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.join_household_by_invite(text) to authenticated;
grant execute on function public.complete_task(uuid, text) to authenticated;
grant execute on function public.undo_task_completion(uuid) to authenticated;
grant execute on function public.update_household_task(uuid, text, text, text, text, uuid, date, jsonb, timestamptz) to authenticated;
grant execute on function public.delete_household_task(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.task_instances;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.completion_records;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.household_events;
exception when duplicate_object then null;
end $$;
