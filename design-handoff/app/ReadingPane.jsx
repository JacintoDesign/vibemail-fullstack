/* eslint-disable */
// VibeMail Glass — ReadingPane (right column: thread reader + empty placeholder)

const { IconButton, Button, GlassPanel, Icon, Badge } =
window.VibeMailGlassDesignSystem_715633;

function VMMessageCard({ msg, expanded, onToggle, isLast, onReply }) {
  return (
    <GlassPanel tier={expanded ? 1 : 0} radius="md" style={{ overflow: "hidden" }}>
      <div
        className="vm-msg-head"
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          cursor: "pointer",
          borderBottom: expanded ? "1px solid var(--border-hairline)" : "none"
        }}>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="vm-msg-idrow" style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-body)", fontWeight: "var(--fw-bold)", color: "var(--text-primary)", whiteSpace: "nowrap" }}>{msg.from}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.email}</span>
          </div>
          <span className="vm-msg-date-stack" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-muted)", marginTop: 3 }}>{msg.date}</span>
          {!expanded ?
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-row)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 4 }} data-comment-anchor="1abf08c999-div-25-13">
              {msg.body}
            </div> :
          null}
        </div>
        <span className="vm-msg-date-inline" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-muted)", flexShrink: 0 }}>{msg.date}</span>
        <button
          type="button"
          aria-label={expanded ? "Collapse message" : "Expand message"}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-faint)" }}>
          <span style={{ display: "inline-flex", transform: expanded ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease-standard)" }}>
            <Icon name="chevronDown" size={16} />
          </span>
        </button>
      </div>
      {expanded ?
      <div className="vm-msg-body" style={{ padding: "16px", fontFamily: "var(--font-mono)", fontSize: "var(--text-body)", lineHeight: "var(--lh-body)", color: "var(--text-body-ink)", whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
          {msg.body}
        </div> :
      null}
    </GlassPanel>);

}

function ReadingPane({ message, onReply, onToggleStar, onMarkUnread, onArchive, onTrash, onEditDraft, onPopOut, onCollapse, mobile, onMenu, onBack }) {
  // Empty placeholder
  if (!message) {
    return (
      <div style={{
        flex: 1, minWidth: 0, height: "100%", position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, color: "var(--text-faint)", textAlign: "center", padding: 24, minWidth: "var(--thread-min)",
        containerType: "inline-size", containerName: "vmempty",
      }}>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <window.VMChromeBtn icon="collapseRight" label="Collapse reading pane" onClick={onCollapse} />
        </div>
        <span style={{
          width: 64, height: 64, borderRadius: "var(--radius-md)", display: "flex",
          alignItems: "center", justifyContent: "center", background: "var(--glass-1)",
          border: "1px solid var(--border-default)", color: "var(--text-muted)",
          boxShadow: "var(--shadow-1), inset 0 1px 0 var(--border-top-sheen)",
          WebkitBackdropFilter: "var(--glass-blur-1)", backdropFilter: "var(--glass-blur-1)"
        }}>
          <Icon name="mail" size={30} />
        </span>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-body)", color: "var(--text-muted)" }}>
          Select a conversation to read.
        </div>
        <div className="vm-empty-hints" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-faint)", lineHeight: 1.7 }}>
          <span><span style={{ color: "var(--text-muted)" }}>[+]</span> cmd-k to search</span>
          <span className="vm-hint-sep">&nbsp;·&nbsp;</span>
          <span>click the dot to mark read</span>
        </div>
      </div>);

  }

  return <VMThreadReader
    key={message.id}
    message={message}
    onReply={onReply}
    onToggleStar={onToggleStar}
    onMarkUnread={onMarkUnread}
    onArchive={onArchive}
    onTrash={onTrash}
    onEditDraft={onEditDraft}
    onPopOut={onPopOut}
    onCollapse={onCollapse}
    mobile={mobile}
    onMenu={onMenu}
    onBack={onBack} />;

}

