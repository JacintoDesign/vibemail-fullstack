"use client";

import { useState } from "react";
import { decodeEntities } from "@/lib/text";
import type { Message } from "@/lib/types";
import { GlassPanel, IconButton } from "@/components/ds";
import { ChromeBtn } from "./PanelChrome";

export function RelatedPanel({
  messages,
  onOpen,
  stacked,
}: {
  messages: Message[];
  onOpen: (m: Message) => void;
  stacked?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (messages.length === 0) return null;

  const className = [
    "vm-related-rail",
    stacked ? "is-stacked" : "",
    collapsed ? "is-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside
      className={className}
      aria-label="Related messages"
      style={{
        width: stacked ? "100%" : collapsed ? 34 : 248,
        flexShrink: 0,
        minHeight: 0,
        height: stacked ? "auto" : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: !stacked && collapsed ? "center" : undefined,
        borderLeft: stacked ? "none" : "1px solid var(--border-hairline)",
        borderTop: stacked ? "1px solid var(--border-hairline)" : "none",
        marginTop: stacked ? 8 : 0,
        background: !stacked && collapsed ? "var(--glass-0)" : undefined,
        WebkitBackdropFilter: !stacked && collapsed ? "var(--glass-blur-0)" : undefined,
        backdropFilter: !stacked && collapsed ? "var(--glass-blur-0)" : undefined,
      }}
    >
      <div
        className="vm-related-head"
        style={{
          display: "flex",
          flexDirection: !stacked && collapsed ? "column" : "row",
          alignItems: "center",
          gap: !stacked && collapsed ? 12 : 4,
          padding: !stacked && collapsed ? "18px 0 16px" : stacked ? "10px 8px 6px" : "16px 8px 12px 14px",
          flexShrink: 0,
        }}
      >
        {!stacked && collapsed ? (
          <ChromeBtn icon="expandRight" label="Expand related" onClick={() => setCollapsed(false)} />
        ) : null}
        <span
          className="vm-related-label"
          style={{
            flex: stacked || !collapsed ? 1 : undefined,
            minWidth: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-micro)",
            letterSpacing: "var(--tracking-label)",
            textTransform: "uppercase",
            color: "var(--text-faint)",
            userSelect: "none",
            writingMode: !stacked && collapsed ? "vertical-rl" : undefined,
          }}
        >
          Related
        </span>
        {stacked || !collapsed ? (
          stacked ? (
            <IconButton
              icon="chevronDown"
              size="sm"
              label={collapsed ? "Expand related" : "Collapse related"}
              onClick={() => setCollapsed((v) => !v)}
              style={{
                transform: collapsed ? "none" : "rotate(180deg)",
                transition: "transform var(--dur-fast) var(--ease-standard)",
              }}
            />
          ) : (
            <ChromeBtn icon="collapseRight" label="Collapse related" onClick={() => setCollapsed(true)} />
          )
        ) : null}
      </div>
      {collapsed ? null : (
        <div
          className="vm-related-list"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: stacked ? "4px 8px 12px" : "4px 10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {messages.map((m) => (
            <RelatedCard key={m.id} m={m} onOpen={onOpen} />
          ))}
        </div>
      )}
    </aside>
  );
}

function RelatedCard({ m, onOpen }: { m: Message; onOpen: (m: Message) => void }) {
  const [hover, setHover] = useState(false);
  const subject = decodeEntities(m.subject || "(no subject)");
  const snippet = decodeEntities(m.snippet || "");

  return (
    <GlassPanel
      tier={hover ? 1 : 0}
      radius="sm"
      className="vm-related-card"
      style={{
        padding: "10px 12px",
        cursor: "pointer",
        border: `1px solid ${hover ? "var(--border-strong)" : "var(--border-hairline)"}`,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`${m.senderName}: ${subject}`}
        onClick={() => onOpen(m)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(m);
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: "var(--text-caption)",
              fontWeight: "var(--fw-medium)",
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.senderName}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-micro)",
              color: "var(--text-faint)",
            }}
          >
            {m.time}
          </span>
        </div>
        <div
          style={{
            fontSize: "var(--text-caption)",
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subject}
        </div>
        {snippet ? (
          <div
            style={{
              fontSize: "var(--text-micro)",
              color: "var(--text-faint)",
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {snippet}
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
}
