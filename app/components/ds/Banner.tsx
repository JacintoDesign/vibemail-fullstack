import type { ReactNode } from "react";

export interface BannerProps {
  tone?: "error";
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}

export function Banner({ action, onAction, children }: BannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "var(--danger-soft)",
        border: "1px solid var(--danger)",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--text-secondary)",
        lineHeight: 1.5,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          flexShrink: 0,
          borderRadius: "var(--radius-full)",
          background: "var(--danger)",
        }}
      />
      <span style={{ flex: 1 }}>{children}</span>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-caption)",
            fontWeight: "var(--fw-medium)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
