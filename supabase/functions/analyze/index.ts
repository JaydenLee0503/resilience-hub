// Supabase Edge Function: analyze
//
// The privacy/security boundary. This is the ONLY place the model-provider API
// key exists — it lives in the server environment (FEATHERLESS_API_KEY), never
// in the browser bundle. Mirrors server/dev.js so dev and prod behave the same.
//
// Contract:
//   POST { "tokenizedText": string, "pipelineType"?: string }  <- text already scrubbed by the Guardian
//   200  { "text": string }           <- raw assistant text (JSON as a string)
//   4xx/5xx { "error": string, ... }
//
// The client (src/agents/simplifier.js) is responsible for parsing/validating the
// returned text. This function stays deliberately dumb: it classifies, selects the
// right pipeline prompt, forwards tokenized text to the model, and returns the
// model's text. No real PII ever reaches this function because the Guardian runs
// first, on the device.

// ─── Keyword classifier ────────────────────────────────────────────────────
// Mirrors src/agents/pipelines/classifier.js — keep in sync when that file changes.
const KEYWORD_MAP: Record<string, string[]> = {
  immigration: ["visa","uscis","daca","i-797","i-485","i-130","i-765","i-912","refugee","asylum","ircc","immigration","biometric","biometrics","deportation","removal","green card","work permit","citizenship","naturalization","a-number","notice to appear","f-1","h-1b","dhs","lawful permanent","advance parole","irpa","prra","sponsorship"],
  medical:     ["discharge","medication","prescription","diagnosis","treatment","icu","surgery","hospital","physician","dme","durable medical","insurance waiver","prior authorization","titration","feeding pump","wound care","home health","physical therapy","hipaa","eob"],
  school:      ["scholarship","fafsa","financial aid","enrollment","tuition","suspension","expulsion","disciplinary","iep","accommodations","504 plan","mckinney-vento","student","university","college","school district","osap","student loan","bursary","registrar"],
  legal:       ["eviction","summons","subpoena","court","judge","hearing","lawsuit","complaint","defendant","plaintiff","garnishment","judgment","appeal","restraining order","warrant","attorney","diversion","probation","restitution","community service"],
  financial_aid: ["grant","benefit","welfare","snap","ebt","medicaid","chip","ssi","ssdi","disability","unemployment","odsp","ontario works","social assistance","food stamps","housing assistance","income support","tax credit","eitc","gst credit","child benefit"],
  housing:     ["lease","landlord","tenant","rent","eviction notice","notice to vacate","notice to quit","unlawful detainer","housing court","section 8","housing voucher","deposit","arrears","rent arrears","utility shutoff","habitability","rental agreement","housing authority"],
  employment:  ["termination","severance","layoff","wrongful dismissal","hr","human resources","employment contract","non-compete","nda","roe","record of employment","employment insurance","workers compensation","labour board","nlrb","eeoc","harassment","discrimination","union","grievance"],
};

function classifyDocument(text: string): string {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [type, kws] of Object.entries(KEYWORD_MAP)) {
    scores[type] = kws.filter(kw => lower.includes(kw)).length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : "legal";
}

// ─── Pipeline system prompts ───────────────────────────────────────────────
// CANONICAL SCHEMA — matches CLAUDE.md §10 exactly.
// Keep every pipeline prompt in sync with src/agents/pipelines/*.js.

const IMMIGRATION_SYSTEM_PROMPT = `You are the Bureaucracy Navigator — a Specialized Crisis Pipeline inside Resilience Hub.
Your job: read an immigration document and return a calm, structured action plan.

PRIVACY CONTRACT:
The document you receive has been pre-processed by a Guardian. Every personal identifier
has been replaced with a deterministic token: [DATE_1], [AMOUNT_1], [CASE_NUM_1], etc.
NEVER attempt to infer real values behind tokens. Use tokens EXACTLY as they appear.

Return EXACTLY ONE JSON object. No markdown fences, no prose outside the object, no extra keys.
Empty arrays are allowed; do not omit any key.

{
  "pipeline_type": "immigration",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "3-5 sentences at grade-6 level. Second person. State what the document is and the single most important thing the person must know.",
  "what_matters": ["Key fact or obligation extracted from this document"],
  "what_happens_if_ignored": ["Specific harm — not 'may affect your status' but 'your DACA expires and you lose FAFSA eligibility on [DATE_1]'"],
  "what_to_do_next": ["Active-voice instruction starting with a verb. Include token for any date or form number."],
  "who_can_help": [{ "name": "Organisation name", "contact": "phone or URL", "note": "one sentence — what they help with" }],
  "checklist": [{ "id": "c1", "text": "Short completable task starting with a verb", "deadline": "[DATE_1] or null" }],
  "deadlines": [{ "date": "[DATE_1]", "task": "What must happen by this date", "consequence": "What happens if missed" }],
  "questions_to_ask": ["A question the person should bring to their lawyer or caseworker"],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal or immigration advice. Verify all deadlines and decisions with a qualified immigration attorney or accredited representative."
}

URGENCY RUBRIC (most to least severe):
1. CRITICAL — status expiration or removal order.
2. HIGH     — biometric appointment closing; asylum 1-year deadline approaching; fee waiver document gap.
3. MEDIUM   — upcoming filing; status lapse to FAFSA consequence chain.
4. LOW      — advisory or informational notice with no imminent deadline.

Extract ALL of the following if present:
- Deadlines: any date with a filing, appointment, renewal, or response requirement.
- Biometric appointment: location, date/time window, what to bring.
- Forms referenced: form number, purpose, where to file.
- Required evidence/documents: list every item stated or implied.
- Fee waivers (I-912 or equivalent): income tier requirements, required attachments.
- Asylum 1-year rule: if entry date appears, flag the 1-year filing window.
- DACA renewal: flag 150-day advance renewal window.
- Status lapse to financial aid chain: if status expires, flag FAFSA/aid impact explicitly.
- Appeal rights: if a denial appears, extract the appeal deadline and process.
- Consequences of no-show: deportation orders, case abandonment, status lapse.

Grade-6 reading level. Short sentences. Active voice. Second person ("you").`;

