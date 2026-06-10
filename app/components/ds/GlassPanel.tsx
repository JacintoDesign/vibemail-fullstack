import type { CSSProperties, ReactNode } from "react";
import styles from "@/styles/glass.module.css";

export interface GlassPanelProps {
  tier?: 0 | 1 | 2;
  radius?: "sm" | "md";
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

const BG = ["var(--glass-0)", "var(--glass-1)", "var(--glass-2)"] as const;
const BLUR = ["var(--glass-blur-0)", "var(--glass-blur-1)", "var(--glass-blur-2)"] as const;

export function GlassPanel({
  tier = 1,
  radius = "md",
  style,
  className,
  children,
}: GlassPanelProps) {
  return (
    <div
      className={className ? `${styles.surface} ${className}` : styles.surface}
      style={{
        background: BG[tier],
        borderRadius: radius === "md" ? "var(--radius-md)" : "var(--radius-sm)",
        WebkitBackdropFilter: BLUR[tier],
        backdropFilter: BLUR[tier],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
