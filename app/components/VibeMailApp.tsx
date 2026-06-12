"use client";

// Port of App.jsx (authed shell): desktop 3-pane + mobile shell, persisted
// layout, pop-out windows, compose flow, toast. Theme/accent/glass/font/nebula
// effects now live in SettingsProvider + NebulaBackground; the design-time
// tweaks panel and its demo-state / simulate-send-fail knobs are dropped.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BulkActionBar, type BulkAction } from "@/components/mail/BulkActionBar";
import { ComposeDrawer, type ComposePayload } from "@/components/mail/ComposeDrawer";
import { KeyboardHelp } from "@/components/mail/KeyboardHelp";
import { MessageList } from "@/components/mail/MessageList";
import type { ReadFilter } from "@/components/mail/MessageList";
import { CollapsedRail, Resizer } from "@/components/mail/PanelChrome";
import { ReadingPane } from "@/components/mail/ReadingPane";
import { Sidebar } from "@/components/mail/Sidebar";
import { ThreadWindow, type PopoutWin } from "@/components/mail/ThreadWindow";
import { ApiError } from "@/lib/api-client";
import {
  addMessageLabel,
  createDraft,
  deleteDraft as apiDeleteDraft,
  deleteMessage as apiDeleteMessage,
  type GmailLabel,
  labelToId,
  listLabels,
  patchMessage,
  removeMessageLabel,
  sendDraft,
  sendMessage,
  updateDraft,
  userLabels,
} from "@/lib/api";
import {
  DEFAULT_LABELS,
  fetchFolder,
  fetchSearch,
  getAccount,
  loadThread,
} from "@/lib/data-source";
import type { CSSVars, Message } from "@/lib/types";
import { useSettings } from "@/providers/SettingsProvider";

/** Turn any thrown error into a short, human banner/toast string. */
function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message || "Something went wrong.";
  return "Couldn't reach the server. Check your connection and try again.";
}

const VM_FOLDER_TITLE: Record<string, string> = {
  all: "Inbox",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  archived: "Archive",
  trash: "Trash",
};
const VM_EMPTY_TEXT: Record<string, string> = {
  sent: "Nothing in Sent.",
  drafts: "Nothing in Drafts.",
  archived: "Archive is empty.",
  trash: "Trash is empty.",
  starred: "No starred messages.",
};

const VM_LAYOUT_DEFAULTS = {
  sidebarW: 240,
  sidebarRail: false,
  listW: 450,
  listCollapsed: false,
  readCollapsed: false,
};
type Layout = typeof VM_LAYOUT_DEFAULTS;

interface Toast {
  txt: string;
  tone: "success" | "error";
}

const folderTitleFor = (filter: string): string =>
  VM_FOLDER_TITLE[filter] || (filter.startsWith("label:") ? filter.slice(6) : "Inbox");

const emptyTextFor = (filter: string): string =>
  VM_EMPTY_TEXT[filter] ||
  (filter.startsWith("label:") ? `Nothing in ${filter.slice(6)}.` : "Your inbox is empty.");

