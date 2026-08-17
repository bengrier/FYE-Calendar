/* Removing events that have long gone by, and the artwork with them.

   The calendar is a calendar. Nobody scrolls back to an event three months in
   the past, but its flyer is a real file in R2 being paid for indefinitely, and
   a calendar that is never emptied only ever grows. So events older than the
   retention window are deleted, and an uploaded flyer left with nothing
   pointing at it goes with them.

   **There is no cron here, and that is not laziness.** Pages Functions have no
   scheduled handler — `scheduled` is a Worker feature, and this project is
   Pages precisely because a Worker cannot run `functions/` at all (see
   Handoff, "The dashboard builds a Worker"). So the sweep rides on writes:
   submitting an event and approving one each start it, after their own response
   is already on its way to the caller. That is enough rather than merely
   convenient — a calendar nobody is adding to is also a calendar nothing is
   accumulating in.

   There is a second job here, on the same schedule and for the same reason:
   collecting uploads no submission ever claimed. A flyer is written to R2
   *before* the submission that names it exists, so an upload that is not
   followed by an accepted submission leaves a file nothing has ever pointed at.
   That one cannot be found from the database — an object nothing references is
   by definition not in it — so it walks the bucket instead. See
   `sweepOrphanUploads`.

   And a third, which is not about cost at all: **erasing the submitter's name
   and address from submissions that have been decided.** `approve.js` and
   `decline.js` each do that in the statement that decides the row, so this
   normally finds nothing. It is here as the backstop, and it is the one job in
   this file that runs first — see `sweepIdentities`.

   Three properties everything below is written to have, because a job that
   runs unattended on somebody else's request is a job nobody is watching:

   - **It is safe to run twice, or twenty times.** The claim in `maybeSweep`
     means only one run per interval actually does anything, but a run that
     slipped through would find nothing left to do.
   - **It resumes rather than loses.** The set of flyers to delete is re-derived
     from the database on every run instead of remembered from the run that
     orphaned them, so a sweep that dies half way is corrected by the next one
     rather than leaking a file forever.
   - **It never fails the request it rode in on.** Callers hand this to
     `waitUntil` and it swallows its own errors. A student's submission must not
     fail because a cleanup did. */

/* Only keys this API issued. A seeded event's flyer_key is a bare name like
   "peru", which is a static file committed to the repo — asking R2 to delete
   it would do nothing, but the point is to never reach for it at all. */
var UPLOAD_KEY = /^f-[A-Za-z0-9._-]{6,120}$/;

/* At most one real sweep per this much elapsed time, however many writes come
   in. Retention measured in months does not care about a day of lag, and the
   alternative is every submission paying for a delete scan. */
var INTERVAL_MS = 12 * 60 * 60 * 1000;

/* Approving sets the submission's status in one statement and writes its events
   in the next batch. For those milliseconds the submission looks exactly like
   one whose events have all aged out — approved, holding a flyer, no events
   pointing at it — and a sweep started by that very approval could delete the
   artwork of the event being published. Nothing is a candidate until it has
   been decided for a day, which closes that window with room to spare. */
var SETTLE_MS = 24 * 60 * 60 * 1000;

/* Bounded work per request. The number of orphaned flyers in a normal sweep is
   a handful; this only matters the first time it runs against a calendar that
   has been accumulating, where the leftovers are simply taken next time. */
var MAX_FLYERS_PER_SWEEP = 200;

/* An upload nothing has ever claimed has to be old before it is touched, and
   the real window it is protecting is seconds: the client uploads the file when
   Submit is pressed and posts the submission on the next round trip. A day is
   absurdly generous on purpose — this deletes a file a person chose, and the
   cost of waiting is one flyer's worth of storage for one more day, against
   deleting the artwork out from under a submission still in flight. Anything
   that ever moves the upload earlier in the form spends this margin. */
var ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/* Bounds on the bucket walk. Keys are `f-<base36 time>-<random>`, so they list
   in roughly the order they were uploaded and the oldest — the ones most likely
   to be orphaned — come first. A bucket bigger than this is examined from the
   front each sweep, which is the right end to look at. */
var MAX_KEYS_EXAMINED = 5000;
var LIST_PAGE = 1000;

