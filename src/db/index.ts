/**
 * src/db/index.ts — Supabase database layer
 *
 * Single source of truth for all database reads and writes.  The client is
 * typed against the generated Database schema (src/types/database.ts) so
 * every table access is statically checked against the real column shapes.
 *
 * All writes use the service-role key, which bypasses Supabase RLS policies.
 * Never expose this client or its key to the browser.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, Tables, TablesInsert } from '../types/database';
import { Message } from '../types/message';
import { ProviderError } from '../types/provider';

// ── Typed client (lazy singleton) ────────────────────────────────────────────

let _client: SupabaseClient<Database> | null = null;

/**
 * Returns the singleton typed Supabase client.
 * Throws CONFIG_ERROR if required env vars are absent.
 */
export function getClient(): SupabaseClient<Database> {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }

  _client = createClient<Database>(url, key);
  return _client;
}

// ── Transient-failure retry ──────────────────────────────────────────────────

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * True for the dropped-socket / DNS-hiccup class of failures that the Supabase
 * client's underlying fetch raises under load (e.g. a long backfill hammering
 * the DB). These are safe to retry; a real constraint or auth error is not.
 */
function isTransientError(err: unknown): boolean {
  const message = String((err as { message?: string } | null)?.message ?? err ?? '');
  return /fetch failed|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR|network/i.test(
    message,
  );
}

/**
 * Run a Supabase write, retrying transient network failures with exponential
 * backoff. Network errors surface either as a thrown exception or as a returned
 * `{ error }`, so both are handled. Returns the same shape the call returned, so
 * callers keep their existing `if (error) throw ProviderError(...)` handling and
 * the typed error code is preserved for genuine (non-transient) failures.
 */
export async function withWriteRetry<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  let lastResult: T | undefined;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await run();
      if (!result.error || !isTransientError(result.error)) return result;
      lastResult = result;
    } catch (err) {
      if (!isTransientError(err) || attempt === RETRY_ATTEMPTS - 1) throw err;
    }
    if (attempt < RETRY_ATTEMPTS - 1) await sleep(RETRY_BASE_MS * 2 ** attempt);
  }
  return lastResult as T;
}

// ── Row type aliases ─────────────────────────────────────────────────────────

/** Full users row as returned by SELECT *. */
export type UserRow    = Tables<'users'>;

/** Full messages row as returned by SELECT *. */
export type MessageRow = Tables<'messages'>;

// ── upsertMessage ─────────────────────────────────────────────────────────────

/**
 * Upserts a single message into the messages table.
 *
 * Conflict target: gmail_id (unique index).  On conflict the row is updated
 * with the latest field values — this handles label changes (e.g. UNREAD →
 * read) arriving via subsequent Pub/Sub notifications.
 *
 * Field mapping:
 *   msg.from  → from_address  (avoids reserved word collision)
 *   msg.to    → to_address
 */
export async function upsertMessage(
  msg: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const ms = Number(msg.internalDate);
  const row: TablesInsert<'messages'> = {
    user_id:      msg.userId,
    gmail_id:     msg.gmailId,
    thread_id:    msg.threadId,
    label_ids:    msg.labelIds,
    from_address: msg.from,       // from  → from_address
    to_address:   msg.to,         // to    → to_address
    subject:      msg.subject,
    date:         msg.date,
    snippet:      msg.snippet,
    body_plain:   msg.bodyPlain,
    body_html:    msg.bodyHtml,
    is_read:      msg.isRead,
    is_starred:   msg.isStarred,
    status:       msg.status,
    // draft_id intentionally omitted — only draft-specific endpoints write this
    // column; omitting it here ensures webhook syncs never overwrite a draftId
    // that was set when the draft was created via POST /api/v1/drafts.
    // Store the email receipt time as created_at so list queries sort by email
    // date rather than DB insert time. internalDate is a Unix ms string from Gmail.
    created_at:   Number.isFinite(ms) && ms > 0
                    ? new Date(ms).toISOString()
                    : undefined,
  };

  const { error } = await withWriteRetry(() =>
    getClient().from('messages').upsert(row, { onConflict: 'gmail_id' }),
  );

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
}

