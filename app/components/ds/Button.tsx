"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { CSSVars } from "@/lib/types";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  variant?: ButtonVariant;
  icon?: IconName;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  children?: ReactNode;
  style?: CSSProperties;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 28, md: 36, lg: 44 };
const PAD: Record<ButtonSize, string> = { sm: "0 10px", md: "0 14px", lg: "0 18px" };
const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 17 };

export function Button({
  variant = "secondary",
  icon,
  size = "md",
  fullWidth,
  disabled,
  onClick,
  type = "button",
  children,
  style,
}: ButtonProps) {
  const [hover, setHover] = useState(false);

  const base: CSSVars = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: HEIGHT[size],
    padding: PAD[size],
    width: fullWidth ? "100%" : undefined,
    border: "1px solid transparent",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-row)",
    fontWeight: "var(--fw-medium)",
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition:
      "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
  };

  let variantStyle: CSSProperties;
  if (variant === "primary") {
    variantStyle = {
      background: hover && !disabled ? "var(--accent-hover)" : "var(--accent)",
      color: "var(--on-accent)",
      boxShadow: "var(--shadow-0), inset 0 1px 0 var(--border-top-sheen)",
    };
  } else if (variant === "ghost") {
    variantStyle = {
      background: hover && !disabled ? "var(--glass-1)" : "transparent",
      color: hover && !disabled ? "var(--text-primary)" : "var(--text-muted)",
    };
  } else {
    variantStyle = {
      background: hover && !disabled ? "var(--glass-hover)" : "var(--glass-1)",
      color: "var(--text-primary)",
      borderColor: "var(--border-default)",
      boxShadow: "inset 0 1px 0 var(--border-top-sheen)",
      backdropFilter: "var(--glass-blur-1)",
      WebkitBackdropFilter: "var(--glass-blur-1)",
    };
  }

  return (
    <button
      type={type}
      className="vm-tap"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variantStyle, ...style }}
    >
      {icon ? <Icon name={icon} size={ICON_SIZE[size]} /> : null}
      {children}
    </button>
  );
}
