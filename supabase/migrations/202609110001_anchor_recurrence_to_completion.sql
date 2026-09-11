-- Always calculate the next recurring occurrence from the actual completion date.
-- The p_current argument remains in the signature for backwards compatibility.

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

-- Re-align already-generated pending occurrences with the same rule.
with recalculated as (
  select
    instance.id,
    public.next_scheduled_date(
      instance.scheduled_date,
      completion.completed_at,
      household.timezone,
      template.recurrence_rule
    ) as scheduled_date
  from public.task_instances as instance
  join public.completion_records as completion
    on completion.id = instance.generated_from_completion_id
   and completion.is_voided = false
  join public.task_templates as template
    on template.id = instance.template_id
   and template.type = 'recurring'
  join public.households as household on household.id = instance.household_id
  where instance.status = 'pending'
)
update public.task_instances as instance
set scheduled_date = recalculated.scheduled_date
from recalculated
where instance.id = recalculated.id
  and instance.scheduled_date is distinct from recalculated.scheduled_date;

grant execute on function public.next_scheduled_date(date, timestamptz, text, jsonb) to authenticated;
