# Handoff — First-Year Engineering Calendar

Written 2026-08-07, extended 2026-08-08. Read this with [README.md](README.md),
which covers how to run the app and how the code is laid out. This file covers
what state the work is in, what is deliberately the way it is, and what is still
open.

> **2026-08-08, later — submissions go to Microsoft Forms.** *(Superseded the
> same day; see the note below. Left in place because the reasoning about what
> is and is not possible against Forms is still worth having.)* The submit form
> hands off to the office's Microsoft Form so responses land in SharePoint.
> Written up at [the bottom](#the-microsoft-forms-pass-2026-08-08).

> **2026-08-08, later still — submissions are links, and Forms is gone.**
> Microsoft Forms solved the wrong half of the problem: it gave submissions
> somewhere to land, but publishing an approved event still meant hand-editing
> JavaScript, which is the part an office colleague cannot reasonably be asked
> to do. Submissions now encode themselves into a link that the submitter emails
> in, the review queue decodes it, and approving produces a ready-made
> `js/events.js` to drop into the repo. No Forms, no SharePoint, no licence, no
> hand-edited code. Written up at
> [the bottom](#the-link-based-pass-2026-08-08). **One thing still needs doing:**
> set `CONFIG.office.email`.

> **2026-08-08 — the functionality pass.** Everything up to this point was the
> shape of the app: the layout, the type, the chrome. The screens looked
> finished but mostly did not do anything — the submit form read none of its own
> fields, review decisions changed nothing, and there was no search, no way to
> get an event into your own calendar, and no way to link to one. That pass is
> [written up below](#the-functionality-pass-2026-08-08). The open items in this
> document that it closed are marked.

## Where it lives

| | |
| --- | --- |
| Repo | <https://github.com/bengrier/FYE-Calendar> (public) |
| Live | <https://bengrier.github.io/FYE-Calendar/> — GitHub Pages, `main` / root, HTTPS enforced |
| Deploy | Every push to `main` republishes automatically, usually within a minute |
| Origin | Implemented from the Claude Design prototype `Community Calendar.dc.html` (project `969b693a-9fb3-4ad4-ae08-0e5ed698d1f3`), on the Broadsheet design system |

Static site: no build step, no dependencies, no package manager. Scripts are
classic (non-module) on purpose so the page also opens straight from the
filesystem. Serve it with `python3 -m http.server 4173`.

## State: everything is committed and live

The dates, the flyer edits and this document are all on `main` and published.
Working tree clean as of writing. (The 2026-08-08 functionality pass is a
separate set of changes on top; see the bottom of this file.)

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
4. ~~**The seeded events are placeholder content.**~~ Still true, and now said
   out loud — see [the placeholder flag](#the-seeded-events-say-they-are-seeded).
5. ~~**Nothing is emailed.**~~ Nothing in the interface claims to send mail. The
   submit form and **Request changes** both compose a message and hand it to the
   sender's own mail client, which is honest and needs no server.
6. ~~**The review queue is orphaned.**~~ Closed by the link-based pass: it is fed
   again, by submission links, and it is where publishing happens.

### Still open

**`CONFIG.office.email` is empty.** One line in `js/data.js`. Submitting works
without it — the confirmation hands over the link and says to email it — but the
page cannot open a pre-addressed message until it is set.

An earlier version disabled the Submit button when it was unset. That was wrong:
it left someone who had filled in the whole form with nothing to show for it, and
it read as the page being broken rather than unconfigured. A missing setting
should degrade what the page can do for you, not refuse to do the thing you
came for.

**Nobody has published an event end to end yet.** The flow is built and tested
in a browser, but no colleague has actually taken a download and put it in the
repo. That first run is where the README either holds up or does not, and it is
worth doing with someone watching.

## Notes for whoever extends this

- `js/events.js` holds the events and nothing else, because it is the file the
  review queue regenerates and a colleague replaces to publish. `js/data.js` is
  still the backend seam for everything else. ~~The review queue's `PENDING` and
  the submit form are UI-only~~ — both are wired through `js/store.js` and
  persist to localStorage.
- **The serialiser in `app.js` and the format of `js/events.js` have to stay in
  step.** If they drift, every publish reformats the whole file and the diff a
  colleague is meant to read before committing becomes unreadable. There is a
  check for this: regenerate with an untouched store and the output should be
  byte-identical to the file in the repo.
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
  renamed into `assets/csu/` and `flyers/`. They are recoverable only from commit
  `aa229a2` onward — the originals are gone from disk.

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
