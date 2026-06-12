"use client";

// Per-message label adder. A small "+" that sits in a card's label row (after
// any badges, or on its own when there are none) and reveals on hover. Opening
// it shows the labels not yet on the message. Applying a label calls
// POST /api/v1/messages/:id/labels (optimistic, reconciled from the response).
//
// Open state is controlled by the parent row so the label row can stay mounted
// while the menu is open even after the pointer leaves the card. The menu itself
// is portalled to the body so it is never clipped by the scrolling list.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ds";

export interface LabelPickerProps {
  /** Show the "+" button (driven by the row's hover state). */
  visible: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appliedLabels: string[];
  allLabels: string[];
  onAdd: (label: string) => void;
}

function PlusGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function LabelPicker({
  visible,
  open,
  onOpenChange,
  appliedLabels,
  allLabels,
  onAdd,
}: LabelPickerProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const remaining = allLabels.filter((l) => !appliedLabels.includes(l));

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      onOpenChange(false);
    };
    const onScroll = () => onOpenChange(false);
    const id = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      window.addEventListener("scroll", onScroll, true);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onOpenChange]);

  const show = visible || open;

  const menuStyle: CSSProperties = {
    minWidth: 168,
    maxHeight: 260,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    padding: 6,
    background: "var(--glass-drawer)",
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-3), inset 0 1px 0 var(--border-top-sheen)",
    WebkitBackdropFilter: "var(--glass-blur-3)",
    backdropFilter: "var(--glass-blur-3)",
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Add label"
        title="Add label"
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: "1px dashed var(--border-strong)",
          background: open ? "var(--glass-2)" : "transparent",
          color: open ? "var(--text-secondary)" : "var(--text-faint)",
          cursor: "pointer",
          opacity: show ? 1 : 0,
          pointerEvents: show ? "auto" : "none",
          transition: "opacity var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)",
        }}
      >
        <PlusGlyph />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              onClick={(e) => e.stopPropagation()}
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, ...menuStyle }}
            >
              <div
                style={{
                  padding: "4px 8px 6px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                  lineHeight: 1.5,
                }}
              >
                Add label
              </div>
              {remaining.length === 0 ? (
                <div
                  style={{
                    padding: "7px 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-row)",
                    color: "var(--text-faint)",
                  }}
                >
                  All labels applied
                </div>
              ) : (
                remaining.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(l);
                      onOpenChange(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 8px",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-row)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--glass-1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Icon name="dot" size={12} color="var(--text-faint)" />
                    {l}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
