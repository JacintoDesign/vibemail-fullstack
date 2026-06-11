---
version: alpha
name: VibeMail-Glass-design-system
description: |
  A frosted-glass email client rendered entirely in JetBrains Mono. The shell
  is a dark, near-black charcoal canvas overlaid with translucent glass panels:
  white-on-navy backgrounds at 5–14% opacity, backdrop-blur layers scaled to
  elevation (20–40px at the default "medium" glass level), thin white-opacity
  borders (10–22%), a 1px top sheen highlight, and layered drop shadows that
  build depth without solid fills. The single brand colour is Apple-style
  green (`#30d158`) — it carries every interactive state, unread indicator,
  star, active filter, and focus ring. Everything is monospaced; the register
  is dark, layered, and utilitarian. The system is themeable at runtime across
  four axes — theme (dark/light), density, glass level, and font scale — plus
  an optional animated WebGL "nebula" canvas behind the glass. A light theme
  inverts the same vocabulary onto a cream-green canvas.

colors:
  # ── Brand / accent (green; the only chromatic colour in the chrome) ──
  accent: "#30d158"
  accent-hover: "#4fe06f"        # light theme: #28b34c
  accent-active: "#25a847"       # light theme: #1f9440
  accent-soft: "rgba(48,209,88,0.16)"
  accent-glow: "rgba(48,209,88,0.45)"
  on-accent: "#06210f"           # text/icon on an accent fill (light theme: #f6fff9)
  dot-unread: "#30d158"
  star-active: "#30d158"
  star-idle: "rgba(255,255,255,0.22)"

  # ── Canvas / surface base (dark mode; the material behind the glass) ──
  navy-deep: "#080808"
  navy: "#111111"
  navy-raised: "#1c1c1e"
  canvas: "radial-gradient(120% 120% at 80% -10%, #1e1e1e 0%, #111111 42%, #080808 100%)"

  # ── Glass surfaces (white-on-navy; "medium" glass level shown) ──
  glass-0: "rgba(255,255,255,0.05)"   # base rows, list bg
  glass-1: "rgba(255,255,255,0.08)"   # cards/inputs, sidebar
  glass-2: "rgba(255,255,255,0.11)"   # raised controls, chips
  glass-hover: "rgba(255,255,255,0.14)"
  glass-drawer: "rgba(20,20,20,0.82)" # compose drawer, pop-outs, popovers
  glass-scrim: "rgba(8,8,8,0.55)"     # modal/drawer backdrop

  # ── Borders & sheen ──
  border-hairline: "rgba(255,255,255,0.10)"
  border-default: "rgba(255,255,255,0.14)"
  border-strong: "rgba(255,255,255,0.22)"
  border-top-sheen: "rgba(255,255,255,0.12)"

  # ── Text (dark mode; +10pp OKLCH lightness applied at runtime) ──
  text-primary: "#fdfcfc"
  text-secondary: "#c8c9d4"
  text-body-ink: "#a6a8b6"
  text-muted: "#9a9898"
  text-faint: "#6e6e73"
  text-disabled: "#565760"

  # ── Semantic ──
  success: "#30d158"
  warning: "#ff9f0a"
  warning-hover: "#d77f00"
  danger: "#ff453a"
  danger-hover: "#d70015"
  danger-soft: "rgba(255,69,58,0.12)"

typography:
  fontFamily: "JetBrains Mono (next/font/google; weights 400·500·700) → ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  display:   { fontSize: 38px, fontWeight: 700, note: "wordmark / largest" }
  title:     { fontSize: 22px, fontWeight: 700, lineHeight: 1.3, note: "thread subject (clamped 15–18px), splash wordmark" }
  heading:   { fontSize: 16px, fontWeight: 700, note: "folder header, dialog titles" }
  body:      { fontSize: 14px, fontWeight: 400, lineHeight: 1.6, note: "message body, sender, inputs" }
  row:       { fontSize: 13px, note: "list subject/preview, button labels, nav" }
  caption:   { fontSize: 12px, note: "timestamps, meta, banners, badges-ish" }
  micro:     { fontSize: 11px, note: "label badges, counts, section labels" }
  trackingLabel: "0.08em (uppercase section labels)"

