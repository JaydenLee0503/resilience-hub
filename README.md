# Beacon Atlas

> Repo/codename: **resilience-hub**. Product name in all user-facing copy: **Beacon Atlas**.

A privacy-first AI platform that turns life-critical documents (immigration, medical, legal,
housing, benefits, school, employment paperwork) into calm, structured action plans: what
matters, what happens if ignored, what to do next, who can help, deadlines, and a checklist.

**Privacy boundary is code, not a prompt.** A client-side `Guardian` tokenizes personal
identifiers (dates, amounts, SSNs, phones…) into placeholders like `[DATE_1]` *before* any text
leaves the device. The AI only ever sees tokens; real values are re-hydrated on the device for
display. The model-provider API key lives only on the server — never in the browser.

---

## Architecture

```
Document ─▶ Guardian (tokenize, in-browser) ─▶ backend LLM call ─▶ canonical JSON
                                                                        │
        CrisisActionRoom ◀── rehydrate (in-browser) ◀────────────────────┘
```

- **Frontend** — React 18 + Vite + Tailwind (single-page app).
- **AI core** — `src/agents/`: `guardian.js` (tokenizer), `rehydrate.js` (detokenizer),
  `simplifier.js` / `chat.js` (call the backend), `pipelines/*` (7 tuned pipelines + classifier).
- **Two mirrored backends** (same contract, so dev and prod behave identically):
  - `server/dev.js` — local Node server on **:3001** (development).
  - `supabase/functions/analyze/index.ts` — Supabase Edge Function, Deno (production).
- **Data** — Supabase Auth (email/password) + Postgres with Row Level Security. Only the
  re-hydrated structured plan is stored (per-user, RLS-scoped); the raw document is never stored.
- **Model** — [Featherless](https://featherless.ai) (OpenAI-compatible API), default
  `Qwen/Qwen2.5-72B-Instruct`. Swappable via env.

---

## Prerequisites

| Need | Why |
|------|-----|
| **Node.js 18+** and npm | build + dev servers |
| A **Supabase project** | auth + saved reports (the app gates the dashboard behind sign-in) |
| A **Featherless API key** | the LLM that analyzes documents (without it, the dev server returns canned *demo* output) |
| **Supabase CLI** (optional) | run migrations / deploy the Edge Function — use `npx supabase` (do not install globally) |

---

## Setup (reproducible)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # then edit .env (see table below)
```

Fill `.env`:

| Variable | Scope | Required | Notes |
|----------|-------|----------|-------|
| `FEATHERLESS_API_KEY` | server only | for real AI | omit → dev server runs in demo mode |
| `FEATHERLESS_BASE_URL` | server only | no | default `https://api.featherless.ai/v1` |
| `FEATHERLESS_MODEL` | server only | no | default `Qwen/Qwen2.5-72B-Instruct` |
| `VITE_SUPABASE_URL` | client (public) | yes | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client (public) | yes | Supabase anon key (public; RLS protects data) |
| `VITE_ANALYZE_URL` | client (public) | no | override the analyze endpoint (staging/custom) |
| `VITE_CHAT_URL` | client (public) | no | override the follow-up-chat endpoint |
| `DEV_SERVER_PORT` | server only | no | default `3001` |

> Endpoint resolution: in **dev** (`import.meta.env.DEV`), the client calls
> `http://localhost:3001`. In **production** it calls `${VITE_SUPABASE_URL}/functions/v1/analyze`.
> `VITE_ANALYZE_URL` / `VITE_CHAT_URL` override both. **Never** put `FEATHERLESS_API_KEY` behind a
> `VITE_` prefix — secrets must stay server-side. `.env` is gitignored; never commit it.

```bash
# 3. Apply the database schema (creates `analyses` + RLS policies)
npx supabase link --project-ref <your-project-ref>
npx supabase db push
#   …or paste supabase/migrations/*.sql into the Supabase SQL editor.

# 4. Enable email/password auth in the Supabase dashboard.
#    For local dev, turn OFF "Confirm email" to avoid the built-in email rate limit.
```

---

## Run

```bash
npm run dev:all     # Vite (http://localhost:5173) + dev API server (http://localhost:3001)
```

Other scripts:

```bash
npm run dev         # frontend only
npm run dev:server  # dev API server only
npm run build       # production build → dist/
npm run preview     # serve the production build locally
```

Open http://localhost:5173, sign in, pick a pipeline, paste/upload a document (≥30 chars), Analyze.

---

## Verify it works

**Dev server is up:** `npm run dev:all` prints `listening on http://localhost:3001` and
`API key: set ✓` (or a demo-mode warning if `FEATHERLESS_API_KEY` is unset).

**Smoke-test the analyze endpoint** (tokens stand in for PII — note they come back unchanged,
proving the privacy boundary):

```bash
curl -s http://localhost:3001/api/analyze \
  -H "content-type: application/json" \
  -d '{"pipelineType":"medical","tokenizedText":"Discharge: take medication two times a day. Follow up on [DATE_1]. WARNING: if you have trouble breathing, call 911. You owe [AMOUNT_1]."}'
# → JSON with pipeline_type "medical", urgency "critical", and [DATE_1]/[AMOUNT_1] preserved.
```

**Smoke-test the follow-up chat:**

```bash
curl -s http://localhost:3001/api/chat \
  -H "content-type: application/json" \
  -d '{"mode":"chat","context":"Summary: appointment on [DATE_1]. Urgency: high","question":"What happens if I miss [DATE_1]?"}'
# → { "answer": "...[DATE_1]..." }  (tokens preserved; re-hydrated on the device)
```

**Classifier routing:** omit `pipelineType` and the server auto-detects the pipeline; the dev
console logs `[analyze] pipeline=<type> confidence=<n>`.

**In the browser:** DevTools → Network → the POST to `/api/analyze` — the request body shows
`[DATE_1]`-style tokens, never your real values.

---

## Pipelines

Seven tuned Specialized Crisis Pipelines (`src/agents/pipelines/`), each registered in **both**
backends, plus a keyword classifier and a generic fallback:

`immigration` · `medical` · `legal` · `housing` · `financial_aid` · `school` · `employment`

Each module exports `SYSTEM_PROMPT`, a domain `URGENCY_RUBRIC`, a curated `WHO_CAN_HELP_RESOURCES`
list, and `enrichResponse()` (merges vetted help orgs into the model's output). All return the
canonical schema in `CLAUDE.md` §10. Prompts live in `src/agents` — UI components only render.

---

## Production deploy

```bash
# Edge Function (holds the AI key as a secret — Deno type-checks on deploy)
npx supabase functions deploy analyze
npx supabase secrets set FEATHERLESS_API_KEY=... FEATHERLESS_MODEL=Qwen/Qwen2.5-72B-Instruct
# optional: lock CORS to your frontend
npx supabase secrets set ALLOWED_ORIGIN=https://your-app.example.com

# Frontend (Vercel/Netlify): set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, then deploy dist/
npm run build
```

`server/dev.js` is **dev-only** — never deploy it.

---

## Security notes

See `CLAUDE.md` §9 for the full rules. In short: the AI key never reaches the browser; PII is
tokenized before the LLM; every table uses RLS; deletion is real; the structured plan is stored,
not the raw document.
