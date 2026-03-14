-- =============================================================================
-- Move estimated_value from admin-set (at mint) to user-set (at intake)
-- =============================================================================

-- 1. Add estimated_value to items so users can self-estimate at intake time
alter table public.items add column estimated_value numeric;

-- 2. Replace mint_woo: drop the p_estimated_value parameter, read from item instead
drop function if exists public.mint_woo(uuid, numeric);

create or replace function public.mint_woo(p_item_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_item record;
  v_woo_id uuid;
begin
  select * into v_item
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Item not found';
  end if;

  if v_item.status <> 'verified' then
    raise exception 'Item must be in verified status to mint a Woo (current: %)', v_item.status;
  end if;

  if not v_item.verified then
    raise exception 'Item has not been verified by warehouse staff';
  end if;

  if exists (select 1 from public.woos where item_id = p_item_id) then
    raise exception 'A Woo already exists for this item';
  end if;

  insert into public.woos (item_id, owner_id, title, description, images, category, estimated_value, status)
  values (
    p_item_id,
    v_item.owner_id,
    v_item.name,
    v_item.description,
    v_item.photos,
    coalesce(v_item.category, 'other'),
    v_item.estimated_value,
    'active'
  )
  returning id into v_woo_id;

  update public.items set status = 'stored' where id = p_item_id;

  update public.warehouses
  set current_count = current_count + 1
  where id = v_item.warehouse_id;

  return v_woo_id;
end;
$$;
