/* eslint-disable */
// VibeMail Glass — Sidebar (folders + labels + compose + account)

const { Icon, Button } = window.VibeMailGlassDesignSystem_715633;

const LABEL_ICON_PATHS = {
  Social: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Updates: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  Forums: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  Shopping: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  Promotions: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'
};

function LabelIcon({ label, size = 16, color = "currentColor" }) {
  const path = LABEL_ICON_PATHS[label];
  if (!path) return React.createElement(Icon, { name: "dot", size, color });
  return React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: size, height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    dangerouslySetInnerHTML: { __html: path }
  });
}

// Keep VMThemeToggle exported — used by AuthView
function VMThemeToggle({ theme, onToggle }) {
  const [hover, setHover] = React.useState(false);
  const light = theme === "light";
  return (
    <button
      type="button"
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: hover ? "var(--glass-hover)" : "var(--glass-1)",
        border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)",
        color: hover ? "var(--text-primary)" : "var(--text-muted)", cursor: "pointer", padding: 0,
        boxShadow: "inset 0 1px 0 var(--border-top-sheen)",
        transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)"
      }}>
      
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {light ?
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path> :
        <g><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></g>}
      </svg>
    </button>);

}
window.VMThemeToggle = VMThemeToggle;

// ── Settings panel ─────────────────────────────────────────────────────────
// Rendered via React portal at document.body to escape sidebar's stacking
// context, so it floats cleanly above the message list in rail mode too.
function VMSidebarSettingsPanel({
  theme, onToggleTheme,
  density, onDensityChange,
  fontScale, onFontScaleChange,
  glass, onGlassChange,
  animatedBg, onAnimatedBgChange,
  anchorRef, panelRef
}) {
  const [pos, setPos] = React.useState(null);

  React.useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - r.top + 8,
      left: Math.max(8, r.left),
      width: Math.max(210, r.width)
    });
  }, []);

  function SegRow({ label, value, options, onChange }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-faint)",
          textTransform: "uppercase", letterSpacing: "0.08em"
        }}>{label}</div>
        <div style={{
          display: "flex", gap: 2, padding: 2,
          background: "var(--glass-1)", borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-hairline)"
        }}>
          {options.map((opt) => {
            const active = value === opt;
            return (
              <button key={opt} type="button" onClick={() => onChange(opt)} style={{
                flex: 1, height: 22, border: "none", cursor: "pointer",
                borderRadius: "calc(var(--radius-sm) - 2px)",
                background: active ? "var(--glass-2)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: active ? 600 : 400,
                boxShadow: active ? "inset 0 1px 0 var(--border-top-sheen), 0 1px 3px rgba(0,0,0,.12)" : "none",
                transition: "background var(--dur-fast), color var(--dur-fast)"
              }}>{opt}</button>);

          })}
        </div>
      </div>);

  }

  if (!pos) return ReactDOM.createPortal(<div ref={panelRef} />, document.body);

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        bottom: pos.bottom, left: pos.left, width: pos.width,
        zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 13,
        padding: "14px 12px 13px",
        background: "var(--glass-drawer)",
        border: "1px solid var(--border-default)",
        WebkitBackdropFilter: "var(--glass-blur-3)",
        backdropFilter: "var(--glass-blur-3)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-3), inset 0 1px 0 var(--border-top-sheen)"
      }}>
      
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
        color: "var(--text-primary)", marginBottom: 1
      }}>Settings</div>

      <SegRow
        label="Theme" value={theme} options={["dark", "light"]}
        onChange={(v) => {if (v !== theme) onToggleTheme();}} />
      
      <SegRow
        label="Density" value={density} options={["compact", "default", "comfy"]}
        onChange={onDensityChange} />
      
      <SegRow
        label="Glass" value={glass} options={["low", "medium", "high"]}
        onChange={onGlassChange} />
      

      {/* Font scale */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-faint)",
            textTransform: "uppercase", letterSpacing: "0.08em"
          }}>Font scale</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            {Math.round(fontScale * 100)}%
          </div>
        </div>
        <input
          type="range" min={0.85} max={1.3} step={0.05} value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--accent)", margin: 0, display: "block" }} />
        
      </div>

      {/* Animated canvas */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-faint)",
          textTransform: "uppercase", letterSpacing: "0.08em"
        }}>Animated canvas</div>
        <button
          type="button"
          onClick={() => onAnimatedBgChange(!animatedBg)}
          style={{
            width: 30, height: 17, padding: 0, border: "none", borderRadius: 999,
            background: animatedBg ? "var(--accent)" : "rgba(128,128,128,0.25)",
            cursor: "pointer", position: "relative", flexShrink: 0,
            transition: "background var(--dur-fast) var(--ease-standard)"
          }}>
          
          <span style={{
            position: "absolute", top: 2,
            left: animatedBg ? "calc(100% - 15px)" : "2px",
            width: 13, height: 13, borderRadius: "50%",
            background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.3)",
            transition: "left var(--dur-fast) var(--ease-standard)"
          }} />
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Hamburger / panel toggle ─────────────────────────────────────────────────
function VMHamburger({ onClick, expanded, size = 32 }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={expanded ? "Collapse panel" : "Expand panel"}
      title={expanded ? "Collapse panel" : "Expand panel"}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, flexShrink: 0, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hover ? "var(--glass-hover)" : "transparent",
        border: "none", borderRadius: "var(--radius-sm)",
        color: hover ? "var(--text-primary)" : "var(--text-muted)", cursor: "pointer",
        transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)"
      }}>
      
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
        <line x1="4" y1="7" x2="20" y2="7"></line>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <line x1="4" y1="17" x2="20" y2="17"></line>
      </svg>
    </button>);

}
window.VMHamburger = VMHamburger;

