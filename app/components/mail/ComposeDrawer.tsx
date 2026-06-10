"use client";

// Slides up from the bottom, overlays the panes. Modes: new | reply | draft.
// Ported from ComposeDrawer.jsx.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Banner, Button, Icon, IconButton, Input, RecipientTag, Textarea } from "@/components/ds";
import type { Message } from "@/lib/types";
import { MessageCard } from "./MessageCard";

interface Recipient {
  email: string;
  name?: string;
  locked?: boolean;
}

export interface ComposeDrawerProps {
  open: boolean;
  replyTo?: Message | null;
  draft?: Message | null;
  simulateFail?: boolean;
  onClose: () => void;
  onSend: (recipientCount: number) => void;
  onSaveDraft?: () => void;
  mobile?: boolean;
}

function QuotedThread({ replyTo }: { replyTo: Message }) {
  const thread = replyTo.thread || [];
  const [open, setOpen] = useState(false);
  const [openIdx, setOpenIdx] = useState(thread.length - 1);
  const toggleMsg = (i: number) => setOpenIdx((prev) => (prev === i ? -1 : i));

  const chev = (rot: boolean) => (
    <span
      style={{
        display: "inline-flex",
        flexShrink: 0,
        transform: rot ? "rotate(180deg)" : "none",
        transition: "transform var(--dur-fast) var(--ease-standard)",
        color: "var(--text-faint)",
      }}
    >
      <Icon name="chevronDown" size={14} />
    </span>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Show full conversation"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          marginTop: 2,
          padding: "9px 12px",
          background: "var(--glass-0)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "var(--radius-md)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-caption)",
          color: "var(--text-muted)",
          WebkitBackdropFilter: "var(--glass-blur-0)",
          backdropFilter: "var(--glass-blur-0)",
        }}
      >
        {chev(false)}
        Quoted conversation
        <span style={{ marginLeft: "auto", color: "var(--text-faint)" }}>
          {thread.length} message{thread.length === 1 ? "" : "s"}
        </span>
      </button>
    );
  }

  return (
    <div
      className="vm-thread-reader"
      style={{
        marginTop: 2,
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "var(--glass-0)",
        WebkitBackdropFilter: "var(--glass-blur-0)",
        backdropFilter: "var(--glass-blur-0)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        title="Hide conversation"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          padding: "9px 12px",
          border: "none",
          borderBottom: "1px solid var(--border-hairline)",
          background: "transparent",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-caption)",
          color: "var(--text-muted)",
        }}
      >
        {chev(true)}
        Quoted conversation
        <span style={{ marginLeft: "auto", color: "var(--text-faint)" }}>
          {thread.length} message{thread.length === 1 ? "" : "s"}
        </span>
      </button>
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        {thread.map((m, i) => (
          <MessageCard key={i} msg={m} expanded={openIdx === i} onToggle={() => toggleMsg(i)} />
        ))}
      </div>
    </div>
  );
}

