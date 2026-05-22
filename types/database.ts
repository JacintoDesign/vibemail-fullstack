/**
 * VibeMail — Shared Database Types
 *
 * Two exports:
 *
 * 1. `Database` — Supabase client generic. Pass to createClient<Database>() so
 *    all .from() calls are fully typed.  Column names are snake_case to match
 *    the SQL schema (`from_address`, `to_address`, etc.).
 *
 * 2. `Message` — Camel-case interface from CONTRACT.md §3.  This is the shape
 *    returned by all four API endpoints.  The server layer (src/) is responsible
 *    for the snake_case ↔ camelCase mapping when reading/writing Supabase rows.
 *
 * Column name mapping (CONTRACT.md / TypeScript ↔ SQL):
 *   from      ↔ from_address
 *   to        ↔ to_address
 *   userId    ↔ user_id
 *   gmailId   ↔ gmail_id
 *   threadId  ↔ thread_id
 *   labelIds  ↔ label_ids
 *   bodyPlain ↔ body_plain
 *   bodyHtml  ↔ body_html
 *   isRead    ↔ is_read
 *   isStarred ↔ is_starred
 *   createdAt ↔ created_at
 *   updatedAt ↔ updated_at
 */

// ─────────────────────────────────────────────────────────────────────────────
// Database — Supabase client generic
// ─────────────────────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;                      // UUID
          google_id: string;               // Google OAuth sub; upsert conflict target
          email: string;
          name: string;
          /** AES-256-GCM ciphertext produced by the app layer. Never plaintext. */
          access_token: string;
          /** AES-256-GCM ciphertext produced by the app layer. Never plaintext. */
          refresh_token: string;
          token_expiry: string;            // TIMESTAMPTZ as ISO-8601 string
          history_id: string | null;       // last known Gmail historyId
          watch_expiry: string | null;     // TIMESTAMPTZ as ISO-8601 string
          watch_resource_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          google_id: string;
          email: string;
          name: string;
          access_token: string;
          refresh_token: string;
          token_expiry: string;
          history_id?: string | null;
          watch_expiry?: string | null;
          watch_resource_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          google_id?: string;
          email?: string;
          name?: string;
          access_token?: string;
          refresh_token?: string;
          token_expiry?: string;
          history_id?: string | null;
          watch_expiry?: string | null;
          watch_resource_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      messages: {
        Row: {
          id: string;                      // TEXT PRIMARY KEY — set to gmail_id at insert
          user_id: string;                 // UUID → users.id
          created_at: string;
          updated_at: string;
          gmail_id: string;
          thread_id: string;
          label_ids: string[];
          from_address: string;            // CONTRACT.md: from
          to_address: string;              // CONTRACT.md: to
          subject: string;
          date: string;                    // RFC 2822
          snippet: string;
          body_plain: string | null;
          body_html: string | null;
          is_read: boolean;
          is_starred: boolean;
        };
        Insert: {
          id: string;                      // caller must supply gmail_id value
          user_id: string;
          created_at?: string;
          updated_at?: string;
          gmail_id: string;
          thread_id: string;
          label_ids?: string[];
          from_address: string;
          to_address: string;
          subject?: string;
          date: string;
          snippet?: string;
          body_plain?: string | null;
          body_html?: string | null;
          is_read?: boolean;
          is_starred?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          gmail_id?: string;
          thread_id?: string;
          label_ids?: string[];
          from_address?: string;
          to_address?: string;
          subject?: string;
          date?: string;
          snippet?: string;
          body_plain?: string | null;
          body_html?: string | null;
          is_read?: boolean;
          is_starred?: boolean;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Message — API response shape (CONTRACT.md §3)
// ─────────────────────────────────────────────────────────────────────────────
// This is the camelCase interface returned by all four endpoints.
// The server layer maps from the snake_case DB row to this shape.
//
// Note: `from` and `to` are preserved here as-is (reserved in SQL only).

export interface Message {
  // Supabase-managed
  id: string;          // TEXT PRIMARY KEY — equals gmailId
  userId: string;      // UUID → users.id
  createdAt: string;   // TIMESTAMPTZ
  updatedAt: string;   // TIMESTAMPTZ

  // Gmail message root
  gmailId: string;
  threadId: string;
  labelIds: string[];  // e.g. ["INBOX", "UNREAD", "STARRED"]

  // Headers
  from: string;        // "Alice Example <alice@example.com>"
  to: string;
  subject: string;
  date: string;        // RFC 2822

  // Content
  snippet: string;     // ≤100 chars, HTML-entity-escaped
  bodyPlain: string | null;
  bodyHtml: string | null;

  // Derived flags (computed from labelIds at write time)
  isRead: boolean;     // !labelIds.includes("UNREAD")
  isStarred: boolean;  // labelIds.includes("STARRED")
}
