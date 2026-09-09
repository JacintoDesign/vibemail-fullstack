// In-memory mock backend for the public `/demo` route. Speaks the exact
// CONTRACT.md wire shape so demoFetch() can stand in for apiFetch() without the
// app knowing the difference: reads, flag/label mutations, and draft CRUD all
// run against this store and persist for the session. Actual *sending* is the
// one thing the demo blocks — VibeMailApp short-circuits it into a notice, so
// nothing here ever leaves the browser.

import { ApiError } from "./api-client";
import type {
  ApiMessage,
  BackfillResult,
  GmailLabel,
  MessagePage,
  PatchResult,
  ReconcileResult,
} from "./api";
import type { MessageStatus, ThreadMsg } from "./types";
import { MESSAGES } from "./demo-data";

// ── Store ────────────────────────────────────────────────────────────────────
// Seeded lazily on first access from the demo dataset. `store` holds wire-shape
// rows; `threads` keeps each row's rendered conversation for GET /threads/:id.

let store: ApiMessage[] | null = null;
const threads = new Map<string, ThreadMsg[]>();
// Monotonic counter for ids minted by draft creation (kept out of Math.random so
// the demo stays deterministic within a session).
let seq = 1000;

function toApiMessage(m: (typeof MESSAGES)[number]): ApiMessage {
  return {
    id: m.id,
    userId: "demo-user",
    createdAt: m.date,
    updatedAt: m.date,
    gmailId: m.gmailId,
    threadId: m.threadId,
    labelIds: [...m.labelIds],
    from: m.from,
    to: m.to,
    subject: m.subject,
    date: m.date,
    snippet: m.snippet,
    bodyPlain: m.thread[m.thread.length - 1]?.body ?? m.snippet,
    bodyHtml: null,
    isRead: m.isRead,
    isStarred: m.isStarred,
    status: m.status,
    draftId: m.draftId,
    attachments: [],
  };
}

function seed(): ApiMessage[] {
  if (store) return store;
  store = MESSAGES.map(toApiMessage);
  MESSAGES.forEach((m) => threads.set(m.threadId, m.thread));
  return store;
}

// ── Derivations (mirror CONTRACT.md §3) ──────────────────────────────────────

/** status is derived from labelIds at write time, in this priority order. */
function deriveStatus(labelIds: string[]): MessageStatus {
  const has = (l: string) => labelIds.includes(l);
  if (has("DRAFT")) return "draft";
  if (has("SENT")) return "sent";
  if (has("TRASH")) return "trash";
  if (!has("INBOX")) return "archived";
  return "inbox";
}

/** Re-derive isRead/isStarred/status after a labelIds mutation. */
function reflag(m: ApiMessage): void {
  m.isRead = !m.labelIds.includes("UNREAD");
  m.isStarred = m.labelIds.includes("STARRED");
  m.status = deriveStatus(m.labelIds);
}

const addLabel = (m: ApiMessage, l: string) => {
  if (!m.labelIds.includes(l)) m.labelIds.push(l);
};
const removeLabel = (m: ApiMessage, l: string) => {
  m.labelIds = m.labelIds.filter((x) => x !== l);
};

function findByGmailId(gmailId: string): ApiMessage | undefined {
  return seed().find((m) => m.gmailId === gmailId);
}

// ── Label catalog (GET /labels) ──────────────────────────────────────────────

function computeLabels(): GmailLabel[] {
  const rows = seed();
  const count = (pred: (m: ApiMessage) => boolean) => rows.filter(pred).length;
  const unread = (pred: (m: ApiMessage) => boolean) =>
    rows.filter((m) => pred(m) && !m.isRead).length;
  const has = (m: ApiMessage, l: string) => m.labelIds.includes(l);

  const mk = (
    id: string,
    name: string,
    type: "system" | "user",
    total: number,
    unreadN: number,
  ): GmailLabel => ({
    id,
    name,
    type,
    messagesTotal: total,
    messagesUnread: unreadN,
    threadsTotal: total,
    threadsUnread: unreadN,
    color: null,
  });

  const categories = [
    ["CATEGORY_SOCIAL", "Social"],
    ["CATEGORY_UPDATES", "Updates"],
    ["CATEGORY_FORUMS", "Forums"],
    ["CATEGORY_PROMOTIONS", "Promotions"],
    ["CATEGORY_PERSONAL", "Personal"],
  ] as const;

  return [
    mk("INBOX", "Inbox", "system", count((m) => has(m, "INBOX")), unread((m) => has(m, "INBOX"))),
    mk("STARRED", "Starred", "system", count((m) => m.isStarred && !has(m, "TRASH")), 0),
    mk("SENT", "Sent", "system", count((m) => has(m, "SENT")), 0),
    mk("DRAFT", "Drafts", "system", count((m) => has(m, "DRAFT")), 0),
    mk("TRASH", "Trash", "system", count((m) => has(m, "TRASH")), 0),
    ...categories.map(([id, name]) =>
      mk(id, name, "user", count((m) => has(m, id)), unread((m) => has(m, id))),
    ),
  ];
}