export function ComposeDrawer({
  open,
  replyTo,
  draft,
  simulateFail,
  onClose,
  onSend,
  onSaveDraft,
  mobile,
}: ComposeDrawerProps) {
  const reply = !!replyTo;
  const editingDraft = !!draft;
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [toDraft, setToDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [dragH, setDragH] = useState<number | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editingDraft && draft) {
      const toAddr = (draft.to || "").trim();
      setRecipients(toAddr ? [{ email: toAddr }] : []);
      setSubject(draft.subject || "");
      setBody((draft.thread && draft.thread[0] && draft.thread[0].body) || "");
      setToDraft("");
    } else if (reply && replyTo) {
      setRecipients([{ email: replyTo.senderEmail, name: replyTo.senderName, locked: true }]);
      setSubject(replyTo.subject.startsWith("Re:") ? replyTo.subject : "Re: " + replyTo.subject);
      setBody("");
      setToDraft("");
    } else {
      setRecipients([]);
      setSubject("");
      setBody("");
      setToDraft("");
    }
    setValidationError(false);
    setSendError(false);
    setSending(false);
    setDragH(null);
  }, [open, reply, replyTo, editingDraft, draft]);

  const addRecipient = (raw: string) => {
    const v = raw.trim().replace(/[,;]$/, "");
    if (v) setRecipients((r) => [...r, { email: v }]);
    setToDraft("");
  };

  const editRecipient = (i: number) => {
    const target = recipients[i];
    if (!target) return;
    setToDraft(target.email);
    setRecipients((rs) => rs.filter((_, j) => j !== i));
    requestAnimationFrame(() => toInputRef.current?.focus());
  };

  const titleLabel = editingDraft ? "Edit draft" : reply ? "Reply" : "New message";

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const host = drawerRef.current?.offsetParent ?? drawerRef.current?.parentElement;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    document.body.style.userSelect = "none";
    const minH = hostRect.height * 0.6;
    const move = (ev: PointerEvent) => {
      const h = hostRect.bottom - ev.clientY;
      if (h >= hostRect.height - 8) setDragH(null);
      else setDragH(Math.min(Math.max(h, minH), hostRect.height));
    };
    const up = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const send = () => {
    setSendError(false);
    if (recipients.length === 0 || !subject.trim()) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setSending(true);
    setTimeout(() => {
      setSending(false);
      if (simulateFail) {
        setSendError(true);
        return;
      }
      onSend(recipients.length);
    }, 900);
  };

  if (!open) return null;

  const isFull = dragH == null;

  const drawerStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 41,
    top: isFull ? 0 : "auto",
    height: isFull ? "auto" : dragH,
    maxHeight: "none",
    display: "flex",
    flexDirection: "column",
    background: "var(--glass-drawer)",
    borderTop: "1px solid var(--border-strong)",
    borderTopLeftRadius: isFull ? 0 : "var(--radius-md)",
    borderTopRightRadius: isFull ? 0 : "var(--radius-md)",
    WebkitBackdropFilter: "var(--glass-blur-3)",
    backdropFilter: "var(--glass-blur-3)",
    boxShadow: "var(--shadow-drawer)",
    transform: "translateY(0)",
    animation: "vmDrawerIn var(--dur-slow) var(--ease-out)",
  };

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "var(--glass-scrim)", zIndex: 40 }}
      />

      {/* Drawer */}
      <div ref={drawerRef} role="dialog" aria-label={titleLabel} data-vm-drawer style={drawerStyle}>
        {/* Drag handle */}
        <div
          onPointerDown={onHandleDown}
          onDoubleClick={() => setDragH(null)}
          title="Drag to resize"
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            width: 90,
            paddingTop: 6,
            cursor: "ns-resize",
            touchAction: "none",
          }}
        >
          <span
            style={{ width: 40, height: 4, borderRadius: "var(--radius-full)", background: "var(--border-strong)" }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: mobile ? "6px 12px 9px" : "8px 16px 12px",
            borderBottom: "1px solid var(--border-hairline)",
          }}
        >
          <Icon name="compose" size={16} color="var(--accent)" />
          <span
            style={{
              flex: 1,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-body)",
              fontWeight: "var(--fw-medium)",
              color: "var(--text-primary)",
            }}
          >
            {titleLabel}
          </span>
          <IconButton
            icon="x"
            variant="ghost"
            label="Close"
            onClick={onClose}
            style={mobile ? { marginRight: -10 } : undefined}
          />
        </div>

        {/* Fields */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: mobile ? "9px 12px" : "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: mobile ? 7 : 10,
          }}
        >
          {sendError ? (
            <Banner tone="error" action="Try again" onAction={send}>
              Couldn&apos;t send. Check your connection and try again.
            </Banner>
          ) : null}
          {validationError ? (
            <Banner tone="error">Add at least one recipient and a subject.</Banner>
          ) : null}

          {/* To field */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              minHeight: mobile ? "var(--control-h)" : "var(--control-h-lg)",
              padding: mobile ? "2px 8px" : "6px 12px",
              background: "var(--surface-input)",
              border: `1px solid ${validationError && recipients.length === 0 ? "var(--danger)" : "var(--border-default)"}`,
              borderRadius: "var(--radius-sm)",
              WebkitBackdropFilter: "var(--glass-blur-1)",
              backdropFilter: "var(--glass-blur-1)",
            }}
          >
            <span
              style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--text-faint)" }}
            >
              To
            </span>
            {recipients.map((r, i) => {
              const editable = !r.locked;
              return (
                <RecipientTag
                  key={i}
                  email={r.email}
                  name={r.name}
                  readOnly={!editable}
                  className="vm-chip-no-avatar"
                  title={editable ? "Click to edit" : "Original recipient — can't be removed"}
                  style={editable ? { cursor: "pointer" } : undefined}
                  onClick={editable ? () => editRecipient(i) : undefined}
                  onRemove={
                    !editable
                      ? undefined
                      : (e) => {
                          e?.stopPropagation();
                          setRecipients((rs) => rs.filter((_, j) => j !== i));
                        }
                  }
                />
              );
            })}
            <input
              ref={toInputRef}
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && toDraft.trim()) {
                  e.preventDefault();
                  addRecipient(toDraft);
                }
              }}
              onBlur={() => toDraft.trim() && addRecipient(toDraft)}
              placeholder={recipients.length ? "Add people…" : "name@example.com"}
              style={{
                flex: 1,
                minWidth: 120,
                height: 24,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-body)",
              }}
            />
          </div>

          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            invalid={validationError && !subject.trim()}
            style={mobile ? { height: "var(--control-h)", padding: "0 6px" } : undefined}
          />
          <Textarea
            rows={reply ? 6 : 8}
            placeholder="Write your message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ flex: 1, minHeight: 160, padding: mobile ? "8px" : "12px" }}
          />

          {reply && !editingDraft && !mobile && replyTo ? <QuotedThread replyTo={replyTo} /> : null}
        </div>

        {/* Footer actions */}
        {mobile ? (
          <div
            className="vm-compose-footer-mobile"
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 10,
              padding: "10px 12px",
              borderTop: "1px solid var(--border-hairline)",
            }}
          >
            <div style={{ flex: 1, display: "flex" }}>
              <Button variant="primary" icon="send" fullWidth disabled={sending} onClick={send}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
            <div style={{ flex: 1, display: "flex" }}>
              <Button variant="secondary" fullWidth disabled={sending} onClick={() => onSaveDraft?.()}>
                Save draft
              </Button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              borderTop: "1px solid var(--border-hairline)",
            }}
          >
            <Button variant="primary" icon="send" disabled={sending} onClick={send}>
              {sending ? "Sending…" : "Send"}
            </Button>
            <Button variant="secondary" disabled={sending} onClick={() => onSaveDraft?.()}>
              Save draft
            </Button>
            <div style={{ flex: 1 }} />
            <IconButton icon="paperclip" variant="ghost" label="Attach" />
          </div>
        )}
      </div>
    </>
  );
}
