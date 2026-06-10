"use client";

// Persists user settings (theme · density · glass · font scale · animated
// background) to localStorage and applies them as CSS custom properties via
// shell-vars. The animated background defaults OFF and is force-disabled under
// prefers-reduced-motion (the exposed `animatedBg` reflects that effective
// state, so the settings toggle shows it correctly).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyShellVars,
  DEFAULT_SETTINGS,
  type Density,
  type GlassLevel,
  type Settings,
  type Theme,
} from "@/lib/shell-vars";

const STORAGE_KEY = "vm-settings";

interface SettingsContextValue {
  theme: Theme;
  density: Density;
  glass: GlassLevel;
  fontScale: number;
  /** Effective animated-bg state (raw preference AND not reduced-motion). */
  animatedBg: boolean;
  reducedMotion: boolean;
  toggleTheme: () => void;
  setTheme: (v: Theme) => void;
  setDensity: (v: Density) => void;
  setGlass: (v: GlassLevel) => void;
  setFontScale: (v: number) => void;
  setAnimatedBg: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Raw, persisted preferences.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  // Track prefers-reduced-motion.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const effectiveAnimatedBg = settings.animatedBg && !reducedMotion;

  // Apply tokens whenever settings, reduced-motion, or hydration changes.
  useEffect(() => {
    applyShellVars({ ...settings, animatedBg: effectiveAnimatedBg });
  }, [settings, effectiveAnimatedBg]);

  // Persist after hydration.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* non-fatal */
    }
  }, [settings, hydrated]);

  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      theme: settings.theme,
      density: settings.density,
      glass: settings.glass,
      fontScale: settings.fontScale,
      animatedBg: effectiveAnimatedBg,
      reducedMotion,
      toggleTheme: () => patch({ theme: settings.theme === "light" ? "dark" : "light" }),
      setTheme: (v) => patch({ theme: v }),
      setDensity: (v) => patch({ density: v }),
      setGlass: (v) => patch({ glass: v }),
      setFontScale: (v) => patch({ fontScale: v }),
      setAnimatedBg: (v) => patch({ animatedBg: v }),
    }),
    [settings, effectiveAnimatedBg, reducedMotion, patch],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
