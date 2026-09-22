-- Remove the retired shopping-list feature.
-- Applying this migration permanently deletes all shopping lists and items.

drop trigger if exists households_seed_default_shopping_lists on public.households;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime drop table public.shopping_items;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_lists'
  ) then
    alter publication supabase_realtime drop table public.shopping_lists;
  end if;
end;
$$;

drop function if exists public.seed_default_shopping_lists();
drop table if exists public.shopping_items;
drop table if exists public.shopping_lists;
