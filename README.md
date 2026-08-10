# First-Year Engineering Calendar

Events, workshops, club builds and industry nights for first-year students in the
Walter Scott, Jr. College of Engineering. A static site — no build step, no
dependencies. Implemented from the `Community Calendar.dc.html` Claude Design
prototype (Broadsheet design system + CSU brand chrome).

## Running it

The site is static files in `public/`; the API is Cloudflare Pages Functions in
`functions/`. Both run locally through wrangler, against a local database and a
local file bucket — nothing touches Cloudflare until you deploy.

```bash
npm install -g wrangler
```

First time only, to create and fill the local database:

```bash
npx wrangler d1 execute fye-calendar --local --file=schema.sql
```

```bash
npx wrangler d1 execute fye-calendar --local --file=seed.sql
```

Then:

```bash
npx wrangler pages dev public
```

Re-run the two `d1 execute` lines whenever you want to start over; `schema.sql`
drops and recreates every table.

Working on the review screen locally needs a `.dev.vars` file containing:

```
DEV_UNSAFE_NO_AUTH = "1"
```

That bypasses the Access check, which cannot be satisfied on localhost. The file
is gitignored and wrangler never uploads it — production variables come from the
Cloudflare dashboard — so it cannot reach a deployment. Without it the admin API
refuses everything, which is what it should do.

## The four surfaces

| Surface | How you get there |
| --- | --- |
| Calendar — week or month grid, searched and filtered | the page itself |
| Event detail — flyer, tags, add-to-calendar, shareable link | click any event |
| Submit an event — straight into the queue | **Submit an Event** in the header, or `#submit` |
| Slideshow for lobby screens and lecture halls | **Slide Show**; arrows/space step, Esc exits |
| Review queue (office only, behind a login) | **Shift+R**, or `#review` |

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

Opening an overlay pushes one history entry, so the browser's Back button
closes it; moving between events replaces rather than pushes, so Back never has
to be pressed twice.

## Layout

Static site in `public/`, API in `functions/`, and nothing else is served. That
split is the point of the directory: with the repo root as the output,
`wrangler.toml`, `schema.sql` and `seed.sql` were all fetchable on the live site.

- `public/index.html` — page shell and static chrome. Dynamic regions are marked
  with `data-stage`, `data-cur`, `data-countdown`, `data-reel` and `data-range`;
  both the page and the slideshow overlay expose them, so one painter feeds both.
- `public/js/store.js` — the live calendar. Reads stay **synchronous**, answering
  from an in-memory cache; `hydrate()` fills that cache from the API and fires
  the listeners, and only the mutations are asynchronous. That is what kept this
  change out of every render path in `app.js`.
- `public/js/data.js` — configuration and the fixed vocabulary: `CONFIG`, the
  filter groups, the repeat options, and the artwork committed to the repo. No
  content.
- `public/js/dates.js` — Monday-first, whole-day, local-time date helpers.
- `public/js/ics.js` — iCalendar export.
- `public/js/app.js` — state, derived views, and targeted rendering.
- `public/css/app.css` — Broadsheet tokens, CSU header, calendar components.
- `public/flyers/` — artwork committed to the repo. Uploaded flyers are not here;
  they live in R2 and are served from `/uploads`.
- `functions/api/` — the API. `functions/api/admin/` is behind Cloudflare Access.
- `functions/_lib/` — shared server code. A leading underscore means the
  directory is not routed, so nothing in it is reachable as a URL.
- `schema.sql`, `seed.sql` — the database and the placeholder content.

## Submitting an event

A student fills in the form and presses Submit. That is the whole of it: the
flyer uploads, the submission is written to the database, and it appears in the
office's queue. No email, no link to copy, no account to create.

Two requests rather than one. The flyer goes to `POST /api/flyers` first and
comes back as a key the submission then references, so a 10 MB file is not
re-sent because a validation message bounced someone back to the form.

**The server re-checks everything the form checked.** The client-side checks
exist to tell someone what is wrong while they are still looking at the field;
they run in a browser the submitter controls, so they prove nothing. If the two
ever disagree, the form will accept something the server rejects — so
`validateDraft` in `public/js/app.js` and `validateSubmission` in
`functions/_lib/submission.js` have to be changed together.

