"use client";

// Public demo surface. Bypasses the sign-in gate entirely and renders the full
// app against an in-memory sample mailbox (see lib/demo-store). Demo behaviour is
// keyed off the "/demo" path, so the real app at "/" is untouched. Sending is
// intercepted inside VibeMailApp with a large notice — nothing leaves the
// browser — and the "demo mode" badge is rendered there too (so it can hide
// itself while the compose drawer is open).

import { VibeMailApp } from "@/components/VibeMailApp";

export default function DemoPage() {
  return <VibeMailApp />;
}
