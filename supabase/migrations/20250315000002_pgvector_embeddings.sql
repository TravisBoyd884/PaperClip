-- =============================================================================
-- pgvector embeddings: enable extension, add embedding columns, HNSW index,
-- update get_swipe_feed with optional semantic ranking + similarity_score output.
-- =============================================================================

-- 1. Enable pgvector extension
create extension if not exists vector with schema extensions;

-- 2. Add embedding columns
alter table public.woos
  add column if not exists embedding extensions.vector(1536);

alter table public.profiles
  add column if not exists preference_embedding extensions.vector(1536);

-- 3. HNSW index for cosine distance on woo embeddings
create index if not exists woos_embedding_hnsw_idx
  on public.woos using hnsw (embedding extensions.vector_cosine_ops);

-- 4. Helper: find Woos closest to a query embedding
create or replace function public.match_woos_by_embedding(
  query_embedding extensions.vector,
  match_count integer default 20
)
returns table (
  id uuid,
  title text,
  category text,
  estimated_value numeric,
  similarity float8
)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
    select
      w.id,
      w.title,
      w.category,
      w.estimated_value,
      1 - (w.embedding::extensions.vector <=> query_embedding) as similarity
    from public.woos w
    where w.status = 'active'
      and w.embedding is not null
    order by w.embedding::extensions.vector <=> query_embedding
    limit match_count;
end;
$$;

-- 5. Rewrite get_swipe_feed with optional p_wants_embedding + similarity_score output
drop function if exists public.get_swipe_feed(uuid, uuid, integer, text, text, numeric, numeric, text, numeric);

create or replace function public.get_swipe_feed(
  p_user_id uuid,
  p_swiper_woo_id uuid,
  p_limit integer default 20,
  p_category text default null,
  p_condition text default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_name_search text default null,
  p_swiper_value numeric default null,
  p_wants_embedding extensions.vector default null
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
  condition text,
  created_at timestamptz,
  updated_at timestamptz,
  owner_username text,
  owner_avatar_url text,
  owner_is_agent boolean,
  similarity_score float8
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
      w.condition,
      w.created_at,
      w.updated_at,
      p.username as owner_username,
      p.avatar_url as owner_avatar_url,
      p.is_agent as owner_is_agent,
      case
        when p_wants_embedding is not null and w.embedding is not null
        then 1 - (w.embedding::extensions.vector <=> p_wants_embedding)
        else null
      end as similarity_score
    from public.woos w
    join public.profiles p on p.id = w.owner_id
    where w.owner_id != p_user_id
      and w.status = 'active'
      and w.id not in (
        select s.target_woo_id
        from public.swipes s
        where s.swiper_woo_id = p_swiper_woo_id
      )
      and (p_category is null or w.category = p_category)
      and (p_condition is null or w.condition = p_condition)
      and (p_min_value is null or w.estimated_value >= p_min_value)
      and (p_max_value is null or w.estimated_value <= p_max_value)
      and (p_name_search is null or w.title ilike '%' || p_name_search || '%')
    order by
      case
        when p_wants_embedding is not null and w.embedding is not null
        then w.embedding::extensions.vector <=> p_wants_embedding
        else null
      end asc nulls last,
      abs(coalesce(w.estimated_value, 0) - coalesce(p_swiper_value, 0)),
      random()
    limit p_limit;
end;
$$;
