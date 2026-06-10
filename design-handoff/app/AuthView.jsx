/* eslint-disable */
// VibeMail Glass — AuthView (OAuth entry screen)

const { Button, Input, GlassPanel, Icon } = window.VibeMailGlassDesignSystem_715633;

function AuthView({ onSignIn, theme, onToggleTheme }) {
  return (
    <div style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <window.VMThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <GlassPanel tier={2} radius="md" style={{ width: 380, padding: "36px 32px", display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Mark + wordmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <span style={{
            width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--glass-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
            color: "var(--accent)", boxShadow: "var(--shadow-2), inset 0 1px 0 var(--border-top-sheen)",
          }}>
            <Icon name="mail" size={28} />
          </span>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--fw-bold)", fontSize: 24, color: "var(--text-primary)" }}>
              Vibe<span style={{ color: "var(--accent)" }}>Mail</span>
            </div>

          </div>
        </div>

        {/* OAuth */}
        <Button variant="secondary" fullWidth size="lg" onClick={onSignIn}>Continue with Google</Button>
      </GlassPanel>
    </div>
  );
}

window.VMAuthView = AuthView;
