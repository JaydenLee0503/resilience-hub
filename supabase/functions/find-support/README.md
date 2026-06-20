# `find-support` Edge Function

Production home for the **Find nearest help** map feature. Holds `FOURSQUARE_KEY`
so it never ships to the browser. Mirrors `handleFindSupport()` in `server/dev.js`,
so dev (localhost:3001) and prod behave the same.

The client (`src/components/FindNearestHelp.jsx`) POSTs a pipeline type + a
city/address, this function queries Foursquare Places, and the client plots the
returned coordinates with Leaflet. No PII is involved.

## Request / response

```
POST /functions/v1/find-support
Body: { "location": "Toronto, ON", "pipelineType"?: "housing" }

200 { "query": "...", "location": "...", "origin": {lat,lng}|null, "results": [...] }
4xx/5xx { "error": "..." }
```

## Local development

```bash
# Key goes in supabase/functions/.env (gitignored):
cp supabase/functions/.env.example supabase/functions/.env   # then set FOURSQUARE_KEY

npx supabase functions serve find-support --no-verify-jwt --env-file supabase/functions/.env
```

Smoke test:

```bash
curl -s http://localhost:54321/functions/v1/find-support \
  -H 'content-type: application/json' \
  -d '{"location":"Toronto, ON","pipelineType":"housing"}'
```

## Deploy

```bash
npx supabase secrets set FOURSQUARE_KEY=...      # raw Places API key, no "Bearer"
npx supabase functions deploy find-support
```

Then in the frontend (Vercel env vars) set:

```
VITE_SUPPORT_URL=https://<project-ref>.supabase.co/functions/v1/find-support
```

> The client only uses this function in production. In dev it still calls
> `server/dev.js` at `http://localhost:3001/api/find-support`, so local behavior
> is unchanged.

Re-enable JWT verification (drop `--no-verify-jwt`) and set `ALLOWED_ORIGIN` to
your Vercel origin once you want to lock it down.