// ── Nav items ──────────────────────────────────────────────────────────────

function VMNavItemCustomIcon({ label, renderIcon, count, active, accentCount, onClick, rail }) {
  const [hover, setHover] = React.useState(false);
  const iconColor = active ? "var(--accent)" : hover ? "var(--text-primary)" : "var(--text-muted)";
  return (
    <button
      className="vm-nav-btn"
      type="button" onClick={onClick}
      title={rail ? label + (count ? ` (${count})` : "") : undefined}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: rail ? "center" : "flex-start",
        gap: 10, width: "100%",
        height: 38, padding: rail ? 0 : "0 12px", border: "none", textAlign: "left",
        borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "var(--accent-soft)" : hover ? "var(--glass-1)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        fontFamily: "var(--font-mono)", fontSize: "var(--text-row)",
        fontWeight: active ? "var(--fw-medium)" : "var(--fw-regular)",
        cursor: "pointer", transition: "background var(--dur-fast) var(--ease-standard)"
      }}>
      
      {renderIcon(iconColor)}
      {!rail ? <span style={{ flex: 1 }}>{label}</span> : null}
      {!rail && count != null && count > 0 ?
      <span style={{ fontSize: "var(--text-micro)", color: accentCount ? "var(--accent)" : "var(--text-faint)" }}>{count}</span> :
      null}
    </button>);

}

