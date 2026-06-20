# Clearline — Chrome extension

An unpacked Chrome extension (Manifest V3) that pulls the text out of the tab you're
looking at and drops it into your local Clearline dashboard, ready to analyze.

## What it does

Two actions in the popup:

- **Summarize here** — extracts the text, **tokenizes PII in your browser** (a bundled copy of
  the app's `Guardian`), sends only the tokenized text to the local backend
  (`http://localhost:3001/api/summarize`, which holds the Featherless key), then re-hydrates the
  AI summary back to your real values **on this device** and shows it right in the popup. Your
  real names/dates/amounts never leave the browser.
- **Send to dashboard** — opens the app at `http://localhost:5173` with the extracted text
  pre-loaded, for the full structured analysis.

Text extraction works on:

- **PDFs** (including ones opened in Chrome's built-in PDF viewer): the extension fetches
  the PDF bytes and extracts the text with a bundled copy of pdf.js. Chrome's native PDF
  viewer can't be read by a content script, so reading the bytes directly is the only thing
  that actually works here.
- **Web pages**: injects a content script and scrapes the selectable / visible text
  (including text in same-origin iframes and shadow roots).

> The summarizer needs the local backend running (`npm run dev:all`). The API key stays on the
> server — the extension only ever sends tokenized text and re-hydrates the reply locally.

## Load it

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension` folder.
4. (Optional, for local files) Click **Details** on the extension and turn on
   **Allow access to file URLs** so it can read `file://` PDFs.

## Use it

1. Make sure the app is running locally (`npm run dev:all`, dashboard at `http://localhost:5173`).
2. Open a PDF or a page in Chrome.
3. Click the **Clearline** toolbar icon → **Send to dashboard**.
4. A new tab opens at the dashboard with the extracted text already loaded. Sign in if asked,
   pick a navigator, and analyze.

## Settings — local vs. deployed backend

Right-click the extension → **Options** (or `chrome://extensions` → **Details** → **Extension
options**) to point it at your backend:

- **Summarizer endpoint** — where **Summarize here** sends tokenized text.
  - Deployed (default): `https://<project-ref>.supabase.co/functions/v1/analyze`
  - Local dev: `http://localhost:3001/api/summarize`
- **Dashboard URL** — where **Send to dashboard** opens.
  - Deployed (default): `https://resilience-hub-delta.vercel.app/`
  - Local dev: `http://localhost:5173/`
- **Supabase anon key** (optional) — only if your deployed function rejects unauthenticated
  calls; it's sent as the `apikey` header. The anon key is public/non-secret.

The popup always sends `{ "mode": "summarize", "text": "<tokenized>" }`. The dev server routes
by path and ignores `mode`; the deployed Edge Function branches on it. Either returns
`{ "summary": "..." }`, so the same popup works against both.

> To deploy the backend: `npx supabase functions deploy analyze` and
> `npx supabase secrets set FEATHERLESS_API_KEY=… FEATHERLESS_MODEL=…`, then put the function URL
> in the extension's options.

## Notes & limits

- **Scanned / image-only PDFs** have no embedded text, so there's nothing to extract (no OCR yet).
- **Long documents** are truncated (12,000 chars for the dashboard transfer; 8,000 for summary).
- **Restricted pages** (`chrome://`, the Chrome Web Store) block script injection, so page
  scraping won't run there.

## Files

- `manifest.json` — MV3 manifest (permissions, popup, options page).
- `popup.html` / `popup.js` — the toolbar popup, extraction, summarize, and send logic (ES module).
- `options.html` / `options.js` — settings page; stores backend URLs in `chrome.storage.local`.
- `vendor/pdf.min.mjs`, `vendor/pdf.worker.min.mjs` — bundled pdf.js (copied from `pdfjs-dist`).
- `vendor/guardian.js` — bundled PII tokenizer (copied from `src/agents/guardian.js`), used to
  tokenize text on-device before the summarizer request.
- `icons/` — extension icons.

> The `vendor/` pdf.js files are copied from `node_modules/pdfjs-dist/build/`. If you bump the
> `pdfjs-dist` version in `package.json`, re-copy them:
> `cp node_modules/pdfjs-dist/build/pdf.min.mjs node_modules/pdfjs-dist/build/pdf.worker.min.mjs extension/vendor/`
