import { google } from 'googleapis';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { ProviderError } from '../types/provider';
import { getClient, updateHistoryId, updateWatchExpiry } from '../db';

// Renew any watch whose expiry falls within the next 24 hours (or has already lapsed).
const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserWatchRow {
  id:           string;
  watch_expiry: number | null;
}

export interface RenewalResult {
  renewed: number;
  failed:  number;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Queries Supabase for all users whose Gmail push-notification watch is within
 * 24 hours of expiry (or has already expired), then calls users.watch for each,
 * and persists the new expiration and history_id.
 *
 * watch_resource_id is reset to null — the Pub/Sub push receiver (api/webhook/gmail.ts)
 * repopulates it from the X-Goog-Resource-ID header on the first notification
 * after renewal, matching the pattern used during initial OAuth in setupWatch.
 *
 * Per-user errors are caught and counted rather than aborting the whole batch,
 * so one user's revoked token does not block all other renewals.
 */
export async function renewExpiringWatches(): Promise<RenewalResult> {
  const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topicName) {
    throw new ProviderError('CONFIG_ERROR', 'GOOGLE_PUBSUB_TOPIC env var is not set');
  }

  const threshold = Date.now() + RENEWAL_WINDOW_MS;

  // ── Fetch users with expiring or lapsed watches ───────────────────────────
  const { data, error } = await getClient()
    .from('users')
    .select('id, watch_expiry')
    .not('watch_expiry', 'is', null)
    .lte('watch_expiry', threshold);

  if (error) {
    throw new ProviderError(
      'WATCH_RENEWAL_FAILED',
      'Failed to query users with expiring watches',
      error,
    );
  }

  const users = (data ?? []) as UserWatchRow[];

  if (users.length === 0) {
    console.log('[cron:renew-watch] No watches due for renewal.');
    return { renewed: 0, failed: 0 };
  }

  console.log(`[cron:renew-watch] Renewing ${users.length} watch(es).`);

  // ── Renew each user's watch ───────────────────────────────────────────────
  let renewed = 0;
  let failed  = 0;

  for (const user of users) {
    try {
      const auth  = await loadOAuth2Client(user.id);
      const gmail = google.gmail({ version: 'v1', auth });

      const { data: watchData } = await gmail.users.watch({
        userId:      'me',
        requestBody: { topicName },
      });

      const expiry = watchData.expiration ? Number(watchData.expiration) : null;
      // Reset watch_resource_id to null — the webhook receiver captures the
      // new resource ID from the X-Goog-Resource-ID header on first delivery.
      await updateWatchExpiry(user.id, expiry, null);
      if (watchData.historyId) {
        await updateHistoryId(user.id, watchData.historyId);
      }

      console.log(
        `[cron:renew-watch] Renewed watch for user ${user.id} — ` +
        `expires ${watchData.expiration ?? 'unknown'}`,
      );
      renewed++;
    } catch (err) {
      console.error(`[cron:renew-watch] Failed to renew watch for user ${user.id}:`, err);
      failed++;
    }
  }

  console.log(`[cron:renew-watch] Done — renewed: ${renewed}, failed: ${failed}.`);
  return { renewed, failed };
}
