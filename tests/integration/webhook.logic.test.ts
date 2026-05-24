/**
 * Integration tests for src/webhook/gmail.ts — processGmailNotification
 *
 * - Supabase is live (user rows, message upserts are real)
 * - Gmail API (googleapis) is mocked
 * - loadOAuth2Client is mocked
 *
 * Covers:
 *   - Invalid verification token → silently returns, no Gmail call
 *   - Malformed PubSub payload shape → silently returns
 *   - No user found for emailAddress → silently returns
 *   - No history_id stored (initial sync not complete) → advances history_id, skips delta
 *   - Happy path: delta fetch using stored history_id, upserts new messages
 *   - tokens event listener: fires updateUserTokens and persists refreshed token
 */

import { EventEmitter } from 'events';
import { processGmailNotification } from '../../src/webhook/gmail';
import * as authModule from '../../src/providers/gmail/auth';
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase';
import { decrypt } from '../../src/providers/gmail/auth';

// ── Gmail API mock ────────────────────────────────────────────────────────────

jest.mock('../../src/providers/gmail/auth', () => ({
  ...jest.requireActual('../../src/providers/gmail/auth'),
  loadOAuth2Client: jest.fn(),
}));

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
  },
}));

import { google } from 'googleapis';

const mockHistoryList  = jest.fn();
const mockMessagesGet  = jest.fn();

