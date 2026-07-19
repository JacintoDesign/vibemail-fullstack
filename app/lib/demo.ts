// Demo-mode seam. The public `/demo` route lets visitors explore VibeMail with a
// sample mailbox and no sign-in. Demo mode is scoped strictly to the `/demo`
// path (checked live off the URL), so it can never leak into the real,
// token-backed app at "/": every read/mutation is served from an in-memory mock
// (see demo-store.ts) and nothing ever hits the network or Gmail.

/** The address shown as the signed-in account throughout the demo. */
export const DEMO_ACCOUNT = "you@vibemail.app";

/** True while the user is on the public demo route. Path-based on purpose: it
 *  is impossible to carry demo behaviour over to the real app at "/". */
export function isDemo(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/demo");
}
