-- VibeMail — Add status and draft_id to messages
-- Idempotent: safe to run multiple times on the same database (AC-9).
-- DO NOT apply to production until npm test exits 0 on main (CONTRACT.md §2).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS status   TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS draft_id TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill status from existing label_ids
-- ─────────────────────────────────────────────────────────────────────────────
-- Priority order mirrors deriveStatus() in src/sync/normalize.ts:
--   draft > trash > sent > archived > inbox (default, already set above)
--
-- Each UPDATE is idempotent — running this migration twice produces no error
-- and no incorrect state because the WHERE clauses are non-overlapping and
-- the DEFAULT already covers the inbox case.

UPDATE public.messages
  SET status = 'draft'
  WHERE label_ids @> ARRAY['DRAFT'];

UPDATE public.messages
  SET status = 'trash'
  WHERE label_ids @> ARRAY['TRASH']
    AND NOT label_ids @> ARRAY['DRAFT'];

UPDATE public.messages
  SET status = 'sent'
  WHERE label_ids @> ARRAY['SENT']
    AND NOT label_ids @> ARRAY['DRAFT']
    AND NOT label_ids @> ARRAY['TRASH'];

UPDATE public.messages
  SET status = 'archived'
  WHERE NOT label_ids @> ARRAY['INBOX']
    AND NOT label_ids @> ARRAY['SENT']
    AND NOT label_ids @> ARRAY['DRAFT']
    AND NOT label_ids @> ARRAY['TRASH']
    AND status = 'inbox';  -- only touch rows still at default

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Filter by status (e.g. drafts list, trash view)
CREATE INDEX IF NOT EXISTS idx_messages_user_status
  ON public.messages (user_id, status);

-- Draft lookups by draft_id (needed for drafts.update / drafts.delete)
CREATE INDEX IF NOT EXISTS idx_messages_draft_id
  ON public.messages (draft_id)
  WHERE draft_id IS NOT NULL;