rounded:
  sm: 7px      # interactive controls — buttons, inputs, nav items, badges, chips-square
  md: 12px     # containers — cards, drawer, pop-outs, popovers, panels
  full: 999px  # dots, pills, recipient chips, toggles, avatars

spacing:
  note: "8px-ish base with frequent 2/4/6/7/10px steps for tight monospaced rows; no rigid token scale — values are local to each surface."
  control-h: 36px
  control-h-lg: 44px
  button-sm: 28px
  button-md: 36px
  button-lg: 44px
  row-height: "52 / 64 / 76px (density: compact / default / comfy)"

motion:
  dur-fast: 0.12s
  dur-standard: 0.2s
  dur-slow: 0.32s
  ease-standard: "cubic-bezier(0.2, 0.85, 0.3, 1)"
  ease-out: "cubic-bezier(0.4, 0.9, 0.6, 1)"

shadows:
  shadow-0: "0 2px 8px rgba(0,0,0,0.28)"
  shadow-1: "0 4px 16px rgba(0,0,0,0.34)"
  shadow-2: "0 8px 24px rgba(0,0,0,0.42)"
  shadow-3: "0 16px 48px rgba(0,0,0,0.52)"
  shadow-drawer: "0 -16px 48px rgba(0,0,0,0.50)"
---

## Overview

VibeMail Glass is a single-page email client, not a marketing site. The entire
UI is rendered in JetBrains Mono over a dark, frosted-glass shell. The brand is
two decisions: **one monospaced face everywhere**, and **one green accent**
(`#30d158`) reserved for everything interactive — unread dots, stars, active
folders/filters, focus rings, primary buttons, and the wordmark's "Mail".

Every surface is a glass panel rather than an opaque fill: a translucent
white-on-near-black background, a `backdrop-filter: blur()` layer scaled to the
panel's elevation, a thin white-opacity border, a 1px top-edge sheen highlight,
and a soft drop shadow. Depth is expressed through blur intensity and shadow
depth, not colour. The canvas behind the glass is a near-black charcoal radial
gradient; an optional WebGL "nebula" can animate behind it.

The system is **themeable at runtime** across four axes — theme (dark/light),
density (compact/default/comfy), glass level (low/medium/high), and font scale
(85–130%) — plus the animated-canvas toggle. Defaults: **dark · green · medium
glass · compact density · animated canvas off**. Tokens are written as CSS
custom properties onto `<html>` (`tokens.css` holds the first-paint defaults;
`lib/shell-vars.ts` re-derives them live as settings change).

**Key characteristics:**
- 100% JetBrains Mono across every text role — sender names, message bodies,
  inputs, buttons, timestamps, the wordmark. No sans-serif anywhere.
- A single green accent for all interactive signalling; the rest of the chrome
  is monochrome glass over near-black.
- Glass surfaces at 5–14% white opacity (dark) with 20–40px backdrop blur at
  the default glass level; elevation = blur + shadow depth, not colour.
- Two container radii: **7px** on interactive controls, **12px** on containers;
  **999px** on dots, pills, chips, and avatars.
- A resizable three-pane desktop shell (sidebar · message list · reading pane)
  with collapsible rails and detachable pop-out thread windows; a single-panel
  mobile shell with a slide-in nav drawer.
- Runtime theming: dark/light, three densities, three glass levels, a font-scale
  slider, and an optional animated nebula canvas.

## Colors

### Brand & Accent
The accent is the only chromatic colour in the chrome. Everywhere a user can act
or a state needs signalling, it is green.