// ── Inbox reconciliation helpers ──────────────────────────────────────────────

/**
 * Returns the gmail_id + label_ids of every row this user currently has tagged
 * with the INBOX label. Used by reconcileInbox to find rows that Gmail no longer
 * considers inbox (archived/trashed/deleted) so the stale label can be dropped.
 */
export async function getInboxMessageRows(
  userId: string,
): Promise<Array<{ gmail_id: string; label_ids: string[] }>> {
  const { data, error } = await getClient()
    .from('messages')
    .select('gmail_id, label_ids')
    .eq('user_id', userId)
    .contains('label_ids', ['INBOX']);

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
  return (data ?? []).map((r) => ({ gmail_id: r.gmail_id, label_ids: r.label_ids ?? [] }));
}

/**
 * Overwrites a single message's label_ids and derived status. Used to drop a
 * stale INBOX label during reconciliation. The caller computes the new status
 * from the new labels (the db layer holds no status-derivation logic).
 */
export async function updateMessageLabels(
  userId:   string,
  gmailId:  string,
  labelIds: string[],
  status:   string,
): Promise<void> {
  const { error } = await getClient()
    .from('messages')
    .update({ label_ids: labelIds, status })
    .eq('user_id', userId)
    .eq('gmail_id', gmailId);

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
}

// ── getUser ───────────────────────────────────────────────────────────────────

/**
 * Fetches a single user row by primary key.
 * Returns null when no row exists for the given userId.
 * Throws on unexpected database errors.
 */
export async function getUser(userId: string): Promise<UserRow | null> {
  const { data, error } = await getClient()
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new ProviderError('USER_NOT_FOUND', error.message, error);
  }

  return data;
}

// ── updateUserTokens ──────────────────────────────────────────────────────────

/**
 * Writes refreshed OAuth credentials for a user.
 * Called by the googleapis 'tokens' event listener on every silent refresh.
 *
 * All three values arrive pre-encrypted — this function does not perform any
 * cryptographic operations.
 */
export async function updateUserTokens(
  userId: string,
  tokens: {
    encryptedAccessToken:   string;
    encryptedRefreshToken?: string;   // omit when only the access token rotated
    tokenExpiresAt:         number | null;
  },
): Promise<void> {
  const payload: {
    encrypted_access_token:   string;
    encrypted_refresh_token?: string;
    token_expires_at:         number | null;
  } = {
    encrypted_access_token: tokens.encryptedAccessToken,
    token_expires_at:       tokens.tokenExpiresAt,
  };
  if (tokens.encryptedRefreshToken !== undefined) {
    payload.encrypted_refresh_token = tokens.encryptedRefreshToken;
  }

  const { error } = await getClient()
    .from('users')
    .update(payload)
    .eq('id', userId);

  if (error) {
    throw new ProviderError('TOKEN_UPDATE_FAILED', error.message, error);
  }
}

// ── updateHistoryId ───────────────────────────────────────────────────────────

/**
 * Advances users.history_id after each successful sync cycle.
 * The stored history_id is the startHistoryId for the next delta fetch.
 */
export async function updateHistoryId(
  userId:    string,
  historyId: string,
): Promise<void> {
  const { error } = await getClient()
    .from('users')
    .update({ history_id: historyId })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
}

// ── updateWatchExpiry ─────────────────────────────────────────────────────────

/**
 * Persists the Gmail watch expiry timestamp and resource ID after a renewal.
 * watch_expiry is a Unix timestamp in milliseconds (as returned by Gmail API).
 * watch_resource_id can be null when the caller wants to clear the field.
 */
export async function updateWatchExpiry(
  userId:          string,
  watchExpiry:     number | null,
  watchResourceId: string | null,
): Promise<void> {
  const { error } = await getClient()
    .from('users')
    .update({
      watch_expiry:      watchExpiry,
      watch_resource_id: watchResourceId,
    })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('WATCH_SETUP_FAILED', error.message, error);
  }
}
