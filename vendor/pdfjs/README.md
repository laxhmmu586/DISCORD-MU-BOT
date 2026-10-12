# PDF.js text extraction runtime

These files are the unmodified, minified legacy builds from Mozilla
`pdfjs-dist` version **4.8.69**, licensed under Apache-2.0 (see `LICENSE`).

- `pdf.mjs`: upstream `legacy/build/pdf.min.mjs`
- `pdf.worker.mjs`: upstream `legacy/build/pdf.worker.min.mjs`

Both files must be updated together. Keep the worker filename `pdf.worker.mjs`:
the main module resolves that adjacent file automatically in Node.js.

GD CHECK imports this local runtime because this repository tracks dependencies
and some server deployments update files with Git without running npm install.
Text extraction requires Node.js 18 or newer and does not require canvas, OCR,
or native rendering modules. Scanned PDFs remain incomplete for manual review.

Upstream: https://github.com/mozilla/pdf.js
Distribution: https://www.npmjs.com/package/pdfjs-dist/v/4.8.69
