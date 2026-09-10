import type { Message } from '../types/message'

/**
 * Display name from an RFC 2822 From header — the newsletter, not the address.
 */
export function newsletterName(from: string): string {
  const raw = from.trim()
  const angled = raw.match(/^(.*?)<([^>]+)>$/)
  if (angled) {
    const name = angled[1].trim().replace(/^"|"$/g, '')
    return name || angled[2].trim()
  }
  if (raw.includes('@')) return raw.split('@')[0] || raw
  return raw || '(unknown)'
}

/**
 * Rewrite `[n]` / `[n, Name]` citations so the name is the retrieved sender
 * for that index. Drop citations whose index is not in the retrieved set.
 */
export function constrainCitedNames(text: string, messages: Message[]): string {
  const names = messages.map((m) => newsletterName(m.from))
  const allowed = [...new Set(names.filter((n) => n.length >= 2))].sort(
    (a, b) => b.length - a.length,
  )

  const re = /\[\s*(\d+)\s*(?:,\s*([^\]]+?))?\s*\]/g
  let result = ''
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    result += text.slice(last, match.index)
    const n = Number(match[1])
    const canonical = Number.isInteger(n) && n >= 1 ? names[n - 1] : undefined
    if (!canonical) {
      last = skipFollowingName(text, match.index + match[0].length, allowed)
      continue
    }
    if (match[2] !== undefined) {
      result += `[${n}, ${canonical}]`
      last = match.index + match[0].length
      continue
    }
    result += `[${n}]`
    last = match.index + match[0].length
    const rest = text.slice(last)
    const ws = rest.match(/^[ \t]+/)
    const afterWs = ws ? rest.slice(ws[0].length) : rest
    const cited = matchCitedName(afterWs, allowed) ?? matchTitleCaseName(afterWs)
    if (cited) {
      result += `${ws?.[0] ?? ' '}${canonical}`
      last += (ws?.[0].length ?? 0) + cited.length
    }
  }
  result += text.slice(last)
  return tidyCitationGaps(result)
}

function skipFollowingName(text: string, from: number, allowed: string[]): number {
  const rest = text.slice(from)
  const ws = rest.match(/^[ \t]+/)
  const afterWs = ws ? rest.slice(ws[0].length) : rest
  const cited = matchCitedName(afterWs, allowed) ?? matchTitleCaseName(afterWs)
  if (!cited) return from
  return from + (ws?.[0].length ?? 0) + cited.length
}

function matchCitedName(s: string, allowed: string[]): string | null {
  const lower = s.toLowerCase()
  for (const name of allowed) {
    if (!lower.startsWith(name.toLowerCase())) continue
    const next = s[name.length]
    if (next === undefined || /[\s,.;:!?)\]]/.test(next)) return s.slice(0, name.length)
  }
  return null
}

function matchTitleCaseName(s: string): string | null {
  const m = s.match(/^[A-Z][A-Za-z0-9&'-]*(?:[ \t]+[A-Z][A-Za-z0-9&'-]*)*/)
  return m ? m[0] : null
}

function tidyCitationGaps(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\(\s*Newsletter\s*,/gi, '(')
    .replace(/\(\s*\)/g, '')
    .trim()
}