export function VibeMailApp() {
  const settings = useSettings();

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // ── Persisted panel layout ────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>(VM_LAYOUT_DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vm-layout");
      if (raw) setLayout({ ...VM_LAYOUT_DEFAULTS, ...(JSON.parse(raw) as Partial<Layout>) });
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("vm-layout", JSON.stringify(layout));
    } catch {
      /* ignore */
    }
  }, [layout]);
  const patchLayout = (p: Partial<Layout>) => setLayout((l) => ({ ...l, ...p }));

  const resizeSidebar = (clientX: number) => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const w = clientX - rect.left;
    if (w < 140) patchLayout({ sidebarRail: true });
    else patchLayout({ sidebarRail: false, sidebarW: Math.min(Math.max(w, 216), 320) });
  };
  const resizeList = (clientX: number) => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const sw = layout.sidebarRail ? 56 : layout.sidebarW;
    patchLayout({ listW: Math.min(Math.max(clientX - rect.left - sw, 280), 560) });
  };
  const collapseList = () => patchLayout({ listCollapsed: true, readCollapsed: false });
  const collapseRead = () => patchLayout({ readCollapsed: true, listCollapsed: false });

  // ── Pop-out thread windows ────────────────────────────────────────────────
  const [popouts, setPopouts] = useState<PopoutWin[]>([]);
  const zRef = useRef(80);
  const popOutThread = (msg: Message | null) => {
    if (!msg) return;
    setPopouts((ws) => {
      const existing = ws.find((w) => w.msgId === msg.id);
      if (existing) return ws.map((w) => (w.msgId === msg.id ? { ...w, z: ++zRef.current } : w));
      const n = ws.length;
      return [
        ...ws,
        { id: "w" + n + "-" + msg.id, msgId: msg.id, x: 110 + n * 34, y: 46 + n * 30, w: 520, h: 460, z: ++zRef.current },
      ];
    });
    setSelectedId(null);
  };
  const patchWin = (id: string, p: Partial<PopoutWin>) =>
    setPopouts((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const closeWin = (id: string) => setPopouts((ws) => ws.filter((w) => w.id !== id));
  const focusWin = (id: string) => setPopouts((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++zRef.current } : w)));

  // ── Mailbox state ─────────────────────────────────────────────────────────
  // `messages` holds the current folder's (or search's) loaded page(s); the API
  // does the folder/label filtering and cursor pagination server-side.
  const [messages, setMessages] = useState<Message[]>([]);
  const labels = DEFAULT_LABELS;
  // Mailbox-wide label counts (Inbox unread, Drafts total, per-category unread)
  // from GET /api/v1/labels — the source of truth for the sidebar badges, which
  // otherwise would only reflect the currently-loaded page.
  const [labelData, setLabelData] = useState<GmailLabel[] | null>(null);
  // Read once on mount so SSR and first client render agree (avoids hydration mismatch).
  const [accountEmail] = useState(() => getAccount());

  const [filter, setFilter] = useState("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [draft, setDraft] = useState<Message | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // ── Data loading (folder / search) ────────────────────────────────────────
  // A monotonically increasing request id discards responses from superseded
  // fetches (e.g. fast folder switches or search keystrokes).
  const reqIdRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = searchMode
        ? await fetchSearch(query.trim())
        : await fetchFolder(filter);
      if (reqIdRef.current !== myId) return; // a newer request superseded this
      setMessages(page.messages);
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (reqIdRef.current !== myId) return;
      setMessages([]);
      setNextCursor(null);
      setError(errMessage(e));
    } finally {
      if (reqIdRef.current === myId) setLoading(false);
    }
  }, [filter, searchMode, query]);

  useEffect(() => {
    if (searchMode) {
      if (!query.trim()) {
        reqIdRef.current++; // cancel any in-flight search
        setMessages([]);
        setNextCursor(null);
        setLoading(false);
        setError(null);
        return;
      }
      // Debounce keystrokes so search hits the server once typing settles.
      const t = setTimeout(loadFirstPage, 300);
      return () => clearTimeout(t);
    }
    loadFirstPage();
  }, [filter, searchMode, query, loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = searchMode
        ? await fetchSearch(query.trim(), nextCursor)
        : await fetchFolder(filter, nextCursor);
      setMessages((ms) => [...ms, ...page.messages]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, searchMode, query, filter]);

  // ── Live inbox: poll for newly-inserted messages ──────────────────────────
  // There is no browser Supabase client (the only client is server-side and
  // service-role), so rather than a realtime subscription we poll the current
  // folder on an interval and merge in rows we haven't seen yet. New messages
  // surface without a manual refresh. We only ADD unseen ids and never
  // overwrite existing rows, so optimistic local changes (read/star/archive)
  // are preserved. Skipped during search so live results aren't disturbed.
  useEffect(() => {
    if (searchMode) return;
    const POLL_INTERVAL_MS = 20_000;
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const page = await fetchFolder(filter);
        if (cancelled) return; // folder switched while in flight — drop this result
        setMessages((ms) => {
          const seen = new Set(ms.map((m) => m.id));
          const fresh = page.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...fresh, ...ms] : ms;
        });
      } catch {
        /* transient (offline / token refresh) — just try again next tick */
      } finally {
        inFlight = false;
      }
    };

    const id = setInterval(poll, POLL_INTERVAL_MS);
    // Catch up immediately when the tab regains focus after being backgrounded.
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [filter, searchMode]);

  // Global keyboard shortcuts live in a single handler defined further down,
  // once every action it dispatches to is in scope (see the keydown effect
  // after the message actions). A ref carries the g-prefix ("go to") pending
  // state across keystrokes.
  const gPendingRef = useRef(false);

  // Fetch the mailbox-wide label counts on mount and whenever the folder
  // changes (a cheap way to pick up reads/archives/sends since the last view).
  // Failures are non-fatal — the badges just fall back to the loaded page.
  useEffect(() => {
    let cancelled = false;
    listLabels()
      .then(({ labels: ls }) => { if (!cancelled) setLabelData(ls); })
      .catch(() => { /* transient — keep the previous counts */ });
    return () => { cancelled = true; };
  }, [filter]);

  const labelById = useMemo(() => {
    const m: Record<string, GmailLabel> = {};
    (labelData ?? []).forEach((l) => { m[l.id] = l; });
    return m;
  }, [labelData]);

  // Folder badges. Prefer the authoritative Gmail counts; fall back to the
  // currently-loaded page before the first /labels response lands.
  const counts = useMemo(
    () =>
      labelData
        ? {
            inbox: labelById.INBOX?.messagesUnread ?? 0,
            starred: labelById.STARRED?.messagesTotal ?? 0,
            drafts: labelById.DRAFT?.messagesTotal ?? 0,
          }
        : {
            inbox: messages.filter((m) => m.status === "inbox" && !m.isRead).length,
            starred: messages.filter((m) => m.isStarred && m.status !== "trash").length,
            drafts: messages.filter((m) => m.status === "draft").length,
          },
    [labelData, labelById, messages],
  );

  // Per-category unread counts for the sidebar's Labels section, keyed by the
  // friendly chip name the Sidebar renders (e.g. "Social" → CATEGORY_SOCIAL).
  const labelCounts = useMemo(() => {
    const out: Record<string, number> = {};
    labels.forEach((name) => {
      const l = labelById[labelToId(name)];
      if (l) out[name] = l.messagesUnread;
    });
    return out;
  }, [labels, labelById]);

  const baseVisible = useMemo(() => {
    // Search results arrive already filtered (and trash-excluded) from the
    // server; the folder views keep a light status filter so optimistic status
    // changes (archive/trash) drop a row out of the current folder immediately.
    if (searchMode) return messages;
    // Inbox membership is a question about the INBOX *label*, not the derived
    // `status` — a self-sent message carries both INBOX and SENT labels, and
    // deriveStatus ranks SENT above INBOX (CONTRACT §3), so status="sent" would
    // wrongly hide it here. Filtering on the label shows it in both Inbox and
    // Sent (matching Gmail) while still dropping rows whose INBOX label was
    // optimistically removed by archive/trash.
    if (filter === "all") return messages.filter((m) => (m.labelIds || []).includes("INBOX") && m.status !== "trash");
    if (filter === "starred") return messages.filter((m) => m.isStarred && m.status !== "trash");
    if (filter === "sent") return messages.filter((m) => m.status === "sent");
    if (filter === "drafts") return messages.filter((m) => m.status === "draft");
    if (filter === "archived") return messages.filter((m) => m.status === "archived");
    if (filter === "trash") return messages.filter((m) => m.status === "trash");
    if (filter.startsWith("label:")) {
      const l = filter.slice(6);
      // Same reasoning as the Inbox view above: scope to INBOX-label membership,
      // not status==="inbox", so a self-sent (INBOX+SENT) message tagged with
      // this user label isn't hidden by deriveStatus ranking SENT over INBOX.
      return messages.filter((m) => (m.labelIds || []).includes("INBOX") && m.status !== "trash" && (m.labels || []).includes(l));
    }
    return [];
  }, [messages, filter, searchMode, query]);

  const visible = !searchMode && readFilter === "unread" ? baseVisible.filter((m) => !m.isRead) : baseVisible;

  const update = (id: string, patch: Partial<Message>) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const selected = useMemo(() => messages.find((m) => m.id === selectedId) || null, [messages, selectedId]);

  // Apply an optimistic local change, fire the PATCH, then reconcile the derived
  // flags from the server response — rolling the row back (and toasting) on
  // failure. ALREADY_IN_STATE means the optimistic value was already correct.
  // The local row identity is `m.id` (Supabase UUID); the PATCH endpoint is
  // keyed by `m.gmailId` (Gmail message id) — they are not the same value.
  const patchAction = async (
    m: Message,
    optimistic: Partial<Message>,
    body: { read?: boolean; starred?: boolean; archived?: boolean; trashed?: boolean },
  ): Promise<void> => {
    const prev = messages.find((x) => x.id === m.id);
    update(m.id, optimistic);
    try {
      const { message: r } = await patchMessage(m.gmailId, body);
      update(m.id, { isRead: r.isRead, isStarred: r.isStarred, status: r.status });
    } catch (e) {
      if (e instanceof ApiError && e.code === "ALREADY_IN_STATE") return;
      if (prev) {
        update(m.id, {
          isRead: prev.isRead,
          isStarred: prev.isStarred,
          status: prev.status,
          labelIds: prev.labelIds,
        });
      }
      showToast(errMessage(e), "error");
    }
  };

  // Label-set helpers for optimistic updates that mirror the server's label math.
  const withoutLabel = (m: Message, l: string) => (m.labelIds || []).filter((x) => x !== l);
  const withLabel = (m: Message, l: string) =>
    Array.from(new Set([...(m.labelIds || []), l]));

  // ── Multiselect ───────────────────────────────────────────────────────────
  const selectionActive = selectedIds.size > 0;
  const allVisibleSelected = visible.length > 0 && visible.every((m) => selectedIds.has(m.id));
  const toggleSelect = (id: string) =>
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = () => setSelectedIds(new Set(visible.map((m) => m.id)));
  // Drop the selection whenever the folder or search context changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter, searchMode]);

  const removeByIds = (ids: string[]) => {
    const set = new Set(ids);
    setMessages((ms) => ms.filter((m) => !set.has(m.id)));
  };
  const eachSelected = (fn: (m: Message) => void) =>
    [...selectedIds].forEach((id) => {
      const m = messages.find((x) => x.id === id);
      if (m) fn(m);
    });

  const bulkArchive = () => {
    const n = selectedIds.size;
    eachSelected((m) =>
      patchAction(m, {status: "archived", labelIds: withoutLabel(m, "INBOX") }, { archived: true }),
    );
    clearSelection();
    showToast(`${n} archived.`);
  };
  const bulkRestore = () => {
    const n = selectedIds.size;
    eachSelected((m) => {
      if (m.status === "trash") {
        // Remove TRASH and re-add INBOX so it returns to the inbox, not Archive.
        patchAction(
          m,
          { status: "inbox", labelIds: Array.from(new Set([...withoutLabel(m, "TRASH"), "INBOX"])) },
          { trashed: false, archived: false },
        );
      } else {
        patchAction(m, {status: "inbox", labelIds: withLabel(m, "INBOX") }, { archived: false });
      }
    });
    clearSelection();
    showToast(`${n} moved to Inbox.`);
  };
  const bulkTrash = () => {
    const n = selectedIds.size;
    eachSelected((m) =>
      patchAction(
        m,
        { status: "trash", labelIds: Array.from(new Set([...withoutLabel(m, "INBOX"), "TRASH"])) },
        { trashed: true },
      ),
    );
    clearSelection();
    showToast(`${n} moved to Trash.`);
  };
  // Drafts "Discard" deletes the Gmail draft + Supabase row via drafts.delete.
  // Trash "Delete forever" removes the liberated row via DELETE /messages/:id
  // (the message stays in Gmail Trash, which Gmail auto-purges after 30 days —
  // permanent Gmail deletion needs the full mail.google.com scope we don't hold).
  const bulkDeleteForever = () => {
    const ids = [...selectedIds];
    ids.forEach((id) => {
      const m = messages.find((x) => x.id === id);
      if (!m) return;
      const remove = filter === "drafts" ? apiDeleteDraft(m.gmailId) : apiDeleteMessage(m.gmailId);
      remove.catch((e) => showToast(errMessage(e), "error"));
    });
    removeByIds(ids);
    clearSelection();
    showToast(`${ids.length} ${filter === "drafts" ? "discarded" : "permanently deleted"}.`);
  };
  const bulkMarkRead = (read: boolean) => {
    const n = selectedIds.size;
    eachSelected((m) =>
      patchAction(
        m,
        { isRead: read, labelIds: read ? withoutLabel(m, "UNREAD") : withLabel(m, "UNREAD") },
        { read },
      ),
    );
    clearSelection();
    showToast(`${n} marked ${read ? "read" : "unread"}.`);
  };
  // Per-message label add/remove (row "+" picker and label-chip "×"). Optimistic
  // local update, then POST/DELETE /messages/:id/labels, reconciling the chips
  // from the server's authoritative labelIds. ALREADY_IN_STATE is a no-op
  // success (the optimistic value was already correct); other errors roll back.
  const reconcileLabels = (id: string, labelIds: string[]) =>
    update(id, { labelIds, labels: userLabels(labelIds) });

  const addLabelToMessage = (id: string, label: string) => {
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    const prev = m.labels || [];
    update(id, { labels: Array.from(new Set([...prev, label])) });
    addMessageLabel(m.gmailId, labelToId(label))
      .then(({ message }) => reconcileLabels(id, message.labelIds ?? []))
      .catch((e) => {
        if (e instanceof ApiError && e.code === "ALREADY_IN_STATE") return;
        update(id, { labels: prev });
        showToast(errMessage(e), "error");
      });
  };
  const removeLabelFromMessage = (id: string, label: string) => {
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    const prev = m.labels || [];
    update(id, { labels: prev.filter((l) => l !== label) });
    removeMessageLabel(m.gmailId, labelToId(label))
      .then(({ message }) => reconcileLabels(id, message.labelIds ?? []))
      .catch((e) => {
        if (e instanceof ApiError && e.code === "ALREADY_IN_STATE") return;
        update(id, { labels: prev });
        showToast(errMessage(e), "error");
      });
  };

  const readWriteActions: BulkAction[] = [
    { key: "read", label: "Read", icon: "mailOpen", onClick: () => bulkMarkRead(true) },
    { key: "unread", label: "Unread", icon: "mail", onClick: () => bulkMarkRead(false) },
  ];
  const bulkActions: BulkAction[] =
    filter === "trash"
      ? [
          { key: "restore", label: "Restore", icon: "inbox", onClick: bulkRestore },
          { key: "delete", label: "Delete forever", icon: "trash", onClick: bulkDeleteForever, danger: true },
          ...readWriteActions,
        ]
      : filter === "archived"
        ? [
            { key: "restore", label: "Move to Inbox", icon: "inbox", onClick: bulkRestore },
            { key: "trash", label: "Delete", icon: "trash", onClick: bulkTrash, danger: true },
            ...readWriteActions,
          ]
        : filter === "drafts"
          ? [{ key: "discard", label: "Discard", icon: "trash", onClick: bulkDeleteForever, danger: true }]
          : [
              { key: "archive", label: "Archive", icon: "archive", onClick: bulkArchive },
              { key: "trash", label: "Delete", icon: "trash", onClick: bulkTrash, danger: true },
              ...readWriteActions,
            ];

  const bulkBar = selectionActive ? (
    <BulkActionBar
      count={selectedIds.size}
      allSelected={allVisibleSelected}
      onSelectAll={selectAllVisible}
      onClear={clearSelection}
      actions={bulkActions}
    />
  ) : null;

  const showToast = (txt: string, tone: "success" | "error" = "success") => {
    setToast({ txt, tone });
    setTimeout(() => setToast(null), 2600);
  };

  const openMessage = (m: Message) => {
    if (m.status === "draft") {
      setReplyTo(null);
      setDraft(m);
      setComposeOpen(true);
      return;
    }
    if (m.id === selectedId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(m.id);
    if (layout.readCollapsed) patchLayout({ readCollapsed: false });
    // Mark read on the server (PATCH) if it was unread.
    if (!m.isRead) {
      patchAction(m, {isRead: true, labelIds: withoutLabel(m, "UNREAD") }, { read: true });
    }
    // Pull the full thread (oldest-first) so the reader shows every message.
    loadThread(m.threadId)
      .then((thread) => {
        if (thread.length) update(m.id, { thread });
      })
      .catch(() => {
        /* keep the single-message card already mapped from the list row */
      });
  };
  const toggleRead = (m: Message) =>
    patchAction(
      m,
      { isRead: !m.isRead, labelIds: m.isRead ? withLabel(m, "UNREAD") : withoutLabel(m, "UNREAD") },
      { read: !m.isRead },
    );
  const toggleStar = (m: Message) =>
    patchAction(
      m,
      { isStarred: !m.isStarred, labelIds: m.isStarred ? withoutLabel(m, "STARRED") : withLabel(m, "STARRED") },
      { starred: !m.isStarred },
    );

  const selectFolder = (f: string) => {
    setSelectedId(null);
    setSearchMode(false);
    setQuery("");
    setReadFilter("all");
    setFilter(f);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadFirstPage().finally(() => setRefreshing(false));
  };
  const onRetry = () => {
    loadFirstPage();
  };

  const markUnreadAndClose = () => {
    if (selected) {
      patchAction(
        selected,
        { isRead: false, labelIds: withLabel(selected, "UNREAD") },
        { read: false },
      );
    }
    setSelectedId(null);
  };
  const archiveSelected = () => {
    if (selected) {
      patchAction(selected, { status: "archived", labelIds: withoutLabel(selected, "INBOX") }, { archived: true });
      showToast("Conversation archived.");
      setSelectedId(null);
    }
  };
  const trashSelected = () => {
    if (selected) {
      patchAction(
        selected,
        { status: "trash", labelIds: Array.from(new Set([...withoutLabel(selected, "INBOX"), "TRASH"])) },
        { trashed: true },
      );
      showToast("Moved to Trash.");
      setSelectedId(null);
    }
  };
  // Restore out of Trash or Archive back into the Inbox: drop TRASH, ensure INBOX.
  // From trash we send BOTH booleans — `trashed:false` removes TRASH and
  // `archived:false` re-adds INBOX; otherwise the row would land in Archive.
  const restoreSelected = () => {
    if (selected) {
      const wasTrash = selected.status === "trash";
      patchAction(
        selected,
        {
          status: "inbox",
          labelIds: Array.from(new Set([...withoutLabel(selected, "TRASH"), "INBOX"])),
        },
        wasTrash ? { trashed: false, archived: false } : { archived: false },
      );
      showToast(wasTrash ? "Restored to Inbox." : "Moved to Inbox.");
      setSelectedId(null);
    }
  };
  // Permanent delete from Trash. No contract endpoint hard-deletes a non-draft
  // message, so the row is only dropped from the local view.
  const deleteForeverSelected = () => {
    if (selected) {
      removeByIds([selected.id]);
      showToast("Permanently deleted.");
      setSelectedId(null);
    }
  };
  // Discard a draft — deletes the Gmail draft + Supabase row, then drops it.
  const deleteDraft = (m: Message | null) => {
    if (!m) return;
    apiDeleteDraft(m.gmailId)
      .then(() => {
        removeByIds([m.id]);
        showToast("Draft discarded.");
      })
      .catch((e) => showToast(errMessage(e), "error"));
    setComposeOpen(false);
    setDraft(null);
  };

  // Archive / trash an arbitrary message (keyboard shortcuts act on whichever
  // row is focused, not just the open thread).
  const archiveMessage = (m: Message) => {
    patchAction(m, {status: "archived", labelIds: withoutLabel(m, "INBOX") }, { archived: true });
    showToast("Conversation archived.");
    if (selectedId === m.id) setSelectedId(null);
  };
  const trashMessage = (m: Message) => {
    patchAction(
      m,
      { status: "trash", labelIds: Array.from(new Set([...withoutLabel(m, "INBOX"), "TRASH"])) },
      { trashed: true },
    );
    showToast("Moved to Trash.");
    if (selectedId === m.id) setSelectedId(null);
  };

  // ── Compose: send / save draft ────────────────────────────────────────────
  // These reject on failure so the ComposeDrawer keeps the form open and shows
  // its in-drawer error banner; on success they close the drawer and refresh.
  const handleSend = async (payload: ComposePayload, count: number) => {
    if (draft) {
      // Editing an existing draft → persist edits, then send it via drafts.send.
      // drafts.update assigns a NEW Gmail message id, so send that one.
      const { message: updated } = await updateDraft(draft.gmailId, payload);
      await sendDraft(updated.gmailId);
    } else {
      await sendMessage({ ...payload, threadId: replyTo?.threadId });
    }
    setComposeOpen(false);
    setReplyTo(null);
    setDraft(null);
    showToast(`Message sent to ${count} recipient${count === 1 ? "" : "s"}.`);
    loadFirstPage();
  };
  const handleSaveDraft = async (payload: ComposePayload) => {
    if (draft) await updateDraft(draft.gmailId, payload);
    else await createDraft({ ...payload, threadId: replyTo?.threadId });
    setComposeOpen(false);
    setReplyTo(null);
    setDraft(null);
    showToast("Draft saved.");
    loadFirstPage();
  };

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  // Subscribe once; a ref always holds the latest closure so the handler sees
  // current state without re-binding the listener on every render.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const focusedRowId = (): string | null => {
    const el = document.activeElement as HTMLElement | null;
    return el?.getAttribute?.("data-vm-row-id") ?? null;
  };
  // The message a row-level action targets: the keyboard-focused row if any,
  // otherwise the currently open thread.
  const actionTarget = (): Message | null => {
    const id = focusedRowId();
    if (id) return messages.find((m) => m.id === id) ?? null;
    return selected;
  };
  const focusRowBy = (dir: 1 | -1) => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-vm-row-id]"));
    if (!rows.length) return;
    const idx = rows.findIndex((r) => r === document.activeElement);
    if (idx === -1) {
      rows[0].focus();
      return;
    }
    rows[Math.max(0, Math.min(rows.length - 1, idx + dir))].focus();
  };

  keyHandlerRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing =
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

    // ⌘/Ctrl-K opens search — works even mid-typing.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setSearchMode(true);
      return;
    }

    // Escape unwinds the top-most layer.
    if (e.key === "Escape") {
      if (helpOpen) setHelpOpen(false);
      else if (composeOpen) setComposeOpen(false);
      else if (searchMode) {
        setSearchMode(false);
        setQuery("");
      } else if (selectionActive) clearSelection();
      else if (selectedId) setSelectedId(null);
      return;
    }

    // Everything below is a single-key shortcut: never hijack typing, modifier
    // combos, or keystrokes while the compose drawer is open.
    if (typing || e.metaKey || e.ctrlKey || e.altKey || composeOpen) return;

    // "?" toggles the cheatsheet; while it's open, swallow other shortcuts.
    if (e.key === "?") {
      e.preventDefault();
      setHelpOpen((v) => !v);
      return;
    }
    if (helpOpen) return;

    // "g" then a folder key — Gmail-style go-to navigation.
    if (gPendingRef.current) {
      gPendingRef.current = false;
      const map: Record<string, string> = { i: "all", s: "starred", t: "sent", d: "drafts", a: "archived" };
      const f = map[e.key.toLowerCase()];
      if (f) {
        e.preventDefault();
        selectFolder(f);
      }
      return;
    }
    if (e.key.toLowerCase() === "g") {
      gPendingRef.current = true;
      setTimeout(() => {
        gPendingRef.current = false;
      }, 1200);
      return;
    }

    switch (e.key) {
      case "c":
        e.preventDefault();
        setReplyTo(null);
        setDraft(null);
        setComposeOpen(true);
        return;
      case "/":
        e.preventDefault();
        setSearchMode(true);
        return;
      case "j":
      case "ArrowDown":
        e.preventDefault();
        focusRowBy(1);
        return;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        focusRowBy(-1);
        return;
      case "o": {
        // Enter/Space are handled by the focused row itself; "o" is the
        // global equivalent for opening whatever row is focused.
        const id = focusedRowId();
        const m = id ? messages.find((x) => x.id === id) : null;
        if (m) {
          e.preventDefault();
          openMessage(m);
        }
        return;
      }
      case "r":
        if (selected && selected.status !== "draft") {
          e.preventDefault();
          setDraft(null);
          setReplyTo(selected);
          setComposeOpen(true);
        }
        return;
      case "s": {
        const m = actionTarget();
        if (m) {
          e.preventDefault();
          toggleStar(m);
        }
        return;
      }
      case "e": {
        const m = actionTarget();
        if (m) {
          e.preventDefault();
          archiveMessage(m);
        }
        return;
      }
      case "#": {
        const m = actionTarget();
        if (m) {
          e.preventDefault();
          trashMessage(m);
        }
        return;
      }
      case "u": {
        const m = actionTarget();
        if (m) {
          e.preventDefault();
          if (selectedId === m.id) markUnreadAndClose();
          else toggleRead(m);
        }
        return;
      }
      default:
        return;
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const sidebarSettings = {
    theme: settings.theme,
    onToggleTheme: settings.toggleTheme,
    density: settings.density,
    onDensityChange: settings.setDensity,
    fontScale: settings.fontScale,
    onFontScaleChange: settings.setFontScale,
    glass: settings.glass,
    onGlassChange: settings.setGlass,
    animatedBg: settings.animatedBg,
    onAnimatedBgChange: settings.setAnimatedBg,
    bodyView: settings.bodyView,
    onBodyViewChange: settings.setBodyView,
  };

  const toastEl = toast ? (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        background: "var(--glass-drawer)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        WebkitBackdropFilter: "var(--glass-blur-3)",
        backdropFilter: "var(--glass-blur-3)",
        boxShadow: "var(--shadow-3)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--text-primary)",
        maxWidth: "90%",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "var(--radius-full)",
          background: toast.tone === "error" ? "var(--danger)" : "var(--success)",
          flexShrink: 0,
        }}
      />
      {toast.txt}
    </div>
  ) : null;

  // ── Mobile shell ──────────────────────────────────────────────────────────
  if (isMobile) {
    const mobileRootStyle: CSSVars = {
      position: "relative",
      height: "100%",
      width: "100%",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      "--thread-min": "0px",
      "--list-min": "0px",
      "--card-pad": "8px",
      "--card-gap": "8px",
    };
    return (
      <div ref={rootRef} className="vm-mobile" style={mobileRootStyle}>
        {selected ? (
          <ReadingPane
            mobile
            onMenu={() => setMobileNavOpen(true)}
            onBack={() => setSelectedId(null)}
            message={selected}
            onReply={() => {
              setDraft(null);
              setReplyTo(selected);
              setComposeOpen(true);
            }}
            onToggleStar={() => selected && toggleStar(selected)}
            onMarkUnread={markUnreadAndClose}
            onArchive={archiveSelected}
            onTrash={trashSelected}
            onRestore={restoreSelected}
            onDeleteForever={deleteForeverSelected}
            onEditDraft={() => {
              setReplyTo(null);
              setDraft(selected);
              setComposeOpen(true);
            }}
            onPopOut={() => {}}
            onCollapse={() => setSelectedId(null)}
          />
        ) : (
          <MessageList
            mobile
            fill
            onMenu={() => setMobileNavOpen(true)}
            onCompose={() => {
              setReplyTo(null);
              setDraft(null);
              setComposeOpen(true);
            }}
            messages={visible}
            loading={loading}
            error={error}
            onRetry={onRetry}
            refreshing={refreshing}
            searchMode={searchMode}
            query={query}
            onQueryChange={setQuery}
            onClearSearch={() => {
              setSearchMode(false);
              setQuery("");
            }}
            onActivateSearch={() => setSearchMode(true)}
            readFilter={readFilter}
            onReadFilter={setReadFilter}
            onOpen={openMessage}
            onToggleRead={toggleRead}
            onToggleStar={toggleStar}
            selectedId={selectedId}
            folderTitle={folderTitleFor(filter)}
            emptyText={emptyTextFor(filter)}
            emptyHint={filter === "all" ? "New mail will appear here in real time." : null}
            onRefresh={onRefresh}
            onCollapse={() => {}}
            serverHasMore={!!nextCursor}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
          />
        )}

        {mobileNavOpen ? (
          <div
            className="vm-mobile-nav"
            style={{ position: "absolute", inset: 0, zIndex: 46, display: "flex", background: "var(--navy)" }}
          >
            <Sidebar
              active={filter}
              counts={counts}
              accountEmail={accountEmail}
              labels={labels}
              labelCounts={labelCounts}
              rail={false}
              width={270}
              mobile
              onClose={() => setMobileNavOpen(false)}
              onToggleRail={() => {}}
              onShowShortcuts={() => setHelpOpen(true)}
              onSelect={(f) => {
                selectFolder(f);
                setMobileNavOpen(false);
              }}
              onCompose={() => {
                setReplyTo(null);
                setDraft(null);
                setComposeOpen(true);
                setMobileNavOpen(false);
              }}
              {...sidebarSettings}
            />
          </div>
        ) : null}

        <ComposeDrawer
          open={composeOpen}
          mobile
          replyTo={replyTo}
          draft={draft}
          onClose={() => setComposeOpen(false)}
          onSend={handleSend}
          onSaveDraft={handleSaveDraft}
          onDeleteDraft={() => deleteDraft(draft)}
        />

        {toastEl}
        {helpOpen ? <KeyboardHelp onClose={() => setHelpOpen(false)} /> : null}
      </div>
    );
  }

  // ── Desktop 3-pane shell ──────────────────────────────────────────────────
  const desktopRootStyle: CSSVars = {
    display: "flex",
    height: "100%",
    width: "100%",
    position: "relative",
    overflow: "hidden",
    "--thread-min": "380px",
    "--list-min": "280px",
  };
  const mainStyle: CSSVars = {
    flex: 1,
    height: "100%",
    position: "relative",
    display: "flex",
    "--list-w": layout.listW + "px",
  };

  return (
    <div ref={rootRef} style={desktopRootStyle}>
      <Sidebar
        active={filter}
        counts={counts}
        accountEmail={accountEmail}
        labels={labels}
        labelCounts={labelCounts}
        rail={layout.sidebarRail}
        width={layout.sidebarW}
        onSelect={selectFolder}
        onToggleRail={() => patchLayout({ sidebarRail: !layout.sidebarRail })}
        onShowShortcuts={() => setHelpOpen(true)}
        onCompose={() => {
          setReplyTo(null);
          setDraft(null);
          setComposeOpen(true);
        }}
        {...sidebarSettings}
      />
      <Resizer
        label="Resize sidebar"
        onMove={resizeSidebar}
        onDoubleClick={() => patchLayout({ sidebarRail: !layout.sidebarRail })}
      />

      <main style={mainStyle}>
        {layout.listCollapsed ? (
          <CollapsedRail
            side="left"
            label={searchMode ? "Search" : folderTitleFor(filter)}
            onExpand={() => patchLayout({ listCollapsed: false })}
          />
        ) : (
          <MessageList
            fill={layout.readCollapsed}
            messages={visible}
            loading={loading}
            error={error}
            onRetry={onRetry}
            refreshing={refreshing}
            searchMode={searchMode}
            query={query}
            onQueryChange={setQuery}
            onClearSearch={() => {
              setSearchMode(false);
              setQuery("");
            }}
            onActivateSearch={() => setSearchMode(true)}
            readFilter={readFilter}
            onReadFilter={setReadFilter}
            onOpen={openMessage}
            onToggleRead={toggleRead}
            onToggleStar={toggleStar}
            selectedId={selectedId}
            folderTitle={folderTitleFor(filter)}
            emptyText={emptyTextFor(filter)}
            emptyHint={filter === "all" ? "New mail will appear here in real time." : null}
            onRefresh={onRefresh}
            onCollapse={collapseList}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            selectionActive={selectionActive}
            bulkBar={bulkBar}
            labelOptions={labels}
            onAddLabel={addLabelToMessage}
            onRemoveLabel={removeLabelFromMessage}
            serverHasMore={!!nextCursor}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
          />
        )}

        {!layout.listCollapsed && !layout.readCollapsed ? (
          <Resizer label="Resize list" onMove={resizeList} onDoubleClick={() => patchLayout({ listW: 380 })} />
        ) : null}

        {layout.readCollapsed ? (
          <CollapsedRail side="right" label="Thread" onExpand={() => patchLayout({ readCollapsed: false })} />
        ) : (
          <ReadingPane
            message={selected}
            onReply={() => {
              setDraft(null);
              setReplyTo(selected);
              setComposeOpen(true);
            }}
            onToggleStar={() => selected && toggleStar(selected)}
            onMarkUnread={markUnreadAndClose}
            onArchive={archiveSelected}
            onTrash={trashSelected}
            onRestore={restoreSelected}
            onDeleteForever={deleteForeverSelected}
            onEditDraft={() => {
              setReplyTo(null);
              setDraft(selected);
              setComposeOpen(true);
            }}
            onPopOut={() => popOutThread(selected)}
            onCollapse={collapseRead}
          />
        )}

        {popouts.map((w) => {
          const msg = messages.find((m) => m.id === w.msgId);
          if (!msg) return null;
          return (
            <ThreadWindow
              key={w.id}
              win={w}
              message={msg}
              onClose={() => closeWin(w.id)}
              onFocus={() => focusWin(w.id)}
              onPatch={(p) => patchWin(w.id, p)}
              onReply={() => {
                setDraft(null);
                setReplyTo(msg);
                setComposeOpen(true);
              }}
            />
          );
        })}

        <ComposeDrawer
          open={composeOpen}
          replyTo={replyTo}
          draft={draft}
          onClose={() => setComposeOpen(false)}
          onSend={handleSend}
          onSaveDraft={handleSaveDraft}
          onDeleteDraft={() => deleteDraft(draft)}
        />

        {toastEl}
        {helpOpen ? <KeyboardHelp onClose={() => setHelpOpen(false)} /> : null}
      </main>
    </div>
  );
}