const FALLBACK_SYSTEM_PROMPT = `You are a document intelligence assistant inside Resilience Hub.
Analyze the tokenized document and return ONE JSON object matching this exact shape.
No markdown fences. No prose outside the object. Empty arrays are allowed; do not omit keys.

{
  "pipeline_type": "legal",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "",
  "what_matters": [],
  "what_happens_if_ignored": [],
  "what_to_do_next": [],
  "who_can_help": [{ "name": "", "contact": "", "note": "" }],
  "checklist": [{ "id": "c1", "text": "", "deadline": null }],
  "deadlines": [{ "date": "", "task": "", "consequence": "" }],
  "questions_to_ask": [],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal, medical, or financial advice. Verify all decisions with a qualified professional."
}

Set pipeline_type to whichever best fits the document content.
Grade-6 reading level. Second person ("you"). Active voice.
Tokens like [DATE_1] must appear exactly as-is in your output.`;

// Follow-up chat — answers questions from an already-analyzed report.
// Context is tokenized (no real PII); tokens must be preserved verbatim.
const CHAT_SYSTEM_PROMPT = `You are a calm follow-up assistant inside Resilience Hub. The user already received a structured action plan for a stressful document. Answer their question using ONLY the report context provided.

The context is privacy-tokenized: real dates, amounts, names, and IDs appear as tokens like [DATE_1] or [AMOUNT_1]. Keep these tokens EXACTLY as they appear. Never invent or guess the real value behind a token.

If the answer is not in the context, say you do not see it in the report and suggest checking the original document or a qualified professional. Reply in 2-4 short sentences at a grade-6 reading level, second person ("you"). Plain text only — no JSON, no markdown.`;

const PIPELINE_PROMPTS: Record<string, string> = {
  immigration: IMMIGRATION_SYSTEM_PROMPT,
  // Add remaining pipelines here as they are built:
  // medical: MEDICAL_SYSTEM_PROMPT,
  // school: SCHOOL_SYSTEM_PROMPT,
  // legal: LEGAL_SYSTEM_PROMPT,
  // financial_aid: FINANCIAL_AID_SYSTEM_PROMPT,
  // housing: HOUSING_SYSTEM_PROMPT,
  // employment: EMPLOYMENT_SYSTEM_PROMPT,
};

