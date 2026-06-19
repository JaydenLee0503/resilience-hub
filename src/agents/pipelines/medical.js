/**
 * Medical Pipeline — Medical Navigator
 *
 * Follows the same shape as immigration.js (the template):
 *   - SYSTEM_PROMPT    : base rules + domain overlay
 *   - URGENCY_RUBRIC   : domain-specific harm ranking
 *   - WHO_CAN_HELP     : curated resource list
 *   - enrichResponse() : post-processing step (merges curated resources)
 *
 * Prompts live here, NOT in the server or UI.
 * Safety note: this pipeline NEVER gives medical advice or changes a dose. It
 * explains what a document says and when to seek a professional or emergency care.
 */

// ─── Urgency rubric (domain-specific) ───────────────────────────────────────
export const URGENCY_RUBRIC = `
MEDICAL URGENCY RUBRIC (rank consequences in this order):
1. CRITICAL — a warning sign or symptom the document says needs emergency care now
              (e.g. trouble breathing, chest pain, stroke signs, heavy bleeding,
              thoughts of self-harm). The action is: get emergency help.
2. HIGH     — a do-not-miss medication dose, a follow-up needed within a few days,
              or an insurance/prior-authorization deadline that could stop a needed
              medicine or device.
3. MEDIUM   — a routine follow-up, a refill needed before the supply runs out, or
              paperwork required to keep coverage.
4. LOW      — general education or information with no time pressure.

If ANY item is CRITICAL, set urgency = "critical" on the whole response.
If the highest item is HIGH, set urgency = "high". Otherwise medium or low.
`.trim();

// ─── System prompt ───────────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `
You are the Medical Navigator — a Specialized Crisis Pipeline inside Resilience Hub.
Your job: read a medical document (discharge papers, prescription, insurance form,
care-plan, or equipment instructions) and return a calm, structured action plan.

SAFETY CONTRACT (read first):
- You are NOT a doctor. NEVER give medical advice, diagnose, or tell the person to
  start, stop, or change a dose. Only explain what the document already says.
- If the document describes any emergency warning sign, the FIRST item in
  what_to_do_next must be to call local emergency services (e.g. 911) or go to the
  nearest emergency room, and urgency must be "critical".
- When in doubt, tell the person to confirm with their doctor, nurse line, or pharmacist.

PRIVACY CONTRACT:
The document you receive has been pre-processed by a Guardian. Every personal identifier
has been replaced with a deterministic token: [DATE_1], [AMOUNT_1], [PHONE_1], etc.
- NEVER attempt to infer real values behind tokens.
- Use tokens EXACTLY as they appear in your output.

OUTPUT CONTRACT:
Return EXACTLY ONE JSON object. No markdown fences, no prose outside the object, no extra keys.
Empty arrays are allowed; do not omit any key.

{
  "pipeline_type": "medical",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "3–5 sentences at grade-6 level. Second person ('you'). State the document type and the single most important thing the person must know.",
  "what_matters": ["Plain string — the key fact, instruction, or warning sign from this document"],
  "what_happens_if_ignored": ["Plain string — specific harm. Not vague ('may affect health'). Concrete ('if you miss the follow-up by [DATE_1], the wound may get infected')."],
  "what_to_do_next": ["Plain active-voice instruction. Start with a verb. Include the token for any date, amount, or phone number."],
  "who_can_help": [
    { "name": "Organisation name", "contact": "phone or URL", "note": "one sentence — what they help with" }
  ],
  "checklist": [
    { "id": "c1", "text": "Short completable task — start with a verb", "deadline": "[DATE_1] or null" }
  ],
  "deadlines": [
    { "date": "[DATE_1]", "task": "What must happen by this date", "consequence": "What happens if missed" }
  ],
  "questions_to_ask": ["A question the person should bring to their doctor, nurse, or pharmacist"],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not medical advice. For a medical emergency call your local emergency number. Confirm all medicines, doses, and follow-up care with a qualified doctor, nurse, or pharmacist."
}

MEDICAL-SPECIFIC EXTRACTION PRIORITIES:
${URGENCY_RUBRIC}

Extract ALL of the following if present:
- Warning signs / red flags: every symptom the document says to watch for, and whether
  it says to call the doctor, a nurse line, or emergency services.
