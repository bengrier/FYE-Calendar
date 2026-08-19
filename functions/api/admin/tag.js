/* POST /api/admin/tag — a custom tag becomes filterable, or stops being.

   `approve.js` makes this decision once, at the moment a submission is
   published, on a tag nobody has seen in use yet. This is the same decision
   taken again with the evidence in: a tag that read fine on one flyer and turns
   out to be a duplicate of one the calendar already had, a series name that
   stopped meaning anything when the series ended, a typo that got waved through
   at half past four.

   **Un-approving takes the tag off the events, not just out of the filter
   bar.** /api/events reads through the `approved` flag, so the chip stops
   appearing on the event as well. That is the same rule approval already
   follows — a tag the reviewer does not keep is dropped from the event
   entirely rather than published unfilterable — applied after the fact, and it
   is what a reviewer means by turning one off. Nothing is deleted: the
   event_tags rows stay, so turning it back on puts it back everywhere it was.

   Only `kind = 'custom'`. The fixed chips are the filter bar's own vocabulary
   from js/data.js and this table only mirrors them; un-approving one would
   quietly empty a filter the calendar ships with. */

import { json, fail, methodNotAllowed, readJson } from "../../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var name = body && typeof body.name === "string" ? body.name.trim() : "";

  if (!name) return fail(400, "Which tag?");
  if (typeof body.approved !== "boolean") return fail(400, "Filterable, or not?");

  var changed = await context.env.DB
    .prepare("UPDATE tags SET approved = ? WHERE name = ? AND kind = 'custom'")
    .bind(body.approved ? 1 : 0, name)
    .run();

  if (!changed.meta.changes) {
    return fail(409, "That is not a tag this screen can change.");
  }

  return json({ ok: true, name: name, approved: body.approved });
}
