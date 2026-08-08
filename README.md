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
| Calendar — week or month grid, filtered | the page itself |
| Event detail — full flyer, tags, link to the flyer page | click any event |
| Submit an event | **Submit an Event** in the header |
| Slideshow for lobby screens and lecture halls | **Slide Show**; arrows/space step, Esc exits |
| Review queue (office only) | **Shift+R**, or `#review` on the URL |

The showcase above the grid cycles through whatever is currently in view, in the
order it happens; clicking a row in the running order jumps to it.

## Layout

- `index.html` — page shell and static chrome. Dynamic regions are marked with
  `data-stage`, `data-cur`, `data-countdown`, `data-reel` and `data-range`; both
  the page and the slideshow overlay expose them, so one painter feeds both.
- `js/data.js` — events, flyers, filter groups, the pending queue, and `CONFIG`.
  This is the seam where a backend goes: keep the shapes, swap the literals for a
  fetch, and nothing in `app.js` changes.
- `js/dates.js` — Monday-first, whole-day, local-time date helpers.
- `js/app.js` — state, derived views, and targeted rendering.
- `css/app.css` — Broadsheet tokens, CSU header, and the calendar components.
- `flyers/` — flyer artwork (`.png`, what the calendar renders) and the original
  pages (`.pdf`, what "Open the flyer page" links to).

## Configuration

`CONFIG` in `js/data.js`:

- `slideSeconds` — how long each flyer holds on the stage (default 9).
- `defaultView` — `"week"` or `"month"`.
- `today` — the real current date. Pin it to an ISO string (`"2026-04-27"`) if
  you want the calendar to open somewhere specific for a demo.

The seeded events in `js/data.js` are a sample semester running Aug 3 – Sep 11,
2026. When a view has nothing in it the showcase collapses to one line and, where
the calendar still holds something later, offers a jump to the next event.

## Notes on rendering

The showcase ticks five times a second, so rendering is targeted rather than
wholesale: the grid rebuilds only when the view, the anchor date or the filters
change; the filter selects are built once and patched, so they keep focus; and
the surfaces holding typed-in text — the submit form and the reviewer's feedback
box — are built once and patched in place so nothing you typed is thrown away.
