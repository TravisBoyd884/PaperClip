-- Seed mock warehouses for development

insert into public.warehouses (id, name, address, city, state, country, zip, capacity, current_count, status)
values
  (
    'a1b2c3d4-0001-4000-8000-000000000001',
    'PaperClip West',
    '100 Market Street',
    'San Francisco',
    'CA',
    'US',
    '94105',
    500,
    0,
    'active'
  )
on conflict do nothing;
