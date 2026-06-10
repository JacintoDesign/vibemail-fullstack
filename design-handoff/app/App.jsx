/* eslint-disable */
// VibeMail Glass — App (two-pane desktop shell: sidebar · list · reading pane)

const {
  useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakColor, TweakToggle, TweakSlider,
} = window;

// ── Tweak → CSS-variable maps ────────────────────────────────────────────────
const VM_ACCENT_RAMPS = {
  // hover/active lighten on dark; hoverL/activeL darken on light
  "#007aff": { accent: "#007aff", hover: "#2b90ff", active: "#0056b3", hoverL: "#0069dd", activeL: "#0052ad", soft: "rgba(0,122,255,0.16)", glow: "rgba(0,122,255,0.45)", softL: "rgba(0,122,255,0.12)", glowL: "rgba(0,122,255,0.30)" },
  "#30d158": { accent: "#30d158", hover: "#4fe06f", active: "#25a847", hoverL: "#28b34c", activeL: "#1f9440", soft: "rgba(48,209,88,0.16)", glow: "rgba(48,209,88,0.45)", softL: "rgba(48,209,88,0.14)", glowL: "rgba(48,209,88,0.32)" },
  "#bf5af2": { accent: "#bf5af2", hover: "#cf7bf5", active: "#9d3fd0", hoverL: "#a843e0", activeL: "#8f2dc4", soft: "rgba(191,90,242,0.16)", glow: "rgba(191,90,242,0.45)", softL: "rgba(191,90,242,0.12)", glowL: "rgba(191,90,242,0.30)" },
  "#ff9f0a": { accent: "#ff9f0a", hover: "#ffb33a", active: "#d77f00", hoverL: "#e68f00", activeL: "#c47a00", soft: "rgba(255,159,10,0.16)", glow: "rgba(255,159,10,0.45)", softL: "rgba(255,159,10,0.14)", glowL: "rgba(255,159,10,0.32)" },
  "#069d2c": { accent: "#069d2c", hover: "#1db84d", active: "#038a22", hoverL: "#1db84d", activeL: "#038a22", soft: "rgba(6,157,44,0.16)", glow: "rgba(6,157,44,0.45)", softL: "rgba(6,157,44,0.14)", glowL: "rgba(6,157,44,0.32)" },
};
const VM_GLASS = {
  low:    { g0: 0.03, g1: 0.05, g2: 0.07, gh: 0.09, b0: "14px", b1: "18px", b2: "22px", b3: "26px" },
  medium: { g0: 0.05, g1: 0.08, g2: 0.11, gh: 0.14, b0: "20px", b1: "28px", b2: "36px", b3: "40px" },
  high:   { g0: 0.08, g1: 0.12, g2: 0.16, gh: 0.20, b0: "28px", b1: "40px", b2: "52px", b3: "58px" },
};
const VM_DENSITY = { compact: "52px", default: "64px", comfy: "76px" };
const VM_CARDPAD = { compact: "12px 14px", default: "15px 16px", comfy: "18px 18px" };
const VM_CARDGAP = { compact: "7px", default: "9px", comfy: "12px" };
const VM_LAYOUT_DEFAULTS = { sidebarW: 224, sidebarRail: false, listW: 450, listCollapsed: false, readCollapsed: false };

