import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../src/middleware/error';
import { ProviderError } from '../../../src/types/provider';
import { loadOAuth2Client } from '../../../src/providers/gmail/auth';

/**
 * PATCH /api/v1/messages/:id
 *
 * Bidirectional mark-as-read: modifies the UNREAD Gmail label and updates
 * is_read in Supabase. Requires Authorization: Bearer <jwt>.
 *
 * Body: { read: boolean }
 * Response: { message: { id, isRead } }
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PATCH') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only PATCH is accepted on this endpoint');
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
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    errorResponse(res, 400, 'INVALID_BODY', 'Message ID is required in the URL path');
    return;
  }

  // ── Body validation ───────────────────────────────────────────────────────
  const body = req.body as Record<string, unknown>;
  const { read } = body ?? {};

  if (read === undefined || read === null || typeof read !== 'boolean') {
    errorResponse(res, 400, 'INVALID_BODY', '"read" field is required and must be a boolean');
    return;
  }

  const supabase = getSupabase();

  try {
    // ── Fetch current message state ─────────────────────────────────────────
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('id, is_read')
      .eq('gmail_id', id)
      .eq('user_id', payload.sub)
      .single();

    if (fetchError || !data) {
      throw new ProviderError(
        'MESSAGE_NOT_FOUND',
        `No message with id "${id}" found for this user`,
      );
    }

    const row = data as { id: string; is_read: boolean };

    // ── Already in requested state ──────────────────────────────────────────
    if (row.is_read === read) {
      throw new ProviderError(
        'ALREADY_IN_STATE',
        `Message is already marked as ${read ? 'read' : 'unread'}`,
      );
    }

    // ── Modify Gmail label ──────────────────────────────────────────────────
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          addLabelIds:    read ? [] : ['UNREAD'],
          removeLabelIds: read ? ['UNREAD'] : [],
        },
      });
    } catch (err) {
      throw new ProviderError('GMAIL_MODIFY_FAILED', 'Gmail label modification failed', err);
    }

    // ── Update Supabase ─────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('messages')
      .update({ is_read: read })
      .eq('gmail_id', id)
      .eq('user_id', payload.sub);

    if (updateError) {
      throw new ProviderError('GMAIL_MODIFY_FAILED', updateError.message, updateError);
    }

    res.status(200).json({ message: { id, isRead: read } });
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
