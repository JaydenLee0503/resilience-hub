/**
 * Guardian — Phase 0 PII Tokenizer
 *
 * The privacy boundary is CODE, not a system prompt.
 * Raw document enters here. Only tokenized text and the
 * mapping table leave. The table NEVER leaves the device.
 *
 * Phase 0: regex-only pass for structured identifiers.
 * Phase 1 will add transformers.js NER for names and addresses.
 *
 * Determinism guarantee: the same value always maps to the
 * same token within one session, so agents can reason about
 * relationships ("the [AMOUNT_1] payment is due by [DATE_1]")
 * without ever seeing real data.
 */

// Ordered by specificity — run most specific first to avoid
// partial matches inside later patterns.
const PATTERNS = [
  // US Social Security Number: 000-00-0000
  { key: 'SSN',     regex: /\b\d{3}-\d{2}-\d{4}\b/g },

  // Canadian SIN: 000-000-000 or 000 000 000
  { key: 'SIN',     regex: /\b\d{3}[- ]\d{3}[- ]\d{3}\b/g },

  // Ontario OHIP health card: 0000-000-000 or 0000 000 000
  { key: 'HEALTH',  regex: /\b\d{4}[- ]\d{3}[- ]\d{3}\b/g },

  // North American phone numbers (many formats)
  {
    key: 'PHONE',
    regex: /\b(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g,
  },

  // Dollar amounts: $1,247.00 or $800
  { key: 'AMOUNT',  regex: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g },

  // Canadian postal codes: A1A 1A1 or A1A1A1
  { key: 'POSTAL',  regex: /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi },

  // ISO dates: 2026-08-31 (run before numeric dates to avoid double-match)
  { key: 'DATE',    regex: /\b\d{4}-\d{2}-\d{2}\b/g },

  // Long-form dates: August 31, 2026 / Aug 31 2026
  {
    key: 'DATE',
    regex: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi,
  },

  // Numeric dates: 01/15/2026 or 1-15-2026 or 01.15.26
  { key: 'DATE',    regex: /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g },
];

/**
 * @param {string} rawText  — the full document as plain text
 * @returns {{ tokenized: string, mappingTable: Map<string,string>, stats: object }}
 *
 * mappingTable: token → original value (e.g. "[DATE_1]" → "August 31, 2026")
 * stats: for the "demoable moment" UI — how many spans were redacted and of which types
 */
export function runGuardian(rawText) {
  // token → original value
  const mappingTable = new Map();
  // original value → token (for determinism within a session)
  const valueToToken = new Map();
  // per-key counters
  const counters = {};
  // track what was redacted for the UI badge
  const stats = { total: 0, types: {} };

  const getToken = (key, value) => {
    // Determinism: same value → same token within this session
    if (valueToToken.has(value)) return valueToToken.get(value);

    counters[key] = (counters[key] || 0) + 1;
    const token = `[${key}_${counters[key]}]`;

    mappingTable.set(token, value);
    valueToToken.set(value, token);

    stats.total += 1;
    stats.types[key] = (stats.types[key] || 0) + 1;

    return token;
  };

  let tokenized = rawText;

  PATTERNS.forEach(({ key, regex }) => {
    // Reset lastIndex for global regexes used across calls
    regex.lastIndex = 0;
    tokenized = tokenized.replace(regex, (match) => getToken(key, match));
  });

  return { tokenized, mappingTable, stats };
}

/**
 * Verify the Guardian ran by checking for residual structured PII.
 * Returns an array of any patterns that still match (should be empty).
 * Useful for testing.
 */
export function auditTokenized(tokenized) {
  const residual = [];
  PATTERNS.forEach(({ key, regex }) => {
    regex.lastIndex = 0;
    const matches = [...tokenized.matchAll(regex)];
    if (matches.length) residual.push({ key, matches: matches.map((m) => m[0]) });
  });
  return residual;
}
