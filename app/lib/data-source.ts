// Data-source seam. Phase 1 returned the in-memory sample mailbox; Phase 2
// fetches live data from the `/api/v1` contract. The shell consumes UI `Message`
// objects regardless, so only this file (and `api.ts`) know about the wire shape.

import { getAccountEmail } from "./auth";
import {
  backfillInbox,
  getThread,
  labelToId,
  listMessages,
  reconcileInbox,
  searchMessages,
  threadMsgOf,
  toUiMessage,
} from "./api";
import type { BackfillResult, ReconcileResult } from "./api";
import type { Label, Message, ThreadMsg } from "./types";

export interface MessagePage {
  messages: Message[];
  nextCursor: string | null;
  // Keyset of the last loaded row; lets the caller resume paging after a
  // backfill adds older rows even once nextCursor has gone null.
  endCursor: string | null;
}

// Fallback cap when the true inbox size isn't known yet (no /labels response).
const BACKFILL_MAX = 500;
// The server caps a single backfill run at 5000 (and requires >= 1) — see
// POST /api/v1/sync/backfill. A real inbox total above that would otherwise be
// passed straight through as `max` and rejected with 422 INVALID_LIMIT.
const BACKFILL_MAX_CEILING = 5000;

/**
 * Pull the next batch of older inbox history from Gmail into the DB. Drives the
 * inbox "Load more" / background auto-sync once the locally-paged rows run out.
 * `cursor` resumes a prior run; omit it to start fresh. `max` bounds the whole
 * run — pass the real inbox total so a full auto-sync terminates naturally; it
 * is clamped to the server's 1..5000 range so a large mailbox can't 422.
 */
export function backfillOlderInbox(cursor?: string, max: number = BACKFILL_MAX): Promise<BackfillResult> {
  const safeMax = Math.min(BACKFILL_MAX_CEILING, Math.max(1, Math.floor(max)));
  return backfillInbox({ max: safeMax, cursor });
}

/**
 * Reconcile the locally-stored inbox against Gmail's live inbox: drops the
 * INBOX label from mail that has since been archived/trashed/deleted, so the
 * inbox count matches Gmail. Returns the live count and the gmailIds removed.
 */
export function reconcileInboxLabels(): Promise<ReconcileResult> {
  return reconcileInbox();
}

// The sidebar label list. No label-name endpoint exists in CONTRACT.md, so the
// nav offers a fixed set; chips on individual rows are derived from labelIds.
export const DEFAULT_LABELS: Label[] = ["Social", "Updates", "Forums", "Shopping", "Promotions"];

/** The signed-in account address, decoded from the JWT. */
export function getAccount(): string {
  return getAccountEmail();
}

/** Map a UI folder key to the Gmail labelId the list endpoint filters on. */
function folderLabelId(folder: string): string | undefined {
  switch (folder) {
    case "all":
      return "INBOX";
    case "starred":
      return "STARRED";
    case "sent":
      return "SENT";
    case "drafts":
      return "DRAFT";
    case "trash":
      return "TRASH";
    case "archived":
      // No single Gmail label marks "archived" (it is the absence of INBOX/
      // SENT/DRAFT/TRASH), so it is server-filtered by the `status` param
      // instead of a labelId — see fetchFolder.
      return undefined;
    default:
      if (folder.startsWith("label:")) return labelToId(folder.slice(6));
      return undefined;
  }
}

/** Fetch one server page for a folder, mapped to UI messages. */
export async function fetchFolder(folder: string, cursor?: string): Promise<MessagePage> {
  const labelId = folderLabelId(folder);
  // Archive has no labelId — page it server-side by its derived status so it
  // isn't limited to whatever archived rows happen to fall in the first page.
  const status = folder === "archived" ? "archived" : undefined;
  const page = await listMessages({ labelId, status, cursor, limit: 50 });
  const messages = page.messages.map(toUiMessage);
  return { messages, nextCursor: page.nextCursor, endCursor: page.endCursor ?? null };
}

/** Fetch one server page of search results, mapped to UI messages. */
export async function fetchSearch(q: string, cursor?: string): Promise<MessagePage> {
  const page = await searchMessages({ q, cursor, limit: 50 });
  return {
    messages: page.messages.filter((m) => m.status !== "trash").map(toUiMessage),
    nextCursor: page.nextCursor,
    endCursor: page.endCursor ?? null,
  };
}

/** Load a full thread (oldest-first) as renderable thread cards. */
export async function loadThread(threadId: string): Promise<ThreadMsg[]> {
  const { messages } = await getThread(threadId);
  return messages.map(threadMsgOf);
}
