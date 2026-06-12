import { google } from 'googleapis';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { normalizeMessage, deriveStatus } from './normalize';
import { upsertMessage, getInboxMessageRows, updateMessageLabels } from '../db';
import { ProviderError } from '../types/provider';

const MAX_INITIAL_SYNC = 50;

// Messages fetched per backfill invocation. Each messages.get(FULL) is a
// sequential round-trip to Gmail, so this is bounded to stay comfortably
// under the Vercel serverless function timeout. The caller loops across
// invocations using the returned cursor until done === true.
const BACKFILL_BATCH = 100;

// Default overall cap on a backfill run when the caller does not specify one.
const DEFAULT_BACKFILL_MAX = 500;

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

// ── Backfill (older history) ───────────────────────────────────────────────

/** Opaque resume state for a backfill run, threaded through the API cursor. */
interface BackfillCursor {
  /** Gmail messages.list pageToken to resume from. */
  pageToken: string;
  /** Messages already synced by prior invocations of this run. */
  synced: number;
}

export interface BackfillResult {
  /** Cumulative messages synced across this run so far. */
  synced: number;
  /** Messages synced during this single invocation. */
  syncedThisCall: number;
  /** true when the cap was reached or the mailbox is exhausted. */
  done: boolean;
  /** Opaque cursor to pass back on the next call; null when done. */
  nextCursor: string | null;
}

/** base64url-encodes the resume cursor for transport in the API response. */
function encodeBackfillCursor(c: BackfillCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

/**
 * Decodes an inbound backfill cursor. Throws INVALID_LIMIT (422) on a
 * malformed cursor so the handler returns a clean client error.
 */
export function decodeBackfillCursor(raw: string): BackfillCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as BackfillCursor).pageToken === 'string' &&
      typeof (parsed as BackfillCursor).synced === 'number'
    ) {
      return parsed as BackfillCursor;
    }
  } catch {
    // fall through to the thrown error below
  }
  throw new ProviderError('INVALID_LIMIT', 'cursor is malformed');
}

/**
 * Backfills older INBOX history beyond the initial 50-message seed sync.
 *
 * Resumable and capped: each call processes at most BACKFILL_BATCH messages,
 * then returns a cursor encoding the Gmail pageToken and the running count.
 * The caller invokes repeatedly with the returned cursor until done === true.
 * The cap (max) is enforced statelessly across calls via the cursor, so no
 * server-side run state — and therefore no migration — is required.
 *
 * upsertMessage conflicts on gmail_id, so re-walking messages already stored
 * by the initial sync is idempotent (no duplicate rows).
 *
 * Like runInitialSync, this does NOT touch users.history_id — the Pub/Sub
 * checkpoint set by setupWatch must not be regressed to an older message's id.
 */
export async function runBackfill(
  userId: string,
  opts: { max?: number; cursor?: string } = {},
): Promise<BackfillResult> {
  const max   = opts.max ?? DEFAULT_BACKFILL_MAX;
  const start = opts.cursor ? decodeBackfillCursor(opts.cursor) : undefined;

  let totalSynced = start?.synced ?? 0;
  let pageToken: string | undefined = start?.pageToken;
  let syncedThisCall = 0;

  const auth  = await loadOAuth2Client(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    while (syncedThisCall < BACKFILL_BATCH && totalSynced < max) {
      // Bound the page so we never fetch more refs than we will process this
      // call — this guarantees the inner loop drains the whole page before we
      // advance pageToken, so no message is ever skipped.
      const remaining = Math.min(
        BACKFILL_BATCH - syncedThisCall,
        max - totalSynced,
      );

      const { data: listData } = await gmail.users.messages.list({
        userId:     'me',
        labelIds:   ['INBOX'],
        maxResults: remaining,
        ...(pageToken ? { pageToken } : {}),
      });

      const refs = listData.messages ?? [];
      if (refs.length === 0) { pageToken = undefined; break; }

      for (const ref of refs) {
        if (!ref.id) continue;

        const { data: msg } = await gmail.users.messages.get({
          userId: 'me',
          id:     ref.id,
          format: 'FULL',
        });

        await upsertMessage(normalizeMessage(msg, userId));
        totalSynced++;
        syncedThisCall++;
      }

      pageToken = listData.nextPageToken ?? undefined;
      if (!pageToken) break;   // mailbox exhausted
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(
      'GMAIL_LIST_FAILED',
      err instanceof Error ? err.message : 'Gmail backfill failed',
      err,
    );
  }

  const done = totalSynced >= max || !pageToken;

  return {
    synced:         totalSynced,
    syncedThisCall,
    done,
    nextCursor:     done || !pageToken
                      ? null
                      : encodeBackfillCursor({ pageToken, synced: totalSynced }),
  };
}

// ── Reconcile (drop stale INBOX labels) ────────────────────────────────────

export interface InboxReconcileResult {
  /** Authoritative live inbox size from Gmail (messages.list yield). */
  inboxCount: number;
  /** How many local rows had a stale INBOX label dropped this call. */
  removed: number;
  /** The gmailIds that left the inbox, so the client can splice them out. */
  removedGmailIds: string[];
}

/**
 * Reconciles the locally-stored inbox against Gmail's live inbox.
 *
 * The append-side backfill only ADDS messages; it never learns that a message
 * was archived/trashed in Gmail after we synced it (messages.list with the
 * INBOX filter simply stops returning it, so we never revisit the row). This
 * pass closes that gap: it lists the authoritative set of inbox message ids
 * (ids only — cheap, no FULL fetches), finds rows we still tag INBOX that are
 * no longer in that set, and strips the stale INBOX label, recomputing status.
 *
 * Self-sent mail is unaffected: it carries both SENT and INBOX, so it stays in
 * Gmail's INBOX list and is never treated as stale. A self-sent message that is
 * later archived loses INBOX but keeps SENT, so it correctly becomes 'sent'.
 */
export async function reconcileInbox(userId: string): Promise<InboxReconcileResult> {
  const auth  = await loadOAuth2Client(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Authoritative live inbox id set — ids only, so this stays cheap even for a
  // large mailbox (500 ids per page).
  const liveIds = new Set<string>();
  let pageToken: string | undefined;

  try {
    do {
      const { data } = await gmail.users.messages.list({
        userId:     'me',
        labelIds:   ['INBOX'],
        maxResults: 500,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const ref of data.messages ?? []) {
        if (ref.id) liveIds.add(ref.id);
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(
      'GMAIL_LIST_FAILED',
      err instanceof Error ? err.message : 'Gmail inbox reconcile failed',
      err,
    );
  }

  const storedRows = await getInboxMessageRows(userId);
  const stale = storedRows.filter((r) => !liveIds.has(r.gmail_id));

  for (const row of stale) {
    const newLabels = row.label_ids.filter((l) => l !== 'INBOX');
    await updateMessageLabels(userId, row.gmail_id, newLabels, deriveStatus(newLabels));
  }

  return {
    inboxCount:      liveIds.size,
    removed:         stale.length,
    removedGmailIds: stale.map((r) => r.gmail_id),
  };
}
