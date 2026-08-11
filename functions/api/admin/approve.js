/* POST /api/admin/approve — the submission becomes events.

   One event row per occurrence, the kept custom tags become filterable for
   everyone, and the submission leaves the queue.

   Two things this has to get right:

   - **Approving twice must not publish twice.** Someone double-clicks, or two
     reviewers open the queue at once. The status check is part of the UPDATE
     rather than a read beforehand, so the database decides who wins and the
     loser is told the submission was already dealt with.
   - **It is all or nothing.** A partial approval — some occurrences published,
     the submission still queued — is the kind of mess someone has to unpick by
     hand, so every statement goes in one batch, which D1 runs as a transaction. */

import { json, fail, methodNotAllowed, readJson, uid } from "../../_lib/http.js";
import { occurrences } from "../../_lib/submission.js";
import { sweepInBackground } from "../../_lib/retention.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var id = body && typeof body.id === "string" ? body.id : "";
  if (!id) return fail(400, "Which submission?");

  var db = context.env.DB;
  var now = Date.now();
  var identity = context.data.identity || "unknown";

  /* Claim it first. If this updates nothing, somebody else got there. */
  var claim = await db
    .prepare(
      "UPDATE submissions SET status = 'approved', decided_at = ?, decided_by = ? " +
      "WHERE id = ? AND status = 'pending'"
    )
    .bind(now, identity, id)
    .run();

  if (!claim.meta.changes) {
    return fail(409, "That submission has already been decided.");
  }

  var sub = await db
    .prepare(
      "SELECT id, title, org, place, date, start, time, blurb, repeat_rule, repeat_until, flyer_key " +
      "FROM submissions WHERE id = ?"
    )
    .bind(id)
    .first();

  var rows = (
    await db.prepare("SELECT tag, is_new FROM submission_tags WHERE submission_id = ?").bind(id).all()
  ).results;

  /* Only tags the reviewer actually kept. A tag the submitter invented and the
     reviewer did not approve is dropped from the event entirely, not quietly
     published unfilterable. */
  var keep = Array.isArray(body.approvedTags) ? body.approvedTags : [];
  var tags = rows
    .filter(function (r) { return !r.is_new || keep.indexOf(r.tag) > -1; })
    .map(function (r) { return r.tag; });

  var dates = occurrences({
    date: sub.date,
    repeat: sub.repeat_rule,
    repeatUntil: sub.repeat_until
  });

  var statements = [];

  dates.forEach(function (iso, i) {
    var eventId = uid("e") + (dates.length > 1 ? "-" + (i + 1) : "");
    statements.push(
      db
        .prepare(
          "INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, " +
          "temporary, from_submission, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)"
        )
        .bind(
          eventId, iso, sub.start, sub.time, sub.title, sub.org, sub.place, sub.blurb,
          sub.flyer_key, sub.id, now
        )
    );
    tags.forEach(function (tag) {
      statements.push(
        db.prepare("INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES (?, ?)").bind(eventId, tag)
      );
    });
  });

  /* A kept custom tag becomes filterable for everybody from now on. */
  rows
    .filter(function (r) { return r.is_new && keep.indexOf(r.tag) > -1; })
    .forEach(function (r) {
      statements.push(
        db.prepare("INSERT OR REPLACE INTO tags (name, kind, approved) VALUES (?, 'custom', 1)").bind(r.tag)
      );
    });

  if (statements.length) await db.batch(statements);

  /* The other end of the same idea as the submit path: events arriving is when
     events leaving is due. Deliberately after the batch above, never before —
     a sweep that ran first would be looking at this submission in the moment
     between its status change and its events existing. The settling period in
     retention.js is what makes that safe rather than this ordering, but there
     is no reason to lean on it. */
  sweepInBackground(context);

  return json({ published: dates.length, dates: dates });
}
