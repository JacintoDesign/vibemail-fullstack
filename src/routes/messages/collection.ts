import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../middleware/jwt';
import { errorResponse, handleError } from '../../middleware/error';
import { ProviderError } from '../../types/provider';
import { sendMessage } from '../../send/index';
import { rowToMessage, DbMessageRow } from '../../sync/normalize';

/**
 * GET  /api/v1/messages — paginated message list from Supabase
 * POST /api/v1/messages — compose and send a message via Gmail
 *
 * Both routes require Authorization: Bearer <jwt>.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleSend(req, res);
  errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are accepted on this endpoint');
}

// ── GET /api/v1/messages ─────────────────────────────────────────────────────

async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const { cursor, limit: limitParam, labelId, status } = req.query;

  // Validate limit
  const limit = limitParam === undefined ? 20 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errorResponse(res, 422, 'INVALID_LIMIT', 'limit must be an integer between 1 and 100');
    return;
  }

  const supabase = getSupabase();

  try {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('user_id', payload.sub)
      .order('created_at', { ascending: false })
      .order('gmail_id',   { ascending: false })  // stable tiebreaker within same ms
      .limit(limit + 1); // fetch one extra to determine if there's a next page

    // Cursor is a base64-encoded JSON payload: { d: created_at, g: gmail_id }.
    // The compound filter ensures stable keyset pagination even when multiple
    // messages share the same internalDate (created_at).
    if (cursor && typeof cursor === 'string') {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const { d: cursorDate, g: cursorGmailId } = JSON.parse(raw) as { d: string; g: string };
      query = query.or(
        `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},gmail_id.lt.${cursorGmailId})`,
      );
    }

    // Filter by label if provided.
    if (labelId && typeof labelId === 'string') {
      query = query.contains('label_ids', [labelId]);
    }

    // Filter by derived status if provided. This is the only way to page the
    // "archived" folder server-side — archived is the absence of INBOX/SENT/
    // DRAFT/TRASH and so cannot be expressed as a single labelId `contains`.
    // Unknown values are ignored rather than 422'd (no contract error for it).
    const STATUSES = ['inbox', 'sent', 'draft', 'archived', 'trash'];
    if (typeof status === 'string' && STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new ProviderError('GMAIL_LIST_FAILED', error.message, error);
    }

    const rows = (data ?? []) as DbMessageRow[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const messages = page.map(rowToMessage);

    // endCursor is the keyset of the LAST returned row, emitted even when there
    // are no further DB rows (nextCursor === null). The client uses it to resume
    // paging after an out-of-band backfill inserts older rows past the end.
    const lastRow = page[page.length - 1];
    const endCursor = lastRow
      ? Buffer.from(JSON.stringify({ d: lastRow.created_at, g: lastRow.gmail_id })).toString('base64')
      : null;
    const nextCursor = hasMore ? endCursor : null;

    res.status(200).json({ messages, nextCursor, endCursor });
  } catch (err) {
    handleError(res, err);
  }
}

// ── POST /api/v1/messages ────────────────────────────────────────────────────

async function handleSend(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const body = req.body as Record<string, unknown>;
  const { to, subject, body: msgBody, threadId, attachmentIds } = body ?? {};

  // Subject and body are optional — an empty/absent subject sends as
  // "(no subject)", and an empty body is allowed too (both match Gmail).
  // Default them to empty strings. Only `to` is required.
  const subjectStr = subject === undefined || subject === null ? '' : subject;
  const bodyStr    = msgBody === undefined || msgBody === null ? '' : msgBody;

  // Validate the only required field.
  if (!to) {
    errorResponse(res, 400, 'MISSING_FIELDS', 'Request body must include to');
    return;
  }

  if (typeof to !== 'string' || typeof bodyStr !== 'string' || typeof subjectStr !== 'string') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'to must be a string; subject and body, if present, must be strings');
    return;
  }

  // Basic RFC 5321 email validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    errorResponse(res, 400, 'INVALID_RECIPIENT', 'to must be a valid email address');
    return;
  }

  if (to.trim() === '') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'to must not be an empty string');
    return;
  }

  // Optional attachmentIds — must be an array of strings when present.
  let ids: string[] | undefined;
  if (attachmentIds !== undefined) {
    if (!Array.isArray(attachmentIds) || !attachmentIds.every((x) => typeof x === 'string')) {
      errorResponse(res, 400, 'MISSING_FIELDS', 'attachmentIds must be an array of strings');
      return;
    }
    ids = attachmentIds as string[];
  }

  try {
    const message = await sendMessage(payload.sub, {
      to,
      subject: subjectStr,
      body: bodyStr,
      threadId: typeof threadId === 'string' ? threadId : undefined,
      attachmentIds: ids,
    });

    res.status(201).json({ message });
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
