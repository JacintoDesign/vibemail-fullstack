"use client";

// Mounts / unmounts the WebGL nebula based on the effective animated-bg setting
// (already reduced-motion-aware via SettingsProvider) and keeps its theme in
// sync. Renders nothing — the canvas is injected at document.body by lib/nebula.

import { useEffect } from "react";
import { nebula } from "@/lib/nebula";
import { useSettings } from "@/providers/SettingsProvider";

export function NebulaBackground() {
  const { animatedBg, theme } = useSettings();

  useEffect(() => {
    document.documentElement.classList.toggle("vm-static", !animatedBg);
    if (animatedBg) {
      nebula.setDark(theme !== "light");
      nebula.mount();
    } else {
      nebula.unmount();
    }
  }, [animatedBg, theme]);

  // Ensure the canvas is torn down if the component unmounts.
  useEffect(() => () => nebula.unmount(), []);

  return null;
}
