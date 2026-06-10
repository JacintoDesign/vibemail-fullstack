/* eslint-disable */
// VibeMail Glass — Panel chrome: column resizer, collapsed rail, chrome buttons.
// Lucide paths inlined for glyphs the DS icon set doesn't carry
// (panel-collapse / pop-out), stroke 1.75 to match the DS Icon.

const VM_CHROME_PATHS = {
  collapseLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  expandLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  collapseRight: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
  expandRight: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/>',
  popOut: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  restore: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
};

function VMChromeIcon({ name, size = 15 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" dangerouslySetInnerHTML={{ __html: VM_CHROME_PATHS[name] || "" }}
    ></svg>
  );
}

// Ghost square button matching the DS IconButton ghost variant
function VMChromeBtn({ icon, label, onClick, size = 28 }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, flexShrink: 0, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hover ? "var(--glass-hover)" : "transparent",
        border: "none", borderRadius: "var(--radius-sm)",
        color: hover ? "var(--text-primary)" : "var(--text-muted)", cursor: "pointer",
        transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
      }}
    >
      <VMChromeIcon name={icon} />
    </button>
  );
}

// Vertical drag handle between columns. Reports live clientX; col-resize UX.
function VMResizer({ onMove, onEnd, onDoubleClick, label }) {
  const [dragging, setDragging] = React.useState(false);
  const down = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add("vm-col-dragging");
  };
  const move = (e) => { if (dragging) onMove(e.clientX); };
  const up = (e) => {
    if (!dragging) return;
    setDragging(false);
    document.body.classList.remove("vm-col-dragging");
    onEnd && onEnd(e.clientX);
  };
  return (
    <div
      className={"vm-resizer" + (dragging ? " dragging" : "")}
      role="separator" aria-orientation="vertical" aria-label={label || "Resize column"}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onDoubleClick={onDoubleClick}
    ></div>
  );
}

// Thin vertical strip standing in for a collapsed column.
function VMCollapsedRail({ side = "left", label, onExpand }) {
  return (
    <div style={{
      width: 34, flexShrink: 0, height: "100%",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0",
      background: "var(--glass-0)",
      borderRight: side === "left" ? "1px solid var(--border-hairline)" : "none",
      borderLeft: side === "right" ? "1px solid var(--border-hairline)" : "none",
      WebkitBackdropFilter: "var(--glass-blur-0)", backdropFilter: "var(--glass-blur-0)",
    }}>
      <VMChromeBtn
        icon={side === "left" ? "expandLeft" : "expandRight"}
        label={`Expand ${label}`}
        onClick={onExpand}
      />
      <span style={{
        writingMode: "vertical-rl", fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)", letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase", color: "var(--text-faint)", userSelect: "none",
      }}>{label}</span>
    </div>
  );
}

Object.assign(window, { VMChromeIcon, VMChromeBtn, VMResizer, VMCollapsedRail });