function vmShellVars(t) {
  const light = t.theme === "light";
  const accentKey = (light && t.animatedBg) ? "#069d2c" : t.accent;
  const a = VM_ACCENT_RAMPS[accentKey] || VM_ACCENT_RAMPS["#007aff"];
  const g = VM_GLASS[t.glass] || VM_GLASS.medium;
  const rgb = light ? "16,22,39" : "255,255,255"; // navy-tint glass on cream, white glass on navy
  const k = light ? 0.8 : 1; // navy ink reads heavier on cream — ease opacities down
  return {
    "--accent": a.accent,
    "--accent-hover": light ? a.hoverL : a.hover,
    "--accent-active": light ? a.activeL : a.active,
    "--accent-soft": light ? a.softL : a.soft,
    "--accent-glow": light ? a.glowL : a.glow,
    "--dot-unread": a.accent, "--star-active": a.accent,
    "--glass-0": `rgba(${rgb},${(g.g0 * k).toFixed(3)})`,
    "--glass-1": `rgba(${rgb},${(g.g1 * k).toFixed(3)})`,
    "--glass-2": `rgba(${rgb},${(g.g2 * k).toFixed(3)})`,
    "--glass-hover": `rgba(${rgb},${(g.gh * k).toFixed(3)})`,
    "--glass-blur-0": `blur(${g.b0}) saturate(140%)`,
    "--glass-blur-1": `blur(${g.b1}) saturate(150%)`,
    "--glass-blur-2": `blur(${g.b2}) saturate(160%)`,
    "--glass-blur-3": `blur(${g.b3}) saturate(170%)`,
    "--row-h": VM_DENSITY[t.density] || VM_DENSITY.default,
    "--card-pad": VM_CARDPAD[t.density] || VM_CARDPAD.default,
    "--card-gap": VM_CARDGAP[t.density] || VM_CARDGAP.default,
  };
}

const VM_FOLDER_TITLE = {
  all: "Inbox", starred: "Starred", sent: "Sent", drafts: "Drafts",
  archived: "Archive", trash: "Trash",
};
const VM_EMPTY_TEXT = {
  sent: "Nothing in Sent.", drafts: "Nothing in Drafts.",
  archived: "Archive is empty.", trash: "Trash is empty.", starred: "No starred messages.",
};

