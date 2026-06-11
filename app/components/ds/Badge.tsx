import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface BadgeProps {
  children: ReactNode;
  tone?: "default" | "warning";
  /** When provided, renders a remove "x" after the content. */
  onRemove?: () => void;
  /** Controls the remove "x" visibility (e.g. driven by the parent card's hover). */
  removeVisible?: boolean;
  /** Accessible label for the remove button. */
  removeLabel?: string;
}

export function Badge({ children, tone = "default", onRemove, removeVisible, removeLabel }: BadgeProps) {
  const warning = tone === "warning";
  // Only show (and reserve space for) the remove "x" while it's revealed — an
  // idle removable badge looks identical to a plain one.
  const showRemove = !!onRemove && !!removeVisible;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: showRemove ? 2 : 0,
        padding: showRemove ? "2px 5px 2px 8px" : "2px 8px",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        lineHeight: 1.4,
        background: warning ? "rgba(255,159,10,0.12)" : "var(--glass-1)",
        border: `1px solid ${warning ? "var(--warning)" : "var(--border-hairline)"}`,
        color: warning ? "var(--warning)" : "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
      {showRemove ? (
        <button
          type="button"
          aria-label={removeLabel ?? "Remove"}
          title={removeLabel ?? "Remove"}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 12,
            height: 12,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "currentColor",
            cursor: "pointer",
            opacity: 0.65,
            transition: "opacity var(--dur-fast) var(--ease-standard)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.65";
          }}
        >
          <Icon name="x" size={10} color="currentColor" />
        </button>
      ) : null}
    </span>
  );
}
