-- =============================================================================
-- Swipe filters: add condition to woos, update mint_woo, rewrite get_swipe_feed
-- with optional filters and value-based ordering.
-- =============================================================================

-- 1. Add condition column to woos
alter table public.woos add column condition text default 'good'
  check (condition in ('new', 'like_new', 'good', 'fair', 'poor'));

-- 2. Backfill condition from items
update public.woos set condition = i.condition
from public.items i where public.woos.item_id = i.id;

-- 3. Update mint_woo to copy condition from the item
drop function if exists public.mint_woo(uuid);

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

  insert into public.woos (item_id, owner_id, title, description, images, category, estimated_value, condition, status)
  values (
    p_item_id,
    v_item.owner_id,
    v_item.name,
    v_item.description,
    v_item.photos,
    coalesce(v_item.category, 'other'),
    v_item.estimated_value,
    coalesce(v_item.condition, 'good'),
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

-- 4. Rewrite get_swipe_feed with optional filters and value-based ordering
create or replace function public.get_swipe_feed(
  p_user_id uuid,
  p_swiper_woo_id uuid,
  p_limit integer default 20,
  p_category text default null,
  p_condition text default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_name_search text default null,
  p_swiper_value numeric default null
)
returns table (
  id uuid,
  item_id uuid,
  owner_id uuid,
  title text,
  description text,
  images text[],
  category text,
  estimated_value numeric,
  trade_count integer,
  status text,
  condition text,
  created_at timestamptz,
  updated_at timestamptz,
  owner_username text,
  owner_avatar_url text,
  owner_is_agent boolean
)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
    select
      w.id,
      w.item_id,
      w.owner_id,
      w.title,
      w.description,
      w.images,
      w.category,
      w.estimated_value,
      w.trade_count,
      w.status,
      w.condition,
      w.created_at,
      w.updated_at,
      p.username as owner_username,
      p.avatar_url as owner_avatar_url,
      p.is_agent as owner_is_agent
    from public.woos w
    join public.profiles p on p.id = w.owner_id
    where w.owner_id != p_user_id
      and w.status = 'active'
      and w.id not in (
        select s.target_woo_id
        from public.swipes s
        where s.swiper_woo_id = p_swiper_woo_id
      )
      and (p_category is null or w.category = p_category)
      and (p_condition is null or w.condition = p_condition)
      and (p_min_value is null or w.estimated_value >= p_min_value)
      and (p_max_value is null or w.estimated_value <= p_max_value)
      and (p_name_search is null or w.title ilike '%' || p_name_search || '%')
    order by
      abs(coalesce(w.estimated_value, 0) - coalesce(p_swiper_value, 0)),
      random()
    limit p_limit;
end;
$$;
