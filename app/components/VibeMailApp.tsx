"use client";

// Port of App.jsx (authed shell): desktop 3-pane + mobile shell, persisted
// layout, pop-out windows, compose flow, toast. Theme/accent/glass/font/nebula
// effects now live in SettingsProvider + NebulaBackground; the design-time
// tweaks panel and its demo-state / simulate-send-fail knobs are dropped.

import { useEffect, useMemo, useRef, useState } from "react";
import { ComposeDrawer } from "@/components/mail/ComposeDrawer";
import { MessageList } from "@/components/mail/MessageList";
import type { ReadFilter } from "@/components/mail/MessageList";
import { CollapsedRail, Resizer } from "@/components/mail/PanelChrome";
import { ReadingPane } from "@/components/mail/ReadingPane";
import { Sidebar } from "@/components/mail/Sidebar";
import { ThreadWindow, type PopoutWin } from "@/components/mail/ThreadWindow";
import { getMailbox } from "@/lib/data-source";
import type { CSSVars, Message } from "@/lib/types";
import { useSettings } from "@/providers/SettingsProvider";

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
  tone: "success";
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
  const [messages, setMessages] = useState<Message[]>(() => getMailbox().messages);
  const labels = useMemo(() => getMailbox().labels, []);

  const [filter, setFilter] = useState("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [draft, setDraft] = useState<Message | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Simulate a fetch on folder change.
  useEffect(() => {
    setLoading(true);
    const id = setTimeout(() => setLoading(false), 520);
    return () => clearTimeout(id);
  }, [filter]);

  // cmd-k search, esc to exit.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchMode(true);
      }
      if (e.key === "Escape" && searchMode) {
        setSearchMode(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [searchMode]);

  const counts = useMemo(
    () => ({
      inbox: messages.filter((m) => m.status === "inbox" && !m.isRead).length,
      starred: messages.filter((m) => m.isStarred && m.status !== "trash").length,
      drafts: messages.filter((m) => m.status === "draft").length,
    }),
    [messages],
  );

  const baseVisible = useMemo(() => {
    if (searchMode) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return messages.filter(
        (m) =>
          m.status !== "trash" &&
          (m.senderName.toLowerCase().includes(q) ||
            (m.senderEmail || "").toLowerCase().includes(q) ||
            m.subject.toLowerCase().includes(q) ||
            m.snippet.toLowerCase().includes(q) ||
            (m.to || "").toLowerCase().includes(q)),
      );
    }
    if (filter === "all") return messages.filter((m) => m.status === "inbox");
    if (filter === "starred") return messages.filter((m) => m.isStarred && m.status !== "trash");
    if (filter === "sent") return messages.filter((m) => m.status === "sent");
    if (filter === "drafts") return messages.filter((m) => m.status === "draft");
    if (filter === "archived") return messages.filter((m) => m.status === "archived");
    if (filter === "trash") return messages.filter((m) => m.status === "trash");
    if (filter.startsWith("label:")) {
      const l = filter.slice(6);
      return messages.filter((m) => m.status === "inbox" && (m.labels || []).includes(l));
    }
    return [];
  }, [messages, filter, searchMode, query]);

  const visible = !searchMode && readFilter === "unread" ? baseVisible.filter((m) => !m.isRead) : baseVisible;

  const update = (id: string, patch: Partial<Message>) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const selected = useMemo(() => messages.find((m) => m.id === selectedId) || null, [messages, selectedId]);

  const showToast = (txt: string) => {
    setToast({ txt, tone: "success" });
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
    if (!m.isRead) update(m.id, { isRead: true, labelIds: (m.labelIds || []).filter((l) => l !== "UNREAD") });
    setSelectedId(m.id);
    if (layout.readCollapsed) patchLayout({ readCollapsed: false });
  };
  const toggleRead = (m: Message) => update(m.id, { isRead: !m.isRead });
  const toggleStar = (m: Message) => update(m.id, { isStarred: !m.isStarred });

  const selectFolder = (f: string) => {
    setSelectedId(null);
    setSearchMode(false);
    setQuery("");
    setReadFilter("all");
    setFilter(f);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };
  const onRetry = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 600);
  };

  const markUnreadAndClose = () => {
    if (selected) update(selected.id, { isRead: false });
    setSelectedId(null);
  };
  const archiveSelected = () => {
    if (selected) {
      update(selected.id, { status: "archived", labelIds: (selected.labelIds || []).filter((l) => l !== "INBOX") });
      showToast("Conversation archived.");
      setSelectedId(null);
    }
  };
  const trashSelected = () => {
    if (selected) {
      update(selected.id, { status: "trash", labelIds: ["TRASH"] });
      showToast("Moved to Trash.");
      setSelectedId(null);
    }
  };

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
        style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: "var(--success)", flexShrink: 0 }}
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
            error={null}
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
              labels={labels}
              rail={false}
              width={270}
              mobile
              onClose={() => setMobileNavOpen(false)}
              onToggleRail={() => {}}
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
          onSend={(n) => {
            setComposeOpen(false);
            showToast(`Message sent to ${n} recipient${n === 1 ? "" : "s"}.`);
          }}
          onSaveDraft={() => {
            setComposeOpen(false);
            showToast("Draft saved.");
          }}
        />

        {toastEl}
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
        labels={labels}
        rail={layout.sidebarRail}
        width={layout.sidebarW}
        onSelect={selectFolder}
        onToggleRail={() => patchLayout({ sidebarRail: !layout.sidebarRail })}
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
            error={null}
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
          onSend={(n) => {
            setComposeOpen(false);
            showToast(`Message sent to ${n} recipient${n === 1 ? "" : "s"}.`);
          }}
          onSaveDraft={() => {
            setComposeOpen(false);
            showToast("Draft saved.");
          }}
        />

        {toastEl}
      </main>
    </div>
  );
}