- **Accent** (`#30d158`): primary buttons, the compose action, active folder
  fill + 2px left border, active filter toggles, unread dots, filled stars,
  focus rings, input glow, the recipient-chip avatar, and the live timestamp on
  unread-adjacent rows.
- **Accent hover / active** (`#4fe06f` / `#25a847`): primary-button hover and
  pressed deepenings. Light theme uses `#28b34c` / `#1f9440`.
- **Accent soft** (`rgba(48,209,88,0.16)`): the wash behind an active folder, a
  selected/checked message row, the bulk-action bar, and the focus halo.
- **Accent glow** (`rgba(48,209,88,0.45)`): the bloom around the unread dot and
  the column-resizer hairline on hover.
- **On-accent** (`#06210f`): text/icons sitting on an accent fill.

A second forest-green variant (`#069d2c`) is swapped in for **light theme with
the animated canvas on**, to keep contrast over the brighter moving background.

### Canvas / Surface
- **Canvas** — a near-black charcoal radial gradient
  (`#1e1e1e → #111111 → #080808`), fixed-attached on the body. It is the
  material the glass sits over, not itself a panel.
- **Navy ramp** (`#080808` / `#111111` / `#1c1c1e`): opaque fallbacks and the
  mobile sidebar fill where blur is dropped for performance.
- **Glass 0/1/2** (`5% / 8% / 11%` white): base tier (list bg, base rows),
  card/input tier (cards, sidebar, inputs), and raised tier (chips, active
  controls). **Glass hover** (`14%`) is the row/control hover lift.
- **Glass drawer** (`rgba(20,20,20,0.82)`): the near-opaque dark glass used for
  the compose drawer, pop-out windows, the settings popover, and the keyboard
  cheatsheet — surfaces that float over active content and must stay legible.
- **Glass scrim** (`rgba(8,8,8,0.55)`): the dimming backdrop behind the drawer
  and modals.

### Borders & Sheen
- **Hairline / Default / Strong** (`10% / 14% / 22%` white): section dividers and
  base card borders; input and control borders; emphasis borders on focused
  inputs, drawers, pop-outs, checkboxes, and the drag handle.
- **Top sheen** (`rgba(255,255,255,0.12)`): a 1px inset highlight
  (`inset 0 1px 0`) on the top edge of most glass surfaces — the "lit glass"
  cue that reads as a light source above the panel.

### Text
A six-step ramp from `text-primary` (near-white) down to `text-disabled`. In
dark mode every step is lightened ~10pp via OKLCH at runtime; in light mode it is
darkened ~10pp. Practical roles: **primary** — sender names, headings, focused
input text; **secondary** — read-row sender, body emphasis; **body-ink** —
expanded message body; **muted** — subjects, metadata, idle icons; **faint** —
previews, timestamps, counts, placeholders; **disabled** — inert controls.

### Semantic
- **Success** (`#30d158`, == accent): toast status dot, confirmations.
- **Warning** (`#ff9f0a`): the **Draft** badge and warning-toned chips.
- **Danger** (`#ff453a`): destructive actions (Delete, Delete forever, Discard,
  Sign out hover), validation borders, error banners (over `danger-soft`), and
  the pop-out close dot on hover.

## Typography

### Font Family
**JetBrains Mono**, self-hosted via `next/font/google` (weights 400 · 500 · 700)
and exposed as `--font-jetbrains-mono`, which `--font-mono` consumes with a long
monospace fallback stack (`ui-monospace → SFMono-Regular → Menlo → Consolas →
monospace`). It is self-hosted rather than `@import`-ed so CSS import ordering
can't drop it. The single-font decision is the brand: there is no sans-serif,
display face, or italic anywhere in the chrome.

### Scale
One factor (`--vm-font-scale`, the settings slider, 0.85–1.3) multiplies every
role. Base sizes:

