/* eslint-disable */
// VibeMail Glass — ThreadWindow (pop-out floating thread with a custom titlebar)

const { Icon: VMTWIcon, Button: VMTWButton } = window.VibeMailGlassDesignSystem_715633;

function VMThreadWindow({ win, message, onClose, onFocus, onPatch, onReply }) {
  const ref = React.useRef(null);
  const dragRef = React.useRef(null);
  const [closeHover, setCloseHover] = React.useState(false);
  const threadAll = (message && message.thread) || [];
  const [openSet, setOpenSet] = React.useState(() => new Set([threadAll.length - 1]));

  const toggleMsg = (i) => setOpenSet(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  // Drag by titlebar
  const downTitle = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onFocus();
    const start = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
    dragRef.current = start;
    const host = ref.current.parentElement.getBoundingClientRect();
    const move = (ev) => {
      const nx = Math.min(Math.max(start.wx + ev.clientX - start.x, 8 - win.w + 120), host.width - 120);
      const ny = Math.min(Math.max(start.wy + ev.clientY - start.y, 0), host.height - 44);
      onPatch({ x: nx, y: ny });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Resize by bottom-right grip
  const downGrip = (e) => {
    e.preventDefault(); e.stopPropagation();
    onFocus();
    const start = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
    const move = (ev) => {
      onPatch({
        w: Math.min(Math.max(start.w + ev.clientX - start.x, 380), 900),
        h: Math.min(Math.max(start.h + ev.clientY - start.y, 300), 820),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!message) return null;
  const thread = message.thread || [];

  return (
    <div
      ref={ref}
      onPointerDown={onFocus}
      style={{
        position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z,
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--glass-drawer)",
        border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-3), inset 0 1px 0 var(--border-top-sheen)",
        WebkitBackdropFilter: "var(--glass-blur-3)", backdropFilter: "var(--glass-blur-3)",
      }}
    >
      {/* Custom titlebar */}
      <div
        onPointerDown={downTitle}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "0 12px", height: 38, flexShrink: 0,
          borderBottom: "1px solid var(--border-hairline)", cursor: "grab", userSelect: "none",
        }}
      >
        <button
          type="button" aria-label="Close window" title="Close"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)}
          style={{
            width: 12, height: 12, padding: 0, borderRadius: "var(--radius-full)", cursor: "pointer",
            background: closeHover ? "var(--danger)" : "var(--glass-hover)",
            border: "1px solid var(--border-strong)", flexShrink: 0,
            transition: "background var(--dur-fast) var(--ease-standard)",
          }}
        ></button>
        <span style={{
          flex: 1, fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", fontWeight: "var(--fw-medium)",
          color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{message.subject || "(no subject)"}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)", color: "var(--text-faint)", flexShrink: 0 }}>
          {thread.length} msg{thread.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Thread body */}
      <div className="vm-thread-reader" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {thread.map((m, i) => (
          <window.VMMessageCard
            key={i} msg={m}
            expanded={openSet.has(i)}
            onToggle={() => toggleMsg(i)}
            isLast={false}
          />
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
          <VMTWButton variant="secondary" icon="reply" size="sm" onClick={onReply}>Reply</VMTWButton>
        </div>
      </div>

      {/* Resize grip */}
      <div
        onPointerDown={downGrip}
        title="Resize"
        style={{
          position: "absolute", right: 0, bottom: 0, width: 16, height: 16, cursor: "nwse-resize",
          display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 3,
        }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M7 1 1 7M7 4.5 4.5 7" stroke="var(--text-faint)" strokeWidth="1" strokeLinecap="round" fill="none"></path>
        </svg>
      </div>
    </div>
  );
}

window.VMThreadWindow = VMThreadWindow;
