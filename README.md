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

## The five surfaces

| Surface | How you get there |
| --- | --- |
| Calendar — week or month grid, searched and filtered | the page itself |
| Event detail — flyer, tags, add-to-calendar, shareable link | click any event |
| Submit an event — straight into the queue | **Submit an Event** in the header, or `#submit` |
| Slideshow for lobby screens and lecture halls | **Slide Show**; arrows/space step, Esc exits |
| Review queue (office only, behind a login) | **Review queue** in the page footer |

The showcase above the grid cycles through whatever is currently in view, in the
order it happens; clicking a row in the running order jumps to it. It holds still
while a dialog is open and while the tab is in the background.

### Keyboard

| | |
| --- | --- |
| `/` | jump to the search box |
| `←` `→` | step the week or month; step between events inside an open one |
| `Esc` | close whatever is open, or clear the search |

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
- `public/favicon.svg` — the tab icon, and the source for the two rasters beside
  it. See [The tab icon](#the-tab-icon).
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

**Five accepted submissions per IP per hour**, after which the endpoint answers
`429` with something a student can read. Only accepted submissions count, so
nobody spends their allowance on their own typos, and the rows live in
`submission_attempts` and are deleted as they age out. This is code rather than
a Cloudflare rule for a reason given under "Deploying".

## Reviewing

The **Review queue** link in the page footer. It points at `/review`, which is a
real path rather than the `#review` fragment on purpose: a fragment never
reaches the server, so Cloudflare Access would have nothing to challenge and a
reviewer would arrive at a queue with no way to sign in. `/review` takes the
challenge, then hands them to the screen — see "Deploying".

Only allow-listed addresses get through, and the queue is fetched fresh every
time the screen opens.

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

## Where it is deployed

| | |
| --- | --- |
| Students | <https://calendar.fyetools.com> |
| Reviewers | <https://fye-calendar.pages.dev/review> — the **Review queue** link in the footer |

Both addresses serve the same Pages project. They are two because Cloudflare
Access can only cover the second, which is explained under "Deploying".

## Deploying

Done once, on 2026-08-10. This is the record of what the steps actually are —
several of them are not what they look like from the outside.

**1. Create the database and bucket first**, before the Pages project, and put
the returned ID in `wrangler.toml`. Creating the project first means its first
build runs against a `database_id` that is still a placeholder.

```bash
npx wrangler d1 create fye-calendar
```

```bash
npx wrangler r2 bucket create fye-calendar-flyers
```

R2 fails with `code: 10042` until R2 is enabled in the dashboard, which asks for
a payment method even though the free tier covers this comfortably.

**2. Create the Pages project from the CLI**, not from the dashboard:

```bash
npx wrangler pages project create fye-calendar --production-branch cloudflare-backend
```

The dashboard's **Connect to Git** flow now creates a *Worker*, not a Pages
project. A Worker serves `public/` correctly and then 404s every route in
`functions/` — file-based routing is a Pages feature — so the site loads and the
entire API is missing. That failure is quiet: the page renders, and only the
data is gone.

**3. Apply the schema and seed:**

```bash
npx wrangler d1 execute fye-calendar --remote --file=schema.sql
```

```bash
npx wrangler d1 execute fye-calendar --remote --file=seed.sql
```

Run the seed even though its events are placeholders. It also inserts the
`kind = 'fixed'` tag rows that mirror `GROUPS`, and without them the server
treats every filter chip as an invented tag and drops it on approval.

`schema.sql` **drops every table**. Never run it against a database with real
submissions in it; for a later change, run the one statement you need.

**4. Deploy.** Since 2026-08-11 this happens on a push to `main`, via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Nobody needs
wrangler, the account, or a checkout.

It can still be run by hand, and this is what the workflow runs:

```bash
npx wrangler pages deploy --branch cloudflare-backend
```

`--branch cloudflare-backend` is **not** a git operation and does not deploy
that branch. It is a label Cloudflare matches against the project's production
branch to decide production-or-preview; the bytes uploaded are whatever is in
the working tree. That is the trap — the branch name in the command says
nothing about what is being deployed.

The project has no Cloudflare Git integration and is not getting one: the
dashboard's Connect-to-Git flow builds a *Worker*, and a Worker cannot run
`functions/` at all. The workflow gets push-to-deploy without that, by driving
the same CLI upload.

**5. Add One-time PIN as a login method**, in **Zero Trust → Settings →
Authentication → Login methods**. A new organisation has only `cloudflare`,
which authenticates whoever holds the Cloudflare account, and an Access
application cannot offer a login method the organisation does not have.

**6. Create the Access application.** **Zero Trust → Access → Applications →
Self-hosted**, on `fye-calendar.pages.dev`, with **two** hostname entries:

| Path | What it does |
| --- | --- |
| `review` | the path a human opens; this is what triggers the login |
| `api/admin` | guards approve, decline, feedback and queue |

Both, or nothing works: without the first nobody can sign in, and without the
second the admin API is unguarded at the edge. Do not add an entry for `/`,
which would lock students out of the calendar.

Set the application to accept **One-time PIN** only, and write the policy as a
single **Include → Emails** rule listing the approvers. Put the identity
provider on the application, never in the policy — an `Authentication Method`
rule inside `Include` denies people for a reason nobody thinks to look for.

**7. Put the AUD tag and team domain in `wrangler.toml`**, as `ACCESS_AUD` and
`ACCESS_TEAM_DOMAIN`, then deploy again.

Not in the Pages dashboard. A `wrangler.toml` `[vars]` block overrides what the
dashboard holds, so a value set there is replaced on the next deploy and the
queue stays closed with nothing to explain it. Neither value is a credential:
Access publishes the AUD in the query string of its own login redirect, which
is also the easiest place to read it from.

Until this step the admin API refuses every request. That is deliberate — an
unconfigured deployment is a locked one, never an open one.

**8. Add the custom domain.** Pages → Custom domains → `calendar.fyetools.com`,
then a `CNAME` at the DNS provider pointing it at `fye-calendar.pages.dev`.

### Why there are two addresses

`fyetools.com` is registered at Hover and its DNS stays there, because the apex
runs a live site that had no reason to be migrated. That has one consequence
worth understanding, because it shapes several things above:

**Cloudflare Access needs a zone on the Cloudflare account, and there is none.**
So Access covers `fye-calendar.pages.dev` and cannot cover
`calendar.fyetools.com`. Reviewers use the pages.dev address; `/review` on the
custom domain redirects there, via `REVIEW_HOST`.

Adding just the subdomain as a zone was the obvious escape and is not available:
Cloudflare accepts only root domains except on paid plans.

On the custom domain, `/api/admin/*` is therefore guarded by the JWT check in
`functions/api/admin/_middleware.js` alone, with no edge in front of it. That is
sound — the middleware verifies signature, audience, issuer and expiry, and
refuses anything without a valid token — but it is one layer where the pages.dev
hostname has two.

**Rate limiting is a zone feature too**, which is why the limiter on
`POST /api/submissions` is code in the Function rather than a dashboard rule.
Five accepted submissions per IP per hour, counted in `submission_attempts`.

If `fyetools.com` is ever moved onto Cloudflare, all of this collapses back into
the simple version: one hostname, Access over it, a WAF rule instead of the
table, and `REVIEW_HOST` unset.

## Backups

Two things exist only inside the Cloudflare account: the D1 database — every
submission and every approval — and the flyer artwork submitters uploaded to
R2. The repo is cloned on several disks and could be re-hosted in an afternoon.
Neither of those could.

[`.github/workflows/backup.yml`](.github/workflows/backup.yml) takes both every
Sunday and uploads them as one encrypted artifact, kept a year. It can also be
run on demand from the Actions tab. The schedule lives in GitHub rather than
Cloudflare for two reasons: Pages Functions have no scheduled handler, and a
backup stored in the account it insures against losing is not a backup.

**It is a rebuild kit, not just a dump.** There is deliberately no second admin
on the Cloudflare account, so the backup has to be sufficient on its own to
stand the calendar up somewhere else — which means the artwork travels with the
rows that point at it. The flyer keys are read out of the dump itself, so the
archive is internally consistent: exactly the artwork the rows in that same
archive reference. Seeded flyers are not included and do not need to be, since
`public/flyers/` is in the repo.

**A failed backup run does not mean there is no backup.** The database and the
artwork fail independently — the flyers live in R2 and need a token permission
the export does not — so if the artwork cannot be fetched, the dump is still
encrypted and uploaded, and the run is failed afterwards rather than instead.
That archive is named **`fye-calendar-backup-DATABASE-ONLY`** instead of
`fye-calendar-backup`, and it is not a rebuild kit: it restores every event and
submission with the uploaded artwork missing. When the newest artifact carries
that name, read the failed run's log — the fetch step prints what wrangler
actually said — and check the token still has Workers R2 Storage → Read. For an
actual rebuild, take the newest artifact named plain `fye-calendar-backup`.

To take one by hand:

```bash
npx wrangler d1 export fye-calendar --remote --output="$HOME/fye-calendar-backup.sql"
```

`$HOME` rather than `~` because a tilde after `=` is not expanded — that
command with `~` creates a directory actually named `~` inside the repo, which
is both the wrong place and a nuisance to delete.

**Write it outside this repository.** The repo is public and the dump contains
every submitter's name and real `@colostate.edu` address. `.gitignore` catches
the obvious filenames, but the habit is what matters — the export command as
written in older notes drops `backup.sql` straight into the repo root.

That is also why the workflow encrypts before uploading: artifacts on a public
repository are readable by anyone who can read the repository.

The one thing the workflow cannot do for itself: **the passphrase must exist
somewhere other than GitHub.** Put `BACKUP_PASSPHRASE` in the office's password
manager. GitHub will not show it to you again, and a backup nobody can decrypt
is not a backup.

### Rebuilding from a backup

This is the procedure that stands in for a second pair of hands on the
Cloudflare account. It has not been rehearsed end to end — **worth doing once
before it is ever needed**, on a throwaway account, rather than for the first
time during the week you are already having.

Unpack the artifact first:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:'THE PASSPHRASE' -in fye-calendar-YYYY-MM-DD.tar.gz.enc -out backup.tar.gz && tar -xzf backup.tar.gz
```

That gives a `.sql` file and a `flyers/` directory. Then, from a clone of this
repo on any Cloudflare account:

1. `npx wrangler d1 create fye-calendar` and `npx wrangler r2 bucket create
   fye-calendar-flyers`, then put the new `database_id` in `wrangler.toml`.
2. `npx wrangler d1 execute fye-calendar --remote --file=YOUR-BACKUP.sql`.
   **Do not run `schema.sql` first** — the backup carries its own `CREATE TABLE`
   statements, and `schema.sql` drops every table.
3. Put the artwork back, one object per file:
   `for f in flyers/*; do npx wrangler r2 object put "fye-calendar-flyers/$(basename "$f")" --remote --file="$f"; done`
4. `npx wrangler pages project create fye-calendar --production-branch
   cloudflare-backend`, then deploy. **From the CLI, not the dashboard** — see
   "Deploying" for why the dashboard produces something that cannot run
   `functions/`.
5. Redo Access: a new Zero Trust organisation, One-time PIN, the application on
   the new `*.pages.dev` host, then its AUD and team domain into `wrangler.toml`
   and deploy again. Until that is done the admin API refuses everything, which
   is the intended state rather than a problem to work around.
6. Point the hostname at the new project — the one step that needs the domain
   registrar rather than Cloudflare.

Steps 1–4 restore the calendar students read. Step 5 restores the reviewers'
ability to approve anything.

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

**That command does not remove the artwork, and the artwork is the part with
other people's data on it.** The seeded flyers are committed static files in
`public/flyers/`, not R2 uploads — nothing in the database points at them by
key, the retention sweep never considers them (it only walks the `f-` prefix in
the bucket), and they stay fetchable at `/flyers/ispe.png` and the rest long
after every row that displayed them is gone. Two of them carry live QR codes to
a real GroupMe and a real Instagram, and one names a speaker.

So clearing the placeholders is two steps, and the second is easy to forget:

```bash
git rm public/flyers/aiaa.png public/flyers/cookie.png public/flyers/ispe.pdf public/flyers/ispe.png public/flyers/major.pdf public/flyers/major.png public/flyers/peru.pdf public/flyers/peru.png
```

Do the second only when the placeholders are actually going, and check that no
approved event has inherited a seeded key first — `flyer_key` on a real event is
normally an `f-…` R2 key, but a seeded event's is a bare name like `peru`.

## Old events remove themselves

R2 is the one part of this with a bill attached to how long it runs rather than
to how much it does, so three things are collected.

**Events more than three months past** are deleted, and if one was the last
event using an uploaded flyer, that file is deleted from R2 with it. Change the
window with `EVENT_RETENTION_MONTHS` in `wrangler.toml`, or set it to `"0"` to
keep every event forever.

**A declined submission's flyer**, a day after the decision. It produced no
events and never will, so it is cost with no purpose. The submission row is
still kept — "we have no record of it" is a bad answer to somebody asking what
happened to theirs — but the row is a few hundred bytes and the artwork is
megabytes, so only the pointer survives. The day is a reviewer's grace period:
long enough to say they did not mean it while the file is still there.

**Uploads no submission ever claimed**, once they are a day old. `POST
/api/flyers` stores the file and hands back a key *before* the submission that
names it exists, so anything that stops a submission after the upload — a
server-side refusal, a 429 from the rate limiter, a dropped connection, a closed
tab — leaves an object in the bucket that nothing has ever pointed at, and the
retry uploads a second copy. This is the leak that needs no reviewer and no
approval, only somebody with a file. It is found by walking the bucket and
asking the database which keys are spoken for, because an object nothing
references cannot be found from the database at all.

`EVENT_RETENTION_MONTHS = "0"` turns off **only the first of those three**. It
says the calendar keeps its history. A declined submission's artwork was never
on the calendar and an unclaimed upload never even reached the queue, so neither
is a policy anybody would want to opt out of by asking for a longer memory.

The threshold protecting an upload is a day, and the window it is really
guarding is seconds — the client uploads when Submit is pressed and posts the
submission on the next round trip. Anything that ever moves the upload earlier
in the form spends that margin.

**There is no cron, because Pages Functions have no scheduled handler** —
`scheduled` is a Worker feature and this is a Pages project on purpose (see
step 2 of "Deploying"). So the sweep rides on writes: submitting an event and
approving one each start one, after their own response has gone back. At most
one real sweep runs every twelve hours however many submissions arrive, claimed
through the `maintenance` table so two requests cannot both sweep. A calendar
nobody is adding to is also a calendar nothing is accumulating in, which is why
that is sufficient rather than merely convenient.

Three things it deliberately does not touch:

- **A flyer with any surviving event.** A weekly series straddling the cutoff
  keeps its artwork until the last occurrence ages out.
- **A pending submission's flyer.** It is in the queue and its reviewer has to
  see it to decide.
- **Anything decided or uploaded in the last day.** One grace period, used for
  three different reasons — see `SETTLE_MS` and `ORPHAN_MIN_AGE_MS`.

Nothing here deletes a submission row. Every decision the office ever made is
still on record; it is only the artwork that goes.

`functions/_lib/retention.js`, with the reasoning in the comments.

**An existing database needs the table**, since `schema.sql` drops everything
and cannot be re-run against real data:

```bash
npx wrangler d1 execute fye-calendar --remote --command="CREATE TABLE IF NOT EXISTS maintenance (name TEXT PRIMARY KEY, at INTEGER NOT NULL);"
```

Without it every sweep throws, is swallowed, and nothing is ever deleted —
quietly, since the failure only reaches the Function's log.

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

Environment variables, in `[vars]` in `wrangler.toml` rather than the Pages
dashboard — see step 7 of "Deploying" for why that distinction matters:

- `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` — the Access application. Unset means the
  admin API refuses everything.
- `REVIEW_HOST` — the one hostname Access covers. `/review` asked on any other
  hostname redirects here, so a reviewer always lands somewhere they can sign
  in. The footer link in `public/index.html` names the same host and has to move
  with it. Unset, `/review` stays where it was asked, which is right for a
  deployment where Access covers every hostname.
- `EVENT_RETENTION_MONTHS` — how long an event stays after it has happened,
  before it and its uploaded flyer are deleted. Unset means three months; `"0"`
  keeps every event forever, and does not stop declined flyers and unclaimed
  uploads being collected. See "Old events remove themselves".
- `DEV_UNSAFE_NO_AUTH` — local only, via `.dev.vars`. Never set this anywhere
  else.

The exported `.ics` writes times against an `America/Denver` VTIMEZONE. If this
is ever reused off the Front Range, `TZID` in `public/js/ics.js` is the one thing
to change.

## The tab icon

`public/favicon.svg` is the drawing: a calendar page in the CSU signature green
and gold, with one date in the app's teal accent. Beside it sit two rasters
generated from it, `favicon.ico` (48, 32 and 16px) and `apple-touch-icon.png`
(180px, for an iOS home screen). All three are linked from the `<head>` of
`public/index.html`, and Pages serves them from the site root.

The rasters do not follow a change to the SVG. After editing it, rebuild them —
this needs ImageMagick (`brew install imagemagick`):

```
cd public
magick -background none favicon.svg -define icon:auto-resize=48,32,16 favicon.ico
magick -background "#1f4d2b" favicon.svg -resize 180x180 -alpha remove -alpha off -strip -depth 8 apple-touch-icon.png
```

The touch icon is flattened onto the green rather than kept transparent because
iOS masks its own rounded corners onto the square, and transparent corners come
out black underneath that mask.

Whatever replaces this drawing has to survive 16px. That is why it is four date
blocks and not a real month grid, and why there is no lettering: at tab size a
3x3 of blocks averages into a gray smear, and a letterform into a blot. Check a
change at 16px before keeping it, rather than at the size you drew it:

```
magick "public/favicon.ico[2]" -scale 320x320 /tmp/favicon-16.png
```

## Notes on rendering

The showcase ticks five times a second, so rendering is targeted rather than
wholesale: the grid rebuilds only when the view, the anchor date or the filters
change; the filter selects are built once and patched, so they keep focus; and
the surfaces holding typed-in text — the submit form and the reviewer's feedback
box — are built once and patched in place so nothing you typed is thrown away.
