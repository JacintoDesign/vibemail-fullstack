import type { ReactNode } from "react";

export interface BadgeProps {
  children: ReactNode;
  tone?: "default" | "warning";
}

export function Badge({ children, tone = "default" }: BadgeProps) {
  const warning = tone === "warning";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
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
    </span>
  );
}
