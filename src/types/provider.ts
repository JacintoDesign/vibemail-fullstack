import { Message } from './message';

// ── OAuth token shape ────────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken:  string;
  refreshToken: string;
  expiresAt?:   number;   // Unix timestamp in ms
}

// ── listMessages ─────────────────────────────────────────────────────────────

export interface ListMessagesOptions {
  cursor?:  string;   // opaque pagination cursor (Gmail pageToken equivalent)
  limit?:   number;   // default 20, max 100
  labelId?: string;   // filter by provider label ID (e.g. "INBOX")
}

export interface ListMessagesResult {
  messages:   Message[];
  nextCursor: string | null;   // null when no further pages exist
}

// ── sendMessage ──────────────────────────────────────────────────────────────

export interface SendMessageOptions {
  to:        string;
  subject:   string;
  body:      string;
  threadId?: string;        // omit for new compose; include for threaded reply
  attachmentIds?: string[]; // ids from POST /api/v1/attachments to attach
}

// ── Error ────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  constructor(
    public readonly code: string,      // SCREAMING_SNAKE_CASE — matches CONTRACT.md error codes
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ── Provider interface ───────────────────────────────────────────────────────

export interface EmailProvider {
  // OAuth flow
  initiateOAuth(): Promise<{ url: string; state: string }>;
  exchangeCode(code: string, state?: string): Promise<OAuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  // Messages
  listMessages(options: ListMessagesOptions): Promise<ListMessagesResult>;
  sendMessage(options: SendMessageOptions): Promise<Message>;
  markRead(messageId: string, read: boolean): Promise<{ id: string; isRead: boolean }>;
}
