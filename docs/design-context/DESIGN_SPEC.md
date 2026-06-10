# VibeMail Glass — Behavioural Spec

## Inbox

### Default state
A list of message rows. Each row shows: sender name (from field), subject
line, preview text (snippet field, truncated to one line), relative
timestamp (date field), and a star icon. Unread rows have a filled
accent-coloured dot on the left and a slightly more opaque glass card.
Starred rows show a filled star icon. Unstarred rows show an outlined star
at low opacity, visible on hover.

### User actions
Click a row — opens thread view.
Click the unread dot — toggles isRead via PATCH /api/v1/messages/:id
  without entering the thread.
Click the star icon — toggles isStarred via PATCH /api/v1/messages/:id
  without entering the thread.
Click a label chip — filters the inbox.
Click the compose button (fixed, bottom right) — opens the compose drawer.
Press Cmd+K or Ctrl+K — activates search.

### Loading state
Eight skeleton rows with a shimmer animation on the glass surface.
Skeleton height matches a real row — no layout shift on load.

### Error states
Network error on GET /api/v1/messages: inline banner —
  "Couldn't load messages. Try again." — with a retry button.
UNAUTHORIZED or TOKEN_EXPIRED: redirect to OAuth flow, no banner.

### Empty state
Centred illustration and text — "Your inbox is empty."


## Thread View

### Default state
Replaces the inbox content area when a message row is clicked — inbox
slides out, thread slides in. Thread subject as a heading at the top.
Messages stacked oldest-first, matching the GET /api/v1/threads/:threadId
response order. Each message is a glass card: sender avatar (initials
circle) on the left, sender name and timestamp on the same line, body text
below. The most recent message is expanded. Earlier messages are collapsed
to a single line — sender name, timestamp, chevron on the right.

### User actions
Click a collapsed message — expands it.
Click the back arrow (top left) — returns to inbox.
Click Reply (bottom right of most recent card) — opens compose drawer in
  reply mode, passing threadId to POST /api/v1/messages.
Click the unread toggle (top right of header) — marks thread unread.
Click the star icon (top right of header, alongside unread toggle) —
  toggles isStarred via PATCH /api/v1/messages/:id.

### Loading state
Heading skeleton followed by two glass card skeletons.

### Error states
THREAD_NOT_FOUND from GET /api/v1/threads/:threadId: inline message —
  "This thread couldn't be found." — with a back button.
  No redirect. No full-screen treatment.


## Compose Drawer

### Default state
A panel that slides up from the bottom of the viewport and overlays —
not replaces — whatever is behind it. More opaque glass background than
inbox cards (floats over active content; form fields must stay legible).
Drag handle at the top. Fields: To (tag-style email entry), Subject, Body
(textarea). Send button at bottom right with accent fill. Secondary
Save draft button alongside Send — outlined glass treatment.
Close button (X) at top right.

### Reply mode
Triggered from the Reply action in thread view. To field pre-filled with
original sender address — read-only. Subject pre-filled as
"Re: [original subject]". Quoted excerpt of the last message body appears
below the body input — separated by a thin horizontal rule, rendered at
reduced opacity. threadId passed to POST /api/v1/messages.

### Draft-restored state
If a draft exists for this user when the compose drawer opens, fields are
pre-populated from the draft. A "Discard draft" chip appears below the
body field — outlined glass, low opacity. Clicking it calls
DELETE /api/v1/drafts/:id and clears the fields.
draftId is server-managed — never sent as a client field.

### User actions
Type in any field to activate it. Tab between fields.
Click Send — submits via POST /api/v1/messages.
Click Save draft — calls POST /api/v1/drafts.
Click close or press Escape — dismisses the drawer; auto-saves draft via
  POST /api/v1/drafts before closing.

### Loading state
Send in flight: spinner replaces Send button label, Send button disabled,
Save draft disabled. Form preserved and readable.

### Error states
MISSING_FIELDS (POST /api/v1/messages): red border and field-level error
  label on each empty required field — not a banner, not a toast.
Network error on POST /api/v1/messages: inline banner inside the drawer —
  "Couldn't send. Try again." — drawer stays open, draft preserved.
Network error on draft auto-save (POST /api/v1/drafts on close): silent —
  small "Draft not saved" indicator near close button, no modal.

### Mobile keyboard behaviour
Maximum drawer height 58% of viewport — accounts for keyboard occupying
the lower 40%. Fields scroll internally so body is always reachable.


## Search

### Activation
Search is a mode the inbox enters — not a separate route. Activated by
clicking the search bar or pressing Cmd+K / Ctrl+K. The inbox list is
replaced by a search results list.

### Default state (active)
Search bar shows the active query with a subtle accent glow on the border.
Inline "Clear search" button at the right of the search bar. Results list
uses the identical row treatment as the inbox — same glass card, same five
row elements including the star icon.

### User actions
Type to search — fires GET /api/v1/messages/search with the q param after
  at least one character (prevents MISSING_QUERY error).
Press Escape or click Clear search — returns to the inbox in its previous
  state (same scroll position, same filter chip active).

### Loading state
Eight skeleton rows while the search request is in flight.

### Error states
Network error: inline banner matching the inbox error treatment —
  "Couldn't load results. Try again." — with a retry button.

### Empty state
"No messages match your search." — centred text, no illustration.


## Visual Direction

Heavy glassmorphism throughout. Every panel, card, message row, and drawer
carries a frosted glass treatment: translucent backgrounds with strong
backdrop blur, thin borders at 15–20% white opacity, and soft drop shadows
that create depth through layering rather than solid colour contrast. The
background palette is near-black (#050810) on dark mode. Glass
surfaces sit at 8–12% white opacity with blur values between 20px and 40px
depending on elevation — higher elevation surfaces use stronger blur. The
single accent colour handles interactive states, unread indicators, starred
states, and active filter chips. The overall register is dark, sleek, and
layered.