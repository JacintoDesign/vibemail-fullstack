// Port of vmShellVars()/VM_ACCENT_RAMPS/VM_GLASS/VM_DENSITY from App.jsx.
// Re-derives accent ramp, glass level, blur, and density tokens from the
// active settings and writes them onto documentElement so the whole shell
// (and the splash/auth surface) re-tokens live. tokens.css holds matching
// first-paint defaults (dark · green · medium · default density).

import type { CSSVars } from "./types";

export type Theme = "dark" | "light";
export type Density = "compact" | "default" | "comfy";
export type GlassLevel = "low" | "medium" | "high";
export type BodyView = "plain" | "html";

/** The user-facing, persisted settings that affect tokens + background. */
export interface Settings {
  theme: Theme;
  density: Density;
  glass: GlassLevel;
  fontScale: number;
  animatedBg: boolean;
  /** Global default for the message body view. Each message card starts here;
   *  a per-message toggle overrides it locally without changing this default. */
  bodyView: BodyView;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  density: "default",
  glass: "medium",
  fontScale: 1,
  animatedBg: false,
  bodyView: "plain",
};

// The accent picker from the design-time tweaks panel is dropped; VibeMail's
// brand green is fixed. The forest-green variant is swapped in for light mode
// with the animated background on (preserved from the original).
const ACCENT = "#30d158";
const ACCENT_LIGHT_ANIMATED = "#069d2c";

interface AccentRamp {
  accent: string;
  hover: string;
  active: string;
  hoverL: string;
  activeL: string;
  soft: string;
  glow: string;
  softL: string;
  glowL: string;
}

const VM_ACCENT_RAMPS: Record<string, AccentRamp> = {
  "#30d158": { accent: "#30d158", hover: "#4fe06f", active: "#25a847", hoverL: "#28b34c", activeL: "#1f9440", soft: "rgba(48,209,88,0.16)", glow: "rgba(48,209,88,0.45)", softL: "rgba(48,209,88,0.14)", glowL: "rgba(48,209,88,0.32)" },
  "#069d2c": { accent: "#069d2c", hover: "#1db84d", active: "#038a22", hoverL: "#1db84d", activeL: "#038a22", soft: "rgba(6,157,44,0.16)", glow: "rgba(6,157,44,0.45)", softL: "rgba(6,157,44,0.14)", glowL: "rgba(6,157,44,0.32)" },
};

interface GlassLevelDef {
  g0: number;
  g1: number;
  g2: number;
  gh: number;
  b0: string;
  b1: string;
  b2: string;
  b3: string;
}

const VM_GLASS: Record<GlassLevel, GlassLevelDef> = {
  low: { g0: 0.03, g1: 0.05, g2: 0.07, gh: 0.09, b0: "14px", b1: "18px", b2: "22px", b3: "26px" },
  medium: { g0: 0.05, g1: 0.08, g2: 0.11, gh: 0.14, b0: "20px", b1: "28px", b2: "36px", b3: "40px" },
  high: { g0: 0.08, g1: 0.12, g2: 0.16, gh: 0.2, b0: "28px", b1: "40px", b2: "52px", b3: "58px" },
};

// `compact` is the new ultra-dense row (sender + subject only — MessageRow drops
// the snippet and label badges). `default`/`comfy` are the former compact/default
// spacings shifted one notch denser.
const VM_DENSITY: Record<Density, string> = { compact: "40px", default: "52px", comfy: "64px" };
const VM_CARDPAD: Record<Density, string> = { compact: "7px 12px", default: "12px 14px", comfy: "15px 16px" };
const VM_CARDGAP: Record<Density, string> = { compact: "4px", default: "7px", comfy: "9px" };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Compute the CSS custom-property bundle for the given settings. */
export function vmShellVars(t: Settings): CSSVars {
  const light = t.theme === "light";
  const accentKey = light && t.animatedBg ? ACCENT_LIGHT_ANIMATED : ACCENT;
  const a = VM_ACCENT_RAMPS[accentKey] ?? VM_ACCENT_RAMPS[ACCENT];
  const g = VM_GLASS[t.glass] ?? VM_GLASS.medium;
  const rgb = light ? "16,22,39" : "255,255,255"; // navy-tint glass on cream, white glass on navy
  const k = light ? 0.8 : 1; // navy ink reads heavier on cream — ease opacities down

  // Implementation flag 1: cap blur to 8px under reduced motion. Inline values
  // beat the stylesheet @media rule, so enforce the cap here too.
  const reduce = prefersReducedMotion();
  const blur = (px: string, sat: number): string =>
    `blur(${reduce ? "8px" : px}) saturate(${sat}%)`;

  return {
    "--accent": a.accent,
    "--accent-hover": light ? a.hoverL : a.hover,
    "--accent-active": light ? a.activeL : a.active,
    "--accent-soft": light ? a.softL : a.soft,
    "--accent-glow": light ? a.glowL : a.glow,
    "--dot-unread": a.accent,
    "--star-active": a.accent,
    "--glass-0": `rgba(${rgb},${(g.g0 * k).toFixed(3)})`,
    "--glass-1": `rgba(${rgb},${(g.g1 * k).toFixed(3)})`,
    "--glass-2": `rgba(${rgb},${(g.g2 * k).toFixed(3)})`,
    "--glass-hover": `rgba(${rgb},${(g.gh * k).toFixed(3)})`,
    "--glass-blur-0": blur(g.b0, 140),
    "--glass-blur-1": blur(g.b1, 150),
    "--glass-blur-2": blur(g.b2, 160),
    "--glass-blur-3": blur(g.b3, 170),
    "--row-h": VM_DENSITY[t.density] ?? VM_DENSITY.default,
    "--card-pad": VM_CARDPAD[t.density] ?? VM_CARDPAD.default,
    "--card-gap": VM_CARDGAP[t.density] ?? VM_CARDGAP.default,
  };
}

/** Write the computed token bundle onto <html>, plus theme + font scale. */
export function applyShellVars(t: Settings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", t.theme === "light" ? "light" : "dark");
  root.style.setProperty("--vm-font-scale", String(t.fontScale || 1));
  const vars = vmShellVars(t);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, String(value));
  }
}
