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
| Submit an event | **Submit an Event** in the header, or `#submit` |
| Slideshow for lobby screens and lecture halls | **Slide Show**; arrows/space step, Esc exits |
| Review queue (office only) | **Shift+R**, or `#review` on the URL |

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
- `js/store.js` — the live calendar. The seed plus every submission, approval and
  upload since, persisted to localStorage. `app.js` reads events, the queue, tags
  and flyers from here, never from `data.js` directly.
- `js/dates.js` — Monday-first, whole-day, local-time date helpers, plus the
  parser that reads an end time back out of a prose time range.
- `js/ics.js` — iCalendar export.
- `js/app.js` — state, derived views, and targeted rendering.
- `css/app.css` — Broadsheet tokens, CSU header, and the calendar components.
- `flyers/` — flyer artwork (`.png`, what the calendar renders) and the original
  pages (`.pdf`, what "Open the flyer page" links to).

## Submitting and reviewing

The two office workflows are wired end to end, against localStorage rather than a
server:

- The submit form validates every field, keeps your draft if you close it by
  accident, and expands a repeat rule into its actual dates. An uploaded image
  flyer is downscaled in the browser to 1400px and carried as a data URL, so the
  reviewer sees the real artwork; a PDF travels as a filename, because the
  browser cannot rasterise one here.
- Approving publishes one event per occurrence onto the calendar and makes any
  approved custom tag filterable for everyone, immediately. Declining drops the
  submission. Both survive a reload.
- **Reset this browser's submissions** appears under the toolbar once anything
  has been changed, and puts the calendar back to what it ships with.

Nothing is emailed — the copy about notifying submitters still describes intended
behaviour. Everything else it claims now happens.

## Configuration

`CONFIG` in `js/data.js`:

- `slideSeconds` — how long each flyer holds on the stage (default 9).
- `defaultView` — `"week"` or `"month"`.
- `today` — the real current date. Pin it to an ISO string (`"2026-04-27"`) if
  you want the calendar to open somewhere specific for a demo.

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
