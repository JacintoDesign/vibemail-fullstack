---
version: alpha
name: OpenCode-design-analysis
description: |
  A terminal-native marketing system rendered entirely in JetBrains Mono — every word on the page, from the hero headline down to the footer fine print, is monospaced. Surfaces are frosted glass panels: translucent white backgrounds at 8–12% opacity with backdrop-blur layers, thin white-opacity borders, and soft drop shadows that create depth without bulk. The page reads like a manpage viewed through frosted glass — warm cream canvas (`#fdfcfc`), nearly-black ink (`#201d1d`), 4px-radius rectangles for interactive elements, and bracketed `[+]`/`[-]` ASCII markers as bullets. The brand's only "visual moment" is a single dark glass hero card that mocks up a TUI — dark translucent background, monospaced terminal output, ASCII pipe characters. Every section is a glass panel with backdrop blur, thin white-opacity borders, and a soft drop shadow layered over the cream canvas.

colors:
  primary: "#201d1d"
  on-primary: "#fdfcfc"
  ink: "#201d1d"
  ink-deep: "#0f0000"
  charcoal: "#302c2c"
  body: "#424245"
  mute: "#646262"
  stone: "#6e6e73"
  ash: "#9a9898"
  canvas: "#fdfcfc"
  surface-soft: "rgba(255,255,255,0.08)"
  surface-card: "rgba(255,255,255,0.10)"
  surface-dark: "rgba(0,0,0,0.72)"
  surface-dark-elevated: "rgba(0,0,0,0.50)"
  hairline: "rgba(255,255,255,0.15)"
  hairline-strong: "rgba(255,255,255,0.20)"
  on-dark: "#fdfcfc"
  on-dark-mute: "#9a9898"
  accent: "#007aff"
  accent-hover: "#0056b3"
  accent-active: "#004085"
  warning: "#ff9f0a"
  warning-hover: "#cc7f08"
  warning-active: "#995f06"
  danger: "#ff3b30"
  danger-hover: "#d70015"
  danger-active: "#a50011"
  success: "#30d158"

typography:
  display-xl:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 38px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
  heading-md:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  body-tight:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0
  link-md:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  button-md:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 2
    letterSpacing: 0
  caption-md:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 2
    letterSpacing: 0

rounded:
  none: 0px
  sm: 4px
  full: 9999px

spacing:
  xxs: 1px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 96px

