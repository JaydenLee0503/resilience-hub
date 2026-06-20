# Resilience Hub

Resilience Hub is a privacy-first document intelligence platform built around Specialized Crisis Pipelines. Users upload sensitive documents - immigration paperwork, medical discharge forms, school notices, legal letters, financial aid forms, housing documents, or employment contracts - and the AI reads them and returns exactly three things: what matters, what happens if ignored, and what to do next. It also generates a checklist and surfaces local support resources. Every document is tokenized before any AI sees it, keeping personal data protected. Additional features include a Gmail reader that scans for crisis-related emails and a Chrome Extension that reads PDFs open in the browser. Resilience Hub exists because no one should miss a deadline, lose a benefit, or misunderstand their rights because the paperwork was too hard to read.

## What It Does

- Upload or paste PDFs, notices, forms, emails, and other crisis documents.
- Choose a Specialized Crisis Pipeline or use the general reader.
- Tokenize sensitive values in the browser before AI processing.
- Return a clear report with what matters, what happens if ignored, what to do next, a checklist, deadlines, and local support resources.
- Ask follow-up questions in the report chat.
- Read crisis-related Gmail messages through Google OAuth.
- Add extracted deadlines to Google Calendar.
- Download generated reports as TXT or PDF.
- Use the Chrome Extension to send selectable PDF text from the browser into the app.

## Tech Stack

- Frontend: React 18, Vite, Tailwind CSS, plain CSS modules in `src/index.css`
- Auth and saved reports: Supabase Auth and Supabase Postgres
- AI provider: Featherless.ai through a local/server proxy
- PDF parsing: `pdfjs-dist`
- Google integrations: Google Identity Services, Gmail API, Google Calendar API
- Local dev backend: `server/dev.js`
- Production backend option: Supabase Edge Function in `supabase/functions/analyze`

## Privacy Model

The raw document stays in the browser. Before any AI call, the Guardian tokenizer replaces personal values with placeholders such as `[PERSON_1]`, `[DATE_1]`, and `[AMOUNT_1]`. The AI receives tokenized text only. The browser rehydrates the structured result locally for the user.

Saved reports are tied to the signed-in Supabase user. The raw uploaded document is not stored by the app.

## Pipelines

The app supports:

- Immigration
- Medical
- School and special education
- Legal
- Financial aid and benefits
- Housing
- Employment
- General/Common Bot fallback

## Local Setup

Install dependencies:

```bash
npm install
```

Copy the environment file:

```bash
cp .env.example .env
```

Fill in the values you need:

```env
FEATHERLESS_API_KEY=
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
FEATHERLESS_MODEL=Qwen/Qwen2.5-72B-Instruct

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_CLIENT_ID=
```

Run the app and local API server:

```bash
npm run dev:all
```

Open:

```text
http://localhost:5173
```

## Google Setup

Use one OAuth Web Client ID for Gmail and Calendar.

In Google Cloud Console:

1. Enable the Gmail API.
2. Enable the Google Calendar API.
3. Create an OAuth 2.0 Web Client.
4. Add this Authorized JavaScript origin:

```text
http://localhost:5173
```

5. Put the client ID in `.env` as `VITE_GOOGLE_CLIENT_ID`.

Do not put a Google client secret in this app. Browser OAuth uses the public client ID only.

## Chrome Extension

The extension lives in:

```text
extension/
```

To load it:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select the `extension` folder.

The extension reads selectable PDF/page text from the current tab and opens the local app with that text ready for analysis. Scanned image-only PDFs still need OCR.

## Render Notes

This project is a Node app. Render should install dependencies from `package.json` and `package-lock.json`.

Recommended Render settings for the frontend build:

```bash
npm install
npm run build
```

Static publish directory:

```text
dist
```

The included `requirements.txt` is intentionally empty of Python packages because this project does not use Python runtime dependencies.

## Scripts

```bash
npm run dev
npm run dev:server
npm run dev:all
npm run build
npm run preview
```

## Important Files

- `src/App.jsx` - app routing/state
- `src/components/Dashboard.jsx` - dashboard, upload, Gmail reader
- `src/components/CrisisActionRoom.jsx` - report view, chat, downloads, Calendar button
- `src/agents/guardian.js` - browser-side tokenization
- `src/agents/simplifier.js` - analysis API client
- `src/lib/gmailClient.js` - Gmail OAuth/API helper
- `src/lib/googleCalendar.js` - Google Calendar API helper
- `server/dev.js` - local development API server
- `extension/` - Chrome Extension
