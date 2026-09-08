import { ProviderError } from '../types/provider'

interface EmbedResponse {
  embedding?: unknown
  error?: { code?: string; message?: string }
}

/**
 * Call the embed edge function with one string. Returns one 384-d vector.
 * Retries once: cold isolates sometimes return the transformers.js dtype
 * warning as a 400 instead of a vector.
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    return await embedTextOnce(text)
  } catch (err) {
    if (!isDtypeWarning(err)) throw err
    return embedTextOnce(text)
  }
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

function isDtypeWarning(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('dtype not specified')
  if (value instanceof Error) return value.message.includes('dtype not specified')
  return false
}
