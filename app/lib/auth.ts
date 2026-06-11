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

/** Decode the HS256 JWT payload without verifying the signature (display-only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The signed-in account's email, read from the JWT `email` claim. */
export function getAccountEmail(): string {
  const token = getToken();
  if (!token) return "";
  const payload = decodeJwtPayload(token);
  return typeof payload?.email === "string" ? payload.email : "";
}

/** Clear the token and bounce to the sign-in surface (used on 401/expiry). */
export function forceSignOut(): void {
  clearToken();
  if (typeof window !== "undefined") window.location.href = "/";
}
