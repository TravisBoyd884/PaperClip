-- =============================================================================
-- Trade availability checks: prevent trades on Woos that have been traded away
-- or cashed out. Defense-in-depth at the database layer.
-- =============================================================================

-- execute_trade: atomically swap woo ownership when both parties approve,
-- but only if both Woos are still active and owned by the expected users.
create or replace function public.execute_trade(p_trade_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trade   record;
  v_woo_a   record;
  v_woo_b   record;
  v_match   record;
begin
  select * into v_trade
  from public.trades
  where id = p_trade_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Trade not found or not pending';
  end if;

  if not (v_trade.approved_by_a and v_trade.approved_by_b) then
    raise exception 'Both parties must approve before execution';
  end if;

  select * into v_match
  from public.matches
  where id = v_trade.match_id;

  select id, owner_id, status into v_woo_a
  from public.woos where id = v_trade.woo_a_id for update;

  select id, owner_id, status into v_woo_b
  from public.woos where id = v_trade.woo_b_id for update;

  if v_woo_a.status != 'active' or v_woo_b.status != 'active' then
    update public.trades set status = 'cancelled' where id = p_trade_id;
    update public.matches set status = 'cancelled' where id = v_trade.match_id;
    raise exception 'One or both Woos are no longer available for trading';
  end if;

  if v_woo_a.owner_id != v_match.user_a_id or v_woo_b.owner_id != v_match.user_b_id then
    update public.trades set status = 'cancelled' where id = p_trade_id;
    update public.matches set status = 'cancelled' where id = v_trade.match_id;
    raise exception 'Woo ownership has changed since this match was created';
  end if;

  update public.woos set owner_id = v_woo_b.owner_id, trade_count = trade_count + 1, updated_at = now() where id = v_trade.woo_a_id;
  update public.woos set owner_id = v_woo_a.owner_id, trade_count = trade_count + 1, updated_at = now() where id = v_trade.woo_b_id;

  update public.trades set status = 'completed', completed_at = now() where id = p_trade_id;
  update public.matches set status = 'trade_completed' where id = v_trade.match_id;
end;
$$;

-- check_match: called after a right-swipe to see if a reciprocal swipe exists.
-- Now verifies both Woos are still active before creating the match.
create or replace function public.check_match(p_swiper_woo_id uuid, p_target_woo_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_reciprocal   record;
  v_match_id     uuid;
  v_swiper_woo   record;
  v_target_woo   record;
begin
  select * into v_reciprocal
  from public.swipes
  where swiper_woo_id = p_target_woo_id
    and target_woo_id = p_swiper_woo_id
    and direction = 'right';

  if not found then
    return null;
  end if;

  select id, owner_id, status into v_swiper_woo
  from public.woos where id = p_swiper_woo_id;

  select id, owner_id, status into v_target_woo
  from public.woos where id = p_target_woo_id;

  if v_swiper_woo.status != 'active' or v_target_woo.status != 'active' then
    return null;
  end if;

  insert into public.matches (woo_a_id, woo_b_id, user_a_id, user_b_id)
  values (p_swiper_woo_id, p_target_woo_id, v_swiper_woo.owner_id, v_target_woo.owner_id)
  returning id into v_match_id;

  return v_match_id;
end;
$$;
