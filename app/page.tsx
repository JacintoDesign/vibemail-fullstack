"use client";

// Auth gate: the splash sign-in surface until signed in, then the app shell.
// Unauthenticated users always land here (the SPA's "sign in page").

import { AuthSplash } from "@/components/AuthSplash";
import { VibeMailApp } from "@/components/VibeMailApp";
import { useAuth } from "@/providers/AuthProvider";

export default function HomePage() {
  const { ready, authed, signIn } = useAuth();

  // Avoid a flash before the initial token read completes.
  if (!ready) return null;

  if (!authed) return <AuthSplash onSignIn={() => signIn()} />;

  return <VibeMailApp />;
}
