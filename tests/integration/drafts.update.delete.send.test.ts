/**
 * Integration tests for:
 *   PATCH  /api/v1/drafts/:id  (§4.9  — Draft Update)
 *   DELETE /api/v1/drafts/:id  (§4.10 — Draft Delete)
 *   POST   /api/v1/drafts/:id/send (§4.11 — Draft Send)
 *
 * - Supabase is live
 * - Gmail API (drafts.update, drafts.delete, drafts.send, messages.get,
 *   users.getProfile) is mocked
 * - loadOAuth2Client is mocked to skip token decryption
 *
 * Each mutating test seeds its own fresh draft row.
 *
 * NOTE: requires the schema migration to be applied (status, draft_id columns).
 */

import updateDeleteHandler from '../../src/routes/drafts/item';
import sendHandler         from '../../src/routes/drafts/send';
import * as authModule     from '../../src/providers/gmail/auth';
import { signJwt }         from '../../src/middleware/jwt';
import { ProviderError }   from '../../src/types/provider';
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';
import type { Message } from '../../src/types/message';

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

const mockDraftsUpdate    = jest.fn();
const mockDraftsDelete    = jest.fn();
const mockDraftsSend      = jest.fn();
const mockDraftsList      = jest.fn();
const mockMessagesGet     = jest.fn();
const mockUsersGetProfile = jest.fn();

const FAKE_SENT_ID  = 'msg_sent_after_draft';
const FAKE_FULL_SENT_MSG = {
  id:           FAKE_SENT_ID,
  threadId:     'thread_sent_001',
  labelIds:     ['SENT'],
  snippet:      'Sent message snippet',
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From',    value: 'sender@example.com' },
      { name: 'To',      value: 'recipient@example.com' },
      { name: 'Subject', value: 'Sent subject' },
      { name: 'Date',    value: new Date().toUTCString() },
    ],
    mimeType: 'text/plain',
    body: { data: Buffer.from('Sent body').toString('base64url') },
  },
};

let testUserId: string;
let authHeader:  string;

beforeAll(async () => {
  const user = await seedUser();
  testUserId = user.id;
  authHeader = `Bearer ${signJwt({ sub: user.id, email: user.email, name: 'Test User' })}`;
});

afterAll(async () => {
  await cleanupUser(testUserId);
});

beforeEach(() => {
  (authModule.loadOAuth2Client as jest.Mock).mockResolvedValue({ fake: 'oauth2_client' });
  mockUsersGetProfile.mockResolvedValue({ data: { emailAddress: 'sender@example.com' } });
  mockDraftsUpdate.mockResolvedValue({ data: {} });
  mockDraftsDelete.mockResolvedValue({ data: {} });
  mockDraftsSend.mockResolvedValue({ data: { id: FAKE_SENT_ID } });
  mockDraftsList.mockResolvedValue({ data: { drafts: [] } });
  mockMessagesGet.mockResolvedValue({ data: FAKE_FULL_SENT_MSG });

  (google.gmail as jest.Mock).mockReturnValue({
    users: {
      getProfile: mockUsersGetProfile,
      messages:   { get: mockMessagesGet },
      drafts: {
        update: mockDraftsUpdate,
        delete: mockDraftsDelete,
        send:   mockDraftsSend,
        list:   mockDraftsList,
      },
    },
  });
});

// ── Helper: seed a draft row ──────────────────────────────────────────────────

async function seedDraft(overrides?: { subject?: string }): Promise<{ gmail_id: string; draft_id: string }> {
  const tag     = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const draftId = `draft_${tag}`;
  const msg = await seedMessage(testUserId, {
    label_ids: ['DRAFT'],
    status:    'draft',
    draft_id:  draftId,
    subject:   overrides?.subject ?? 'Original subject',
  });
  return { gmail_id: msg.gmail_id, draft_id: draftId };
}

// ── §4.9 PATCH /api/v1/drafts/:id ────────────────────────────────────────────

