/* POST /api/flyers — the flyer upload, at last.

   This is what a server buys that none of the workarounds could: somewhere to
   put a file. The submit form uploads here first, gets a key back, and sends
   that key with the submission.

   Public, because the person uploading has not been vetted — nobody has, at
   submission time. So the limits below are the whole defence, and they are
   enforced on the bytes rather than on anything the caller said about them.

   The key it returns is served back at /uploads/<key>. */

import { json, fail, methodNotAllowed, uid } from "../_lib/http.js";

var MAX_BYTES = 10 * 1024 * 1024;

/* A rendition of a 10 MB flyer is a couple of hundred kilobytes. This is
   room to be wrong by an order of magnitude and still refuse anything that
   is not what it claims to be. */
var MAX_RENDITION_BYTES = 2 * 1024 * 1024;

/* Deliberately a list of what is allowed rather than of what is not: the
   projector and the calendar have to render this, so anything not on here is no
   use even when it is harmless. */
var ALLOWED = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

/* First bytes of each accepted format. A file is what it begins with, not what
   its name or its Content-Type claims. */
var SIGNATURES = [
  { ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },                    // %PDF
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },                    // GIF8
  { ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46] }                    // RIFF….WEBP
];

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var form;
  try {
    form = await context.request.formData();
  } catch (e) {
    return fail(400, "That upload could not be read.");
  }

  var file = form.get("flyer");
  if (!file || typeof file === "string") return fail(400, "No file was uploaded.");

  if (file.size === 0) return fail(400, "That file is empty.");
  if (file.size > MAX_BYTES) {
    return fail(413, "That file is over 10 MB. Export it smaller and try again.");
  }

  var claimed = ALLOWED[String(file.type || "").toLowerCase()];
  if (!claimed) return fail(415, "Flyers have to be a PDF or an image.");

  var bytes = new Uint8Array(await file.arrayBuffer());
  var actual = sniff(bytes);
  if (!actual || actual !== claimed) {
    /* Either it is not what it says it is, or it is a format we do not take.
       Both get the same answer: the point is that the bytes decide. */
    return fail(415, "That file is not a readable PDF or image.");
  }
  if (actual === "webp" && !isWebp(bytes)) {
    return fail(415, "That file is not a readable PDF or image.");
  }

  /* Read and check the two smaller renderings before naming anything, because
     for a PDF the name depends on whether they are real. */
  var thumb = await rendition(form.get("thumb"));
  var display = await rendition(form.get("display"));

  /* An image is drawable whatever else arrived — the original is a picture and
     /uploads will serve it. A PDF is drawable only through the rendering of
     its first page that the submitter's browser made, so it is drawable only
     if that rendering, and its thumbnail, both got here.

     The key carries that fact, spelled `.r.pdf`, for one reason: months later
     the calendar has to paint a card holding nothing but this string, from a
     synchronous function, with no chance to go and look. Everything that reads
     it — store.js `flyer()` — trusts the name, so the name is only issued
     below, after both objects are actually written. */
  var rasterised = actual === "pdf" && thumb && display;
  var key = uid("f") + "." + (rasterised ? "r.pdf" : actual);

  await context.env.FLYERS.put(key, bytes, {
    httpMetadata: {
      contentType: file.type,
      /* Immutable because the key is unique per upload; nothing ever replaces
         an object at the same key. */
      cacheControl: "public, max-age=31536000, immutable"
    }
  });

  /* The two smaller renderings, if the browser managed to make them. They are
     stored beside the original under a derived name, which is how the calendar
     addresses them without the database having to carry three keys per flyer.

     Still optional: an old browser may have none, a PDF this browser could not
     rasterise has none, and a flyer that arrives alone works — /uploads serves
     the original for a rendition that is not there. What has changed is what
     "works" means for a PDF, which is why the key was named above. */
  await Promise.all([
    putRendition(context, key + ".t.jpg", thumb),
    putRendition(context, key + ".d.jpg", display)
  ]);

  /* Returned only now. A rendition that failed to write throws out of the
     await above and the submitter is never handed a key claiming a rendering
     that is not in the bucket. */
  return json({ key: key }, { status: 201 });
}

/* A rendition is checked exactly as strictly as the original was. It arrives
   from the same untrusted place, and "it is only the thumbnail" is precisely
   the argument that would let something unchecked into the bucket.

   Returns the bytes, or null for anything that did not arrive or did not pass.
   Checking is separate from storing because the key's name now depends on the
   answer, and the key has to exist before there is anywhere to store them. */
async function rendition(file) {
  if (!file || typeof file === "string") return null;
  if (file.size === 0 || file.size > MAX_RENDITION_BYTES) return null;
  if (String(file.type || "").toLowerCase() !== "image/jpeg") return null;

  var bytes = new Uint8Array(await file.arrayBuffer());
  return sniff(bytes) === "jpg" ? bytes : null;
}

async function putRendition(context, key, bytes) {
  if (!bytes) return;

  await context.env.FLYERS.put(key, bytes, {
    httpMetadata: {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable"
    }
  });
}

function sniff(bytes) {
  for (var i = 0; i < SIGNATURES.length; i++) {
    var sig = SIGNATURES[i];
    if (bytes.length < sig.bytes.length) continue;
    var match = true;
    for (var j = 0; j < sig.bytes.length; j++) {
      if (bytes[j] !== sig.bytes[j]) { match = false; break; }
    }
    if (match) return sig.ext;
  }
  return null;
}

/* RIFF is a container; only some of it is WebP. */
function isWebp(bytes) {
  return bytes.length > 12 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}
