"use client";

import { useState, type ChangeEvent, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

export interface InputProps {
  icon?: IconName;
  glow?: boolean;
  invalid?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  style?: CSSProperties;
}

export function Input({
  icon,
  glow,
  invalid,
  placeholder,
  value,
  onChange,
  onClear,
  style,
}: InputProps) {
  const [focus, setFocus] = useState(false);
  const lit = glow || focus;

  const borderColor = invalid
    ? "var(--danger)"
    : lit
      ? "var(--accent)"
      : "var(--border-default)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: "var(--control-h)",
        padding: "0 10px",
        background: "var(--surface-input)",
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius-sm)",
        boxShadow: lit
          ? "0 0 0 3px var(--accent-soft), inset 0 1px 0 var(--border-top-sheen)"
          : "inset 0 1px 0 var(--border-top-sheen)",
        WebkitBackdropFilter: "var(--glass-blur-1)",
        backdropFilter: "var(--glass-blur-1)",
        transition:
          "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
    >
      {icon ? (
        <span style={{ display: "inline-flex", flexShrink: 0, color: "var(--text-faint)" }}>
          <Icon name={icon} size={15} />
        </span>
      ) : null}
      <input
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-body)",
        }}
      />
      {onClear && value ? (
        <button
          type="button"
          aria-label="Clear"
          onClick={onClear}
          style={{
            display: "inline-flex",
            flexShrink: 0,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--text-faint)",
            cursor: "pointer",
          }}
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}
