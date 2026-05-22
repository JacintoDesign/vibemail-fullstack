import { google } from 'googleapis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { Message } from '../types/message';
import { ProviderError } from '../types/provider';
import { normalizeMessage, upsertMessages } from './normalize';

const MAX_INITIAL_SYNC = 50;

// ── Supabase (lazy singleton) ────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  _supabase = createClient(url, key);
  return _supabase;
}

// ── Persistence helpers ──────────────────────────────────────────────────────

async function storeHistoryId(
  supabase: SupabaseClient,
  userId: string,
  historyId: string,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ history_id: historyId })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('HISTORY_ID_STORE_FAILED', error.message, error);
  }
}

// ── Initial sync ─────────────────────────────────────────────────────────────

/**
 * Fetches up to MAX_INITIAL_SYNC (50) messages from INBOX, normalizes them
 * to the Message shape, and upserts them to Supabase.
 *
 * historyId is sourced from individual messages.get responses (it is NOT
 * present on the messages.list response). The historyId of the last fetched
 * message is stored to users.history_id so the Pub/Sub webhook receiver
 * can use it as the startHistoryId for subsequent history.list calls.
 */
export async function runInitialSync(userId: string): Promise<void> {
  const auth    = await loadOAuth2Client(userId);
  const gmail   = google.gmail({ version: 'v1', auth });
  const supabase = getSupabase();

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

    const batch: Array<Omit<Message, 'id' | 'createdAt' | 'updatedAt'>> = [];

    for (const ref of refs) {
      if (!ref.id || fetched >= MAX_INITIAL_SYNC) break;

      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id:     ref.id,
        format: 'FULL',
      });

      // historyId is not on messages.list — track it from each messages.get
      if (msg.historyId) lastHistoryId = msg.historyId;

      batch.push(normalizeMessage(msg, userId));
      fetched++;
    }

    if (batch.length > 0) {
      await upsertMessages(supabase, batch);
    }

    if (!listData.nextPageToken || fetched >= MAX_INITIAL_SYNC) break;
    pageToken = listData.nextPageToken;
  }

  if (lastHistoryId) {
    await storeHistoryId(supabase, userId, lastHistoryId);
  }
}
