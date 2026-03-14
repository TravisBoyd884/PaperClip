-- =============================================================================
-- Warehouse staff, admin RLS, and mint_woo function
-- =============================================================================

-- 1. warehouse_staff table
create table public.warehouse_staff (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  role         text not null default 'staff'
               check (role in ('staff', 'manager')),
  created_at   timestamptz not null default now(),
  unique (profile_id, warehouse_id)
);

create index idx_warehouse_staff_profile on public.warehouse_staff(profile_id);
create index idx_warehouse_staff_warehouse on public.warehouse_staff(warehouse_id);

alter table public.warehouse_staff enable row level security;

create policy "Users can read own staff records"
  on public.warehouse_staff for select
  using (auth.uid() = profile_id);

-- =============================================================================
-- 2. RLS: warehouse staff can read items in their warehouse
-- =============================================================================

create policy "Warehouse staff can read warehouse items"
  on public.items for select
  using (
    exists (
      select 1 from public.warehouse_staff ws
      where ws.profile_id = auth.uid()
        and ws.warehouse_id = items.warehouse_id
    )
  );

create policy "Warehouse staff can update warehouse items"
  on public.items for update
  using (
    exists (
      select 1 from public.warehouse_staff ws
      where ws.profile_id = auth.uid()
        and ws.warehouse_id = items.warehouse_id
    )
  );

-- =============================================================================
-- 3. RLS: warehouse staff can read/update cashouts for items in their warehouse
-- =============================================================================

create policy "Warehouse staff can read warehouse cashouts"
  on public.cashouts for select
  using (
    exists (
      select 1 from public.woos w
      join public.items i on i.id = w.item_id
      join public.warehouse_staff ws on ws.warehouse_id = i.warehouse_id
      where w.id = cashouts.woo_id
        and ws.profile_id = auth.uid()
    )
  );

create policy "Warehouse staff can update warehouse cashouts"
  on public.cashouts for update
  using (
    exists (
      select 1 from public.woos w
      join public.items i on i.id = w.item_id
      join public.warehouse_staff ws on ws.warehouse_id = i.warehouse_id
      where w.id = cashouts.woo_id
        and ws.profile_id = auth.uid()
    )
  );

-- =============================================================================
-- 4. mint_woo: atomically create a Woo from a verified item
-- =============================================================================

create or replace function public.mint_woo(p_item_id uuid, p_estimated_value numeric default null)
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

  -- Check no existing woo for this item
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
    p_estimated_value,
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
