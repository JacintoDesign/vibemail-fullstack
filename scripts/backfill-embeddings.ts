/**
 * Embedding backfill — local Node script (not an Edge Function, not a
 * Vercel Function). Both of those cap wall-clock time per request; looping
 * an inbox there will die long before it finishes.
 *
 * Selects every message that has no rows in message_chunks, then runs the
 * same ingestMessageChunks helper the live write path uses. Interrupt and
 * re-run at any time: already-chunked messages are not selected again.
 *
 * Calls /embed only. Never calls a reasoning provider.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS, so user_id on every
 * chunk is copied from the message row — never inferred.
 *
 *   npm run embed:backfill
 *   npm run embed:backfill -- --batches=1
 */

import { existsSync } from 'fs'
import { resolve } from 'path'
import { getClient } from '../src/db'
import { ingestMessageChunks } from '../src/memory/ingest'
import { ProviderError } from '../src/types/provider'

const BATCH_SIZE = 20

function parseBatchLimit(argv: string[]): number | null {
  const arg = argv.find((value) => value.startsWith('--batches='))
  if (!arg) return null
  const n = Number(arg.slice('--batches='.length))
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('--batches must be a positive integer')
  }
  return n
}

interface UnchunkedMessage {
  id: string
  user_id: string
  from_address: string
  subject: string
  body_plain: string | null
}

function loadEnv(): void {
  for (const name of ['.env.local', '.env']) {
    const file = resolve(process.cwd(), name)
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

async function loadChunkedMessageIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await getClient()
      .from('message_chunks')
      .select('message_id')
      .range(from, from + pageSize - 1)
    if (error) {
      throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error)
    }
    const rows = data ?? []
    for (const row of rows) ids.add(row.message_id)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return ids
}

async function countUnchunked(excludeIds: string[]): Promise<number> {
  const [{ count, error }, chunked] = await Promise.all([
    getClient().from('messages').select('id', { count: 'exact', head: true }),
    loadChunkedMessageIds(),
  ])
  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error)
  }
  for (const id of excludeIds) chunked.add(id)
  return Math.max(0, (count ?? 0) - chunked.size)
}

async function fetchUnchunkedBatch(excludeIds: string[]): Promise<UnchunkedMessage[]> {
  const chunked = await loadChunkedMessageIds()
  for (const id of excludeIds) chunked.add(id)
  const batch: UnchunkedMessage[] = []
  const pageSize = 100
  let from = 0

  while (batch.length < BATCH_SIZE) {
    const { data, error } = await getClient()
      .from('messages')
      .select('id, user_id, from_address, subject, body_plain')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error)
    }
    const rows = data ?? []
    for (const row of rows) {
      if (chunked.has(row.id)) continue
      batch.push({
        id:           row.id,
        user_id:      row.user_id,
        from_address: row.from_address,
        subject:      row.subject,
        body_plain:   row.body_plain,
      })
      if (batch.length >= BATCH_SIZE) break
    }
    if (rows.length < pageSize) break
    from += pageSize
  }

  return batch
}

async function ingestOne(row: UnchunkedMessage): Promise<void> {
  // Service role bypasses RLS — user_id must come from this message's owner.
  await ingestMessageChunks({
    messageId: row.id,
    userId:    row.user_id,
    sender:    row.from_address,
    subject:   row.subject,
    body:      row.body_plain ?? '',
  })
}

async function main(): Promise<void> {
  loadEnv()

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    )
  }

  process.on('SIGINT', () => {
    console.log(
      '\n[embed-backfill] interrupted. Re-run to resume; messages that already have chunks are skipped.',
    )
    process.exit(130)
  })

  const maxBatches = parseBatchLimit(process.argv)
  const failedIds: string[] = []
  let ingested = 0
  let batchNum = 0

  const initial = await countUnchunked(failedIds)
  console.log(
    `[embed-backfill] ${initial} messages have no chunks` +
      (maxBatches !== null ? ` (stopping after ${maxBatches} batch${maxBatches === 1 ? '' : 'es'})` : ''),
  )
  if (initial === 0) {
    console.log('[embed-backfill] nothing to do')
    return
  }

  for (;;) {
    const batch = await fetchUnchunkedBatch(failedIds)
    if (batch.length === 0) break

    batchNum++
    for (const row of batch) {
      try {
        await ingestOne(row)
        ingested++
      } catch (err) {
        failedIds.push(row.id)
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[embed-backfill] failed ${row.id} (user ${row.user_id}): ${message}`)
      }
    }

    const remaining = await countUnchunked(failedIds)
    console.log(
      `[embed-backfill] batch ${batchNum}: ingested ${ingested}, failed ${failedIds.length}, remaining ${remaining}`,
    )

    if (maxBatches !== null && batchNum >= maxBatches) {
      console.log(`[embed-backfill] stopping after ${maxBatches} batch${maxBatches === 1 ? '' : 'es'}`)
      break
    }
  }

  console.log(
    `[embed-backfill] done. ingested ${ingested}, failed ${failedIds.length}`,
  )
  if (failedIds.length > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[embed-backfill] ${message}`)
  process.exit(1)
})