/* D1 allows a hundred bound parameters in one statement. Half that, so a change
   here cannot quietly cross the line. */
var LOOKUP_CHUNK = 50;

var DEFAULT_MONTHS = 3;

/* Start a sweep without making the caller wait for it or care whether it
   worked. Call this after the response has been built. */
export function sweepInBackground(context) {
  var work = maybeSweep(context.env).catch(function (e) {
    console.log("retention sweep failed: " + (e && e.message ? e.message : e));
  });

  if (typeof context.waitUntil === "function") context.waitUntil(work);
}

/* Runs a sweep if one is due, and returns null if it was not. The "is it due"
   check is a claim rather than a read-then-write, the same way approve claims a
   submission: two requests arriving together must not both sweep, and the
   database is the only thing in a position to settle that. */
export async function maybeSweep(env) {
  if (!env || !env.DB) return null;

  var now = Date.now();
  var db = env.DB;

  var claim = await db
    .prepare(
      "INSERT INTO maintenance (name, at) VALUES ('purge', ?) " +
      "ON CONFLICT(name) DO UPDATE SET at = ? WHERE maintenance.at < ?"
    )
    .bind(now, now, now - INTERVAL_MS)
    .run();

  /* Somebody else's request is already doing this, or one did recently. */
  if (!claim.meta.changes) return null;

  return sweep(env, now);
}

/* The sweep itself, with no scheduling opinion — separated so it can be called
   directly from a one-off script or a test without waiting out an interval.

   `EVENT_RETENTION_MONTHS` turns off exactly one of the four things below —
   deleting events for age. It says the calendar keeps its history; it does not
   say the bucket should keep files that were never part of that history, and it
   very much does not say the database should keep a student's address. A
   declined submission's artwork was never on the calendar and an unclaimed
   upload never even reached the queue, so neither is a retention policy anybody
   would want to opt out of, and all three are done regardless.

   The flyer pass runs after the events either way. With retention off it simply
   finds less — an approved submission still has its events, so only the
   declined ones are left with nothing to be on. That falls out of the query
   being written against the state of the database rather than against what this
   run happened to delete. */
export async function sweep(env, now) {
  var months = retentionMonths(env);
  var db = env.DB;
  var cutoff = months ? monthsBefore(isoDay(now), months) : null;
  var events = 0;

  /* First, and before anything that can throw. Everything else in this file
     frees storage, and a sweep that dies before finishing costs a few cents;
     this one is holding personal data that should already be gone. */
  var identities = await sweepIdentities(db);

  if (months) {
    /* Events first: text dates in ISO order compare correctly, which is the
       whole reason the schema stores them that way. The tags go in the same
       batch as the events they belong to, so a row can never be left describing
       an event that is gone. */
    var removed = await db.batch([
      db
        .prepare("DELETE FROM event_tags WHERE event_id IN (SELECT id FROM events WHERE date < ?)")
        .bind(cutoff),
      db.prepare("DELETE FROM events WHERE date < ?").bind(cutoff)
    ]);

    events = removed[1].meta.changes;
  }

  var flyers = await sweepFlyers(env, now);
  var orphans = await sweepOrphanUploads(env, now);

  var summary = {
    cutoff: cutoff,
    identities: identities,
    events: events,
    flyers: flyers,
    orphans: orphans
  };

  if (summary.events || summary.flyers || summary.orphans || summary.identities) {
    console.log(
      "retention: removed " + summary.events + " event(s) before " +
      (cutoff || "never") + ", " + summary.flyers +
      " flyer(s) with nothing left to be on, " +
      summary.orphans + " unclaimed upload(s), and erased the contact details " +
      "left on " + summary.identities + " decided submission(s)"
    );
  }

  return summary;
}

