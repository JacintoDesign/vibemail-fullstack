"use client";

import type { CSSProperties, MouseEvent } from "react";

export interface RecipientTagProps {
  email: string;
  name?: string;
  readOnly?: boolean;
  className?: string;
  title?: string;
  style?: CSSProperties;
  onClick?: () => void;
  onRemove?: (e?: MouseEvent) => void;
}

export function RecipientTag({
  email,
  name,
  readOnly,
  className,
  title,
  style,
  onClick,
  onRemove,
}: RecipientTagProps) {
  const label = name || email;
  return (
    <span
      className={className}
      title={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        background: "var(--glass-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-full)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--text-secondary)",
        maxWidth: "100%",
        ...style,
      }}
    >
      {/* Avatar slot — hidden by .vm-chip-no-avatar in globals.css */}
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          borderRadius: "var(--radius-full)",
          background: "var(--accent-soft)",
          color: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        {label.charAt(0).toUpperCase()}
      </span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {!readOnly && onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${email}`}
          onClick={(e) => onRemove(e)}
          style={{
            display: "inline-flex",
            flexShrink: 0,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--text-faint)",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}
