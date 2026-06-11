"use client";

// Panel chrome: column resizer, collapsed rail, chrome buttons. Lucide doesn't
// carry the panel-collapse / pop-out glyphs, so they stay hand-rolled SVG
// (stroke 1.75 to match the DS Icon). Ported from PanelChrome.jsx.

import { useState } from "react";

export type ChromeIconName =
  | "collapseLeft"
  | "expandLeft"
  | "collapseRight"
  | "expandRight"
  | "popOut"
  | "back"
  | "maximize"
  | "restore";

const VM_CHROME_PATHS: Record<ChromeIconName, string> = {
  collapseLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  expandLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  collapseRight: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
  expandRight: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/>',
  popOut: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  restore: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
};

export function ChromeIcon({ name, size = 15 }: { name: ChromeIconName; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: VM_CHROME_PATHS[name] || "" }}
    />
  );
}

export function ChromeBtn({
  icon,
  label,
  onClick,
  size = 28,
}: {
  icon: ChromeIconName;
  label: string;
  onClick?: () => void;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover ? "var(--glass-hover)" : "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
        color: hover ? "var(--text-primary)" : "var(--text-muted)",
        cursor: "pointer",
        transition:
          "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
      }}
    >
      <ChromeIcon name={icon} />
    </button>
  );
}

export function Resizer({
  onMove,
  onEnd,
  onDoubleClick,
  label,
}: {
  onMove: (clientX: number) => void;
  onEnd?: (clientX: number) => void;
  onDoubleClick?: () => void;
  label?: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={"vm-resizer" + (dragging ? " dragging" : "")}
      role="separator"
      aria-orientation="vertical"
      aria-label={label || "Resize column"}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        document.body.classList.add("vm-col-dragging");
      }}
      onPointerMove={(e) => {
        if (dragging) onMove(e.clientX);
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        setDragging(false);
        document.body.classList.remove("vm-col-dragging");
        onEnd?.(e.clientX);
      }}
      onPointerCancel={(e) => {
        if (!dragging) return;
        setDragging(false);
        document.body.classList.remove("vm-col-dragging");
        onEnd?.(e.clientX);
      }}
      onDoubleClick={onDoubleClick}
    />
  );
}

export function CollapsedRail({
  side = "left",
  label,
  onExpand,
}: {
  side?: "left" | "right";
  label: string;
  onExpand?: () => void;
}) {
  return (
    <div
      style={{
        width: 34,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "18px 0 16px",
        background: "var(--glass-0)",
        borderRight: side === "left" ? "1px solid var(--border-hairline)" : "none",
        borderLeft: side === "right" ? "1px solid var(--border-hairline)" : "none",
        WebkitBackdropFilter: "var(--glass-blur-0)",
        backdropFilter: "var(--glass-blur-0)",
      }}
    >
      <ChromeBtn
        icon={side === "left" ? "expandLeft" : "expandRight"}
        label={`Expand ${label}`}
        onClick={onExpand}
      />
      <span
        style={{
          writingMode: "vertical-rl",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-micro)",
          letterSpacing: "var(--tracking-label)",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          userSelect: "none",
        }}
      >
        {label}
      </span>
    </div>
  );
}
