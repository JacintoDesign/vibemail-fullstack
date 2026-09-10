/**
 * Embed edge function.
 *
 * POST { text: string } → { embedding: number[] } (384-d, unit-normalized).
 * One string in, one vector out. Callers split messages and fan out.
 *
 * Auth: gateway verify_jwt plus an in-function check that Authorization is
 * the service-role Bearer. The function does not chunk mail or know a user.
 *
 * The gte-small session is created once at module scope. Instantiating it
 * inside the handler re-initializes ONNX and costs seconds per request.
 *
 * transformers.js logs "dtype not specified for model" on cold load. The
 * hosted functions gateway has returned that warning as HTTP 400, so we
 * swallow it and retry the first inference once.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

silenceDtypeWarning()

const session = new Supabase.ai.Session('gte-small')

/** gte-small silently truncates at 512 tokens (~2000 characters). Fail instead. */
const MODEL_INPUT_LIMIT_CHARS = 2000

const RUN_OPTIONS = {
  mean_pool: true,
  normalize: true,
} as const

Deno.serve(async (req) => {
  const t0 = performance.now()

  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'POST required')
  }

  if (!hasServiceRoleBearer(req)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Bearer token required')
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be JSON')
  }

  const text = readText(payload)
  if (text === null) {
    return errorResponse(400, 'INVALID_BODY', 'Body must be { text: string }')
  }

  if (text.length > MODEL_INPUT_LIMIT_CHARS) {
    return errorResponse(
      400,
      'CHUNK_EXCEEDS_MODEL_LIMIT',
      `Text exceeds model input limit: ${text.length} characters > ${MODEL_INPUT_LIMIT_CHARS}. ` +
        'gte-small would truncate this silently at 512 tokens.',
    )
  }

  try {
    const tInfer = performance.now()
    const embedding = await embedOnce(text)
    logMs(`infer ${text.length} chars`, tInfer)
    logMs('total', t0)
    return jsonResponse({ embedding })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logMs('total (error)', t0)
    return errorResponse(500, 'EMBED_FAILED', message)
  }
})

async function embedOnce(text: string): Promise<number[]> {
  try {
    return toEmbedding(await session.run(text, RUN_OPTIONS))
  } catch (err) {
    if (!isDtypeWarning(err)) throw err
    // Cold load logged the warning as an exception; the session is ready now.
    return toEmbedding(await session.run(text, RUN_OPTIONS))
  }
}

function toEmbedding(output: unknown): number[] {
  const embedding = toFloatArray(output)
  if (embedding.length !== 384) {
    throw new Error(`Expected 384 dimensions, got ${embedding.length}`)
  }
  return embedding
}

function isDtypeWarning(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value)
  return message.includes('dtype not specified')
}

function silenceDtypeWarning(): void {
  for (const method of ['warn', 'error'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      if (args.some((arg) => typeof arg === 'string' && arg.includes('dtype not specified'))) {
        return
      }
      original(...args)
    }
  }
}

function hasServiceRoleBearer(req: Request): boolean {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  const auth = (req.headers.get('Authorization') ?? '').trim()
  const apikey = (req.headers.get('apikey') ?? '').trim()
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (expected && (token === expected || apikey === expected)) return true
  return jwtRole(token) === 'service_role'
}

/** Gateway already verified the JWT; read `role` so anon keys cannot embed. */
function jwtRole(token: string): string | undefined {
  const payload = token.split('.')[1]
  if (!payload) return undefined
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const b64 = padded + '='.repeat((4 - (padded.length % 4)) % 4)
    const json = JSON.parse(atob(b64)) as { role?: unknown }
    return typeof json.role === 'string' ? json.role : undefined
  } catch {
    return undefined
  }
}

function readText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const text = (payload as { text?: unknown }).text
  return typeof text === 'string' ? text : null
}

function toFloatArray(value: unknown): number[] {
  if (value instanceof Float32Array || value instanceof Float64Array) {
    return Array.from(value)
  }
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
    return value
  }
  throw new Error('Unexpected embedding output from gte-small')
}

function logMs(label: string, start: number): void {
  console.log(`[embed] ${label}: ${(performance.now() - start).toFixed(1)}ms`)
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