/* The submitter's name and address on a submission that has been decided.

   These exist for one purpose: so the office can reach a person about a
   submission it has not decided yet. Once it is approved or declined that
   purpose is spent, and what is left is a student's name and real
   `@colostate.edu` address sitting in a database on infrastructure the
   university does not own, in every backup taken from then on, read by nothing.
   `queue.js` selects `WHERE status = 'pending'`, so from the moment of the
   decision no surface in this application ever displays them again.

   **This is a backstop, not the mechanism.** `approve.js` and `decline.js` each
   erase these columns in the same statement that sets the status, so on a
   healthy deployment this finds nothing, every time. It is here for two cases
   the decision path cannot cover: rows decided before that behaviour shipped,
   and any future path that learns to decide a submission and forgets to erase.
   Personal data outliving its purpose because one write did not happen is
   exactly the failure that should not need anybody to notice it.

   Unlike everything else in this file there is no settling period. The grace
   elsewhere protects a reviewer who wants a *file* back; nothing here can be
   restored by waiting, and the address is the one thing there is no argument
   for keeping an hour longer than the decision.

   Cleared to '' rather than NULL because both columns are NOT NULL and
   `schema.sql` drops every table, so it can never be run against the live
   database to relax that. The empty string is unambiguous anyway: the validator
   refuses a blank name or address, so every row that still has a submitter has
   something in both. */
async function sweepIdentities(db) {
  var erased = await db
    .prepare(
      "UPDATE submissions SET by_name = '', by_email = '' " +
      "WHERE status IN ('approved', 'declined') AND (by_name <> '' OR by_email <> '')"
    )
    .run();

  return erased.meta.changes;
}

/* Artwork with no event left to appear on.

   Derived from the submission side rather than from the event rows just
   deleted, and that is the important choice: a flyer is orphaned by the *state*
   of the database, not by the run that happened to orphan it, so a sweep that
   crashed between deleting the events and deleting the file is simply corrected
   by the next sweep instead of leaving a file nothing will ever look for again.

   Two ways a submission's flyer ends up with nothing to be on:

   - **Approved, and every event it produced has since aged out.** The usual
     case, and the reason the events are deleted before this runs.
   - **Declined.** It produced no events and never will, so the file is cost
     with no purpose from the moment of the decision. The row is still kept —
     "we have no record of it" is a bad answer to somebody asking what happened
     to their submission — but the row is a few hundred bytes and the artwork is
     megabytes, so only the pointer survives.

   A *pending* submission is excluded, because it is in the queue and its
   reviewer has to see the artwork to decide.

   The settling period covers both, for different reasons: for an approval it is
   the gap between the status change and the events being written, and for a
   decline it is a reviewer having until tomorrow to say they did not mean it,
   while the artwork is still there to restore. */
async function sweepFlyers(env, now) {
  var db = env.DB;

  var candidates = (
    await db
      .prepare(
        "SELECT DISTINCT flyer_key FROM submissions s " +
        "WHERE s.flyer_key IS NOT NULL AND s.status IN ('approved', 'declined') " +
        "AND s.decided_at IS NOT NULL AND s.decided_at < ? " +
        "AND NOT EXISTS (SELECT 1 FROM events e WHERE e.flyer_key = s.flyer_key) " +
        "LIMIT " + MAX_FLYERS_PER_SWEEP
      )
      .bind(now - SETTLE_MS)
      .all()
  ).results
    .map(function (row) { return row.flyer_key; })
    .filter(function (key) { return UPLOAD_KEY.test(key); });

  if (!candidates.length) return 0;

  /* The object goes before the pointer to it does. The other order frees
     nothing if the delete fails and loses the only record of which file to free
     — an orphan in the bucket, paid for forever, with nothing left in the
     database that could name it. This way a failure between the two leaves a
     submission naming a file that is gone, which costs a dead string in a row
     nobody reads after the decision. */
  if (env.FLYERS) await env.FLYERS.delete(candidates);

  await db.batch(
    candidates.map(function (key) {
      return db.prepare("UPDATE submissions SET flyer_key = NULL WHERE flyer_key = ?").bind(key);
    })
  );

  return candidates.length;
}

/* Uploads no submission ever claimed.

   `POST /api/flyers` writes the file and hands back a key before anything
   references it, because the submission has to name a key that already exists.
   So every upload that is not followed by an accepted submission leaves an
   object in R2 that nothing has ever pointed at and nothing will ever look for
   again. That is not an edge case: the client uploads and *then* posts, so a
   server-side validation refusal, a 429 from the rate limiter, a dropped
   connection or a closed tab all leave one behind, and the retry that follows
   uploads a second copy. It is also the leak that needs no reviewer and no
   approval — anyone with a file can make them, ten megabytes at a time.

   This is the one part of the sweep that cannot work from the database, since
   an object nothing references is by definition not in it. It walks the bucket
   instead and asks D1 about what it finds.

   The order is the opposite of everywhere else in this file, and deliberately:
   here the bucket is the list of candidates and the database is the authority
   on which of them are spoken for, so *nothing* is deleted until D1 has been
   asked and has answered. A failed lookup deletes nothing. */
