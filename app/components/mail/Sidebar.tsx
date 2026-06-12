"use client";

// Sidebar — folders + labels + compose + account + settings. Ported from
// Sidebar.jsx. The settings panel is now backed by persisted SettingsProvider
// state (theme · density · glass · font scale · animated background).

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button, Icon } from "@/components/ds";
import { useAuth } from "@/providers/AuthProvider";
import type { BodyView, Density, GlassLevel, Theme } from "@/lib/shell-vars";
import type { Label } from "@/lib/types";
import { Hamburger } from "./Hamburger";

const LABEL_ICON_PATHS: Record<string, string> = {
  Social:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Updates:
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  Forums: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  Shopping:
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  Promotions:
    '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
};

function LabelIcon({ label, size = 16, color = "currentColor" }: { label: string; size?: number; color?: string }) {
  const path = LABEL_ICON_PATHS[label];
  if (!path) return <Icon name="dot" size={size} color={color} />;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

export interface SidebarCounts {
  inbox: number;
  starred: number;
  drafts: number;
}

export interface SidebarProps {
  active: string;
  onSelect: (f: string) => void;
  counts: SidebarCounts;
  /** The signed-in account's email, shown in the footer. */
  accountEmail?: string;
  onCompose: () => void;
  onToggleRail: () => void;
  labels: Label[];
  theme: Theme;
  onToggleTheme: () => void;
  density: Density;
  onDensityChange: (v: Density) => void;
  fontScale: number;
  onFontScaleChange: (v: number) => void;
  glass: GlassLevel;
  onGlassChange: (v: GlassLevel) => void;
  animatedBg: boolean;
  onAnimatedBgChange: (v: boolean) => void;
  bodyView: BodyView;
  onBodyViewChange: (v: BodyView) => void;
  rail?: boolean;
  width?: number;
  mobile?: boolean;
  onClose?: () => void;
  onShowShortcuts?: () => void;
}

function NavItem({
  icon,
  renderIcon,
  label,
  count,
  active,
  accentCount,
  onClick,
  rail,
}: {
  icon?: "inbox" | "star" | "send" | "compose" | "archive" | "trash";
  renderIcon?: (color: string) => ReactNode;
  label: string;
  count?: number;
  active: boolean;
  accentCount?: boolean;
  onClick: () => void;
  rail?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const iconColor = active ? "var(--accent)" : hover ? "var(--text-primary)" : "var(--text-muted)";
  return (
    <button
      className="vm-nav-btn"
      type="button"
      onClick={onClick}
      title={rail ? label + (count ? ` (${count})` : "") : undefined}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: rail ? "center" : "flex-start",
        gap: 10,
        width: "100%",
        height: 38,
        padding: rail ? 0 : "0 12px",
        border: "none",
        textAlign: "left",
        borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "var(--accent-soft)" : hover ? "var(--glass-1)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-row)",
        fontWeight: active ? "var(--fw-medium)" : "var(--fw-regular)",
        cursor: "pointer",
        transition: "background var(--dur-fast) var(--ease-standard)",
      }}
    >
      {renderIcon ? renderIcon(iconColor) : icon ? <Icon name={icon} size={16} color={active ? "var(--accent)" : "currentColor"} /> : null}
      {!rail ? <span style={{ flex: 1 }}>{label}</span> : null}
      {!rail && count != null && count > 0 ? (
        <span style={{ fontSize: "var(--text-micro)", color: accentCount ? "var(--accent)" : "var(--text-faint)" }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SegRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: 2,
          background: "var(--glass-1)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-hairline)",
        }}
      >
        {options.map((opt) => {
          const activeOpt = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                flex: 1,
                height: 22,
                border: "none",
                cursor: "pointer",
                borderRadius: "calc(var(--radius-sm) - 2px)",
                background: activeOpt ? "var(--glass-2)" : "transparent",
                color: activeOpt ? "var(--text-primary)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: activeOpt ? 600 : 400,
                boxShadow: activeOpt ? "inset 0 1px 0 var(--border-top-sheen), 0 1px 3px rgba(0,0,0,.12)" : "none",
                transition: "background var(--dur-fast), color var(--dur-fast)",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SettingsPanel({
  theme,
  onToggleTheme,
  density,
  onDensityChange,
  fontScale,
  onFontScaleChange,
  glass,
  onGlassChange,
  animatedBg,
  onAnimatedBgChange,
  bodyView,
  onBodyViewChange,
  onShowShortcuts,
  anchorRef,
  panelRef,
}: Pick<
  SidebarProps,
  | "theme"
  | "onToggleTheme"
  | "density"
  | "onDensityChange"
  | "fontScale"
  | "onFontScaleChange"
  | "glass"
  | "onGlassChange"
  | "animatedBg"
  | "onAnimatedBgChange"
  | "bodyView"
  | "onBodyViewChange"
  | "onShowShortcuts"
> & {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { signOut } = useAuth();
  const [signOutHover, setSignOutHover] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - r.top + 12,
      left: Math.max(8, r.left),
      width: r.width,
    });
  }, [anchorRef]);

  if (!pos) return createPortal(<div ref={panelRef} />, document.body);

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        bottom: pos.bottom,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 13,
        padding: "14px 12px 13px",
        background: "var(--glass-drawer)",
        border: "1px solid var(--border-default)",
        WebkitBackdropFilter: "var(--glass-blur-3)",
        backdropFilter: "var(--glass-blur-3)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-3), inset 0 1px 0 var(--border-top-sheen)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 1,
        }}
      >
        Settings
      </div>

      <SegRow<Theme>
        label="Theme"
        value={theme}
        options={["dark", "light"]}
        onChange={(v) => {
          if (v !== theme) onToggleTheme();
        }}
      />
      <SegRow<Density>
        label="Density"
        value={density}
        options={["compact", "default", "comfy"]}
        onChange={onDensityChange}
      />
      <SegRow<GlassLevel>
        label="Glass"
        value={glass}
        options={["low", "medium", "high"]}
        onChange={onGlassChange}
      />
      <SegRow<BodyView>
        label="Email body"
        value={bodyView}
        options={["plain", "html"]}
        onChange={onBodyViewChange}
      />

      {/* Font scale */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Font scale
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            {Math.round(fontScale * 100)}%
          </div>
        </div>
        <input
          type="range"
          min={0.85}
          max={1.3}
          step={0.05}
          value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--accent)", margin: 0, display: "block" }}
        />
      </div>

      {/* Animated canvas */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Animated canvas
        </div>
        <button
          type="button"
          aria-label="Toggle animated background"
          aria-pressed={animatedBg}
          onClick={() => onAnimatedBgChange(!animatedBg)}
          style={{
            width: 30,
            height: 17,
            padding: 0,
            border: "none",
            borderRadius: 999,
            background: animatedBg ? "var(--accent)" : "rgba(128,128,128,0.25)",
            cursor: "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "background var(--dur-fast) var(--ease-standard)",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: animatedBg ? "calc(100% - 15px)" : "2px",
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 2px rgba(0,0,0,.3)",
              transition: "left var(--dur-fast) var(--ease-standard)",
            }}
          />
        </button>
      </div>

      {/* Keyboard shortcuts — desktop only */}
      <div className="vm-desktop-only">
        <button
          type="button"
          onClick={() => { onShowShortcuts?.(); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            height: 32,
            padding: "0 10px",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            background: "transparent",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-row)",
            transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--glass-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
        >
          <kbd style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 17, height: 17, flexShrink: 0,
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--text-secondary)",
            background: "var(--glass-2)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            lineHeight: 1,
          }}>?</kbd>
          <span>Keyboard shortcuts</span>
        </button>
      </div>

      {/* Sign out */}
      <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 11 }}>
        <button
          type="button"
          aria-label="Sign out"
          onClick={signOut}
          onMouseEnter={() => setSignOutHover(true)}
          onMouseLeave={() => setSignOutHover(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            height: 32,
            padding: "0 10px",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            background: signOutHover ? "var(--glass-2)" : "transparent",
            color: signOutHover ? "var(--danger, #ff6b6b)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-row)",
            transition:
              "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
          }}
        >
          <Icon name="logout" size={15} color="currentColor" />
          <span>Sign out</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function Sidebar({
  active,
  onSelect,
  counts,
  accountEmail,
  onCompose,
  onToggleRail,
  labels,
  theme,
  onToggleTheme,
  density,
  onDensityChange,
  fontScale,
  onFontScaleChange,
  glass,
  onGlassChange,
  animatedBg,
  onAnimatedBgChange,
  bodyView,
  onBodyViewChange,
  rail,
  width,
  mobile,
  onClose,
  onShowShortcuts,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (gearRef.current && gearRef.current.contains(e.target as Node)) return;
      if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
      setSettingsOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [settingsOpen]);

  const asideStyle: CSSProperties = {
    width: rail ? 56 : mobile ? "100%" : width || 224,
    flex: mobile ? 1 : undefined,
    flexShrink: rail ? 0 : 1,
    minWidth: rail ? 56 : mobile ? 0 : 180,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: mobile ? 12 : 16,
    padding: rail ? "18px 6px 20px" : mobile ? "14px 14px 24px" : "23px 12px 20px",
    overflowY: mobile ? "auto" : "visible",
    WebkitOverflowScrolling: "touch",
    background: mobile ? "var(--navy)" : "var(--glass-1)",
    borderRight: mobile ? "none" : "1px solid var(--border-hairline)",
    WebkitBackdropFilter: mobile ? "none" : "var(--glass-blur-1)",
    backdropFilter: mobile ? "none" : "var(--glass-blur-1)",
  };

  return (
    <aside className={"vm-sidebar" + (rail ? " vm-rail" : "")} style={asideStyle}>
      {/* Header: wordmark / menu toggle, then compose */}
      {rail ? (
        <div className="vm-rail-head" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
          <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Hamburger onClick={onToggleRail} expanded={false} />
          </div>
          <button
            type="button"
            aria-label="Compose"
            title="Compose"
            onClick={onCompose}
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              boxShadow: "var(--shadow-0), inset 0 1px 0 var(--border-top-sheen)",
              textAlign: "center",
            }}
          >
            <Icon name="compose" size={16} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px", minHeight: 21 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: "var(--fw-bold)",
                fontSize: 16,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              Vibe<span style={{ color: "var(--accent)" }}>Mail</span>
            </span>
            {mobile && onClose ? (
              <button
                type="button"
                className="vm-tap"
                aria-label="Close menu"
                title="Close"
                onClick={onClose}
                style={{
                  marginLeft: "auto",
                  flexShrink: 0,
                  width: 34,
                  height: 34,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--glass-1)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <Icon name="x" size={18} color="currentColor" />
              </button>
            ) : null}
          </div>
          <Button
            variant="primary"
            icon="compose"
            fullWidth
            onClick={onCompose}
            style={mobile ? { height: "auto", padding: "8px 18px", lineHeight: 1 } : undefined}
          >
            Compose
          </Button>
        </div>
      )}

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
        <NavItem rail={rail} icon="inbox" label="Inbox" count={counts.inbox} accentCount active={active === "all"} onClick={() => onSelect("all")} />
        <NavItem rail={rail} icon="star" label="Starred" count={counts.starred} active={active === "starred"} onClick={() => onSelect("starred")} />
        <NavItem rail={rail} icon="send" label="Sent" active={active === "sent"} onClick={() => onSelect("sent")} />
        <NavItem rail={rail} icon="compose" label="Drafts" count={counts.drafts} active={active === "drafts"} onClick={() => onSelect("drafts")} />
        <NavItem rail={rail} icon="archive" label="Archive" active={active === "archived"} onClick={() => onSelect("archived")} />
        <NavItem rail={rail} icon="trash" label="Trash" active={active === "trash"} onClick={() => onSelect("trash")} />
      </nav>

      {/* Labels */}
      <div style={{ marginTop: 4 }}>
        {!rail ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-micro)",
              letterSpacing: "var(--tracking-label)",
              textTransform: "uppercase",
              color: "var(--text-faint)",
              padding: "0 12px 6px",
            }}
          >
            Labels
          </div>
        ) : (
          <div style={{ height: 1, background: "var(--border-hairline)", margin: "0 8px 8px" }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {labels.map((l) => (
            <NavItem
              rail={rail}
              key={l}
              label={l}
              active={active === "label:" + l}
              onClick={() => onSelect("label:" + l)}
              renderIcon={(color) => <LabelIcon label={l} size={16} color={color} />}
            />
          ))}
        </div>
      </div>

      {/* Footer — email + separator + settings gear */}
      <div style={{ marginTop: "auto" }}>
        {!rail ? (
          <div
            style={{
              padding: "4px 10px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-faint)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {accountEmail || "Signed in"}
          </div>
        ) : null}

        <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 6 }}>
          {settingsOpen && (
            <SettingsPanel
              theme={theme}
              onToggleTheme={onToggleTheme}
              density={density}
              onDensityChange={onDensityChange}
              fontScale={fontScale}
              onFontScaleChange={onFontScaleChange}
              glass={glass}
              onGlassChange={onGlassChange}
              animatedBg={animatedBg}
              onAnimatedBgChange={onAnimatedBgChange}
              bodyView={bodyView}
              onBodyViewChange={onBodyViewChange}
              onShowShortcuts={onShowShortcuts}
              anchorRef={gearRef}
              panelRef={panelRef}
            />
          )}
          <button
            ref={gearRef}
            type="button"
            className="vm-tap"
            aria-label={settingsOpen ? "Close settings" : "Open settings"}
            title="Settings"
            onClick={() => setSettingsOpen((s) => !s)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: rail ? "center" : "flex-start",
              gap: 8,
              width: "100%",
              height: 34,
              padding: rail ? 0 : "0 10px",
              border: "none",
              cursor: "pointer",
              background: settingsOpen ? "var(--glass-2)" : "transparent",
              color: settingsOpen ? "var(--accent)" : "var(--text-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-row)",
              borderRadius: "var(--radius-sm)",
              transition:
                "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
            }}
          >
            <Icon name="settings" size={15} color="currentColor" />
            {!rail ? <span>Settings</span> : null}
          </button>
        </div>
      </div>
    </aside>
  );
}
