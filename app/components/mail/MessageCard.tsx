"use client";

// Collapsible thread message card. Shared by ReadingPane, ThreadWindow, and the
// ComposeDrawer quoted-thread view. Ported from VMMessageCard in ReadingPane.jsx.

import { GlassPanel, Icon } from "@/components/ds";
import type { ThreadMsg } from "@/lib/types";

export function MessageCard({
  msg,
  expanded,
  onToggle,
}: {
  msg: ThreadMsg;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <GlassPanel tier={expanded ? 1 : 0} radius="md" style={{ overflow: "hidden" }}>
      <div
        className="vm-msg-head"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          cursor: "pointer",
          borderBottom: expanded ? "1px solid var(--border-hairline)" : "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="vm-msg-idrow"
            style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-body)",
                fontWeight: "var(--fw-bold)",
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
              }}
            >
              {msg.from}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-micro)",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {msg.email}
            </span>
          </div>
          <span
            className="vm-msg-date-stack"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-caption)",
              color: "var(--text-muted)",
              marginTop: 3,
            }}
          >
            {msg.date}
          </span>
          {!expanded ? (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-row)",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: 4,
              }}
            >
              {msg.body}
            </div>
          ) : null}
        </div>
        <span
          className="vm-msg-date-inline"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-caption)",
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          {msg.date}
        </span>
        <button
          type="button"
          aria-label={expanded ? "Collapse message" : "Expand message"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--text-faint)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform var(--dur-fast) var(--ease-standard)",
            }}
          >
            <Icon name="chevronDown" size={16} />
          </span>
        </button>
      </div>
      {expanded ? (
        <div
          className="vm-msg-body"
          style={{
            padding: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-body)",
            lineHeight: "var(--lh-body)",
            color: "var(--text-body-ink)",
            whiteSpace: "pre-wrap",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {msg.body}
        </div>
      ) : null}
    </GlassPanel>
  );
}