| Token | Size | Weight | Use |
|---|---|---|---|
| display | 38px | 700 | largest wordmark contexts |
| title | 22px | 700 | thread subject (clamped 15–18px via `clamp`), splash wordmark |
| heading | 16px | 700 | folder header, dialog/section titles |
| body | 14px | 400 | message body, sender name, input text, empty-state copy |
| row | 13px | 400/500 | list subject + preview, button labels, nav items |
| caption | 12px | 400 | timestamps, meta lines, banners, search summary |
| micro | 11px | 400 | label badges, counts, uppercase section labels |

Weight contrast is the primary hierarchy device on a single face: **700** for
headings, senders, and unread emphasis; **500** for buttons, active states, and
medium emphasis; **400** for body and idle text. Uppercase **micro** labels
(e.g. "LABELS", settings group labels) carry `letter-spacing: 0.08em`. Body and
expanded message text use `line-height: 1.6`.

## Layout

### App Shell
A single full-bleed glass shell (`.vm-shell`) sits fixed over the canvas and
background layers. Inside, the layout is breakpoint-switched at **700px**.

**Desktop — three resizable panes:**
1. **Sidebar** (216–320px; collapses to a 56px icon rail below 140px) — glass-1,
   blurred, hairline right border.
2. **Message list** (280–560px) — glass-0, blurred, hairline right border;
   collapses to a thin labelled rail.
3. **Reading pane** (fills remaining; min 380px) — collapses to a rail on the
   right. Only one centre pane collapses at a time.

Panes are separated by 7px **column resizers** (a hairline that lights to
`accent-glow` on hover/drag). Layout state — sidebar width, rail flag, list
width, and the two collapse flags — persists to `localStorage` (`vm-layout`).
Detached **pop-out thread windows** float absolutely over the panes with
click-to-focus z-ordering.

**Mobile (<700px) — single panel:** the message list fills the viewport; opening
a message swaps in a full-panel thread reader with a back arrow. A hamburger
slides the sidebar in from the left as a full-height drawer (`vm-mobile-nav`,
`vmNavIn` animation) over the active panel. The mobile sidebar drops its blur for
an opaque navy fill.

### Whitespace
Dense and utilitarian, not generous. List cards sit at `12px 14px` padding
(compact) with a 7px gap between them; nav items are 38px tall; controls are
36px (44px on touch). Spacing is local to each surface rather than driven by a
rigid scale — frequent 2/4/6/7/10px steps keep the monospaced rows tight.

## Elevation & Depth

Glass surfaces use blur intensity, background opacity, and shadow depth — not
colour — to express elevation. The four blur ramps scale with the glass-level
setting; values below are the default **medium** level.

| Tier | Background | Blur (medium) | Border | Shadow | Use |
|---|---|---|---|---|---|
| 0 — Base | `glass-0` (5%) | `blur(20px) saturate(140%)` | hairline | shadow-0 | list bg, base message rows, skeletons, quick-reply |
| 1 — Card | `glass-1` (8%) | `blur(28px) saturate(150%)` | hairline/default | shadow-1 | cards, inputs, sidebar, expanded message card, secondary buttons |
| 2 — Raised | `glass-2` (11%) | `blur(36px) saturate(160%)` | default | shadow-2 | chips, raised segmented controls, splash mark |
| 3 — Float | `glass-drawer` (dark 82%) | `blur(40px) saturate(170%)` | strong | shadow-3 / drawer | compose drawer, pop-out windows, settings popover, cheatsheet, toast |

Glass-level setting (`low / medium / high`) shifts both opacity and blur: low =
3–9% / 14–26px, medium = 5–14% / 20–40px, high = 8–20% / 28–58px. Every glass
panel applies `backdrop-filter` (with `-webkit-` prefix) directly on the surface
element, plus the `inset 0 1px 0` top sheen. Under `prefers-reduced-motion` all
blurs are capped to 8px (enforced both in `tokens.css` and inline by
`shell-vars`), and the nebula + slide animations are disabled.

## Shapes

