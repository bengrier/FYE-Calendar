/* POST /api/admin/decline — the submission leaves the queue unpublished.

   The row is kept with status 'declined' rather than deleted: someone will ask
   what happened to a submission, and "we have no record of it" is a bad answer
   when the alternative costs a few hundred bytes. What is kept is the *event* —
   what was proposed, when, and who decided. The submitter's name and address go
   at the same moment, which is the whole of the change below. */

import { json, fail, methodNotAllowed, readJson } from "../../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var id = body && typeof body.id === "string" ? body.id : "";
  if (!id) return fail(400, "Which submission?");

  /* Same claim-by-update as approve, for the same reason: the database settles
     a race between two reviewers, not a read-then-write in one of them. And the
     same erasure, in the same statement and for the same reason — a decline
     spends the address exactly as an approval does. See approve.js. */
  var claim = await context.env.DB
    .prepare(
      "UPDATE submissions SET status = 'declined', decided_at = ?, decided_by = ?, " +
      "by_name = '', by_email = '' " +
      "WHERE id = ? AND status = 'pending'"
    )
    .bind(Date.now(), context.data.identity || "unknown", id)
    .run();

  if (!claim.meta.changes) {
    return fail(409, "That submission has already been decided.");
  }

  return json({ ok: true });
}
