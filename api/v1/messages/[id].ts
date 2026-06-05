import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../src/middleware/error';
import { ProviderError } from '../../../src/types/provider';
import { loadOAuth2Client } from '../../../src/providers/gmail/auth';
import { deriveStatus } from '../../../src/sync/normalize';
import type { MessageStatus } from '../../../src/types/message';

/**
 * PATCH /api/v1/messages/:id
 *
 * Modifies Gmail labels and updates the corresponding fields in Supabase.
 * Accepts any combination of read, starred, archived, and trashed booleans
 * in a single request.
 *
 * CONTRACT.md §4.5
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
  const body = req.body as Record<string, unknown> ?? {};
  const { read, starred, archived, trashed } = body;

  const hasRead     = read     !== undefined;
  const hasStarred  = starred  !== undefined;
  const hasArchived = archived !== undefined;
  const hasTrashed  = trashed  !== undefined;

  if (!hasRead && !hasStarred && !hasArchived && !hasTrashed) {
    errorResponse(res, 400, 'INVALID_BODY', 'Body must include at least one of: read, starred, archived, trashed');
    return;
  }

  if (hasRead     && typeof read     !== 'boolean') {
    errorResponse(res, 400, 'INVALID_BODY', '"read" must be a boolean');
    return;
  }
  if (hasStarred  && typeof starred  !== 'boolean') {
    errorResponse(res, 400, 'INVALID_BODY', '"starred" must be a boolean');
    return;
  }
  if (hasArchived && typeof archived !== 'boolean') {
    errorResponse(res, 400, 'INVALID_BODY', '"archived" must be a boolean');
    return;
  }
  if (hasTrashed  && typeof trashed  !== 'boolean') {
    errorResponse(res, 400, 'INVALID_BODY', '"trashed" must be a boolean');
    return;
  }

  const supabase = getSupabase();

  try {
    // ── Fetch current row ─────────────────────────────────────────────────
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('id, gmail_id, is_read, is_starred, label_ids, status')
      .eq('gmail_id', id)
      .eq('user_id', payload.sub)
      .single();

    if (fetchError || !data) {
      throw new ProviderError('MESSAGE_NOT_FOUND', `No message with id "${id}" found for this user`);
    }

    const row = data as {
      id: string;
      gmail_id: string;
      is_read: boolean;
      is_starred: boolean;
      label_ids: string[];
      status: string;
    };

    // ── Check ALREADY_IN_STATE ────────────────────────────────────────────
    // All provided fields must already match the current state to 409.
    const alreadyRead     = !hasRead     || row.is_read    === (read    as boolean);
    const alreadyStarred  = !hasStarred  || row.is_starred === (starred as boolean);
    const alreadyArchived = !hasArchived || (row.status === 'archived') === (archived as boolean);
    const alreadyTrashed  = !hasTrashed  || (row.status === 'trash')    === (trashed  as boolean);

    if (alreadyRead && alreadyStarred && alreadyArchived && alreadyTrashed) {
      throw new ProviderError('ALREADY_IN_STATE', 'Message already has all requested states');
    }

    // ── Build label changes ───────────────────────────────────────────────
    const addLabels:    string[] = [];
    const removeLabels: string[] = [];

    if (hasRead) {
      if (read as boolean) removeLabels.push('UNREAD');
      else                 addLabels.push('UNREAD');
    }
    if (hasStarred) {
      if (starred as boolean) addLabels.push('STARRED');
      else                    removeLabels.push('STARRED');
    }
    if (hasArchived && (archived as boolean)) {
      // Remove INBOX and SENT so the message moves to All Mail only (true archive).
      // Gmail keeps the message in Sent view if SENT is left on, which defeats
      // the archive intent — especially for sent-to-self emails.
      removeLabels.push('INBOX');
      if (row.label_ids.includes('SENT')) removeLabels.push('SENT');
    }
    if (hasArchived && !(archived as boolean)) {
      // Unarchive: restore message to inbox.
      addLabels.push('INBOX');
    }
    if (hasTrashed) {
      if (trashed as boolean) {
        addLabels.push('TRASH');
        removeLabels.push('INBOX');
      } else {
        removeLabels.push('TRASH');
      }
    }

    // ── Modify Gmail labels ───────────────────────────────────────────────
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          addLabelIds:    addLabels,
          removeLabelIds: removeLabels,
        },
      });
    } catch (err) {
      throw new ProviderError('GMAIL_MODIFY_FAILED', 'Gmail label modification failed', err);
    }

    // ── Derive new derived fields from updated labelIds ───────────────────
    let newLabelIds = [...row.label_ids];
    for (const l of addLabels)    { if (!newLabelIds.includes(l)) newLabelIds.push(l); }
    for (const l of removeLabels) { newLabelIds = newLabelIds.filter(x => x !== l); }

    const newIsRead    = !newLabelIds.includes('UNREAD');
    const newIsStarred = newLabelIds.includes('STARRED');
    const newStatus: MessageStatus = deriveStatus(newLabelIds);

    // ── Update Supabase ───────────────────────────────────────────────────
    // Cast required: status and label_ids are new/extended columns not yet
    // reflected in the Supabase generated types (added by schema migration).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = {
      is_read:    newIsRead,
      is_starred: newIsStarred,
      label_ids:  newLabelIds,
      status:     newStatus,
    };

    const { error: updateError } = await supabase
      .from('messages')
      .update(updatePayload)
      .eq('gmail_id', id)
      .eq('user_id', payload.sub);

    if (updateError) {
      throw new ProviderError('GMAIL_MODIFY_FAILED', updateError.message, updateError);
    }

    res.status(200).json({
      message: {
        id,
        isRead:    newIsRead,
        isStarred: newIsStarred,
        status:    newStatus,
      },
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
