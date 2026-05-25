import { google } from 'googleapis';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { normalizeMessage } from './normalize';
import { upsertMessage, updateHistoryId } from '../db';

const MAX_INITIAL_SYNC = 50;

// ── Initial sync ─────────────────────────────────────────────────────────────

/**
 * Fetches up to MAX_INITIAL_SYNC (50) messages from INBOX, normalizes them
 * to the Message shape, and upserts them via the db layer.
 *
 * Each normalized message flows through db.upsertMessage, which maps
 * msg.from → from_address and msg.to → to_address before writing.
 *
 * historyId is sourced from individual messages.get responses (it is NOT
 * present on the messages.list response). The historyId of the last fetched
 * message is stored to users.history_id so the Pub/Sub webhook receiver
 * can use it as the startHistoryId for subsequent history.list calls.
 */
export async function runInitialSync(userId: string): Promise<void> {
  const auth  = await loadOAuth2Client(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  let fetched       = 0;
  let pageToken: string | undefined;
  let lastHistoryId: string | undefined;

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

      // historyId is not on messages.list — track it from each messages.get
      if (msg.historyId) lastHistoryId = msg.historyId;

      // normalizeMessage extracts headers (including from/to); upsertMessage
      // maps from → from_address and to → to_address before writing to DB.
      await upsertMessage(normalizeMessage(msg, userId));
      fetched++;
    }

    if (!listData.nextPageToken || fetched >= MAX_INITIAL_SYNC) break;
    pageToken = listData.nextPageToken;
  }

  if (lastHistoryId) {
    await updateHistoryId(userId, lastHistoryId);
  }
}
