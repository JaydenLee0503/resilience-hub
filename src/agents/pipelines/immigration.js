/**
 * Immigration Pipeline — Bureaucracy Navigator
 *
 * This is the template for all future Specialized Crisis Pipelines.
 * Every other pipeline (medical, school, legal…) follows this same shape:
 *   - SYSTEM_PROMPT    : base rules + domain overlay
 *   - URGENCY_RUBRIC   : domain-specific harm ranking
 *   - WHO_CAN_HELP     : curated, jurisdiction-aware resource list
 *   - enrichResponse() : post-processing step (merges curated resources)
 *
 * Prompts live here, NOT in the server or UI.
 * The server imports this module and uses SYSTEM_PROMPT for the LLM call.
 */

// ─── Urgency rubric (domain-specific) ───────────────────────────────────────
// Ordered by consequence severity. The LLM uses this to score urgency.
export const URGENCY_RUBRIC = `
IMMIGRATION URGENCY RUBRIC (rank consequences in this order):
1. CRITICAL — status expiration or removal order; acting is the only option.
2. HIGH     — biometric appointment window closing; fee waiver document gap; asylum 1-year deadline approaching.
3. MEDIUM   — financial aid consequence chain (FAFSA/status link); upcoming required filing.
4. LOW      — advisory or informational notice with no imminent deadline.

If ANY item is CRITICAL, set urgency = "critical" on the whole response.
If the highest item is HIGH, set urgency = "high".
Otherwise medium or low.
`.trim();

// ─── System prompt ───────────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `
You are the Bureaucracy Navigator — a Specialized Crisis Pipeline inside Resilience Hub.
Your job: read an immigration document and return a calm, structured action plan.

PRIVACY CONTRACT:
The document you receive has been pre-processed by a Guardian. Every personal identifier
has been replaced with a deterministic token: [DATE_1], [AMOUNT_1], [CASE_NUM_1], etc.
- NEVER attempt to infer real values behind tokens.
- Use tokens EXACTLY as they appear in your output.

OUTPUT CONTRACT:
Return EXACTLY ONE JSON object. No markdown fences, no prose outside the object, no extra keys.
Empty arrays are allowed; do not omit any key.

{
  "pipeline_type": "immigration",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "3–5 sentences at grade-6 level. Second person ('you'). State the document type and the single most important thing the person must know.",
  "what_matters": ["Plain string — the key fact or obligation extracted from this document"],
  "what_happens_if_ignored": ["Plain string — specific harm. Not vague ('may affect status'). Concrete ('your DACA expires and you lose FAFSA eligibility on [DATE_1]')."],
  "what_to_do_next": ["Plain active-voice instruction. Start with a verb. Include the token for any date or form number."],
  "who_can_help": [
    { "name": "Organisation name", "contact": "phone or URL", "note": "one sentence — what they help with" }
  ],
  "checklist": [
    { "id": "c1", "text": "Short completable task — start with a verb", "deadline": "[DATE_1] or null" }
  ],
  "deadlines": [
    { "date": "[DATE_1]", "task": "What must happen by this date", "consequence": "What happens if missed" }
  ],
  "questions_to_ask": ["A question the person should bring to their lawyer or caseworker"],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal or immigration advice. Verify all deadlines and decisions with a qualified immigration attorney or accredited representative."
}

IMMIGRATION-SPECIFIC EXTRACTION PRIORITIES:
${URGENCY_RUBRIC}

Extract ALL of the following if present:
- Deadlines: any date with a filing, appointment, renewal, or response requirement.
- Biometric appointment: location, date/time window, what to bring.
- Forms referenced: form number, purpose, where to file.
- Required evidence/documents: list every item stated or implied.
- Fee waivers (I-912 or equivalent): income tier requirements, required attachments.
- Case / receipt / A-number: token them, reference them in what_to_do_next.
- Asylum 1-year rule: if entry date appears, flag the 1-year filing window.
- DACA renewal: flag 150-day advance renewal window.
- Status lapse → financial aid chain: if status expires, flag FAFSA/aid impact explicitly.
- Appeal rights: if a denial appears, extract the appeal deadline and process.
- Consequences of no-show: deportation orders, case abandonment, status lapse.