Uploads are checked on their **bytes**, not on the filename or the declared
content type: a text file renamed `.png` and sent as `image/png` is refused.

## Reviewing

**Shift+R**, or `#review`. The queue is behind Cloudflare Access — see
"Deploying" — so only allow-listed addresses reach it, and it is fetched fresh
every time the screen opens.

Approving publishes immediately, for everybody: one event per occurrence of the
repeat rule, with any custom tags the reviewer kept becoming filterable from
then on. There is no separate publish step and nothing to commit.

Approving twice does nothing the second time. The status change is part of the
`UPDATE`, so the database settles a race between a double-click or two
reviewers, and the loser is told the submission was already decided.

Declining keeps the row with `status = 'declined'` rather than deleting it —
someone will ask what happened to a submission.

**Nothing here sends mail.** *Request changes* composes the reply and opens it in
the reviewer's own mail client; approving and declining tell the reviewer to
contact the submitter themselves. Set `CONFIG.office.email` in
`public/js/data.js` for the reply address.

## Deploying

1. Create the Pages project and point it at this repo. Build output directory
   `public`, no build command.
2. Create the database and bucket, and put the returned ID in `wrangler.toml`:

```bash
npx wrangler d1 create fye-calendar
```

```bash
npx wrangler r2 bucket create fye-calendar-flyers
```

3. Apply the schema and seed to the real database:

```bash
npx wrangler d1 execute fye-calendar --remote --file=schema.sql
```

```bash
npx wrangler d1 execute fye-calendar --remote --file=seed.sql
```

4. In **Zero Trust → Access → Applications**, add a self-hosted application
   covering `/review` and `/api/admin/*`, with a policy allowing the specific
   `colostate.edu` addresses that should be able to approve events. Free for up
   to 50 users.
5. Copy the application's **AUD tag** and your team domain into the Pages
   project's environment variables as `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`.

Until step 5 is done the admin API refuses every request. That is deliberate: an
unconfigured deployment is a locked one, never an open one.

6. Add a rate-limiting rule on `/api/submissions` — a few per IP per hour. It is
   the one public write endpoint on a public site.

## The seeded events are placeholders

Every event `seed.sql` inserts is invented — written to build and demonstrate
against — and carries `temporary = 1`. That marks each tile **Sample**, badges
the event dialog, and puts a line above the grid saying so, worded from a live
count: "every event on this calendar" while they all are, "23 events are
placeholder data" as real ones arrive, and nothing once the last one goes.

Approved events never carry the flag. To clear the placeholders:

```bash
npx wrangler d1 execute fye-calendar --remote --command="DELETE FROM event_tags WHERE event_id IN (SELECT id FROM events WHERE temporary = 1); DELETE FROM events WHERE temporary = 1;"
```

The notice removes itself.

## Configuration

`CONFIG` in [`public/js/data.js`](public/js/data.js):

- `slideSeconds` — how long each flyer holds on the stage (default 9).
- `defaultView` — `"week"` or `"month"`.
- `today` — the real current date. Pin it to an ISO string (`"2026-04-27"`) if
  you want the calendar to open somewhere specific for a demo.
- `office.email` — the address a reviewer's *Request changes* reply is
  addressed to. Nothing sends mail; this only fills in the To: field.

`GROUPS` in the same file is the filter bar. Its chips are mirrored into the
`tags` table as `kind = 'fixed'` so the server can tell a tag someone picked off
a list from one they invented — change them here and re-run `seed.sql`, or the
two will disagree about what counts as a new tag.

Environment variables, set in the Pages dashboard:

- `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` — the Access application. Unset means the
  admin API refuses everything.
- `DEV_UNSAFE_NO_AUTH` — local only, via `.dev.vars`. Never set this in the
  dashboard.

The exported `.ics` writes times against an `America/Denver` VTIMEZONE. If this
is ever reused off the Front Range, `TZID` in `public/js/ics.js` is the one thing
to change.

## Notes on rendering

The showcase ticks five times a second, so rendering is targeted rather than
wholesale: the grid rebuilds only when the view, the anchor date or the filters
change; the filter selects are built once and patched, so they keep focus; and
the surfaces holding typed-in text — the submit form and the reviewer's feedback
box — are built once and patched in place so nothing you typed is thrown away.
