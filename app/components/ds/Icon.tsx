// Reconstructed DS Icon. Maps the handoff's named icons onto lucide-react,
// preserving size / color / fill. The hand-rolled chrome + label glyphs that
// lucide doesn't carry live in PanelChrome.tsx and Sidebar.tsx instead.

import {
  Archive,
  ChevronDown,
  Inbox,
  Mail,
  Paperclip,
  Reply,
  RotateCw,
  Search,
  Send,
  Settings,
  SquarePen,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

export type IconName =
  | "compose"
  | "search"
  | "star"
  | "archive"
  | "trash"
  | "reply"
  | "mail"
  | "settings"
  | "inbox"
  | "send"
  | "refresh"
  | "paperclip"
  | "x"
  | "dot"
  | "chevronDown";

const MAP: Record<Exclude<IconName, "dot">, LucideIcon> = {
  compose: SquarePen,
  search: Search,
  star: Star,
  archive: Archive,
  trash: Trash2,
  reply: Reply,
  mail: Mail,
  settings: Settings,
  inbox: Inbox,
  send: Send,
  refresh: RotateCw,
  paperclip: Paperclip,
  x: X,
  chevronDown: ChevronDown,
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  fill?: string;
  style?: CSSProperties;
  className?: string;
}

export function Icon({
  name,
  size = 16,
  color = "currentColor",
  fill = "none",
  style,
  className,
}: IconProps) {
  if (name === "dot") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={style}
        className={className}
      >
        <circle cx="12" cy="12" r="5" fill={color} />
      </svg>
    );
  }
  const Cmp = MAP[name];
  return (
    <Cmp
      size={size}
      color={color}
      fill={fill}
      strokeWidth={1.75}
      style={style}
      className={className}
      aria-hidden
    />
  );
}