| Token | Value | Use |
|---|---|---|
| sm | 7px | every interactive control — buttons, inputs, textarea, nav items, square badges, segmented toggles |
| md | 12px | containers — message cards, compose drawer, pop-outs, popovers, dialogs, empty-state tiles |
| full | 999px | unread dot, recipient chips, the animated-canvas toggle, scrollbar thumbs, splash bar, toast/avatar circles |

Iconography is line-style SVG (1.75px stroke, 24px viewBox) via the `Icon`
component — mail, star, inbox, send, compose, archive, trash, reply, refresh,
search, settings, paperclip, chevrons, collapse glyphs, x, logout. Labels use
bespoke line icons (Social/Updates/Forums/Shopping/Promotions); unknown labels
fall back to a dot. There is no photography. Avatars are single-initial circles
over `accent-soft`.

## Components

> States documented are Default, Hover, and Active/Selected/Disabled where they
> exist in the build.

### Buttons (`Button`)
Three variants × three sizes (sm 28px · md 36px · lg 44px), `radius-sm`, `row`
type at weight 500, 8px icon gap.
- **primary** — accent fill, `on-accent` text, `shadow-0` + top sheen; hover →
  `accent-hover`. Used for Compose, Send, Edit draft.
- **secondary** — `glass-1` fill, default border, top sheen, tier-1 blur,
  primary text; hover → `glass-hover`. Used for Save draft, Load more, pop-out
  Reply.
- **ghost** — transparent, muted text; hover → faint `glass-1` + primary text.
  Used for bulk actions and inline thread actions. Disabled drops to 0.55 opacity.

### Icon buttons (`IconButton`)
Square 28/34px ghost buttons, `radius-sm`, muted icon that brightens to primary
on hover (or accent when `active`). A `spinning` prop applies the `vmSpin`
rotation (Refresh). A `star` icon fills when active. Used across the reading-pane
header, list header, and compose header.

### Inputs (`Input`, `Textarea`)
- **Input** — `surface-input` fill, default border, tier-1 blur, top sheen,
  `control-h` (36px), optional leading icon and trailing clear "x". On focus (or
  `glow`) the border turns **accent** with a 3px `accent-soft` halo; on `invalid`
  it turns **danger**. Powers the search bar (glows in search mode) and the
  subject field.
- **Textarea** — same surface vocabulary, `radius-sm`, `line-height 1.6`,
  non-resizable. The compose body.
- **Recipient input** — a flex-wrap field holding `RecipientTag` chips plus a
  bare text input; commits on Enter / comma / blur.

### Recipient chip (`RecipientTag`)
`glass-2` pill (`radius-full`), default border, caption text, an `accent-soft`
initial avatar (hidden via `vm-chip-no-avatar` in the To field), and a remove
"✕". A `readOnly` chip (the locked reply recipient) omits the remove control.

### Badge (`Badge`)
Small `radius-sm` chip, `micro` text, `glass-1` fill + hairline border (default)
or warning-toned (the **Draft** badge: amber text/border over `warning` soft).
Optional hover-revealed remove "x" for per-message labels.

### Glass panel (`GlassPanel`)
The container primitive: tiers 0–2 map to `glass-0/1/2` + matching blur, with
`radius-sm` or `radius-md`. Backs the collapsible thread message cards.

### Message row (`MessageRow`)
The list/search card — a `radius-md` glass card, more opaque when unread
(`glass-1` vs `glass-0`), hover → `glass-hover`, selected/checked → accent border
+ `accent-soft` fill + `shadow-1`. Up to four stacked rows: ① select checkbox
(hover/selection-only) · sender · glowing unread dot · star · green timestamp;
② subject (ellipsis); ③ preview (2-line clamp, 1 on mobile); ④ label badges +
hover "+" picker. A keyboard-focusable `role="button"` with the accent
`:focus-visible` ring.

