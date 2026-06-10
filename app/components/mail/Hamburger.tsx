"use client";

import { useState } from "react";

export function Hamburger({
  onClick,
  expanded,
  size = 32,
}: {
  onClick?: () => void;
  expanded?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={expanded ? "Collapse panel" : "Expand panel"}
      title={expanded ? "Collapse panel" : "Expand panel"}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover ? "var(--glass-hover)" : "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
        color: hover ? "var(--text-primary)" : "var(--text-muted)",
        cursor: "pointer",
        transition:
          "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
      }}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </svg>
    </button>
  );
}
