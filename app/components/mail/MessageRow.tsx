"use client";

// Shared message row — the roomy glass card used by the inbox list and the
// search-results list (both flow through MessageList). Ported from
// VMInboxCard in MessageList.jsx.

import { useState, type MouseEvent } from "react";
import { motion } from "motion/react";
import { Badge, Icon } from "@/components/ds";
import type { Message } from "@/lib/types";
import { useSettings } from "@/providers/SettingsProvider";
import { LabelPicker } from "./LabelPicker";

export interface MessageRowProps {
  m: Message;
  selected?: boolean;
  compact?: boolean;
  onOpen: (m: Message) => void;
  onToggleRead: () => void;
  onToggleStar: () => void;
  /** Multiselect: show the leading checkbox. */
  selectable?: boolean;
  /** Multiselect: this row is checked. */
  checked?: boolean;
  /** Multiselect: a selection exists, so pin all checkboxes visible. */
  selectionActive?: boolean;
  onToggleSelect?: () => void;
  /** Labels available to add via the per-row "+" picker. */
  availableLabels?: string[];
  onAddLabel?: (label: string) => void;
  /** Remove a label from this message (shows an "x" on each badge on hover). */
  onRemoveLabel?: (label: string) => void;
}

// Per-row enter/exit. The parent list orchestrates the stagger via
// staggerChildren; named variants ("hidden"/"show") let it cascade in. `exit`
// + the list's popLayout mode shrink a removed row out while siblings reflow.
const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

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

export function MessageRow({
  m,
  selected,
  compact,
  onOpen,
  onToggleRead,
  onToggleStar,
  selectable,
  checked,
  selectionActive,
  onToggleSelect,
  availableLabels,
  onAddLabel,
  onRemoveLabel,
}: MessageRowProps) {
  const [hover, setHover] = useState(false);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  // The "compact" density is a stripped row: sender + subject only, no preview
  // snippet and no label badges.
  const minimal = useSettings().density === "compact";
  const unread = !m.isRead;
  const active = selected || checked;
  const showCheckbox = selectable && (checked || selectionActive || hover);
  const hasLabels = !!m.labels && m.labels.length > 0;
  const canAddLabels = !!onAddLabel && !!availableLabels && availableLabels.length > 0;
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <motion.div
      className="vm-row"
      role="button"
      tabIndex={0}
      data-vm-row-id={m.id}
      aria-label={`${m.senderName}: ${m.subject || "(no subject)"}`}
      // layout="position" animates only the row's offset (not its size) as
      // siblings enter/leave, so content never stretches mid-reflow.
      layout="position"
      variants={rowVariants}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.2, 0.85, 0.3, 1] }}
      onClick={() => onOpen(m)}
      onKeyDown={(e) => {
        // A div[role=button] does not natively activate on Enter/Space the way
        // a real <button> does — wire it up so keyboard users can open the row.
        // Guard on target===currentTarget so Space/Enter on an inner action
        // button (star, select, mark-read) doesn't also open the message.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(m);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 7,
        padding: compact ? "8px" : "var(--card-pad)",
        cursor: "pointer",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border-hairline)"}`,
        background: active
          ? "var(--accent-soft)"
          : hover
            ? "var(--glass-hover)"
            : unread
              ? "var(--glass-1)"
              : "var(--glass-0)",
        boxShadow: active
          ? "var(--shadow-1), inset 0 1px 0 var(--border-top-sheen)"
          : "inset 0 1px 0 var(--border-top-sheen)",
        WebkitBackdropFilter: "var(--glass-blur-0)",
        backdropFilter: "var(--glass-blur-0)",
        transition:
          "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
      }}
    >
      {/* Row 1 — [select] · sender · unread dot · star · date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {showCheckbox ? (
          <button
            type="button"
            aria-label={checked ? "Deselect message" : "Select message"}
            aria-pressed={checked}
            onClick={stop(onToggleSelect ?? (() => {}))}
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
              border: `1.5px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
              background: checked ? "var(--accent)" : "transparent",
              color: "var(--on-accent)",
            }}
          >
            {checked ? <CheckGlyph /> : null}
          </button>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-body)",
              fontWeight: unread ? "var(--fw-bold)" : "var(--fw-medium)",
              color: unread ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {m.senderName}
          </span>
          {unread ? (
            <button
              type="button"
              aria-label="Mark read"
              onClick={stop(onToggleRead)}
              style={{
                flexShrink: 0,
                width: 8,
                height: 8,
                padding: 0,
                border: "none",
                borderRadius: "var(--radius-full)",
                cursor: "pointer",
                background: "var(--dot-unread)",
                boxShadow: "0 0 8px var(--accent-glow)",
              }}
            />
          ) : null}
        </div>
        <button
          type="button"
          className="vm-tap vm-star-btn"
          aria-label={m.isStarred ? "Unstar" : "Star"}
          onClick={stop(onToggleStar)}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            color: m.isStarred ? "var(--star-active)" : "var(--star-idle)",
            opacity: m.isStarred || hover ? 1 : 0,
            transition:
              "opacity var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
          }}
        >
          <Icon name="star" size={15} fill={m.isStarred ? "currentColor" : "none"} />
        </button>
        <span
          style={{
            flexShrink: 0,
            whiteSpace: "nowrap",
            fontSize: "var(--text-caption)",
            color: "rgb(24, 199, 69)",
          }}
        >
          {m.time}
        </span>
      </div>

      {/* Row 2 — subject */}
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-row)",
          fontWeight: unread ? "var(--fw-medium)" : "var(--fw-regular)",
          color: unread ? "var(--text-secondary)" : "var(--text-muted)",
        }}
      >
        {m.subject}
      </div>

      {/* Row 3 — preview (hidden in the compact density) */}
      {!minimal ? (
        <div
          style={{
            display: "-webkit-box",
            WebkitLineClamp: compact ? 1 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-row)",
            lineHeight: 1.5,
            color: "var(--text-faint)",
          }}
        >
          {m.snippet}
        </div>
      ) : null}

      {/* Row 4 — labels + hover "+" adder. Rendered when there are labels to
          show, or (for label-less cards) only while hovering or the menu is open.
          Hidden entirely in the compact density. */}
      {!compact && !minimal && (hasLabels || (canAddLabels && (hover || labelMenuOpen))) ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 1 }}>
          {(m.labels || []).map((l) => (
            <Badge
              key={l}
              onRemove={onRemoveLabel ? () => onRemoveLabel(l) : undefined}
              removeVisible={hover}
              removeLabel={`Remove ${l} label`}
            >
              {l}
            </Badge>
          ))}
          {canAddLabels ? (
            <LabelPicker
              visible={hover || labelMenuOpen}
              open={labelMenuOpen}
              onOpenChange={setLabelMenuOpen}
              appliedLabels={m.labels || []}
              allLabels={availableLabels ?? []}
              onAdd={(l) => onAddLabel?.(l)}
            />
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
