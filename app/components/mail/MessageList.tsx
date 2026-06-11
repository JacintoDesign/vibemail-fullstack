"use client";

// Middle column: folder header + read-toggle + search + cards + states.
// Ported from MessageList.jsx. The inbox/search card is the shared MessageRow.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Banner, Button, Icon, IconButton, Input, Skeleton } from "@/components/ds";
import type { IconName } from "@/components/ds";
import type { Message } from "@/lib/types";
import { ChromeBtn } from "./PanelChrome";
import { Hamburger } from "./Hamburger";
import { MessageRow } from "./MessageRow";

export const VM_PAGE_SIZE = 8;

export type ReadFilter = "all" | "unread";

export interface MessageListProps {
  messages: Message[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  refreshing?: boolean;
  searchMode?: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  onClearSearch?: () => void;
  onActivateSearch?: () => void;
  readFilter: ReadFilter;
  onReadFilter: (v: ReadFilter) => void;
  onOpen: (m: Message) => void;
  onToggleRead: (m: Message) => void;
  onToggleStar: (m: Message) => void;
  selectedId: string | null;
  emptyText?: string;
  emptyHint?: string | null;
  folderTitle: string;
  onRefresh?: () => void;
  onCollapse?: () => void;
  fill?: boolean;
  mobile?: boolean;
  onMenu?: () => void;
  onCompose?: () => void;
  /** Multiselect: the set of currently-selected message ids. */
  selectedIds?: Set<string>;
  /** Multiselect: toggle one message's selection. Presence enables row checkboxes. */
  onToggleSelect?: (id: string) => void;
  /** Multiselect: a selection exists, so pin all checkboxes visible. */
  selectionActive?: boolean;
  /** The contextual bulk-action bar, rendered below the search bar when a selection is active. */
  bulkBar?: ReactNode;
  /** Labels offered by each row's "+" label picker. Presence enables the picker. */
  labelOptions?: string[];
  onAddLabel?: (id: string, label: string) => void;
  onRemoveLabel?: (id: string, label: string) => void;
  /** The server reports more pages beyond what's loaded (cursor pagination). */
  serverHasMore?: boolean;
  /** Fetch the next server page once the client-side slice is exhausted. */
  onLoadMore?: () => void;
  /** A server page fetch is in flight. */
  loadingMore?: boolean;
}

function ReadToggle({ value, onChange }: { value: ReadFilter; onChange: (v: ReadFilter) => void }) {
  const opts: { k: ReadFilter; label: string }[] = [
    { k: "all", label: "All mail" },
    { k: "unread", label: "Unread" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        flexShrink: 0,
        background: "var(--glass-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "inset 0 1px 0 var(--border-top-sheen)",
      }}
    >
      {opts.map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange(o.k)}
            style={{
              padding: "5px 11px",
              border: "none",
              cursor: "pointer",
              borderRadius: "calc(var(--radius-sm) - 1px)",
              background: active ? "var(--glass-hover)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-caption)",
              fontWeight: active ? "var(--fw-medium)" : "var(--fw-regular)",
              boxShadow: active ? "inset 0 1px 0 var(--border-top-sheen)" : "none",
              transition:
                "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SkeletonCard({ compact }: { compact?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 7,
        padding: compact ? "8px" : "var(--card-pad)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-hairline)",
        background: "var(--glass-0)",
        WebkitBackdropFilter: "var(--glass-blur-0)",
        backdropFilter: "var(--glass-blur-0)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <Skeleton variant="line" width={120} height={12} />
        </div>
        <Skeleton variant="line" width={60} height={12} />
      </div>
      <Skeleton variant="line" width={180} height={12} />
      <Skeleton variant="line" height={12} />
      {!compact && <Skeleton variant="line" height={12} />}
      {!compact && <Skeleton variant="line" width={80} height={12} />}
    </div>
  );
}

function ListEmpty({ icon, text, hint }: { icon: IconName; text: string; hint?: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "72px 24px",
        color: "var(--text-faint)",
        textAlign: "center",
      }}
    >
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--glass-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-muted)",
          WebkitBackdropFilter: "var(--glass-blur-1)",
          backdropFilter: "var(--glass-blur-1)",
        }}
      >
        <Icon name={icon} size={26} />
      </span>
      <span
        style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-body)", color: "var(--text-muted)" }}
      >
        {text}
      </span>
      {hint ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-caption)",
            color: "var(--text-faint)",
            maxWidth: 240,
            lineHeight: 1.6,
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function MessageList({
  messages,
  loading,
  error,
  onRetry,
  refreshing,
  searchMode,
  query,
  onQueryChange,
  onClearSearch,
  onActivateSearch,
  readFilter,
  onReadFilter,
  onOpen,
  onToggleRead,
  onToggleStar,
  selectedId,
  emptyText,
  emptyHint,
  folderTitle,
  onRefresh,
  onCollapse,
  fill,
  mobile,
  onMenu,
  onCompose,
  selectedIds,
  onToggleSelect,
  selectionActive,
  bulkBar,
  labelOptions,
  onAddLabel,
  onRemoveLabel,
  serverHasMore,
  onLoadMore,
  loadingMore,
}: MessageListProps) {
  const [visibleCount, setVisibleCount] = useState(VM_PAGE_SIZE);

  // Reset pagination when the list changes (folder switch, search, refresh).
  useEffect(() => {
    setVisibleCount(VM_PAGE_SIZE);
  }, [folderTitle, searchMode, query]);

  const visibleMessages = messages.slice(0, visibleCount);
  const canExpandClient = messages.length > visibleCount;
  const showLoadMore = canExpandClient || !!serverHasMore;

  const containerStyle: CSSProperties = {
    width: fill ? "auto" : "var(--list-w)",
    flex: fill ? 1 : "0 1 auto",
    height: "100%",
    minWidth: fill ? 0 : "var(--list-min)",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border-hairline)",
    background: "var(--glass-0)",
    WebkitBackdropFilter: "var(--glass-blur-0)",
    backdropFilter: "var(--glass-blur-0)",
  };

  return (
    <div style={containerStyle}>
      {/* Folder header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: mobile ? 4 : 10,
          padding: mobile ? "8px 8px 7px" : "16px 10px 12px",
        }}
      >
        {mobile ? <Hamburger onClick={onMenu} /> : null}
        <h2
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontSize: "var(--text-heading)",
            fontWeight: "var(--fw-bold)",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          {searchMode ? "Search" : folderTitle}
          {!searchMode && messages.length > 0 ? (
            <span
              style={{
                fontSize: "var(--text-caption)",
                fontWeight: "var(--fw-regular)",
                color: "var(--text-faint)",
              }}
            >
              {messages.length}
            </span>
          ) : null}
        </h2>
        {!mobile ? (
          <div style={{ visibility: searchMode ? "hidden" : "visible" }}>
            <ReadToggle value={readFilter} onChange={onReadFilter} />
          </div>
        ) : null}
        <IconButton
          icon="refresh"
          variant="ghost"
          size="sm"
          label="Refresh"
          onClick={onRefresh}
          spinning={refreshing}
        />
        {mobile ? (
          <IconButton
            icon="compose"
            variant="ghost"
            size="sm"
            label="Compose"
            onClick={onCompose}
            style={{ color: "var(--accent)" }}
          />
        ) : null}
        {!mobile ? (
          <ChromeBtn icon="collapseLeft" label="Collapse list" onClick={onCollapse} />
        ) : null}
      </div>

      {/* Search bar */}
      <div
        style={{
          padding: mobile ? "0 8px 9px" : "0 10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--border-hairline)",
          overflow: "hidden",
          scrollbarGutter: "stable",
        }}
      >
        <div style={{ flex: 1 }} onClick={onActivateSearch}>
          <Input
            icon="search"
            glow={searchMode}
            placeholder="Search mail…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onClear={searchMode ? onClearSearch : undefined}
            style={{ height: "var(--control-h)" }}
          />
        </div>
      </div>

      {/* Contextual bulk-action bar (only present while a selection is active) */}
      {bulkBar}

      {/* Search summary line */}
      {searchMode ? (
        <div style={{ padding: "10px 10px 4px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-caption)",
              color: "var(--text-faint)",
            }}
          >
            {query.trim()
              ? `${messages.length} result${messages.length === 1 ? "" : "s"} for "${query.trim()}"`
              : "Type to search subject, sender, or body…"}
          </span>
        </div>
      ) : null}

      {/* Error banner (inline, never a toast) */}
      {error && !loading ? (
        <div style={{ padding: "12px 10px 4px" }}>
          <Banner tone="error" action="Try again" onAction={onRetry}>
            {error}
          </Banner>
        </div>
      ) : null}

      {/* List body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, scrollbarGutter: "stable" }}>
        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--card-gap)",
              padding: mobile ? "9px 8px" : "12px 10px",
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} compact={mobile} />
            ))}
          </div>
        ) : error ? null : messages.length === 0 ? (
          <ListEmpty
            icon={searchMode ? "search" : "inbox"}
            text={searchMode ? "No messages match your search." : emptyText || "Your inbox is empty."}
            hint={searchMode ? "Try a different name, subject, or keyword." : emptyHint}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--card-gap)",
              padding: mobile ? "9px 8px" : "12px 10px",
            }}
          >
            {visibleMessages.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                compact={mobile}
                selected={selectedId === m.id}
                onOpen={onOpen}
                onToggleRead={() => onToggleRead(m)}
                onToggleStar={() => onToggleStar(m)}
                selectable={!mobile && !!onToggleSelect}
                checked={selectedIds?.has(m.id)}
                selectionActive={selectionActive}
                onToggleSelect={() => onToggleSelect?.(m.id)}
                availableLabels={mobile ? undefined : labelOptions}
                onAddLabel={mobile ? undefined : (label) => onAddLabel?.(m.id, label)}
                onRemoveLabel={mobile ? undefined : (label) => onRemoveLabel?.(m.id, label)}
              />
            ))}
            {showLoadMore && (
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
                <Button
                  variant="secondary"
                  icon="chevronDown"
                  disabled={loadingMore}
                  onClick={() => {
                    // Reveal more of what's already loaded first; only hit the
                    // server (next cursor page) once the client slice is spent.
                    if (canExpandClient) setVisibleCount((c) => c + VM_PAGE_SIZE);
                    else onLoadMore?.();
                  }}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
