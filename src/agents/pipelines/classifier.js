/**
 * Classifier — pipeline_type detection
 *
 * Determines which Specialized Crisis Pipeline to use for a given document.
 * Uses a keyword-scoring heuristic (no extra LLM call) for Phase 1.
 *
 * Returns the pipeline_type and a confidence score (0–1).
 * If confidence is below threshold, the server can fall back to asking the user.
 *
 * pipeline_type values (from CLAUDE.md §12):
 *   immigration | medical | school | legal | financial_aid | housing | employment
 */

const KEYWORD_MAP = {
  immigration: [
    'visa', 'uscis', 'daca', 'i-797', 'i-485', 'i-130', 'i-765', 'i-912',
    'refugee', 'asylum', 'ircc', 'immigration', 'biometric', 'biometrics',
    'deportation', 'removal', 'green card', 'work permit', 'status', 'citizenship',
    'naturalization', 'petition', 'receipt number', 'a-number', 'alien',
    'form i-', 'notice to appear', 'nta', 'f-1', 'h-1b', 'eb-', 'dhs',
    'border', 'entry', 'lawful permanent', 'conditional resident',
    'advance parole', 'travel document', 'biographic', 'appointment notice',
    'irpa', 'prra', 'refugee protection', 'sponsorship', 'family class',
  ],
  medical: [
    'discharge', 'medication', 'prescription', 'diagnosis', 'treatment',
    'icu', 'surgery', 'hospital', 'physician', 'doctor', 'nurse',
    'dmz', 'dme', 'durable medical', 'insurance waiver', 'prior authorization',
    'follow-up appointment', 'specialist', 'titration', 'feeding pump',
    'wound care', 'home health', 'physical therapy', 'occupational therapy',
    'patient rights', 'hipaa', 'eob', 'explanation of benefits',
  ],
  school: [
    'scholarship', 'fafsa', 'financial aid', 'enrollment', 'tuition',
    'academic', 'suspension', 'expulsion', 'disciplinary', 'grade',
    'transcript', 'iep', 'accommodations', '504 plan', 'mckinney-vento',
    'student', 'university', 'college', 'school district', 'osap',
    'student loan', 'bursary', 'admissions', 'dean', 'registrar',
  ],
  legal: [
    'eviction', 'summons', 'subpoena', 'court', 'judge', 'hearing',
    'lawsuit', 'complaint', 'defendant', 'plaintiff', 'breach of contract',
    'garnishment', 'lien', 'judgment', 'appeal', 'motion', 'order to show cause',
    'restraining order', 'warrant', 'attorney', 'counsel', 'legal aid',
    'diversion', 'probation', 'restitution', 'community service',
  ],
  financial_aid: [
    'grant', 'benefit', 'welfare', 'snap', 'ebt', 'medicaid', 'chip',
    'ssi', 'ssdi', 'disability', 'unemployment', 'odsp', 'ontario works',
    'works', 'social assistance', 'food stamps', 'housing assistance',
    'income support', 'tax credit', 'eitc', 'gst credit', 'child benefit',
    'claim number', 'benefits office',
  ],
  housing: [
    'lease', 'landlord', 'tenant', 'rent', 'eviction notice', 'notice to vacate',
    'notice to quit', 'unlawful detainer', 'housing court', 'section 8',
    'housing voucher', 'deposit', 'arrears', 'rent arrears', 'utility shutoff',
    'repair', 'habitability', 'rental agreement', 'month-to-month',
    'property manager', 'housing authority',
  ],
  employment: [
    'termination', 'severance', 'layoff', 'wrongful dismissal', 'hr',
    'human resources', 'employment contract', 'non-compete', 'non-disclosure',
    'nda', 'roe', 'record of employment', 'ei', 'employment insurance',
    'workers compensation', 'labour board', 'nlrb', 'eeoc', 'harassment',
    'discrimination', 'workplace', 'employer', 'employee', 'union', 'grievance',
  ],
};

const CONFIDENCE_THRESHOLD = 0.35;

/**
 * Classify a tokenized document to determine which pipeline to use.
 *
 * @param {string} tokenizedText — Guardian output (tokens instead of real PII)
 * @returns {{ pipeline_type: string, confidence: number }}
 */
export function classifyDocument(tokenizedText) {
  const lower = tokenizedText.toLowerCase();
  const scores = {};
  let totalHits = 0;

  for (const [type, keywords] of Object.entries(KEYWORD_MAP)) {
    const hits = keywords.filter((kw) => lower.includes(kw)).length;
    scores[type] = hits;
    totalHits += hits;
  }

  if (totalHits === 0) {
    return { pipeline_type: 'common', confidence: 0 };
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sorted[0];
  const confidence = topScore / totalHits;

  return {
    pipeline_type: topType,
    confidence: parseFloat(confidence.toFixed(2)),
    scores, // exposed for debugging
  };
}

/**
 * Human-readable pipeline labels (for UI display).
 * Keep in sync with CLAUDE.md §4 pipeline table.
 */
export const PIPELINE_LABELS = {
  immigration:   'Bureaucracy Navigator',
  medical:       'Medical Navigator',
  school:        'Student Support Navigator',
  legal:         'LegalAid Navigator',
  financial_aid: 'Benefits & Aid Navigator',
  housing:       'Housing Stability Navigator',
  employment:    'Workplace Rights Navigator',
  common:        'General Crisis Reader',
};
