/**
 * simplifier.js — LLM call wrapper
 *
 * SECURITY RULE (CLAUDE.md §9.1):
 * This module NEVER calls api.anthropic.com directly.
 * The Anthropic key lives only in the server/Edge Function.
 *
 * In development : calls http://localhost:3001/api/analyze (server/dev.js)
 * In production  : calls the Supabase Edge Function via VITE_SUPABASE_URL
 *
 * If VITE_ANALYZE_URL is set, that takes precedence (useful for staging environments).
 */

function getAnalyzeUrl() {
  // Explicit override (staging, custom backend, etc.)
  if (import.meta.env.VITE_ANALYZE_URL) return import.meta.env.VITE_ANALYZE_URL;

  // Development: Vite dev server → local Node server
  if (import.meta.env.DEV) return 'http://localhost:3001/api/analyze';

  // Production: Supabase Edge Function
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error(
      '[simplifier] VITE_SUPABASE_URL is not set. ' +
      'Add it to .env or set VITE_ANALYZE_URL to point to your backend.'
    );
  }
  return `${supabaseUrl}/functions/v1/analyze`;
}

/**
 * Run the analysis pipeline server-side.
 *
 * The server receives tokenized text (no real PII), classifies the document,
 * runs the appropriate Specialized Crisis Pipeline prompt, and returns a
 * canonical schema object (CLAUDE.md §10).
 *
 * @param {string} tokenizedText   — Guardian output (tokens, no real PII)
 * @param {string} [pipelineType]  — optional override; server classifies if omitted
 * @returns {Promise<object>}      — canonical schema (pipeline_type, urgency, …)
 */
export async function runSimplifier(tokenizedText, pipelineType) {
  const url = getAnalyzeUrl();

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenizedText, pipelineType }),
    });
  } catch (err) {
    // Network error — dev server probably isn't running
    if (import.meta.env.DEV) {
      throw new Error(
        'Could not reach the dev server at http://localhost:3001. ' +
        'Run "npm run dev:server" in a separate terminal (or "npm run dev:all").'
      );
    }
    throw new Error('Could not reach the analysis service. Please try again.');
  }

  if (!response.ok) {
    let message = `Analysis service error (${response.status})`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch { /* ignore parse error */ }
    throw new Error(message);
  }

  const analysis = await response.json();

  // Validate the canonical schema (CLAUDE.md §10)
  validateSchema(analysis);

  return analysis;
}

/**
 * Validate that the server returned a conforming canonical schema.
 * Throws if critical fields are missing. Logs warnings for empty arrays.
 *
 * @param {object} obj
 */
function validateSchema(obj) {
  const REQUIRED_KEYS = [
    'pipeline_type', 'urgency', 'plain_language_summary',
    'what_matters', 'what_happens_if_ignored', 'what_to_do_next',
    'who_can_help', 'checklist', 'deadlines', 'questions_to_ask', 'disclaimer',
  ];

  const VALID_PIPELINE_TYPES = [
    'immigration', 'medical', 'school', 'legal', 'financial_aid', 'housing', 'employment', 'common',
  ];

  const VALID_URGENCY = ['low', 'medium', 'high', 'critical'];

  for (const key of REQUIRED_KEYS) {
    if (!(key in obj)) {
      throw new Error(`Analysis response is missing required field: "${key}". Please try again.`);
    }
  }

  if (!VALID_PIPELINE_TYPES.includes(obj.pipeline_type)) {
    console.warn(`[simplifier] Unexpected pipeline_type: "${obj.pipeline_type}"`);
  }

  if (!VALID_URGENCY.includes(obj.urgency)) {
    console.warn(`[simplifier] Unexpected urgency: "${obj.urgency}"`);
    obj.urgency = 'medium'; // safe default
  }
}
