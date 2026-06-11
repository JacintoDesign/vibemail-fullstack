"use client";

// Collapsible thread message card. Shared by ReadingPane, ThreadWindow, and the
// ComposeDrawer quoted-thread view. Ported from VMMessageCard in ReadingPane.jsx.

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { GlassPanel, Icon } from "@/components/ds";
import type { ThreadMsg } from "@/lib/types";

export function MessageCard({
  msg,
  expanded,
  onToggle,
  fill,
}: {
  msg: ThreadMsg;
  expanded: boolean;
  onToggle: () => void;
  /** When the body is HTML-only, let the expanded card grow to fill the
   *  available reading-pane height (the iframe stretches) instead of being
   *  capped at a short fixed min-height. */
  fill?: boolean;
}) {
  // The HTML iframe is only rendered when there's no plain-text body — match
  // that condition so a text card never tries to flex-fill.
  const htmlOnly = !msg.body && !!msg.bodyHtml;
  const fillActive = !!fill && expanded && htmlOnly;
  return (
    <MotionConfig reducedMotion="user">
    <GlassPanel
      tier={expanded ? 1 : 0}
      radius="md"
      style={
        fillActive
          ? { overflow: "hidden", flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }
          : { overflow: "hidden", flexShrink: 0 }
      }
    >
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
              {msg.body || (msg.bodyHtml ? "HTML message — open to view" : "")}
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
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            // A fill card flexes to a definite height, so animate opacity only —
            // a height tween would fight `flex: 1`. A normal card animates its
            // height open/closed as before.
            initial={fillActive ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={fillActive ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={fillActive ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.85, 0.3, 1] }}
            style={
              fillActive
                ? { overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                : { overflow: "hidden" }
            }
          >
            <ExpandedBody msg={msg} fill={fillActive} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassPanel>
    </MotionConfig>
  );
}

// The plain-text body is the primary rendering. When it is empty (the wire
// reported `bodyPlain: null`) but an HTML body exists, render that HTML inside a
// sandboxed iframe — `sandbox` with no `allow-*` tokens blocks scripts, forms,
// popups, and same-origin access, so remote markup can't touch the app.
function ExpandedBody({ msg, fill }: { msg: ThreadMsg; fill?: boolean }) {
  if (!msg.body && msg.bodyHtml) {
    return (
      <div
        className="vm-msg-body"
        style={
          fill
            ? { padding: "16px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
            : { padding: "16px" }
        }
      >
        <iframe
          title="Email body"
          sandbox=""
          srcDoc={msg.bodyHtml}
          style={{
            width: "100%",
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-input, #fff)",
            colorScheme: "light",
            // Fill: stretch to the card's remaining height (iframe scrolls
            // internally). Otherwise keep the short fixed floor.
            ...(fill ? { flex: 1, minHeight: 0 } : { minHeight: 240 }),
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="vm-msg-body"
      style={{
        padding: "16px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-body)",
        lineHeight: "var(--lh-body)",
        color: "var(--text-body-ink)",
        whiteSpace: "pre-wrap",
      }}
    >
      {msg.body}
    </div>
  );
}
