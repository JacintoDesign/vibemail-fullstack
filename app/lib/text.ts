// Decode HTML entities that appear in Gmail snippet and plain-text body
// fields (e.g. &#39; → ', &amp; → &, &quot; → "). The browser's native
// DOMParser is not available in SSR, so we use a regex table instead.
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

const ENTITY_RE = /&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g;

export function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match) => {
    if (match in ENTITIES) return ENTITIES[match];
    // numeric decimal: &#NNN;
    if (match.startsWith("&#x")) return String.fromCodePoint(parseInt(match.slice(3, -1), 16));
    if (match.startsWith("&#")) return String.fromCodePoint(parseInt(match.slice(2, -1), 10));
    return match;
  });
}
