-- VibeMail — Memory layer: match_messages
-- Idempotent: CREATE OR REPLACE (AC-9).
-- DO NOT apply until npm test exits 0 on main (CONTRACT.md §2).
--
-- Retrieval lives in Postgres so the HNSW index (vector_ip_ops) can serve it.
-- Chunks are searched; callers only ever see messages (memory_contract.md §2).
--
-- Operator: <#> (negative inner product), not <=> (cosine). Vectors are stored
-- unit-normalized, so the ranking is identical to cosine and cheaper to compute.
-- Lower is better; a strong match sits near -1.
--
-- Ownership: p_user_id only. Do not use SECURITY DEFINER. Do not use auth.uid()
-- or RLS. The server connects with SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
-- and a custom HS256 JWT, so auth.uid() is never populated.

CREATE OR REPLACE FUNCTION public.match_messages(
  p_user_id         uuid,
  p_query_embedding vector(384),
  p_match_threshold double precision,
  p_match_count     integer DEFAULT 8
)
RETURNS TABLE (
  id           public.messages.id%TYPE,
  user_id      public.messages.user_id%TYPE,
  created_at   public.messages.created_at%TYPE,
  updated_at   public.messages.updated_at%TYPE,
  gmail_id     public.messages.gmail_id%TYPE,
  thread_id    public.messages.thread_id%TYPE,
  label_ids    public.messages.label_ids%TYPE,
  from_address public.messages.from_address%TYPE,
  to_address   public.messages.to_address%TYPE,
  subject      public.messages.subject%TYPE,
  date         public.messages.date%TYPE,
  snippet      public.messages.snippet%TYPE,
  body_plain   public.messages.body_plain%TYPE,
  body_html    public.messages.body_html%TYPE,
  is_read      public.messages.is_read%TYPE,
  is_starred   public.messages.is_starred%TYPE,
  status       public.messages.status%TYPE,
  draft_id     public.messages.draft_id%TYPE,
  score        double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      mc.message_id,
      MIN(mc.embedding <#> p_query_embedding) AS score
    FROM public.message_chunks AS mc
    WHERE mc.user_id = p_user_id
    GROUP BY mc.message_id
    -- <#> is a distance: worse means larger. Keep scores at or below threshold.
    HAVING MIN(mc.embedding <#> p_query_embedding) <= p_match_threshold
  )
  SELECT
    m.id,
    m.user_id,
    m.created_at,
    m.updated_at,
    m.gmail_id,
    m.thread_id,
    m.label_ids,
    m.from_address,
    m.to_address,
    m.subject,
    m.date,
    m.snippet,
    m.body_plain,
    m.body_html,
    m.is_read,
    m.is_starred,
    m.status,
    m.draft_id,
    scored.score
  FROM scored
  INNER JOIN public.messages AS m
    ON m.id::text = scored.message_id::text
   AND m.user_id = p_user_id
  -- Recency nudge: ~0.01 of score per year of age. Relevance still leads;
  -- near-ties prefer the newer message. created_at is Gmail internalDate.
  -- Returned `score` is the raw <#> (not recency-adjusted).
  ORDER BY
    scored.score
      + EXTRACT(EPOCH FROM (now() - m.created_at)) / 31556952.0 * 0.01
    ASC
  LIMIT p_match_count
$$;
