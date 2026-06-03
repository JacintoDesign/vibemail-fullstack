import { google } from 'googleapis';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { normalizeMessage } from './normalize';
import { upsertMessage } from '../db';

const MAX_INITIAL_SYNC = 50;

// ── Initial sync ─────────────────────────────────────────────────────────────

/**
 * Fetches up to MAX_INITIAL_SYNC (50) messages from INBOX, normalizes them
 * to the Message shape, and upserts them via the db layer.
 *
 * Does NOT update users.history_id — that is set by setupWatch before this
 * function is called. setupWatch's historyId represents the mailbox state at
 * watch registration and is the correct Pub/Sub checkpoint; overwriting it
 * here with a per-message historyId (which belongs to an older message)
 * would regress the checkpoint and cause history.list to span an unexpectedly
 * large range on the next Pub/Sub delivery.
 */
export async function runInitialSync(userId: string): Promise<void> {
  const auth  = await loadOAuth2Client(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  let fetched   = 0;
  let pageToken: string | undefined;

  while (fetched < MAX_INITIAL_SYNC) {
    const remaining = MAX_INITIAL_SYNC - fetched;

    const { data: listData } = await gmail.users.messages.list({
      userId:     'me',
      labelIds:   ['INBOX'],
      maxResults: remaining,
      ...(pageToken ? { pageToken } : {}),
    });

    const refs = listData.messages ?? [];
    if (refs.length === 0) break;

    for (const ref of refs) {
      if (!ref.id || fetched >= MAX_INITIAL_SYNC) break;

      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id:     ref.id,
        format: 'FULL',
      });

      await upsertMessage(normalizeMessage(msg, userId));
      fetched++;
    }

    if (!listData.nextPageToken || fetched >= MAX_INITIAL_SYNC) break;
    pageToken = listData.nextPageToken;
  }
}
