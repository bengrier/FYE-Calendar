/* POST /api/submissions — a student submitting an event.

   The one public write endpoint on a public site, so it assumes the body is
   hostile: every field is re-validated here, the flyer is only accepted as a
   key this API itself issued, and nothing it writes is visible to anybody until
   a reviewer approves it.

   Rate limiting is done here in code, which is the second choice. A Cloudflare
   rate limiting rule would be better — it costs nothing, runs before any of
   this, and cannot be reasoned around — but such a rule belongs to a zone, and
   this deployment has none: it is served from a pages.dev hostname and from a
   custom domain whose DNS is not on Cloudflare. If that domain is ever moved
   onto the account, replace this with an edge rule and delete the table. */

import { json, fail, methodNotAllowed, readJson, uid } from "../_lib/http.js";
import { validateSubmission } from "../_lib/submission.js";

var WINDOW_MS = 60 * 60 * 1000;
var LIMIT = 5;

/* Counts only submissions that were actually accepted, not requests made. A
   student fixing a validation message would otherwise spend their allowance on
   their own typing, and the thing being rationed is rows in the office's queue.
   A flood of malformed bodies still creates nothing; it costs reads. */
async function overLimit(db, ip) {
  if (!ip) return false;

  await db
    .prepare("DELETE FROM submission_attempts WHERE at < ?")
    .bind(Date.now() - WINDOW_MS)
    .run();

  var row = await db
    .prepare("SELECT COUNT(*) AS n FROM submission_attempts WHERE ip = ?")
    .bind(ip)
    .first();

  return !!row && row.n >= LIMIT;
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  /* Set by Cloudflare on every request that reaches a Function, and not
     forgeable by the client — an inbound CF-Connecting-IP header is replaced,
     not passed through. */
  var ip = context.request.headers.get("CF-Connecting-IP") || "";

  if (await overLimit(context.env.DB, ip)) {
    return fail(
      429,
      "That is a lot of submissions from one place in an hour. Wait a little, " +
      "or email the office if you have several events to send at once."
    );
  }

  var body = await readJson(context.request);
  var todayIso = new Date().toISOString().slice(0, 10);
  var checked = validateSubmission(body, todayIso);

  if (!checked.ok) return fail(400, checked.message, checked.field);

  var sub = checked.value;
  var db = context.env.DB;
  var id = uid("s");

  /* The flyer is referenced by a key POST /api/flyers handed out moments ago.
     Taking a caller's word for it would let anyone point a submission at any
     object in the bucket, so it is confirmed to exist and to be unclaimed. */
  var flyerKey = typeof body.flyerKey === "string" ? body.flyerKey.trim() : "";
  if (flyerKey) {
    if (!/^f-[A-Za-z0-9._-]{6,120}$/.test(flyerKey)) {
      return fail(400, "That flyer reference is not one we issued.", "flyer");
    }
    var claimed = await db
      .prepare("SELECT 1 FROM submissions WHERE flyer_key = ?")
      .bind(flyerKey)
      .first();
    if (claimed) return fail(400, "That flyer has already been used.", "flyer");

    var object = await context.env.FLYERS.head(flyerKey);
    if (!object) return fail(400, "That flyer upload was not found.", "flyer");
  }

  var statements = [
    db
      .prepare(
        "INSERT INTO submissions (id, status, title, org, place, date, start, time, blurb, " +
        "repeat_rule, repeat_until, by_name, by_email, flyer_key, awaiting, submitted_at) " +
        "VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
      )
      .bind(
        id, sub.title, sub.org, sub.place, sub.date, sub.start, sub.time, sub.blurb,
        sub.repeat, sub.repeatUntil, sub.by, sub.email, flyerKey || null, Date.now()
      )
  ];

  /* A tag is "new" only when the calendar has never heard of it. A filter-bar
     chip and an already-approved custom tag are both known; anything else the
     submitter invented, and a reviewer decides whether it becomes filterable.
     Deciding that here rather than trusting the client's flag is the difference
     between the office choosing that and the submitter choosing it. */
  var known = new Set(
    (await db.prepare("SELECT name FROM tags WHERE approved = 1").all()).results
      .map(function (r) { return r.name; })
  );

  sub.tags.concat(sub.newTags).forEach(function (tag) {
    statements.push(
      db
        .prepare("INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES (?, ?, ?)")
        .bind(id, tag, known.has(tag) ? 0 : 1)
    );
  });

  /* Recorded in the same batch as the submission, so the count can never drift
     from what is actually in the queue in either direction. */
  if (ip) {
    statements.push(
      db
        .prepare("INSERT INTO submission_attempts (ip, at) VALUES (?, ?)")
        .bind(ip, Date.now())
    );
  }

  await db.batch(statements);

  return json({ id: id }, { status: 201 });
}
