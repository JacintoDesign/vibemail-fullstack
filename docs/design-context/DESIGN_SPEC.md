# VibeMail Glass — Behavioural Spec

VibeMail Glass is a single-page email client rendered entirely in JetBrains
Mono over a frosted-glass shell. It defaults to a dark canvas with a green
accent and is fully themeable at runtime (theme · density · glass · font
scale · animated background). This spec describes the surfaces and their
states as built. Visual tokens live in `VIBEMAIL_DESIGN.md`.

The Phase-1 build runs against an in-memory sample mailbox (`lib/sample-data`).
The endpoint references below mark where each interaction will bind to the
`/api/v1` contract in Phase 2; they are not yet wired.


## App Shell

### Desktop (viewport ≥ 700px)
A three-pane layout inside a single full-bleed glass shell: **Sidebar** ·
**Message List** · **Reading Pane**, separated by drag handles.

- The sidebar resizes between 216–320px; dragging below 140px (or
  double-clicking its handle) collapses it to a 56px icon rail.
- The message list resizes between 280–560px. Its chrome button collapses it
  to a thin labelled rail; the reading pane can likewise collapse to a rail on
  the right. Only one of the two centre panes collapses at a time — collapsing
  one expands the other to fill.
- Layout (sidebar width, rail state, list width, collapse flags) persists to
  `localStorage` under `vm-layout` and is restored on load.

### Mobile (viewport < 700px)
A single-panel shell. The message list fills the viewport; opening a message
replaces it with the thread reader (back arrow returns to the list). A
hamburger in either header slides the sidebar in from the left as a full-height
drawer over the active panel.

### Background
A near-black charcoal radial gradient in dark mode; a cream-green gradient in
light mode. An optional WebGL "nebula" animates behind the glass when the
Animated canvas setting is on (off by default, and force-disabled under
`prefers-reduced-motion`).


## Auth Splash

The unauthenticated entry surface. Centred: a glass mail mark, the
**Vibe**Mail wordmark (Mail in accent), and a loading bar that runs for ~1.25s
then resolves into a **Continue with Google** button (full-colour Google "G").
A theme toggle sits at the top right. Clicking the button fades the splash out
and reveals the app shell; Phase 2 points it at `GET /api/v1/auth/google` and
returns through `/auth/callback`.


## Sidebar

### Default state
Top to bottom: the **VibeMail** wordmark, a full-width **Compose** primary
button, the folder nav, a **Labels** group, the account email, and a footer
**Settings** gear.

Folder nav items, each with an icon, optional count, and a 2px accent left
border + accent-soft fill when active:
- **Inbox** (`all`) — count = unread inbox messages, shown in accent.
- **Starred** — count = starred, not-trashed.
- **Sent**.
- **Drafts** — count = drafts.
- **Archive** (`archived`).
- **Trash**.

The **Labels** group lists user labels (Social, Updates, Forums, Shopping,
Promotions in the sample data), each with a bespoke line icon; unknown labels
fall back to a dot. Selecting one filters to `label:<name>`.

### Rail state
Collapsed to 56px: a hamburger toggle and an accent compose square at top, then
icon-only nav items (label shown as a tooltip with count). The labels group is
introduced by a hairline instead of the "Labels" heading. The account email
hides; the settings gear centres.

### User actions
- Click a folder or label — selects it (clears the open thread, exits search,
  resets the read filter).
- Click Compose — opens the compose drawer in new-message mode.
- Drag / double-click the sidebar resizer — resize / toggle the rail.
- Click the Settings gear — opens the settings popover (below).

### Settings popover
Anchored above the gear (portalled to `document.body`), dismissed by an outside
click. Contents:
- **Theme** — segmented `dark / light`.
- **Density** — segmented `compact / default / comfy` (row height 52/64/76px).
- **Glass** — segmented `low / medium / high` (drives surface opacity + blur).
- **Font scale** — slider 85%–130%, shown as a live percentage.
- **Animated canvas** — toggle for the WebGL nebula.
- **Keyboard shortcuts** — opens the cheatsheet (desktop only).
- **Sign out** — separated by a hairline; reddens on hover.

All settings persist and re-tokenise the entire shell live.


## Message List

### Default state
A folder header, a search bar, then a scrolling list of message rows.

The **header** shows the folder title (or "Search" in search mode) with a faint
total count beside it, an **All mail / Unread** read-filter toggle (hidden in
search mode), a **Refresh** icon button (spins while refreshing), and a
**collapse list** chrome button. On mobile the header swaps in a hamburger and
a compose icon button.

The **search bar** is a full-width input with a search icon; it gains an accent
glow border when search mode is active.

Rows are paginated at **8 per page** with a **Load more** button; the page
resets on folder switch, search, or query change.

