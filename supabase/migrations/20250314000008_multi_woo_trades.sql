-- =============================================================================
-- Multi-Woo trades: trade_woos join table, updated execute_trade for N:M
-- =============================================================================

-- 1. Create trade_woos join table
create table public.trade_woos (
  id         uuid primary key default gen_random_uuid(),
  trade_id   uuid not null references public.trades(id) on delete cascade,
  woo_id     uuid not null references public.woos(id),
  side       text not null check (side in ('a', 'b')),
  created_at timestamptz not null default now(),
  unique (trade_id, woo_id)
);

create index idx_trade_woos_trade on public.trade_woos(trade_id);
create index idx_trade_woos_woo on public.trade_woos(woo_id);

alter table public.trade_woos enable row level security;

create policy "Users can read trade_woos in their matches"
  on public.trade_woos for select
  using (
    exists (
      select 1 from public.trades t
      join public.matches m on m.id = t.match_id
      where t.id = trade_woos.trade_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

create policy "Users can insert trade_woos in their matches"
  on public.trade_woos for insert
  with check (
    exists (
      select 1 from public.trades t
      join public.matches m on m.id = t.match_id
      where t.id = trade_woos.trade_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

-- 2. Migrate existing trades into trade_woos
insert into public.trade_woos (trade_id, woo_id, side)
select id, woo_a_id, 'a' from public.trades where woo_a_id is not null
union all
select id, woo_b_id, 'b' from public.trades where woo_b_id is not null;

-- 3. Rewrite execute_trade to handle N:M via trade_woos
create or replace function public.execute_trade(p_trade_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trade     record;
  v_match     record;
  v_tw        record;
  v_woo       record;
  v_woo_ids   uuid[];
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

  v_woo_ids := array(select woo_id from public.trade_woos where trade_id = p_trade_id);

  -- Lock and validate all Woos
  for v_tw in select woo_id, side from public.trade_woos where trade_id = p_trade_id loop
    select id, owner_id, status into v_woo
    from public.woos where id = v_tw.woo_id for update;

    if v_woo.status != 'active' then
      update public.trades set status = 'cancelled' where id = p_trade_id;
      update public.matches set status = 'trade_unavailable' where id = v_trade.match_id;
      raise exception 'Woo % is no longer available for trading', v_woo.id;
    end if;

    if v_tw.side = 'a' and v_woo.owner_id != v_match.user_a_id then
      update public.trades set status = 'cancelled' where id = p_trade_id;
      update public.matches set status = 'trade_unavailable' where id = v_trade.match_id;
      raise exception 'Woo % ownership has changed', v_woo.id;
    end if;

    if v_tw.side = 'b' and v_woo.owner_id != v_match.user_b_id then
      update public.trades set status = 'cancelled' where id = p_trade_id;
      update public.matches set status = 'trade_unavailable' where id = v_trade.match_id;
      raise exception 'Woo % ownership has changed', v_woo.id;
    end if;
  end loop;

  -- Transfer side-a Woos to user B
  update public.woos
  set owner_id = v_match.user_b_id, trade_count = trade_count + 1, updated_at = now()
  where id in (select woo_id from public.trade_woos where trade_id = p_trade_id and side = 'a');

  -- Transfer side-b Woos to user A
  update public.woos
  set owner_id = v_match.user_a_id, trade_count = trade_count + 1, updated_at = now()
  where id in (select woo_id from public.trade_woos where trade_id = p_trade_id and side = 'b');

  update public.trades set status = 'completed', completed_at = now() where id = p_trade_id;
  update public.matches set status = 'trade_completed' where id = v_trade.match_id;

  -- Proactively invalidate all other open matches referencing any traded Woo
  update public.trades
    set status = 'cancelled'
  where status = 'pending'
    and match_id in (
      select id from public.matches
      where id != v_trade.match_id
        and status in ('active', 'trade_proposed')
        and (woo_a_id = any(v_woo_ids) or woo_b_id = any(v_woo_ids))
    );

  update public.matches
    set status = 'trade_unavailable'
  where id != v_trade.match_id
    and status in ('active', 'trade_proposed')
    and (woo_a_id = any(v_woo_ids) or woo_b_id = any(v_woo_ids));
end;
$$;