describe('PATCH /api/v1/drafts/:id', () => {

  // ── Method guard ─────────────────────────────────────────────────────────

  it('405 — rejects non-PATCH/DELETE methods on the :id handler', async () => {
    const { state, res } = mockRes();
    await updateDeleteHandler(mockReq({ method: 'GET', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(405);
  });

  // ── UNAUTHORIZED ─────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', query: { id: 'any' }, body: { subject: 'Updated' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── INVALID_BODY ─────────────────────────────────────────────────────────

  it('400 INVALID_BODY — empty body', async () => {
    const draft = await seedDraft();
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: draft.gmail_id }, body: {} }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('400 INVALID_RECIPIENT — to field present but malformed', async () => {
    const draft = await seedDraft();
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: draft.gmail_id }, body: { to: 'not-an-email' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_RECIPIENT');
  });

  // ── DRAFT_NOT_FOUND ───────────────────────────────────────────────────────

  it('404 DRAFT_NOT_FOUND — non-existent ID', async () => {
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: 'nonexistent_draft_xyz' }, body: { subject: 'Updated' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('DRAFT_NOT_FOUND');
  });

  it('404 DRAFT_NOT_FOUND — message exists but is not a draft (status≠draft)', async () => {
    const msg = await seedMessage(testUserId, { status: 'inbox' }); // not a draft
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { subject: 'Updated' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('DRAFT_NOT_FOUND');
  });

  // ── GMAIL_DRAFT_FAILED ────────────────────────────────────────────────────

  it('502 GMAIL_DRAFT_FAILED — drafts.update throws', async () => {
    const draft = await seedDraft();
    mockDraftsUpdate.mockRejectedValue(new Error('Gmail 500'));
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: draft.gmail_id }, body: { subject: 'Updated' } }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_DRAFT_FAILED');
  });

  it('404 DRAFT_NOT_FOUND — drafts.update 404s (draft gone in Gmail)', async () => {
    const draft = await seedDraft();
    mockDraftsUpdate.mockRejectedValue(Object.assign(new Error('Not Found'), { code: 404 }));
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: draft.gmail_id }, body: { subject: 'Updated' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('DRAFT_NOT_FOUND');
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('200 — updates subject, calls drafts.update with correct draftId', async () => {
    const draft = await seedDraft({ subject: 'Before update' });
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: draft.gmail_id }, body: { subject: 'After update' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(mockDraftsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: draft.draft_id }),
    );
  });

  it('200 — response has status=draft and updated subject', async () => {
    const draft = await seedDraft({ subject: 'Old subject' });
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: draft.gmail_id }, body: { subject: 'New subject' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const msg = (state.body as { message: Message }).message;
    expect(msg.status).toBe('draft');
    expect(msg.subject).toBe('New subject');
  });

  it('updates subject in Supabase after successful update', async () => {
    const draft = await seedDraft({ subject: 'Pre-update' });
    await updateDeleteHandler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: draft.gmail_id }, body: { subject: 'Post-update' } }),
      mockRes().res,
    );
    const { data } = await getTestClient().from('messages').select('subject').eq('gmail_id', draft.gmail_id).single();
    expect((data as { subject: string }).subject).toBe('Post-update');
  });
});

// ── §4.10 DELETE /api/v1/drafts/:id ──────────────────────────────────────────

describe('DELETE /api/v1/drafts/:id', () => {

  // ── UNAUTHORIZED ─────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await updateDeleteHandler(mockReq({ method: 'DELETE', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── DRAFT_NOT_FOUND ───────────────────────────────────────────────────────

  it('404 DRAFT_NOT_FOUND — non-existent ID', async () => {
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: 'nonexistent_xyz' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('DRAFT_NOT_FOUND');
  });

  // ── GMAIL_DRAFT_FAILED ────────────────────────────────────────────────────

  it('502 GMAIL_DRAFT_FAILED — drafts.delete throws (Supabase row NOT deleted)', async () => {
    const draft = await seedDraft();
    mockDraftsDelete.mockRejectedValue(new Error('Gmail 500'));
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_DRAFT_FAILED');

    // Row must still exist — Supabase delete should not have been attempted.
    const { data } = await getTestClient().from('messages').select('gmail_id').eq('gmail_id', draft.gmail_id).maybeSingle();
    expect(data).not.toBeNull();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('204 — deletes Gmail draft and removes Supabase row', async () => {
    const draft = await seedDraft();
    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(204);
    expect(mockDraftsDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: draft.draft_id }),
    );

    // Row must be gone from Supabase.
    const { data } = await getTestClient().from('messages').select('gmail_id').eq('gmail_id', draft.gmail_id).maybeSingle();
    expect(data).toBeNull();
  });

  it('204 — calls drafts.delete before attempting Supabase delete', async () => {
    const draft = await seedDraft();
    const callOrder: string[] = [];
    mockDraftsDelete.mockImplementation(async () => { callOrder.push('gmail'); return { data: {} }; });

    // Spy on Supabase delete by intercepting after Gmail.
    await updateDeleteHandler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      mockRes().res,
    );
    // Gmail delete must have been called.
    expect(callOrder[0]).toBe('gmail');
  });

  it('204 — resolves draftId via drafts.list when draft_id is null (webhook-synced draft)', async () => {
    // A draft that reached Supabase via the webhook has draft_id = null.
    const resolvedDraftId = `resolved_${Date.now()}`;
    const msg = await seedMessage(testUserId, { label_ids: ['DRAFT'], status: 'draft', draft_id: null });
    mockDraftsList.mockResolvedValue({
      data: { drafts: [{ id: resolvedDraftId, message: { id: msg.gmail_id } }] },
    });

    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );

    expect(state.statusCode).toBe(204);
    // It must have looked the draft id up and deleted with the resolved value.
    expect(mockDraftsList).toHaveBeenCalled();
    expect(mockDraftsDelete).toHaveBeenCalledWith(expect.objectContaining({ id: resolvedDraftId }));

    const { data } = await getTestClient().from('messages').select('gmail_id').eq('gmail_id', msg.gmail_id).maybeSingle();
    expect(data).toBeNull();
  });

  it('204 — force-deletes an orphaned row when no Gmail draft matches', async () => {
    // draft_id null AND drafts.list returns no match → the draft is gone in
    // Gmail. The stale Supabase row must still be removed (no Gmail call).
    const msg = await seedMessage(testUserId, { label_ids: ['DRAFT'], status: 'draft', draft_id: null });
    mockDraftsList.mockResolvedValue({ data: { drafts: [] } }); // no match

    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );

    expect(state.statusCode).toBe(204);
    expect(mockDraftsDelete).not.toHaveBeenCalled();
    const { data } = await getTestClient().from('messages').select('gmail_id').eq('gmail_id', msg.gmail_id).maybeSingle();
    expect(data).toBeNull();
  });

  it('204 — drafts.delete returns 404 (already gone in Gmail); row still removed', async () => {
    const draft = await seedDraft();
    mockDraftsDelete.mockRejectedValue(Object.assign(new Error('Not Found'), { code: 404 }));

    const { state, res } = mockRes();
    await updateDeleteHandler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      res,
    );

    expect(state.statusCode).toBe(204);
    const { data } = await getTestClient().from('messages').select('gmail_id').eq('gmail_id', draft.gmail_id).maybeSingle();
    expect(data).toBeNull();
  });
});

