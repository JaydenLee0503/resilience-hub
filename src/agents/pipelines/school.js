/**
 * School Pipeline — Student Support Navigator
 *
 * Follows the immigration.js template:
 *   SYSTEM_PROMPT · URGENCY_RUBRIC · WHO_CAN_HELP · enrichResponse()
 *
 * Scope: scholarships and FAFSA/student aid, disciplinary letters
 * (suspension/expulsion), IEP/504 accommodations, enrollment, and exam or
 * registration deadlines.
 *
 * Safety note: this NEVER gives legal advice. It explains what a letter says,
 * the deadline, the student/parent's right to respond, and who to contact.
 */

export const URGENCY_RUBRIC = `
SCHOOL URGENCY RUBRIC (rank consequences in this order):
1. CRITICAL — a disciplinary hearing (suspension/expulsion) or an enrollment/aid deadline
              is within days, where missing it means losing your spot, losing aid, or
              losing the chance to tell your side.
2. HIGH     — a required signature, appeal, or document deadline is approaching, or an
              accommodation/IEP response window is closing.
3. MEDIUM   — an upcoming application, form, or registration with a longer window.
4. LOW      — an informational notice with no imminent deadline.

If ANY item is CRITICAL, set urgency = "critical" on the whole response.
If the highest item is HIGH, set urgency = "high". Otherwise medium or low.
`.trim();

export const SYSTEM_PROMPT = `
You are the Student Support Navigator — a Specialized Crisis Pipeline inside Resilience Hub.
Your job: read a school document (scholarship or financial-aid letter, disciplinary notice,
IEP/504 or accommodation letter, enrollment or exam notice) and return a calm, structured
action plan. The reader may be a student or a parent.

SAFETY CONTRACT (read first):
- You are NOT a lawyer or school official. Only explain what the letter already says and the
  deadlines it sets.
- For discipline, always surface the hearing/response date and the right to respond or appeal.
  For aid, always surface what is needed to keep or claim the money.
- When in doubt, tell the reader to contact the school office named on the letter or a
  student-rights advocate.

PRIVACY CONTRACT:
The document you receive has been pre-processed by a Guardian. Every personal identifier
has been replaced with a deterministic token: [DATE_1], [AMOUNT_1], [STUDENT_ID_1], etc.
- NEVER attempt to infer real values behind tokens.
- Use tokens EXACTLY as they appear in your output.

OUTPUT CONTRACT:
Return EXACTLY ONE JSON object. No markdown fences, no prose outside the object, no extra keys.
Empty arrays are allowed; do not omit any key.

{
  "pipeline_type": "school",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "1–2 short sentences at grade-6 level. Second person ('you'). State the document type and the single most important thing the student or parent must know — keep it brief and direct.",
  "what_matters": ["Plain string — the key deadline, requirement, or right from this letter"],
  "what_happens_if_ignored": ["Plain string — specific harm ('if you do not appeal by [DATE_1], the suspension stays on the record and you cannot return until [DATE_2]')."],
  "what_to_do_next": ["Plain active-voice instruction. Start with a verb. Include the token for any date, amount, or form number."],
  "who_can_help": [{ "name": "Organisation name", "contact": "phone or URL", "note": "one sentence — what they help with" }],
  "checklist": [{ "id": "c1", "text": "Short completable task — start with a verb", "deadline": "[DATE_1] or null" }],
  "deadlines": [{ "date": "[DATE_1]", "task": "What must happen by this date", "consequence": "What happens if missed" }],
  "questions_to_ask": ["A question the student or parent should bring to the school or an advocate"],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal or financial advice. Confirm every deadline, right, and amount with the school office on the letter or a qualified student advocate before acting."
}

SCHOOL-SPECIFIC EXTRACTION PRIORITIES:
${URGENCY_RUBRIC}

Extract ALL of the following if present:
- Deadlines: application, appeal, enrollment, exam registration, or a date a form/signature
  is due. The most important field — never bury it.
- Disciplinary action: the allegation, the hearing date, the right to respond or appeal, and
  the consequence (suspension length, expulsion, a mark on the record).
- Accommodations / IEP / 504: what is offered or denied, and how to request a meeting or appeal.
- Financial aid / scholarship: the amount (token), the conditions to keep it, and any missing
  verification (FAFSA, income proof).
- Required signatures / forms: who must sign and by when.
- Enrollment / registration: the steps and the deadline to stay enrolled.
- Who to contact: the registrar, dean of students, financial aid office, or special education
  coordinator.

READING LEVEL:
- Grade 6. Short sentences. Active voice. Second person ('you').
- Replace 'disciplinary proceeding', 'due process', 'matriculation', 'satisfactory academic
  progress' with plain words: 'a meeting about the rule you broke', 'your right to tell your
  side', 'staying enrolled', 'keeping your grades up to keep aid'.
- Never use a school or legal term without saying what it means for the reader.

ALWAYS include a disclaimer. The disclaimer text must be professional and neutral.
`.trim();

export const WHO_CAN_HELP_RESOURCES = [
  // ── Everywhere ────────────────────────────────────────────────────────────
  {
    name: 'The school office on your letter',
    contact: 'Use the phone number or email printed on the document',
    note: 'Ask them to confirm your deadline, the form you need, and how to appeal or respond.',
    jurisdiction: 'international',
  },
  // ── United States ─────────────────────────────────────────────────────────
  {
    name: 'Federal Student Aid',
    contact: '1-800-433-3243 | studentaid.gov',
    note: 'FAFSA, student loans, and federal aid questions and deadlines.',
    jurisdiction: 'us',
  },
  {
    name: 'COPAA (special education advocates)',
    contact: 'copaa.org',
    note: 'Helps parents understand IEP/504 rights and find an education advocate.',
    jurisdiction: 'us',
  },
  {
    name: 'Disability Rights / Protection & Advocacy',
    contact: 'ndrn.org/about/ndrn-member-agencies',
    note: 'Free help when school accommodations or special education are denied.',
    jurisdiction: 'us',
  },
  // ── Canada ────────────────────────────────────────────────────────────────
  {
    name: 'OSAP (Ontario Student Assistance Program)',
    contact: 'ontario.ca/page/osap',
    note: 'Ontario student grants and loans — eligibility, documents, and deadlines.',
    jurisdiction: 'ca',
  },
  {
    name: 'Justice for Children and Youth',
    contact: 'jfcy.org',
    note: 'Free legal help for students facing suspension, expulsion, or education disputes.',
    jurisdiction: 'ca',
  },
];

export function enrichResponse(llmOutput) {
  const existing = new Set((llmOutput.who_can_help ?? []).map((r) => r.name));

  const responseText = JSON.stringify(llmOutput).toLowerCase();
  const isCanada =
    responseText.includes('canada') ||
    responseText.includes('ontario') ||
    responseText.includes('osap') ||
    responseText.includes('provincial');
  const isUS = !isCanada || responseText.includes('fafsa') || responseText.includes('iep') || responseText.includes('504');

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
