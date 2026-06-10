/* eslint-disable */
// VibeMail Glass — MessageList (middle column: header + read-toggle + search + cards + states)

const { Input, Badge, Skeleton, Banner, IconButton, Icon, Button } =
window.VibeMailGlassDesignSystem_715633;

const VM_PAGE_SIZE = 8;

// ── All mail / Unread segmented toggle — sits on the folder header row.
function VMReadToggle({ value, onChange }) {
  const opts = [{ k: "all", label: "All mail" }, { k: "unread", label: "Unread" }];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 2, padding: 3, flexShrink: 0,
      background: "var(--glass-1)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-sm)", boxShadow: "inset 0 1px 0 var(--border-top-sheen)"
    }}>
      {opts.map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k} type="button" onClick={() => onChange(o.k)}
            style={{
              padding: "5px 11px", border: "none", cursor: "pointer",
              borderRadius: "calc(var(--radius-sm) - 1px)",
              background: active ? "var(--glass-hover)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-faint)",
              fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)",
              fontWeight: active ? "var(--fw-medium)" : "var(--fw-regular)",
              boxShadow: active ? "inset 0 1px 0 var(--border-top-sheen)" : "none",
              transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)"
            }}>
            
            {o.label}
          </button>);

      })}
    </div>);

}

// ── Message card — separate rounded glass container, roomy.
// (Unique name: VMMessageCard is also defined in ReadingPane.jsx + the DS bundle.)
function VMInboxCard({ m, selected, onOpen, onToggleRead, onToggleStar, compact }) {
  const [hover, setHover] = React.useState(false);
  const unread = !m.isRead;
  const stop = (fn) => (e) => {e.stopPropagation();fn && fn(e);};
  return (
    <div
      role="button" tabIndex={0} onClick={() => onOpen(m)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column", gap: compact ? 4 : 7,
        padding: compact ? "8px" : "var(--card-pad)", cursor: "pointer",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border-hairline)"}`,
        background: selected ? "var(--accent-soft)" : hover ? "var(--glass-hover)" : unread ? "var(--glass-1)" : "var(--glass-0)",
        boxShadow: selected ? "var(--shadow-1), inset 0 1px 0 var(--border-top-sheen)" : "inset 0 1px 0 var(--border-top-sheen)",
        WebkitBackdropFilter: "var(--glass-blur-0)", backdropFilter: "var(--glass-blur-0)",
        transition: "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)"
      }}>
      
      {/* Row 1 — sender · unread dot · star · date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "var(--font-mono)", fontSize: "var(--text-body)",
            fontWeight: unread ? "var(--fw-bold)" : "var(--fw-medium)",
            color: unread ? "var(--text-primary)" : "var(--text-secondary)"
          }}>
            {m.senderName}
          </span>
          {unread ?
          <button
            type="button" aria-label="Mark read" onClick={stop(onToggleRead)}
            style={{
              flexShrink: 0, width: 8, height: 8, padding: 0, border: "none",
              borderRadius: "var(--radius-full)", cursor: "pointer",
              background: "var(--dot-unread)", boxShadow: "0 0 8px var(--accent-glow)"
            }} /> :

          null}
        </div>
        <button
          type="button" aria-label={m.isStarred ? "Unstar" : "Star"} onClick={stop(onToggleStar)}
          style={{
            flexShrink: 0, display: "inline-flex", border: "none", background: "transparent",
            padding: 0, cursor: "pointer",
            color: m.isStarred ? "var(--star-active)" : "var(--star-idle)",
            opacity: m.isStarred || hover ? 1 : 0,
            transition: "opacity var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)"
          }}>
          
          <Icon name="star" size={15} fill={m.isStarred ? "currentColor" : "none"} />
        </button>
        <span style={{ ...{ flexShrink: 0, whiteSpace: "nowrap", fontSize: "var(--text-caption)", color: unread ? "var(--accent)" : "var(--text-faint)" }, color: "rgb(24, 199, 69)" }}>
          {m.time}
        </span>
      </div>

      {/* Row 2 — subject */}
      <div style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontFamily: "var(--font-mono)", fontSize: "var(--text-row)",
        fontWeight: unread ? "var(--fw-medium)" : "var(--fw-regular)",
        color: unread ? "var(--text-secondary)" : "var(--text-muted)"
      }}>
        {m.subject}
      </div>

      {/* Row 3 — preview (single line when condensed for mobile) */}
      <div style={{
        display: "-webkit-box", WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        fontFamily: "var(--font-mono)", fontSize: "var(--text-row)", lineHeight: 1.5,
        color: "var(--text-faint)"
      }}>
        {m.snippet}
      </div>

      {/* Row 4 — labels (hidden when condensed for mobile) */}
      {!compact && m.labels && m.labels.length > 0 ?
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 1 }}>
          {m.labels.map((l) => <Badge key={l}>{l}</Badge>)}
        </div> :
      null}
    </div>);

}

