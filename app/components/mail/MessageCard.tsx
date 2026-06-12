"use client";

// Collapsible thread message card. Shared by ReadingPane, ThreadWindow, and the
// ComposeDrawer quoted-thread view. Ported from VMMessageCard in ReadingPane.jsx.

import { useState, type CSSProperties } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { decodeEntities } from "@/lib/text";
import { GlassPanel, Icon } from "@/components/ds";
import { useSettings } from "@/providers/SettingsProvider";
import type { ThreadMsg } from "@/lib/types";

export function MessageCard({
  msg,
  expanded,
  onToggle,
  fill,
  bodyToggle,
}: {
  msg: ThreadMsg;
  expanded: boolean;
  onToggle: () => void;
  /** When the body is HTML-only, let the expanded card grow to fill the
   *  available reading-pane height (the iframe stretches) instead of being
   *  capped at a short fixed min-height. */
  fill?: boolean;
  /** Show the per-message Plain/HTML view toggle in the card header. Opt-in so
   *  the compose quoted-thread view stays toggle-free. */
  bodyToggle?: boolean;
}) {
  const hasPlain = !!msg.body;
  const hasHtml = !!msg.bodyHtml;
  // Global default for the body view, set in Settings.
  const { bodyView: globalView } = useSettings();
  // Per-message override of the global default. `null` means "follow the global
  // setting", so changing the global Plain/HTML option re-syncs every card that
  // hasn't been toggled by hand. Toggling one card sets its own override only —
  // it never touches the global setting or any other card. State lives on the
  // card instance, so the override resets when the thread reader remounts.
  const [override, setOverride] = useState<"plain" | "html" | null>(null);
  const mode = override ?? globalView;
  // Clamp the chosen mode to what actually exists, so a disabled option can
  // never end up rendered.
  const view: "plain" | "html" =
    mode === "html" && hasHtml ? "html" : hasPlain ? "plain" : hasHtml ? "html" : "plain";
  // The HTML iframe only flex-fills when it's the body actually on screen.
  const fillActive = !!fill && expanded && view === "html";
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
              {decodeEntities(msg.body || (msg.bodyHtml ? "HTML message — open to view" : ""))}
            </div>
          ) : null}
        </div>
        {expanded && bodyToggle ? (
          <BodyToggle view={view} hasPlain={hasPlain} hasHtml={hasHtml} onSelect={setOverride} />
        ) : null}
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
            <ExpandedBody msg={msg} view={view} fill={fillActive} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassPanel>
    </MotionConfig>
  );
}

// Segmented Plain / HTML control shown in an expanded card's header. An option
// is disabled when the message has no body of that format. Clicks stop
// propagation so toggling the view never collapses the card.
function BodyToggle({
  view,
  hasPlain,
  hasHtml,
  onSelect,
}: {
  view: "plain" | "html";
  hasPlain: boolean;
  hasHtml: boolean;
  onSelect: (mode: "plain" | "html") => void;
}) {
  const seg = (active: boolean, disabled: boolean): CSSProperties => ({
    appearance: "none",
    border: "none",
    background: active ? "var(--glass-2, var(--glass-1))" : "transparent",
    color: disabled ? "var(--text-faint)" : active ? "var(--text-primary)" : "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-micro)",
    fontWeight: active ? "var(--fw-bold)" : "var(--fw-regular)",
    lineHeight: 1,
    padding: "4px 8px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });
  return (
    <div
      role="group"
      aria-label="Body format"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        flexShrink: 0,
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        disabled={!hasPlain}
        aria-pressed={view === "plain"}
        title="Plain text"
        onClick={(e) => {
          e.stopPropagation();
          onSelect("plain");
        }}
        style={seg(view === "plain", !hasPlain)}
      >
        Plain
      </button>
      <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: "var(--border-default)" }} />
      <button
        type="button"
        disabled={!hasHtml}
        aria-pressed={view === "html"}
        title="Rendered HTML"
        onClick={(e) => {
          e.stopPropagation();
          onSelect("html");
        }}
        style={seg(view === "html", !hasHtml)}
      >
        HTML
      </button>
    </div>
  );
}

// The plain-text body is the primary rendering. When the HTML view is selected
// (or it's the only body available) render the HTML inside a sandboxed iframe —
// `sandbox` with no `allow-*` tokens blocks scripts, forms, popups, and
// same-origin access, so remote markup can't touch the app.
function ExpandedBody({ msg, view, fill }: { msg: ThreadMsg; view: "plain" | "html"; fill?: boolean }) {
  if (view === "html" && msg.bodyHtml) {
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
      {decodeEntities(msg.body ?? "")}
    </div>
  );
}
