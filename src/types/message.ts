export type MessageStatus = 'inbox' | 'sent' | 'draft' | 'archived' | 'trash';

export interface Attachment {
  /** Gmail part `body.attachmentId` — required to fetch the bytes via
   *  `messages.attachments.get`. Opaque, per-message; not globally stable. */
  attachmentId: string;
  filename:     string;
  mimeType:     string;
  size:         number;   // bytes, from the Gmail part `body.size`
}

export interface Message {
  // ── Supabase-managed ───────────────────────────────────────────────────
  id:         string;        // TEXT PRIMARY KEY — set to gmailId at insert
  userId:     string;        // UUID NOT NULL REFERENCES users(id)
  createdAt:  string;        // TIMESTAMPTZ ISO 8601
  updatedAt:  string;        // TIMESTAMPTZ ISO 8601

  // ── Provider message identifiers ───────────────────────────────────────
  gmailId:      string;
  threadId:     string;
  labelIds:     string[];
  internalDate: string;   // Unix ms timestamp string from Gmail — used to set created_at

  // ── Headers ────────────────────────────────────────────────────────────
  from:       string;
  to:         string;
  subject:    string;
  date:       string;        // RFC 2822

  // ── Content ────────────────────────────────────────────────────────────
  snippet:    string;
  bodyPlain:  string | null;
  bodyHtml:   string | null;

  // ── Derived flags ──────────────────────────────────────────────────────
  isRead:     boolean;
  isStarred:  boolean;

  // ── Status & draft identity ────────────────────────────────────────────
  status:     MessageStatus;   // derived from labelIds at write time
  draftId:    string | null;   // Gmail drafts.id — only set for draft rows

  // ── Attachments ────────────────────────────────────────────────────────
  attachments: Attachment[];   // received-mail attachment metadata (bytes fetched on demand)
}