beforeEach(() => {
  (authModule.loadOAuth2Client as jest.Mock).mockResolvedValue({ fake: 'oauth2_client' });
  (google.gmail as jest.Mock).mockReturnValue({
    users: {
      messages: { get: mockMessagesGet },
      history:  { list: mockHistoryList },
    },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const VERIFICATION_TOKEN = 'test_pubsub_verification_token';

function makePubSubPayload(emailAddress: string, historyId: number): unknown {
  return {
    message: {
      data:        Buffer.from(JSON.stringify({ emailAddress, historyId })).toString('base64'),
      messageId:   `msg-${Date.now()}`,
      publishTime: new Date().toISOString(),
    },
    subscription: 'projects/test/subscriptions/vibemail-sub',
  };
}

function makeGmailMessage(id: string, userId: string, overrideLabels?: string[]) {
  return {
    id,
    threadId:  `thread_${id}`,
    labelIds:  overrideLabels ?? ['INBOX'],
    snippet:   `Snippet for ${id}`,
    historyId: '99999',
    payload: {
      headers: [
        { name: 'From',    value: 'sender@example.com' },
        { name: 'To',      value: 'recipient@example.com' },
        { name: 'Subject', value: `Subject for ${id}` },
        { name: 'Date',    value: new Date().toUTCString() },
      ],
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: Buffer.from(`Body for ${id}`).toString('base64url') },
        },
      ],
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processGmailNotification — verification and payload validation', () => {

  beforeEach(() => {
    process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = VERIFICATION_TOKEN;
  });

  it('returns silently when the verification token is wrong', async () => {
    const payload = makePubSubPayload('test@example.com', 12345);
    await processGmailNotification(payload, 'WRONG_TOKEN');
    expect(google.gmail).not.toHaveBeenCalled();
  });

  it('returns silently when GOOGLE_PUBSUB_VERIFICATION_TOKEN env var is unset', async () => {
    delete process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
    const payload = makePubSubPayload('test@example.com', 12345);
    await processGmailNotification(payload, VERIFICATION_TOKEN);
    expect(google.gmail).not.toHaveBeenCalled();
    process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = VERIFICATION_TOKEN;
  });

  it('returns silently when the payload is not an object', async () => {
    await processGmailNotification('not an object', VERIFICATION_TOKEN);
    expect(google.gmail).not.toHaveBeenCalled();
  });

  it('returns silently when the payload is missing the message field', async () => {
    await processGmailNotification({ subscription: 'sub' }, VERIFICATION_TOKEN);
    expect(google.gmail).not.toHaveBeenCalled();
  });

  it('returns silently when PubSub data is not valid JSON', async () => {
    const badPayload = {
      message: { data: Buffer.from('not valid json').toString('base64'), messageId: 'x', publishTime: '' },
      subscription: 'sub',
    };
    await processGmailNotification(badPayload, VERIFICATION_TOKEN);
    expect(google.gmail).not.toHaveBeenCalled();
  });
});

describe('processGmailNotification — user lookup', () => {

  beforeEach(() => {
    process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = VERIFICATION_TOKEN;
  });

  it('returns silently when no user exists for the emailAddress in Supabase', async () => {
    const payload = makePubSubPayload('nobody@vibemail-test.invalid', 12345);
    await processGmailNotification(payload, VERIFICATION_TOKEN);
    expect(google.gmail).not.toHaveBeenCalled();
  });
});

describe('processGmailNotification — no history_id stored', () => {
  let userId: string;
  let email:  string;

  beforeAll(async () => {
    process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = VERIFICATION_TOKEN;
    const user = await seedUser({ historyId: null });
    userId = user.id;
    email  = user.email;
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  it('updates history_id in Supabase and skips history.list when no history_id stored', async () => {
    const newHistoryId = 99001;
    const payload      = makePubSubPayload(email, newHistoryId);

    await processGmailNotification(payload, VERIFICATION_TOKEN);

    expect(mockHistoryList).not.toHaveBeenCalled();

    const { data } = await getTestClient()
      .from('users')
      .select('history_id')
      .eq('id', userId)
      .single();

    expect((data as { history_id: string }).history_id).toBe(String(newHistoryId));
  });
});

describe('processGmailNotification — happy path delta fetch', () => {
  let userId: string;
  let email:  string;

  beforeAll(async () => {
    process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = VERIFICATION_TOKEN;
    const user = await seedUser({ historyId: '10000' });
    userId = user.id;
    email  = user.email;
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  it('calls history.list with the stored history_id as startHistoryId', async () => {
    const messageId  = `delta_msg_${Date.now()}`;
    const newHistory = 10001;

    mockHistoryList.mockResolvedValue({
      data: {
        history: [
          { messagesAdded: [{ message: { id: messageId } }] },
        ],
        nextPageToken: undefined,
      },
    });
    mockMessagesGet.mockResolvedValue({ data: makeGmailMessage(messageId, userId) });

    await processGmailNotification(makePubSubPayload(email, newHistory), VERIFICATION_TOKEN);

    expect(mockHistoryList).toHaveBeenCalledWith(
      expect.objectContaining({ startHistoryId: '10000' }),
    );
  });

  it('upserts messages from the delta into Supabase', async () => {
    const messageId  = `upsert_msg_${Date.now()}`;
    const newHistory = 10002;

    mockHistoryList.mockResolvedValue({
      data: {
        history: [
          { messagesAdded: [{ message: { id: messageId } }] },
        ],
      },
    });
    mockMessagesGet.mockResolvedValue({ data: makeGmailMessage(messageId, userId) });

    await processGmailNotification(makePubSubPayload(email, newHistory), VERIFICATION_TOKEN);

    const { data } = await getTestClient()
      .from('messages')
      .select('gmail_id')
      .eq('gmail_id', messageId)
      .single();

    expect(data).not.toBeNull();
    expect((data as { gmail_id: string }).gmail_id).toBe(messageId);
  });

  it('advances history_id in Supabase to the new value from the notification', async () => {
    const newHistory = 10003;

    mockHistoryList.mockResolvedValue({ data: { history: [] } });

    await processGmailNotification(makePubSubPayload(email, newHistory), VERIFICATION_TOKEN);

    const { data } = await getTestClient()
      .from('users')
      .select('history_id')
      .eq('id', userId)
      .single();

    expect((data as { history_id: string }).history_id).toBe(String(newHistory));
  });

  it('deduplicates message IDs across labelsAdded and messagesAdded in the same history record', async () => {
    const messageId  = `dup_msg_${Date.now()}`;
    const newHistory = 10004;

    mockHistoryList.mockResolvedValue({
      data: {
        history: [
          {
            messagesAdded: [{ message: { id: messageId } }],
            labelsAdded:   [{ message: { id: messageId } }], // same ID
          },
        ],
      },
    });
    mockMessagesGet.mockResolvedValue({ data: makeGmailMessage(messageId, userId) });

    await processGmailNotification(makePubSubPayload(email, newHistory), VERIFICATION_TOKEN);

    // messages.get should have been called exactly once despite the duplicate
    expect(mockMessagesGet).toHaveBeenCalledTimes(1);
  });
});

// ── tokens event listener ─────────────────────────────────────────────────────

describe('attachTokensListener — persists refreshed access token to Supabase', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await seedUser();
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  it('updates encrypted_access_token in Supabase when the tokens event fires', async () => {
    const { attachTokensListener } = jest.requireActual<typeof authModule>(
      '../../src/providers/gmail/auth',
    );

    const fakeClient = new EventEmitter();
    attachTokensListener(fakeClient as never, userId);

    const newAccessToken = `new_access_token_${Date.now()}`;
    fakeClient.emit('tokens', { access_token: newAccessToken, expiry_date: null });

    // Give the async callback time to write to Supabase
    await new Promise(resolve => setTimeout(resolve, 500));

    const { data } = await getTestClient()
      .from('users')
      .select('encrypted_access_token')
      .eq('id', userId)
      .single();

    const row     = data as { encrypted_access_token: string };
    const decrypted = decrypt(row.encrypted_access_token);
    expect(decrypted).toBe(newAccessToken);
  });

  it('does nothing when the tokens event fires without an access_token', async () => {
    const { attachTokensListener } = jest.requireActual<typeof authModule>(
      '../../src/providers/gmail/auth',
    );

    const fakeClient = new EventEmitter();
    attachTokensListener(fakeClient as never, userId);

    // Snapshot current token before emitting
    const { data: before } = await getTestClient()
      .from('users')
      .select('encrypted_access_token')
      .eq('id', userId)
      .single();

    fakeClient.emit('tokens', { access_token: null }); // no token
    await new Promise(resolve => setTimeout(resolve, 200));

    const { data: after } = await getTestClient()
      .from('users')
      .select('encrypted_access_token')
      .eq('id', userId)
      .single();

    expect((after as { encrypted_access_token: string }).encrypted_access_token)
      .toBe((before as { encrypted_access_token: string }).encrypted_access_token);
  });
});