// ── Router ───────────────────────────────────────────────────────────────────

interface Body {
  read?: boolean;
  starred?: boolean;
  archived?: boolean;
  trashed?: boolean;
  labelId?: string;
  to?: string;
  subject?: string;
  body?: string;
  threadId?: string;
}

function parseBody(init?: RequestInit): Body {
  if (!init?.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Body;
  } catch {
    return {};
  }
}

function page(messages: ApiMessage[]): MessagePage {
  return { messages, nextCursor: null, endCursor: null };
}

const QUESTION_START =
  /^(who|who's|whom|whose|what|what's|when|where's|where|why|how|did|do|does|is|are|can|could|would|should|which|was|were|will|has|have|had|am)\b/i;

function isQuestionLike(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (text.includes("?")) return true;
  if (QUESTION_START.test(text)) return true;
  return text.split(/\s+/).filter(Boolean).length >= 5;
}

const DEMO_STOP = new Set([
  "what",
  "what's",
  "whats",
  "who",
  "who's",
  "where",
  "when",
  "why",
  "how",
  "did",
  "does",
  "the",
  "and",
  "for",
  "any",
  "some",
  "about",
  "from",
  "with",
  "into",
  "that",
  "this",
  "best",
  "out",
  "now",
  "are",
  "can",
  "could",
  "would",
  "should",
  "which",
  "was",
  "were",
  "will",
  "has",
  "have",
  "had",
]);

function demoTokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[?!.,:;]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !DEMO_STOP.has(t));
}

function haystack(m: ApiMessage): string {
  return [m.subject, m.snippet, m.from, m.to, m.bodyPlain ?? ""].join(" ").toLowerCase();
}

