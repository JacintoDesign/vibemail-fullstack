/**
 * Embed edge function.
 *
 * Two request shapes:
 *   1. Plain `{ sender, subject, body }` — chunk, embed, return vectors. No DB writes.
 *   2. Database webhook `{ type, table, record }` for `messages` INSERT/UPDATE —
 *      same chunk/embed, then persist into `message_chunks`.
 *
 * Inference session is created once at module scope. Instantiating gte-small
 * per request costs seconds of cold-start.
 *
 * Chunking follows memory_contract.md: ~1500-character body slices, 200-character
 * overlap, sender + subject prepended to every chunk. Character counts, not tokens.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const session = new Supabase.ai.Session('gte-small')

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200
/** gte-small silently truncates at 512 tokens (~2000 characters). Fail instead. */
const MODEL_INPUT_LIMIT_CHARS = 2000

interface PlainEmbedRequest {
  sender: string
  subject: string
  body: string
}

interface MessageRecord {
  id?: unknown
  user_id?: unknown
  sender?: unknown
  from_address?: unknown
  subject?: unknown
  body?: unknown
  body_plain?: unknown
}

interface WebhookPayload {
  type: string
  table: string
  record: MessageRecord
  schema?: string
  old_record?: MessageRecord | null
}

interface EmbeddedChunk {
  index: number
  text: string
  embedding: number[]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'POST required')
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be JSON')
  }

  try {
    if (isWebhookPayload(payload)) {
      return await handleWebhook(payload)
    }
    if (isPlainEmbedRequest(payload)) {
      const chunks = await embedMessage(payload.sender, payload.subject, payload.body)
      return jsonResponse(chunks)
    }
    return errorResponse(
      400,
      'INVALID_BODY',
      'Body must be { sender, subject, body } or a messages INSERT/UPDATE webhook payload',
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const exceedsLimit = message.includes('exceeds model input limit')
    return errorResponse(
      exceedsLimit ? 400 : 500,
      exceedsLimit ? 'CHUNK_EXCEEDS_MODEL_LIMIT' : 'EMBED_FAILED',
      message,
    )
  }
})

async function handleWebhook(payload: WebhookPayload): Promise<Response> {
  const type = payload.type.toUpperCase()
  if (payload.table !== 'messages' || (type !== 'INSERT' && type !== 'UPDATE')) {
    return jsonResponse({ ok: true, skipped: true })
  }

  const record = payload.record
  const messageId = asNonEmptyString(record.id)
  const userId = asNonEmptyString(record.user_id)
  if (!messageId || !userId) {
    return errorResponse(400, 'INVALID_RECORD', 'Webhook record requires id and user_id')
  }

  const sender = asString(record.sender ?? record.from_address)
  const subject = asString(record.subject)
  const body = asString(record.body ?? record.body_plain)

  const chunks = await embedMessage(sender, subject, body)
  const supabase = createServiceClient(userId)

  if (type === 'UPDATE') {
    const { error: deleteError } = await supabase
      .from('message_chunks')
      .delete()
      .eq('message_id', messageId)
    if (deleteError) {
      return errorResponse(500, 'CHUNK_DELETE_FAILED', deleteError.message)
    }
  }

  const { error: insertError } = await supabase.from('message_chunks').insert(
    chunks.map((chunk) => ({
      message_id: messageId,
      user_id: userId,
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      embedding: JSON.stringify(chunk.embedding),
    })),
  )
  if (insertError) {
    return errorResponse(500, 'CHUNK_INSERT_FAILED', insertError.message)
  }

  return jsonResponse({ ok: true })
}

async function embedMessage(
  sender: string,
  subject: string,
  body: string,
): Promise<EmbeddedChunk[]> {
  const slices = splitBody(body)
  const chunks: EmbeddedChunk[] = []

  for (const [index, slice] of slices.entries()) {
    const text = composeChunk(sender, subject, slice)
    assertWithinModelLimit(text, index)

    const output = await session.run(text, {
      mean_pool: true,
      normalize: true,
    })

    chunks.push({
      index,
      text,
      embedding: toNumberArray(output),
    })
  }

  return chunks
}

/**
 * Split the body into ~1500-character slices with ~200 characters of overlap.
 * An empty body still yields one slice so the sender/subject header is embedded.
 */
function splitBody(body: string): string[] {
  if (body.length <= CHUNK_SIZE) return [body]

  const slices: string[] = []
  let start = 0
  while (start < body.length) {
    const end = Math.min(start + CHUNK_SIZE, body.length)
    slices.push(body.slice(start, end))
    if (end >= body.length) break
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return slices
}

function composeChunk(sender: string, subject: string, bodySlice: string): string {
  return `${sender}\n${subject}\n\n${bodySlice}`
}

function assertWithinModelLimit(composed: string, index: number): void {
  if (composed.length > MODEL_INPUT_LIMIT_CHARS) {
    throw new Error(
      `Chunk ${index} exceeds model input limit: ${composed.length} characters > ${MODEL_INPUT_LIMIT_CHARS}. ` +
        'gte-small would truncate this silently at 512 tokens.',
    )
  }
}

function toNumberArray(value: unknown): number[] {
  if (value instanceof Float32Array || value instanceof Float64Array) {
    return Array.from(value)
  }
  if (Array.isArray(value) && Array.isArray(value[0])) {
    return toNumberArray(value[0])
  }
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
    return value
  }
  throw new Error('Unexpected embedding output from gte-small')
}

function isWebhookPayload(value: unknown): value is WebhookPayload {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  return (
    typeof o.type === 'string' &&
    typeof o.table === 'string' &&
    typeof o.record === 'object' &&
    o.record !== null
  )
}

function isPlainEmbedRequest(value: unknown): value is PlainEmbedRequest {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  return (
    typeof o.sender === 'string' &&
    typeof o.subject === 'string' &&
    typeof o.body === 'string'
  )
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Service-role client for webhook writes. Tagged with the message owner's
 * user_id so every chunk row is owned by that user.
 */
function createServiceClient(userId: string): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'x-user-id': userId,
      },
    },
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}