function VMThreadReader({ message, onReply, onToggleStar, onMarkUnread, onArchive, onTrash, onEditDraft, onPopOut, onCollapse, mobile, onMenu, onBack }) {
  const thread = message.thread || [];
  const [openSet, setOpenSet] = React.useState(() => new Set([thread.length - 1]));
  React.useEffect(() => { setOpenSet(new Set([thread.length - 1])); }, [message.id]);

  const toggleMsg = (i) => setOpenSet(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const isDraft = message.status === "draft";

  // Header pieces — laid out by .vm-thread-head (container query): inline when the
  // pane is wide, stacked (title → actions → meta) when it's narrow.
  const titleEl = (
    <h1 className="vm-thread-title" data-comment-anchor="4c944115d8-h1-107-11">
      {message.subject || "(no subject)"}
    </h1>
  );
  const metaEl = (
    <div className="vm-thread-meta">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
        {thread.length} message{thread.length === 1 ? "" : "s"}
      </span>
      {isDraft ? <Badge tone="warning">Draft</Badge> : null}
      {message.status === "sent" ? <Badge>Sent</Badge> : null}
      {(message.labels || []).map((l) => <Badge key={l}>{l}</Badge>)}
    </div>
  );
  const actionsEl = isDraft ?
    <Button variant="primary" icon="compose" size="sm" onClick={onEditDraft}>Edit draft</Button> :
    <React.Fragment>
      <IconButton icon="mail" variant="ghost" label="Mark unread" onClick={onMarkUnread} />
      <IconButton icon="star" active={message.isStarred} label="Star" onClick={onToggleStar} />
      <IconButton icon="archive" variant="ghost" label="Archive" onClick={onArchive} />
      <IconButton icon="trash" variant="ghost" label="Delete" onClick={onTrash} />
      <window.VMChromeBtn icon="popOut" label="Pop out thread" onClick={onPopOut} />
    </React.Fragment>;
  const collapseEl = <window.VMChromeBtn icon="collapseRight" label="Collapse reading pane" onClick={onCollapse} />;

  // ── Mobile: single-panel thread view with a back-to-inbox header ──────────
  if (mobile) {
    const mobileActions = isDraft ?
      <Button variant="primary" icon="compose" size="sm" onClick={onEditDraft}>Edit draft</Button> :
      <React.Fragment>
        <IconButton icon="mail" variant="ghost" label="Mark unread" onClick={onMarkUnread} style={{ width: 32, height: 32 }} />
        <IconButton icon="star" active={message.isStarred} label="Star" onClick={onToggleStar} style={{ width: 32, height: 32 }} />
        <IconButton icon="archive" variant="ghost" label="Archive" onClick={onArchive} style={{ width: 32, height: 32 }} />
        <IconButton icon="trash" variant="ghost" label="Delete" onClick={onTrash} style={{ width: 32, height: 32 }} />
      </React.Fragment>;
    return (
      <div className="vm-thread-reader" style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 8px 10px", borderBottom: "1px solid var(--border-hairline)" }}>
          {/* Row 1 — menu · back · actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
            <window.VMHamburger onClick={onMenu} />
            <window.VMChromeBtn icon="back" label="Back to inbox" onClick={onBack} size={32} />
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>{mobileActions}</div>
          </div>
          {/* Row 2 — subject, up to two lines */}
          <h1 style={{ margin: "0 4px", fontSize: "var(--text-heading)", fontWeight: "var(--fw-bold)", color: "var(--text-primary)", lineHeight: 1.3, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {message.subject || "(no subject)"}
          </h1>
        </div>
        <div className="vm-thread-msgs" style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
          {thread.map((m, i) =>
          <VMMessageCard
            key={i}
            msg={m}
            expanded={openSet.has(i)}
            onToggle={() => toggleMsg(i)}
            isLast={i === thread.length - 1}
            onReply={isDraft ? onEditDraft : onReply} />
          )}
          {!isDraft ?
          <button
            type="button"
            onClick={onReply}
            style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 2,
              padding: "12px 16px", width: "100%", textAlign: "left",
              background: "var(--glass-0)", border: "1px dashed var(--border-default)",
              borderRadius: "var(--radius-md)", color: "var(--text-faint)",
              fontFamily: "var(--font-mono)", fontSize: "var(--text-row)", cursor: "pointer",
              WebkitBackdropFilter: "var(--glass-blur-0)", backdropFilter: "var(--glass-blur-0)"
            }}>
            <Icon name="reply" size={15} />
            Reply to {message.senderName}…
          </button> :
          null}
        </div>
      </div>);
  }

  return (
    <div className="vm-thread-reader" style={{ flex: 1, minWidth: "var(--thread-min)", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Thread header — reflows inline ↔ stacked via container query */}
      <div className="vm-thread-head">
        {titleEl}
        <div className="vm-thread-actions">
          {actionsEl}
        </div>
        <div className="vm-thread-collapse">
          {collapseEl}
        </div>
        {metaEl}
      </div>

      {/* Messages */}
      <div className="vm-thread-msgs" style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
        {thread.map((m, i) =>
        <VMMessageCard
          key={i}
          msg={m}
          expanded={openSet.has(i)}
          onToggle={() => toggleMsg(i)}
          isLast={i === thread.length - 1}
          onReply={isDraft ? onEditDraft : onReply} />

        )}

        {/* Quick reply affordance at the bottom for non-drafts */}
        {!isDraft ?
        <button
          type="button"
          onClick={onReply}
          style={{
            display: "flex", alignItems: "center", gap: 10, marginTop: 2,
            padding: "12px 16px", width: "100%", textAlign: "left",
            background: "var(--glass-0)", border: "1px dashed var(--border-default)",
            borderRadius: "var(--radius-md)", color: "var(--text-faint)",
            fontFamily: "var(--font-mono)", fontSize: "var(--text-row)", cursor: "pointer",
            WebkitBackdropFilter: "var(--glass-blur-0)", backdropFilter: "var(--glass-blur-0)",
            transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)"
          }}
          onMouseEnter={(e) => {e.currentTarget.style.background = "var(--glass-1)";e.currentTarget.style.color = "var(--text-muted)";}}
          onMouseLeave={(e) => {e.currentTarget.style.background = "var(--glass-0)";e.currentTarget.style.color = "var(--text-faint)";}}>
          
            <Icon name="reply" size={15} />
            Reply to {message.senderName}…
          </button> :
        null}
      </div>
    </div>);

}

window.VMReadingPane = ReadingPane;
window.VMMessageCard = VMMessageCard;