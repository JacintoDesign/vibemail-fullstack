// Phase-1 data source: returns the in-memory sample mailbox. Phase 2 replaces
// the body of these functions with api-client calls against /api/v1 — the
// signatures stay the same, so only this file changes.

import { LABELS, ME, MESSAGES } from "./sample-data";
import type { Label, Message } from "./types";

export interface Mailbox {
  messages: Message[];
  labels: Label[];
  me: string;
}

/** Return a fresh copy of the sample mailbox so the shell can mutate its own
 *  state freely without touching the source records. */
export function getMailbox(): Mailbox {
  return {
    messages: MESSAGES.map((m) => ({ ...m })),
    labels: LABELS,
    me: ME,
  };
}
