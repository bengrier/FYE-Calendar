/* POST /api/admin/reschedule — one published event moves to another day.

   The occurrence that lands on Thanksgiving, the room that was only free the
   following Tuesday. One row, one column: everything else about the event —
   its time, its place, its tags, the flyer — is what the submitter proposed and
   the reviewer approved, and none of it is this screen's to rewrite.

   Only the date. A reviewer who needs to change what an event *says* is looking
   at a different submission, and asking the club to send it again is the honest
   version of that: the calendar's record of what was approved should not
   quietly stop matching what was approved.

   There is no matching "add an occurrence". A series is expanded once, by the
   approval, from a repeat rule that a person wrote and a reviewer read; making
   one longer here would be inventing events nobody submitted. Shortening one is
   `remove.js`, which is a decision about events that already exist. */

import { json, fail, methodNotAllowed, readJson } from "../../_lib/http.js";

var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var id = body && typeof body.id === "string" ? body.id.trim() : "";
  var date = body && typeof body.date === "string" ? body.date.trim() : "";

  if (!id) return fail(400, "Which event?");
  if (!ISO_DATE.test(date)) return fail(400, "Pick a date.", "date");

  /* An event moved into the past is a typo every time, and it is a typo with
     teeth: the retention sweep deletes events older than the window without
     asking, so a slipped year would take the event off the calendar for good
     some hours later, with nothing to say why.

     The floor is yesterday rather than today because "today" here is UTC and
     the reviewer is in Colorado. At six in the evening they are already on
     tomorrow's UTC date, and refusing to move an event to this afternoon would
     be this server disagreeing with the calendar on the reviewer's own screen.
     A day of slack is wider than any offset on Earth and still refuses every
     date that is actually old. */
  var floor = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (date < floor) return fail(400, "That date has already passed.", "date");

  var moved = await context.env.DB
    .prepare("UPDATE events SET date = ? WHERE id = ?")
    .bind(date, id)
    .run();

  if (!moved.meta.changes) {
    return fail(409, "That event is no longer on the calendar.");
  }

  return json({ ok: true, date: date });
}
