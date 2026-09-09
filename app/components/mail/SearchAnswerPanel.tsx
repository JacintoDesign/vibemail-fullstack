"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GlassPanel, Icon, IconButton } from "@/components/ds";
import { parseAnswer, type InlinePart } from "@/lib/search-answer";
import type { Message } from "@/lib/types";

const MOBILE_DEFAULT_H = 176;
const DESKTOP_DEFAULT_RATIO = 0.4;
const MIN_H = 88;
const PAD_Y = 12; // wrapper padding-top + padding-bottom

function defaultAnswerHeight(mobile?: boolean): number {
  if (typeof window === "undefined") return MOBILE_DEFAULT_H;
  if (mobile || window.matchMedia("(max-width: 700px)").matches) return MOBILE_DEFAULT_H;
  return Math.round(window.innerHeight * DESKTOP_DEFAULT_RATIO);
}

export function SearchAnswerPanel({
  answer,
  messages,
  onOpen,
  mobile,
  heading = "Answer",
}: {
  answer: string;
  messages: Message[];
  onOpen: (m: Message) => void;
  mobile?: boolean;
  heading?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(() => defaultAnswerHeight(mobile));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ y: number; h: number } | null>(null);

  function clampHeight(next: number): number {
    const el = wrapRef.current;
    const parent = el?.parentElement;
    const max =
      el && parent ? Math.max(MIN_H, parent.clientHeight - el.offsetTop - PAD_Y) : next;
    return Math.min(max, Math.max(MIN_H, next));
  }

  function resetHeight() {
    setHeight(clampHeight(defaultAnswerHeight(mobile)));
  }

  useEffect(() => {
    setCollapsed(false);
    resetHeight();
  }, [answer, mobile]);

  useEffect(() => {
    function onResize() {
      setHeight((h) => clampHeight(h));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      setHeight(clampHeight(Math.round(drag.h + (e.clientY - drag.y))));
    }
    function onUp() {
      dragRef.current = null;
      setDragging(false);
      document.body.classList.remove("vm-row-dragging");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("vm-row-dragging");
    };
  }, [dragging]);

  const blocks = parseAnswer(answer);

  function sourceOf(index: number): Message | undefined {
    return messages[index - 1];
  }

  return (
    <div ref={wrapRef} style={{ padding: "8px 10px 4px", flexShrink: 0 }}>
      <GlassPanel
        tier={1}
        radius="sm"
        style={{
          display: "flex",
          flexDirection: "column",
          height: collapsed ? "auto" : height,
          overflow: "hidden",
          border: "1px solid var(--accent)",
          boxShadow: "0 0 0 3px var(--accent-soft)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px 6px 12px",
            borderBottom: collapsed ? "none" : "1px solid var(--border-hairline)",
            flexShrink: 0,
          }}
        >
          <span style={{ display: "inline-flex", color: "var(--accent)" }}>
            <Icon name={heading === "Digest" ? "digest" : "sparkles"} size={14} />
          </span>
          <span
            style={{
              flex: 1,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-micro)",
              letterSpacing: "var(--tracking-label)",
              textTransform: "uppercase",
              color: "var(--text-faint)",
            }}
          >
            {heading}
          </span>
          <IconButton
            icon="chevronDown"
            size="sm"
            label={collapsed ? `Expand ${heading.toLowerCase()}` : `Collapse ${heading.toLowerCase()}`}
            onClick={() => setCollapsed((v) => !v)}
            style={{
              transform: collapsed ? "none" : "rotate(180deg)",
              transition: "transform var(--dur-fast) var(--ease-standard)",
            }}
          />
        </div>

        {collapsed ? null : (
          <>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "12px 14px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-caption)",
                  lineHeight: 1.7,
                  color: "var(--text-secondary)",
                }}
              >
                {blocks.map((block, i) =>
                  block.type === "p" ? (
                    <p key={i} style={{ margin: 0 }}>
                      {renderParts(block.parts, sourceOf, onOpen)}
                    </p>
                  ) : (
                    <ul
                      key={i}
                      style={{
                        margin: 0,
                        padding: 0,
                        listStyle: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {block.items.map((item, j) => (
                        <li
                          key={j}
                          style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 5,
                              height: 5,
                              marginTop: 7,
                              flexShrink: 0,
                              borderRadius: "var(--radius-full)",
                              background: "var(--accent)",
                            }}
                          />
                          <span>{renderParts(item, sourceOf, onOpen)}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </div>

            <button
              type="button"
              aria-label={heading === "Digest" ? "Resize digest" : "Resize answer"}
              title="Drag to resize"
              className={"vm-row-resizer" + (dragging ? " dragging" : "")}
              onPointerDown={(e) => {
                e.preventDefault();
                dragRef.current = { y: e.clientY, h: height };
                setDragging(true);
                document.body.classList.add("vm-row-dragging");
              }}
              onDoubleClick={resetHeight}
            />
          </>
        )}
      </GlassPanel>
    </div>
  );
}

function renderParts(
  parts: InlinePart[],
  sourceOf: (index: number) => Message | undefined,
  onOpen: (m: Message) => void,
): ReactNode {
  const local = parts.map((part) => ({ ...part }));
  const nodes: ReactNode[] = [];
  for (let i = 0; i < local.length; i++) {
    const part = local[i];
    if (!part) continue;
    if (part.type === "bold") {
      nodes.push(
        <strong key={i} style={{ color: "var(--text-primary)", fontWeight: "var(--fw-medium)" }}>
          {part.text}
        </strong>,
      );
      continue;
    }
    if (part.type === "cite") {
      const msg = sourceOf(part.index);
      if (!msg) {
        nodes.push(<span key={i}>{part.label ? `[${part.index}, ${part.label}]` : `[${part.index}]`}</span>);
        continue;
      }
      nodes.push(
        <CiteLink
          key={i}
          message={msg}
          label={part.label}
          onOpen={onOpen}
        />,
      );
      const next = local[i + 1];
      if (next?.type === "text") {
        local[i + 1] = {
          type: "text",
          text: stripNameAfterCite(next.text, part.label || msg.senderName),
        };
      }
      continue;
    }
    if (part.text) nodes.push(<span key={i}>{part.text}</span>);
  }
  return nodes;
}

function stripNameAfterCite(text: string, name: string): string {
  if (!name) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`^\\s*${escaped}\\b`, "i"), "")
    .replace(/^\s*,\s*/, " ");
}

function CiteLink({
  message,
  label,
  onOpen,
}: {
  message: Message;
  label?: string;
  onOpen: (m: Message) => void;
}) {
  const [hover, setHover] = useState(false);
  const text = label || message.senderName;
  return (
    <a
      href={`#message-${message.id}`}
      onClick={(e) => {
        e.preventDefault();
        onOpen(message);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`Open ${message.senderName}: ${message.subject || "(no subject)"}`}
      title={message.subject}
      style={{
        color: "var(--accent)",
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: "inherit",
        fontWeight: "inherit",
        textDecoration: "underline",
        textUnderlineOffset: 2,
        textDecorationThickness: hover ? 2 : 1,
        cursor: "pointer",
      }}
    >
      {text}
    </a>
  );
}
