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
  ),
  (
    'a1b2c3d4-0002-4000-8000-000000000002',
    'PaperClip Central',
    '233 S Wacker Drive',
    'Chicago',
    'IL',
    'US',
    '60606',
    750,
    0,
    'active'
  ),
  (
    'a1b2c3d4-0003-4000-8000-000000000003',
    'PaperClip East',
    '350 Fifth Avenue',
    'New York',
    'NY',
    'US',
    '10118',
    600,
    0,
    'active'
  )
on conflict do nothing;