function VMSkeletonCard({ compact }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: compact ? 4 : 7,
      padding: compact ? "8px" : "var(--card-pad)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-hairline)",
      background: "var(--glass-0)",
      WebkitBackdropFilter: "var(--glass-blur-0)", backdropFilter: "var(--glass-blur-0)"
    }}>
      {/* Row 1 skeleton — sender + unread dot + date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <Skeleton variant="line" width={120} height={12} />
        </div>
        <Skeleton variant="line" width={60} height={12} />
      </div>

      {/* Row 2 skeleton — subject */}
      <Skeleton variant="line" width={180} height={12} />

      {/* Row 3 skeleton — preview (2 lines when not compact, full width) */}
      <Skeleton variant="line" height={12} />
      {!compact && <Skeleton variant="line" height={12} />}

      {/* Row 4 skeleton — labels (hidden when compact, full width) */}
      {!compact && <Skeleton variant="line" width={80} height={12} />}
    </div>
  );
}

function VMListEmpty({ icon, text, hint }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 14, padding: "72px 24px", color: "var(--text-faint)", textAlign: "center"
    }}>
      <span style={{
        width: 56, height: 56, borderRadius: "var(--radius-md)", display: "flex",
        alignItems: "center", justifyContent: "center", background: "var(--glass-1)",
        border: "1px solid var(--border-default)", color: "var(--text-muted)",
        WebkitBackdropFilter: "var(--glass-blur-1)", backdropFilter: "var(--glass-blur-1)"
      }}>
        <Icon name={icon} size={26} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-body)", color: "var(--text-muted)" }}>{text}</span>
      {hint ?
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-faint)", maxWidth: 240, lineHeight: 1.6 }}>{hint}</span> :
      null}
    </div>);

}

