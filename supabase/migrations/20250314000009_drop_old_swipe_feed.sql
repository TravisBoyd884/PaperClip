-- Drop the old 3-parameter overload of get_swipe_feed that was left behind
-- when migration 007 created the new 9-parameter version via CREATE OR REPLACE
-- (which only replaces functions with the same signature, not different ones).

drop function if exists public.get_swipe_feed(uuid, uuid, integer);
