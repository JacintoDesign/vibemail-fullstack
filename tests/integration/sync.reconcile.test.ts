/**
 * Integration tests for src/sync/index.ts — reconcileInbox
 *
 * - Supabase is live (user rows, message rows are real)
 * - Gmail API (googleapis) is mocked — messages.list returns the "live" inbox set
 * - loadOAuth2Client is mocked
 *
 * Covers:
 *   - A row we tag INBOX that Gmail no longer lists → INBOX stripped, status
 *     recomputed to 'archived', reported in removedGmailIds
 *   - A self-sent row (INBOX + SENT) that IS still in the live inbox → untouched
 *   - A self-sent row that has left the inbox → becomes 'sent' (keeps SENT), not 'archived'
 *   - Nothing stale → removed 0, no writes
 */

import { reconcileInbox } from '../../src/sync/index';
import * as authModule from '../../src/providers/gmail/auth';
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase';

jest.mock('../../src/providers/gmail/auth', () => ({
  ...jest.requireActual('../../src/providers/gmail/auth'),
  loadOAuth2Client: jest.fn(),
}));

jest.mock('googleapis', () => ({
  google: { gmail: jest.fn() },
}));

import { google } from 'googleapis';

const mockMessagesList = jest.fn();

beforeEach(() => {
  (authModule.loadOAuth2Client as jest.Mock).mockResolvedValue({ fake: 'oauth2_client' });
  (google.gmail as jest.Mock).mockReturnValue({
    users: { messages: { list: mockMessagesList } },
  });
  mockMessagesList.mockReset();
});

/** Make messages.list return the given ids as the entire live inbox (one page). */
function liveInbox(ids: string[]) {
  mockMessagesList.mockResolvedValue({
    data: { messages: ids.map((id) => ({ id })), nextPageToken: undefined },
  });
}

async function labelsOf(userId: string, gmailId: string) {
  const { data } = await getTestClient()
    .from('messages')
    .select('label_ids, status')
    .eq('user_id', userId)
    .eq('gmail_id', gmailId)
    .single();
  return data as { label_ids: string[]; status: string };
}

describe('reconcileInbox', () => {
  it('strips INBOX from a row Gmail no longer lists, and reports it', async () => {
    const user = await seedUser();
    try {
      const keep  = await seedMessage(user.id, { gmail_id: 'keep_1',  label_ids: ['INBOX'], status: 'inbox' });
      const stale = await seedMessage(user.id, { gmail_id: 'stale_1', label_ids: ['INBOX'], status: 'inbox' });

      // Gmail's live inbox contains keep_1 but NOT stale_1 (it was archived).
      liveInbox(['keep_1']);

      const result = await reconcileInbox(user.id);

      expect(result.inboxCount).toBe(1);
      expect(result.removed).toBe(1);
      expect(result.removedGmailIds).toEqual(['stale_1']);

      const keptRow  = await labelsOf(user.id, keep.gmail_id);
      const staleRow = await labelsOf(user.id, stale.gmail_id);
      expect(keptRow.label_ids).toContain('INBOX');     // untouched
      expect(staleRow.label_ids).not.toContain('INBOX'); // stripped
      expect(staleRow.status).toBe('archived');          // recomputed
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('preserves a self-sent message that is still in the live inbox', async () => {
    const user = await seedUser();
    try {
      // Self-sent: carries both INBOX and SENT, status derived as 'sent'.
      await seedMessage(user.id, { gmail_id: 'self_1', label_ids: ['INBOX', 'SENT'], status: 'sent' });
      liveInbox(['self_1']); // Gmail still lists it in the inbox

      const result = await reconcileInbox(user.id);

      expect(result.removed).toBe(0);
      const row = await labelsOf(user.id, 'self_1');
      expect(row.label_ids).toEqual(expect.arrayContaining(['INBOX', 'SENT']));
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('a self-sent message that left the inbox becomes sent, not archived', async () => {
    const user = await seedUser();
    try {
      await seedMessage(user.id, { gmail_id: 'self_2', label_ids: ['INBOX', 'SENT'], status: 'sent' });
      liveInbox([]); // no longer in the inbox

      const result = await reconcileInbox(user.id);

      expect(result.removed).toBe(1);
      const row = await labelsOf(user.id, 'self_2');
      expect(row.label_ids).not.toContain('INBOX');
      expect(row.label_ids).toContain('SENT');
      expect(row.status).toBe('sent'); // SENT wins over archived
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('does nothing when the stored inbox already matches Gmail', async () => {
    const user = await seedUser();
    try {
      await seedMessage(user.id, { gmail_id: 'a', label_ids: ['INBOX'], status: 'inbox' });
      await seedMessage(user.id, { gmail_id: 'b', label_ids: ['INBOX'], status: 'inbox' });
      liveInbox(['a', 'b']);

      const result = await reconcileInbox(user.id);

      expect(result.inboxCount).toBe(2);
      expect(result.removed).toBe(0);
      expect(result.removedGmailIds).toEqual([]);
    } finally {
      await cleanupUser(user.id);
    }
  });
});