### Thread message card (`MessageCard`)
A collapsible `GlassPanel` (tier 1 expanded, tier 0 collapsed). Header: sender
(bold) · email (muted) · date · chevron; collapsed shows a one-line body
preview. Expanded body renders `white-space: pre-wrap` in `body-ink`. Sender/date
go inline when wide, stack when narrow (container query). Shared by the reading
pane, pop-out windows, and the compose quoted-thread.

### Sidebar nav item
38px row, leading icon, label, optional trailing count. Active → 2px accent left
border + `accent-soft` fill + accent icon + primary label; hover → `glass-1`. In
rail mode it centres to icon-only with a tooltip. Inbox/Drafts counts render in
accent.

### Reading-pane header
A CSS-grid header (`title / actions / collapse`, meta on a second row) that
reflows to stacked rows below a 520px container width. The subject clamps to two
lines (expands when narrow); the meta row carries the message count and
status/label badges.

### Compose drawer (`ComposeDrawer`)
A `glass-drawer` panel that slides up (`vmDrawerIn`) over a `glass-scrim`
backdrop, full-height by default with a top **drag handle** resizing it down to
60% min. Header (compose icon · mode title · close), scrolling field stack
(To/Subject/Body, plus the collapsible quoted thread in reply mode), and a footer
(Send primary · Save draft secondary · Delete-draft ghost · paperclip). Inline
danger banners handle validation and send failures.

### Pop-out window (`ThreadWindow`)
A floating `glass-drawer` window (`radius-md`, strong border, `shadow-3` + sheen)
with a custom titlebar (traffic-light close dot · subject · count), a draggable
header, a resize grip (380–900 × 300–820px), the thread cards, and a pinned Reply
footer. Click-to-focus z-ordering.

### Bulk-action bar (`BulkActionBar`)
A `accent-soft` strip below the search bar: a select-all checkbox, an "*N*
selected" count, folder-aware ghost action buttons (danger ones in red), and a
clear "x".

### Banner (`Banner`)
Inline `danger`-bordered alert over `danger-soft`, a danger status dot, caption
text, and an optional underlined action ("Try again"). Errors are always inline
banners — never toasts.

### Toast
A floating `glass-drawer` pill at the bottom-centre of the shell with an accent
status dot and a short success message; auto-dismissed ~2.6s. Success only.

### Settings popover & cheatsheet
Both are `glass-drawer` floats (`radius-md`, `shadow-3` + sheen) portalled to
`document.body`. The **settings popover** stacks segmented controls
(theme/density/glass), a font-scale slider (accent thumb), an animated-canvas
toggle (accent pill switch), a keyboard-shortcuts launcher, and a hairline-
separated Sign out. The **keyboard cheatsheet** is a centred dialog over a
blurred scrim with Navigate/Act/General groups of `<kbd>` chips.

### Auth splash
A full-screen `vm-splash` over the canvas: a glass mail mark (tier-2, accent
icon), the **Vibe**Mail wordmark (Mail in accent), and a sliding loader bar that
resolves into a glass **Continue with Google** button (full-colour Google "G").
A theme toggle sits top-right.

## Theming & Settings

Four runtime axes, persisted and applied as CSS variables on `<html>`:

- **Theme** `dark | light` — light flips the canvas to a cream-green gradient,
  glass to navy-on-cream, the top sheen to a bright white edge, and darkens the
  text ramp; the accent stays green.
- **Density** `compact | default | comfy` — row height 52/64/76px with matching
  card padding and gap.
- **Glass** `low | medium | high` — scales surface opacity and the four blur
  ramps together.
- **Font scale** `0.85–1.3` — multiplies the whole type scale.
- **Animated canvas** `on | off` (default off) — mounts/unmounts the WebGL
  nebula behind the glass; reduced-motion forces it off.

## Motion

- **Durations**: fast `0.12s` (hover/colour transitions), standard `0.2s`, slow
  `0.32s` (drawer/nav slide, splash fade). Eases: `ease-standard`
  (`cubic-bezier(0.2,0.85,0.3,1)`) for most, `ease-out` for entrances.