### Message Row
A glass card, more opaque when unread, laid out in up to four rows:
1. *(hover/selection only)* a select checkbox · sender name · unread dot ·
   star · timestamp (timestamp in green).
2. Subject (single line, ellipsis).
3. Preview snippet (2-line clamp; 1 line on mobile).
4. Label badges, plus a hover **"+"** label picker (desktop only).

States: unread rows show the sender in bold and a glowing accent **unread dot**
(click it to mark read — `PATCH /api/v1/messages/:id`). The **star** is filled
in accent when starred, otherwise a faint outline revealed on hover (toggle →
`PATCH /api/v1/messages/:id`). A selected (open) or checked row takes an accent
border and accent-soft fill. The row is a keyboard-focusable button (Enter /
Space / `o` opens it) with a visible accent focus ring.

### User actions
- Click a row — opens it. A normal message opens in the reading pane (marking
  it read); a draft opens directly in the compose drawer in edit mode; clicking
  the already-open row closes it.
- Click the unread dot — toggles read without opening.
- Click the star — toggles starred without opening.
- Hover a row and click the checkbox — begins a multi-selection (see Bulk
  Selection).
- Hover a row's "+" — opens the label picker; click a label to add it (Phase-1
  preview only — no add/remove-label endpoint exists yet, so a toast notes it
  is "not yet synced"). Hovering a label badge reveals an "x" to remove it.

### Loading state
Seven skeleton cards with shimmering glass surfaces, matching row height (no
layout shift).

### Error state
An inline error banner above the list — danger-toned, with a **Try again**
action that re-runs the fetch. Never a toast or full-screen page. (`UNAUTHORIZED`
/ `TOKEN_EXPIRED` will instead redirect to the OAuth flow.)

