"use client";

import { useState } from "react";
import type { Theme } from "@/lib/shell-vars";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const [hover, setHover] = useState(false);
  const light = theme === "light";
  return (
    <button
      type="button"
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover ? "var(--glass-hover)" : "var(--glass-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        color: hover ? "var(--text-primary)" : "var(--text-muted)",
        cursor: "pointer",
        padding: 0,
        boxShadow: "inset 0 1px 0 var(--border-top-sheen)",
        transition:
          "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {light ? (
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        ) : (
          <g>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </g>
        )}
      </svg>
    </button>
  );
}
