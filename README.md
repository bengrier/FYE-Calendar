# First-Year Engineering Calendar

Events, workshops, club builds and industry nights for first-year students in the
Walter Scott, Jr. College of Engineering. A static site — no build step, no
dependencies. Implemented from the `Community Calendar.dc.html` Claude Design
prototype (Broadsheet design system + CSU brand chrome).

## Running it

Any static file server will do:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>. Opening `index.html` from the filesystem works
too — the scripts are classic (non-module) for exactly that reason — though the
webfont and flyer PDFs behave better over HTTP.

## The four surfaces

| Surface | How you get there |
| --- | --- |
| Calendar — week or month grid, searched and filtered | the page itself |
| Event detail — flyer, tags, add-to-calendar, shareable link | click any event |
| Submit an event — checked here, sent as a link by email | **Submit an Event** in the header, or `#submit` |
| Slideshow for lobby screens and lecture halls | **Slide Show**; arrows/space step, Esc exits |
| Review queue (office only) | a submission link, **Shift+R**, or `#review` |

The showcase above the grid cycles through whatever is currently in view, in the
order it happens; clicking a row in the running order jumps to it. It holds still
while a dialog is open and while the tab is in the background.

### Keyboard

| | |
| --- | --- |
| `/` | jump to the search box |
| `←` `→` | step the week or month; step between events inside an open one |
| `Esc` | close whatever is open, or clear the search |
| `Shift+R` | the review queue |

### URLs

`#event/<id>` opens an event and moves the calendar to its week, which makes
every event linkable — **Copy link** in the detail dialog puts that URL on the
clipboard. `#submit`, `#review` and `#slideshow` address the overlays.

`#review/<payload>` is a submission link: the payload is a whole submission,
base64url-encoded. Opening one decodes it into the queue and then rewrites the
URL to plain `#review`, so a reload does not re-run it and the address bar does
not carry 900 characters of base64. Opening the same link twice is harmless —
the payload is the submission's identity, so it is recognised rather than
queued again.

Opening an overlay pushes one history entry, so the browser's Back button
closes it; moving between events replaces rather than pushes, so Back never has
to be pressed twice.

## Layout

- `index.html` — page shell and static chrome. Dynamic regions are marked with
  `data-stage`, `data-cur`, `data-countdown`, `data-reel` and `data-range`; both
  the page and the slideshow overlay expose them, so one painter feeds both.
- `js/events.js` — every event, and nothing else. This is the file the review
  queue regenerates and the one a colleague replaces to publish; see
  "Publishing an event" below. Nothing else in the repo has to be touched to
  put an event on the calendar.
- `js/data.js` — flyers, filter groups, the starting queue and `CONFIG`. The
  seam where a backend goes: keep the shapes, swap the literals for a fetch,
  and nothing above it changes.
- `js/store.js` — the live calendar. `events.js` plus every submission and
  approval made in this browser, persisted to localStorage. `app.js` reads
  events, the queue, tags and flyers from here, never from `data.js` directly.
- `js/submission.js` — how a submission is encoded into a link and decoded back
  out, and the email that carries it.
- `js/dates.js` — Monday-first, whole-day, local-time date helpers, plus the
  parser that reads an end time back out of a prose time range.
- `js/ics.js` — iCalendar export.
- `js/app.js` — state, derived views, and targeted rendering.
- `css/app.css` — Broadsheet tokens, CSU header, and the calendar components.
- `flyers/` — flyer artwork (`.png`, what the calendar renders) and the original
  pages (`.pdf`, what "Open the flyer page" links to).

## Submitting an event

There is no server here and no third-party form. A submission is encoded into
the URL itself: the submit form checks every field, packs the answers into a
link, and writes an email carrying that link to the office. The submitter
attaches their flyer and presses send.

The office opens the link. The review queue decodes it straight back into a
submission — nothing to retype, nothing stored anywhere in between, nothing to
license, and no public endpoint for anyone to abuse.

