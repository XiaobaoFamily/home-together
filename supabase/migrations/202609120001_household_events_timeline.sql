-- Add household events for the shared family timeline.

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

create index if not exists household_events_household_occurred_idx
  on public.household_events(household_id, occurred_at desc);

drop trigger if exists household_events_touch_updated_at on public.household_events;
create trigger household_events_touch_updated_at
before update on public.household_events
for each row execute function public.touch_updated_at();

alter table public.household_events enable row level security;

drop policy if exists "Members manage household events" on public.household_events;
create policy "Members manage household events"
on public.household_events
for all
to authenticated
using (public.is_household_member(household_id))
with check (
  public.is_household_member(household_id)
  and created_by = (select auth.uid())
);

grant select, insert, update, delete on public.household_events to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.household_events;
exception when duplicate_object then null;
end $$;