READING LEVEL:
- Grade 6. Short sentences. Active voice. Second person ('you').
- Replace: 'pursuant to', 'in accordance with', 'herein', 'hereafter', 'aforementioned'.
- With: 'because of', 'following', 'here', 'after this', 'mentioned above'.
- For teen readers: even simpler. Never say 'removal proceedings' without also saying 'this means the government may try to deport you'.

ALWAYS include a disclaimer. The disclaimer text must be professional and neutral.
`.trim();

// ─── Curated who_can_help resources ─────────────────────────────────────────
// These are merged into the LLM output by enrichResponse().
// Sources are real, verified organizations. Update annually.
export const WHO_CAN_HELP_RESOURCES = [
  // ── United States ─────────────────────────────────────────────────────────
  {
    name: 'USCIS Contact Center',
    contact: '1-800-375-5283 | uscis.gov',
    note: 'Check case status, reschedule biometrics, ask about your specific form.',
    jurisdiction: 'us',
  },
  {
    name: 'Immigration Legal Resource Center (ILRC)',
    contact: 'ilrc.org',
    note: 'Free legal guides, self-help tools, and referrals to local legal aid.',
    jurisdiction: 'us',
  },
  {
    name: 'National Immigration Law Center (NILC)',
    contact: 'nilc.org',
    note: 'Policy advocacy, Know Your Rights guides, and legal referrals.',
    jurisdiction: 'us',
  },
  {
    name: 'American Immigration Council',
    contact: 'americanimmigrationcouncil.org',
    note: 'Pro bono legal referrals and immigration court resources.',
    jurisdiction: 'us',
  },
  {
    name: 'CLINIC (Catholic Legal Immigration Network)',
    contact: '1-301-434-2750 | cliniclegal.org',
    note: 'Accredited immigration legal services across the US.',
    jurisdiction: 'us',
  },
  // ── Canada ────────────────────────────────────────────────────────────────
  {
    name: 'IRCC (Immigration, Refugees and Citizenship Canada)',
    contact: '1-888-242-2100 | ircc.canada.ca',
    note: 'Check application status, book appointments, update your address.',
    jurisdiction: 'ca',
  },
  {
    name: 'CLEO (Community Legal Education Ontario)',
    contact: 'cleo.on.ca',
    note: 'Plain-language legal guides for Ontario residents, including immigration.',
    jurisdiction: 'ca',
  },
  {
    name: 'OCASI (Ontario Council of Agencies Serving Immigrants)',
    contact: 'ocasi.org',
    note: 'Connects newcomers to settlement services, legal aid, and community support.',
    jurisdiction: 'ca',
  },
  // ── International / Asylum ────────────────────────────────────────────────
  {
    name: 'UNHCR (UN Refugee Agency)',
    contact: 'unhcr.org/help',
    note: 'Refugee registration, resettlement referrals, and country-specific guidance.',
    jurisdiction: 'international',
  },
];

/**
 * enrichResponse — post-processing step after the LLM call.
 *
 * Merges curated who_can_help resources into the LLM's output.
 * Detects jurisdiction from the response and filters to the most relevant resources.
 * Deduplicates by name so the LLM's own suggestions aren't overwritten.
 *
 * @param {object} llmOutput — parsed canonical schema from the LLM
 * @returns {object}         — same schema with enriched who_can_help
 */
export function enrichResponse(llmOutput) {
  const existing = new Set((llmOutput.who_can_help ?? []).map((r) => r.name));

  // Detect jurisdiction from text in the response (rough heuristic)
  const responseText = JSON.stringify(llmOutput).toLowerCase();
  const isCanada = responseText.includes('canada') || responseText.includes('ircc') || responseText.includes(' ca ');
  const isUS = !isCanada || responseText.includes('uscis') || responseText.includes('daca');

  const relevant = WHO_CAN_HELP_RESOURCES.filter((r) => {
    if (r.jurisdiction === 'international') return true;
    if (isCanada && r.jurisdiction === 'ca') return true;
    if (isUS && r.jurisdiction === 'us') return true;
    return false;
  });

  const toAdd = relevant.filter((r) => !existing.has(r.name)).slice(0, 4);

  return {
    ...llmOutput,
    who_can_help: [...(llmOutput.who_can_help ?? []), ...toAdd],
  };
}