/** Demo stand-in for stored-vector neighbors. No embeddings; subject tokens only. */
function demoRelated(origin: ApiMessage, rows: ApiMessage[]): ApiMessage[] {
  const tokens = demoTokens(origin.subject).filter((t) => t.length >= 6);
  if (tokens.length === 0) return [];
  return rows
    .filter(
      (m) => m.status !== "trash" && m.id !== origin.id && m.threadId !== origin.threadId,
    )
    .map((m) => ({
      m,
      score: tokens.filter((t) => m.subject.toLowerCase().includes(t)).length,
    }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.m);
}

/** Token overlap so demo "semantic" can answer questions, not only exact phrases. */
function semanticHits(rows: ApiMessage[], q: string): ApiMessage[] {
  const tokens = demoTokens(q);
  const live = rows.filter((m) => m.status !== "trash");
  if (tokens.length === 0) {
    const needle = q.trim().toLowerCase();
    return live.filter((m) => haystack(m).includes(needle));
  }
  return live
    .map((m) => ({ m, score: tokens.filter((t) => haystack(m).includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

function displayName(from: string): string {
  const angled = from.indexOf("<");
  const raw = angled >= 0 ? from.slice(0, angled) : from;
  return raw.trim().replace(/^"|"$/g, "") || from;
}

function demoAnswer(hits: ApiMessage[]): string | null {
  if (hits.length === 0) return null;
  const bullets = hits.slice(0, 4).map((m, i) => {
    const bit = (m.snippet || "").replace(/\s+/g, " ").trim();
    const clip = bit.length > 140 ? `${bit.slice(0, 137)}…` : bit;
    return `- **${m.subject}** — ${clip} [${i + 1}] ${displayName(m.from)}`;
  });
  return `From the sample mailbox:\n\n${bullets.join("\n\n")}`;
}

/** Demo stand-in for a topic brief — a little longer than demoAnswer. */
function demoDigest(topic: string, hits: ApiMessage[]): string {
  const first = hits[0];
  const second = hits[1];
  const agree =
    first && second
      ? `${displayName(first.from)} and ${displayName(second.from)} both touch on this. `
      : "";
  const details = hits
    .slice(0, 4)
    .map((m, i) => {
      const bit = (m.snippet || "").replace(/\s+/g, " ").trim();
      const clip = bit.length > 110 ? `${bit.slice(0, 107)}…` : bit;
      return `${clip} [${i + 1}] ${displayName(m.from)}`;
    })
    .join(" ");
  const cited = hits
    .slice(0, 6)
    .map((m, i) => `[${i + 1}] ${displayName(m.from)}`)
    .join(", ");
  const leadName = first ? displayName(first.from) : "the archive";
  return (
    `From the sample mailbox on "${topic.trim()}": ${agree}` +
    `${leadName} is one of ${hits.length} matching sources.\n\n` +
    `${details}\n\n` +
    `Each point above is tied to its newsletter. Sources: ${cited}.`
  );
}

/**
 * Serve one API call from the in-memory demo store. Mirrors the subset of the
 * CONTRACT.md endpoints the frontend actually calls. `path` is the clean REST
 * path apiFetch builds (e.g. "/messages/abc/labels"), sans the /api/v1 prefix.
 */
export async function demoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, "http://demo.local");
  const segments = url.pathname.split("/").filter(Boolean);
  const params = url.searchParams;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = parseBody(init);
  const rows = seed();

  const ok = <R>(v: R): Promise<T> => Promise.resolve(v as unknown as T);
  const noContent = () => Promise.resolve(undefined as T);

  // /messages ...
  if (segments[0] === "messages") {
    // GET /messages/search, /messages/semantic, /messages/digest
    if (segments[1] === "search" || segments[1] === "semantic" || segments[1] === "digest") {
      const rawQ = params.get("q") ?? "";
      const q = rawQ.trim().toLowerCase();
      if (!q) return ok(page([]));
      if (segments[1] === "search") {
        const hits = rows.filter((m) => m.status !== "trash" && haystack(m).includes(q));
        return ok(page(hits));
      }
      // Demo has no vectors; overlap tokens and cap at live retrieval's count.
      const hits = semanticHits(rows, rawQ).filter((m) => m.status !== "trash" && m.status !== "draft");
      if (segments[1] === "digest") {
        const wide = hits.slice(0, 20);
        if (wide.length === 0) {
          return ok({ ...page([]), digest: null, reasonUnavailable: false });
        }
        return ok({ ...page(wide), digest: demoDigest(rawQ, wide), reasonUnavailable: false });
      }
      const limited = hits.slice(0, 8);
      if (limited.length === 0) {
        const keyword = rows.filter((m) => m.status !== "trash" && haystack(m).includes(q));
        return ok({ ...page(keyword), answer: null, reasonUnavailable: false, source: "keyword" });
      }
      const answer = isQuestionLike(rawQ) ? demoAnswer(limited) : null;
      return ok({ ...page(limited), answer, reasonUnavailable: false, source: "semantic" });
    }

    // Collection: GET /messages (list) and POST /messages (send).
    if (segments.length === 1) {
      if (method === "POST") {
        // Sending is blocked in the demo; VibeMailApp intercepts before this is
        // reached, but guard anyway so nothing can slip out.
        throw new ApiError(403, {
          error: { code: "DEMO_LOCKED", message: "Sending is disabled in the demo." },
        });
      }
      const labelId = params.get("labelId") ?? undefined;
      const status = params.get("status") ?? undefined;
      let list = rows;
      if (labelId) list = list.filter((m) => m.labelIds.includes(labelId));
      if (status) list = list.filter((m) => m.status === status);
      // Newest first, matching the live list ordering.
      list = [...list].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      return ok(page(list));
    }

    // Item routes: /messages/:id and /messages/:id/labels
    const gmailId = decodeURIComponent(segments[1]);
    const target = findByGmailId(gmailId);

    if (segments[2] === "related") {
      if (!target) {
        throw new ApiError(404, {
          error: { code: "MESSAGE_NOT_FOUND", message: "Message not found." },
        });
      }
      return ok({ messages: demoRelated(target, rows) });
    }

    if (segments[2] === "labels") {
      if (!target || !body.labelId) {
        throw new ApiError(404, {
          error: { code: "MESSAGE_NOT_FOUND", message: "Message not found." },
        });
      }
      if (method === "POST") addLabel(target, body.labelId);
      else removeLabel(target, body.labelId);
      reflag(target);
      return ok({ message: target });
    }

    if (segments.length === 2) {
      if (method === "GET") {
        if (!target) {
          throw new ApiError(404, {
            error: { code: "MESSAGE_NOT_FOUND", message: "Message not found." },
          });
        }
        return ok({ message: target });
      }
      if (method === "DELETE") {
        store = rows.filter((m) => m.gmailId !== gmailId);
        return noContent();
      }
      if (method === "PATCH") {
        if (!target) {
          throw new ApiError(404, {
            error: { code: "MESSAGE_NOT_FOUND", message: "Message not found." },
          });
        }
        if (body.read === true) removeLabel(target, "UNREAD");
        if (body.read === false) addLabel(target, "UNREAD");
        if (body.starred === true) addLabel(target, "STARRED");
        if (body.starred === false) removeLabel(target, "STARRED");
        if (body.archived === true) removeLabel(target, "INBOX");
        if (body.archived === false) {
          removeLabel(target, "TRASH");
          addLabel(target, "INBOX");
        }
        if (body.trashed === true) {
          removeLabel(target, "INBOX");
          addLabel(target, "TRASH");
        }
        if (body.trashed === false) removeLabel(target, "TRASH");
        reflag(target);
        const result: PatchResult = {
          id: target.id,
          isRead: target.isRead,
          isStarred: target.isStarred,
          status: target.status,
        };
        return ok({ message: result });
      }
    }
  }

  // /threads/:threadId
  if (segments[0] === "threads" && segments[1]) {
    const threadId = decodeURIComponent(segments[1]);
    const convo = threads.get(threadId) ?? [];
    const row = rows.find((m) => m.threadId === threadId);
    const messages: ApiMessage[] = convo.map((tm, i) => ({
      id: `${threadId}-${i}`,
      userId: "demo-user",
      createdAt: row?.date ?? "",
      updatedAt: row?.date ?? "",
      gmailId: `${threadId}-${i}`,
      threadId,
      labelIds: row?.labelIds ?? [],
      from: `${tm.from} <${tm.email}>`,
      to: row?.to ?? "",
      subject: row?.subject ?? "",
      date: tm.date,
      snippet: tm.body.slice(0, 100),
      bodyPlain: tm.body,
      bodyHtml: null,
      isRead: true,
      isStarred: row?.isStarred ?? false,
      status: row?.status ?? "inbox",
      draftId: null,
      attachments: [],
    }));
    return ok({ threadId, messages });
  }

  // /labels
  if (segments[0] === "labels") {
    return ok({ labels: computeLabels() });
  }

  // /sync/backfill and /sync/reconcile
  if (segments[0] === "sync") {
    if (segments[1] === "backfill") {
      const result: BackfillResult = {
        synced: 0,
        syncedThisCall: 0,
        done: true,
        nextCursor: null,
      };
      return ok(result);
    }
    if (segments[1] === "reconcile") {
      const inboxCount = rows.filter((m) => m.labelIds.includes("INBOX")).length;
      const result: ReconcileResult = { inboxCount, removed: 0, removedGmailIds: [] };
      return ok(result);
    }
  }

  // /drafts and /drafts/:id[/send]
  if (segments[0] === "drafts") {
    // POST /drafts — create
    if (segments.length === 1 && method === "POST") {
      const id = `draft-${++seq}`;
      const nowThread: ThreadMsg[] = [
        { from: "You", email: "you@vibemail.app", date: "Draft", body: body.body ?? "" },
      ];
      const draftRow: ApiMessage = {
        id,
        userId: "demo-user",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        gmailId: id,
        threadId: body.threadId ?? `t-${id}`,
        labelIds: ["DRAFT"],
        from: "You <you@vibemail.app>",
        to: body.to ?? "",
        subject: body.subject ?? "",
        date: "Fri, 09 Jun 2026 12:00:00 +0000",
        snippet: (body.body ?? "").slice(0, 100),
        bodyPlain: body.body ?? "",
        bodyHtml: null,
        isRead: true,
        isStarred: false,
        status: "draft",
        draftId: `r-${id}`,
        attachments: [],
      };
      rows.unshift(draftRow);
      threads.set(draftRow.threadId, nowThread);
      return ok({ message: draftRow });
    }

    const gmailId = decodeURIComponent(segments[1] ?? "");
    const target = findByGmailId(gmailId);

    // POST /drafts/:id/send — blocked (VibeMailApp intercepts first).
    if (segments[2] === "send") {
      throw new ApiError(403, {
        error: { code: "DEMO_LOCKED", message: "Sending is disabled in the demo." },
      });
    }

    if (!target) {
      throw new ApiError(404, {
        error: { code: "DRAFT_NOT_FOUND", message: "Draft not found." },
      });
    }

    if (method === "PATCH") {
      if (body.to !== undefined) target.to = body.to;
      if (body.subject !== undefined) target.subject = body.subject;
      if (body.body !== undefined) {
        target.bodyPlain = body.body;
        target.snippet = body.body.slice(0, 100);
        threads.set(target.threadId, [
          { from: "You", email: "you@vibemail.app", date: "Draft", body: body.body },
        ]);
      }
      return ok({ message: target });
    }
    if (method === "DELETE") {
      store = rows.filter((m) => m.gmailId !== gmailId);
      return noContent();
    }
  }

  // /attachments — uploads/downloads aren't wired in the demo.
  if (segments[0] === "attachments") {
    throw new ApiError(400, {
      error: { code: "DEMO_LOCKED", message: "Attachments are disabled in the demo." },
    });
  }

  throw new ApiError(404, {
    error: { code: "NOT_FOUND", message: `No demo route for ${method} ${url.pathname}` },
  });
}