function VMNavItem({ icon, label, count, active, accentCount, onClick, rail }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      className="vm-nav-btn"
      type="button" onClick={onClick}
      title={rail ? label + (count ? ` (${count})` : "") : undefined}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: rail ? "center" : "flex-start",
        gap: 10, width: "100%",
        height: 38, padding: rail ? 0 : "0 12px", border: "none", textAlign: "left",
        borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "var(--accent-soft)" : hover ? "var(--glass-1)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        fontFamily: "var(--font-mono)", fontSize: "var(--text-row)",
        fontWeight: active ? "var(--fw-medium)" : "var(--fw-regular)",
        cursor: "pointer", transition: "background var(--dur-fast) var(--ease-standard)"
      }}>
      
      <Icon name={icon} size={16} color={active ? "var(--accent)" : "currentColor"} />
      {!rail ? <span style={{ flex: 1 }}>{label}</span> : null}
      {!rail && count != null && count > 0 ?
      <span style={{ fontSize: "var(--text-micro)", color: accentCount ? "var(--accent)" : "var(--text-faint)" }}>{count}</span> :
      null}
    </button>);

}

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({
  active, onSelect, counts, onCompose, onToggleRail, labels,
  theme, onToggleTheme,
  density, onDensityChange,
  fontScale, onFontScaleChange,
  glass, onGlassChange,
  animatedBg, onAnimatedBgChange,
  rail, width, mobile, onClose
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const gearRef = React.useRef(null);
  const panelRef = React.useRef(null);

  // Close on click outside (excludes the gear button itself and the panel)
  React.useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => {
      if (gearRef.current && gearRef.current.contains(e.target)) return;
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      setSettingsOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {clearTimeout(id);document.removeEventListener("mousedown", handler);};
  }, [settingsOpen]);

  return (
    <aside className={"vm-sidebar" + (rail ? " vm-rail" : "")} style={{
      width: rail ? 56 : (mobile ? "100%" : (width || 224)), flex: mobile ? 1 : undefined, flexShrink: rail ? 0 : 1, minWidth: rail ? 56 : (mobile ? 0 : 180), height: "100%",
      display: "flex", flexDirection: "column", gap: mobile ? 12 : 16, padding: rail ? "13px 6px 20px" : (mobile ? "14px 14px 24px" : "18px 12px 20px"),
      overflowY: mobile ? "auto" : "visible", WebkitOverflowScrolling: "touch",
      background: mobile ? "var(--navy)" : "var(--glass-1)",
      borderRight: mobile ? "none" : "1px solid var(--border-hairline)",
      WebkitBackdropFilter: mobile ? "none" : "var(--glass-blur-1)", backdropFilter: mobile ? "none" : "var(--glass-blur-1)"
    }}>

      {/* ── Header: wordmark / menu toggle, then compose ── */}
      {rail ?
      <div className="vm-rail-head" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
          {/* Hamburger — expands the panel; vertically aligned with the list's folder-title row */}
          <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <VMHamburger onClick={onToggleRail} expanded={false} />
          </div>
          {/* Compose — vertically aligned with the search bar */}
          <button
          type="button" aria-label="Compose" title="Compose" onClick={onCompose}
          style={{
            width: 36, height: 36, flexShrink: 0, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--accent)", color: "var(--on-accent)", border: "none",
            borderRadius: "var(--radius-sm)", cursor: "pointer",
            boxShadow: "var(--shadow-0), inset 0 1px 0 var(--border-top-sheen)", textAlign: "center"
          }}>
          
            <Icon name="compose" size={16} />
          </button>
        </div> :

      <React.Fragment>
          {/* Wordmark + Compose in one wrapper so their internal gap (12px) matches
              the MessageList folder-title → search-bar vertical rhythm exactly. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
            {/* Wordmark row — aligns with the MessageList <h2> folder title */}
            <div style={{
              display: "flex", alignItems: "center",
              gap: 10, padding: "0 4px", minHeight: 21
            }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontWeight: "var(--fw-bold)",
                fontSize: 16, color: "var(--text-primary)", lineHeight: 1.2
              }}>
                Vibe<span style={{ color: "var(--accent)" }}>Mail</span>
              </span>
              {mobile && onClose ?
              <button
                type="button" aria-label="Close menu" title="Close" onClick={onClose}
                style={{
                  marginLeft: "auto", flexShrink: 0, width: 34, height: 34, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--glass-1)", border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", cursor: "pointer"
                }}>
                <Icon name="x" size={18} color="currentColor" />
              </button> : null}
            </div>

            {/* Compose — aligns with the MessageList search input */}
            <Button variant="primary" icon="compose" fullWidth onClick={onCompose}
              style={mobile ? { height: "auto", padding: "8px 18px", lineHeight: 1 } : undefined}>Compose</Button>
          </div>
        </React.Fragment>
      }

      {/* ── Nav ── */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
        <VMNavItem rail={rail} icon="inbox" label="Inbox" count={counts.inbox} accentCount active={active === "all"} onClick={() => onSelect("all")} />
        <VMNavItem rail={rail} icon="star" label="Starred" count={counts.starred} active={active === "starred"} onClick={() => onSelect("starred")} />
        <VMNavItem rail={rail} icon="send" label="Sent" active={active === "sent"} onClick={() => onSelect("sent")} />
        <VMNavItem rail={rail} icon="compose" label="Drafts" count={counts.drafts} active={active === "drafts"} onClick={() => onSelect("drafts")} />
        <VMNavItem rail={rail} icon="archive" label="Archive" active={active === "archived"} onClick={() => onSelect("archived")} />
        <VMNavItem rail={rail} icon="trash" label="Trash" active={active === "trash"} onClick={() => onSelect("trash")} />
      </nav>

      {/* ── Labels ── */}
      <div style={{ marginTop: 4 }}>
        {!rail ?
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)",
          letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
          color: "var(--text-faint)", padding: "0 12px 6px"
        }}>Labels</div> :

        <div style={{ height: 1, background: "var(--border-hairline)", margin: "0 8px 8px" }}></div>
        }
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {labels.map((l) =>
          <VMNavItemCustomIcon
            rail={rail} key={l} label={l}
            active={active === "label:" + l}
            onClick={() => onSelect("label:" + l)}
            renderIcon={(color) => React.createElement(LabelIcon, { label: l, size: 16, color })} />

          )}
        </div>
      </div>

      {/* ── Footer — email address + separator + settings gear ── */}
      <div style={{ marginTop: "auto" }}>
        {/* Email — expanded only, sits just above the separator line */}
        {!rail ?
        <div style={{
          padding: "4px 10px 8px",
          fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3
        }}>you@vibemail.app</div> : null}

        <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 6 }}>
          {settingsOpen &&
          <VMSidebarSettingsPanel
            theme={theme} onToggleTheme={onToggleTheme}
            density={density} onDensityChange={onDensityChange}
            fontScale={fontScale} onFontScaleChange={onFontScaleChange}
            glass={glass} onGlassChange={onGlassChange}
            animatedBg={animatedBg} onAnimatedBgChange={onAnimatedBgChange}
            anchorRef={gearRef}
            panelRef={panelRef} />
          }
          <button
            ref={gearRef}
            type="button"
            aria-label={settingsOpen ? "Close settings" : "Open settings"}
            title="Settings"
            onClick={() => setSettingsOpen((s) => !s)}
            style={{
              display: "flex", alignItems: "center",
              justifyContent: rail ? "center" : "flex-start",
              gap: 8, width: "100%", height: 34,
              padding: rail ? 0 : "0 10px",
              border: "none", cursor: "pointer",
              background: settingsOpen ? "var(--glass-2)" : "transparent",
              color: settingsOpen ? "var(--accent)" : "var(--text-faint)",
              fontFamily: "var(--font-mono)", fontSize: "var(--text-row)",
              borderRadius: "var(--radius-sm)",
              transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)"
            }}>
            <Icon name="settings" size={15} color="currentColor" />
            {!rail ? <span>Settings</span> : null}
          </button>
        </div>
      </div>
    </aside>);

}

window.VMSidebar = Sidebar;