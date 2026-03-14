-- =============================================================================
-- PaperClip: Full initial schema
-- =============================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. profiles
-- =============================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  avatar_url  text,
  is_agent    boolean not null default false,
  agent_framework text,
  agent_description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'user_name',
             new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 2. warehouses
-- =============================================================================

create table public.warehouses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text not null,
  city          text not null,
  state         text not null,
  country       text not null default 'US',
  zip           text not null,
  capacity      integer not null default 1000,
  current_count integer not null default 0,
  status        text not null default 'active'
                check (status in ('active', 'full', 'inactive')),
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- 3. items
-- =============================================================================

create table public.items (
  id                     uuid primary key default gen_random_uuid(),
  warehouse_id           uuid references public.warehouses(id),
  owner_id               uuid not null references public.profiles(id),
  name                   text not null,
  description            text,
  condition              text not null default 'good'
                         check (condition in ('new', 'like_new', 'good', 'fair', 'poor')),
  photos                 text[] default '{}',
  verified               boolean not null default false,
  status                 text not null default 'requested'
                         check (status in (
                           'requested', 'label_generated', 'in_transit',
                           'received', 'verified', 'stored',
                           'shipping_out', 'shipped'
                         )),
  category               text default 'other'
                         check (category in ('office', 'electronics', 'furniture', 'collectible', 'other')),
  shipping_label_url     text,
  intake_tracking_number text,
  created_at             timestamptz not null default now()
);

-- =============================================================================
-- 4. woos
-- =============================================================================

