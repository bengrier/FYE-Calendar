/* POST /api/admin/decline — the submission leaves the queue unpublished.

   The row is kept with status 'declined' rather than deleted: someone will ask
   what happened to a submission, and "we have no record of it" is a bad answer
   when the alternative costs a few hundred bytes. */

import { json, fail, methodNotAllowed, readJson } from "../../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var id = body && typeof body.id === "string" ? body.id : "";
  if (!id) return fail(400, "Which submission?");

  /* Same claim-by-update as approve, for the same reason: the database settles
     a race between two reviewers, not a read-then-write in one of them. */
  var claim = await context.env.DB
    .prepare(
      "UPDATE submissions SET status = 'declined', decided_at = ?, decided_by = ? " +
      "WHERE id = ? AND status = 'pending'"
    )
    .bind(Date.now(), context.data.identity || "unknown", id)
    .run();

  if (!claim.meta.changes) {
    return fail(409, "That submission has already been decided.");
  }

  return json({ ok: true });
}
