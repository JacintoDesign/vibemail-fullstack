import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../../src/middleware/error';
import { ProviderError } from '../../../../src/types/provider';
import { loadOAuth2Client } from '../../../../src/providers/gmail/auth';
import { deriveStatus, rowToMessage, DbMessageRow } from '../../../../src/sync/normalize';

/**
 * POST   /api/v1/messages/:id/labels — add a label to a message
 * DELETE /api/v1/messages/:id/labels — remove a label from a message
 *
 * `:id` is the Gmail message id (gmailId). Body: { labelId: string }.
 *
 * This is for ordinary user/category labels. The labels that drive the derived
 * read/starred/status fields (UNREAD, STARRED, INBOX, SENT, DRAFT, TRASH) are
 * refused here — they must go through PATCH /api/v1/messages/:id so the derived
 * fields stay coherent.
 */

// Labels that PATCH owns. Routing them through here would let the message's
// derived status/flags drift out of sync with its labelIds.
const PROTECTED_LABELS = new Set(['UNREAD', 'STARRED', 'INBOX', 'SENT', 'DRAFT', 'TRASH']);

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'POST')   return mutate(req, res, 'add');
  if (req.method === 'DELETE') return mutate(req, res, 'remove');
  errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST and DELETE are accepted on this endpoint');
}

async function mutate(req: VercelRequest, res: VercelResponse, op: 'add' | 'remove'): Promise<void> {
  // ── Auth ────────────────────────────────────────────────────────────────
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  // ── Path param ──────────────────────────────────────────────────────────
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    errorResponse(res, 400, 'INVALID_BODY', 'Message ID is required in the URL path');
    return;
  }

  // ── Body ────────────────────────────────────────────────────────────────
  const body = (req.body as Record<string, unknown>) ?? {};
  const labelId = body.labelId;
  if (typeof labelId !== 'string' || labelId.trim() === '') {
    errorResponse(res, 400, 'INVALID_BODY', 'Body must include a non-empty "labelId" string');
    return;
  }
  if (PROTECTED_LABELS.has(labelId)) {
    errorResponse(
      res, 400, 'INVALID_BODY',
      `"${labelId}" is managed by PATCH /api/v1/messages/:id (read/starred/archived/trashed)`,
    );
    return;
  }

  const supabase = getSupabase();

  try {
    // ── Fetch current row ─────────────────────────────────────────────────
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('gmail_id', id)
      .eq('user_id', payload.sub)
      .single();

    if (fetchError || !data) {
      throw new ProviderError('MESSAGE_NOT_FOUND', `No message with id "${id}" found for this user`);
    }

    const row = data as DbMessageRow;
    const has = (row.label_ids ?? []).includes(labelId);

    // Idempotent guard — mirrors the PATCH ALREADY_IN_STATE convention.
    if ((op === 'add' && has) || (op === 'remove' && !has)) {
      throw new ProviderError('ALREADY_IN_STATE', `Label "${labelId}" is already ${op === 'add' ? 'present' : 'absent'}`);
    }

    // ── Modify Gmail labels ───────────────────────────────────────────────
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody:
          op === 'add'
            ? { addLabelIds: [labelId] }
            : { removeLabelIds: [labelId] },
      });
    } catch (err) {
      throw new ProviderError('GMAIL_MODIFY_FAILED', 'Gmail label modification failed', err);
    }

    // ── Recompute label_ids + derived fields ──────────────────────────────
    const newLabelIds =
      op === 'add'
        ? Array.from(new Set([...(row.label_ids ?? []), labelId]))
        : (row.label_ids ?? []).filter((l) => l !== labelId);

    const newStatus = deriveStatus(newLabelIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = {
      label_ids: newLabelIds,
      is_read:   !newLabelIds.includes('UNREAD'),
      is_starred: newLabelIds.includes('STARRED'),
      status:    newStatus,
    };

    const { error: updateError } = await supabase
      .from('messages')
      .update(updatePayload)
      .eq('gmail_id', id)
      .eq('user_id', payload.sub);

    if (updateError) {
      throw new ProviderError('GMAIL_MODIFY_FAILED', updateError.message, updateError);
    }

    const updated: DbMessageRow = {
      ...row,
      label_ids:  newLabelIds,
      is_read:    !newLabelIds.includes('UNREAD'),
      is_starred: newLabelIds.includes('STARRED'),
      status:     newStatus,
      updated_at: new Date().toISOString(),
    };

    res.status(200).json({ message: rowToMessage(updated) });
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
