export type InlinePart =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "cite"; index: number; label?: string }

export type AnswerBlock =
  | { type: "p"; parts: InlinePart[] }
  | { type: "list"; items: InlinePart[][] }

const TOKEN =
  /\(\s*(?:Newsletter\s*)?\[(\d+)\][^)]*\)|\[\s*(\d+)\s*(?:,\s*([^\]]+?))?\s*\]|\*\*(.+?)\*\*/gi

/**
 * Turn a model answer into paragraphs, lists, bold, and [n] citation marks
 * so the UI can link each cite to a retrieved message.
 */
export function parseAnswer(text: string): AnswerBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const blocks: AnswerBlock[] = []
  let list: InlinePart[][] | null = null
  let para: InlinePart[] | null = null

  function flushPara(): void {
    if (para && para.length > 0) blocks.push({ type: "p", parts: para })
    para = null
  }

  function flushList(): void {
    if (list && list.length > 0) blocks.push({ type: "list", items: list })
    list = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "") {
      flushPara()
      continue
    }
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/)
    if (bullet) {
      flushPara()
      if (!list) list = []
      list.push(parseLine(bullet[1] ?? ""))
      continue
    }
    flushList()
    const parts = parseLine(trimmed)
    if (para) {
      para.push({ type: "text", text: " " }, ...parts)
    } else {
      para = parts
    }
  }
  flushPara()
  flushList()
  return blocks
}

export function citedIndices(blocks: AnswerBlock[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  function walk(parts: InlinePart[]): void {
    for (const part of parts) {
      if (part.type === "cite" && !seen.has(part.index)) {
        seen.add(part.index)
        out.push(part.index)
      }
    }
  }
  for (const block of blocks) {
    if (block.type === "p") walk(block.parts)
    else for (const item of block.items) walk(item)
  }
  return out
}

/** 1-based indices of messages whose sender name appears in the raw answer. */
export function mentionedIndices(text: string, names: string[]): number[] {
  const lower = text.toLowerCase()
  const out: number[] = []
  names.forEach((name, i) => {
    const n = name.trim()
    if (n.length < 3) return
    if (lower.includes(n.toLowerCase())) out.push(i + 1)
  })
  return out
}

function parseLine(line: string): InlinePart[] {
  const parts: InlinePart[] = []
  let last = 0
  const re = new RegExp(TOKEN.source, "gi")
  let match: RegExpExecArray | null
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) pushText(parts, line.slice(last, match.index))
    const bold = match[4]
    if (bold !== undefined) {
      parts.push({ type: "bold", text: bold })
    } else {
      const n = Number(match[1] ?? match[2])
      const label = match[3]?.replace(/\s+/g, " ").trim()
      if (Number.isInteger(n) && n > 0) {
        parts.push(label ? { type: "cite", index: n, label } : { type: "cite", index: n })
      }
    }
    last = match.index + match[0].length
  }
  if (last < line.length) pushText(parts, line.slice(last))
  return parts
}

function pushText(parts: InlinePart[], raw: string): void {
  const text = raw
    .replace(/<[^<>\s]+@[^<>\s]+>/g, "")
    .replace(/\*/g, "")
    .replace(/\s{2,}/g, " ")
  if (text.length > 0) parts.push({ type: "text", text })
}
