/* POST /api/admin/edit — what a published event says.

   The gap the other two admin writes left. `reschedule.js` moves a date and
   `remove.js` takes one off, and between them they could fix a *when* and a
   whether — but not a room number, not a title with a typo in it, and not a
   flyer that turns out to be last semester's. Those meant asking the club to
   send the whole thing again, or a `wrangler d1 execute` from somebody's
   laptop, which is to say they meant asking whoever set this up.

   Two shapes, the same two the panel is organised around:

     { id }        one event — a seeded placeholder, or a one-off
     { series }    every event one approval wrote

   A series is edited whole and cannot be edited any other way. Every row an
   approval writes carries the same title, the same room and the same flyer —
   that is what makes them one thing on the review screen — and letting the
   third Tuesday say something different would leave a list whose lead event no
   longer describes what is under it. What genuinely varies between occurrences
   is the date, and that has had its own control all along: Move, one row at a
   time, in `reschedule.js`.

   **The submission is not touched.** It is the record of what was proposed and
   who decided it, and rewriting it to match a correction made three weeks later
   would quietly destroy the only answer to "what did I actually send you". So
   an edited event and the submission behind it are allowed to differ, and the
   thing that is live is the event.

   Everything here is a whole-record replacement rather than a patch: the screen
   sends every field back, including the ones nobody touched, and this writes
   all of them. A patch would need a rule for telling "left alone" apart from
   "emptied", and the field where that goes wrong is the flyer. */

import { json, fail, methodNotAllowed, readJson } from "../../_lib/http.js";
import { validateEventFields } from "../../_lib/submission.js";
import { sweepInBackground } from "../../_lib/retention.js";

/* A key this API issued, matching the one in retention.js. Anything else a
   reviewer can name is a key the event already had — see `chooseFlyer`. */
var UPLOAD_KEY = /^f-[A-Za-z0-9._-]{6,120}$/;

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var id = body && typeof body.id === "string" ? body.id.trim() : "";
  var series = body && typeof body.series === "string" ? body.series.trim() : "";

  if (!id && !series) return fail(400, "Which event?");

  var checked = validateEventFields(body);
  if (!checked.ok) return fail(400, checked.message, checked.field);
  var value = checked.value;

  var db = context.env.DB;

  /* `from_submission = ?` never matches NULL, which is what keeps a request
     naming an empty series from sweeping up the seeded events — the same guard
     remove.js relies on, and for the same reason. */
  var where = id
    ? { clause: "id = ?", args: [id] }
    : { clause: "from_submission = ?", args: [series] };

  /* Read before writing, for two things the request cannot be trusted for: that
     there is anything here to edit at all, and which flyer these events are
     already on. */
  var targets = (
    await bind(
      db.prepare("SELECT id, flyer_key FROM events WHERE " + where.clause + " ORDER BY date"),
      where.args
    ).all()
  ).results;

  if (!targets.length) {
    return fail(409, id
      ? "That event is no longer on the calendar."
      : "Those events are no longer on the calendar.");
  }

  var flyer = chooseFlyer(body, targets);
  if (!flyer.ok) return fail(400, flyer.message, "flyer");

  /* One batch, which D1 runs as one transaction. The tags are rewritten rather
     than reconciled — worked out as a difference they would need three
     statements and a rule for each, and the screen already knows the answer it
     wants — so the delete and the inserts have to land together or a series
     would be left with no tags at all. */
  var statements = [
    bind(
      db.prepare(
        "UPDATE events SET title = ?, org = ?, place = ?, blurb = ?, start = ?, " +
        "time = ?, flyer_key = ? WHERE " + where.clause
      ),
      [value.title, value.org, value.place, value.blurb, value.start, value.time, flyer.key]
        .concat(where.args)
    ),
    bind(
      db.prepare(
        "DELETE FROM event_tags WHERE event_id IN (SELECT id FROM events WHERE " +
        where.clause + ")"
      ),
      where.args
    )
  ];

  targets.forEach(function (row) {
    value.tags.forEach(function (tag) {
      statements.push(
        db.prepare("INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES (?, ?)")
          .bind(row.id, tag)
      );
    });
  });

  /* A word the catalogue has never heard of is one the reviewer has just
     written, and it is filterable from now on — the same thing approving a
     submitter's new tag does.

     OR IGNORE rather than OR REPLACE, which is the difference from approve.js
     and is deliberate twice over. A fixed chip keeps `kind = 'fixed'`, so the
     filter bar does not start listing "Workshop" as a custom tag; and a custom
     tag the office has turned off stays off, because putting it back on an
     event is not the same decision as putting it back in everybody's filter
     bar. That decision has its own tab. */
  value.tags.forEach(function (tag) {
    statements.push(
      db.prepare("INSERT OR IGNORE INTO tags (name, kind, approved) VALUES (?, 'custom', 1)")
        .bind(tag)
    );
  });

  await db.batch(statements);

  /* Only when the artwork actually changed, because that is the only thing this
     endpoint can orphan: the flyer these events were on may now have nothing
     pointing at it. Whether it is freed is retention.js's decision and not
     this one — a key the submission still names waits out the settling period
     there, and one that only ever existed because of an earlier edit is found
     by the bucket walk instead. Either way the file goes, and neither way is
     this request's to wait for. */
  if (flyer.changed) sweepInBackground(context);

  return json({ updated: targets.length, flyer: flyer.key });
}

/* The flyer the events should end up on.

   Three answers a reviewer can give, and the request has to be able to say all
   three apart: keep the one that is there, put this newly uploaded one on
   instead, or take it off and let the event list as a text card. `null` is the
   third of those and is why this is a whole-record write — a patch that treats
   a missing field as "unchanged" cannot express "removed" without a second flag
   that means the same thing twice.

   What it will accept as a key is narrow on purpose. An upload this API issued,
   or a key these events are already on — which is how the seeded events keep
   their bundled artwork, since "peru" is a file in the repo and not something
   `UPLOAD_KEY` will ever match. Anything else is a reviewer being handed the
   ability to point an event at an arbitrary object in the bucket, and there is
   no screen that needs it. */
function chooseFlyer(body, targets) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, "flyer")) {
    return { ok: false, message: "That edit did not say what to do with the flyer." };
  }

  var held = {};
  targets.forEach(function (row) {
    if (row.flyer_key) held[row.flyer_key] = true;
  });
  var was = targets[0].flyer_key || null;

  var key = typeof body.flyer === "string" ? body.flyer.trim() : "";
  if (!key) return { ok: true, key: null, changed: was !== null };

  if (!UPLOAD_KEY.test(key) && !held[key]) {
    return { ok: false, message: "That is not a flyer this calendar issued." };
  }

  return { ok: true, key: key, changed: key !== was };
}

/* `bind` takes its parameters positionally and there is no spread in this
   codebase's style. */
function bind(statement, values) {
  return statement.bind.apply(statement, values);
}
