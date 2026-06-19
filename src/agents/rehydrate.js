/**
 * Rehydrate — client-side PII restoration
 *
 * After agents return structured output containing tokens like [DATE_1],
 * this runs entirely on the device to swap tokens back to real values
 * before the UI renders them.
 *
 * The model never saw the real values. The user sees them only after
 * rehydration happens here.
 *
 * @param {string} text           — text containing tokens like [DATE_1]
 * @param {Map<string,string>} mappingTable — token → original value
 * @returns {string}
 */
export function rehydrate(text, mappingTable) {
  if (!mappingTable || !text) return text ?? '';
  let result = text;
  mappingTable.forEach((original, token) => {
    // Escape brackets for use in a literal string replace
    result = result.replaceAll(token, original);
  });
  return result;
}

/**
 * Rehydrate a nested structure (object or array) deeply.
 * Walks string-valued leaves; leaves non-strings untouched.
 *
 * @param {any} value
 * @param {Map<string,string>} mappingTable
 * @returns {any}
 */
export function rehydrateDeep(value, mappingTable) {
  if (typeof value === 'string') return rehydrate(value, mappingTable);
  if (Array.isArray(value)) return value.map((item) => rehydrateDeep(item, mappingTable));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rehydrateDeep(v, mappingTable)])
    );
  }
  return value;
}
