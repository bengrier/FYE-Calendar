/* GET /uploads/<key> — serving uploaded artwork out of R2.

   Deliberately not under /flyers. That path holds the artwork committed to the
   repo, which Pages serves as static files; a Function mounted there would
   shadow all of it and every bundled flyer would 404. Two sources of artwork,
   two path spaces, no collision to reason about. */

var KEY = /^f-[A-Za-z0-9._-]{6,120}$/;

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { Allow: "GET, HEAD" }
    });
  }

  var key = context.params.key;

  /* Only the keys this API issues. Without this, a crafted path could ask R2
     for anything in the bucket. */
  if (!KEY.test(key)) return new Response("Not found.", { status: 404 });

  var object = await context.env.FLYERS.get(key);
  if (!object) return new Response("Not found.", { status: 404 });

  var headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  /* Immutable because a key is unique per upload — nothing ever replaces an
     object at the same key. */
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  /* Artwork is displayed, never executed. This is a file a stranger uploaded,
     so a PDF's own scripting is worth shutting off on the way out. */
  headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; object-src 'none'");

  return new Response(context.request.method === "HEAD" ? null : object.body, {
    headers: headers
  });
}