function MessageList({
  messages, loading, error, onRetry, refreshing,
  searchMode, query, onQueryChange, onClearSearch, onActivateSearch,
  readFilter, onReadFilter, onOpen, onToggleRead, onToggleStar,
  selectedId, emptyText, emptyHint, folderTitle, onRefresh, onCollapse, fill,
  mobile, onMenu, onCompose
}) {
  const [visibleCount, setVisibleCount] = React.useState(VM_PAGE_SIZE);

  // Reset pagination when the message list changes (folder switch, search, refresh)
  React.useEffect(() => { setVisibleCount(VM_PAGE_SIZE); }, [folderTitle, searchMode, query]);

  const visibleMessages = messages.slice(0, visibleCount);
  const hasMore = messages.length > visibleCount;

  return (
    <div style={{
      width: fill ? "auto" : "var(--list-w)", flex: fill ? 1 : "0 1 auto", height: "100%", minWidth: fill ? 0 : "var(--list-min)",
      display: "flex", flexDirection: "column",
      borderRight: "1px solid var(--border-hairline)",
      background: "var(--glass-0)",
      WebkitBackdropFilter: "var(--glass-blur-0)", backdropFilter: "var(--glass-blur-0)"
    }}>
      {/* Folder header — [menu on mobile] title · refresh · collapse */}
      <div style={{
        display: "flex", alignItems: "center", gap: mobile ? 4 : 10, padding: mobile ? "8px 8px 7px" : "16px 10px 12px"
      }}>
        {mobile ? <window.VMHamburger onClick={onMenu} /> : null}
        <h2 style={{ flex: 1, minWidth: 0, fontSize: "var(--text-heading)", fontWeight: "var(--fw-bold)", color: "var(--text-primary)", display: "flex", alignItems: "baseline", gap: 8 }}>
          {searchMode ? "Search" : folderTitle}
          {!searchMode && messages.length > 0 ?
          <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--fw-regular)", color: "var(--text-faint)" }}>
              {messages.length}
            </span> :
          null}
        </h2>
        <IconButton
          icon="refresh" variant="ghost" size="sm" label="Refresh"
          onClick={onRefresh}
          style={refreshing ? { animation: "vmSpin 0.8s linear infinite" } : undefined} />
        
        {mobile ?
        <IconButton
          icon="compose" variant="ghost" size="sm" label="Compose"
          onClick={onCompose}
          style={{ color: "var(--accent)" }} /> :
        null}
        {!mobile ? <window.VMChromeBtn icon="collapseLeft" label="Collapse list" onClick={onCollapse} /> : null}
      </div>

      {/* Search bar — reserves the same scrollbar gutter as the list body below it,
                      so the input box is always exactly as wide as the message cards. */}
      <div style={{ padding: mobile ? "0 8px 9px" : "0 10px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border-hairline)", overflow: "hidden", scrollbarGutter: "stable" }}>
        <div style={{ flex: 1 }} onClick={onActivateSearch}>
          <Input
            icon="search"
            glow={searchMode}
            placeholder="Search mail…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onClear={searchMode ? onClearSearch : undefined}
            style={{ height: "var(--control-h)" }} />
          
        </div>

      </div>

      {/* Search summary line */}
      {searchMode ?
      <div style={{ padding: "10px 10px 4px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
            {query.trim() ? `${messages.length} result${messages.length === 1 ? "" : "s"} for "${query.trim()}"` : "Type to search subject, sender, or body…"}
          </span>
        </div> :
      null}

      {/* Error banner (inline, never a toast) */}
      {error && !loading ?
      <div style={{ padding: "12px 10px 4px" }}>
          <Banner tone="error" action="Try again" onAction={onRetry}>
            {error}
          </Banner>
        </div> :
      null}

      {/* List body — padded column of cards */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, scrollbarGutter: "stable" }}>
        {loading ?
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--card-gap)", padding: mobile ? "9px 8px" : "12px 10px" }}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <VMSkeletonCard key={i} compact={mobile} />)}
          </div> :
        error ?
        null :
        messages.length === 0 ?
        <VMListEmpty
          icon={searchMode ? "search" : "inbox"}
          text={searchMode ? "No messages match your search." : emptyText || "Your inbox is empty."}
          hint={searchMode ? "Try a different name, subject, or keyword." : emptyHint} /> :


        <div style={{ display: "flex", flexDirection: "column", gap: "var(--card-gap)", padding: mobile ? "9px 8px" : "12px 10px" }}>
            {visibleMessages.map((m) =>
          <VMInboxCard
            key={m.id}
            m={m}
            compact={mobile}
            selected={selectedId === m.id}
            onOpen={onOpen}
            onToggleRead={() => onToggleRead(m)}
            onToggleStar={() => onToggleStar(m)} />
          )}
          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
              <Button
                variant="secondary"
                icon="chevronDown"
                onClick={() => setVisibleCount(c => c + VM_PAGE_SIZE)}>
                Load more
              </Button>
            </div>
          )}
          </div>
        }
      </div>
    </div>);

}

window.VMMessageList = MessageList;