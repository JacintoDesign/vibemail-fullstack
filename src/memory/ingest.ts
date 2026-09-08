import { getClient, withWriteRetry } from '../db'
import { ProviderError } from '../types/provider'
import type { Message } from '../types/message'
import { chunkMessage } from './chunk'
import { embedText } from './embedClient'

export interface IngestMessageInput {
  messageId: string
  userId: string
  sender: string
  subject: string
  body: string
}

export interface ExistingMessageContent {
  id: string
  gmailId: string
  subject: string
  bodyPlain: string | null
}

interface MessageChunkRow {
  message_id: string
  user_id: string
  chunk_index: number
  chunk_text: string
  embedding: string
}

interface ChunksTable {
  delete: () => {
    eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>
  }
  insert: (rows: MessageChunkRow[]) => PromiseLike<{ error: { message: string } | null }>
}

function chunksTable(): ChunksTable {
  return getClient().from('message_chunks' as 'messages') as unknown as ChunksTable
}

/**
 * Snapshot subject/body by gmail_id so callers can skip re-embed on
 * label-only upserts (memory_contract.md §4).
 */
export async function snapshotMessageContent(
  userId: string,
  gmailIds: string[],
): Promise<Map<string, ExistingMessageContent>> {
  const out = new Map<string, ExistingMessageContent>()
  if (gmailIds.length === 0) return out

  const { data, error } = await getClient()
    .from('messages')
    .select('id, gmail_id, subject, body_plain')
    .eq('user_id', userId)
    .in('gmail_id', gmailIds)

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error)
  }

  for (const row of data ?? []) {
    out.set(row.gmail_id, {
      id: row.id,
      gmailId: row.gmail_id,
      subject: row.subject,
      bodyPlain: row.body_plain,
    })
  }
  return out
}

/**
 * After messages are upserted, embed any whose subject or body changed.
 * Existing chunks for a message are deleted first, then rebuilt.
 */
export async function ingestChangedMessages(
  messages: Array<Omit<Message, 'id' | 'createdAt' | 'updatedAt'>>,
  before: Map<string, ExistingMessageContent>,
): Promise<void> {
  if (messages.length === 0) return

  const first = messages[0]
  if (!first) return

  const gmailIds = messages.map((m) => m.gmailId)
  const { data, error } = await getClient()
    .from('messages')
    .select('id, gmail_id')
    .eq('user_id', first.userId)
    .in('gmail_id', gmailIds)

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error)
  }

  const idByGmail = new Map<string, string>()
  for (const row of data ?? []) {
    idByGmail.set(row.gmail_id, row.id)
  }

  await Promise.all(
    messages.map((msg) => {
      const prev = before.get(msg.gmailId)
      const body = msg.bodyPlain ?? ''
      if (prev && prev.subject === msg.subject && (prev.bodyPlain ?? '') === body) {
        return Promise.resolve()
      }
      const messageId = idByGmail.get(msg.gmailId)
      if (!messageId) {
        throw new ProviderError(
          'SYNC_UPSERT_FAILED',
          `No messages.id for gmail_id ${msg.gmailId} after upsert`,
        )
      }
      return ingestMessageChunks({
        messageId,
        userId: msg.userId,
        sender: msg.from,
        subject: msg.subject,
        body,
      })
    }),
  )
}

/**
 * Split one message, embed every chunk in parallel, then replace rows in
 * message_chunks. Each embed isolate sees a single string.
 */
export async function ingestMessageChunks(input: IngestMessageInput): Promise<void> {
  const chunks = chunkMessage(input.sender, input.subject, input.body)

  const embeddings = await Promise.all(chunks.map((chunk) => embedText(chunk.text)))

  const { error: deleteError } = await withWriteRetry(() =>
    chunksTable().delete().eq('message_id', input.messageId),
  )
  if (deleteError) {
    throw new ProviderError('CHUNK_DELETE_FAILED', deleteError.message, deleteError)
  }

  const rows: MessageChunkRow[] = chunks.map((chunk, i) => {
    const embedding = embeddings[i]
    if (!embedding) {
      throw new ProviderError('EMBED_FAILED', `Missing embedding for chunk ${chunk.index}`)
    }
    return {
      message_id: input.messageId,
      user_id: input.userId,
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      embedding: JSON.stringify(embedding),
    }
  })

  const { error: insertError } = await withWriteRetry(() => chunksTable().insert(rows))
  if (insertError) {
    throw new ProviderError('CHUNK_INSERT_FAILED', insertError.message, insertError)
  }
}
