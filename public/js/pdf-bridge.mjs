/* The first page of a PDF, drawn onto a canvas — and the only file in the site
   that knows pdf.js exists.

   Two reasons it is a module of its own rather than a few lines in store.js:

   The first is that store.js must stay a classic script. `import()` is a
   syntax error to a parser that has never heard of it, and a syntax error is
   fatal to the whole file, not to the statement — a browser old enough to
   choke on it would lose the entire calendar rather than one flyer preview.
   Here the import is the file, and store.js injects it as <script type=module>
   only after checking the browser understands modules at all.

   The second is that it is loaded on demand. pdf.js is 1.8 MB. A student
   reading the calendar never fetches a byte of it; only somebody who has
   attached a PDF to the submit form does.

   It hangs itself on `window` because its caller is a classic script and there
   is no other way to hand something back across that line. */

import * as pdfjs from "../vendor/pdfjs/pdf.min.mjs";

/* Absolute, unlike the import above. That one is resolved against this
   module's own URL; these are handed to pdf.js as strings and resolved against
   the page's, which is not the same place. */
var BASE = "/vendor/pdfjs/";

/* The worker is where the parsing and decoding actually happen; without this
   pdf.js does it on the main thread and the form locks up mid-render. */
pdfjs.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.mjs";

/* Fetched by the worker, only when a particular file turns out to need them:
   the base-14 fonts for a PDF that names Helvetica without embedding it, and
   the wasm decoders for JPEG 2000 artwork and ICC colour. Both have to end in
   a slash — pdf.js throws on a factory URL that does not. */
var DOC_OPTIONS = {
  standardFontDataUrl: BASE + "standard_fonts/",
  wasmUrl: BASE + "wasm/"
};

/* Renders page 1 at exactly `width` pixels across, whatever size the page
   declares itself to be. A PDF is vector, so this is a render at that scale
   rather than an upscale of something smaller: a quarter-letter flyer comes
   out as sharp as a tabloid one.

   Resolves to a canvas. Everything about turning that into an uploadable JPEG
   stays in store.js, with the equivalent code for images. */
function firstPage(file, width) {
  /* The loading task, not the document it opens: `destroy` lives here, and it
     is what frees the worker's copy of the file as well as the worker itself.
     A document proxy has no such method — reaching for one there fails at the
     moment there is a rendered flyer to lose. */
  var task = null;

  return file.arrayBuffer()
    .then(function (buffer) {
      var params = Object.assign({ data: new Uint8Array(buffer) }, DOC_OPTIONS);
      task = pdfjs.getDocument(params);
      return task.promise;
    })
    .then(function (doc) {
      return doc.getPage(1);
    })
    .then(function (page) {
      /* getViewport already applies the page's own /Rotate, so a flyer saved
         sideways comes out upright rather than needing to be fixed here. */
      var natural = page.getViewport({ scale: 1 });
      var viewport = page.getViewport({ scale: width / natural.width });

      var canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      var ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");

      /* A PDF page is paper: the parts of it nothing is drawn on are white,
         not transparent. Without this they encode as black. */
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      /* `print` rather than the default `display`, and not because anything is
         being printed. pdf.js schedules a display render on
         requestAnimationFrame, which a browser does not run for a page nobody
         is looking at — so a submitter who pressed Submit and switched to
         another tab, or locked their phone, would leave the render suspended
         mid-page and the upload waiting on it, possibly for as long as they
         were away. A print render is scheduled on microtasks and runs
         regardless. Producing a faithful still of a page is what print intent
         is for in any case; this one just happens to be bound for a card on a
         calendar rather than for paper. */
      return page.render({
        canvasContext: ctx,
        viewport: viewport,
        intent: "print"
      }).promise.then(function () { return canvas; });
    })
    .then(function (canvas) {
      release();
      return canvas;
    }, function (err) {
      /* Both arms, because the worker holds its own copy of the file: a PDF
         that failed to render halfway through has to be let go of just as
         firmly as one that succeeded. Rethrown rather than swallowed — the
         caller decides what a failure means, and here it means the flyer stays
         a link. */
      release();
      throw err;
    });

  function release() {
    if (task) { task.destroy(); task = null; }
  }
}

window.CalPdf = { firstPage: firstPage };
