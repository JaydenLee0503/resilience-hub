// Supabase Edge Function: find-support
//
// Production home for the "Find nearest help" feature. Mirrors the
// handleFindSupport() logic in server/dev.js so dev and prod behave the same.
// Holds FOURSQUARE_KEY server-side — it never ships to the browser.
//
// Contract:
//   POST { "pipelineType"?: string, "location": string }
//   200  { "query": string, "location": string, "origin": {lat,lng}|null, "results": Place[] }
//   4xx/5xx { "error": string }
//
// The client (src/components/FindNearestHelp.jsx) plots `results` with Leaflet.
// No PII is involved — only a pipeline type and a user-entered city/address.

// ─── CORS ──────────────────────────────────────────────────────────────────
// Defaults to the deployed frontend origin (not "*") so the endpoint isn't open
// to every origin. Override with the ALLOWED_ORIGIN secret if the frontend URL
// changes.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ??
  "https://resilience-hub-delta.vercel.app";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// ─── Foursquare key handling (mirrors server/dev.js normalizeFoursquareKey) ──
function normalizeFoursquareKey(value: string | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

// ─── Pipeline → search query (mirrors server/dev.js supportQueryForPipeline) ─
function supportQueryForPipeline(pipelineType = "common"): string {
  const queries: Record<string, string> = {
    immigration: "immigration office legal aid",
    medical: "free health clinic community health center",
    school: "education advocacy special education support",
    legal: "legal aid office",
    financial_aid: "benefits office financial assistance",
    housing: "housing assistance tenant legal aid",
    employment: "employment legal aid workers rights",
    common: "community legal aid social services",
  };
  return queries[pipelineType] || queries.common;
}

// ─── Foursquare Places fetch (mirrors server/dev.js fetchFoursquarePlaces) ───
// Some keys are sent as a raw token, others as "Bearer <token>". Try Bearer
// first; on 401 retry with the raw key.
async function fetchFoursquarePlaces(
  params: URLSearchParams,
  key: string,
): Promise<Response> {
  const url = `https://places-api.foursquare.com/places/search?${params.toString()}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
    "X-Places-Api-Version": "2025-06-17",
  };

  const first = await fetch(url, { headers });
  if (first.status !== 401) return first;

  return fetch(url, { headers: { ...headers, Authorization: key } });
}

// deno-lint-ignore no-explicit-any
function readFoursquareOrigin(data: any): { lat: number; lng: number } | null {
  const center = data?.context?.geo_bounds?.circle?.center ||
    data?.context?.geo_bounds?.center;
  if (!center) return null;
  const lat = center.latitude ?? center.lat;
  const lng = center.longitude ?? center.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// deno-lint-ignore no-explicit-any
function readFoursquareCoords(place: any): { lat: number; lng: number } | null {
  const geo = place?.geocodes?.main || place?.geocodes?.roof ||
    place?.geocodes?.drop_off;
  const latitude = geo?.latitude ?? place?.latitude ?? place?.lat ??
    place?.location?.latitude ?? place?.location?.lat;
  const longitude = geo?.longitude ?? place?.longitude ?? place?.lng ??
    place?.location?.longitude ?? place?.location?.lng;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { lat: latitude, lng: longitude }
    : null;
}

// deno-lint-ignore no-explicit-any
function readFoursquareAddress(place: any): string {
  const location = place?.location || {};
  return location.formatted_address ||
    location.formattedAddress ||
    [
      location.address,
      location.locality || location.city,
      location.region,
      location.postcode || location.postal_code,
    ]
      .filter(Boolean)
      .join(", ");
}

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const FOURSQUARE_KEY = normalizeFoursquareKey(Deno.env.get("FOURSQUARE_KEY"));
  if (!FOURSQUARE_KEY) {
    return json({ error: "FOURSQUARE_KEY is not set on the server." }, 503);
  }

  let payload: { pipelineType?: unknown; location?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const location = typeof payload?.location === "string" ? payload.location : "";
  if (!location.trim()) {
    return json({ error: "Field 'location' (non-empty string) is required." }, 400);
  }

  const pipelineType = typeof payload?.pipelineType === "string"
    ? payload.pipelineType
    : "common";
  const query = supportQueryForPipeline(pipelineType);

  const params = new URLSearchParams({
    near: location.trim(),
    query,
    limit: "8",
    sort: "DISTANCE",
  });

  let fsqRes: Response;
  try {
    fsqRes = await fetchFoursquarePlaces(params, FOURSQUARE_KEY);
  } catch (err) {
    console.error("[find-support] Foursquare fetch failed:", err);
    return json({ error: "Failed to reach Foursquare Places." }, 502);
  }

  if (!fsqRes.ok) {
    const errBody = await fsqRes.text().catch(() => "");
    const message = fsqRes.status === 401
      ? 'Foursquare rejected FOURSQUARE_KEY. Use a Places API key from the Foursquare Developer Console, set the raw key without "Bearer", then redeploy.'
      : fsqRes.status === 410
      ? "Foursquare rejected the Places endpoint as retired. Update the endpoint/version and redeploy."
      : `Foursquare Places error: ${fsqRes.status}`;
    console.error(`[find-support] Foursquare error ${fsqRes.status}:`, errBody.slice(0, 200));
    return json({ error: message }, 502);
  }

  const data = await fsqRes.json();
  const origin = readFoursquareOrigin(data);
  const rawResults = data.results || data.places || data.data;
  const sourceResults = Array.isArray(rawResults) ? rawResults : [];
  // deno-lint-ignore no-explicit-any
  const results = (sourceResults as any[]).map((place) => {
    const coords = readFoursquareCoords(place);
    return {
      id: place.fsq_id || place.fsq_place_id || place.id,
      name: place.name,
      address: readFoursquareAddress(place),
      phone: place.tel || place.telephone || place.phone || "",
      distanceMeters: typeof place.distance === "number" ? place.distance : null,
      lat: coords?.lat,
      lng: coords?.lng,
    };
  }).filter((place) =>
    place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng)
  );

  return json({ query, location: location.trim(), origin, results }, 200);
});
