/**
 * Unit tests for src/sync/normalize.ts
 *
 * Pure functions — no Supabase, no Gmail API calls.
 * Covers:
 *   - decodeBase64Url
 *   - getHeader (case-insensitive)
 *   - findPartByMimeType (recursive)
 *   - extractBodies (multipart + single-part fallbacks)
 *   - normalizeMessage (isRead / isStarred derivation, from/to mapping)
 *   - toRow / rowToMessage (camelCase ↔ snake_case round-trip)
 */

import { gmail_v1 } from 'googleapis';
import {
  decodeBase64Url,
  getHeader,
  findPartByMimeType,
  extractBodies,
  normalizeMessage,
  toRow,
  rowToMessage,
  DbMessageRow,
} from '../../src/sync/normalize';

// ── decodeBase64Url ──────────────────────────────────────────────────────────

describe('decodeBase64Url', () => {
  it('decodes a base64url-encoded utf-8 string', () => {
    const text = 'Hello, VibeMail!';
    expect(decodeBase64Url(Buffer.from(text).toString('base64url'))).toBe(text);
  });

  it('handles HTML special characters', () => {
    const html = '<p>Hello &amp; "World"</p>';
    expect(decodeBase64Url(Buffer.from(html).toString('base64url'))).toBe(html);
  });

  it('handles multi-line content (email body)', () => {
    const body = 'Line 1\r\nLine 2\r\nLine 3';
    expect(decodeBase64Url(Buffer.from(body).toString('base64url'))).toBe(body);
  });
});

// ── getHeader ────────────────────────────────────────────────────────────────

describe('getHeader', () => {
  const headers: gmail_v1.Schema$MessagePartHeader[] = [
    { name: 'From',    value: 'Alice <alice@example.com>' },
    { name: 'To',      value: 'bob@example.com' },
    { name: 'Subject', value: 'Hello VibeMail' },
    { name: 'Date',    value: 'Mon, 01 Jan 2024 00:00:00 +0000' },
  ];

  it('returns the header value by exact name', () => {
    expect(getHeader(headers, 'From')).toBe('Alice <alice@example.com>');
    expect(getHeader(headers, 'Subject')).toBe('Hello VibeMail');
  });

  it('is case-insensitive (from → From, FROM → From)', () => {
    expect(getHeader(headers, 'from')).toBe('Alice <alice@example.com>');
    expect(getHeader(headers, 'FROM')).toBe('Alice <alice@example.com>');
    expect(getHeader(headers, 'subject')).toBe('Hello VibeMail');
    expect(getHeader(headers, 'SUBJECT')).toBe('Hello VibeMail');
  });

  it('returns empty string for a missing header', () => {
    expect(getHeader(headers, 'X-Custom')).toBe('');
    expect(getHeader(headers, 'Reply-To')).toBe('');
  });

  it('returns empty string for an empty header array', () => {
    expect(getHeader([], 'From')).toBe('');
  });
});

// ── findPartByMimeType ───────────────────────────────────────────────────────

describe('findPartByMimeType', () => {
  const plain = Buffer.from('Plain text body').toString('base64url');
  const html  = Buffer.from('<p>HTML body</p>').toString('base64url');

  const flatParts: gmail_v1.Schema$MessagePart[] = [
    { mimeType: 'text/plain', body: { data: plain } },
    { mimeType: 'text/html',  body: { data: html  } },
  ];

  it('finds a part by mimeType in a flat list', () => {
    expect(findPartByMimeType(flatParts, 'text/plain')).toBe('Plain text body');
    expect(findPartByMimeType(flatParts, 'text/html')).toBe('<p>HTML body</p>');
  });

  it('returns null when mimeType is not present', () => {
    expect(findPartByMimeType(flatParts, 'text/calendar')).toBeNull();
  });

  it('searches nested multipart/alternative parts recursively', () => {
    const nested: gmail_v1.Schema$MessagePart[] = [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: plain } },
          { mimeType: 'text/html',  body: { data: html  } },
        ],
      },
    ];
    expect(findPartByMimeType(nested, 'text/plain')).toBe('Plain text body');
    expect(findPartByMimeType(nested, 'text/html')).toBe('<p>HTML body</p>');
  });

  it('searches deeply nested multipart/mixed inside multipart/alternative', () => {
    const deep: gmail_v1.Schema$MessagePart[] = [
      {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: plain } },
            ],
          },
        ],
      },
    ];
    expect(findPartByMimeType(deep, 'text/plain')).toBe('Plain text body');
  });
});

