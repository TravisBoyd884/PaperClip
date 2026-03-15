-- =============================================================================
-- Match cleanup: add trade_unavailable and dismissed statuses, proactive
-- invalidation of sibling matches after a trade completes.
-- =============================================================================

-- Expand the matches status CHECK to include the two new statuses.
alter table public.matches drop constraint matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('active', 'trade_proposed', 'trade_completed', 'expired', 'cancelled', 'trade_unavailable', 'dismissed'));

-- execute_trade: atomically swap woo ownership, then mark all other open
-- matches that reference either traded Woo as trade_unavailable.
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
    update public.matches set status = 'trade_unavailable' where id = v_trade.match_id;
    raise exception 'One or both Woos are no longer available for trading';
  end if;

  if v_woo_a.owner_id != v_match.user_a_id or v_woo_b.owner_id != v_match.user_b_id then
    update public.trades set status = 'cancelled' where id = p_trade_id;
    update public.matches set status = 'trade_unavailable' where id = v_trade.match_id;
    raise exception 'Woo ownership has changed since this match was created';
  end if;

  -- Swap ownership
  update public.woos set owner_id = v_woo_b.owner_id, trade_count = trade_count + 1, updated_at = now() where id = v_trade.woo_a_id;
  update public.woos set owner_id = v_woo_a.owner_id, trade_count = trade_count + 1, updated_at = now() where id = v_trade.woo_b_id;

  update public.trades set status = 'completed', completed_at = now() where id = p_trade_id;
  update public.matches set status = 'trade_completed' where id = v_trade.match_id;

  -- Proactively invalidate all other open matches referencing either traded Woo
  update public.trades
    set status = 'cancelled'
  where status = 'pending'
    and match_id in (
      select id from public.matches
      where id != v_trade.match_id
        and status in ('active', 'trade_proposed')
        and (woo_a_id in (v_trade.woo_a_id, v_trade.woo_b_id)
          or woo_b_id in (v_trade.woo_a_id, v_trade.woo_b_id))
    );

  update public.matches
    set status = 'trade_unavailable'
  where id != v_trade.match_id
    and status in ('active', 'trade_proposed')
    and (woo_a_id in (v_trade.woo_a_id, v_trade.woo_b_id)
      or woo_b_id in (v_trade.woo_a_id, v_trade.woo_b_id));
end;
$$;
