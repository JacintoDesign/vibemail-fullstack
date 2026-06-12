// Shared types for the VibeMail front end.
// `Message` is a superset of the CONTRACT.md §3 shape plus the UI-display
// conveniences the design-handoff components read (senderName/senderEmail
// parsed from `from`, a short `time` label, display `labels`, and a rendered
// `thread[]`). Phase 2 maps the live API response onto this same shape.

import type { CSSProperties } from "react";

export type MessageStatus = "inbox" | "sent" | "draft" | "archived" | "trash";

export interface Attachment {
  /** Gmail part `body.attachmentId` — passed back to the download endpoint. */
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ThreadMsg {
  from: string;
  email: string;
  date: string;
  /** Plain-text body — the primary rendering. Falls back to the snippet. */
  body: string;
  /** Decoded HTML body, rendered in a sandboxed iframe when `body` is empty. */
  bodyHtml?: string | null;
  /** Gmail message id for this thread message (used to fetch attachment bytes
   *  on demand). */
  gmailId?: string;
  /** Received-mail attachments. Bytes are fetched lazily on download. */
  attachments?: Attachment[];
}

export interface Message {
  // ── CONTRACT core ──────────────────────────────────────────────
  id: string;
  /** Gmail message id. The action endpoints (PATCH /messages/:id, drafts)
   *  key on this, NOT the Supabase `id` (which is a generated UUID). */
  gmailId: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  bodyPlain?: string | null;
  bodyHtml?: string | null;
  labelIds: string[];
  isRead: boolean;
  isStarred: boolean;
  status: MessageStatus;
  draftId: string | null;

  // ── UI conveniences ────────────────────────────────────────────
  senderName: string;
  senderEmail: string;
  time: string;
  labels: string[];
  hasAttachment: boolean;
  thread: ThreadMsg[];
}

export type Label = string;

export type Folder =
  | "all"
  | "starred"
  | "sent"
  | "drafts"
  | "archived"
  | "trash"
  | `label:${string}`;

/** Inline styles that also set CSS custom properties (`--foo`) under strict mode. */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number>;