// ── extractBodies ────────────────────────────────────────────────────────────

describe('extractBodies', () => {
  it('extracts plain and HTML from a multipart/alternative message', () => {
    const msg: gmail_v1.Schema$Message = {
      payload: {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: Buffer.from('plain body').toString('base64url') } },
          { mimeType: 'text/html',  body: { data: Buffer.from('<p>html body</p>').toString('base64url') } },
        ],
      },
    };
    const { bodyPlain, bodyHtml } = extractBodies(msg);
    expect(bodyPlain).toBe('plain body');
    expect(bodyHtml).toBe('<p>html body</p>');
  });

  it('falls back to root payload body for a single-part plain text message', () => {
    const msg: gmail_v1.Schema$Message = {
      payload: {
        mimeType: 'text/plain',
        body: { data: Buffer.from('single part plain').toString('base64url') },
      },
    };
    const { bodyPlain, bodyHtml } = extractBodies(msg);
    expect(bodyPlain).toBe('single part plain');
    expect(bodyHtml).toBeNull();
  });

  it('falls back to root payload body for a single-part HTML message', () => {
    const msg: gmail_v1.Schema$Message = {
      payload: {
        mimeType: 'text/html',
        body: { data: Buffer.from('<b>html only</b>').toString('base64url') },
      },
    };
    const { bodyPlain, bodyHtml } = extractBodies(msg);
    expect(bodyPlain).toBeNull();
    expect(bodyHtml).toBe('<b>html only</b>');
  });

  it('returns null for both when payload has no data and no parts', () => {
    const { bodyPlain, bodyHtml } = extractBodies({});
    expect(bodyPlain).toBeNull();
    expect(bodyHtml).toBeNull();
  });
});

// ── normalizeMessage ─────────────────────────────────────────────────────────

describe('normalizeMessage', () => {
  const userId = 'user-uuid-abc123';

  function buildMsg(labelIds: string[]): gmail_v1.Schema$Message {
    return {
      id:        'gmail_msg_id',
      threadId:  'thread_id_xyz',
      labelIds,
      snippet:   'Test snippet text',
      historyId: '99999',
      payload: {
        headers: [
          { name: 'From',    value: 'Alice <alice@example.com>' },
          { name: 'To',      value: 'bob@example.com' },
          { name: 'Subject', value: 'Hello VibeMail' },
          { name: 'Date',    value: 'Mon, 01 Jan 2024 00:00:00 +0000' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('Email body text').toString('base64url') },
          },
        ],
      },
    };
  }

  it('maps all gmail root fields to the Message shape', () => {
    const result = normalizeMessage(buildMsg(['INBOX']), userId);
    expect(result.gmailId).toBe('gmail_msg_id');
    expect(result.threadId).toBe('thread_id_xyz');
    expect(result.snippet).toBe('Test snippet text');
    expect(result.userId).toBe(userId);
    expect(result.labelIds).toEqual(['INBOX']);
  });

  it('maps From / To headers to from / to (not from_address / to_address)', () => {
    const result = normalizeMessage(buildMsg(['INBOX']), userId);
    expect(result.from).toBe('Alice <alice@example.com>');
    expect(result.to).toBe('bob@example.com');
    // The Message type uses camelCase field names
    expect((result as Record<string, unknown>).from_address).toBeUndefined();
    expect((result as Record<string, unknown>).to_address).toBeUndefined();
  });

  describe('isRead derivation from labelIds', () => {
    it('isRead=false when UNREAD label is present', () => {
      expect(normalizeMessage(buildMsg(['INBOX', 'UNREAD']), userId).isRead).toBe(false);
    });

    it('isRead=true when UNREAD label is absent', () => {
      expect(normalizeMessage(buildMsg(['INBOX']), userId).isRead).toBe(true);
    });

    it('isRead=true for an empty labelIds array', () => {
      expect(normalizeMessage(buildMsg([]), userId).isRead).toBe(true);
    });
  });

  describe('isStarred derivation from labelIds', () => {
    it('isStarred=true when STARRED label is present', () => {
      expect(normalizeMessage(buildMsg(['INBOX', 'STARRED']), userId).isStarred).toBe(true);
    });

    it('isStarred=false when STARRED label is absent', () => {
      expect(normalizeMessage(buildMsg(['INBOX']), userId).isStarred).toBe(false);
    });
  });
});

