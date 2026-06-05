import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../src/middleware/error';
import { ProviderError } from '../../../src/types/provider';
import { rowToMessage, DbMessageRow } from '../../../src/sync/normalize';

/**
 * GET /api/v1/threads/:threadId
 *
 * Returns all messages in a Gmail thread for the authenticated user,
 * ordered oldest-first. Only messages already synced to Supabase are returned.
 *
 * CONTRACT.md §4.6
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted on this endpoint');
    return;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  // ── Path param ────────────────────────────────────────────────────────────
  const { threadId } = req.query;
  if (!threadId || typeof threadId !== 'string') {
    errorResponse(res, 400, 'INVALID_BODY', 'threadId is required in the URL path');
    return;
  }

  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', payload.sub)
      .order('created_at', { ascending: true })
      .order('gmail_id',   { ascending: true }); // stable tiebreaker

    if (error) {
      throw new ProviderError('GMAIL_LIST_FAILED', error.message, error);
    }

    const rows = (data ?? []) as DbMessageRow[];

    if (rows.length === 0) {
      throw new ProviderError(
        'THREAD_NOT_FOUND',
        `No messages found for thread "${threadId}"`,
      );
    }

    res.status(200).json({
      threadId,
      messages: rows.map(rowToMessage),
    });
  } catch (err) {
    handleError(res, err);
  }
}

// ── Supabase ─────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ProviderError('CONFIG_ERROR', 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key);
}
