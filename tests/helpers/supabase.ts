import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { encrypt } from '../../src/providers/gmail/auth';

// ── Singleton test client ────────────────────────────────────────────────────

let _testClient: SupabaseClient | null = null;

export function getTestClient(): SupabaseClient {
  if (_testClient) return _testClient;
  _testClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return _testClient;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeedUser {
  id:       string;
  email:    string;
  googleId: string;
}

export interface SeedMessage {
  id:       string;
  gmail_id: string;
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

/**
 * Inserts a test user with fake encrypted OAuth tokens.
 * Uses `.invalid` TLD so the email can never match a real account.
 */
export async function seedUser(opts?: {
  historyId?:  string | null;
  watchExpiry?: number | null;
}): Promise<SeedUser> {
  const tag      = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const googleId = `test_google_${tag}`;
  const email    = `test_${tag}@vibemail-test.invalid`;

  const { data, error } = await getTestClient()
    .from('users')
    .insert({
      google_id:               googleId,
      email,
      name:                    'Test User',
      encrypted_access_token:  encrypt('fake_access_token'),
      encrypted_refresh_token: encrypt('fake_refresh_token'),
      token_expires_at:        Date.now() + 3_600_000,
      history_id:              opts?.historyId  ?? null,
      watch_expiry:            opts?.watchExpiry ?? null,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`seedUser failed: ${error?.message}`);
  return { id: (data as { id: string }).id, email, googleId };
}

/**
 * Inserts a test message for the given user.
 * Every call generates a unique gmail_id so tests do not collide.
 */
export async function seedMessage(
  userId: string,
  overrides?: Partial<{
    gmail_id:   string;
    thread_id:  string;
    label_ids:  string[];
    is_read:    boolean;
    is_starred: boolean;
  }>,
): Promise<SeedMessage> {
  const tag     = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const gmailId = overrides?.gmail_id ?? `msg_${tag}`;

  const { data, error } = await getTestClient()
    .from('messages')
    .insert({
      user_id:      userId,
      gmail_id:     gmailId,
      thread_id:    overrides?.thread_id  ?? `thread_${tag}`,
      label_ids:    overrides?.label_ids  ?? ['INBOX'],
      from_address: 'sender@example.com',
      to_address:   'recipient@example.com',
      subject:      'Test Subject',
      date:         new Date().toUTCString(),
      snippet:      'Test snippet',
      body_plain:   'Hello world',
      body_html:    '<p>Hello world</p>',
      is_read:      overrides?.is_read    ?? false,
      is_starred:   overrides?.is_starred ?? false,
    })
    .select('id, gmail_id')
    .single();

  if (error || !data) throw new Error(`seedMessage failed: ${error?.message}`);
  return data as SeedMessage;
}

/**
 * Deletes all messages and the user row for the given userId.
 * Call in afterAll to leave the database clean.
 */
export async function cleanupUser(userId: string): Promise<void> {
  const client = getTestClient();
  await client.from('messages').delete().eq('user_id', userId);
  await client.from('users').delete().eq('id', userId);
}