async function sweepOrphanUploads(env, now) {
  if (!env.FLYERS || !env.DB) return 0;

  var cutoff = now - ORPHAN_MIN_AGE_MS;
  var cursor = null;
  var examined = 0;
  var deleted = 0;

  while (examined < MAX_KEYS_EXAMINED && deleted < MAX_FLYERS_PER_SWEEP) {
    var page = await env.FLYERS.list({
      prefix: "f-",
      limit: LIST_PAGE,
      cursor: cursor || undefined
    });

    var aged = [];

    page.objects.forEach(function (object) {
      examined++;
      if (!UPLOAD_KEY.test(object.key)) return;
      /* `uploaded` is R2's own record of when it took the bytes, not anything a
         caller supplied, which is what makes an age threshold worth having. */
      if (!object.uploaded || object.uploaded.getTime() >= cutoff) return;
      aged.push(object.key);
    });

    var orphans = await unclaimed(env.DB, aged);

    if (orphans.length) {
      await env.FLYERS.delete(orphans);
      deleted += orphans.length;
    }

    if (!page.truncated) break;
    cursor = page.cursor;
  }

  return deleted;
}

/* Which of these keys nothing in the database names.

   Both tables, not just submissions. A submission is the only thing that ever
   claims a key, so events should never hold one its submission does not — but
   this decides whether a file is destroyed, and asking the second question
   costs one more statement. */
async function unclaimed(db, keys) {
  if (!keys.length) return [];

  var claimed = {};

  for (var i = 0; i < keys.length; i += LOOKUP_CHUNK) {
    var chunk = keys.slice(i, i + LOOKUP_CHUNK);
    var marks = chunk.map(function () { return "?"; }).join(",");

    var found = await db.batch([
      bindAll(db.prepare("SELECT flyer_key AS k FROM submissions WHERE flyer_key IN (" + marks + ")"), chunk),
      bindAll(db.prepare("SELECT flyer_key AS k FROM events WHERE flyer_key IN (" + marks + ")"), chunk)
    ]);

    found.forEach(function (result) {
      result.results.forEach(function (row) { claimed[row.k] = true; });
    });
  }

  return keys.filter(function (key) { return !claimed[key]; });
}

/* `bind` takes its parameters positionally and there is no spread in this
   codebase's style. */
function bindAll(statement, values) {
  return statement.bind.apply(statement, values);
}

/* Unset means the default. "0" — or anything that is not a positive number —
   means the sweep is off, which is how a deployment that wants to keep
   everything says so. */
function retentionMonths(env) {
  var raw = env.EVENT_RETENTION_MONTHS;
  if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT_MONTHS;

  var months = Number(String(raw).trim());
  return Number.isFinite(months) && months > 0 ? Math.floor(months) : 0;
}

/* Whole days in local — here, UTC — time, never an instant, which is the same
   rule the rest of the calendar keeps: an event must not slide a day because of
   where the request landed. */
function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/* Calendar months back, clamped to the end of the month when the day of month
   does not exist there: three months before 31 May is 28 or 29 February, not a
   date in March. Cutoffs land wherever the month arithmetic puts them, so this
   is only ever a day either way, but a date function that can return 31
   February is a date function that will eventually be asked to. */
export function monthsBefore(iso, months) {
  var year = Number(iso.slice(0, 4));
  var month = Number(iso.slice(5, 7));
  var day = Number(iso.slice(8, 10));

  var count = year * 12 + (month - 1) - months;
  var targetYear = Math.floor(count / 12);
  var targetMonth = count - targetYear * 12;          // 0–11, never negative

  var lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  if (day > lastDay) day = lastDay;

  return targetYear + "-" + pad(targetMonth + 1) + "-" + pad(day);
}

function pad(n) {
  return (n < 10 ? "0" : "") + n;
}
