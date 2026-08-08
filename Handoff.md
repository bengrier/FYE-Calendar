# Handoff — First-Year Engineering Calendar

Written 2026-08-07. Read this with [README.md](README.md), which covers how to run
the app and how the code is laid out. This file covers what state the work is in,
what is deliberately the way it is, and what is still open.

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

1. **Poster dates now contradict the calendar.** The Major Declaration flyer reads
   **MONDAY, MAY 4** but the event is Mon Aug 31; the ISPE flyer reads **April
   30th** but the event is Thu Aug 27. Both are visible on the stage right next to
   the calendar date. The editing method above works for these too.
2. **Season-inconsistent copy.** "Last Cookie Friday of the Year" now falls in
   September; "Major Declaration Ceremony" celebrates "your first year" but sits
   at the start of one; "Concrete Canoe Send-Off … before it goes to regionals" is
   a spring event now in September. These are content calls, deliberately left alone.
3. **QR codes are still live.** The ISPE flyer's GroupMe and RSVP codes and the
   AIAA flyer's Instagram code were never touched — only emails were, as asked.
   They are publicly fetchable on the live site. The ISPE flyer also names a speaker.
4. **The seeded events are placeholder content.** Real events mean replacing
   `EVENTS` in `js/data.js`.

## Notes for whoever extends this

- `js/data.js` is the backend seam. Keep the shapes, swap the literals for a
  fetch, and nothing in `app.js` needs to change. The review queue's `PENDING` and
  the submit form are UI-only today — nothing is persisted and no mail is sent;
  the copy about emailing submitters describes intended behaviour, not real behaviour.
- Filter semantics worth preserving: an event tagged `All disciplines` answers any
  choice in the discipline group (`openToAll` on that group).
- Weeks are Monday-first throughout; day-of-week indexes are `(getDay() + 6) % 7`.
  Dates are whole days in local time, never UTC instants, so an event never slides
  a day across time zones.
- Reel auto-scroll sets `scrollTo({behavior})` from JS rather than CSS
  `scroll-behavior`, so it can honour `prefers-reduced-motion`.
- Assets came from the CSU top-bar reference bundle and the demo event files that
  were in this folder; both were deleted after their contents were copied and
  renamed into `assets/csu/` and `flyers/`. They are recoverable only from commit
  `aa229a2` onward — the originals are gone from disk.