function VMApp() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "dark",
    "accent": "#30d158",
    "glass": "medium",
    "density": "compact",
    "fontScale": 1,
    "animatedBg": false,
    "demoState": "normal",
    "simulateSendFail": false
  }/*EDITMODE-END*/;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Theme lives on <html> so the canvas + scrollbars re-token too
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme === "light" ? "light" : "dark");
    if (t.animatedBg && window.VMNebula) window.VMNebula.setDark(t.theme !== "light");
  }, [t.theme, t.animatedBg]);
  const toggleTheme = () => setTweak("theme", t.theme === "light" ? "dark" : "light");

  // Accent + glass vars live on <html> so AuthView and splash inherit them
  React.useEffect(() => {
    const vars = vmShellVars(t);
    Object.entries(vars).forEach(([k, v]) => {
      document.documentElement.style.setProperty(k, v);
    });
  }, [t.accent, t.glass, t.theme]);

  // Font scale + animated canvas live on <html> so AuthView and splash inherit
  React.useEffect(() => {
    document.documentElement.style.setProperty("--vm-font-scale", String(t.fontScale || 1));
  }, [t.fontScale]);
  React.useEffect(() => {
    document.documentElement.classList.toggle("vm-static", !t.animatedBg);
    if (t.animatedBg && window.VMNebula) {
      window.VMNebula.setDark(t.theme !== "light");
      window.VMNebula.mount();
    } else if (window.VMNebula) {
      window.VMNebula.unmount();
    }
  }, [t.animatedBg]);

  // Auth state must be declared before the splash effect below depends on it,
  // so its [authed] dependency is correctly tracked across renders.
  const [authed, setAuthed] = React.useState(false);

  // ── Mobile (vertical phone) detection — switches to a single-panel shell ──
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const h = (e) => setIsMobile(e.matches);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h); };
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // Splash screen — stays alive as the auth surface; fades out once signed in
  React.useEffect(() => {
    const el = document.getElementById("vm-splash");
    if (!el) return;

    if (!authed) {
      window.__vmSplashSignIn = () => setAuthed(true);
      // After one bar animation cycle, stop the bar + reveal the Google button
      const t1 = setTimeout(() => {
        const bar = el.querySelector(".vm-splash-bar");
        if (bar) { bar.style.transition = "opacity 0.28s ease"; bar.style.opacity = "0"; }
        const btn = document.getElementById("vm-splash-google");
        if (btn) btn.classList.add("vm-btn-ready");
      }, 1250);
      return () => { clearTimeout(t1); delete window.__vmSplashSignIn; };
    }

    // Signed in — fade out and remove
    const t1 = setTimeout(() => el.classList.add("vm-splash-out"), 60);
    const t2 = setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 560);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [authed]);

  // ── Flexible panel layout (persisted) ──────────────────────────────────────
  const rootRef = React.useRef(null);
  const [layout, setLayout] = React.useState(() => {
    try { return { ...VM_LAYOUT_DEFAULTS, ...JSON.parse(localStorage.getItem("vm-layout") || "{}") }; }
    catch (e) { return { ...VM_LAYOUT_DEFAULTS }; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("vm-layout", JSON.stringify(layout)); } catch (e) {}
  }, [layout]);
  const patchLayout = (p) => setLayout((l) => ({ ...l, ...p }));

  const resizeSidebar = (clientX) => {
    const rect = rootRef.current.getBoundingClientRect();
    const w = clientX - rect.left;
    if (w < 140) { patchLayout({ sidebarRail: true }); }
    else { patchLayout({ sidebarRail: false, sidebarW: Math.min(Math.max(w, 180), 320) }); }
  };
  const resizeList = (clientX) => {
    const rect = rootRef.current.getBoundingClientRect();
    const sw = (layout.sidebarRail ? 56 : layout.sidebarW);
    patchLayout({ listW: Math.min(Math.max(clientX - rect.left - sw, 280), 560) });
  };
  const collapseList = () => patchLayout({ listCollapsed: true, readCollapsed: false });
  const collapseRead = () => patchLayout({ readCollapsed: true, listCollapsed: false });

  // ── Pop-out thread windows ───────────────────────────────────────────────
  const [popouts, setPopouts] = React.useState([]);
  const zRef = React.useRef(80);
  const popOutThread = (msg) => {
    if (!msg) return;
    setPopouts((ws) => {
      const existing = ws.find((w) => w.msgId === msg.id);
      if (existing) return ws.map((w) => (w.msgId === msg.id ? { ...w, z: ++zRef.current } : w));
      const n = ws.length;
      return [...ws, { id: "w" + Date.now(), msgId: msg.id, x: 110 + n * 34, y: 46 + n * 30, w: 520, h: 460, z: ++zRef.current }];
    });
    setSelectedId(null);
  };
  const patchWin = (id, p) => setPopouts((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const closeWin = (id) => setPopouts((ws) => ws.filter((w) => w.id !== id));
  const focusWin = (id) => setPopouts((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++zRef.current } : w)));

  const [messages, setMessages] = React.useState(() => window.VM_DATA.MESSAGES.map((m) => ({ ...m })));
  const labels = window.VM_DATA.LABELS;

  const [filter, setFilter] = React.useState("all");
  const [readFilter, setReadFilter] = React.useState("all");
  const [selectedId, setSelectedId] = React.useState(null);
  const [searchMode, setSearchMode] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const [composeOpen, setComposeOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  // simulate a fetch when folder changes
  React.useEffect(() => {
    if (!authed) return;
    setLoading(true);
    const id = setTimeout(() => setLoading(false), 520);
    return () => clearTimeout(id);
  }, [filter, authed]);

  // cmd-k search, esc to exit
  React.useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchMode(true); }
      if (e.key === "Escape" && searchMode) { setSearchMode(false); setQuery(""); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [searchMode]);

  const counts = React.useMemo(() => ({
    inbox: messages.filter((m) => m.status === "inbox" && !m.isRead).length,
    starred: messages.filter((m) => m.isStarred && m.status !== "trash").length,
    drafts: messages.filter((m) => m.status === "draft").length,
  }), [messages]);

  const baseVisible = React.useMemo(() => {
    if (searchMode) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return messages.filter((m) => m.status !== "trash" && (
        m.senderName.toLowerCase().includes(q) ||
        (m.senderEmail || "").toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q) ||
        (m.to || "").toLowerCase().includes(q)
      ));
    }
    if (filter === "all") return messages.filter((m) => m.status === "inbox");
    if (filter === "starred") return messages.filter((m) => m.isStarred && m.status !== "trash");
    if (filter === "sent") return messages.filter((m) => m.status === "sent");
    if (filter === "drafts") return messages.filter((m) => m.status === "draft");
    if (filter === "archived") return messages.filter((m) => m.status === "archived");
    if (filter === "trash") return messages.filter((m) => m.status === "trash");
    if (filter.startsWith("label:")) {
      const l = filter.slice(6);
      return messages.filter((m) => m.status === "inbox" && (m.labels || []).includes(l));
    }
    return [];
  }, [messages, filter, searchMode, query]);

  // Demo-state overrides (so all spec states are reachable from Tweaks)
  const demoErrorMsg = "Couldn't load messages. Gmail rate-limited the request.";
  const effLoading = !searchMode && t.demoState === "loading" ? true : loading;
  const effError = !searchMode && t.demoState === "error" ? demoErrorMsg : null;
  const readFiltered = (!searchMode && readFilter === "unread") ? baseVisible.filter((m) => !m.isRead) : baseVisible;
  const visible = !searchMode && t.demoState === "empty" ? [] : readFiltered;

  const update = (id, patch) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const selected = React.useMemo(() => messages.find((m) => m.id === selectedId) || null, [messages, selectedId]);

  const showToast = (txt, tone = "success") => { setToast({ txt, tone }); setTimeout(() => setToast(null), 2600); };

  const openMessage = (m) => {
    if (m.status === "draft") { setReplyTo(null); setDraft(m); setComposeOpen(true); return; }
    // Clicking the already-open thread collapses the reading pane
    if (m.id === selectedId) { setSelectedId(null); return; }
    if (!m.isRead) update(m.id, { isRead: true, labelIds: (m.labelIds || []).filter((l) => l !== "UNREAD") });
    setSelectedId(m.id);
    // Clicking a message always reveals the reading pane, even if it was collapsed
    if (layout.readCollapsed) patchLayout({ readCollapsed: false });
  };
  const toggleRead = (m) => update(m.id, { isRead: !m.isRead });
  const toggleStar = (m) => update(m.id, { isStarred: !m.isStarred });

  const selectFolder = (f) => { setSelectedId(null); setSearchMode(false); setQuery(""); setReadFilter("all"); setFilter(f); if (t.demoState !== "normal") setTweak("demoState", "normal"); };

  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 700); };
  const onRetry = () => { setTweak("demoState", "normal"); setLoading(true); setTimeout(() => setLoading(false), 600); };

  // reading-pane actions
  const markUnreadAndClose = () => { if (selected) update(selected.id, { isRead: false }); setSelectedId(null); };
  const archiveSelected = () => { if (selected) { update(selected.id, { status: "archived", labelIds: (selected.labelIds || []).filter((l) => l !== "INBOX") }); showToast("Conversation archived."); setSelectedId(null); } };
  const trashSelected = () => { if (selected) { update(selected.id, { status: "trash", labelIds: ["TRASH"] }); showToast("Moved to Trash."); setSelectedId(null); } };

  // Auth is handled by the splash screen — nothing to render until signed in
  if (!authed) return null;

  // ── Mobile shell: one panel at a time + slide-in nav drawer ───────────────
  if (isMobile) {
    const sidebarProps = {
      active: filter, counts, labels, rail: false, width: 270,
      theme: t.theme, onToggleTheme: toggleTheme,
      density: t.density, onDensityChange: (v) => setTweak("density", v),
      fontScale: t.fontScale, onFontScaleChange: (v) => setTweak("fontScale", v),
      glass: t.glass, onGlassChange: (v) => setTweak("glass", v),
      animatedBg: t.animatedBg, onAnimatedBgChange: (v) => setTweak("animatedBg", v),
      onToggleRail: () => {},
      onSelect: (f) => { selectFolder(f); setMobileNavOpen(false); },
      onCompose: () => { setReplyTo(null); setDraft(null); setComposeOpen(true); setMobileNavOpen(false); },
      mobile: true,
      onClose: () => setMobileNavOpen(false),
    };
    return (
      <div ref={rootRef} className="vm-mobile" style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden", display: "flex", flexDirection: "column", "--thread-min": "0px", "--list-min": "0px", "--card-pad": "8px", "--card-gap": "8px", ...vmShellVars(t) }}>
        {selected ? (
          <window.VMReadingPane
            mobile
            onMenu={() => setMobileNavOpen(true)}
            onBack={() => setSelectedId(null)}
            message={selected}
            onReply={() => { setDraft(null); setReplyTo(selected); setComposeOpen(true); }}
            onToggleStar={() => selected && toggleStar(selected)}
            onMarkUnread={markUnreadAndClose}
            onArchive={archiveSelected}
            onTrash={trashSelected}
            onEditDraft={() => { setReplyTo(null); setDraft(selected); setComposeOpen(true); }}
            onPopOut={() => {}}
            onCollapse={() => setSelectedId(null)}
          />
        ) : (
          <window.VMMessageList
            mobile
            fill
            onMenu={() => setMobileNavOpen(true)}
            onCompose={() => { setReplyTo(null); setDraft(null); setComposeOpen(true); }}
            messages={visible}
            loading={effLoading}
            error={effError}
            onRetry={onRetry}
            refreshing={refreshing}
            searchMode={searchMode}
            query={query}
            onQueryChange={setQuery}
            onClearSearch={() => { setSearchMode(false); setQuery(""); }}
            onActivateSearch={() => setSearchMode(true)}
            readFilter={readFilter}
            onReadFilter={setReadFilter}
            onOpen={openMessage}
            onToggleRead={toggleRead}
            onToggleStar={toggleStar}
            selectedId={selectedId}
            folderTitle={VM_FOLDER_TITLE[filter] || (filter.startsWith("label:") ? filter.slice(6) : "Inbox")}
            emptyText={t.demoState === "empty" ? "Your inbox is empty." : (VM_EMPTY_TEXT[filter] || (filter.startsWith("label:") ? `Nothing in ${filter.slice(6)}.` : "Your inbox is empty."))}
            emptyHint={filter === "all" ? "New mail will appear here in real time." : null}
            onRefresh={onRefresh}
            onCollapse={() => {}}
          />
        )}

        {/* Slide-in nav drawer — full width, solid, scrollable */}
        {mobileNavOpen ? (
          <div className="vm-mobile-nav" style={{ position: "absolute", inset: 0, zIndex: 46, display: "flex", background: "var(--navy)" }}>
            <window.VMSidebar {...sidebarProps} />
          </div>
        ) : null}

        <window.VMComposeDrawer
          open={composeOpen}
          mobile
          replyTo={replyTo}
          draft={draft}
          simulateFail={t.simulateSendFail}
          onClose={() => setComposeOpen(false)}
          onSend={(n) => { setComposeOpen(false); showToast(`Message sent to ${n} recipient${n === 1 ? "" : "s"}.`); }}
          onSaveDraft={() => { setComposeOpen(false); showToast("Draft saved."); }}
        />

        {toast ? (
          <div style={{
            position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 50,
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
            background: "var(--glass-drawer)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
            WebkitBackdropFilter: "var(--glass-blur-3)", backdropFilter: "var(--glass-blur-3)", boxShadow: "var(--shadow-3)",
            fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-primary)", maxWidth: "90%",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: "var(--success)", flexShrink: 0 }} />
            {toast.txt}
          </div>
        ) : null}

        <TweaksPanel title="Tweaks">
          <TweakSection label="Appearance" />
          <TweakRadio label="Theme" value={t.theme}
            options={["dark", "light"]}
            onChange={(v) => setTweak("theme", v)} />
          <TweakColor label="Accent" value={t.accent}
            options={["#007aff", "#30d158", "#bf5af2", "#ff9f0a"]}
            onChange={(v) => setTweak("accent", v)} />
          <TweakRadio label="Glass" value={t.glass}
            options={["low", "medium", "high"]}
            onChange={(v) => setTweak("glass", v)} />
          <TweakRadio label="Density" value={t.density}
            options={["compact", "default", "comfy"]}
            onChange={(v) => setTweak("density", v)} />
          <TweakSlider label="Font scale" value={t.fontScale}
            min={0.85} max={1.3} step={0.05}
            onChange={(v) => setTweak("fontScale", v)} />
          <TweakToggle label="Animated canvas" value={t.animatedBg}
            onChange={(v) => setTweak("animatedBg", v)} />
          <TweakSection label="Prototype demo" />
          <TweakSelect label="List state" value={t.demoState}
            options={["normal", "loading", "empty", "error"]}
            onChange={(v) => { setSelectedId(null); setTweak("demoState", v); }} />
          <TweakToggle label="Next send fails" value={t.simulateSendFail}
            onChange={(v) => setTweak("simulateSendFail", v)} />
        </TweaksPanel>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ display: "flex", height: "100%", width: "100%", position: "relative", overflow: "hidden", "--thread-min": "380px", "--list-min": "280px", ...vmShellVars(t) }}>
      <window.VMSidebar
        active={filter}
        counts={counts}
        labels={labels}
        rail={layout.sidebarRail}
        width={layout.sidebarW}
        theme={t.theme}
        onToggleTheme={toggleTheme}
        density={t.density}
        onDensityChange={(v) => setTweak("density", v)}
        fontScale={t.fontScale}
        onFontScaleChange={(v) => setTweak("fontScale", v)}
        glass={t.glass}
        onGlassChange={(v) => setTweak("glass", v)}
        animatedBg={t.animatedBg}
        onAnimatedBgChange={(v) => setTweak("animatedBg", v)}
        onSelect={selectFolder}
        onToggleRail={() => patchLayout({ sidebarRail: !layout.sidebarRail })}
        onCompose={() => { setReplyTo(null); setDraft(null); setComposeOpen(true); }}
      />
      <window.VMResizer
        label="Resize sidebar"
        onMove={resizeSidebar}
        onDoubleClick={() => patchLayout({ sidebarRail: !layout.sidebarRail })}
      />

      <main style={{ flex: 1, height: "100%", position: "relative", display: "flex", "--list-w": layout.listW + "px" }}>
        {layout.listCollapsed ? (
          <window.VMCollapsedRail side="left" label={searchMode ? "Search" : (VM_FOLDER_TITLE[filter] || "Inbox")} onExpand={() => patchLayout({ listCollapsed: false })} />
        ) : (
          <window.VMMessageList
            fill={layout.readCollapsed}
          messages={visible}
          loading={effLoading}
          error={effError}
          onRetry={onRetry}
          refreshing={refreshing}
          searchMode={searchMode}
          query={query}
          onQueryChange={setQuery}
          onClearSearch={() => { setSearchMode(false); setQuery(""); }}
          onActivateSearch={() => setSearchMode(true)}
          readFilter={readFilter}
          onReadFilter={setReadFilter}
          onOpen={openMessage}
          onToggleRead={toggleRead}
          onToggleStar={toggleStar}
          selectedId={selectedId}
          folderTitle={VM_FOLDER_TITLE[filter] || (filter.startsWith("label:") ? filter.slice(6) : "Inbox")}
          emptyText={t.demoState === "empty" ? "Your inbox is empty." : (VM_EMPTY_TEXT[filter] || (filter.startsWith("label:") ? `Nothing in ${filter.slice(6)}.` : "Your inbox is empty."))}
          emptyHint={filter === "all" ? "New mail will appear here in real time." : null}
          onRefresh={onRefresh}
          onCollapse={collapseList}
        />
        )}

        {!layout.listCollapsed && !layout.readCollapsed ? (
          <window.VMResizer
            label="Resize list"
            onMove={resizeList}
            onDoubleClick={() => patchLayout({ listW: 380 })}
          />
        ) : null}

        {layout.readCollapsed ? (
          <window.VMCollapsedRail side="right" label="Thread" onExpand={() => patchLayout({ readCollapsed: false })} />
        ) : (
        <window.VMReadingPane
          message={selected}
          onReply={() => { setDraft(null); setReplyTo(selected); setComposeOpen(true); }}
          onToggleStar={() => selected && toggleStar(selected)}
          onMarkUnread={markUnreadAndClose}
          onArchive={archiveSelected}
          onTrash={trashSelected}
          onEditDraft={() => { setReplyTo(null); setDraft(selected); setComposeOpen(true); }}
          onPopOut={() => popOutThread(selected)}
          onCollapse={collapseRead}
        />
        )}

        {popouts.map((w) => {
          const msg = messages.find((m) => m.id === w.msgId);
          if (!msg) return null;
          return (
            <window.VMThreadWindow
              key={w.id}
              win={w}
              message={msg}
              onClose={() => closeWin(w.id)}
              onFocus={() => focusWin(w.id)}
              onPatch={(p) => patchWin(w.id, p)}
              onReply={() => { setDraft(null); setReplyTo(msg); setComposeOpen(true); }}
            />
          );
        })}

        <window.VMComposeDrawer
          open={composeOpen}
          replyTo={replyTo}
          draft={draft}
          simulateFail={t.simulateSendFail}
          onClose={() => setComposeOpen(false)}
          onSend={(n) => { setComposeOpen(false); showToast(`Message sent to ${n} recipient${n === 1 ? "" : "s"}.`); }}
          onSaveDraft={() => { setComposeOpen(false); showToast("Draft saved."); }}
        />

        {toast ? (
          <div style={{
            position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 50,
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
            background: "var(--glass-drawer)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
            WebkitBackdropFilter: "var(--glass-blur-3)", backdropFilter: "var(--glass-blur-3)", boxShadow: "var(--shadow-3)",
            fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-primary)",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: "var(--success)" }} />
            {toast.txt}
          </div>
        ) : null}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
          options={["dark", "light"]}
          onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Accent" value={t.accent}
          options={["#007aff", "#30d158", "#bf5af2", "#ff9f0a"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Glass" value={t.glass}
          options={["low", "medium", "high"]}
          onChange={(v) => setTweak("glass", v)} />
        <TweakRadio label="Density" value={t.density}
          options={["compact", "default", "comfy"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSlider label="Font scale" value={t.fontScale}
          min={0.85} max={1.3} step={0.05}
          onChange={(v) => setTweak("fontScale", v)} />
        <TweakToggle label="Animated canvas" value={t.animatedBg}
          onChange={(v) => setTweak("animatedBg", v)} />

        <TweakSection label="Prototype demo" />
        <TweakSelect label="List state" value={t.demoState}
          options={["normal", "loading", "empty", "error"]}
          onChange={(v) => { setSelectedId(null); setTweak("demoState", v); }} />
        <TweakToggle label="Next send fails" value={t.simulateSendFail}
          onChange={(v) => setTweak("simulateSendFail", v)} />
      </TweaksPanel>
    </div>
  );
}

window.VMApp = VMApp;
