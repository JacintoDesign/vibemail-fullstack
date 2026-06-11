"use client";

import { useState, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

export interface IconButtonProps {
  icon: IconName;
  label: string;
  variant?: "ghost";
  size?: "sm" | "md";
  active?: boolean;
  spinning?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

export function IconButton({
  icon,
  label,
  size = "md",
  active = false,
  spinning = false,
  onClick,
  style,
}: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const dim = size === "sm" ? 28 : 34;
  const iconSize = size === "sm" ? 15 : 16;

  const color = active
    ? "var(--accent)"
    : hover
      ? "var(--text-primary)"
      : "var(--text-muted)";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: dim,
        height: dim,
        flexShrink: 0,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover && !active ? "var(--glass-hover)" : "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
        color,
        cursor: "pointer",
        transition:
          "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
    >
      <span style={{ display: "flex", animation: spinning ? "vmSpin 0.8s linear infinite" : undefined }}>
        <Icon
          name={icon}
          size={iconSize}
          fill={active && icon === "star" ? "currentColor" : "none"}
        />
      </span>
    </button>
  );
}
