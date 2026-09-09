import { GoogleGenAI } from '@google/genai';
import { ProviderError } from '../types/provider';
import { ReasonArgs, ReasonContextMessage, ReasonResult } from '../types/reason';

const GROUNDING_INSTRUCTION = [
  'Ground every claim strictly in the Context messages provided with this request.',
  'Never invent a message, sender, quote, date, or source that is not in Context.',
  'If Context is empty or does not contain enough information to answer, say so.',
  'Do not guess. When you refer to a message, identify it by the id given in Context.',
].join(' ');

// Same shape as withWriteRetry: 3 attempts, 250ms base, exponential 2^attempt.
// Jitter (0–RETRY_BASE_MS) is added so concurrent 429s do not retry in lockstep.
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function requireEnv(name: 'GEMINI_API_KEY' | 'GEMINI_MODEL'): string {
  const value = process.env[name];
  if (!value) {
    throw new ProviderError('CONFIG_ERROR', `${name} env var is not set`);
  }
  return value;
}

function messageBody(message: ReasonContextMessage): string {
  const body = message.bodyPlain?.trim();
  if (body) return body;
  return message.snippet;
}

function formatContext(messages: ReasonContextMessage[]): string {
  if (messages.length === 0) return 'Context:\n(no messages)';
  const blocks = messages.map((message, i) =>
    [
      `[${i + 1}] id=${message.id}`,
      `From: ${message.from}`,
      `Date: ${message.date}`,
      `Subject: ${message.subject}`,
      messageBody(message),
    ].join('\n'),
  );
  return `Context:\n${blocks.join('\n\n')}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Gemini request failed';
}

function numericStatus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function isQuotaError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const e = err as { status?: unknown; statusCode?: unknown; code?: unknown };
    if (numericStatus(e.status) === 429) return true;
    if (numericStatus(e.statusCode) === 429) return true;
    if (numericStatus(e.code) === 429) return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /\b429\b|RESOURCE_EXHAUSTED/i.test(message);
}

function backoffMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** attempt + Math.random() * RETRY_BASE_MS;
}

function unavailable(): ReasonResult {
  return { text: null, available: false };
}

/**
 * Gemini implementation of ReasonProvider.reason.
 * The @google/genai SDK must not be imported outside this file.
 */
export async function reason(args: ReasonArgs): Promise<ReasonResult> {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const model = requireEnv('GEMINI_MODEL');
  const client = new GoogleGenAI({ apiKey });

  const systemInstruction = `${args.systemInstruction}\n\n${GROUNDING_INSTRUCTION}`;
  const contents = `${formatContext(args.context)}\n\nUser:\n${args.prompt}`;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: { systemInstruction },
      });
      const text = response.text;
      if (text === undefined || text.trim() === '') {
        throw new ProviderError('REASON_FAILED', 'Gemini returned no text');
      }
      return { text, available: true };
    } catch (err) {
      if (!isQuotaError(err)) {
        console.error(`[reason:gemini] ${errorMessage(err)}`);
        if (err instanceof ProviderError) throw err;
        throw new ProviderError('REASON_FAILED', errorMessage(err));
      }

      if (attempt === RETRY_ATTEMPTS - 1) break;

      const delay = backoffMs(attempt);
      console.warn(
        `[reason:gemini] QUOTA 429 — retrying in ${Math.round(delay)}ms ` +
          `(attempt ${attempt + 1}/${RETRY_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }

  console.warn('[reason:gemini] QUOTA exhausted after retries — summary unavailable');
  return unavailable();
}