- **Keyframes**: `vmDrawerIn` (compose rise), `vmNavIn` (mobile nav slide),
  `vmSplashSlide` (loader bar), `vmSpin` (refresh).
- **Reduced motion**: blur capped to 8px everywhere, nebula and all slide/spin
  animations disabled.

## Accessibility

- **Focus**: a 2px accent `:focus-visible` ring (2px offset) on the custom
  `role="button"` message rows and on all native controls.
- **Touch targets**: at the mobile breakpoint, `.vm-tap` / `.vm-nav-btn` expand
  to a ≥44×44px hit area via a centred `::before` pseudo-element (without
  altering layout); stars are pinned visible (no hover to reveal them).
- **Semantics**: action buttons carry `aria-label` / `aria-pressed`; the
  cheatsheet and compose drawer use `role="dialog"`; banners use `role="alert"`.
- **Desktop-only**: keyboard shortcuts and the cheatsheet are hidden on mobile.

## Responsive Behavior

| Width | Key changes |
|---|---|
| ≥ 700px (desktop) | Three resizable panes; pop-out windows; bulk selection; keyboard shortcuts; read-filter toggle and "+" label picker active. |
| < 700px (mobile) | Single panel; list ↔ thread swap with a back arrow; hamburger nav drawer; opaque navy sidebar; compose footer goes full-width with safe-area padding; glass-card borders bump to 20–25% for legibility; type scale holds at 1.0 (no shrink). |

Beyond the shell breakpoint, container queries reflow the **thread header**
(inline → stacked below 520px) and the **message-card meta** (inline → stacked
date below 440px); a `max-height: 820px` query collapses the thread reader to a
single scroll container on short viewports.

## Do's and Don'ts

### Do
- Render every text role in JetBrains Mono — the single-font decision is the
  identity.
- Apply `backdrop-filter: blur()` (with `-webkit-` prefix) directly on each glass
  surface, plus the `inset 0 1px 0` top sheen. Without the blur the 5–14% fill is
  nearly invisible.
- Express elevation through the four glass tiers (blur + shadow), not colour.
- Reserve green for interactive states, unread/star indicators, active filters,
  and focus — keep the rest of the chrome monochrome glass.
- Use `radius-sm` (7px) on controls and `radius-md` (12px) on containers;
  `radius-full` for dots, pills, chips, and avatars.
- Surface errors as inline `Banner`s; reserve toasts for success only.
- Derive any new surface from one of the existing glass tiers and the runtime
  token set — don't hardcode opacities or blur values outside the four-tier
  scale.

### Don't
- Don't introduce a sans-serif, a display face, or an italic style.
- Don't use opaque colour fills for panels — every surface is translucent,
  blurred, and bordered (the opaque navy fallbacks are only the mobile sidebar
  and reduced-cost paths).
- Don't push light-glass opacity past the high-level ceilings or skip the
  `backdrop-filter`.
- Don't use a second accent hue — green is the only chromatic colour in the
  chrome (the forest-green variant is an internal light-animated swap, not a new
  brand colour).
- Don't accept `status` or `draftId` as client-supplied display state — both are
  server-derived (see `CONTRACT.md`).
- Don't add a toast for an error, or a full-screen page for a recoverable one —
  use the inline banner pattern.

## Known Gaps

- **Live API not wired** — Phase 1 runs on the in-memory sample mailbox; the
  endpoint references in `DESIGN_SPEC.md` are not yet bound.
- **"Move to label" is preview-only** — the row "+" picker mutates local display
  state and toasts "not yet synced"; no add/remove-label endpoint exists in
  `CONTRACT.md` yet.
- **Attach is decorative** — the compose paperclip has no upload flow.
- **Glass browser support** — `backdrop-filter` needs `-webkit-` for Safari and
  is unsupported in Firefox without a flag; provide an opaque
  `@supports not (backdrop-filter: blur(1px))` fallback for non-supporting
  environments.