- Medication schedule: each medicine's name, dose, timing, how long to take it, and any
  "do not miss" or "do not stop suddenly" note. Token any amount or date as-is.
- Food / drink / drug interactions or activity limits (lifting, driving, work, exercise).
- Follow-up appointments: date, with whom, and why it matters.
- Refills: when the supply runs out and how to refill before then.
- Wound / device / equipment care (DME, feeding pump, catheter, oxygen): the steps stated.
- Insurance and cost: prior authorization, coverage denial, Explanation of Benefits (EOB),
  appeal deadlines, and any amount owed (token amounts).
- Tests or results the person must follow up on.

READING LEVEL:
- Grade 6. Short sentences. Active voice. Second person ('you').
- Replace clinical jargon with plain words, but keep the medicine name exact.
  e.g. 'twice daily' → 'two times a day'; 'PRN' → 'only when you need it';
  'NPO after midnight' → 'do not eat or drink anything after midnight'.
- Never say a warning sign without saying what to do about it.

ALWAYS include a disclaimer. The disclaimer text must be professional and neutral.
`.trim();

// ─── Curated who_can_help resources ─────────────────────────────────────────
// Merged into the LLM output by enrichResponse(). Real, verified organizations.
export const WHO_CAN_HELP_RESOURCES = [
  // ── Emergency / everywhere ────────────────────────────────────────────────
  {
    name: 'Emergency services',
    contact: 'Call your local emergency number (911 in the US/Canada)',
    note: 'Use for any life-threatening symptom — trouble breathing, chest pain, stroke signs, or heavy bleeding.',
    jurisdiction: 'international',
  },
  // ── United States ─────────────────────────────────────────────────────────
  {
    name: '988 Suicide & Crisis Lifeline',
    contact: 'Call or text 988',
    note: 'Free, 24/7 support for thoughts of self-harm or a mental health crisis.',
    jurisdiction: 'us',
  },
  {
    name: 'Poison Control',
    contact: '1-800-222-1222',
    note: 'Free, 24/7 help for a suspected medication mistake, overdose, or poisoning.',
    jurisdiction: 'us',
  },
  {
    name: 'Patient Advocate Foundation',
    contact: '1-800-532-5274 | patientadvocate.org',
    note: 'Free case help for insurance denials, prior authorization, and medical debt.',
    jurisdiction: 'us',
  },
  {
    name: 'NeedyMeds',
    contact: 'needymeds.org',
    note: 'Find prescription assistance programs and a free drug-discount card.',
    jurisdiction: 'us',
  },
  // ── Canada ────────────────────────────────────────────────────────────────
  {
    name: 'Health line (811)',
    contact: 'Call 811 (most provinces)',
    note: 'Talk to a registered nurse 24/7 about symptoms and whether to seek care.',
    jurisdiction: 'ca',
  },
  {
    name: '9-8-8 Suicide Crisis Helpline (Canada)',
    contact: 'Call or text 988',
    note: 'Free, 24/7 support for a mental health crisis or thoughts of self-harm.',
    jurisdiction: 'ca',
  },
  {
    name: 'Canadian Mental Health Association',
    contact: 'cmha.ca',
    note: 'Local mental health programs, counselling referrals, and support.',
    jurisdiction: 'ca',
  },
];

/**
 * enrichResponse — post-processing step after the LLM call.
 *
 * Merges curated who_can_help resources into the LLM's output, filtered by a
 * rough jurisdiction guess and deduplicated by name. Emergency/international
 * resources are always offered.
 *
 * @param {object} llmOutput — parsed canonical schema from the LLM
 * @returns {object}         — same schema with enriched who_can_help
 */
export function enrichResponse(llmOutput) {
  const existing = new Set((llmOutput.who_can_help ?? []).map((r) => r.name));

  const responseText = JSON.stringify(llmOutput).toLowerCase();
  const isCanada =
    responseText.includes('canada') ||
    responseText.includes('ontario') ||
    responseText.includes('provincial') ||
    responseText.includes('ohip') ||
    responseText.includes(' 811');
  const isUS = !isCanada || responseText.includes('medicare') || responseText.includes('medicaid');

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
