// JWT storage seam. Phase 1 stores a demo token on "Continue with Google";
// Phase 2's real OAuth callback (api/v1/auth/google/callback.ts → redirects to
// /auth/callback?token=<jwt>) stores the real JWT here. All reads are
// SSR-safe (guard `window`).

const TOKEN_KEY = "vm-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* non-fatal */
  }
}

export function isAuthenticated(): boolean {
  return getToken() != null;
}
