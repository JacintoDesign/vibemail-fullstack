import { gmail_v1 } from 'googleapis';

/**
 * Resolves a Gmail draft id (`drafts.id`) from a draft's message id (`gmailId`).
 *
 * The draft endpoints (delete / update / send) need the `drafts.id` to call the
 * Gmail drafts API, and normally read it from the persisted `draft_id` column.
 * But that column is only written by `POST /api/v1/drafts`; drafts that reach
 * Supabase via the Pub/Sub webhook (composed directly in Gmail, or pre-existing)
 * have `draft_id = null` because `toRow` in sync/normalize deliberately omits it.
 * For those, this looks the draft id up live by listing the user's drafts and
 * matching on the underlying message id.
 *
 * `drafts.list` returns only `{ id, message: { id } }` per draft, so it is cheap.
 * Returns null if no draft maps to the given message id.
 */
export async function resolveDraftId(
  gmail: gmail_v1.Gmail,
  gmailMessageId: string,
): Promise<string | null> {
  let pageToken: string | undefined;
  do {
    const { data } = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const draft of data.drafts ?? []) {
      if (draft.message?.id === gmailMessageId && draft.id) return draft.id;
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return null;
}

/**
 * True when a thrown Gmail/Gaxios error is an HTTP 404 — i.e. the draft (or
 * message) no longer exists server-side. Used to treat "already gone in Gmail"
 * as success when cleaning up an orphaned Supabase row.
 */
export function isGmailNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: number | string; response?: { status?: number } };
  return e.code === 404 || e.code === '404' || e.response?.status === 404;
}
