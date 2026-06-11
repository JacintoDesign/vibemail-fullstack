// Data-source seam. Phase 1 returned the in-memory sample mailbox; Phase 2
// fetches live data from the `/api/v1` contract. The shell consumes UI `Message`
// objects regardless, so only this file (and `api.ts`) know about the wire shape.

import { getAccountEmail } from "./auth";
import {
  getThread,
  labelToId,
  listMessages,
  parseSender,
  searchMessages,
  timeLabel,
  toUiMessage,
} from "./api";
import type { Label, Message, ThreadMsg } from "./types";

export interface MessagePage {
  messages: Message[];
  nextCursor: string | null;
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
      // SENT/DRAFT/TRASH), so it cannot be server-filtered by labelId — the
      // caller filters the returned page by status instead.
      return undefined;
    default:
      if (folder.startsWith("label:")) return labelToId(folder.slice(6));
      return undefined;
  }
}

/** Fetch one server page for a folder, mapped to UI messages. */
export async function fetchFolder(folder: string, cursor?: string): Promise<MessagePage> {
  const labelId = folderLabelId(folder);
  const page = await listMessages({ labelId, cursor, limit: 50 });
  let messages = page.messages.map(toUiMessage);
  if (folder === "archived") {
    messages = messages.filter((m) => m.status === "archived");
  }
  return { messages, nextCursor: page.nextCursor };
}

/** Fetch one server page of search results, mapped to UI messages. */
export async function fetchSearch(q: string, cursor?: string): Promise<MessagePage> {
  const page = await searchMessages({ q, cursor, limit: 50 });
  return {
    messages: page.messages.filter((m) => m.status !== "trash").map(toUiMessage),
    nextCursor: page.nextCursor,
  };
}

/** Load a full thread (oldest-first) as renderable thread cards. */
export async function loadThread(threadId: string): Promise<ThreadMsg[]> {
  const { messages } = await getThread(threadId);
  return messages.map((api) => {
    const { name, email } = parseSender(api.from);
    return {
      from: name,
      email,
      date: timeLabel(api.date),
      body: api.bodyPlain ?? "",
      bodyHtml: api.bodyHtml,
      gmailId: api.gmailId,
    };
  });
}
