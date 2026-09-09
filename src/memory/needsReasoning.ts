/**
 * True when the query is a question or free-text prompt, not a keyword lookup.
 * Only these should spend a reasoning-provider call (MEMORY_CONTRACT.md §5).
 */
export function needsReasoning(query: string): boolean {
  const text = query.trim()
  if (text.length === 0) return false
  if (text.includes('?')) return true
  if (INTERROGATIVE.test(text)) return true

  const words = text.split(/\s+/).filter(Boolean)
  // Short bags of terms ("compiler notes", "image tools") stay lookups.
  // A longer phrase with function words reads as a sentence, not a keyword.
  return words.length >= 5 && FUNCTION_WORD.test(text)
}

const INTERROGATIVE =
  /^(who|who's|whom|whose|what|what's|when|when's|where|where's|why|why's|how|how's|did|do|does|is|are|can|could|would|should|which|was|were|will|has|have|had|am)\b/i

const FUNCTION_WORD =
  /\b(a|an|the|any|some|about|from|with|for|into|that|than|whether|latest|mention|mentioned|newsletter|newsletters)\b/i
