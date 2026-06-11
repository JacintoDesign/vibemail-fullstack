"use client";

// Right column: thread reader + empty placeholder. Ported from ReadingPane.jsx.

import { useEffect, useState } from "react";
import { Badge, Button, Icon, IconButton } from "@/components/ds";
import type { Message } from "@/lib/types";
import { ChromeBtn } from "./PanelChrome";
import { Hamburger } from "./Hamburger";
import { MessageCard } from "./MessageCard";

export interface ReadingPaneProps {
  message: Message | null;
  onReply: () => void;
  onToggleStar: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
  onEditDraft: () => void;
  onPopOut: () => void;
  onCollapse: () => void;
  mobile?: boolean;
  onMenu?: () => void;
  onBack?: () => void;
}

const quickReplyStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 2,
  padding: "12px 16px",
  width: "100%",
  textAlign: "left",
  background: "var(--glass-0)",
  border: "1px dashed var(--border-default)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-faint)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-row)",
  cursor: "pointer",
  WebkitBackdropFilter: "var(--glass-blur-0)",
  backdropFilter: "var(--glass-blur-0)",
} as const;

export function ReadingPane(props: ReadingPaneProps) {
  const { message, onCollapse } = props;

  if (!message) {
    return (
      <div
        style={{
          flex: 1,
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: "var(--text-faint)",
          textAlign: "center",
          padding: 24,
          minWidth: "var(--thread-min)",
          containerType: "inline-size",
          containerName: "vmempty",
        }}
      >
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <ChromeBtn icon="collapseRight" label="Collapse reading pane" onClick={onCollapse} />
        </div>
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--glass-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            boxShadow: "var(--shadow-1), inset 0 1px 0 var(--border-top-sheen)",
            WebkitBackdropFilter: "var(--glass-blur-1)",
            backdropFilter: "var(--glass-blur-1)",
          }}
        >
          <Icon name="mail" size={30} />
        </span>
        <div
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-body)", color: "var(--text-muted)" }}
        >
          Select a conversation to read.
        </div>
        <div
          className="vm-empty-hints"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-caption)",
            color: "var(--text-faint)",
            lineHeight: 1.7,
          }}
        >
          <span>
            <span style={{ color: "var(--text-muted)" }}>[+]</span> cmd-k to search
          </span>
          <span className="vm-hint-sep">&nbsp;·&nbsp;</span>
          <span>click the dot to mark read</span>
        </div>
      </div>
    );
  }

  return <ThreadReader key={message.id} {...props} message={message} />;
}

