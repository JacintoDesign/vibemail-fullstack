// Phase-2 API layer. Typed wrappers over every CONTRACT.md endpoint plus the
// mapper that turns the wire `Message` shape into the UI `Message` superset the
// design-handoff components consume. All requests go through `apiFetch`, which
// attaches the Bearer JWT and uses the relative `/api/v1` base path.

import { apiFetch } from "./api-client";
import type { Attachment, Message, MessageStatus, ThreadMsg } from "./types";

// ── Wire shape (CONTRACT.md §3) ──────────────────────────────────────────────
// The exact JSON the endpoints return. A strict subset of the UI `Message`.

export interface ApiMessage {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  gmailId: string;
  threadId: string;
  labelIds: string[];
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  bodyPlain: string | null;
  bodyHtml: string | null;
  isRead: boolean;
  isStarred: boolean;
  status: MessageStatus;
  draftId: string | null;
  attachments?: Attachment[];
}

export interface MessagePage {
  messages: ApiMessage[];
  nextCursor: string | null;
}

/** The PATCH /messages/:id response is a partial — only the mutated flags. */
export interface PatchResult {
  id: string;
  isRead: boolean;
  isStarred: boolean;
  status: MessageStatus;
}

// ── Field helpers ────────────────────────────────────────────────────────────

/** Split an RFC 2822 `From`/`To` header into a display name and bare address. */
export function parseSender(header: string): { name: string; email: string } {
  const raw = (header || "").trim();
  const angled = raw.match(/^(.*?)<([^>]+)>$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"|"$/g, "");
    const email = angled[2].trim();
    return { name: name || email, email };
  }
  // Bare address — derive a name from the local part.
  if (raw.includes("@")) {
    const local = raw.split("@")[0].replace(/[._]+/g, " ").trim();
    const name = local.replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: name || raw, email: raw };
  }
  return { name: raw || "(unknown)", email: raw };
}

/** A short, list-friendly timestamp from an RFC 2822 date string. */
export function timeLabel(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date || "";
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { year: "2-digit", month: "numeric", day: "numeric" });
}

// Gmail system labels that never surface as user-facing chips.
const SYSTEM_LABELS = new Set([
  "INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "UNREAD", "STARRED", "IMPORTANT", "CHAT",
]);
// Gmail category labels → friendly chip names (and the reverse, for filtering).
const CATEGORY_TO_NAME: Record<string, string> = {
  CATEGORY_SOCIAL: "Social",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_PERSONAL: "Personal",
};
const NAME_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_TO_NAME).map(([id, name]) => [name, id]),
);

/** Map a friendly sidebar label name back to the Gmail labelId for filtering. */
export function labelToId(name: string): string {
  return NAME_TO_CATEGORY[name] ?? name;
}

/** Derive user-facing label chips from raw Gmail labelIds. */
export function userLabels(labelIds: string[]): string[] {
  return (labelIds || [])
    .map((id) => CATEGORY_TO_NAME[id] ?? id)
    .filter((l) => !SYSTEM_LABELS.has(l) && !l.startsWith("CATEGORY_"));
}

// ── Mapper: wire Message → UI Message ────────────────────────────────────────

/**
 * Map one wire `ApiMessage` to a renderable `ThreadMsg`. The single source of
 * truth for this conversion — used both for the synthetic single-message thread
 * on a list row (`toUiMessage`) and for the full thread fetch (`loadThread` in
 * data-source). Keep all `ApiMessage → ThreadMsg` mapping here so a new field
 * can't be added to one path and forgotten in the other.
 */
export function threadMsgOf(api: ApiMessage): ThreadMsg {
  const { name, email } = parseSender(api.from);
  return {
    from: name,
    email,
    date: timeLabel(api.date),
    // Keep the plain body exactly as the wire reports it — an empty string here
    // is the signal MessageCard uses to fall back to the sandboxed HTML iframe.
    body: api.bodyPlain ?? "",
    bodyHtml: api.bodyHtml,
    gmailId: api.gmailId,
    attachments: api.attachments ?? [],
  };
}

export function toUiMessage(api: ApiMessage): Message {
  const { name, email } = parseSender(api.from);
  return {
    id: api.id,
    gmailId: api.gmailId,
    threadId: api.threadId,
    from: api.from,
    to: api.to,
    subject: api.subject,
    date: api.date,
    snippet: api.snippet,
    bodyPlain: api.bodyPlain,
    bodyHtml: api.bodyHtml,
    labelIds: api.labelIds ?? [],
    isRead: api.isRead,
    isStarred: api.isStarred,
    status: api.status,
    draftId: api.draftId,
    senderName: name,
    senderEmail: email,
    time: timeLabel(api.date),
    labels: userLabels(api.labelIds ?? []),
    hasAttachment: (api.attachments?.length ?? 0) > 0,
    thread: [threadMsgOf(api)],
  };
}

// ── Endpoint wrappers ────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** GET /api/v1/messages — paginated list, optionally filtered by labelId or status. */
export function listMessages(opts: {
  cursor?: string;
  limit?: number;
  labelId?: string;
  status?: MessageStatus;
} = {}): Promise<MessagePage> {
  return apiFetch<MessagePage>(
    `/messages${qs({ cursor: opts.cursor, limit: opts.limit, labelId: opts.labelId, status: opts.status })}`,
  );
}

