import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./styles/tokens.css";
import "./globals.css";

// Self-hosted via next/font so it can't be dropped by CSS @import ordering.
// Exposes --font-jetbrains-mono, which tokens.css feeds into --font-mono.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});
import { LightOverlay } from "@/components/LightOverlay";
import { NebulaBackground } from "@/components/NebulaBackground";
import { AuthProvider } from "@/providers/AuthProvider";
import { SettingsProvider } from "@/providers/SettingsProvider";

export const metadata: Metadata = {
  title: "VibeMail Glass — Email Client",
  description: "A frosted, fast, entirely monospaced mailbox.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body>
        <SettingsProvider>
          <NebulaBackground />
          <LightOverlay />
          <div className="vm-app-root">
            <div className="vm-shell">
              <AuthProvider>{children}</AuthProvider>
            </div>
          </div>
        </SettingsProvider>
      </body>
    </html>
  );
}