### Empty state
A centred glass icon tile, a primary line, and a hint:
- Inbox: "Your inbox is empty." + "New mail will appear here in real time."
- Other folders: folder-specific copy ("Nothing in Sent.", "Archive is
  empty.", etc.).
- Search with no matches: "No messages match your search." + "Try a different
  name, subject, or keyword."


## Reading Pane / Thread

### Empty placeholder
When no message is open: a centred glass mail tile, "Select a conversation to
read.", and a hint line — `[+] cmd-k to search · click the dot to mark read`
(stacks on narrow widths). A collapse-pane chrome button sits top-right.

### Thread reader
Replaces the placeholder when a row is opened.

- **Header**: the subject as a heading (clamped to 2 lines, expands on narrow
  widths via container query), a row of action icon buttons, a collapse button,
  and a meta line showing "*N* messages" plus status/label badges (a warning
  **Draft** badge, a **Sent** badge, label chips).
- **Actions** are folder-aware:
  - Inbox: Mark unread · Star · Archive · Delete (→ Trash) · Pop out.
  - Archive: Move to Inbox · Mark unread · Star · Delete · Pop out.
  - Trash: Restore to Inbox · Star · Delete forever · Pop out.
  - Draft: a single **Edit draft** primary button.
- **Messages** stack oldest-first as collapsible glass cards; the most recent
  is expanded, earlier ones collapsed to a single preview line. Each card
  header shows sender · email · date · chevron; clicking it (or the chevron)
  toggles expansion. Expanded bodies render `pre-wrap`.
- A dashed **quick-reply** affordance ("Reply to *Sender*…") sits below the
  thread for non-drafts; it opens the compose drawer in reply mode.

Each destructive/move action shows a confirming toast and closes the thread.
On mobile the reader is a full panel with a back arrow and the actions condensed
into icon buttons in the header.


## Pop-out Thread Windows (desktop)

The **Pop out** action detaches the open thread into a floating, draggable glass
window over the panes.

- Custom titlebar: a traffic-light close dot (reddens on hover), the subject,
  and a message count. Drag the titlebar to move; drag the bottom-right grip to
  resize (380–900 × 300–820px).
- Body: the same collapsible thread cards. A pinned footer holds a **Reply**
  button.
- Multiple windows stack with click-to-focus z-ordering; re-popping an
  already-open thread brings its window forward. Opening a pop-out clears the
  in-pane selection.


## Compose Drawer

### Default state
A panel that slides up from the bottom and overlays the panes behind a scrim.
It opens at full height by default; a top **drag handle** resizes it down to a
minimum of 60% of the host height (double-click the handle to restore full).
Header: a compose icon, a mode title, and a close (X). Fields: **To** (recipient
chips + free input), **Subject**, **Body** (textarea). Footer: **Send**
(primary), **Save draft** (secondary), and a paperclip **Attach** icon pushed to
the right. The title reads "New message", "Reply", or "Edit draft" by mode.

### Recipients
Typing an address and pressing Enter / comma (or blurring) commits it to a chip;
clicking a chip puts it back into the input to edit; chips carry a remove "x".

### Reply mode
Opened from a thread's Reply / quick-reply. The original sender is pre-filled as
a **locked** chip (no remove). Subject is pre-filled "Re: …". Below the body, a
collapsible **Quoted conversation** disclosure expands the original thread cards
inline.

### Draft mode
Opened by clicking a draft row or **Edit draft**. Fields pre-populate from the
draft (recipient, subject, body). The footer gains a **Delete draft** action
(ghost, danger-coloured) that discards the draft and closes the drawer. `draftId`
is server-managed and never sent as a client field.

### User actions
- Click Send — validates, then submits (`POST /api/v1/messages`). On success the
  drawer closes and a toast confirms "Message sent to *N* recipient(s)."
- Click Save draft — closes with a "Draft saved." toast (`POST /api/v1/drafts`).
- Click close / press Escape — dismisses the drawer.

### Loading state
While sending, the Send button reads "Sending…" and both Send and Save draft are
disabled; the form stays readable.

### Error states
- Validation (no recipients or empty subject): an inline danger banner — "Add at
  least one recipient and a subject." — and the empty To/Subject fields take a
  danger border. Not a toast.
- Send failure: an inline danger banner inside the drawer — "Couldn't send.
  Check your connection and try again." — with a **Try again** action; the drawer
  stays open and the draft is preserved.

### Mobile
The drawer footer becomes a full-width **Send** + **Save draft** pair (plus a
delete-draft icon in draft mode) and clears the iOS home indicator via safe-area
padding.


## Search

### Activation
Search is a *mode the message list enters*, not a route. Activated by focusing
the search bar, pressing `/`, or pressing ⌘/Ctrl-K. The list is replaced by
search results.

### Active state
The search input border glows accent and shows a **clear** "x". A summary line
reads "*N* results for "query"" (or "Type to search subject, sender, or body…"
when empty). Results reuse the identical message-row treatment. Matching is
across sender name, sender email, subject, snippet, and recipient; trashed
messages are excluded.

### User actions
- Type — filters live.
- Press Escape, or click clear — exits search and restores the prior folder.

### Loading / empty
Loading shows the seven-card skeleton; no matches shows "No messages match your
search." with a hint.


## Bulk Selection (desktop)

Checking a row's checkbox starts a selection. A **bulk-action bar** appears below
the search bar, accent-soft tinted: a **select-all** checkbox, an "*N* selected"
count, and folder-aware action buttons, plus a clear "x". The selection drops
when the folder or search context changes.

Action sets by folder:
- Inbox / labels: **Archive** · **Delete** (→ Trash) · **Read** · **Unread**.
- Archive: **Move to Inbox** · **Delete** · **Read** · **Unread**.
- Trash: **Restore** · **Delete forever** · **Read** · **Unread**.
- Drafts: **Discard**.

Each action confirms with a toast ("3 archived.", "2 moved to Trash.", etc.).
Labeling is per-message via the row "+" picker, not a bulk action.


## Keyboard Shortcuts (desktop)

A global handler drives navigation and actions; shortcuts are inactive while
typing in a field, and the cheatsheet is opened with **?** (and via the settings
popover). The "g" prefix is a Gmail-style go-to sequence.

- **Navigate**: `j`/`↓` next · `k`/`↑` previous · `Enter`/`o` open focused ·
  `g i` Inbox · `g s` Starred · `g t` Sent · `g d` Drafts · `g a` Archive.
- **Act**: `c` compose · `r` reply to open thread · `s` star/unstar · `e`
  archive · `#` delete · `u` mark unread. Row-level actions target the
  keyboard-focused row, else the open thread.
- **General**: `/` or `⌘K` search · `?` toggle help · `Esc` unwinds the topmost
  layer (help → compose → search → selection → open thread).


## Toasts

Transient success confirmations slide in centred at the bottom of the shell: a
glass pill with an accent status dot and a short message, auto-dismissed after
~2.6s. Errors never use toasts — they use inline banners.


## Visual Direction

Heavy glassmorphism on a dark, monospaced register. Every panel, card, row,
drawer, and pop-out is a frosted-glass surface: translucent white-on-near-black
fills (5–14% by elevation), backdrop blur scaled to elevation (20–40px at the
medium glass level), thin white borders (10–22%), a top sheen highlight, and
layered drop shadows. The near-black charcoal canvas, the single **green**
accent (interactive states, unread dots, stars, active filters, focus rings),
and JetBrains Mono throughout define the identity. A light theme inverts the
same vocabulary onto a cream-green canvas. See `VIBEMAIL_DESIGN.md` for the full
token set and component specs.