/** GET /api/v1/messages/:id — fetch a single message by gmailId. */
export function getMessage(id: string): Promise<{ message: ApiMessage }> {
  return apiFetch(`/messages/${encodeURIComponent(id)}`);
}

/** GET /api/v1/messages/search — server-side substring search. */
export function searchMessages(opts: {
  q: string;
  cursor?: string;
  limit?: number;
}): Promise<MessagePage> {
  return apiFetch<MessagePage>(
    `/messages/search${qs({ q: opts.q, cursor: opts.cursor, limit: opts.limit })}`,
  );
}

/** One Gmail label with its counts, as returned by GET /api/v1/labels. */
export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal: number;
  messagesUnread: number;
  threadsTotal: number;
  threadsUnread: number;
  color: { textColor?: string; backgroundColor?: string } | null;
}

/** GET /api/v1/labels — the Gmail label catalog with per-label counts. */
export function listLabels(): Promise<{ labels: GmailLabel[] }> {
  return apiFetch(`/labels`);
}

/** GET /api/v1/threads/:threadId — all synced messages in a thread, oldest-first. */
export function getThread(threadId: string): Promise<{ threadId: string; messages: ApiMessage[] }> {
  return apiFetch(`/threads/${encodeURIComponent(threadId)}`);
}

/** Resolved attachment after a successful upload. */
export interface UploadedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Upload a file in two steps so it isn't capped by the serverless request-body
 * limit: (1) ask the backend for a signed Storage upload URL, then (2) PUT the
 * bytes straight to Supabase Storage. Returns the opaque attachmentId to send.
 */
export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  const mimeType = file.type || "application/octet-stream";
  const { attachmentId, uploadUrl } = await apiFetch<{ attachmentId: string; uploadUrl: string }>(
    `/attachments`,
    { method: "POST", body: JSON.stringify({ filename: file.name, size: file.size }) },
  );
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": mimeType, "x-upsert": "true" },
  });
  if (!put.ok) {
    throw new Error(`Storage upload failed (${put.status})`);
  }
  return { attachmentId, filename: file.name, mimeType, size: file.size };
}

/**
 * GET /api/v1/attachments — download a received-mail attachment.
 *
 * The endpoint stages the bytes in Storage and returns a short-lived signed
 * `downloadUrl` (rather than the bytes themselves) so large files aren't capped
 * by the serverless response limit. The signed URL carries a Content-Disposition
 * that forces a save, so navigating an anchor to it downloads without leaving
 * the app. `gmailId` is the message id and `attachmentId` the Gmail part id;
 * `filename`/`mimeType` set the saved file name and Content-Type.
 */
export async function downloadAttachment(att: {
  gmailId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
}): Promise<void> {
  const { downloadUrl, filename } = await apiFetch<{ downloadUrl: string; filename: string }>(
    `/attachments${qs({
      messageId: att.gmailId,
      attachmentId: att.attachmentId,
      filename: att.filename,
      mimeType: att.mimeType,
    })}`,
  );
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename || att.filename || "attachment";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** POST /api/v1/messages — compose + send (optionally in-thread, with attachments). */
export function sendMessage(body: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  attachmentIds?: string[];
}): Promise<{ message: ApiMessage }> {
  return apiFetch(`/messages`, { method: "POST", body: JSON.stringify(body) });
}

/** PATCH /api/v1/messages/:id — read / starred / archived / trashed. */
export function patchMessage(
  id: string,
  body: { read?: boolean; starred?: boolean; archived?: boolean; trashed?: boolean },
): Promise<{ message: PatchResult }> {
  return apiFetch(`/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** DELETE /api/v1/messages/:id — remove a non-draft message (Gmail trash + row drop, 204). */
export function deleteMessage(id: string): Promise<void> {
  return apiFetch(`/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** POST /api/v1/messages/:id/labels — add a (non-protected) label to a message. */
export function addMessageLabel(id: string, labelId: string): Promise<{ message: ApiMessage }> {
  return apiFetch(`/messages/${encodeURIComponent(id)}/labels`, {
    method: "POST",
    body: JSON.stringify({ labelId }),
  });
}

/** DELETE /api/v1/messages/:id/labels — remove a label from a message. */
export function removeMessageLabel(id: string, labelId: string): Promise<{ message: ApiMessage }> {
  return apiFetch(`/messages/${encodeURIComponent(id)}/labels`, {
    method: "DELETE",
    body: JSON.stringify({ labelId }),
  });
}

/** POST /api/v1/drafts — create a Gmail draft (server manages draftId). */
export function createDraft(body: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ message: ApiMessage }> {
  return apiFetch(`/drafts`, { method: "POST", body: JSON.stringify(body) });
}

/** PATCH /api/v1/drafts/:id — update draft content. */
export function updateDraft(
  id: string,
  body: { to?: string; subject?: string; body?: string },
): Promise<{ message: ApiMessage }> {
  return apiFetch(`/drafts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** DELETE /api/v1/drafts/:id — delete the Gmail draft + Supabase row (204). */
export function deleteDraft(id: string): Promise<void> {
  return apiFetch(`/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** POST /api/v1/drafts/:id/send — send an existing draft. */
export function sendDraft(id: string): Promise<{ message: ApiMessage }> {
  return apiFetch(`/drafts/${encodeURIComponent(id)}/send`, { method: "POST" });
}
