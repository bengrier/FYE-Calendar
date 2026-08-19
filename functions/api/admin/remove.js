/* POST /api/admin/remove — an event comes off the calendar.

   The counterpart to approve.js, and the one thing this application could not
   do until now: an approval was final, and a series approved with the wrong end
   date, or an event that was cancelled the week after it was published, could
   only be fixed with a `wrangler d1 execute` from somebody's laptop.

   Three shapes, because a reviewer means three different things:

     { id }              one occurrence — the week it was cancelled
     { series, from }    everything from that date on — it repeats too long
     { series }          the whole thing — it should never have been published

   `series` is a submission id, and every event one approval wrote carries it in
   `from_submission`. The seeded placeholder events have no submission behind
   them and so are NULL there; `from_submission = ?` never matches NULL, which
   is what stops a malformed request from taking the seed with it. They are
   still removable one at a time, by id, which is how you clear the samples out.

   **This is a delete, and nothing here is undo.** The rows go. What does not go
   is the submission: it stays `approved`, with what was proposed and who
   decided it, so "what happened to my event" still has an answer. The flyer
   goes on its own — once no event points at it the retention sweep frees the
   R2 object, which is why one is started on the way out. */

import { json, fail, methodNotAllowed, readJson } from "../../_lib/http.js";
import { sweepInBackground } from "../../_lib/retention.js";

var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var id = body && typeof body.id === "string" ? body.id.trim() : "";
  var series = body && typeof body.series === "string" ? body.series.trim() : "";
  var from = body && typeof body.from === "string" ? body.from.trim() : "";

  if (!id && !series) return fail(400, "Which event?");
  if (from && !ISO_DATE.test(from)) return fail(400, "That is not a date.");

  var db = context.env.DB;

  /* The tags go in the same batch as the events they belong to, and before
     them: the subquery that finds them reads the rows the next statement
     deletes. D1 runs a batch as one transaction, so a row can never be left
     describing an event that is gone. */
  var where = id
    ? { clause: "id = ?", args: [id] }
    : from
      ? { clause: "from_submission = ? AND date >= ?", args: [series, from] }
      : { clause: "from_submission = ?", args: [series] };

  var removed = await db.batch([
    bind(
      db.prepare(
        "DELETE FROM event_tags WHERE event_id IN (SELECT id FROM events WHERE " +
        where.clause + ")"
      ),
      where.args
    ),
    bind(db.prepare("DELETE FROM events WHERE " + where.clause), where.args)
  ]);

  var count = removed[1].meta.changes;

  /* Nothing matched. Another reviewer removing the same series a moment
     earlier looks exactly like this, and is the likeliest way to see it. */
  if (!count) {
    return fail(409, id
      ? "That event is no longer on the calendar."
      : "Those events are no longer on the calendar.");
  }

  /* A series that has just lost its last event is a flyer nothing points at.
     After the deletes, never before — the sweep decides what is orphaned by
     reading the database, so it has to read it in its new state. */
  sweepInBackground(context);

  return json({ removed: count });
}

/* `bind` takes its parameters positionally and there is no spread in this
   codebase's style. */
function bind(statement, values) {
  return statement.bind.apply(statement, values);
}