function ThreadReader({
  message,
  onReply,
  onToggleStar,
  onMarkUnread,
  onArchive,
  onTrash,
  onRestore,
  onDeleteForever,
  onEditDraft,
  onPopOut,
  onCollapse,
  mobile,
  onMenu,
  onBack,
}: ReadingPaneProps & { message: Message }) {
  const thread = message.thread || [];
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set([thread.length - 1]));
  useEffect(() => {
    setOpenSet(new Set([thread.length - 1]));
  }, [message.id, thread.length]);

  const toggleMsg = (i: number) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const isDraft = message.status === "draft";
  const inTrash = message.status === "trash";
  const inArchive = message.status === "archived";

  const cards = thread.map((m, i) => (
    <MessageCard key={i} msg={m} expanded={openSet.has(i)} onToggle={() => toggleMsg(i)} />
  ));

  const quickReply = !isDraft ? (
    <button
      type="button"
      onClick={onReply}
      style={quickReplyStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--glass-1)";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--glass-0)";
        e.currentTarget.style.color = "var(--text-faint)";
      }}
    >
      <Icon name="reply" size={15} />
      Reply to {message.senderName}…
    </button>
  ) : null;

  // ── Mobile: single-panel thread view with a back-to-inbox header ──────────
  if (mobile) {
    const mobileBtn = { width: 32, height: 32 };
    const mobileActions = isDraft ? (
      <Button variant="primary" icon="compose" size="sm" onClick={onEditDraft}>
        Edit draft
      </Button>
    ) : inTrash ? (
      <>
        <IconButton icon="inbox" variant="ghost" label="Restore to Inbox" onClick={onRestore} style={mobileBtn} />
        <IconButton icon="star" label="Star" active={message.isStarred} onClick={onToggleStar} style={mobileBtn} />
        <IconButton icon="trash" variant="ghost" label="Delete forever" onClick={onDeleteForever} style={mobileBtn} />
      </>
    ) : inArchive ? (
      <>
        <IconButton icon="inbox" variant="ghost" label="Move to Inbox" onClick={onRestore} style={mobileBtn} />
        <IconButton icon="mail" variant="ghost" label="Mark unread" onClick={onMarkUnread} style={mobileBtn} />
        <IconButton icon="star" label="Star" active={message.isStarred} onClick={onToggleStar} style={mobileBtn} />
        <IconButton icon="trash" variant="ghost" label="Delete" onClick={onTrash} style={mobileBtn} />
      </>
    ) : (
      <>
        <IconButton icon="mail" variant="ghost" label="Mark unread" onClick={onMarkUnread} style={mobileBtn} />
        <IconButton icon="star" label="Star" active={message.isStarred} onClick={onToggleStar} style={mobileBtn} />
        <IconButton icon="archive" variant="ghost" label="Archive" onClick={onArchive} style={mobileBtn} />
        <IconButton icon="trash" variant="ghost" label="Delete" onClick={onTrash} style={mobileBtn} />
      </>
    );
    return (
      <div
        className="vm-thread-reader"
        style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "8px 8px 10px",
            borderBottom: "1px solid var(--border-hairline)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
            <Hamburger onClick={onMenu} />
            <ChromeBtn icon="back" label="Back to inbox" onClick={onBack} size={32} />
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>{mobileActions}</div>
          </div>
          <h1
            style={{
              margin: "0 4px",
              fontSize: "var(--text-heading)",
              fontWeight: "var(--fw-bold)",
              color: "var(--text-primary)",
              lineHeight: 1.3,
              overflowWrap: "anywhere",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {message.subject || "(no subject)"}
          </h1>
        </div>
        <div
          className="vm-thread-msgs"
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: "10px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {cards}
          {quickReply}
        </div>
      </div>
    );
  }

  // ── Desktop ───────────────────────────────────────────────────────────────
  const actionsEl = isDraft ? (
    <Button variant="primary" icon="compose" size="sm" onClick={onEditDraft}>
      Edit draft
    </Button>
  ) : inTrash ? (
    <>
      <IconButton icon="inbox" variant="ghost" label="Restore to Inbox" onClick={onRestore} />
      <IconButton icon="star" label="Star" active={message.isStarred} onClick={onToggleStar} />
      <IconButton icon="trash" variant="ghost" label="Delete forever" onClick={onDeleteForever} />
      <ChromeBtn icon="popOut" label="Pop out thread" onClick={onPopOut} />
    </>
  ) : inArchive ? (
    <>
      <IconButton icon="inbox" variant="ghost" label="Move to Inbox" onClick={onRestore} />
      <IconButton icon="mail" variant="ghost" label="Mark unread" onClick={onMarkUnread} />
      <IconButton icon="star" label="Star" active={message.isStarred} onClick={onToggleStar} />
      <IconButton icon="trash" variant="ghost" label="Delete" onClick={onTrash} />
      <ChromeBtn icon="popOut" label="Pop out thread" onClick={onPopOut} />
    </>
  ) : (
    <>
      <IconButton icon="mail" variant="ghost" label="Mark unread" onClick={onMarkUnread} />
      <IconButton icon="star" label="Star" active={message.isStarred} onClick={onToggleStar} />
      <IconButton icon="archive" variant="ghost" label="Archive" onClick={onArchive} />
      <IconButton icon="trash" variant="ghost" label="Delete" onClick={onTrash} />
      <ChromeBtn icon="popOut" label="Pop out thread" onClick={onPopOut} />
    </>
  );

  return (
    <div
      className="vm-thread-reader"
      style={{ flex: 1, minWidth: "var(--thread-min)", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div className="vm-thread-head">
        <h1 className="vm-thread-title">{message.subject || "(no subject)"}</h1>
        <div className="vm-thread-actions">{actionsEl}</div>
        <div className="vm-thread-collapse">
          <ChromeBtn icon="collapseRight" label="Collapse reading pane" onClick={onCollapse} />
        </div>
        <div className="vm-thread-meta">
          <span
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-faint)" }}
          >
            {thread.length} message{thread.length === 1 ? "" : "s"}
          </span>
          {isDraft ? <Badge tone="warning">Draft</Badge> : null}
          {message.status === "sent" ? <Badge>Sent</Badge> : null}
          {(message.labels || []).map((l) => (
            <Badge key={l}>{l}</Badge>
          ))}
        </div>
      </div>

      <div
        className="vm-thread-msgs"
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          padding: "18px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {cards}
        {quickReply}
      </div>
    </div>
  );
}
