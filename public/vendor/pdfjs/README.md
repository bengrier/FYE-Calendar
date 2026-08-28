# pdf.js 6.2.108 (Apache-2.0)

Mozilla's PDF renderer, vendored rather than loaded from a CDN. It is here for
exactly one job: rasterising the first page of an uploaded PDF flyer in the
submitter's browser, so the calendar has something it can draw. See
`public/js/pdf-bridge.mjs` and `renditions()` in `public/js/store.js`.

Vendored because the rest of this site has no dependencies and no build step,
and because a CDN is one more origin that has to be reachable from wherever a
club officer happens to be submitting from. Nothing here is fetched until
somebody attaches a PDF.

## What was taken, and what was not

From the npm package `pdfjs-dist@6.2.108`:

- `legacy/build/pdf.min.mjs` and `legacy/build/pdf.worker.min.mjs` — the
  `legacy` build rather than the modern one, for the older browsers on the
  laptops and phones this form is filled in from. About 60 KB more.
- `standard_fonts/` — the 14 PDF base fonts. A flyer that names Helvetica
  without embedding it renders as boxes without these.
- `wasm/` — the JPEG 2000, JBIG2 and colour-management decoders, minus
  `quickjs-eval.*`. That pair is the engine that runs a PDF's *own* JavaScript,
  which is the last thing this site wants to do with a stranger's upload.
  Leaving it out means there is nothing for such a script to run in, whatever
  else changes.
- `cmaps/` was **not** taken: 169 files, needed only for CJK text encodings. A
  flyer that needs them fails to rasterise and falls back to the placeholder,
  which is what happened to every PDF before this existed.

Source maps and the `web/` viewer are not taken either — this is a renderer,
not a viewer.

## Updating

    npm pack pdfjs-dist@<version>
    tar xzf pdfjs-dist-<version>.tgz

then copy the same files back over this directory and re-run the flyer upload
by hand with a PDF. The API surface used is small — `getDocument`, `getPage`,
`getViewport`, `render` — but pdf.js has changed all four across major
versions. `pdf-bridge.mjs` is the only file that touches any of them.