A link runs to about 400–900 characters, which is comfortably inside every
practical limit. If one arrives truncated — mail clients and chat windows both
wrap long URLs — the queue says so rather than opening a half-filled card, and
the submitter still has theirs.

The flyer is the one thing a link cannot carry, which is why this is an email
and not just a copied link. It rides along as an attachment, and the office
puts it in `flyers/` when they publish.

This is not a security boundary and does not try to be. Anyone who reads
`js/submission.js` can hand-craft a submission link, which buys them a card in a
queue that a human still has to approve.

### Before anyone can submit

Set `CONFIG.office.email` in [`js/data.js`](js/data.js) to the First-Year
office's address. Until it is set, submitting still works — the confirmation
hands over the link and says to email it to the office — but the page cannot
open a pre-addressed message, and it says so.

## Reviewing and publishing

Open a submission link, press **Shift+R**, or use `#review`.

Approving puts the event on **this browser's** calendar so you can see exactly
what students would. It does not touch the live site — that is deliberate, and
the queue says so at the top, because it is the one thing about this screen
someone could get wrong.

**Request changes** composes a reply and opens it in your own mail client, with
the submission quoted underneath. Nothing on this page sends mail; approving and
declining tell you to contact the submitter yourself.

### Publishing an event

This is the whole of it, and it needs no terminal and no git commands:

1. Approve the submission.
2. Press **Download events.js**.
3. Go to [`js/events.js`](js/events.js) on github.com, press the pencil, select
   all, and paste in the downloaded file. Or drag the file into the repository
   through the web UI — same result.
4. Write a line saying what you added, and commit.

The site rebuilds in about a minute.

The generated file is byte-identical to the one in the repo apart from the
events you added, so the diff GitHub shows before you commit is exactly the new
event and nothing else. Read it — that diff is the last check before students
see it.

If the event has a flyer, add the image to `flyers/` the same way, register it
in `FLYERS` in `js/data.js`, and set the event's `flyer` key to match.

**Anything already published stays published.** The download always contains the
whole calendar, so replacing the file never drops events someone else added —
unless two people publish from different browsers at the same time, in which
case whoever commits second overwrites the first. With one office doing this a
few times a week that is theoretical, but it is the reason to publish soon after
approving rather than banking a week of them.

## The seeded events are placeholders

Every event in [`js/events.js`](js/events.js) is invented — written to build and
demonstrate against — and carries `temporary: true`. That marks each tile
**Sample**, badges the event dialog, and puts a line above the grid saying so,
worded from a live count: "every event on this calendar" while they all are,
"23 events are placeholder data" as real ones arrive, and nothing once the last
one goes.

Real events do not carry the flag; the publisher never adds it. To clear the
placeholders, delete the flagged entries — the notice removes itself.

## Configuration

`CONFIG` in `js/data.js`:

- `slideSeconds` — how long each flyer holds on the stage (default 9).
- `defaultView` — `"week"` or `"month"`.
- `today` — the real current date. Pin it to an ISO string (`"2026-04-27"`) if
  you want the calendar to open somewhere specific for a demo.
- `office.email` — where submissions are sent. Empty until someone sets it;
  while it is, submitting still produces a link but no pre-addressed email.
- `office.name` — how the office is referred to in the copy.

The seeded events in `js/data.js` are a sample semester running Aug 3 – Sep 11,
2026. When a view has nothing in it the showcase collapses to one line that says
why, counts the matches elsewhere on the calendar, and offers to jump to the
first of them.

The exported `.ics` writes times against an `America/Denver` VTIMEZONE. If this
is ever reused off the Front Range, `TZID` in `js/ics.js` is the one thing to
change.

## Notes on rendering

The showcase ticks five times a second, so rendering is targeted rather than
wholesale: the grid rebuilds only when the view, the anchor date or the filters
change; the filter selects are built once and patched, so they keep focus; and
the surfaces holding typed-in text — the submit form and the reviewer's feedback
box — are built once and patched in place so nothing you typed is thrown away.
