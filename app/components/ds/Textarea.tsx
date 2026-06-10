"use client";

import type { ChangeEvent, CSSProperties } from "react";

export interface TextareaProps {
  rows?: number;
  placeholder?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  style?: CSSProperties;
}

export function Textarea({ rows = 6, placeholder, value, onChange, style }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      style={{
        width: "100%",
        padding: 12,
        background: "var(--surface-input)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "inset 0 1px 0 var(--border-top-sheen)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-body)",
        lineHeight: "var(--lh-body)",
        outline: "none",
        resize: "none",
        WebkitBackdropFilter: "var(--glass-blur-1)",
        backdropFilter: "var(--glass-blur-1)",
        ...style,
      }}
    />
  );
}
