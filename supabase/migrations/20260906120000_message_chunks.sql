-- VibeMail — Memory layer: message_chunks
-- Idempotent: safe to run multiple times on the same database (AC-9).
-- DO NOT apply until npm test exits 0 on main (CONTRACT.md §2).
--
-- Chunks are the storage unit for GTE-small embeddings (384 dimensions).
-- Vectors are stored unit-normalized; the HNSW index uses inner product
-- (vector_ip_ops / <#>) which ranks identically to cosine and is cheaper
-- for Postgres to compute. See memory_contract.md.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pgvector
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. message_chunks
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per embedding chunk of a message. `message_id` is the messages PK
-- (UUID). Deleting a message cascades to its chunks in the same transaction.
-- UNIQUE (message_id, chunk_index) makes delete-and-rebuild on subject/body
-- edits safe.

CREATE TABLE IF NOT EXISTS public.message_chunks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chunk_index  INTEGER     NOT NULL,
  chunk_text   TEXT        NOT NULL,               -- sender + subject + body slice that was embedded
  embedding    vector(384) NOT NULL,               -- GTE-small; unit-normalized at write time
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, chunk_index)
);

-- CREATE TABLE IF NOT EXISTS will not add a unique constraint on a re-run if
-- the table was created earlier without it. Guard the ADD CONSTRAINT so a
-- partial first run still converges.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_chunks_message_id_chunk_index_key'
  ) THEN
    ALTER TABLE public.message_chunks
      ADD CONSTRAINT message_chunks_message_id_chunk_index_key
      UNIQUE (message_id, chunk_index);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. HNSW index (inner product, not cosine)
-- ─────────────────────────────────────────────────────────────────────────────
-- Unit-normalized vectors: inner product ranks identically to cosine distance.

CREATE INDEX IF NOT EXISTS idx_message_chunks_embedding
  ON public.message_chunks
  USING hnsw (embedding vector_ip_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────
-- Ownership is enforced here (user_id = auth.uid()), not in application code
-- (memory_contract.md §3). Service role still bypasses RLS — do not FORCE.
-- Policy creation is wrapped in a DO block; pg_policies is checked before
-- issuing CREATE POLICY so re-runs are safe.

ALTER TABLE public.message_chunks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_chunks' AND policyname = 'message_chunks_own'
  ) THEN
    CREATE POLICY message_chunks_own ON public.message_chunks
      USING     (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
