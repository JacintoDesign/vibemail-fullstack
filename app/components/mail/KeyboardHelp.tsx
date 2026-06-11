"use client";

// Keyboard shortcuts cheatsheet — toggled with "?" (and dismissed with Escape,
// the close button, or a backdrop click). Rendered to document.body so it sits
// above every panel and pop-out window.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

interface Shortcut {
  keys: string[];
  desc: string;
}

interface Group {
  title: string;
  items: Shortcut[];
}

const GROUPS: Group[] = [
  {
    title: "Navigate",
    items: [
      { keys: ["j", "↓"], desc: "Next message" },
      { keys: ["k", "↑"], desc: "Previous message" },
      { keys: ["Enter", "o"], desc: "Open focused message" },
      { keys: ["g", "i"], desc: "Go to Inbox" },
      { keys: ["g", "s"], desc: "Go to Starred" },
      { keys: ["g", "t"], desc: "Go to Sent" },
      { keys: ["g", "d"], desc: "Go to Drafts" },
      { keys: ["g", "a"], desc: "Go to Archive" },
    ],
  },
  {
    title: "Act",
    items: [
      { keys: ["c"], desc: "Compose" },
      { keys: ["r"], desc: "Reply to open thread" },
      { keys: ["s"], desc: "Star / unstar" },
      { keys: ["e"], desc: "Archive" },
      { keys: ["#"], desc: "Delete (to Trash)" },
      { keys: ["u"], desc: "Mark unread" },
    ],
  },
  {
    title: "General",
    items: [
      { keys: ["/"], desc: "Search" },
      { keys: ["⌘", "K"], desc: "Search" },
      { keys: ["?"], desc: "Toggle this help" },
      { keys: ["Esc"], desc: "Close / back out" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
        height: 22,
        padding: "0 6px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-primary)",
        background: "var(--glass-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "inset 0 1px 0 var(--border-top-sheen)",
        lineHeight: 1,
      }}
    >
      {children}
    </kbd>
  );
}

export function KeyboardHelp({ onClose }: { onClose: () => void }) {
  // Lock body scroll while open is unnecessary (body is already overflow:hidden);
  // just ensure the dialog grabs focus so Escape and screen readers behave.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, []);

  const labelRow: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "5px 0",
  };

  return createPortal(
    <div
      className="vm-desktop-only"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--glass-scrim)",
        WebkitBackdropFilter: "var(--glass-blur-1)",
        backdropFilter: "var(--glass-blur-1)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "82vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          padding: "20px 22px 22px",
          background: "var(--glass-drawer)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-3), inset 0 1px 0 var(--border-top-sheen)",
          WebkitBackdropFilter: "var(--glass-blur-3)",
          backdropFilter: "var(--glass-blur-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-heading)",
              fontWeight: "var(--fw-bold)",
              color: "var(--text-primary)",
            }}
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            className="vm-tap"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              background: "var(--glass-1)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "18px 28px",
          }}
        >
          {GROUPS.map((g) => (
            <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-micro)",
                  letterSpacing: "var(--tracking-label)",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                  marginBottom: 6,
                }}
              >
                {g.title}
              </div>
              {g.items.map((s, idx) => (
                <div key={idx} style={labelRow}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-caption)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s.desc}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {s.keys.map((k, i) => (
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {i > 0 ? (
                          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                            {/* "g i" is a sequence; the rest are alternatives */}
                            {g.title === "Navigate" && s.keys.length === 2 && s.desc.startsWith("Go to")
                              ? "then"
                              : "/"}
                          </span>
                        ) : null}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-micro)",
            color: "var(--text-faint)",
            borderTop: "1px solid var(--border-hairline)",
            paddingTop: 12,
          }}
        >
          Shortcuts are inactive while typing in a text field.
        </div>
      </div>
    </div>,
    document.body,
  );
}
