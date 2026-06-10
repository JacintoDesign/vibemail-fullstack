"use client";

// Client-side auth state, backed by the localStorage JWT seam (lib/auth).
// Phase 1: "Continue with Google" stores a demo token. Phase 2: the real
// OAuth callback stores the JWT and everything else is unchanged.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearToken, getToken, setToken } from "@/lib/auth";

interface AuthContextValue {
  /** False until the initial token read completes (avoids a flash). */
  ready: boolean;
  authed: boolean;
  signIn: (token?: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_TOKEN = "vm-demo-token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(getToken() != null);
    setReady(true);
  }, []);

  const signIn = useCallback((token?: string) => {
    setToken(token ?? DEMO_TOKEN);
    setAuthed(true);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setAuthed(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ready, authed, signIn, signOut }),
    [ready, authed, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
