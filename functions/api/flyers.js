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

  var key = uid("f") + "." + actual;

  await context.env.FLYERS.put(key, bytes, {
    httpMetadata: {
      contentType: file.type,
      /* Immutable because the key is unique per upload; nothing ever replaces
         an object at the same key. */
      cacheControl: "public, max-age=31536000, immutable"
    }
  });

  return json({ key: key }, { status: 201 });
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
