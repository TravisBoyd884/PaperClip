-- =============================================================================
-- Add agent_preferences jsonb column and avatars storage bucket
-- =============================================================================

-- 1. Add agent_preferences to profiles for structured agent configuration
alter table public.profiles
  add column if not exists agent_preferences jsonb;

-- 2. Create avatars storage bucket (public, mirrors item-photos pattern)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3. RLS for avatars bucket
create policy "Authenticated users can upload avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Anyone can view avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "Users can delete own avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
