"use client";

// Shared message row — the roomy glass card used by the inbox list and the
// search-results list (both flow through MessageList). Ported from
// VMInboxCard in MessageList.jsx.

import { useState, type MouseEvent } from "react";
import { Badge, Icon } from "@/components/ds";
import type { Message } from "@/lib/types";

export interface MessageRowProps {
  m: Message;
  selected?: boolean;
  compact?: boolean;
  onOpen: (m: Message) => void;
  onToggleRead: () => void;
  onToggleStar: () => void;
}

export function MessageRow({
  m,
  selected,
  compact,
  onOpen,
  onToggleRead,
  onToggleStar,
}: MessageRowProps) {
  const [hover, setHover] = useState(false);
  const unread = !m.isRead;
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(m)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 7,
        padding: compact ? "8px" : "var(--card-pad)",
        cursor: "pointer",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border-hairline)"}`,
        background: selected
          ? "var(--accent-soft)"
          : hover
            ? "var(--glass-hover)"
            : unread
              ? "var(--glass-1)"
              : "var(--glass-0)",
        boxShadow: selected
          ? "var(--shadow-1), inset 0 1px 0 var(--border-top-sheen)"
          : "inset 0 1px 0 var(--border-top-sheen)",
        WebkitBackdropFilter: "var(--glass-blur-0)",
        backdropFilter: "var(--glass-blur-0)",
        transition:
          "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
      }}
    >
      {/* Row 1 — sender · unread dot · star · date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-body)",
              fontWeight: unread ? "var(--fw-bold)" : "var(--fw-medium)",
              color: unread ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {m.senderName}
          </span>
          {unread ? (
            <button
              type="button"
              aria-label="Mark read"
              onClick={stop(onToggleRead)}
              style={{
                flexShrink: 0,
                width: 8,
                height: 8,
                padding: 0,
                border: "none",
                borderRadius: "var(--radius-full)",
                cursor: "pointer",
                background: "var(--dot-unread)",
                boxShadow: "0 0 8px var(--accent-glow)",
              }}
            />
          ) : null}
        </div>
        <button
          type="button"
          aria-label={m.isStarred ? "Unstar" : "Star"}
          onClick={stop(onToggleStar)}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            color: m.isStarred ? "var(--star-active)" : "var(--star-idle)",
            opacity: m.isStarred || hover ? 1 : 0,
            transition:
              "opacity var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
          }}
        >
          <Icon name="star" size={15} fill={m.isStarred ? "currentColor" : "none"} />
        </button>
        <span
          style={{
            flexShrink: 0,
            whiteSpace: "nowrap",
            fontSize: "var(--text-caption)",
            color: "rgb(24, 199, 69)",
          }}
        >
          {m.time}
        </span>
      </div>

      {/* Row 2 — subject */}
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-row)",
          fontWeight: unread ? "var(--fw-medium)" : "var(--fw-regular)",
          color: unread ? "var(--text-secondary)" : "var(--text-muted)",
        }}
      >
        {m.subject}
      </div>

      {/* Row 3 — preview */}
      <div
        style={{
          display: "-webkit-box",
          WebkitLineClamp: compact ? 1 : 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-row)",
          lineHeight: 1.5,
          color: "var(--text-faint)",
        }}
      >
        {m.snippet}
      </div>

      {/* Row 4 — labels */}
      {!compact && m.labels && m.labels.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 1 }}>
          {m.labels.map((l) => (
            <Badge key={l}>{l}</Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
