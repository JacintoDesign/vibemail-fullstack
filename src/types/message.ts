export interface Message {
  // ── Supabase-managed ───────────────────────────────────────────────────
  id:         string;        // TEXT PRIMARY KEY — set to gmailId at insert
  userId:     string;        // UUID NOT NULL REFERENCES users(id)
  createdAt:  string;        // TIMESTAMPTZ ISO 8601
  updatedAt:  string;        // TIMESTAMPTZ ISO 8601

  // ── Provider message identifiers ───────────────────────────────────────
  gmailId:    string;
  threadId:   string;
  labelIds:   string[];

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
}