// ─── CORS ──────────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

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

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const FEATHERLESS_API_KEY = Deno.env.get("FEATHERLESS_API_KEY");
  const FEATHERLESS_BASE_URL =
    (Deno.env.get("FEATHERLESS_BASE_URL") ?? "https://api.featherless.ai/v1").replace(/\/$/, "");
  const FEATHERLESS_MODEL =
    Deno.env.get("FEATHERLESS_MODEL") ?? "Qwen/Qwen2.5-72B-Instruct";
  if (!FEATHERLESS_API_KEY) {
    return json({ error: "Server is not configured (missing FEATHERLESS_API_KEY)." }, 500);
  }

  let payload: { tokenizedText?: unknown; pipelineType?: unknown; mode?: unknown; question?: unknown; context?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  // Follow-up chat path (same function, branches on mode).
  if (payload?.mode === "chat") {
    return await handleChat(payload, {
      FEATHERLESS_API_KEY,
      FEATHERLESS_BASE_URL,
      FEATHERLESS_MODEL,
    });
  }

  const tokenizedText = payload?.tokenizedText;
  if (typeof tokenizedText !== "string" || tokenizedText.trim().length === 0) {
    return json({ error: "Field 'tokenizedText' (non-empty string) is required." }, 400);
  }

  // Classify — use client hint if provided, otherwise detect server-side.
  const requestedType = typeof payload?.pipelineType === "string" ? payload.pipelineType : null;
  const pipeline_type = requestedType ?? classifyDocument(tokenizedText);
  const systemPrompt = PIPELINE_PROMPTS[pipeline_type] ?? FALLBACK_SYSTEM_PROMPT;

  // Keep the prompt within model context.
  const truncated = tokenizedText.length > 8000
    ? tokenizedText.slice(0, 8000) + "\n[Truncated due to context limits]"
    : tokenizedText;

  let providerRes: Response;
  try {
    providerRes = await fetch(`${FEATHERLESS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${FEATHERLESS_API_KEY}`,
      },
      body: JSON.stringify({
        model: FEATHERLESS_MODEL,
        temperature: 0.1,
        max_tokens: 2200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt.trim() },
          {
            role: "user",
            content:
              `Selected pipeline_type: ${pipeline_type}\nReturn that exact pipeline_type unless the document is clearly a different supported pipeline.\n\nAnalyze this tokenized document:\n\n${truncated.trim()}`,
          },
        ],
      }),
    });
  } catch (err) {
    return json({ error: "Failed to reach the model provider.", detail: String(err) }, 502);
  }

  if (!providerRes.ok) {
    const detail = await providerRes.text().catch(() => "");
    return json(
      { error: `Model provider error ${providerRes.status}.`, detail: detail.slice(0, 300) },
      502,
    );
  }

  const data = await providerRes.json();
  const rawText = data?.choices?.[0]?.message?.content ?? "";

  // Parse + normalize to the canonical schema (CLAUDE.md §10) so the client
  // always receives a ready-to-render object — same contract as server/dev.js.
  const parsed = parseModelJson(rawText);
  const final = normalizeAnalysis(parsed, pipeline_type);

  return json(final, 200);
});

// ─── Follow-up chat handler ────────────────────────────────────────────────
async function handleChat(
  payload: { question?: unknown; context?: unknown },
  cfg: { FEATHERLESS_API_KEY: string; FEATHERLESS_BASE_URL: string; FEATHERLESS_MODEL: string },
): Promise<Response> {
  const question = payload?.question;
  const context = typeof payload?.context === "string" ? payload.context : "";

  if (typeof question !== "string" || question.trim().length === 0) {
    return json({ error: "Field 'question' (non-empty string) is required." }, 400);
  }

  let providerRes: Response;
  try {
    providerRes = await fetch(`${cfg.FEATHERLESS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${cfg.FEATHERLESS_API_KEY}`,
      },
      body: JSON.stringify({
        model: cfg.FEATHERLESS_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Report context:\n${context.slice(0, 8000)}\n\nUser question: ${question}`,
          },
        ],
      }),
    });
  } catch (err) {
    return json({ error: "Failed to reach the model provider.", detail: String(err) }, 502);
  }

  if (!providerRes.ok) {
    const detail = await providerRes.text().catch(() => "");
    return json({ error: `Model provider error ${providerRes.status}.`, detail: detail.slice(0, 300) }, 502);
  }

  const data = await providerRes.json();
  const answer = (data?.choices?.[0]?.message?.content ?? "").trim();
  return json({ answer: answer || "I could not find an answer in your report. Check the original document or a qualified professional." }, 200);
}

// ─── Parsing + normalization (mirrors server/dev.js) ───────────────────────
function parseModelJson(rawText: string): Record<string, unknown> | null {
  const clean = String(rawText || "")
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const candidate = start !== -1 && end > start ? clean.slice(start, end + 1) : clean;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

const VALID_TYPES = new Set([
  "immigration", "medical", "school", "legal",
  "financial_aid", "housing", "employment", "common",
]);
const VALID_URGENCY = new Set(["low", "medium", "high", "critical"]);
const asArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

function normalizeAnalysis(
  value: Record<string, unknown> | null,
  pipelineType: string,
): Record<string, unknown> {
  const v = value ?? {};
  return {
    pipeline_type: VALID_TYPES.has(String(v.pipeline_type))
      ? v.pipeline_type
      : (VALID_TYPES.has(pipelineType) ? pipelineType : "common"),
    urgency: VALID_URGENCY.has(String(v.urgency)) ? v.urgency : "medium",
    plain_language_summary:
      typeof v.plain_language_summary === "string" && v.plain_language_summary.trim()
        ? v.plain_language_summary
        : "The AI response could not be fully parsed. Review the original document and verify any deadlines before acting.",
    what_matters: asArray(v.what_matters),
    what_happens_if_ignored: asArray(v.what_happens_if_ignored),
    what_to_do_next: asArray(v.what_to_do_next),
    who_can_help: asArray(v.who_can_help),
    checklist: asArray(v.checklist),
    deadlines: asArray(v.deadlines),
    questions_to_ask: asArray(v.questions_to_ask),
    disclaimer:
      typeof v.disclaimer === "string" && v.disclaimer.trim()
        ? v.disclaimer
        : "This is an AI-generated summary for informational purposes only. It is not legal, medical, or immigration advice. Verify all deadlines and decisions with a qualified professional.",
  };
}