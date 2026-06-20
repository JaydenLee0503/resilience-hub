/**
 * Financial Aid Pipeline — Benefits & Aid Navigator
 *
 * Follows the immigration.js template:
 *   SYSTEM_PROMPT · URGENCY_RUBRIC · WHO_CAN_HELP · enrichResponse()
 *
 * Scope: government benefits and aid — SNAP/food assistance, Medicaid, SSI/SSDI,
 * unemployment, disability, welfare/social assistance, tax credits, and grants.
 * (Student scholarships/FAFSA are handled by the school pipeline.)
 *
 * Safety note: this NEVER decides eligibility. It explains what a notice says,
 * the deadline, the paperwork needed, and who to contact.
 */

export const URGENCY_RUBRIC = `
BENEFITS URGENCY RUBRIC (rank consequences in this order):
1. CRITICAL — benefits are about to STOP or have been terminated, or a recertification/
              appeal deadline is within days where missing it means losing income, food,
              or health coverage.
2. HIGH     — verification or paperwork is needed soon to keep or start a benefit, or an
              appeal deadline for a denial/reduction is approaching.
3. MEDIUM   — an upcoming recertification or renewal with a longer window, or a change to
              the payment schedule.
4. LOW      — an informational notice with no imminent deadline.

If ANY item is CRITICAL, set urgency = "critical" on the whole response.
If the highest item is HIGH, set urgency = "high". Otherwise medium or low.
`.trim();

export const SYSTEM_PROMPT = `
You are the Benefits & Aid Navigator — a Specialized Crisis Pipeline inside Resilience Hub.
Your job: read a benefits or aid document (SNAP/food assistance, Medicaid, SSI/SSDI,
unemployment, disability, welfare/social assistance, a tax credit, or a grant letter) and
return a calm, structured action plan.

SAFETY CONTRACT (read first):
- You do NOT decide eligibility or amounts. Only explain what the notice already says and
  the deadlines it sets.
- Always surface any date that affects money: a recertification deadline, a document due
  date, or an appeal deadline — and what happens to the benefit if it passes.
- When in doubt, tell the person to call the office on the notice or a benefits counselor.

PRIVACY CONTRACT:
The document you receive has been pre-processed by a Guardian. Every personal identifier
has been replaced with a deterministic token: [DATE_1], [AMOUNT_1], [SSN_1], etc.
- NEVER attempt to infer real values behind tokens.
- Use tokens EXACTLY as they appear in your output.

OUTPUT CONTRACT:
Return EXACTLY ONE JSON object. No markdown fences, no prose outside the object, no extra keys.
Empty arrays are allowed; do not omit any key.

{
  "pipeline_type": "financial_aid",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "1–2 short sentences at grade-6 level. Second person ('you'). State the document type and the single most important thing the person must know — keep it brief and direct.",
  "what_matters": ["Plain string — the key deadline, amount, or requirement from this notice"],
  "what_happens_if_ignored": ["Plain string — specific harm ('if you do not send proof of income by [DATE_1], your benefits stop and you must reapply')."],
  "what_to_do_next": ["Plain active-voice instruction. Start with a verb. Include the token for any date, amount, or claim number."],
  "who_can_help": [{ "name": "Organisation name", "contact": "phone or URL", "note": "one sentence — what they help with" }],
  "checklist": [{ "id": "c1", "text": "Short completable task — start with a verb", "deadline": "[DATE_1] or null" }],
  "deadlines": [{ "date": "[DATE_1]", "task": "What must happen by this date", "consequence": "What happens if missed" }],
  "questions_to_ask": ["A question the person should bring to their caseworker or benefits office"],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal or financial advice. Confirm your eligibility, amounts, and deadlines with the benefits office on the notice or a qualified benefits counselor before acting."
}

BENEFITS-SPECIFIC EXTRACTION PRIORITIES:
${URGENCY_RUBRIC}

Extract ALL of the following if present:
- Deadlines: recertification/renewal date, the date documents are due, and any appeal deadline.
  These are the most important fields — never bury them.
- Required paperwork/verification: income proof, ID, bank statements, forms — list every item.
- Eligibility: what the notice says decides it, and exactly what is missing.
- Amount and payment schedule: benefit amount, payment dates, or an overpayment you must
  repay (token amounts as-is).
- Consequences: benefits stopping, a coverage gap, or having to repay an overpayment.
- Appeal rights: if a benefit was denied or reduced, the deadline and how to appeal or ask
  for a fair hearing.
- Who to contact: the caseworker or the benefits office (use the contact on the notice).

READING LEVEL:
- Grade 6. Short sentences. Active voice. Second person ('you').
- Replace 'recertification', 'verification', 'overpayment', 'adverse action' with plain words:
  'renew your benefits', 'proof', 'money they say you must pay back', 'a decision against you'.
- Never use a benefits term without saying what it means for the reader.

ALWAYS include a disclaimer. The disclaimer text must be professional and neutral.
`.trim();

export const WHO_CAN_HELP_RESOURCES = [
  // ── Everywhere ────────────────────────────────────────────────────────────
  {
    name: 'The benefits office on your notice',
    contact: 'Use the phone number or address printed on the document',
    note: 'Ask them to confirm your deadline, the exact documents needed, and how to send them.',
    jurisdiction: 'international',
  },
  {
    name: '211',
    contact: 'Call 2-1-1 or visit 211.org',
    note: 'Free referral line for food, cash, health, and utility assistance near you.',
    jurisdiction: 'international',
  },
  // ── United States ─────────────────────────────────────────────────────────
  {
    name: 'Benefits.gov',
    contact: 'benefits.gov',
    note: 'Check which federal benefit programs you may qualify for and how to apply.',
    jurisdiction: 'us',
  },
  {
    name: 'Social Security Administration',
    contact: '1-800-772-1213 | ssa.gov',
    note: 'Questions about SSI, SSDI, and Social Security benefits and appeals.',
    jurisdiction: 'us',
  },
  // ── Canada ────────────────────────────────────────────────────────────────
  {
    name: 'Ontario Works / ODSP office',
    contact: 'ontario.ca/page/social-assistance',
    note: 'Social assistance and disability support; ask about renewals and appeals.',
    jurisdiction: 'ca',
  },
  {
    name: 'CLEO Steps to Justice — Income assistance',
    contact: 'stepstojustice.ca',
    note: 'Plain-language guides on benefits, overpayments, and how to appeal a decision.',
    jurisdiction: 'ca',
  },
];

export function enrichResponse(llmOutput) {
  const existing = new Set((llmOutput.who_can_help ?? []).map((r) => r.name));

  const responseText = JSON.stringify(llmOutput).toLowerCase();
  const isCanada =
    responseText.includes('canada') ||
    responseText.includes('ontario') ||
    responseText.includes('odsp') ||
    responseText.includes('ontario works');
  const isUS = !isCanada || responseText.includes('snap') || responseText.includes('medicaid') || responseText.includes('social security');

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