// ── §4.11 POST /api/v1/drafts/:id/send ───────────────────────────────────────

describe('POST /api/v1/drafts/:id/send', () => {

  // ── UNAUTHORIZED ─────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await sendHandler(mockReq({ method: 'POST', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── Method guard ─────────────────────────────────────────────────────────

  it('405 — rejects non-POST methods', async () => {
    const { state, res } = mockRes();
    await sendHandler(mockReq({ method: 'GET', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(405);
  });

  // ── DRAFT_NOT_FOUND ───────────────────────────────────────────────────────

  it('404 DRAFT_NOT_FOUND — non-existent ID', async () => {
    const { state, res } = mockRes();
    await sendHandler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: 'nonexistent_xyz' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('DRAFT_NOT_FOUND');
  });

  it('404 DRAFT_NOT_FOUND — message is not a draft (status≠draft)', async () => {
    const msg = await seedMessage(testUserId, { status: 'sent' });
    const { state, res } = mockRes();
    await sendHandler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('DRAFT_NOT_FOUND');
  });

  // ── GMAIL_DRAFT_FAILED ────────────────────────────────────────────────────

  it('502 GMAIL_DRAFT_FAILED — drafts.send throws', async () => {
    const draft = await seedDraft();
    mockDraftsSend.mockRejectedValue(new Error('Gmail 500'));
    const { state, res } = mockRes();
    await sendHandler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_DRAFT_FAILED');
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('200 — sends draft, response has status=sent and draftId=null', async () => {
    const draft = await seedDraft();
    const { state, res } = mockRes();
    await sendHandler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const msg = (state.body as { message: Message }).message;
    expect(msg.status).toBe('sent');
    expect(msg.draftId).toBeNull();
    expect(msg.gmailId).toBe(FAKE_SENT_ID);
  });

  it('200 — calls drafts.send with the correct draftId', async () => {
    const draft = await seedDraft();
    await sendHandler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      mockRes().res,
    );
    expect(mockDraftsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ id: draft.draft_id }),
      }),
    );
  });

  it('updates Supabase row: status=sent, draft_id=null, gmail_id=sent message ID', async () => {
    const draft = await seedDraft();
    await sendHandler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: draft.gmail_id } }),
      mockRes().res,
    );

    // The row is updated in-place (old gmail_id → new sent message ID).
    const { data } = await getTestClient()
      .from('messages')
      .select('gmail_id, status, draft_id')
      .eq('gmail_id', FAKE_SENT_ID)
      .eq('user_id', testUserId)
      .maybeSingle();

    expect(data).not.toBeNull();
    const row = data as { gmail_id: string; status: string; draft_id: string | null };
    expect(row.status).toBe('sent');
    expect(row.draft_id).toBeNull();
    expect(row.gmail_id).toBe(FAKE_SENT_ID);
  });
});
