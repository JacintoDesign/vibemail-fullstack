/**
 * True when the query is a question or free-text prompt, not a keyword lookup.
 * Mirrors src/memory/needsReasoning.ts — those queries trigger semantic search
 * (and may spend a reasoning call). Lookups stay on paginated keyword search.
 */
export function needsReasoning(query: string): boolean {
  const text = query.trim();
  if (text.length === 0) return false;
  if (text.includes("?")) return true;
  if (INTERROGATIVE.test(text)) return true;

  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 5 && FUNCTION_WORD.test(text);
}

const INTERROGATIVE =
  /^(who|who's|whom|whose|what|what's|when|when's|where|where's|why|why's|how|how's|did|do|does|is|are|can|could|would|should|which|was|were|will|has|have|had|am)\b/i;

const FUNCTION_WORD =
  /\b(a|an|the|any|some|about|from|with|for|into|that|than|whether|latest|mention|mentioned|newsletter|newsletters)\b/i;
