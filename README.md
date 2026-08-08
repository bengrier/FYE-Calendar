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
| Submit an event — checked here, filed on the office's Microsoft Form | **Submit an Event** in the header, or `#submit` |
| Slideshow for lobby screens and lecture halls | **Slide Show**; arrows/space step, Esc exits |
| Review queue (office only, no longer fed by submissions) | **Shift+R**, or `#review` on the URL |

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
clipboard. `#submit`, `#review` and `#slideshow` address the overlays. Opening
any of them pushes one history entry, so the browser's Back button closes them;
moving between events replaces rather than pushes, so Back never has to be
pressed twice.

## Layout

- `index.html` — page shell and static chrome. Dynamic regions are marked with
  `data-stage`, `data-cur`, `data-countdown`, `data-reel` and `data-range`; both
  the page and the slideshow overlay expose them, so one painter feeds both.
- `js/data.js` — the seed: events, flyers, filter groups, the starting queue and
  `CONFIG`. This is the seam where a backend goes: keep the shapes, swap the
  literals for a fetch, and nothing above it changes.
- `js/store.js` — the live calendar. The seed plus every approval made in this
  browser, persisted to localStorage. `app.js` reads events, the queue, tags and
  flyers from here, never from `data.js` directly.
- `js/msform.js` — the handoff to the office's Microsoft Form: which questions
  it carries and how a pre-filled link is built. See "Connecting the Microsoft
  Form" below.
- `js/dates.js` — Monday-first, whole-day, local-time date helpers, plus the
  parser that reads an end time back out of a prose time range.
- `js/ics.js` — iCalendar export.
- `js/app.js` — state, derived views, and targeted rendering.
- `css/app.css` — Broadsheet tokens, CSU header, and the calendar components.
- `flyers/` — flyer artwork (`.png`, what the calendar renders) and the original
  pages (`.pdf`, what "Open the flyer page" links to).

## Submitting an event

The form on this site collects and checks the submission; the office's Microsoft
Form receives it. Pressing **Continue to the CSU form** validates every field and
then opens that Form with all ten answers already filled in — the submitter
attaches the flyer, checks it over and presses Submit there. The response lands
in the office's SharePoint with no server here, no credentials in this code and
no public endpoint to abuse.

The handoff is not a receipt, and the page does not pretend otherwise: it has no
way of knowing whether the submitter finished, so it says the submission is not
made until they press Submit, and keeps the link and their answers in reach.

Why not post directly: Microsoft Forms has no public submission API — the
endpoint its own front end uses is CORS-blocked and token-gated, and anything
built on it would break the first time Microsoft changed it. Posting straight
into SharePoint instead needs either a Power Automate HTTP trigger (a premium
connector, and its URL would sit in public JS on a public repo) or an Entra app
registration and a token. The handoff needs none of that.

### Connecting the Microsoft Form

Until this is done the submit form says so plainly and its button is disabled.
It is one paste.

1. In Microsoft Forms, build a form with these ten questions, all **text**, in
   this order. Text rather than Date or Choice so a pre-filled answer can never
   be rejected for not matching an expected format:

   | # | Question | Answer it with |
   | --- | --- | --- |
   | 1 | Event title | `FYE_TITLE` |
   | 2 | Hosting club or organization | `FYE_ORG` |
   | 3 | Date | `FYE_DATE` |
   | 4 | Time | `FYE_TIME` |
   | 5 | Repeats | `FYE_REPEAT` |
   | 6 | Location | `FYE_PLACE` |
   | 7 | What happens there | `FYE_BLURB` |
   | 8 | Tags | `FYE_TAGS` |
   | 9 | Your name | `FYE_NAME` |
   | 10 | CSU email | `FYE_EMAIL` |

   Add a **file upload** question for the flyer as well. It cannot be pre-filled
   — that is the one answer that has to be given on Microsoft's page — so leave
   it out of the steps below. File upload requires the responder to be signed in
   to the CSU tenant, which students already are.

2. Turn on **Enable pre-filled answers**, then `...` → **Get pre-filled URL**.
   Answer each of the ten questions with its sentinel from the table — literally
   `FYE_TITLE` in the title box, and so on — and copy the link it gives you.

3. Paste that link into `CONFIG.submitForm.prefillUrl` in
   [`js/data.js`](js/data.js).

Pairing by sentinel is why step 2 looks odd: Microsoft names its questions
`r1a2b3c…`, and matching those to fields by hand is the kind of job that goes
wrong silently. Filling each box with a word the code recognises does that
matching for you. If the pasted link is missing any of them, the submit form
names exactly which questions are unwired rather than dropping them quietly.

Changing the questions later means redoing step 2 — the ids change. The
sentinels themselves live in `SENTINELS` in [`js/msform.js`](js/msform.js).

## Reviewing

Since submissions go to Microsoft Forms, the office reads them in SharePoint,
and approved events are added to `EVENTS` in `js/data.js`. The in-app review
queue (**Shift+R**) is no longer fed by anything and says so at the top; it
still holds the seeded examples, and approving one still publishes it onto this
browser's calendar, which is useful for trying the flow out and not much else.

Nothing on this page sends mail. **Request changes** composes the reply and
opens it in the reviewer's own mail client, where they send it themselves;
approving and declining tell the reviewer, in as many words, to contact the
submitter. **Reset this browser's submissions** appears under the toolbar once
anything has been changed, and puts the calendar back to what it ships with.

## The seeded events are placeholders

Every event in `js/data.js` is invented — written to build and demonstrate
against. They are flagged `temporary` in one pass at the bottom of the `EVENTS`
array, which marks each tile **Sample**, badges the event dialog, and puts a
line above the grid saying so. Add real events without the flag and the line
counts what is left; empty `EVENTS` and delete the loop, and it disappears.

## Configuration

`CONFIG` in `js/data.js`:

- `slideSeconds` — how long each flyer holds on the stage (default 9).
- `defaultView` — `"week"` or `"month"`.
- `today` — the real current date. Pin it to an ISO string (`"2026-04-27"`) if
  you want the calendar to open somewhere specific for a demo.
- `submitForm.prefillUrl` — the pre-filled link from the office's Microsoft
  Form. Empty until someone follows "Connecting the Microsoft Form" above; while
  it is, nobody can submit an event.
- `submitForm.flyerNote` — the line the submit form shows where the upload used
  to be, telling submitters the flyer is attached on the next screen.

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
