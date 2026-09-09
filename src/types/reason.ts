// ── Context messages (retrieved rows passed into reason()) ───────────────────

/**
 * A retrieved message the reasoner may cite. The provider never fetches mail
 * itself — it may only use this array. Fields are the ones needed to ground
 * an answer (identity + content), not the full Message row.
 */
export interface ReasonContextMessage {
  id:        string;
  from:      string;
  subject:   string;
  date:      string;          // RFC 2822, same as Message.date
  snippet:   string;
  bodyPlain: string | null;
}

// ── reason() ─────────────────────────────────────────────────────────────────

export interface ReasonArgs {
  systemInstruction: string;
  prompt:            string;
  context:           ReasonContextMessage[];
}

export interface ReasonResult {
  /** Model text when `available` is true; `null` when the summary could not be produced. */
  text:      string | null;
  /** False after quota exhaustion so callers can still show retrieved messages. */
  available: boolean;
}

// ── Provider interface ───────────────────────────────────────────────────────

export interface ReasonProvider {
  reason(args: ReasonArgs): Promise<ReasonResult>;
}
