"use client";

// Contextual bulk-action bar. Renders below the search bar only while a
// selection is active (selectedIds.size > 0). The action set is folder-aware
// and supplied by the shell. (Labeling is per-message via the row "+" picker,
// not a bulk action — see LabelPicker.)

import { type CSSProperties } from "react";
import { Button, IconButton, type IconName } from "@/components/ds";

export interface BulkAction {
  key: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  danger?: boolean;
}

export interface BulkActionBarProps {
  count: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  actions: BulkAction[];
}

function CheckGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function BulkActionBar({ count, allSelected, onSelectAll, onClear, actions }: BulkActionBarProps) {
  const barStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: "8px 10px",
    borderBottom: "1px solid var(--border-hairline)",
    background: "var(--accent-soft)",
    WebkitBackdropFilter: "var(--glass-blur-1)",
    backdropFilter: "var(--glass-blur-1)",
  };

  return (
    <div style={barStyle}>
      {/* Select-all toggle */}
      <button
        type="button"
        aria-label={allSelected ? "Clear selection" : "Select all"}
        aria-pressed={allSelected}
        title={allSelected ? "Clear selection" : "Select all"}
        onClick={allSelected ? onClear : onSelectAll}
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          borderRadius: 4,
          border: `1.5px solid ${allSelected ? "var(--accent)" : "var(--border-strong)"}`,
          background: allSelected ? "var(--accent)" : "transparent",
          color: "var(--on-accent)",
          transition: "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
        }}
      >
        {allSelected ? <CheckGlyph /> : null}
      </button>

      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-caption)",
          fontWeight: "var(--fw-medium)",
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
        }}
      >
        {count} selected
      </span>

      {/* Actions group — pushed right, wraps to its own line on narrow lists */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginLeft: "auto" }}>
        {actions.map((a) => (
          <Button
            key={a.key}
            variant="ghost"
            size="sm"
            icon={a.icon}
            onClick={a.onClick}
            style={a.danger ? { color: "var(--danger)" } : undefined}
          >
            {a.label}
          </Button>
        ))}
        <IconButton icon="x" variant="ghost" size="sm" label="Clear selection" onClick={onClear} />
      </div>
    </div>
  );
}
