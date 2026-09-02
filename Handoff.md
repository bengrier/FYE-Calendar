# Handoff — First-Year Engineering Calendar

Written 2026-08-07, extended 2026-08-08. Read this with [README.md](README.md),
which covers how to run the app and how the code is laid out. This file covers
what state the work is in, what is deliberately the way it is, and what is still
open.

> **2026-08-08 — there is a server now, and this is the current design.**
> Cloudflare Pages with Functions, D1 and R2, and Cloudflare Access for approver
> login. A student submits from the site and it lands in a shared queue; a
> reviewer signs in, approves, and it is live. No downloads, no email relay, no
> editing code to publish. Written up at
> [the bottom](#the-server-pass-2026-08-08).
>
> **2026-08-10 — it is deployed and working**, at
> <https://calendar.fyetools.com>, with reviewers signing in at
> <https://fye-calendar.pages.dev/review>. Every path has been exercised against
> the live stack: submit, upload, queue, approve, publish, recurrence. What that
> took, and the four places the plan was wrong, is at
> [the very bottom](#the-deployment-pass-2026-08-10). Changes made since then
> are logged under [Since deployment](#since-deployment).

<details>
<summary>Three earlier designs, all superseded. Kept because each records why
an approach that looks obvious does not work, and somebody will propose one of
them again.</summary>

> **The functionality pass.** The screens looked finished but mostly did not do
> anything — the submit form read none of its own fields, review decisions
> changed nothing, and there was no search, no way to get an event into your own
> calendar, and no way to link to one. That pass wired them up against
> localStorage. [Written up below](#the-functionality-pass-2026-08-08).

> **Microsoft Forms.** The submit form handed off to the office's Microsoft Form
> so responses landed in SharePoint. Solved where submissions go; left publishing
> as hand-edited JavaScript, and brought a tenant dependency.
> [Written up below](#the-microsoft-forms-pass-2026-08-08). The reasoning about
> what is and is not possible against Forms is the part still worth having.

> **Submissions as links.** Each submission encoded itself into a URL the
> submitter emailed in; the queue decoded it, and approving produced a
> ready-made `events.js` to drop into the repo. Needed nothing at all, which was
> its appeal — but submissions arrived in one inbox, the flyer had to travel as
> an attachment, and pressing Submit did not feel like submitting.
> [Written up below](#the-link-based-pass-2026-08-08).

</details>

## Where it lives

| | |
| --- | --- |
| Repo | <https://github.com/bengrier/FYE-Calendar> (public) |
| Live | <https://calendar.fyetools.com> — Cloudflare Pages + Functions + D1 + R2, branch `cloudflare-backend` |
| Reviewers | <https://fye-calendar.pages.dev/review> — a second address on purpose; [why](#the-deployment-pass-2026-08-10) |
| Taken down | <https://bengrier.github.io/FYE-Calendar/> — GitHub Pages, the old static, email-based version. Disabled 2026-08-11; the address 404s. Its last state is the tag `static-calendar-final`. |
| Accounts | GitHub and Cloudflare are both Ben Grier's personal accounts, and the domain is his at Hover — see [the open item](#the-hosting-is-personal-and-that-is-now-a-decision) |
| Origin | Implemented from the Claude Design prototype `Community Calendar.dc.html` (project `969b693a-9fb3-4ad4-ae08-0e5ed698d1f3`), on the Broadsheet design system |

Scripts are classic (non-module), which is why there is still no bundler and no
build step. They were that way so the page could also be opened straight off the
filesystem; the server pass ended that, but the simplicity was worth keeping.

## State

This is the live calendar: submissions go straight into a database, approvers
sign in, approving publishes immediately. Deployed 2026-08-10 and exercised end
to end against the real stack.

There is one calendar now, and one version of it in the repo. The old static,
email-based site stopped being served on 2026-08-11, when GitHub Pages was
disabled and <https://bengrier.github.io/FYE-Calendar/> began returning 404;
`main` was fast-forwarded to this branch the same day, so the default branch is
the calendar that actually exists. Nothing was rewritten or deleted — the
fast-forward was clean because `main` was a direct ancestor, and the old site's
last state is tagged `static-calendar-final` if it is ever wanted back.

**`main` and `cloudflare-backend` are the same commit, and staying in step is
manual.** Commit to one and the other is behind until it is pushed there too.
Deploys are unaffected either way: `--branch cloudflare-backend` is a label
Cloudflare matches against the project's production branch, not a git operation,
so it publishes whatever is in the working tree no matter which branch is
checked out. That is the trap — the branch name in the deploy command says
nothing about what is being deployed.

**Deploying is a push to `main`** as of 2026-08-11, via GitHub Actions, and the
database is backed up weekly by the same route. Both were run against the real
stack the day they were written and both work — see
[the automation pass](#2026-08-11--deploys-and-backups-stopped-depending-on-one-person).
`npx wrangler pages deploy` still works by hand and is what the workflow runs.

Working tree clean as of writing.

### A trap worth knowing about, if you edit a flyer PDF again

The first attempt at the Peru PDF used PyMuPDF's `replace_image`. It inserted the
corrected artwork but **left the original image in the file** — two embedded
images, the old one still carrying the real addresses, not displayed but
extractable by anyone who downloaded it. `garbage=4` on save did not collect it.

The PDF is now rebuilt from scratch instead, which is the reliable way:

```python
import fitz
doc = fitz.open()
page = doc.new_page(width=961, height=540)   # the original page size
page.insert_image(page.rect, filename="peru-fixed.jpg")
doc.save("flyers/peru.pdf", garbage=4, deflate=True)
```

Always verify afterwards — this check is the point, not a formality:

```python
import fitz
d = fitz.open("flyers/peru.pdf")
print(d[0].get_images(full=True))   # must list exactly ONE image
```

All three PDFs currently hold exactly one image each.

## What was done, and why

### Implementation

The prototype was a Claude Design `.dc.html` — a template plus a `DCLogic` class
run by a React-based design runtime. It was reimplemented as plain HTML/CSS/JS.
Three deliberate departures from the prototype, all of them fixes:

- The countdown read `Next event in 7`; it now says `7s`.
- "Open the flyer page" pointed at `#` for events with no flyer. The link is now
  omitted rather than dead.
- The generated stage page for flyer-less events used raw `vw` font sizes that
  became unreadable on a phone. They are `clamp()`ed, identical at desktop width.

### Rendering

The showcase ticks five times a second, so rendering is targeted, never wholesale:

- the grid rebuilds only when the view, anchor date or filters change;
- the filter selects are built once then patched, so they keep focus on change;
- the submit form and the reviewer's feedback box are built once and patched in
  place, so typed input is never thrown away by a re-render.

If you add state, follow that grain — a naive full re-render will eat keystrokes.

### Real date, and empty views

`CONFIG.today` is the real current date. That exposed a case the pinned demo date
hid: with nothing in the current view, the old code put `EVENTS[0]` — some other
week's flyer — on the stage above an empty grid. Now an empty view collapses the
showcase to one line that says why ("Nothing scheduled this week." vs "Nothing
here matches that filter.") and offers the way out — **Clear the filters**, or
**Next event · \<date\>** when the calendar still holds something later.

### Dates

Events were shifted **+119 days (exactly 17 weeks)** from April–May to
**Aug 3 – Sep 11, 2026**, straddling today so the calendar opens on a live week.
A whole number of weeks was chosen so every weekday is preserved — Free Cookie
Friday stays Friday, Design-Build-Fly stays Tuesday, which matters because those
days are printed on the posters.

Knock-on changes made at the same time:

- The seven date-suffixed ids encoded the old day of month (`aero-14`,
  `cookie-17`, …) and were renumbered to match (`aero-11`, `cookie-14`, …),
  including their `CUSTOM_BY_EVENT` keys.
- The Peru blurb's "Early application deadline May 1" became "Fall application
  deadline September 15", which is the deadline printed on that flyer.
- The two queued submissions' prose dates moved with everything else.

To shift again, note the constraint: **use a multiple of 7 days**, renumber the
date-suffixed ids, and re-check any prose that names a date.

### Flyer editing

Only **peru** and **aiaa** ever contained email addresses; ispe, major and cookie
have none. All five PDFs turned out to be single embedded raster images with no
text layer at all, so this is pixel work, not text replacement.

Replacements made:

| Flyer | Was | Now |
| --- | --- | --- |
| `aiaa.png` | `CSURAMAERO@GMAIL.COM` | `RAMAERO@EXAMPLE.COM` |
| `peru.png` / `.pdf` | `THOMAS.SILLER@COLOSTATE.EDU` | `PROGRAM.LEAD@EXAMPLE.COM` |
| `peru.png` / `.pdf` | `LUCY.KRIPS@COLOSTATE.EDU` | `STUDY.ABROAD@EXAMPLE.COM` |

Method, if more of this is needed: measure the text block off the original with a
per-row ink profile (gives exact glyph rows, baseline, rule position and colour),
clear the block with the sampled background colour, then redraw with a system
font sized so its cap height matches the original's. Both blocks are set in
capitals, which is why substitute fonts pass — Futura for the Peru flyer's
geometric sans, Arial Bold for the AIAA flyer. Peru was edited at the PDF's own
resolution (2000×1125) and `flyers/peru.png` regenerated from it, so image and
PDF stay in step.

## Open items

1. ~~**Poster dates now contradict the calendar.**~~ The Major Declaration flyer
   reads **MONDAY, MAY 4** against an Aug 31 event, and the ISPE flyer **April
   30th** against Aug 27. **Closed as won't-fix, 2026-08-08:** every seeded event
   is placeholder content that gets deleted before launch, so repainting posters
   for events that will not ship is wasted work. If any of these flyers survives
   into the real calendar, this comes back — the editing method above still works.
2. ~~**Season-inconsistent copy.**~~ Same call, same reason: placeholder prose.
3. **QR codes are still live.** The ISPE flyer's GroupMe and RSVP codes and the
   AIAA flyer's Instagram code were never touched — only emails were, as asked.
   They are publicly fetchable on the live site. The ISPE flyer also names a
   speaker. **Deliberately left, 2026-08-08.** Worth revisiting before launch if
   these flyers stay, since it is real people's contact channels on a public site.

   **Updated 2026-08-11: this does not resolve itself, which is what was
   assumed.** The standing plan was that the placeholders get deleted before
   launch and take this with them. They will not. The flyers are committed
   static files in `public/flyers/`, so `DELETE FROM events WHERE temporary = 1`
   removes every row that displays them and leaves all eight files served at
   `/flyers/…`, indefinitely, with nothing on the calendar pointing at them and
   nothing in the retention sweep looking for them. Unreferenced is not
   unreachable. Clearing the placeholders is therefore two steps, and README now
   carries both — the second is a `git rm`.
4. ~~**The seeded events are placeholder content.**~~ Still true, and now said
   out loud — see [the placeholder flag](#the-seeded-events-say-they-are-seeded).
5. ~~**Nothing is emailed.**~~ Nothing in the interface claims to send mail. The
   submit form and **Request changes** both compose a message and hand it to the
   sender's own mail client, which is honest and needs no server.
6. ~~**The review queue is orphaned.**~~ Closed by the link-based pass: it is fed
   again, by submission links, and it is where publishing happens.

### Still open

~~**Deploys are direct uploads, not pushes.**~~ **Closed 2026-08-11** by
`.github/workflows/deploy.yml`, which runs the same CLI upload on a push to
`main`. Cloudflare's own Git integration is still unavailable for the reason it
always was — Connect-to-Git builds a Worker, and a Worker cannot run
`functions/` — but that turned out not to be the only way to get push-to-deploy,
and converting the app to a Worker was never worth doing to obtain it. The
workflow needs two repository secrets before it can work; see
[the automation pass](#2026-08-11--deploys-and-backups-stopped-depending-on-one-person).

**There are 23 placeholder events and one unflagged event on the live
calendar.** A real export on 2026-08-11 found *four* unflagged, not the one
this file had claimed since deployment:

| | |
| --- | --- |
| 23 | seeded placeholders, `temporary = 1`, announce themselves — still there |
| 3 | `Ben's Test Event` — the weekly-repeat deployment test. **Deleted 2026-08-11** |
| 1 | `Robotics Club: Line-Follower Sprint` — the seeded submission `p1`, approved. Still there |

The three test rows and their nine `event_tags` are gone, verified against the
live API: 24 events served, none of them a test. The submission row
`s-msp3xnjv-4hc1lb` was deliberately **not** deleted — nothing in this project
deletes a submission row — so its R2 flyer is now an approved submission's
artwork that no event points at, which is exactly the case the retention sweep
was built to collect. It goes on the first sweep after the settling day, with
no action needed.

The remaining one is the one to know about. **Approving a seeded submission produces
placeholder content that does not announce itself**, because approved events
never carry the `temporary` flag — the flag lives on seeded *events*, and an
approval writes a fresh row. `p2` (`Women in Computing Coffee Hour`) is still
sitting in the live queue and will do exactly the same thing to whoever
approves it. So the count of unflagged placeholder events grows every time
somebody exercises the queue with the seed data, and README's `DELETE FROM
events WHERE temporary = 1` will never catch any of them.

**Deleting the placeholders leaves their flyers on the live site.** README's
delete command clears database rows; the seeded artwork is committed static
files in `public/flyers/`, which nothing in the database references by key and
the retention sweep never walks. This is why open item 3 below is not
self-resolving, which is what it was assumed to be.

**`CONFIG.office.email` is empty.** One line, and it only affects the To: field
on a reviewer's *Request changes* reply. Nothing depends on it any more.

**Two addresses, one of which Access cannot protect.** Reviewers must use the
pages.dev host. `/review` on the custom domain redirects there, so it is handled
rather than merely documented, but it is a consequence of where the DNS lives
and it would go away if `fyetools.com` moved onto Cloudflare.

### The hosting is personal, and that is now a decision

**Decided 2026-08-08: this runs on Ben Grier's own Cloudflare account**, the
same way it already runs on his own GitHub account. That is a reasonable place
to start and a bad place to stay, so it is written down here rather than left to
be discovered.

Since 2026-08-10 there is real data in it, and a third personal account in the
chain: **the domain.** `fyetools.com` is registered at Hover, personally, and
`calendar.fyetools.com` is a CNAME there. The address students are given depends
on a registration renewing.

What it means concretely:

- The events database, the flyer bucket and the list of who may approve events
  all live in one personal Cloudflare account. Nobody else can reach any of it.
- The address depends on a personal Hover account. Nothing in Cloudflare can
  keep the calendar reachable if that lapses.
- If either account is lost — leaving CSU, a forgotten password, an unpaid card
  — the calendar goes down. Since 2026-08-12 it can at least be rebuilt: the
  weekly backup carries the database *and* the uploaded artwork out of the
  account, and README has the procedure. What nobody else has is access to the
  running thing, so recovery means an outage and a rebuild rather than somebody
  simply logging in.

Four things that make that survivable, in the order they were originally worth
doing. The first has since been ruled out, which is why the rest matter more
than they did:

1. ~~**Add a second admin to the Cloudflare account.**~~ **Ruled out
   2026-08-12.** It is not going to happen, so it has stopped being written
   down as the thing most worth doing — a recommendation that gets re-read and
   re-declined every time somebody picks this file up is worse than no
   recommendation, because it makes the rest of the list look optional too.

   What it was buying still has to come from somewhere, and the answer is the
   backup, which is why the backup grew on the same day: it now carries the
   **uploaded flyers as well as the database**, and README has a
   [rebuild procedure](README.md#rebuilding-from-a-backup) for standing the
   whole calendar up on a different account. Before that change a restore would
   have produced every event with its artwork missing, because the D1 dump holds
   a flyer's *key* and R2 holds its bytes.

   Be clear about what this does and does not replace. A second admin is
   *continuity* — somebody else can already reach the running thing. A backup is
   *recovery* — somebody rebuilds it, with an outage in between and a domain
   still pointing at a project they cannot administer. The second is strictly
   worse and is now the plan, deliberately.
2. ~~**Back up the database.**~~ **Done 2026-08-11**, automatic, and since
   2026-08-12 it backs up the flyers too — `.github/workflows/backup.yml`,
   weekly, encrypted, kept 90 days, outside Cloudflare on purpose. **This is now
   the top item on this list rather than the second**, since the one above it
   is not happening.

   Two things still need a human. The `BACKUP_PASSPHRASE` has to exist
   somewhere other than GitHub. And **somebody should do a restore**, which
   matters more now than it did when this was the runner-up: the rebuild
   procedure in README has never been rehearsed, and it is the only thing
   standing between a lost account and a lost calendar. A backup nobody has
   opened is a guess.

   Note that the command this file used to recommend wrote `backup.sql` into
   the repo root, which is a public repository and a file full of student email
   addresses; `.gitignore` now catches that name.
3. **Decide whether the address should be personal.** A CSU-owned hostname
   pointed at the same Pages project would cost nothing technically — it is one
   CNAME — and would take the domain out of the chain entirely.

   **This stopped being hypothetical on 2026-08-21** — see below. It has since
   cleared, but the reason it happened has not gone away.
4. **Write down where the accounts are** and who holds them, somewhere the
   office looks — not only in this file.

None of this blocked deployment. It is what stops a working calendar from having
a single person as its only dependency.

### CSU's own filtering blocked the calendar for ten days

**2026-08-21 to 2026-08-31.** For ten days the calendar was unreachable from
CSU networks — which is to say, unreachable from the only place it is for. The
site was up the whole time, Cloudflare was serving it, and every check from
off-campus passed. It was blocked on the way in.

Two layers, both keyed to the hostname rather than to the address:

- **DNS.** CSU resolvers (129.82.103.79 and its siblings on CSUNET) answered
  `calendar.fyetools.com` with 65.52.200.44, a dead address in a Microsoft
  netblock. The authoritative answer was 172.66.47.82.
- **TLS.** Bypassing DNS and connecting straight to 172.66.47.82 completed the
  TCP handshake and then died during the ClientHello — `curl: (35)`, SNI-based
  RST injection. So fixing only the DNS layer would have left the site reset at
  TLS, looking fixed and still failing.

`fye-calendar.pages.dev` reached the same Cloudflare IPs and worked fine
throughout, which is what proved the block was on the hostname and not on the
address, the route or the host. The likely trigger was that `fyetools.com` was
registered on 2026-07-31 — a newly-registered-domain policy, applied to a
domain with nothing about it to categorise.

**Cleared as of 2026-08-31**, verified from a machine on CSU DNS: querying
129.82.103.79 directly now returns the authoritative Cloudflare answer, and
HTTPS to the custom domain returns 200 rather than resetting. Both layers.

The thing to take from this is not the ten days. It is that a hostname on a
personal domain with no CSU affiliation is a hostname CSU's own filtering has
no reason to trust, and nothing about that has changed — the domain is still
five weeks old, still personal, still uncategorised by whoever CSU actually
buys filtering from. It cleared once. Open item 3 above is the fix that stops
it mattering a second time, and it is better motivated now than when it was
written.

### Deployment is done

2026-08-10. README's "Deploying" is now a record of the real steps rather than a
plan, and it differs from the plan in four places worth knowing before touching
any of it — all four are written up in
[the deployment pass](#the-deployment-pass-2026-08-10).

The GitHub Pages and Cloudflare Pages deployments still run side by side. They
share a repo but not a branch, and nothing points at the old one. (No longer
true as of 2026-08-11 — see
[the old calendar is off the air](#2026-08-11--the-old-calendar-is-off-the-air).
Left as written, because it is the record of the day it describes.)

## Notes for whoever extends this

- `public/js/store.js` is the seam. Its reads are **synchronous on purpose** —
  `app.js` calls them inside render functions — and they answer from a cache
  that `hydrate()` fills. Adding a read means adding it to the cache, not
  awaiting a fetch inside a painter.
- **Two pairs of things have to change together**, or the app will disagree
  with itself:
  - `validateDraft` in `public/js/app.js` and `validateSubmission` in
    `functions/_lib/submission.js`. The first tells someone what is wrong while
    they type; the second decides. If they drift, the form accepts what the
    server refuses.
  - `occurrences` in `public/js/store.js` and in `functions/_lib/submission.js`.
    The first tells the reviewer how many events approving will create; the
    second creates them. A mismatch is a nasty surprise at the moment of
    approval.
- `GROUPS` in `public/js/data.js` and the `kind = 'fixed'` rows in `seed.sql`
  mirror each other, so the server can tell a tag picked off a list from one a
  submitter invented. Change the chips and re-run the seed.
- Filter semantics worth preserving: an event tagged `All disciplines` answers any
  choice in the discipline group (`openToAll` on that group). It is not one of the
  group's `chips`, so it never appears in the filter bar — but the submit form
  offers it as "Open to every discipline" and defaults to it, because a submission
  with no discipline would otherwise vanish under every discipline filter.
- Weeks are Monday-first throughout; day-of-week indexes are `(getDay() + 6) % 7`.
  Dates are whole days in local time, never UTC instants, so an event never slides
  a day across time zones.
- Reel auto-scroll sets `scrollTo({behavior})` from JS rather than CSS
  `scroll-behavior`, so it can honour `prefers-reduced-motion`.
- Assets came from the CSU top-bar reference bundle and the demo event files that
  were in this folder; both were deleted after their contents were copied and
  renamed into `public/assets/csu/` and `public/flyers/`. They are recoverable
  only from commit `aa229a2` onward — the originals are gone from disk.

## The functionality pass, 2026-08-08

### The three things the interface claimed but did not do

**The submit form was a mock.** Not one field was read. "Send for approval" set a
flag and showed the thank-you screen — on a completely empty form — and nothing
reached the review queue. It now holds a draft in state (so a validation failure
can rebuild the form without eating a word of what was typed), validates every
field, and produces a real submission.

**Review decisions were theatre.** Approving removed the card and said "it is on
the calendar now"; it was not. Approving a new custom tag did nothing. A reload
put everything back. Approving now publishes one event per occurrence and makes
approved tags filterable immediately.

**There was no search**, although the submit form told organisers that "students
see these and can search them." There is now, over title, org, place, blurb and
every tag, with words ANDed.

### js/store.js

The new seam. `data.js` stays the read-only seed; `store.js` is the live calendar
— seed plus delta — and everything now reads events, the queue, custom tags and
flyers from it. Only the delta is persisted, so editing `data.js` still changes
what everybody sees and a stale stored copy of a seeded event can never pin
itself in place. Moving to a server means reimplementing `load` and `save`;
every mutation already funnels through them.

`PENDING` in `data.js` gained the fields a submission needs to become an event —
`date`, `start`, `time`, a machine-readable `repeat` — in place of the prose
`when` the reviewer reads, which is now derived.

### Flyer uploads without a server

An uploaded image is downscaled to 1400px and re-encoded as a JPEG data URL
(~20KB), which fits in localStorage and means the reviewer sees the actual
artwork rather than a hatched rectangle. A quota failure retries without the
artwork rather than losing the submission. PDFs cannot be rasterised in the
browser, so only the filename travels.

### Bugs found and fixed along the way

- **A NUL byte in `js/app.js`.** The empty-stage cache key was `"\x00empty:"`,
  not `" empty:"` — almost certainly an artifact of the design-tool export. It
  made `grep` treat the whole file as binary, which is worth knowing if a search
  ever comes back empty on a file you can plainly see the text in.
- **The empty stage went stale.** That same cache key named the view and whether
  a filter was set, but not the anchor date — so stepping from one empty week to
  another left the previous week's "Next event · <date>" sitting on the stage,
  pointing at the wrong day.
- **The month grid and its own count disagreed.** The grid draws whole
  Monday-to-Sunday weeks and so reaches into the months either side, but the
  range was the calendar month, so the toolbar could say "3 events" above four
  visible ones. The month range is now the span actually drawn; the label still
  reads "August 2026" because it is taken from the anchor, not from the
  neighbouring Monday the grid starts on.
- **Week-counting broke across daylight saving.** `(r.to - start) / 86400000`
  subtracts two local midnights, which is an hour out twice a year — enough for
  `Math.ceil` to tip to the wrong number of weeks. Counted off the calendar now,
  via `Date.UTC` of the y/m/d parts.
- **Stepping through events filled the history stack.** Each step pushed an
  entry, so Escape walked back through them one at a time instead of closing.
  Opening an overlay pushes; moving between them replaces.
- **Time of day was offered as a submit-form tag.** It is derived from the start
  hour, so the only thing choosing it by hand could do is contradict the event.
  Removed from the form; still a filter.

### Deliberate calls

- **The slide timer stops** behind any dialog and on a hidden tab, and the
  countdown says "Paused" rather than freezing on a number. Note that some
  embedded preview panes report `document.hidden` permanently, which is why it
  reads "Paused" in one.
- **The draft survives closing the submit overlay** but is cleared once sent.
  Closing to go and check a room number should not cost you the form.
- **A CSU address is required** — `*.colostate.edu`, which admits the
  `rams.colostate.edu` the seeded submitter uses. The office replies to it, so
  anything else is a submission nobody can follow up.
- **`.ics` uses a real VTIMEZONE**, not floating times and not UTC. Floating
  drifts if the phone crosses a time zone over winter break; UTC bakes in
  whichever offset applied the day the file was generated, which silently moves
  any event on the far side of a DST change.
- **Recurrence is capped at 60 occurrences**, and "monthly, same weekday" keeps
  the 2nd Tuesday the 2nd Tuesday, falling back to the 4th in a month with no
  5th.

### Still not real

*(Superseded by the pass below — no mail is sent, but nothing claims it is any
more, and submissions no longer live only in one browser.)*

No mail is sent. Approve, decline and request-changes all say the submitter has
been notified, and that remains the one claim the interface makes that nothing
behind it honours. It is also the one that genuinely needs a server.

Persistence is per-browser. Two people reviewing the same queue do not see each
other's decisions — which is the same statement.

## The Microsoft Forms pass, 2026-08-08

### What was chosen, and what was ruled out

The brief was "cheap and truthful", with submissions landing in SharePoint and
no permissions fight. Three routes were possible and two were rejected:

- **Post to the Microsoft Form from this page.** Not possible. Forms has no
  public submission API; the endpoint its own front end uses is CORS-blocked and
  token-gated, and anything built on it breaks the first time Microsoft changes
  it. This is worth knowing because it looks feasible from the outside.
- **Post to SharePoint via a Power Automate HTTP trigger.** Real, supported, and
  the only route that keeps the whole thing to one click. Rejected on two counts:
  "When an HTTP request is received" is a **premium** connector, so it needs a
  licence somebody has to own; and its URL carries its own SAS signature, which
  would sit in public JS in a public repo for anyone to extract and spam. Worth
  revisiting if the licence ever appears — the abuse risk is a junk queue, not a
  data breach, and a human reads everything anyway.
- **Hand off to a pre-filled Form.** Chosen. Officially supported, no licence,
  nothing secret in the client, nothing public to abuse.

### The handoff

`js/msform.js` builds the pre-filled URL; the submit form is otherwise unchanged
above the flyer field. Pressing the button validates, opens the Form in a new
tab, and shows a screen that is careful **not** to read like a receipt: this page
cannot know whether anyone pressed Submit on Microsoft's page, so it says the
submission is not made until they do, and keeps both the link and their answers
in reach. Nothing is written to the store.

**A trap, if you ever touch that `window.open` call.** Passing `"noopener"` in
the feature string makes it return `null` *on success* — that is the spec, not a
browser quirk — so every successful handoff reported itself as blocked and told
the submitter their browser had stopped it. The opener reference is severed on
the returned window instead, which is the same protection and leaves the return
value meaning what it appears to mean.

**Sentinels, not question ids.** Microsoft names its questions `r1a2b3c…`.
Rather than have somebody read those out of a URL and pair them with fields by
hand — a job that fails silently — the setup asks them to answer each question
with a word the code recognises (`FYE_TITLE`, `FYE_ORG`, …) and paste the
resulting link whole. The substitution is a single regex pass over an alternation
of all ten, so one field's text can never be re-read as another's sentinel. A
link missing any of them is reported by name in the form itself.

**The flyer upload is gone.** A file is the one answer a pre-filled link cannot
carry, so the flyer is attached on the Form. The in-browser downscale-to-data-URL
path went with it; `git show 8451e41` has it if a route-A future wants it back.
Note that a Forms file-upload question requires the responder to be signed in to
the tenant — fine for students, and it is why this is not worth working around.

**Blurbs are capped at 600 characters.** Everything travels inside a URL. This is
comfortably inside any limit and a blurb that long was not being read anyway.
There is no *minimum* beyond non-empty: a 20-character floor was rejecting
perfectly good one-line descriptions, and the office can ask for more in review
far more cheaply than the form can guess.

### The review queue was told the truth

Approve and decline no longer claim the submitter was emailed — they now say, in
as many words, to go and tell them. **Request changes** was the worst of it,
since sending a message is the entire point of the button; it now composes the
reply, quotes the submission underneath, and opens it in the reviewer's own mail
client, where they send it themselves. The overlay opens with a note saying
nothing new arrives here any more.

### The seeded events say they are seeded

`EVENTS` is flagged `temporary` in one pass at the bottom of the array rather
than field-by-field, so real events can simply be added without the flag. Each
placeholder tile carries a **Sample** corner label, its dialog a magenta badge,
and a line above the grid states it — worded from a live count, so it reads
"every event on this calendar" while they are all placeholders, switches to "23
events are placeholder data" as real ones arrive, and removes itself when the
last one goes. Magenta throughout, deliberately: placeholder content should not
look like part of the furniture.

To strip them: empty `EVENTS` and delete the `forEach` under it. *(The flag moved
into `js/events.js` in the pass below and is now written per entry, so stripping
is deleting the flagged entries.)*

### Still not real, honestly this time

*(Superseded by the pass below.)*

No mail is sent from this page, and nothing says it is. The office is notified by
Microsoft when a response arrives, and replies from Outlook.

The review queue's persistence is still per-browser, which no longer matters much
now that nothing lands in it.

## The link-based pass, 2026-08-08

### Why Microsoft Forms came out again, hours after going in

Forms answered the question it was asked — where do submissions land — and left
the harder one untouched. Publishing an approved event still meant opening
`js/data.js`, writing a JavaScript object literal by hand and pushing it, where a
missing comma produces a blank calendar and no error message. That is not
something an office colleague can be asked to do, so the office would have stayed
dependent on one person, which was the thing the whole exercise was meant to fix.

Once you notice that publishing has to be made safe regardless, Forms stops
paying for itself. It brought a tenant dependency, a setup procedure with
fragile question ids, a file-upload question that forced responders to sign in,
and a response workbook nothing could read anyway. Dropping it removed all of
that and cost nothing that was not replaced.

The reasoning about what is and is not possible against Forms is preserved in the
[pass above](#the-microsoft-forms-pass-2026-08-08), because someone will suggest
it again.

### Submissions are links

`js/submission.js`. A submission is packed into short keys, JSON-encoded and
base64url'd into `#review/<payload>` — about 400–900 characters, comfortably
inside every practical limit. The submitter emails that link to the office; the
queue decodes it back into a submission on open.

Details that matter:

- **base64url, not base64.** The standard alphabet's `+` and `/` are legal in a
  fragment but survive copy-paste through mail clients badly, and `=` invites
  something to truncate it.
- **The payload is the submission's identity.** Forwarded mail, a second
  reviewer's reply, a reloaded tab — opening the same link twice must not queue
  the same event twice, and the payload is the only thing genuinely unique per
  submission that is also stable across reloads.
- **The URL is rewritten to plain `#review` on arrival**, so a reload does not
  re-run the decode and the address bar does not carry 900 characters of base64.
  `replaceState` does not fire `hashchange`, so this cannot re-enter.
- **A link that will not decode says so.** Mail clients and chat windows both
  wrap long URLs, so truncation is the likely failure and the reviewer needs to
  tell "this link is broken" from "there is nothing here" — one means ask for it
  again, the other means nobody sent anything.
- **This is not a security boundary.** Anyone who reads the file can hand-craft a
  submission link, which buys them a card in a queue a human still approves. That
  was a deliberate call, not an oversight.

The flyer is the one thing a link cannot carry, which is why the submission goes
out as an email rather than a bare link: it rides along as an attachment. Email
is the file transport every submitter already has, and the office has to put the
artwork in `flyers/` at approval time either way.

### Publishing is a download

`js/events.js` now holds the events and nothing else, and the review queue
regenerates the whole file: approve, press **Download events.js**, drop it into
GitHub through the web UI. No terminal, no git commands, no JavaScript to write.

The serialiser writes one property per line in a fixed order, which is verbose
and deliberate — a new event is then a clean block of added lines in the diff
GitHub shows before committing, and that diff is the last check before students
see anything. **It is byte-identical to the checked-in file for an untouched
calendar**, verified, so a publish never reformats and every real diff is only
the new event.

The download always contains the whole calendar, so replacing the file never
drops events someone else added — unless two people publish from different
browsers at once, where the second commit wins. With one office publishing a few
times a week that is theoretical, and it is the reason to publish soon after
approving rather than banking a week of them.

### What the queue says now

It is fed again, so the copy is true again. The one thing someone could get
wrong is that approving changes their own browser and not the live site, so that
is stated at the top rather than left to be discovered after a reviewer wonders
why students cannot see the event.

### Still not real

No mail is sent from this page. The submit form and **Request changes** both
compose a message and hand it to the sender's own mail client; a human presses
send. That is now a design decision rather than a gap — it needs no server, and
a message a person has read before sending is better than one a machine sent.

The queue is per-browser, which is correct here: a submission link is addressed
to whoever is reviewing it, and the calendar it publishes to is the repo.

## The server pass, 2026-08-08

### Why, after three attempts not to

Three designs came before this, and each failed the same way in a different
place: the page had no credentials, so it could not write anywhere.

- **localStorage** — approvals existed only in the reviewer's own browser.
- **Microsoft Forms** — gave submissions somewhere to land, but publishing was
  still hand-edited JavaScript, and it brought a tenant dependency.
- **Links by email** — needed nothing and worked, but submissions arrived in one
  person's inbox, there was no upload control, and pressing Submit did not feel
  like submitting. That last one is what finally made the case: a design that
  has to be explained every time it is used is not finished.

A small server closes all of it at once, and the free tiers involved are not
close to being strained by a campus calendar.

### The stack, and the one that was rejected

Cloudflare Pages for hosting, Pages Functions for the API, D1 for the database,
R2 for flyers, Access for approver login.

**Pages Functions rather than a standalone Worker**: the API lives in
`functions/` in the same repo, deploys on the same push, and shares the origin —
one deployment instead of two, and no CORS to configure.

**Access is the reason to be on Cloudflare at all.** It gates `/review` and
`/api/admin/*` at the edge against an allow-list, and it means the
security-sensitive part of this build — password hashing, sessions, reset flows
— was deleted rather than written. Free to 50 users.

**Supabase was rejected**: its free tier pauses a project after 7 days of
inactivity. Over winter break that is a silent outage, and the standard fix is a
keep-alive cron, which is a moving part that fails quietly.

### What kept the change small

`js/store.js` exposed **synchronous** reads — `events()` called inside a render
function, `flyerOf()` while painting a card — and making those asynchronous
would have touched every render path in `app.js`.

So they stayed synchronous, answering from an in-memory cache. `hydrate()` fills
that cache and fires the existing `onChange` listeners, and the re-render wiring
that was already there repaints exactly as it did when the data was a local
array. Only the four mutations became asynchronous, because only they have to
wait for a server to agree.

The store's original header comment said swapping localStorage for a server
would mean reimplementing `load` and `save` and nothing else. That turned out to
be very nearly true.

### Things found by testing, not by reading

- **The whole repo was being served.** `pages_build_output_dir = "."` meant
  `wrangler.toml`, `schema.sql` and `seed.sql` were all fetchable on the live
  site. Hence `public/`: only what is in it is served. `.assetsignore` does not
  work for Pages — that was tried first.
- **A Function at `/flyers/` shadowed the bundled artwork**, 404ing every flyer
  committed to the repo. Uploads moved to `/uploads/`; two sources of artwork,
  two path spaces, no collision to reason about.
- **The server called every filter chip a new tag.** `Electrical` and `Workshop`
  were being dropped from approved events, because the server only knew about
  *custom* tags and treated everything else as invented. The filter bar's chips
  are now mirrored into `tags` as `kind = 'fixed'`.
- **A reviewer could not see their own approval.** `/api/events` is cached for a
  minute at the edge, which is right for the hundreds of people reading the
  calendar and wrong for the one who just changed it. Mutations and explicit
  refreshes now bypass it with a unique query string.
- **The empty stage stranded itself on "Loading…"** after a failed fetch,
  because its cache key did not include the load state — the same shape of bug
  the 2026-08-08 pass found when the key omitted the anchor date.
- **`#review` in the URL did not fetch the queue.** Only the button and the
  keyboard shortcut did, so a bookmarked review link opened on an empty queue.

### Deliberate calls

- **The admin API fails closed.** No Access configuration means every admin
  request is refused, never allowed. Local development gets past this only
  through `.dev.vars`, which wrangler does not upload.
- **The Access JWT is verified in the Function too**, not just trusted because
  Access is in front. A deleted rule or a misconfigured application should not
  silently open the queue.
- **Uploads are identified by their bytes**, not by filename or declared type.
- **Validation is duplicated on purpose.** The client copy tells someone what is
  wrong while they type; the server copy decides. They must be changed together
  — `validateDraft` in `public/js/app.js`, `validateSubmission` in
  `functions/_lib/submission.js`.
- **Approve claims the row with the status change inside the `UPDATE`**, so the
  database settles a double-click or two reviewers racing, rather than a
  read-then-write in one of them.
- **A failed refresh leaves what is on screen alone** and says it may be stale.
  A calendar a few minutes old beats one that empties itself because a request
  timed out.

### What this costs

More to maintain than a static site: a database, a bucket, an access policy and
a deployment. The site no longer opens from the filesystem — that was a
deliberate property and a server ends it. The free tiers are generous but not
guaranteed forever. And it runs on a personal Cloudflare account, which is
[its own open item](#the-hosting-is-personal-and-that-is-now-a-decision).

Worth it for what it buys: one shared queue, real logins, working uploads, and
an interface that no longer has to explain itself.

### If you are picking this up cold

The three passes above this one are all superseded — they are kept because each
records why an approach that looks obvious does not work, and somebody will
propose one of them again. This one is the current design, and
[the pass below](#the-deployment-pass-2026-08-10) is what happened when it met
the actual platform. If you only read one thing, read
[Still open](#still-open).

The short version of where the code is:

| | |
| --- | --- |
| Run it | `npx wrangler pages dev public`, after the two `d1 execute` lines in README |
| Data | D1, seeded from `seed.sql`. No localStorage, no content in the JS |
| API | `functions/api/` — `admin/` is behind Cloudflare Access |
| The seam | `public/js/store.js`: synchronous reads from a cache, async mutations |
| Deployed | Live since 2026-08-10. A push to `main` publishes, via `.github/workflows/deploy.yml` |
| Backups | `.github/workflows/backup.yml`, weekly, encrypted. D1 is the only copy of the queue |

## The deployment pass, 2026-08-10

The three passes above end with a design nobody had proved. This one deployed
it. It works, and the four things below are the ones that were not visible from
inside the code.

### The dashboard builds a Worker, and Workers do not run `functions/`

**Connect to Git** in the Cloudflare dashboard no longer creates a Pages
project. It creates a Worker with static assets, which serves `public/`
perfectly and 404s every route under `functions/` — file-based routing is a
Pages feature. The site came up looking finished, with the calendar rendering
nothing and every API call missing.

That failure mode is worth naming because it is quiet: the HTML, the CSS, the
JavaScript and the committed flyers all served correctly, and only the data was
gone. `wrangler pages project list` returning nothing is what actually proves
which of the two you have.

`npx wrangler pages project create` still works, and a Pages project created
that way compiles `functions/` exactly as designed.

The cost of that route is that the project has no Git integration, so deploys
are direct uploads. See [Still open](#still-open) — this is the one part of the
arrangement that is worse than what it replaced. (Closed 2026-08-11: still no
Cloudflare Git integration and still for this reason, but the upload is driven
by GitHub Actions on a push now, so nobody runs it by hand. Left as written,
because the constraint it describes is still true and still the reason.)

### Cloudflare Access needs a zone, and there is no zone

Access was the reason to be on Cloudflare at all. It gates the review queue
against an allow-list at the edge, and it is why no password hashing, session
handling or reset flow was ever written here.

A self-hosted Access application can only be created for a hostname in a zone on
the Cloudflare account. `fyetools.com` is registered at Hover and stays there —
its apex runs a live site that had no reason to be migrated for a calendar — so
there is no zone, and `calendar.fyetools.com` cannot be covered.

Adding only the subdomain as a zone is the obvious escape and is not available:
Cloudflare accepts root domains only, except on paid plans.

What was done instead: Access covers `fye-calendar.pages.dev`, which it does
accept, and reviewers use that address. `/review` on the custom domain redirects
there so nobody has to know. On the custom domain `/api/admin/*` is guarded by
the JWT check in the middleware alone — sound, since that check verifies
signature, audience, issuer and expiry, but one layer where the other hostname
has two.

The middleware was written to survive exactly this — "a request arriving by some
other route is still refused" — which is the difference between a consequence
and a hole.

### `#review` is a fragment, and a fragment never reaches the server

The plan said to protect `/review`. There was no `/review`: the screen is
`#review`, dispatched client-side, and a fragment is never sent to a server. An
Access application pointed at that path would have sat there and never fired.

The queue would still have been safe, because `/api/admin/*` is a real path. But
the login would never have happened. A reviewer opens the page, it loads
unchallenged, its first background fetch for the queue is answered with a
redirect to a login form, and a `fetch` cannot perform an interactive login.
The result is a failure with no way out of it.

`functions/review.js` exists to be that path. It takes the challenge and then
hands the reviewer to the screen, where every subsequent call carries the cookie
Access set.

This is the shape of bug the earlier passes kept finding — a cache key that
omitted the anchor date, a load state left out of another — and it is the same
lesson: the thing that breaks is the case nobody thought was a case.

### Rate limiting is a zone feature too

The plan was a Cloudflare rate limiting rule on `/api/submissions`, and
`functions/api/submissions.js` said so in a comment, with a good argument: at
the edge it costs nothing and cannot be reasoned around.

Rate limiting rules belong to a zone. Same absence, same consequence. So the
limiter is code — fifty accepted submissions per IP per hour, counted in
`submission_attempts`, rows deleted as they age out.

Two deliberate details. It counts **accepted** submissions rather than requests,
so a student fighting a validation message does not spend their allowance on
their own typing, and what is actually being rationed is rows in the office's
queue. And the count is written in the same `batch` as the submission, so it
cannot drift from the queue in either direction.

If `fyetools.com` ever moves onto Cloudflare, this becomes a WAF rule and the
table goes away.

### Shift+R was replaced by something findable

The review queue's only entrance was a keyboard shortcut that nothing on the
page mentioned. It worked for whoever had been told about it, which is a
reasonable thing during development and not a reasonable thing to hand an
office. The footer now carries the link.

Nothing is lost by that link being public: Access refuses everyone not on the
allow-list before the request reaches the app.

### What was verified, and how

Not by reading. Against the live stack: a submission with a flyer and a weekly
repeat stopping after three weeks, reviewed and approved, producing three events
on the calendar. That exercised D1, R2 in both directions, the Access challenge,
the JWT verification, the client and server agreeing on `occurrences`, and the
approve path writing the reviewer's identity.

The rate limiter was tested by driving the counter to its limit and confirming
the 429 on both hostnames, then deleting the test rows.

Left behind deliberately: the 23 placeholder events, which announce themselves,
and one approved test event which does not. Both are in
[Still open](#still-open).

## Since deployment

Small changes made against the live site. Each one is deployed and confirmed
working; the passes above are left as the record of the day they describe.

### 2026-09-01 — shared event links did not work

**Every `#event/<id>` link sent to somebody else opened the plain calendar.**
Copy link has been in the detail dialog since the functionality pass, and the
one thing it is for — sending an event to a friend — is the one case that never
worked. It went unnoticed because it works perfectly for whoever produced the
link: back and forward re-run `applyRoute` against a cache that is already full.

`start()` called `applyRoute()` and only then `S.hydrate()`. Reads from the
store are synchronous, but the store is empty until the first hydrate lands, so
`S.eventById(id)` answered null, the `if (found)` branch never ran, and
`state.detailId` stayed null. The render that followed then called `syncHash`,
which saw no detail state and rewrote the URL **without the fragment** — so the
address stopped naming the event and even a reload could not recover it. Two
failures compounding: one that did not open the event, and one that destroyed
the evidence of which event it was.

The fix keeps the routing rule the file is built on — the hash is written by the
state and read only through `applyRoute` — by giving the state somewhere to put
a link it cannot honour yet. `applyRoute` holds the id in `pendingEventId` when
the calendar has not loaded; `hashForState` returns it last, so the URL goes on
naming the event while it waits; and `resolvePendingEvent`, called from the
store's `onChange` before the render, opens it the moment the events arrive.

Three details that are deliberate:

- **The id is only held while the store has not loaded.** Once it has, an id
  that does not resolve is an event that is genuinely gone — deleted, or swept
  out by retention — and the fragment is dropped rather than waited on forever.
- **`pendingEventId` is last in `hashForState`.** Anything the person does
  during a slow load outranks the link they arrived on, and
  `resolvePendingEvent` bails on `overlayOpen()` for the same reason: opening
  the submit form should not have an event dialog appear over it a moment later.
- **Resolution happens before the render, not after.** The first paint that has
  the events in it is already the one with the dialog open, rather than a frame
  of plain calendar with the event arriving on top of it.

Verified against `wrangler pages dev`: a cold `?cold=1#event/canoe` opens the
event and keeps its fragment; a link to an event in another week moves the
calendar to that week; a link to an id that does not exist falls back to the
calendar and drops the fragment; `#submit` and `#slideshow` are unaffected; and
clicking a card still pushes exactly one history entry, with Back closing the
dialog rather than leaving the site.

### 2026-09-01 — the calendar can be measured

Until now there were no numbers at all. Nobody could say whether anyone used the
slideshow, whether a flyer was worth chasing, or whether the address students
were given was reaching them — which mattered most during the ten days CSU
filtered the site, when the only evidence that it was down was somebody
mentioning it.

The obvious answer, Cloudflare's per-domain Traffic dashboard, is a zone feature.
This is the fourth time that absence has decided a design here, after Access on
the public hostname, rate limiting, and edge beacon injection. So there are two
systems instead, and the split is the point:

- **Cloudflare Web Analytics**, one script tag in `public/index.html`. Page
  views, referrers, countries, browsers. Free, cookieless, and about fifteen
  minutes of work.
- **The calendar's own metrics**, in `functions/_lib/metrics.js`,
  `functions/api/metric.js` and `public/js/metrics.js`, written to Workers
  Analytics Engine and read back with SQL. Nine things the page reports and two
  the server does. Written up in README under
  [Analytics](README.md#analytics).

**The second exists because the first can be switched off by people who are not
us.** The beacon is a third-party script from `static.cloudflareinsights.com`:
ad blockers stop it, Brave stops it, and CSU's filtering would have stopped it
outright in August, silently — the page keeps working and the numbers just go
to zero. Everything in the second system is same-origin, so nothing can drop it
without dropping the calendar too. Read the page-view figure as a floor.

Three decisions worth knowing before changing any of it:

- **The blob positions in `functions/_lib/metrics.js` are the schema.**
  Analytics Engine has no column names — SQL addresses `blob1`, `blob2`,
  `double1` by position — and stored rows cannot be migrated. Inserting a field
  in the middle silently reinterprets three months of history. Add to the end.
- **No search text is recorded**, only how many events matched. A zero is the
  useful number anyway: somebody looking for something the calendar does not
  have. Wanting the terms is a reasonable thing for the office to want, and it
  is a decision for them to make out loud rather than a default to drift into.
  Nothing else identifies anybody either: no IP, no user agent, no cookie, no
  visitor id, so no two data points can be joined into one person.
- **`events_api_miss` is not a visit count**, and is named so it cannot be read
  as one — `/api/events` is edge-cached for a minute, so a busy minute is many
  people and one data point. It is kept because it is the one count no blocker
  can take away, which makes the gap between it and `page` a measure of how much
  the blockers are taking.

`/api/metric` is public, unauthenticated and deliberately unlimited, unlike
`/api/submissions`. The limiter there counts in D1 because a human reads every
row it protects. Nothing here is read by a human or kept past three months, and
counting attempts in D1 would mean a database write on every page view to
prevent a cost that does not exist. The defence is that only the nine names
marked `client` are accepted at all.

Three months is the retention and it is not adjustable, so anything the office
wants to compare year on year has to be pulled out before it ages out. Nothing
does that today.

### 2026-08-11 — the calendar collects its own rubbish

Nothing ever left this calendar. Events accumulated, and under each one that had
an uploaded flyer sat a file in R2 with no end date on it — the only part of
this arrangement with a bill attached to how long it runs rather than to how
much it does. Three things are collected now: **events more than three months
past**, with any flyer whose last event goes with them; **a declined
submission's flyer**, which produced no events and never will; and **uploads no
submission ever claimed**, which turned out to be the largest of the three.
`functions/_lib/retention.js`, written up in README under
[Old events remove themselves](README.md#old-events-remove-themselves).

**The trigger is a write, and that is forced rather than chosen.** Pages
Functions have no scheduled handler — `scheduled` is a Worker feature, and this
is a Pages project precisely because a Worker cannot run `functions/` at all
([why](#the-dashboard-builds-a-worker-and-workers-do-not-run-functions)). Cron
Triggers were the obvious answer and are not available at all here. So
submitting an event and approving one each start a sweep, after their own
response has gone back, claimed through a new `maintenance` table so that at
most one runs every twelve hours however many requests arrive. That is not the
compromise it first looks like: the calendar only grows when somebody adds to
it, so the thing that makes cleanup necessary is the same thing that triggers it.

Three decisions worth knowing before changing any of it:

- **The set of flyers to delete is re-derived from the database every run**, as
  approved submissions holding a flyer that no event points at any more, rather
  than remembered from the run that orphaned them. A sweep that dies between
  deleting the events and deleting the file is then corrected by the next sweep.
  Remembering would have leaked that file permanently, since nothing left in the
  database would ever name it again.
- **The object goes before the pointer to it does.** The other order frees
  nothing if the R2 delete fails and loses the only record of which file to
  free. This way a failure between the two costs a dead string in a submission
  row nobody reads after the decision.
- **A submission is not a candidate until it has been decided for a day.**
  Approve sets the status in one statement and writes the events in the next
  batch, and in between it looks exactly like a submission whose events have all
  aged out — so a sweep started by that very approval could have deleted the
  artwork of the event being published. That is the whole reason for the
  settling period, and it is why the sweep in `approve.js` is started after the
  batch rather than before. The same day of grace does a second job for
  declines: a reviewer who did not mean it has until tomorrow, with the file
  still there to restore.

**A declined submission's flyer goes too**, which was very nearly left as an
open item and should not have been. It produced no events and never will, so it
is cost with no purpose from the moment of the decision, and it is the one kind
of orphan a reviewer creates simply by doing their job. The row stays — "we have
no record of it" is still a bad answer to somebody asking what happened to their
submission, which is why `decline.js` keeps it — but the row is a few hundred
bytes against megabytes of artwork, so only the pointer survives. **Nothing in
this file deletes a submission row.** Every decision the office ever made is
still on record.

What it does leave alone: a flyer with any surviving event (a weekly series
straddling the cutoff keeps its artwork until the last occurrence goes), and a
pending submission's flyer, because it is in the queue and its reviewer has to
see it to decide.

#### The second job: uploads nobody ever submitted

Aged-out events were the smaller half. `POST /api/flyers` stores the bytes and
issues a key *before* the submission that names it exists — it has to, because
the submission names a key that must already be there — so every upload not
followed by an accepted submission leaves an object nothing has ever pointed at.

That is not an edge case. The client uploads and *then* posts, so a server-side
validation refusal, a 429 from the rate limiter, a dropped connection or a
closed tab each leave one behind, and the retry that follows uploads a second
copy. It is also the leak that needs no reviewer and no approval — anyone with
a file can make them, ten megabytes at a time — which is what made it worth
doing in the same pass rather than writing down as an open item.

It is the one part of the sweep that cannot work from the database, because an
object nothing references is by definition not in it. So it walks the bucket and
asks D1 which of the keys it found are spoken for, which inverts the order used
everywhere else in that file: here the bucket proposes and the database
disposes, and **nothing is deleted until D1 has answered**. A failed lookup
deletes nothing rather than everything, which is the only acceptable failure
mode for a loop holding a delete.

Two things to know before changing it:

- **The age threshold is a day and the window it guards is seconds.** The client
  uploads when Submit is pressed and posts the submission on the next round
  trip. A day is absurd on purpose: this deletes a file a person chose, and the
  cost of waiting is one flyer for one more day. Anything that ever moves the
  upload earlier in the form — a preview, a two-step submit — spends that
  margin, and should raise it.
- **`EVENT_RETENTION_MONTHS = "0"` does not switch this off**, and does not
  switch off declined flyers either. It turns off exactly one of the three
  things the sweep does: deleting events for age. That setting says the calendar
  keeps its history, and neither a declined submission's artwork nor an upload
  nobody ever submitted was ever part of that history. The flyer pass runs
  either way and simply finds less, because its query is written against the
  state of the database rather than against what the run happened to delete.
  Orphan keys are matched on the `f-` prefix the API issues, so nothing outside
  that namespace is ever a candidate.

#### What was checked, against a local D1 and R2

Not by reading. A two-occurrence event aged out and its flyer deleted; a weekly
series straddling the cutoff keeping its artwork; an event dated exactly on the
cutoff kept; a submission approved an hour ago untouched; the twelve-hour claim
refusing a second sweep and then allowing one once the interval had elapsed;
month-end clamping in `monthsBefore` (31 May − 3 months = 28 or 29 February).

Then, with four objects in the bucket: everything uploaded moments ago survived
a sweep; after backdating three of them, only the aged *and* unclaimed one was
deleted — the one held by a pending submission, the one held by an event, and
the one still under a day old all survived.

Then declines: one declined two days earlier lost its flyer and kept its row,
with `flyer_key` nulled and `status` still `declined`; one declined an hour
earlier kept its artwork; one still pending kept its artwork.

Finally, with `EVENT_RETENTION_MONTHS = "0"`: an event dated 2020 was kept,
while an aged orphan and a two-day-old decline's flyer were both still
collected — which is the case that broke when declines were added, because the
flyer pass had been sitting inside the retention gate and had to come out of it.

#### Deployed, and what the first live sweep did

Deployed the same day. The `maintenance` table was created first, by hand,
because `schema.sql` drops every table and can never be run against this
database again:

```bash
npx wrangler d1 execute fye-calendar --remote --command="CREATE TABLE IF NOT EXISTS maintenance (name TEXT PRIMARY KEY, at INTEGER NOT NULL);"
```

**The state of the live data was checked before deploying, not after**, because
deploying arms a deleter and there is no undo. Nothing was due: no event fell
before the cutoff (the earliest on the calendar is 2026-08-03 against a cutoff
of 2026-05-11), no submission held a flyer with nothing left to be on, and the
bucket held exactly one object against exactly one referenced key, so there were
no orphans either. The first sweep was therefore a guaranteed no-op, which is
the right way to turn this on.

Then it was watched running on production. A test submission triggered it; the
tail of that request came back `outcome: ok` with an empty `exceptions` array
and no log line — correct on all three counts, since the sweep only logs when it
removed something. That is what proves `sweepOrphanUploads` works against the
real R2, which is the one thing miniflare cannot demonstrate. Four test rows
were made getting there and all four were deleted afterwards, along with the
`submission_attempts` rows they created.

If you need to watch it again, the tail needs the deployment id positionally —
`wrangler pages deployment tail <id> --project-name fye-calendar` — and it
prints pretty-printed JSON objects rather than one per line, which will defeat a
naive JSONL parser.

### 2026-08-11 — the reviewer's way back

The two-hostname split has a return trip, and it was missing. Access covers
`fye-calendar.pages.dev` and cannot cover `calendar.fyetools.com`
([why](#cloudflare-access-needs-a-zone-and-there-is-no-zone)), so the footer
link sends reviewers to the other hostname to sign in — and "Back to calendar"
then closed the review overlay in place and left them standing on the pages.dev
copy of the calendar. The right events at the wrong address, and the address
they would bookmark, tell a colleague about, and eventually be confused by when
Access challenges them for a calendar the students read without signing in.

The button now navigates to `https://calendar.fyetools.com/` when it is on the
Access host, and closes the overlay in place everywhere else, so
`wrangler pages dev` does not throw anyone at production. Escape still calls
`closeReview` directly: dismissing a screen should not navigate to another host.

That leaves the hostname written in three files, which is the part to know
about. `REVIEW_HOST` in `wrangler.toml` (where `/review` redirects to),
the footer link in `public/index.html` (how reviewers get there), and
`REVIEW_HOST` in `public/js/app.js` (how they get back). Each carries a comment
naming the other two. If the Access application ever moves, all three move.

Not extracted into one shared constant on purpose: they are read by three
different runtimes — the Functions env, static HTML, and a classic script with
no build step — and there is no place all three can import from without adding
a bundler that this project has stayed free of.

### 2026-08-11 — Escape leaves the slide show, not just fullscreen

Escape on the slide show made the screen smaller and nothing else. The key
handler had always called `stopSlideshow`, but it never ran: inside fullscreen
Escape belongs to the browser, which uses it to drop the page back to a window
and does not deliver the keydown at all. So the overlay stayed up at window
size, and a second Escape — now that the page was windowed and the handler
could see the key — closed it. Two presses for one intention, on a screen whose
whole audience is somebody walking up to a lobby display.

Leaving fullscreen while the slide show is running now means the same thing as
pressing Exit, via a `fullscreenchange` listener in `public/js/app.js`. It does
not loop, because the Exit button clears `state.slideshow` before it calls
`exitFullscreen`, so the change event it causes finds nothing to close.

Worth one press on a real full-screen display: the in-app preview browser
refuses `requestFullscreen`, so the path was exercised by dispatching the event
rather than by actually being fullscreen.

### 2026-08-11 — the old calendar is off the air

GitHub Pages is disabled for this repository, so
<https://bengrier.github.io/FYE-Calendar/> returns 404 and the static,
email-based calendar is no longer reachable. Two live calendars was the standing
risk — somebody would eventually find the wrong one, submit to an address that
mails a person who has stopped watching that inbox, and never know it went
nowhere.

`DELETE /repos/bengrier/FYE-Calendar/pages`, done through `gh api`. Nothing was
deleted — the URL simply stops resolving, and Pages can be turned back on from
the repository's settings. What it would serve has changed since, though: `main`
was replaced later the same day (below), so pointing Pages at `main` now would
publish *this* calendar as a second copy, which is the thing the take-down
existed to prevent. The old site is the tag `static-calendar-final`.

A redirect to <https://calendar.fyetools.com> was the alternative, and was
declined deliberately — the address 404s rather than forwarding, so an old
bookmark or a link in a two-year-old email announces itself as dead instead of
quietly working forever.

### 2026-08-11 — `main` is the calendar that exists

`main` was fast-forwarded to `cloudflare-backend`, so the default branch — the
first thing anybody who opens the repo reads — is no longer the retired,
email-based version. `main` was a direct ancestor of this branch, so this was an
ordinary fast-forward: no force push, no rewritten history, nothing orphaned.
The old tip is tagged `static-calendar-final`, both because the take-down note
above promised the old site was recoverable and because a tag is findable in a
way that a commit hash in a paragraph is not.

The two branches now point at the same commit and **nothing keeps them there.**
Committing to one leaves the other behind. Deploying does not care: the
`--branch cloudflare-backend` in `npx wrangler pages deploy` is a label
Cloudflare matches against the project's production branch, not a git ref, and
the upload is whatever is in the working tree at the time. So a deploy can
publish work that neither branch has, and a branch can hold work that was never
deployed. The one habit that keeps this straight is to commit, push both, then
deploy — in that order.

Worth deciding at some point, but not urgent: whether `cloudflare-backend`
should exist at all now, or whether work should simply happen on `main`. The
name is load-bearing in exactly one place — the deploy label, which Cloudflare
matches — and that would keep working even if the git branch were deleted
tomorrow.

*(Half-decided 2026-08-11: the deploy workflow triggers on `main` only, so
`main` is now the branch that publishes. The git branch `cloudflare-backend`
still exists and still has to be pushed by hand to stay level. See below.)*

### 2026-08-11 — deploys and backups stopped depending on one person

Two of the three accounts this calendar rests on are personal, and the honest
summary of the arrangement was that a working calendar had a single person as
its only dependency. Two of the ways that could go wrong are now closed, and
neither needed the app to change.

**Deploying is a push.** `.github/workflows/deploy.yml` runs the same
`wrangler pages deploy` on a push to `main`. The reason this looked blocked for
a day and a half is that the question had been framed as "can Cloudflare's Git
integration be attached to this project" — and it cannot, for the reason it
never could ([Connect-to-Git builds a
Worker](#the-dashboard-builds-a-worker-and-workers-do-not-run-functions)). The
other option on the table was converting the app to a Worker with static
assets, which is a rewrite of the routing to buy back a feature. Neither was
necessary: the CLI upload was always scriptable, and GitHub Actions is a place
to run it that is not somebody's laptop.

The `--branch cloudflare-backend` label is carried through into the workflow
verbatim, with a comment saying what it is, because it is the single most
misreadable string in this project — it is matched against the project's
production branch and has nothing to do with git. Changing it does not fail;
it quietly makes every deploy a preview nobody visits.

**Backups are a schedule.** `.github/workflows/backup.yml`, Sundays at 10:00
UTC, plus a manual trigger. It runs in GitHub rather than Cloudflare for the
reason the retention sweep runs on writes: Pages Functions have no scheduled
handler. But here that constraint is a benefit rather than something worked
around — a backup living in the account it insures against losing is not a
backup, and this one is somewhere else by construction.

Three decisions worth knowing before changing it:

- **The dump is encrypted before it is uploaded, and that is not decoration.**
  This repository is public, a D1 export contains every submitter's real
  `@colostate.edu` address, and artifacts are readable by anyone who can read
  the repository. Encrypting makes the artifact's visibility stop mattering. If
  the repo is ever made private, leave the encryption in — repositories get
  flipped back.
- **`openssl` rather than `gpg`, so the restore works on a stock Mac.** This was
  checked rather than assumed, and the check is the reason for the choice: a
  real dump encrypted with OpenSSL 3.6 was decrypted byte-identically by the
  LibreSSL 3.3 at `/usr/bin/openssl` that macOS ships, and a wrong passphrase
  fails loudly instead of producing plausible rubbish. `gpg` is not installed on
  the machine this project is developed on, which is precisely the machine a
  restore would happen on.
- **The workflow decrypts its own output before uploading it.** The only moment
  the passphrase and the ciphertext are ever in the same place is inside that
  job, so it is the only moment the backup can be proved to open. It fails
  rather than uploads if the round trip does not produce readable SQL, and it
  fails before the export if `BACKUP_PASSPHRASE` is missing — naming the secret,
  rather than failing later with a message about openssl.

Both workflows are inert until two repository secrets exist —
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and `BACKUP_PASSPHRASE` for
the backup. **They fail loudly rather than silently while those are missing**,
which is the right way round: a deploy that appears to succeed and publishes
nothing is how you come to believe the live site has a change it does not have.

#### What was checked, and what it turned up

Not by reading. Both workflows were run on GitHub, and the backup's shell was
run end to end locally against the real export first: 169 `INSERT` statements
in, encrypted, decrypted byte-identically, plaintext removed, only the
ciphertext left to upload. A wrong passphrase fails with `bad decrypt` rather
than producing plausible rubbish.

On GitHub, with no secrets set, the deploy failed at `Not logged in.` and
published nothing, and the backup failed at its first step naming
`BACKUP_PASSPHRASE` — before the export rather than after it, which is the
whole point of that guard existing.

**The first run also caught something worth keeping.** `npx --yes wrangler@4`
resolved to **4.86.0** on the runner, while this project is developed against
4.121.0 — npx satisfies a version range from whatever is already cached on the
machine rather than fetching the newest. It is now pinned exactly in both
workflows. A tool that picks its own version is not something to have inside
the one command that publishes the site, and this is the kind of drift that
shows up months later as "it worked in CI yesterday."

#### Both then ran for real, and this is what proved it

The secrets went in the same evening and both workflows were run again. Green
checks are not the evidence; these are.

**The deploy** uploaded 20 files and a Functions bundle, landed as
**Production** on the `cloudflare-backend` label from a checkout of `main`, and
`wrangler pages deployment list` shows it against the right commit. The
Functions bundle is the part worth naming — it is exactly what a Worker cannot
do, and seeing it upload is what distinguishes this from
[the quiet failure of 2026-08-10](#the-dashboard-builds-a-worker-and-workers-do-not-run-functions).

Afterwards, on the live site: `/` and `/api/events` both 200 with 24 events,
`/review` on the Access host still 302s to the login, and `/api/admin/queue`
unauthenticated still 401s. A deploy that silently removed the edge challenge
or opened the admin API would otherwise look exactly like a successful one.

**The backup** exported 157 `INSERT` statements, encrypted, and decrypted back
to 157 inside the same job. The number is its own cross-check: the by-hand dump
taken hours earlier held 169, and the difference is precisely the 3 events and
9 `event_tags` deleted in between.

The artifact was then downloaded and inspected **without the passphrase**,
which is the check that matters for a public repository — zero hits for
`colostate`, `INSERT INTO`, `CREATE TABLE` or anything email-shaped, an OpenSSL
`Salted__` header, and 7.992 bits/byte of entropy across all 256 byte values.
It is ciphertext, not a file that merely has `.enc` on the end.

The one thing still unproven is a restore from the artifact, because that needs
the passphrase and the passphrase is deliberately not something this account
handles. The job proving its own output decrypts is the substitute, and it is a
good one — but somebody should still do a real restore once.

**Token permissions, since a template was nearly recommended by mistake:** a
custom token with `Account → Cloudflare Pages → Edit` and `Account → D1 →
Edit`, and nothing else. D1 needs Edit rather than Read because an export is a
write as far as the API is concerned.

#### What the export turned up about the live data

The backup was taken first, partly to have one and partly because a real export
answers questions this file had been answering from memory. Two of those answers
were wrong, and both are corrected in [Still open](#still-open): there are
**four** unflagged events on the live calendar rather than one, and deleting the
placeholder rows will **not** take the flyers with them.

The four-not-one is the more interesting error, because it is not a miscount so
much as a category the design creates and nobody had named. Three of the four
are the `Ben's Test Event` rows everybody knew about. The fourth is
`Robotics Club: Line-Follower Sprint`, which exists because the seeded
submission `p1` was approved during testing — and **an approved event never
carries the `temporary` flag**, since the flag is written on seeded event rows
and an approval writes a fresh one. So exercising the review queue against the
seed data manufactures placeholder content that presents itself as real, one
event at a time, and `p2` is still in the queue waiting to do it again.

Worth a decision at some point: either the approve path should carry the flag
across from a `temporary` submission, or the two seeded submissions should come
out of the live queue. Not urgent, and not fixed here, because it changes
behaviour and this pass was meant to touch nothing the students see.

#### The stale `main` that had already caught somebody out

The note above says the two branches drift and staying in step is manual. It had
already happened: the local `main` in this working copy was 13 commits behind
`origin/main`, still sitting on `888a622` — the retired, email-based calendar —
because the fast-forward on 2026-08-11 was pushed but the local ref was never
moved. `git checkout main` here would have silently produced the old site.

Fixed with `git branch -f main origin/main`. It is worth noticing how quiet that
was: nothing was broken, no command failed, and the only symptom would have been
a deploy that put the wrong calendar on the live site. Now that the workflow
publishes from `main`, that failure mode has teeth it did not have this morning
— which is an argument for retiring `cloudflare-backend` rather than
maintaining two branches by hand.

### 2026-08-12 — no second admin, so the backup became a rebuild kit

**A second admin on the Cloudflare account was ruled out.** It had been sitting
at the top of [the survivability list](#the-hosting-is-personal-and-that-is-now-a-decision)
since 2026-08-08 as the single cheapest thing worth doing, and it is not going
to happen. It is struck through rather than deleted, because "we considered
this and declined it" and "nobody thought of this" are different states and the
next person to read the file should be able to tell them apart.

That decision has a consequence, and taking the recommendation out without
following the consequence through would have been the wrong way to honour it.
**The backup now carries the uploaded flyers as well as the database.**

The gap it closes is one nobody had written down: **a D1 dump holds a flyer's
key, and R2 holds its bytes.** Restoring only the database would have produced
every event, every approval and every submitter's address, with all the
submitted artwork gone — a restore that looks like it worked. That was tolerable
while somebody else could in principle be given the keys to the account. With
recovery-by-rebuild as the only plan, the backup has to be sufficient on its
own.

Three decisions in how it was done:

- **The keys come out of the dump, not from walking the bucket.** So the
  artwork in an archive is exactly the artwork the rows in that same archive
  point at, and the two can never disagree. It also means orphaned objects are
  not collected — the retention sweep exists to delete those, and a backup that
  faithfully preserved rubbish would only restore it.
- **One missing object does not fail the backup, but every missing object
  does.** A flyer can legitimately vanish between the export and the fetch,
  since the retention sweep runs on its own schedule, and losing a database
  backup over one absent PNG would be a bad trade. All of them failing is not
  that — it is a broken credential, almost certainly the token missing
  `Workers R2 Storage → Read`, and shipping an artwork-less archive every week
  until somebody needs one is exactly the silent failure this project keeps
  finding. So zero-out-of-N is an error and N-1-out-of-N is a warning.
- **The archive is a tarball now**, so the artifact is `.tar.gz.enc` rather
  than `.sql.enc`. Anything written against the old name needs updating; the
  restore command in README and at the top of the workflow is current.

`README.md` gained [Rebuilding from a backup](README.md#rebuilding-from-a-backup):
new D1, new bucket, the dump, the objects, a CLI-created Pages project, and a
fresh Access application. Six steps, of which only the last needs the domain
registrar.

**None of it has been rehearsed**, and that is now the most valuable unticked
thing in this file. It was checked in the small — a real export, its one
referenced flyer fetched, tarred, encrypted, decrypted and extracted back to
157 `INSERT` statements and an intact 1217×717 PNG — but a full rebuild onto a
different account has never been done. The right time to find out what that
procedure gets wrong is an idle afternoon on a throwaway account, not the week
the account is gone.

### 2026-08-16 — a decided submission no longer says who sent it

`by_name` and `by_email` are erased the moment a submission is approved or
declined. Nothing else about the row changes: what was proposed, when, which
reviewer decided it and the flyer all stay exactly as they were.

**Why, since nothing was broken.** A FERPA review of the project asked what
happens to a student's name and address after their event goes up, and the
answer was "nothing, ever." No path in the codebase deleted a submission row or
any column of one — `retention.js` said so in as many words — so every address
that had ever been submitted was still in D1, and in every backup taken since.
It was also unreachable: `queue.js` selects `WHERE status = 'pending'`, so from
the instant of the decision no surface in the application displayed those
columns again. Personal data that nothing reads and nothing removes is the worst
of the three states it could be in, because there is no moment at which anybody
is reminded it exists.

**It is done in the deciding statement, not after it.** `approve.js` and
`decline.js` already claimed the row with a conditional `UPDATE` so the database
settles a race between two reviewers; the erasure is two more columns in that
same statement. So there is no window where a submission is decided and the
address is still on it, and no second write that can fail on its own. Nothing
downstream had to be reordered around it — approve's `SELECT` asks for the
event's fields, never the submitter's.

**Cleared to `''` rather than `NULL`**, because both columns are `NOT NULL` and
`schema.sql` drops every table, so it can never be re-run against the live
database to relax that. Nothing is lost by it: the validator refuses a blank
name or address, so a non-empty value means a live submitter and an empty one
means erased, with no third case.

**The sweep does it too, and that is the point.** `sweepIdentities` in
`retention.js` nulls the contact details on any decided row that still has them.
On a healthy deployment it finds nothing, every run. It exists for the rows
decided before this shipped, and for the future path that learns to decide a
submission and forgets to erase — the one kind of bug where nobody would ever
notice the data was still there. It runs *first* in `sweep()`, before anything
that can throw: the rest of that file frees storage and a failed run costs
cents, while this one is holding personal data that should already be gone. It
has no settling period either. The day of grace elsewhere protects a reviewer
who wants a *file* back; waiting cannot restore an address, and there is no
argument for keeping one an hour past the decision.

**The reviewer's confirmation message now prints the address in full** —
"Tell Priya Raman at praman@rams.colostate.edu yourself" — because it is now the
last place it appears. The message is built from the client's in-memory copy of
the submission, captured before the request, so it still reads correctly against
a row the server has already erased. *Request changes* is unaffected and remains
the way to write to somebody without spending the address: it keeps the
submission pending.

#### Checked against a local D1, not read

A decline on its own erased the row while a legacy decided row nearby kept its
details — which is what proves the decline statement did it rather than a sweep,
since `decline.js` does not start one. Then a public submission triggered a
sweep and that legacy row was erased too, logging `erased the contact details
left on 1 decided submission(s)`, while both pending submissions kept their
name and address throughout. Then the same approval through the review screen in
a browser: the confirmation printed the name and the address, and the row behind
it was already `by_name=''`, `by_email=''`. The published event kept its title,
org, place and date.

#### Before deploying, and one command after

The live database holds decided submissions from before this existed. The next
sweep will erase them on its own, but a sweep needs a write to ride on and runs
at most twice a day, so it is worth doing deliberately and being able to say it
is done:

```bash
npx wrangler d1 execute fye-calendar --remote --command="UPDATE submissions SET by_name = '', by_email = '' WHERE status IN ('approved','declined') AND (by_name <> '' OR by_email <> '');"
```

Count them first with the same `WHERE` and a `SELECT COUNT(*)` if you want to
know what the backlog was.

**Backups taken before this change still contain the old addresses.** The
artifacts are encrypted and expire after 90 days, so the backlog ages out on its
own by roughly 2026-11-14; nothing here reaches back into them, and nothing can.

#### What this does not fix

The four bigger items from the same review are untouched, and none of them is a
code change: student records still sit on a personal Cloudflare account with no
CSU agreement behind it, the backup artifacts still land on a public repository
behind one passphrase, `DEV_UNSAFE_NO_AUTH` is still a single dashboard variable
away from serving the queue to everybody, and uploaded flyers still carry
whatever PDF and EXIF metadata the submitter's software put in them. This change
shrinks the amount of personal data in the system to the current queue. It does
not change where that queue lives.

### 2026-08-18 — an approval stopped being final

The review screen could publish and it could refuse, and that was the whole of
it. Once a submission was approved the events it wrote were beyond the office:
a series approved with an end date three months past anything anybody meant, an
event cancelled the week after it went up, a custom tag that read fine on one
flyer and turned out to be a duplicate — every one of those meant a
`wrangler d1 execute` from a laptop, which in practice meant asking whoever set
this up, months later, and hoping they still had the credentials. The screen
that publishes is the screen that should be able to correct.

So the review screen has three tabs now: **Waiting** (the queue, unchanged), **On
the calendar**, and **Custom tags**. Four new files under
`functions/api/admin/` — `published.js`, `remove.js`, `reschedule.js`,
`tag.js` — and the tabs and their two new screens in `js/app.js`. Written up in
README under [Fixing what is already
published](README.md#fixing-what-is-already-published).

**The unit is the series, not the event.** One approval writes one event row per
occurrence and `from_submission` is the only thread between them, so that is
what the list on the left holds and what the actions work on. "This repeats too
long" is a statement about six rows, and asking a reviewer to remove six things
one at a time would be asking them to do the expansion in their head. A seeded
placeholder has no submission behind it, is a series of one, and comes off by
its own id — which is now also how the sample content gets cleared without a
command line.

Four decisions worth knowing before changing any of it:

- **Shortening a series, never lengthening one.** The dates were expanded once,
  from a repeat rule a person wrote and a reviewer read. Adding to them here
  would be publishing events nobody submitted, so a longer run means a new
  submission and the screen says so where the trim control is.
- **A date can only move to today or later.** An event moved into the past is a
  typo every time, and the retention sweep deletes events older than the window
  without asking — a slipped year would take the event off the calendar for good
  some hours later with nothing to say why. The server's floor is *yesterday*
  rather than today, because "today" there is UTC and the reviewer is in
  Colorado: at six in the evening they are already on tomorrow's UTC date, and
  refusing to move an event to this afternoon would be the server disagreeing
  with the calendar on the reviewer's own screen.
- **Un-approving a tag takes it off the events, not just out of the filter
  bar.** `/api/events` now reads its tags through the `approved` flag, which is
  the one change in this pass to a public endpoint. Approving already worked
  this way — a tag the reviewer does not keep is dropped from the event rather
  than published unfilterable — so the alternative was a chip sitting on a card
  filtering nothing. Nothing is deleted: the `event_tags` rows stay, so turning
  it back on puts it back everywhere it was, and that reversibility is why there
  is no destructive "delete this tag" action at all. The join is a LEFT JOIN
  kept open on the missing side, so a tag with no catalogue row survives rather
  than silently vanishing off an event.
- **Removing starts a retention sweep.** A series that has just lost its last
  event is an uploaded flyer with nothing pointing at it, and the sweep works
  off the state of the database rather than off what any run deleted — so it is
  started after the deletes, never before, the same ordering and for the same
  reason as `approve.js`.

**Nothing here is undo, and the screen says so twice** — once as the standing
note at the top of the tab, and once in every button, which takes two presses:
the first arms it and makes it say what it is about to do, the second does it.
Not a `confirm()`, which would ask in the browser's voice, in a dialog this page
cannot style, with an OK button that says nothing about the event. What survives
a removal is the submission row: what was proposed, when, and which reviewer
approved it. Every decision the office ever made is still on record, which was
already true of declines and is now true of un-publishing too.

#### Checked against a local D1, in a browser

A 16-week series approved through the queue, then trimmed to six through the
screen ("10 events came off the calendar", sidebar and detail both following);
one occurrence moved from Thursday Sep 10 to Friday Sep 11 and the list
re-sorting around it; one date removed with the rest of the series untouched; a
seeded placeholder removed by id, with the calendar behind the overlay dropping
from three events to two on the same repaint. A typo tag turned off, gone from
both `customTags` and the event's own tags in `/api/events`, and fully restored
by turning it back on. `Workshop` refused as a fixed chip, a past date refused,
an unknown id answered `409`, and every endpoint refusing the wrong method.
Mobile at 375px with no horizontal overflow.

#### What it deliberately cannot do

Edit an event's title, time, place, blurb or flyer. The calendar's record of
what was approved should not quietly stop matching what was approved, so a club
that needs different words sends the submission again. The only mutable field is
the date, and only forwards.