components:
  button-primary:
    backgroundColor: "rgba(32,29,29,0.85)"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: 4px 20px
    height: 36px
    backdropFilter: blur(36px)
    border: 1px solid rgba(255,255,255,0.18)
    boxShadow: 0 8px 24px rgba(0,0,0,0.16)
  button-primary-active:
    backgroundColor: "rgba(15,0,0,0.90)"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    backdropFilter: blur(36px)
    border: 1px solid rgba(255,255,255,0.18)
    boxShadow: 0 4px 12px rgba(0,0,0,0.20)
  button-secondary:
    backgroundColor: "rgba(255,255,255,0.10)"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: 4px 20px
    backdropFilter: blur(28px)
    border: 1px solid rgba(255,255,255,0.20)
    boxShadow: 0 4px 16px rgba(0,0,0,0.12)
  button-tab:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    typography: "{typography.button-md}"
    rounded: "{rounded.none}"
    padding: 8px 16px
    backdropFilter: blur(20px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: none
  button-tab-active:
    backgroundColor: "rgba(255,255,255,0.10)"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.none}"
    backdropFilter: blur(20px)
    border: 1px solid rgba(255,255,255,0.20)
    boxShadow: 0 2px 8px rgba(0,0,0,0.08)
  button-disabled:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.ash}"
    rounded: "{rounded.sm}"
    backdropFilter: blur(20px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: none
  badge-news:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.sm}"
    padding: 2px 8px
    backdropFilter: blur(28px)
    border: 1px solid rgba(255,255,255,0.18)
    boxShadow: 0 4px 16px rgba(0,0,0,0.20)
  text-input:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 40px
    backdropFilter: blur(28px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 4px 16px rgba(0,0,0,0.12)
  text-input-focused:
    backgroundColor: "rgba(255,255,255,0.12)"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    backdropFilter: blur(36px)
    border: 1px solid rgba(255,255,255,0.20)
    boxShadow: 0 8px 24px rgba(0,0,0,0.16)
  textarea:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px
    backdropFilter: blur(28px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 4px 16px rgba(0,0,0,0.12)
  install-snippet:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
    backdropFilter: blur(28px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 4px 16px rgba(0,0,0,0.12)
  hero-tui-mockup:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 64px 32px
    backdropFilter: blur(40px)
    border: 1px solid rgba(255,255,255,0.20)
    boxShadow: 0 16px 48px rgba(0,0,0,0.32)
  tui-prompt-row:
    backgroundColor: "{colors.surface-dark-elevated}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    backdropFilter: blur(36px)
    border: 1px solid rgba(255,255,255,0.18)
    boxShadow: 0 8px 24px rgba(0,0,0,0.24)
  list-row:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 8px 0px
    backdropFilter: blur(20px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 2px 8px rgba(0,0,0,0.08)
  faq-row:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 12px 0px
    backdropFilter: blur(20px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 2px 8px rgba(0,0,0,0.08)
  testimonial-row:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 16px 20px
    backdropFilter: blur(28px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 4px 16px rgba(0,0,0,0.12)
  chart-tile:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.body}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.none}"
    padding: 16px
    backdropFilter: blur(20px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 2px 8px rgba(0,0,0,0.08)
  primary-nav:
    backgroundColor: "rgba(255,255,255,0.12)"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    height: 56px
    backdropFilter: blur(40px)
    border: 1px solid rgba(255,255,255,0.20)
    boxShadow: 0 8px 24px rgba(0,0,0,0.12)
  footer-section:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.body}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.none}"
    padding: 32px 0px
    backdropFilter: blur(20px)
    border: 1px solid rgba(255,255,255,0.15)
    boxShadow: 0 2px 8px rgba(0,0,0,0.08)
  link-inline:
    textColor: "{colors.ink}"
    typography: "{typography.link-md}"
  badge-section-label:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"
    rounded: "{rounded.none}"
---

## Adaptation Note

Adapted from **OpenCode Design MD** for **Vibemail Glass**. Surface treatment replaced with glassmorphism — translucent backgrounds at 8–12% white opacity, backdrop-filter blur at 20–40px scaled by elevation, thin borders at 15–20% white opacity, and soft drop shadows for depth. Typography replaced with **JetBrains Mono** (variable font via Google Fonts; load with `font-family: 'JetBrains Mono', monospace` and `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap')`). All other tokens — colors, spacing, shapes, layout, responsive behavior, component structure — sourced from OpenCode unchanged.

## Overview

OpenCode's marketing site is rendered entirely in JetBrains Mono — every word on the page, from the 38px hero headline down to the 14px footer fine print, sits in the same monospaced face. The visual identity comes from that single typographic decision: the page reads like a manpage or a static-site README, complete with bracketed `[+]` / `[-]` / `[x]` ASCII markers used in place of icons or bullets, and a wordmark rendered as block-pixel ASCII art at the top of the nav. There is no sans-serif anywhere, no display face, no italics, no decorative ornament — the system is one font and one weight away from being a 1990s `whatis` page rendered at modern resolutions, viewed through frosted glass.

Every surface in the system is a glass panel rather than an opaque fill. Sections, cards, inputs, and navigation all share the same treatment: a translucent white background (8–12% opacity), a `backdrop-filter: blur()` layer scaled to elevation (20px at the base, up to 40px for the highest surfaces), a thin 1px white-opacity border (15–20%), and a soft drop shadow that lifts the panel off the warm cream canvas (`{colors.canvas}` — `#fdfcfc`). The single "visual moment" is a full-bleed dark glass hero card (`{colors.surface-dark}` — `rgba(0,0,0,0.72)` at 40px blur) that mocks up the OpenCode TUI itself: a terminal frame with keybinding hints, a Build command line, and the wordmark rendered as a pixel-block ASCII title.

The semantic palette is unusual for a brand-marketing site: it ships the full Apple Human Interface Guidelines accent ramp — `{colors.accent}` (Apple Blue `#007aff`), `{colors.danger}` (`#ff3b30`), `{colors.warning}` (`#ff9f0a`), `{colors.success}` (`#30d158`) plus their hover/active deepenings — even though the marketing surfaces themselves only use these colors in the dark glass hero TUI mockup as syntax-highlight stand-ins. The wider palette belongs to the in-product TUI; the marketing pages mostly stay in monochrome with glass layering.

**Key Characteristics:**
- 100% JetBrains Mono typography across every text role — no sans-serif fallback anywhere in the chrome
- Warm cream `{colors.canvas}` (#fdfcfc) as the only body background — no surface alternation across sections
- Glass surfaces at 8–12% white opacity with 20–40px backdrop blur — elevation expressed through blur intensity and shadow depth, not color
- 4px radius (`{rounded.sm}`) on every interactive element; sections themselves are sharp glass rectangles bordered in 1px white-opacity hairline
- ASCII bracket markers (`[+]`, `[-]`, `[x]`) used as bullet glyphs in feature lists and FAQ rows
- Block-pixel ASCII wordmark in the primary nav and inside the hero TUI — the brand identity is its own ASCII art
- 96px `{spacing.section}` rhythm between every section, with only thin 1px `{colors.hairline}` glass borders separating content blocks

## Colors

> **Source pages:** `/` (home), `/zen`, `/enterprise`. The chrome palette is identical across all three.

### Brand & Accent
- **Ink** (`{colors.primary}` / `{colors.ink}` — `#201d1d`): the brand's only "color." Headlines, body text, primary CTA fill, nav links, and every solid icon. Treats nearly-black as the brand color rather than pure black to keep type readable on the warm cream canvas.
- **Ink Deep** (`{colors.ink-deep}` — `#0f0000`): pressed-state base for the primary CTA glass panel. Carries a faint red undertone matching the canvas's warm cast.
- **Cream** (`{colors.canvas}` — `#fdfcfc`): the brand's signature warm white. Used for every page body and as the on-primary text color and ASCII wordmark fill on dark.

### Surface
- **Canvas Cream** (`{colors.canvas}` — `#fdfcfc`): the page body background that glass surfaces sit over. Not itself a glass panel — it is the material behind the glass.
- **Soft Surface** (`{colors.surface-soft}` — `rgba(255,255,255,0.08)`): base-tier glass. 8% white opacity. Used for text-input default fill, testimonial row, and alternating row tint. Pair with `backdrop-filter: blur(28px)` and a `1px solid rgba(255,255,255,0.15)` border.
- **Surface Card** (`{colors.surface-card}` — `rgba(255,255,255,0.10)`): mid-tier glass. 10% white opacity. Used for install-snippet pill and slightly-elevated section rows. Pair with `backdrop-filter: blur(28px)`.
- **Surface Dark** (`{colors.surface-dark}` — `rgba(0,0,0,0.72)`): high-tier dark glass. The hero TUI mockup background. At 72% black opacity with 40px blur it reads as a near-opaque dark panel while remaining technically translucent. Pair with `backdrop-filter: blur(40px)` and `1px solid rgba(255,255,255,0.20)`.
- **Surface Dark Elevated** (`{colors.surface-dark-elevated}` — `rgba(0,0,0,0.50)`): the prompt-row inside the hero TUI mockup, one tier lighter than the dark surface at 50% black opacity. Pair with `backdrop-filter: blur(36px)`.
- **Hairline** (`{colors.hairline}` — `rgba(255,255,255,0.15)`): the standard glass border. 1px section divider on all base- and mid-tier surfaces.
- **Hairline Strong** (`{colors.hairline-strong}` — `rgba(255,255,255,0.20)`): stronger glass border for the tab strip, focused inputs, and high-elevation panels.

### Text
- **Ink** (`{colors.ink}` — `#201d1d`): headlines, body text, primary nav links, button text on light surfaces.
- **Charcoal** (`{colors.charcoal}` — `#302c2c`): subtly softer body where pure ink is too heavy.
- **Body** (`{colors.body}` — `#424245`): default paragraph text and FAQ answers.
- **Mute** (`{colors.mute}` — `#646262`): tab labels (default state), metadata, footer link text, in-list secondary annotations.
- **Stone** (`{colors.stone}` — `#6e6e73`): least-emphasis utility text, breadcrumb separators.
- **Ash** (`{colors.ash}` — `#9a9898`): disabled text and secondary annotation in dark TUI mockup, also TUI mockup secondary color.

### Semantic
The full Apple Human Interface Guidelines semantic ramp ships with the system. On marketing pages these colors appear primarily inside the hero TUI mockup as syntax-highlight stand-ins; in the in-product TUI they carry their conventional meaning.

- **Accent** (`{colors.accent}` — `#007aff`): primary informational signal, in-product link color, TUI command highlight.
- **Accent Hover** (`{colors.accent-hover}` — `#0056b3`): pressed informational link.
- **Accent Active** (`{colors.accent-active}` — `#004085`): deeply-pressed informational state.
- **Danger** (`{colors.danger}` — `#ff3b30`): destructive confirmation, error state.
- **Danger Hover** (`{colors.danger-hover}` — `#d70015`): pressed destructive.
- **Danger Active** (`{colors.danger-active}` — `#a50011`): deeply-pressed destructive.
- **Warning** (`{colors.warning}` — `#ff9f0a`): caution callouts.
- **Warning Hover** (`{colors.warning-hover}` — `#cc7f08`): pressed caution.
- **Warning Active** (`{colors.warning-active}` — `#995f06`): deeply-pressed caution.
- **Success** (`{colors.success}` — `#30d158`): positive confirmation, in-TUI success indicator.

## Typography

### Font Family
**JetBrains Mono Variable** is the monospaced face used across every text role in the system. Load it from Google Fonts using the variable font import:

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap');
font-family: 'JetBrains Mono', monospace;
```

It carries weights 100–800 as a variable font axis and falls back through a long monospace stack — ui-monospace → SFMono-Regular → Menlo → Monaco → Consolas → Liberation Mono → Courier New.

The single-font decision is the brand. There is no display face, no body sans, no italic alternative, and no fallback to a proportional font anywhere — even the legal copyright row uses JetBrains Mono at 14px. This is the most aggressive typographic restraint of any site in the marketing-tools category: the identity is "the marketing page is a man page."

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 38px | 700 | 1.5 | 0 | Hero headline ("The open source AI coding agent") |
| `{typography.heading-md}` | 16px | 700 | 1.5 | 0 | Section label ("What is OpenCode?", "FAQ", "Built for privacy first") |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Body copy, paragraph text, list-row text, install-snippet code |
| `{typography.body-strong}` | 16px | 500 | 1.5 | 0 | Inline emphasis, primary nav link, tab-label active |
| `{typography.body-tight}` | 16px | 500 | 1 | 0 | Compact label rendered without breathing room |
| `{typography.link-md}` | 16px | 400 | 1.5 | 0 | Inline anchor link in body prose |
| `{typography.button-md}` | 16px | 500 | 2 | 0 | Every button label across the system |
| `{typography.caption-md}` | 14px | 400 | 2 | 0 | Footer link text, badge label, copyright row, chart caption |

### Principles
The hierarchy is built almost entirely from size and weight contrast on a single face. The display headline (38px / 700) and the heading-md label (16px / 700) share a weight; the difference is just size. Body and link share size, weight, and line-height — only context distinguishes them. Buttons get a deliberately tall line-height (2.0) so labels feel calmly spaced inside the 4px-radius glass rectangle.

### Note on Font Origin
JetBrains Mono is an open-source variable font maintained by JetBrains and distributed via Google Fonts. It is the closest open-source match to Berkeley Mono (the proprietary font used in the OpenCode source design) for stroke contrast, x-height, and metric behavior at body sizes. Line-height behavior is preserved by keeping `lineHeight: 1.5` for body and `lineHeight: 2` for buttons across both fonts — no size or scale adjustments are needed when substituting.

## Layout

### Spacing System
- **Base unit:** 8px (with finer 1/2/4px steps available for tight inline gaps).
- **Tokens (front matter):** `{spacing.xxs}` (1px) · `{spacing.xs}` (4px) · `{spacing.sm}` (8px) · `{spacing.md}` (12px) · `{spacing.lg}` (16px) · `{spacing.xl}` (24px) · `{spacing.xxl}` (32px) · `{spacing.section}` (96px).
- **Universal section rhythm:** every page in the set uses `{spacing.section}` (96px) as the vertical gap between major content blocks. This is the largest spacing token in the system and is the dominant layout cue across the home, `/zen`, and `/enterprise` pages.
- **Section internal padding:** content rows inside a section sit at `{spacing.lg}` (16px) vertical with no horizontal padding — text starts flush at the section's left edge.

### Grid & Container
- **Max width:** ~960px content column for body sections; the dark glass hero TUI mockup is full-bleed within an outer ~1100px content frame.
- **Two-column split:** `/enterprise` pairs a left text block (~360px wide) with a right-aligned form column (~480px wide). The home page is single-column reading.
- **Footer:** 5-up horizontal link row (GitHub / Docs / Changelog / Discord / X) at desktop, collapsing to 2-up at tablet and 1-up at mobile.

### Whitespace Philosophy
Whitespace is structural and generous. Sections sit 96px apart with no decorative dividers between them — the `{colors.hairline}` 1px glass border is the only signal of separation. Inside a section, content is left-flush against the column edge with no internal indentation; bullets use ASCII bracket prefixes (`[+]` / `[-]`) instead of indent-based layout. The result is a page that feels like a printed code listing rendered through frosted glass rather than a styled marketing layout.

## Elevation & Depth

Glass surfaces use blur intensity and shadow depth — not color — to express elevation. Higher elevation means a stronger blur, a slightly higher white-opacity background, a thicker white-opacity border, and a deeper shadow.

| Level | Background | Backdrop Blur | Border | Shadow | Use |
|---|---|---|---|---|---|
| 0 — Base glass | `rgba(255,255,255,0.08)` | `blur(20px)` | `1px solid rgba(255,255,255,0.15)` | `0 2px 8px rgba(0,0,0,0.08)` | List rows, FAQ rows, chart tiles, footer |
| 1 — Mid glass | `rgba(255,255,255,0.10)` | `blur(28px)` | `1px solid rgba(255,255,255,0.15)` | `0 4px 16px rgba(0,0,0,0.12)` | Text inputs, install snippet, testimonial rows, badges |
| 2 — Elevated glass | `rgba(255,255,255,0.12)` | `blur(36px)` | `1px solid rgba(255,255,255,0.18)` | `0 8px 24px rgba(0,0,0,0.16)` | Primary nav, focused inputs, primary buttons, prompt rows |
| 3 — High dark glass | `rgba(0,0,0,0.72)` | `blur(40px)` | `1px solid rgba(255,255,255,0.20)` | `0 16px 48px rgba(0,0,0,0.32)` | Hero TUI mockup — the system's deepest surface |

Every glass panel requires `backdrop-filter: blur()` to be visible — the translucent background alone renders as nearly transparent without a blur layer. Ensure the `backdrop-filter` CSS property is applied directly to the surface element, not a parent.

### Decorative Depth
Beyond blur and shadow, depth comes from typography density and the single dark glass TUI mockup:
- **ASCII block-pixel wordmark** — the OpenCode brand name rendered as a 5-row block of monospaced character cells, used in the primary nav and as the centerpiece of the hero TUI mockup.
- **Hero TUI mockup** — full-bleed `{colors.surface-dark}` dark glass rectangle at 40px blur containing a faux terminal interface: ASCII wordmark, a `tui-prompt-row` showing a Build command line, and `tab switch agent` / `ctrl-p commands` keybinding hints in `{colors.ash}` at the bottom edge.
- **Chart tiles** — three thin-line ASCII charts inside the home page's stat block, with abstract dotted/sparse-line plots in `{colors.body}` rendered over base glass panels. Captions sit beneath in `{typography.caption-md}` (`Fig 1. 150K GitHub Stars`, `Fig 2. 850 Contributors`, `Fig 3. 6.5M Monthly Devs`).

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Sections, hero TUI mockup, primary nav, footer, list rows — every glass container that isn't a button |
| `{rounded.sm}` | 4px | Every interactive element — primary CTA, secondary CTA, text inputs, install snippet, badges, prompt rows |
| `{rounded.full}` | 9999px | Avatar circles in testimonials |

The radius vocabulary is two values: 4px for interactive elements and 0px for everything else. Avatar circles in testimonial rows are the only fully-rounded element in the system.

### Photography Geometry
There is no photography. Visual elements are limited to:
- **ASCII block-pixel wordmark** in the nav and hero TUI mockup.
- **Inline ASCII charts** inside the stat-block section — abstract sparse-line and dotted plots without specific data points.
- **Avatar dots** (~32px) inside testimonial rows on `/zen` — flat colored circles in `{rounded.full}`.
- **In-product icons** (kbd, A+, ⊕, ↻, K, Z) rendered as small monospaced character glyphs, not bitmaps or SVG.

## Components

> **No hover states documented** per system policy. Each spec covers Default and Active/Pressed only.

### Buttons

**`button-primary`** — the universal OpenCode CTA
- Background `rgba(32,29,29,0.85)` dark glass, text `{colors.on-primary}`, `backdrop-filter: blur(36px)`, border `1px solid rgba(255,255,255,0.18)`, shadow `0 8px 24px rgba(0,0,0,0.16)`, type `{typography.button-md}`, padding `4px 20px`, height ~36px, rounded `{rounded.sm}` (4px).
- Used for "Download" (top nav), "Get started with Zen", "Send" (enterprise contact form), "Subscribe" (newsletter footer), "Read docs →".
- Pressed state lives in `button-primary-active` — background deepens to `rgba(15,0,0,0.90)`, shadow contracts to `0 4px 12px rgba(0,0,0,0.20)`.

**`button-secondary`** — outlined glass alternative
- Background `rgba(255,255,255,0.10)`, text `{colors.ink}`, `backdrop-filter: blur(28px)`, border `1px solid rgba(255,255,255,0.20)`, shadow `0 4px 16px rgba(0,0,0,0.12)`, type `{typography.button-md}`, padding `4px 20px`, rounded `{rounded.sm}`.
- Lower-emphasis CTA — appears beside the primary fill where two actions are paired.

**`button-tab`** + **`button-tab-active`** — install-tab strip
- Default: transparent background, `backdrop-filter: blur(20px)`, border `1px solid rgba(255,255,255,0.15)`, text `{colors.mute}`, type `{typography.button-md}`, padding `8px 16px`, rounded `{rounded.none}`.
- Active: background `rgba(255,255,255,0.10)`, text `{colors.ink}`, border `1px solid rgba(255,255,255,0.20)`, shadow `0 2px 8px rgba(0,0,0,0.08)`, with a 2px `{colors.ash}` bottom underline indicating selection.
- Used in the install-method tab strip on the home page (`curl` / `npm` / `bun` / `brew` / `yay`).

**`button-disabled`**
- Background `rgba(255,255,255,0.08)`, text `{colors.ash}`, `backdrop-filter: blur(20px)`, border `1px solid rgba(255,255,255,0.15)`, no shadow, rounded `{rounded.sm}`.

### Badges & Chips

**`badge-news`** — small dark glass chip in the news/announcement strip
- Background `{colors.surface-dark}` (`rgba(0,0,0,0.72)`), text `{colors.on-dark}`, `backdrop-filter: blur(28px)`, border `1px solid rgba(255,255,255,0.18)`, shadow `0 4px 16px rgba(0,0,0,0.20)`, type `{typography.caption-md}`, padding `2px 8px`, rounded `{rounded.sm}`.
- Sits inline with body copy as a "News" / "Beta" / "Live now" tag on the home page above the hero headline.

**`badge-section-label`** — bracketed section header
- Background transparent, text `{colors.ink}`, type `{typography.heading-md}`, rounded `{rounded.none}`.
- Renders as a bare `**Heading**` line above a 1px `{colors.hairline}` glass rule with no chip background — the way the text reads ("[+]", "[x]", `What is OpenCode?`) makes it function as a label component.

### Inputs & Forms

**`text-input`** + **`text-input-focused`**
- Default: background `{colors.surface-soft}` (`rgba(255,255,255,0.08)`), text `{colors.ink}`, `backdrop-filter: blur(28px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 4px 16px rgba(0,0,0,0.12)`, type `{typography.body-md}`, padding `8px 12px`, height ~40px, rounded `{rounded.sm}`.
- Focused: background lifts to `rgba(255,255,255,0.12)`, blur increases to `blur(36px)`, border becomes `1px solid rgba(255,255,255,0.20)`, shadow deepens to `0 8px 24px rgba(0,0,0,0.16)` — elevation increases on focus, no color halo.
- Used for every contact-form field on `/enterprise` and the newsletter email field at the home page footer.

**`textarea`**
- Background `{colors.surface-soft}` (`rgba(255,255,255,0.08)`), text `{colors.ink}`, `backdrop-filter: blur(28px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 4px 16px rgba(0,0,0,0.12)`, type `{typography.body-md}`, padding `12px`, rounded `{rounded.sm}`.
- "What problem are you trying to solve?" multi-line textarea on `/enterprise`.

**`install-snippet`** — the home page's signature install code block
- Background `{colors.surface-card}` (`rgba(255,255,255,0.10)`), text `{colors.ink}` rendered in `{typography.body-md}` (already monospaced — JetBrains Mono), `backdrop-filter: blur(28px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 4px 16px rgba(0,0,0,0.12)`, padding `12px 16px`, rounded `{rounded.sm}`.
- Contains the literal `curl -fsSL https://opencode.ai/install | bash` command with a small copy-icon at the right edge. Sits below the install-method tab strip.

### Cards & Containers

**`hero-tui-mockup`** — the home page's signature TUI preview
- Container: full-bleed dark glass `{colors.surface-dark}` (`rgba(0,0,0,0.72)`), `backdrop-filter: blur(40px)`, border `1px solid rgba(255,255,255,0.20)`, shadow `0 16px 48px rgba(0,0,0,0.32)`, padding `64px 32px`, rounded `{rounded.none}`.
- Contents (top → bottom): ASCII block-pixel "OPENCODE" wordmark centered in `{colors.on-dark}`; a `{component.tui-prompt-row}` showing a "Build" command line with model selector text; a `tab switch agent  ctrl-p commands` keybinding hint row at the bottom in `{colors.ash}`.

**`tui-prompt-row`** — the inset command line inside the TUI mockup
- Background `{colors.surface-dark-elevated}` (`rgba(0,0,0,0.50)`), text `{colors.on-dark}` in `{typography.body-md}`, `backdrop-filter: blur(36px)`, border `1px solid rgba(255,255,255,0.18)`, shadow `0 8px 24px rgba(0,0,0,0.24)`, padding `8px 12px`, rounded `{rounded.sm}`.
- Renders an inline command (`Build  Claude Opus 4.5  OpenCode Zen`) with a leading vertical pipe and the model name styled as a bracketed token.

**`list-row`** — feature/benefit row with ASCII bracket bullet
- Background `rgba(255,255,255,0.08)`, text `{colors.body}` in `{typography.body-md}`, `backdrop-filter: blur(20px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 2px 8px rgba(0,0,0,0.08)`, padding `8px 0`.
- Each row begins with a `[+]` / `[-]` / `[x]` ASCII marker followed by a bold label and a regular description: e.g., `[+] LSP enabled    Automatically loads the right LSPs for the IDE`. The bracket marker is part of the text content, not a separate icon.

**`faq-row`** — FAQ entry with bracket toggle
- Background `rgba(255,255,255,0.08)`, text `{colors.ink}` in `{typography.body-md}`, `backdrop-filter: blur(20px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 2px 8px rgba(0,0,0,0.08)`, padding `12px 0`.
- Each row leads with `+` / `−` ASCII markers indicating expand/collapse state. Always rendered as plain text rows — no chevron icons, no animated accordion chrome.

**`testimonial-row`** — `/zen` peer-quote row
- Background `{colors.surface-soft}` (`rgba(255,255,255,0.08)`), text `{colors.body}` in `{typography.body-md}`, `backdrop-filter: blur(28px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 4px 16px rgba(0,0,0,0.12)`, padding `16px 20px`, rounded `{rounded.sm}`.
- Layout: a 32px avatar circle (`{rounded.full}`) at left, name + role + company in `{typography.body-strong}` on the first line, quote in `{typography.body-md}` `{colors.body}` on the second line.

**`chart-tile`** — the stat-block sparse-line chart
- Background `rgba(255,255,255,0.08)`, text `{colors.body}` in `{typography.caption-md}`, `backdrop-filter: blur(20px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 2px 8px rgba(0,0,0,0.08)`, rounded `{rounded.none}`, padding `16px`.
- Contains an inline SVG/CSS-drawn ASCII-style sparse-line plot (dotted, abstract — never specific data points) with a `Fig N. <stat label>` caption beneath in `{colors.mute}`.

### Navigation

**`primary-nav`**
- Background `rgba(255,255,255,0.12)`, text `{colors.ink}` in `{typography.body-strong}`, `backdrop-filter: blur(40px)`, border `1px solid rgba(255,255,255,0.20)`, shadow `0 8px 24px rgba(0,0,0,0.12)`, height ~56px, rounded `{rounded.none}`.
- Layout (desktop): block-pixel ASCII OpenCode wordmark at left (~120×24px), nav links cluster center-right ("GitHub [150K] · Docs · Zen · Go · Enterprise"), `{component.button-primary}` "Download" CTA at the far right with a small download glyph.
- The nav glass panel should be `position: sticky` with the blur layer ensuring legibility over all content it overlaps.

**Top Nav (Mobile)**
- ASCII wordmark stays at left, nav links collapse into a hamburger drawer at the right. The Download CTA remains visible at every breakpoint.

### Footer

**`footer-section`**
- Background `rgba(255,255,255,0.08)`, text `{colors.body}` in `{typography.caption-md}`, `backdrop-filter: blur(20px)`, border `1px solid rgba(255,255,255,0.15)`, shadow `0 2px 8px rgba(0,0,0,0.08)`, padding `32px 0`.
- Top row: 5-column horizontal link grid (GitHub [150K] · Docs · Changelog · Discord · X), each rendered as a centered cell separated by 1px `{colors.hairline}` vertical rules.
- Bottom row: `©2026 Anomaly` copyright at left, `Brand · Privacy · Terms · English ▼` utility cluster at right, all in `{typography.caption-md}` `{colors.mute}`.

### Inline

**`link-inline`** — body-prose anchor link
- `{colors.ink}` text with underline. The brand's only link affordance — even links inside body paragraphs use ink color rather than `{colors.accent}` blue. Apple Blue is reserved for the in-product TUI.

## Do's and Don'ts

### Do
- Render every text role in JetBrains Mono. The single-font decision is the entire identity.
- Keep `{colors.canvas}` (`#fdfcfc`) as the only body background. Glass panels sit over this canvas — they do not replace it.
- Apply `backdrop-filter: blur()` to every glass surface. Translucent backgrounds render as near-invisible without the blur layer.
- Scale blur with elevation: 20px at base, 28px mid, 36px elevated, 40px at the highest dark glass surface.
- Use ASCII bracket markers (`[+]`, `[-]`, `[x]`, `+`, `−`) as bullets, toggles, and section glyphs. They are the brand's only iconography.
- Anchor the dark glass `{component.hero-tui-mockup}` exactly once per landing page as the hero centerpiece.
- Reserve `{colors.accent}` (Apple Blue) and the rest of the semantic ramp for in-TUI states; marketing chrome stays monochrome.
- Use `{rounded.sm}` (4px) on every interactive element and `{rounded.none}` (0px) on every container.
- Stack content sections at `{spacing.section}` (96px) rhythm with only 1px `{colors.hairline}` glass borders between them.

### Don't
- Don't introduce a sans-serif body font, a display face, or an italic style. JetBrains Mono carries everything.
- Don't use opaque color fills for any surface. Every background is a glass panel — translucent, blurred, and bordered.
- Don't increase background opacity above 12% for light glass surfaces or above 80% for dark glass surfaces. Higher opacities collapse the glass effect into a solid fill.
- Don't skip the `backdrop-filter` on any glass surface. Without blur the 8–12% white opacity becomes invisible.
- Don't replace the ASCII bracket markers with SVG icons. The brackets are the icons.
- Don't use the semantic accent ramp (`{colors.accent}`, `{colors.warning}`, `{colors.danger}`, `{colors.success}`) on marketing CTAs. They belong to the in-product TUI.
- Don't pad cards with 24px+ internal padding. List rows sit at 8px vertical; FAQ rows at 12px.
- Don't render the OpenCode wordmark as a vector logo. It is always block-pixel ASCII.
- Don't fill the hero TUI mockup with photography or illustration. It is text-only and always shows a faux terminal command line.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| desktop-large | 1280px+ | Default — 960px content column, 5-up footer link grid |
| desktop | 1024px | Same layout; nav remains horizontal |
| tablet | 850px | Footer collapses to 2-up grid; `/enterprise` two-column form stacks |
| tablet-narrow | 768px | Primary nav becomes hamburger drawer; Download CTA stays visible |
| mobile | 640px | Single-column everything; hero display drops 38px → ~28px; section padding tightens |

### Touch Targets
All interactive elements meet WCAG AA at the ~36–40px height range. `{component.button-primary}` sits at ~36px with 20px horizontal padding. `{component.text-input}` and `{component.textarea}` sit at ~40px. `{component.button-tab}` rows in the install-method strip sit at ~32–36px depending on label length but extend to a full 44px tappable cell via inline padding. Footer links use `{typography.caption-md}` (14px) but receive ~28px line-height (caption-md is 2.0) plus 8px vertical padding for a comfortable ~44px tappable row.

### Collapsing Strategy
- **Primary nav:** desktop horizontal cluster → tablet-narrow hamburger drawer at 768px. The dark glass "Download" CTA stays visible at all widths.
- **Hero TUI mockup:** maintains its full-bleed dark glass surface at every breakpoint; the ASCII wordmark scales proportionally and the keybinding-hint row may wrap to two lines on narrow screens.
- **Install snippet + tab strip:** desktop fixed-width glass pill → mobile full-width pill with horizontal scroll on the tab strip if labels overflow.
- **Footer:** 5-up horizontal link grid → 2-up at tablet → 1-up at mobile (each link becomes a full-width row).
- **`/enterprise` two-column layout:** desktop 50/50 → tablet stacks to single-column with the form below the text block.
- **Section padding:** `{spacing.section}` (96px) desktop → 64px tablet → 48px mobile.
- **Hero headline:** `{typography.display-xl}` (38px) at desktop, scaling to ~28px at mobile, line-height holding at 1.5.

### Image Behavior
There are no raster images in the system aside from the favicon and OG share image. Every visual element — wordmarks, charts, icons — is rendered as type or inline SVG and scales without aspect-ratio considerations.

## Iteration Guide

1. Focus on ONE component at a time. Pull its YAML entry and verify every property resolves, including the three glass properties (`backdropFilter`, `border`, `boxShadow`).
2. Reference component names and tokens directly (`{colors.surface-soft}`, `{component.hero-tui-mockup}`, `{rounded.sm}`) — do not paraphrase.
3. Run `npx @google/design.md lint DESIGN.md` after edits — `broken-ref`, `contrast-ratio`, and `orphaned-tokens` warnings flag issues automatically.
4. Add new variants as separate component entries (`-active`, `-disabled`) — do not bury them inside prose.
5. Default body to `{typography.body-md}`; reach for `{typography.body-strong}` for emphasis; reserve `{typography.display-xl}` strictly for the page-top hero headline.
6. Keep `{colors.surface-dark}` scarce — at most one full-bleed dark glass mockup per page. The dark glass surface is a narrative device, not a chrome treatment.
7. When introducing a new component, assign it to an elevation tier (0–3) first, then derive its `backdropFilter`, `border`, and `boxShadow` from that tier's values. Do not invent new blur or opacity values outside the four-tier scale.
8. When introducing a new component, ask whether it can be expressed with the existing ASCII-bracket + 4px-radius + JetBrains-Mono + glass-tier vocabulary before adding new tokens. The system's strength is that it almost never needs new ones.

## Known Gaps

- **Mobile screenshots not captured** — responsive behavior synthesizes OpenCode's mobile pattern (hamburger drawer, single-column, footer accordion) from desktop evidence and the breakpoint stack.
- **Hover states not documented** by system policy.
- **In-product TUI screenshots** beyond the marketing hero mockup are not in the captured set; the actual `opencode` terminal interface (full keybindings, panels, status bar) is not documented here.
- **`/go` page** not extracted — the marketing page for the Go SDK likely shares the same chrome but introduces code-sample blocks not documented above.
- **Form validation state styling** (success / error inline messages) not present in the captured surfaces.
- **Glass browser support** — `backdrop-filter` requires `-webkit-backdrop-filter` for Safari and is unsupported in Firefox without the `layout.css.backdrop-filter.enabled` flag. Provide an opaque fallback (`background-color: rgba(255,255,255,0.90)`) inside a `@supports not (backdrop-filter: blur(1px))` block for non-supporting environments.
