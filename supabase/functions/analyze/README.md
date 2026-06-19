# `analyze` Edge Function

Server-side proxy for the Simplifier. Holds `FEATHERLESS_API_KEY` so it never
ships to the browser. Receives Guardian-tokenized text, classifies it, runs the
matching pipeline prompt, and returns the **parsed canonical schema object**
(CLAUDE.md §10) — the same contract as `server/dev.js`.

## Request / response

```
POST /functions/v1/analyze
Body: { "tokenizedText": "<tokenized text>", "pipelineType"?: "<override>" }

200 { "pipeline_type": "...", "urgency": "...", "plain_language_summary": "...", ... }
4xx/5xx { "error": "...", "detail"?: "..." }
```

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed.
- A Featherless API key.

> Note: Supabase project + Auth are **not** configured yet. For now run this
> function locally with JWT verification off.

## Local development

```bash
# 1. From the repo root, start the local stack (first time only):
supabase init          # creates supabase/config.toml if missing
supabase start         # optional: full local stack (db, etc.)

# 2. Put your key in supabase/functions/.env (gitignored):
cp supabase/functions/.env.example supabase/functions/.env
#   then edit it: FEATHERLESS_API_KEY=...

# 3. Serve the function (auth off until Supabase Auth is wired up):
supabase functions serve analyze --no-verify-jwt --env-file supabase/functions/.env
```

It will be available at `http://localhost:54321/functions/v1/analyze`.

> Note: during local dev the frontend talks to `server/dev.js` (port 3001), not
> this function. This local serve is just to test the function in isolation
> before deploying. The client only uses this function in production, via
> `VITE_SUPABASE_URL`.

Smoke test:

```bash
curl -s http://localhost:54321/functions/v1/analyze \
  -H 'content-type: application/json' \
  -d '{"tokenizedText":"Your appointment is on [DATE_1]. Bring [AMOUNT_1]."}'
```

## Deploy (later, once a Supabase project exists)

```bash
supabase secrets set FEATHERLESS_API_KEY=...
supabase secrets set FEATHERLESS_MODEL=Qwen/Qwen2.5-72B-Instruct
supabase functions deploy analyze
# then set VITE_SUPABASE_URL to https://<project-ref>.supabase.co in the frontend .env
```

Re-enable JWT verification (drop `--no-verify-jwt`) once Supabase Auth is in place,
and set `ALLOWED_ORIGIN` to your deployed frontend origin.