create table public.woos (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid unique not null references public.items(id),
  owner_id        uuid not null references public.profiles(id),
  title           text not null,
  description     text,
  images          text[] default '{}',
  category        text default 'other'
                  check (category in ('office', 'electronics', 'furniture', 'collectible', 'other')),
  estimated_value numeric,
  trade_count     integer not null default 0,
  status          text not null default 'active'
                  check (status in ('active', 'in_trade', 'cashed_out', 'burned')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- 5. swipes
-- =============================================================================

create table public.swipes (
  id             uuid primary key default gen_random_uuid(),
  swiper_id      uuid not null references public.profiles(id),
  swiper_woo_id  uuid not null references public.woos(id),
  target_woo_id  uuid not null references public.woos(id),
  direction      text not null check (direction in ('left', 'right')),
  created_at     timestamptz not null default now(),
  unique (swiper_woo_id, target_woo_id)
);

-- =============================================================================
-- 6. matches
-- =============================================================================

create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  woo_a_id    uuid not null references public.woos(id),
  woo_b_id    uuid not null references public.woos(id),
  user_a_id   uuid not null references public.profiles(id),
  user_b_id   uuid not null references public.profiles(id),
  status      text not null default 'active'
              check (status in ('active', 'trade_proposed', 'trade_completed', 'expired', 'cancelled')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days')
);

-- =============================================================================
-- 7. messages
-- =============================================================================

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id),
  content      text not null,
  message_type text not null default 'text'
               check (message_type in ('text', 'trade_proposal', 'trade_approval', 'system')),
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- 8. trades
-- =============================================================================

create table public.trades (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches(id),
  woo_a_id      uuid not null references public.woos(id),
  woo_b_id      uuid not null references public.woos(id),
  proposed_by   uuid not null references public.profiles(id),
  approved_by_a boolean not null default false,
  approved_by_b boolean not null default false,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'completed', 'cancelled')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- 9. cashouts
-- =============================================================================

create table public.cashouts (
  id               uuid primary key default gen_random_uuid(),
  woo_id           uuid not null references public.woos(id),
  user_id          uuid not null references public.profiles(id),
  shipping_address jsonb not null,
  status           text not null default 'requested'
                   check (status in ('requested', 'processing', 'shipped', 'delivered', 'completed')),
  tracking_number  text,
  carrier          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- 10. agent_keys
-- =============================================================================

create table public.agent_keys (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id),
  name              text not null,
  key_hash          text not null,
  key_prefix        text not null,
  permissions       text[] not null default '{read}',
  rate_limit        integer not null default 60,
  daily_trade_limit integer not null default 100,
  is_active         boolean not null default true,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now()
);

-- =============================================================================
-- Database functions
-- =============================================================================

-- execute_trade: atomically swap woo ownership when both parties approve
create or replace function public.execute_trade(p_trade_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trade   record;
  v_owner_a uuid;
  v_owner_b uuid;
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

  select owner_id into v_owner_a from public.woos where id = v_trade.woo_a_id for update;
  select owner_id into v_owner_b from public.woos where id = v_trade.woo_b_id for update;

  update public.woos set owner_id = v_owner_b, trade_count = trade_count + 1, updated_at = now() where id = v_trade.woo_a_id;
  update public.woos set owner_id = v_owner_a, trade_count = trade_count + 1, updated_at = now() where id = v_trade.woo_b_id;

  update public.trades set status = 'completed', completed_at = now() where id = p_trade_id;
  update public.matches set status = 'trade_completed' where id = v_trade.match_id;
end;
$$;

-- check_match: called after a right-swipe to see if a reciprocal swipe exists
create or replace function public.check_match(p_swiper_woo_id uuid, p_target_woo_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_reciprocal record;
  v_match_id   uuid;
  v_swiper_owner uuid;
  v_target_owner uuid;
begin
  select * into v_reciprocal
  from public.swipes
  where swiper_woo_id = p_target_woo_id
    and target_woo_id = p_swiper_woo_id
    and direction = 'right';

  if not found then
    return null;
  end if;

  select owner_id into v_swiper_owner from public.woos where id = p_swiper_woo_id;
  select owner_id into v_target_owner from public.woos where id = p_target_woo_id;

  insert into public.matches (woo_a_id, woo_b_id, user_a_id, user_b_id)
  values (p_swiper_woo_id, p_target_woo_id, v_swiper_owner, v_target_owner)
  returning id into v_match_id;

  return v_match_id;
end;
$$;

-- burn_woo: mark a woo as burned during cash out
create or replace function public.burn_woo(p_woo_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_woo record;
begin
  select * into v_woo
  from public.woos
  where id = p_woo_id
  for update;

  if not found then
    raise exception 'Woo not found';
  end if;

  if v_woo.status = 'in_trade' then
    raise exception 'Cannot burn a Woo that is in an active trade';
  end if;

  if v_woo.status = 'burned' then
    raise exception 'Woo is already burned';
  end if;

  update public.woos set status = 'burned', updated_at = now() where id = p_woo_id;
end;
$$;

-- =============================================================================
-- Indexes
-- =============================================================================

create index idx_items_owner on public.items(owner_id);
create index idx_items_status on public.items(status);
create index idx_woos_owner on public.woos(owner_id);
create index idx_woos_status on public.woos(status);
create index idx_swipes_swiper on public.swipes(swiper_id);
create index idx_swipes_target_woo on public.swipes(target_woo_id);
create index idx_matches_user_a on public.matches(user_a_id);
create index idx_matches_user_b on public.matches(user_b_id);
create index idx_messages_match on public.messages(match_id);
create index idx_trades_match on public.trades(match_id);
create index idx_cashouts_user on public.cashouts(user_id);
create index idx_agent_keys_user on public.agent_keys(user_id);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.warehouses enable row level security;
alter table public.items enable row level security;
alter table public.woos enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.trades enable row level security;
alter table public.cashouts enable row level security;
alter table public.agent_keys enable row level security;

-- profiles: users can read own profile; all profiles readable for display
create policy "Users can read any profile"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- warehouses: read-only for all authenticated users
create policy "Authenticated users can read warehouses"
  on public.warehouses for select
  to authenticated
  using (true);

-- items: users see own items
create policy "Users can read own items"
  on public.items for select
  using (auth.uid() = owner_id);

create policy "Users can insert own items"
  on public.items for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own items"
  on public.items for update
  using (auth.uid() = owner_id);

-- woos: users see own woos + active woos from others (swipe feed)
create policy "Users can read own woos"
  on public.woos for select
  using (auth.uid() = owner_id);

create policy "Users can read active woos for feed"
  on public.woos for select
  using (status = 'active');

create policy "Users can insert own woos"
  on public.woos for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own woos"
  on public.woos for update
  using (auth.uid() = owner_id);

-- swipes: users see and create own swipes
create policy "Users can read own swipes"
  on public.swipes for select
  using (auth.uid() = swiper_id);

create policy "Users can insert own swipes"
  on public.swipes for insert
  with check (auth.uid() = swiper_id);

-- matches: participants can read
create policy "Users can read own matches"
  on public.matches for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- messages: participants can read and insert
create policy "Users can read messages in their matches"
  on public.messages for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

create policy "Users can send messages in their matches"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

-- trades: participants can read; approval restricted to respective participant
create policy "Users can read own trades"
  on public.trades for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

create policy "Users can insert trades in their matches"
  on public.trades for insert
  with check (
    auth.uid() = proposed_by
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

create policy "Users can update trades they participate in"
  on public.trades for update
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

-- cashouts: users see own cashouts
create policy "Users can read own cashouts"
  on public.cashouts for select
  using (auth.uid() = user_id);

create policy "Users can insert own cashouts"
  on public.cashouts for insert
  with check (auth.uid() = user_id);

-- agent_keys: users see only own keys
create policy "Users can read own agent keys"
  on public.agent_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert own agent keys"
  on public.agent_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update own agent keys"
  on public.agent_keys for update
  using (auth.uid() = user_id);

create policy "Users can delete own agent keys"
  on public.agent_keys for delete
  using (auth.uid() = user_id);

-- =============================================================================
-- Storage bucket for item photos
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload item photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-photos');

create policy "Anyone can view item photos"
  on storage.objects for select
  using (bucket_id = 'item-photos');

create policy "Users can delete own item photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);
