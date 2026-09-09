import { ProviderError } from '../types/provider'

interface EmbedResponse {
  embedding?: unknown
  error?: { code?: string; message?: string }
}

const RETRY_ATTEMPTS = 4
const RETRY_BASE_MS = 500

/**
 * Call the embed edge function with one string. Returns one 384-d vector.
 * Retries: cold isolates sometimes return the transformers.js dtype warning
 * as a 400; 503/546 are CPU/overload and usually succeed on a later isolate.
 */
export async function embedText(text: string): Promise<number[]> {
  let lastErr: unknown
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await embedTextOnce(text)
    } catch (err) {
      lastErr = err
      if (attempt === RETRY_ATTEMPTS - 1 || !isRetryableEmbedError(err)) throw err
      await sleep(RETRY_BASE_MS * 2 ** attempt)
    }
  }
  throw lastErr
}

async function embedTextOnce(text: string): Promise<number[]> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to call embed',
    )
  }

  const res = await fetch(`${url}/functions/v1/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ text }),
  })

  const raw = await res.text()
  if (isDtypeWarning(raw)) {
    throw new ProviderError('EMBED_FAILED', raw.trim())
  }

  let payload: EmbedResponse
  try {
    payload = JSON.parse(raw) as EmbedResponse
  } catch {
    throw new ProviderError('EMBED_FAILED', `embed returned non-JSON (${res.status})`)
  }

  if (!res.ok) {
    throw new ProviderError(
      payload.error?.code ?? 'EMBED_FAILED',
      payload.error?.message ?? `embed failed with status ${res.status}`,
      { status: res.status },
    )
  }

  const embedding = payload.embedding
  if (!Array.isArray(embedding) || !embedding.every((n) => typeof n === 'number')) {
    throw new ProviderError('EMBED_FAILED', 'embed did not return a numeric vector')
  }
  if (embedding.length !== 384) {
    throw new ProviderError('EMBED_FAILED', `embed returned ${embedding.length} dimensions, expected 384`)
  }

  return embedding
}

function isRetryableEmbedError(err: unknown): boolean {
  if (isDtypeWarning(err)) return true
  if (!(err instanceof ProviderError)) return false
  const status = (err.details as { status?: unknown } | undefined)?.status
  if (status === 502 || status === 503 || status === 504 || status === 546) return true
  return /status 546|status 503|WORKER_RESOURCE_LIMIT|non-JSON \(50[2346]\)/.test(err.message)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isDtypeWarning(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('dtype not specified')
  if (value instanceof Error) return value.message.includes('dtype not specified')
  return false
}
