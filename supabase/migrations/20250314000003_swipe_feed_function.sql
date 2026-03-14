-- =============================================================================
-- get_swipe_feed: returns swipeable Woos for a given swiper Woo
-- =============================================================================

create or replace function public.get_swipe_feed(
  p_user_id uuid,
  p_swiper_woo_id uuid,
  p_limit integer default 20
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
    order by random()
    limit p_limit;
end;
$$;