// ── toRow / rowToMessage round-trip ──────────────────────────────────────────

describe('toRow — camelCase Message → snake_case MessageRow', () => {
  const msg = {
    userId:    'user-uuid-123',
    gmailId:   'gmail_id_abc',
    threadId:  'thread_id_xyz',
    labelIds:  ['INBOX', 'UNREAD'],
    from:      'Alice <alice@example.com>',
    to:        'bob@example.com',
    subject:   'Hello',
    date:      'Mon, 01 Jan 2024 00:00:00 +0000',
    snippet:   'short snippet',
    bodyPlain: 'plain text',
    bodyHtml:  '<p>html text</p>',
    isRead:    false,
    isStarred: true,
  };

  it('maps from → from_address and to → to_address (SQL reserved word avoidance)', () => {
    const row = toRow(msg);
    expect(row.from_address).toBe(msg.from);
    expect(row.to_address).toBe(msg.to);
  });

  it('maps all camelCase fields to their snake_case equivalents', () => {
    const row = toRow(msg);
    expect(row.user_id).toBe(msg.userId);
    expect(row.gmail_id).toBe(msg.gmailId);
    expect(row.thread_id).toBe(msg.threadId);
    expect(row.label_ids).toEqual(msg.labelIds);
    expect(row.is_read).toBe(msg.isRead);
    expect(row.is_starred).toBe(msg.isStarred);
    expect(row.body_plain).toBe(msg.bodyPlain);
    expect(row.body_html).toBe(msg.bodyHtml);
  });
});

describe('rowToMessage — snake_case DbMessageRow → camelCase Message', () => {
  const row: DbMessageRow = {
    id:           'supabase-row-uuid',
    user_id:      'user-uuid-123',
    gmail_id:     'gmail_id_abc',
    thread_id:    'thread_id_xyz',
    label_ids:    ['INBOX'],
    from_address: 'Alice <alice@example.com>',
    to_address:   'bob@example.com',
    subject:      'Hello',
    date:         'Mon, 01 Jan 2024',
    snippet:      'short snippet',
    body_plain:   'plain text',
    body_html:    '<p>html</p>',
    is_read:      true,
    is_starred:   false,
    created_at:   '2024-01-01T00:00:00.000Z',
    updated_at:   '2024-01-02T00:00:00.000Z',
  };

  it('maps from_address → from and to_address → to', () => {
    const msg = rowToMessage(row);
    expect(msg.from).toBe(row.from_address);
    expect(msg.to).toBe(row.to_address);
  });

  it('maps all snake_case fields to their camelCase equivalents', () => {
    const msg = rowToMessage(row);
    expect(msg.id).toBe(row.id);
    expect(msg.userId).toBe(row.user_id);
    expect(msg.gmailId).toBe(row.gmail_id);
    expect(msg.threadId).toBe(row.thread_id);
    expect(msg.labelIds).toEqual(row.label_ids);
    expect(msg.isRead).toBe(row.is_read);
    expect(msg.isStarred).toBe(row.is_starred);
    expect(msg.bodyPlain).toBe(row.body_plain);
    expect(msg.bodyHtml).toBe(row.body_html);
    expect(msg.createdAt).toBe(row.created_at);
    expect(msg.updatedAt).toBe(row.updated_at);
  });
});
