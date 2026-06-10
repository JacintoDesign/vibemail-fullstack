// VibeMail Glass — sample mailbox (fake data, grounded in the backend Message
// model). Ported verbatim from design-handoff/app/data.js; the IIFE that wrote
// window.VM_DATA is replaced with typed named exports.
//
// Each record maps to the CONTRACT.md Message shape, plus a few UI-display
// conveniences (senderName/senderEmail parsed from `from`, a short `time`
// label, and an expanded `thread[]` of rendered messages).

import type { Label, Message, ThreadMsg } from "./types";

export const ME = "you@vibemail.app";
const me = ME;

// helper: build a thread message
const t = (from: string, email: string, date: string, body: string): ThreadMsg => ({
  from,
  email,
  date,
  body,
});

export const MESSAGES: Message[] = [
  // ── INBOX (16 messages) ───────────────────────────────────────────────
  {
    id: "m1", threadId: "t1",
    senderName: "Ada Lovelace", senderEmail: "ada@analytical.eng",
    from: "Ada Lovelace <ada@analytical.eng>", to: me,
    subject: "Re: Analytical Engine — punch-card sequence",
    snippet: "I've attached the revised card sequence. The loop on cards 14–22 now folds the Bernoulli step in cleanly, single pass.",
    date: "Tue, 09 Jun 2026 09:24:00 +0000", time: "9:24",
    labelIds: ["INBOX", "UNREAD", "STARRED"], isRead: false, isStarred: true,
    status: "inbox", labels: ["Forums"], hasAttachment: true, draftId: null,
    thread: [
      t("You", me, "Yesterday 17:02", "Ada — before we cut the next deck of cards, can you confirm the Bernoulli loop folds into the main sequence without a second pass? I'd rather not re-feed the hopper mid-run."),
      t("Ada Lovelace", "ada@analytical.eng", "Today 9:24", "Confirmed. I've attached the revised card sequence — the loop on cards 14–22 now folds the Bernoulli step in cleanly, single pass. No re-feed needed.\n\nRun it and tell me what the engine prints. If the seventh number comes back as 1/6 we're home.\n\n— Ada"),
    ],
  },
  {
    id: "m2", threadId: "t2",
    senderName: "Grace Hopper", senderEmail: "grace@navy.mil",
    from: "Grace Hopper <grace@navy.mil>", to: me,
    subject: "Compiler notes + the moth",
    snippet: "The nanoseconds add up faster than you'd think. Also: found an actual bug in panel F, taped it to the log.",
    date: "Tue, 09 Jun 2026 08:10:00 +0000", time: "8:10",
    labelIds: ["INBOX", "UNREAD"], isRead: false, isStarred: false,
    status: "inbox", labels: ["Updates"], hasAttachment: false, draftId: null,
    thread: [
      t("Grace Hopper", "grace@navy.mil", "Today 8:10", "Two things.\n\nOne: the compiler pass is clean — but remind the team that a nanosecond is about a foot of wire; the latency adds up faster than anyone expects once you chain the calls.\n\nTwo: we found an actual moth in panel F, relay 70. I've taped it to the logbook. First genuine case of a bug being debugged.\n\n— GH"),
    ],
  },
  {
    id: "m3", threadId: "t3",
    senderName: "Katherine Johnson", senderEmail: "k.johnson@nasa.gov",
    from: "Katherine Johnson <k.johnson@nasa.gov>", to: me,
    subject: "Trajectory check before the launch window",
    snippet: "Re-ran the numbers by hand. The capsule's splashdown point is good to three decimals — worked sheet attached.",
    date: "Mon, 08 Jun 2026 16:40:00 +0000", time: "Jun 8",
    labelIds: ["INBOX", "STARRED"], isRead: true, isStarred: true,
    status: "inbox", labels: ["Updates"], hasAttachment: true, draftId: null,
    thread: [
      t("Katherine Johnson", "k.johnson@nasa.gov", "Jun 8 16:40", "I re-ran the re-entry numbers by hand to check the machine's output. The capsule's splashdown point is good to three decimals — well inside the recovery radius.\n\nWorked sheet attached. Have the team verify line 12 before the window opens; that's where the machine and I disagreed by a digit."),
    ],
  },
  {
    id: "m4", threadId: "t4",
    senderName: "Margaret Hamilton", senderEmail: "mh@mit.edu",
    from: "Margaret Hamilton <mh@mit.edu>", to: me,
    subject: "Priority display: error-handling spec",
    snippet: "Added the recovery routine so a checklist error during landing won't dump the whole guidance program.",
    date: "Mon, 08 Jun 2026 11:15:00 +0000", time: "Jun 8",
    labelIds: ["INBOX", "UNREAD"], isRead: false, isStarred: false,
    status: "inbox", labels: ["Forums"], hasAttachment: false, draftId: null,
    thread: [
      t("Margaret Hamilton", "mh@mit.edu", "Jun 8 11:15", "Spec'd the priority-display recovery routine. If a checklist error fires during the landing phase, the system sheds low-priority tasks instead of dumping the whole guidance program.\n\nDraft is in the shared folder for review. The key idea: software should be in charge, and it should know what to do when the astronaut asks it to do too much at once."),
    ],
  },
  {
    id: "m5", threadId: "t5",
    senderName: "Hedy Lamarr", senderEmail: "hedy@frequency.io",
    from: "Hedy Lamarr <hedy@frequency.io>", to: me,
    subject: "Frequency hopping — patent draft ready",
    snippet: "Synchronised hopping across 88 frequencies makes the control signal almost impossible to jam. Let's file.",
    date: "Sun, 07 Jun 2026 14:02:00 +0000", time: "Jun 7",
    labelIds: ["INBOX"], isRead: true, isStarred: false,
    status: "inbox", labels: ["Social"], hasAttachment: true, draftId: null,
    thread: [
      t("Hedy Lamarr", "hedy@frequency.io", "Jun 7 14:02", "The patent draft for the frequency-hopping scheme is ready for your eyes. Synchronised hopping across 88 frequencies — one for each key on a piano — makes the control signal almost impossible to jam.\n\nLet's file before the month is out. The torpedo guidance application writes itself."),
    ],
  },
  {
    id: "m6", threadId: "t6",
    senderName: "Alan Turing", senderEmail: "turing@bletchley.uk",
    from: "Alan Turing <turing@bletchley.uk>", to: me,
    subject: "Re: the imitation question",
    snippet: "Postpone the philosophy for the staff meeting. The machine decrypted the full traffic set in under an hour.",
    date: "Sat, 06 Jun 2026 19:30:00 +0000", time: "Jun 6",
    labelIds: ["INBOX"], isRead: true, isStarred: false,
    status: "inbox", labels: ["Forums"], hasAttachment: false, draftId: null,
    thread: [
      t("You", me, "Jun 6 18:55", "Quick one before tomorrow — do you want the 'can machines think?' framing in the deck, or is that going to derail the budget conversation?"),
      t("Alan Turing", "turing@bletchley.uk", "Jun 6 19:30", "Postpone the philosophy for the staff meeting. The practical headline today: the machine decrypted the full traffic set in under an hour.\n\nWe should be talking about scaling the bombe count, not whether it can think. Lead with the hour. — A"),
    ],
  },
  {
    id: "m7", threadId: "t7",
    senderName: "VibeMail", senderEmail: "team@vibemail.app",
    from: "VibeMail <team@vibemail.app>", to: me,
    subject: "Welcome to VibeMail Glass",
    snippet: "Your mailbox is frosted, fast, and entirely monospaced. Press cmd-k anywhere to search.",
    date: "Fri, 05 Jun 2026 10:00:00 +0000", time: "Jun 5",
    labelIds: ["INBOX"], isRead: true, isStarred: false,
    status: "inbox", labels: ["Updates"], hasAttachment: false, draftId: null,
    thread: [
      t("VibeMail", "team@vibemail.app", "Jun 5 10:00", "Welcome aboard.\n\nA few things to try:\n  [+] Press cmd-k anywhere to search.\n  [+] Click the dot at the left of a row to mark read / unread without opening it.\n  [+] Hit Compose (top-left) to write a new message.\n\nEverything here is glass and monospace, on purpose."),
    ],
  },
  {
    id: "m8", threadId: "t8",
    senderName: "Radia Perlman", senderEmail: "radia@spanning.net",
    from: "Radia Perlman <radia@spanning.net>", to: me,
    subject: "Spanning tree — loop-free topology",
    snippet: "The protocol guarantees exactly one active path between any two bridges. No loops, no broadcast storms.",
    date: "Thu, 04 Jun 2026 13:20:00 +0000", time: "Jun 4",
    labelIds: ["INBOX", "UNREAD"], isRead: false, isStarred: false,
    status: "inbox", labels: ["Social"], hasAttachment: false, draftId: null,
    thread: [
      t("Radia Perlman", "radia@spanning.net", "Jun 4 13:20", "The spanning-tree protocol guarantees exactly one active path between any two bridges — loop-free, no broadcast storms.\n\nI wrote the spec as an algorithm and, since you asked, also as a poem. Both attached. The algorithm is shorter."),
    ],
  },
  {
    id: "m9", threadId: "t9",
    senderName: "Tim Berners-Lee", senderEmail: "tim@w3.org",
    from: "Tim Berners-Lee <tim@w3.org>", to: me,
    subject: "Re: hyperlinks proposal",
    snippet: "Vague, but exciting. Let's keep it decentralised — no permission needed to link to anything.",
    date: "Wed, 03 Jun 2026 09:48:00 +0000", time: "Jun 3",
    labelIds: ["INBOX"], isRead: true, isStarred: false,
    status: "inbox", labels: ["Forums"], hasAttachment: false, draftId: null,
    thread: [
      t("Tim Berners-Lee", "tim@w3.org", "Jun 3 09:48", "Re-reading the proposal: vague, but exciting. The one principle I won't compromise on — keep it decentralised. No permission needed to link to anything, from anything.\n\nIf we get that right, the rest is detail."),
    ],
  },
  {
    id: "m10", threadId: "t10",
    senderName: "Claude Shannon", senderEmail: "shannon@bell-labs.com",
    from: "Claude Shannon <shannon@bell-labs.com>", to: me,
    subject: "Information theory — entropy draft",
    snippet: "Entropy quantifies uncertainty. One bit is all it takes to answer a yes/no question, assuming equal probability.",
    date: "Tue, 02 Jun 2026 14:55:00 +0000", time: "Jun 2",
    labelIds: ["INBOX", "UNREAD", "STARRED"], isRead: false, isStarred: true,
    status: "inbox", labels: ["Forums"], hasAttachment: true, draftId: null,
    thread: [
      t("Claude Shannon", "shannon@bell-labs.com", "Jun 2 14:55", "Draft attached. The central idea: entropy — H = -Σ p log p — quantifies the uncertainty in a message source. One bit is exactly the information needed to resolve a fair coin flip.\n\nThe noisy-channel theorem follows directly. I'll present Thursday; push back on anything that feels hand-wavy."),
    ],
  },
  {
    id: "m11", threadId: "t11",
    senderName: "Linus Torvalds", senderEmail: "linus@kernel.org",
    from: "Linus Torvalds <linus@kernel.org>", to: me,
    subject: "Re: patch review — block layer",
    snippet: "The patch is fine. The commit message is not. Explain *why* you made the change, not *what* changed.",
    date: "Mon, 01 Jun 2026 18:22:00 +0000", time: "Jun 1",
    labelIds: ["INBOX"], isRead: true, isStarred: false,
    status: "inbox", labels: ["Updates"], hasAttachment: false, draftId: null,
    thread: [
      t("You", me, "Jun 1 17:45", "Patch attached. Moves the bio allocation out of the hot path. Cuts p99 latency by ~12% on the test rig."),
      t("Linus Torvalds", "linus@kernel.org", "Jun 1 18:22", "The patch is fine. The commit message is not.\n\nExplain *why* you made the change, not *what* changed. The diff already shows what changed. I want to know: why was the allocation in the hot path in the first place, and why is now the right time to move it?\n\nFix the message, re-send."),
    ],
  },
  {
    id: "m12", threadId: "t12",
    senderName: "Frances Allen", senderEmail: "fran@compilers.ibm",
    from: "Frances Allen <fran@compilers.ibm>", to: me,
    subject: "Loop optimisation — flow analysis notes",
    snippet: "Data-flow analysis across basic blocks gives the compiler enough context to hoist the invariant out of the loop entirely.",
    date: "Sun, 31 May 2026 10:30:00 +0000", time: "May 31",
    labelIds: ["INBOX", "UNREAD"], isRead: false, isStarred: false,
    status: "inbox", labels: ["Forums"], hasAttachment: true, draftId: null,
    thread: [
      t("Frances Allen", "fran@compilers.ibm", "May 31 10:30", "Sharing my flow-analysis notes. The key insight: if you build a control-flow graph across basic blocks and compute reaching definitions, the compiler can see that the load inside the loop is invariant and hoist it cleanly.\n\nSaves a memory round-trip per iteration. On tight loops that's real."),
    ],
  },
  {
    id: "m13", threadId: "t13",
    senderName: "Dennis Ritchie", senderEmail: "dmr@bell-labs.com",
    from: "Dennis Ritchie <dmr@bell-labs.com>", to: me,
    subject: "C — why pointers are not just integers",
    snippet: "A pointer has provenance. Casting it to int and back is undefined behaviour, even if the sizes match on every machine we ship today.",
    date: "Sat, 30 May 2026 16:10:00 +0000", time: "May 30",
    labelIds: ["INBOX"], isRead: true, isStarred: true,
    status: "inbox", labels: ["Forums"], hasAttachment: false, draftId: null,
    thread: [
      t("Dennis Ritchie", "dmr@bell-labs.com", "May 30 16:10", "A pointer has provenance — it carries information about the object it was derived from. Casting it to int and back is technically undefined behaviour, even if the bit representation survives on every machine we ship today.\n\nThe compiler is allowed to assume you won't do that. When you do, interesting things happen. I should have put this in the rationale. I didn't."),
    ],
  },
  {
    id: "m14", threadId: "t14",
    senderName: "Barbara Liskov", senderEmail: "liskov@csail.mit.edu",
    from: "Barbara Liskov <liskov@csail.mit.edu>", to: me,
    subject: "Substitution principle — formal statement",
    snippet: "If S is a subtype of T, any program that works with T must work with S — without knowing the difference.",
    date: "Fri, 29 May 2026 11:45:00 +0000", time: "May 29",
    labelIds: ["INBOX", "UNREAD"], isRead: false, isStarred: false,
    status: "inbox", labels: ["Updates"], hasAttachment: false, draftId: null,
    thread: [
      t("Barbara Liskov", "liskov@csail.mit.edu", "May 29 11:45", "Formal statement of the substitution principle: if S is a subtype of T, any program that is correct when written against T must remain correct when S is used in its place — without the caller knowing the substitution occurred.\n\nViolations always involve weakened preconditions or strengthened postconditions on overriding methods. Worth checking your hierarchy against this tonight."),
    ],
  },
  {
    id: "m15", threadId: "t15",
    senderName: "Ken Thompson", senderEmail: "ken@bell-labs.com",
    from: "Ken Thompson <ken@bell-labs.com>", to: me,
    subject: "Trusting trust — the compiler backdoor",
    snippet: "You can't trust code you didn't write yourself. And you can't verify the compiler without a compiler you already trust.",
    date: "Thu, 28 May 2026 09:00:00 +0000", time: "May 28",
    labelIds: ["INBOX", "STARRED"], isRead: true, isStarred: true,
    status: "inbox", labels: ["Forums"], hasAttachment: false, draftId: null,
    thread: [
      t("Ken Thompson", "ken@bell-labs.com", "May 28 09:00", "Here is the crux: you can't trust code you didn't write yourself. And you can't fully verify a compiler without using a compiler you already trust.\n\nA compiler that inserts a backdoor into login, and also inserts code to propagate that backdoor into any future compiler it compiles, will survive even a clean-source audit. The Trojan is in the binary, not the source.\n\nThink about what that means for your supply chain."),
    ],
  },
  {
    id: "m16", threadId: "t16",
    senderName: "Guido van Rossum", senderEmail: "guido@python.org",
    from: "Guido van Rossum <guido@python.org>", to: me,
    subject: "Re: the walrus operator",
    snippet: "It's := not =:. I know. The colon placement is deliberate — keeps it visually distinct from assignment.",
    date: "Wed, 27 May 2026 15:33:00 +0000", time: "May 27",
    labelIds: ["INBOX", "UNREAD"], isRead: false, isStarred: false,
    status: "inbox", labels: ["Social"], hasAttachment: false, draftId: null,
    thread: [
      t("You", me, "May 27 14:55", "Quick question — was := chosen specifically to avoid confusion with ==, or was it just the closest ASCII walrus?"),
      t("Guido van Rossum", "guido@python.org", "May 27 15:33", "It's := not =:. I know the walrus faces the wrong way — the colon placement is deliberate. := is already used as assignment in Pascal and Algol, which makes it feel like 'assignment but different'. =: would read like a return or an arrow. We argued about this for three PEP revisions.\n\nThe walrus won because it's memorable and it doesn't collide with anything else in the grammar."),
    ],
  },

  // ── ARCHIVED ──────────────────────────────────────────────────────────
  {
    id: "a1", threadId: "t17",
    senderName: "Vint Cerf", senderEmail: "vint@icann.org",
    from: "Vint Cerf <vint@icann.org>", to: me,
    subject: "TCP — why we split it from IP",
    snippet: "Reliability and routing are separate concerns. Mixing them into one protocol kept tripping us up.",
    date: "Tue, 26 May 2026 12:00:00 +0000", time: "May 26",
    labelIds: [], isRead: true, isStarred: false,
    status: "archived", labels: ["Forums"], hasAttachment: false, draftId: null,
    thread: [
      t("Vint Cerf", "vint@icann.org", "May 26 12:00", "Reliability and routing are genuinely separate concerns. Every time we tried to handle them in a single protocol layer we'd end up with edge cases where a routing decision invalidated a reliability guarantee.\n\nSplitting TCP from IP let each layer do one thing cleanly. Everything else in the internet architecture follows from that separation."),
    ],
  },

  // ── SENT ──────────────────────────────────────────────────────────────
  {
    id: "s1", threadId: "t18",
    senderName: "You", senderEmail: me,
    from: "You <you@vibemail.app>", to: "ada@analytical.eng",
    subject: "Engine run scheduled — Thursday 14:00",
    snippet: "Booked the engine for Thursday. Bring the revised deck; I'll have the hopper cleared and the log ready.",
    date: "Tue, 09 Jun 2026 10:05:00 +0000", time: "10:05",
    labelIds: ["SENT"], isRead: true, isStarred: false,
    status: "sent", labels: [], hasAttachment: false, draftId: null,
    thread: [
      t("You", me, "Today 10:05", "Booked the engine for Thursday 14:00. Bring the revised deck; I'll have the hopper cleared and the log ready to record whatever it prints.\n\nFingers crossed for 1/6."),
    ],
  },
  {
    id: "s2", threadId: "t19",
    senderName: "You", senderEmail: me,
    from: "You <you@vibemail.app>", to: "k.johnson@nasa.gov",
    subject: "Re: Trajectory check before the launch window",
    snippet: "Got it — line 12 verified, the team agrees with your hand figure. Cleared for the window.",
    date: "Mon, 08 Jun 2026 17:30:00 +0000", time: "Jun 8",
    labelIds: ["SENT"], isRead: true, isStarred: false,
    status: "sent", labels: [], hasAttachment: false, draftId: null,
    thread: [
      t("You", me, "Jun 8 17:30", "Got it — line 12 verified. The team agrees with your hand figure over the machine's. Cleared for the window. Thank you for catching the digit."),
    ],
  },
  {
    id: "s3", threadId: "t20",
    senderName: "You", senderEmail: me,
    from: "You <you@vibemail.app>", to: "team@vibemail.app",
    subject: "Feedback: cmd-k is excellent",
    snippet: "Just wanted to say the search is fast and the glass is gorgeous. One ask: keyboard nav for the list.",
    date: "Fri, 05 Jun 2026 12:11:00 +0000", time: "Jun 5",
    labelIds: ["SENT"], isRead: true, isStarred: false,
    status: "sent", labels: [], hasAttachment: false, draftId: null,
    thread: [
      t("You", me, "Jun 5 12:11", "Just wanted to say: search is fast and the glass is gorgeous. One ask — keyboard navigation for the message list (j/k to move, enter to open). Would make the whole thing fly."),
    ],
  },

  // ── DRAFT ─────────────────────────────────────────────────────────────
  {
    id: "d1", threadId: "t21",
    senderName: "You", senderEmail: me,
    from: "You <you@vibemail.app>", to: "grace@navy.mil",
    subject: "Re: Compiler notes + the moth",
    snippet: "Framing the moth — literally. Also, on the nanosecond demo for the recruits…",
    date: "Tue, 09 Jun 2026 08:40:00 +0000", time: "8:40",
    labelIds: ["DRAFT"], isRead: true, isStarred: false,
    status: "draft", labels: [], hasAttachment: false, draftId: "r-9a3f2",
    thread: [
      t("You", me, "Draft", "Framing the moth — literally, putting it behind glass for the lobby.\n\nOn the nanosecond demo for the recruits: should we hand out the actual foot-long wires, or"),
    ],
  },

  // ── TRASH ─────────────────────────────────────────────────────────────
  {
    id: "x1", threadId: "t22",
    senderName: "Promotions", senderEmail: "deals@oldnews.example",
    from: "Promotions <deals@oldnews.example>", to: me,
    subject: "Your punch cards are 40% off this week only",
    snippet: "Stock up on Jacquard-compatible card stock. Limited run. Unsubscribe at the bottom, as always.",
    date: "Wed, 03 Jun 2026 06:00:00 +0000", time: "Jun 3",
    labelIds: ["TRASH"], isRead: true, isStarred: false,
    status: "trash", labels: ["Promotions"], hasAttachment: false, draftId: null,
    thread: [
      t("Promotions", "deals@oldnews.example", "Jun 3 06:00", "Stock up on Jacquard-compatible card stock — 40% off this week only. Limited run.\n\nUnsubscribe at the bottom, as always."),
    ],
  },
];

// Labels that exist in the mailbox (drive the sidebar + chips).
export const LABELS: Label[] = ["Social", "Updates", "Forums", "Shopping", "Promotions"];
