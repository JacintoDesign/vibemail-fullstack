"use client";

// OAuth return route. The backend (api/v1/auth/google/callback.ts) redirects
// here with ?token=<jwt>; we store it and land in the app. Phase-2 ready —
// no UI change needed when the real OAuth flow is wired up.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAuth } from "@/providers/AuthProvider";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    if (token) signIn(token);
    router.replace("/");
  }, [params, signIn, router]);

  return (
    <div
      className="vm-splash"
      style={{ background: "transparent" }}
      aria-busy="true"
    >
      <div className="vm-splash-word">
        Vibe<b>Mail</b>
      </div>
      <div className="vm-splash-bar">
        <i />
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
