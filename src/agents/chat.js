/**
 * chat.js — Follow-up chat call wrapper
 *
 * SECURITY RULE (CLAUDE.md §9.1 / §9.2):
 * The model-provider key (FEATHERLESS_API_KEY) lives ONLY in the server/Edge
 * Function — never in the browser. This module talks to that backend.
 *
 * Privacy boundary: the follow-up chat runs entirely in TOKEN space. We take the
 * (re-hydrated, real-value) report the user is looking at plus their typed
 * question, run BOTH through the Guardian in a single pass, and send only the
 * tokenized text to the AI. The real values are restored on this device after
 * the answer comes back. The AI sees [DATE_1], never a real date.
 *
 * In development : POST http://localhost:3001/api/chat   (server/dev.js)
 * In production  : POST the Supabase Edge Function with { mode: 'chat' }
 */

import { runGuardian } from './guardian';
import { rehydrate } from './rehydrate';

// A separator the Guardian will never tokenize (no PII patterns). Lets us run
// the context and the question through one Guardian pass (so a value shared by
// both maps to the same token) and split them apart again afterwards.
const QUESTION_MARKER = '@@@USER_QUESTION@@@';

function getChatUrl() {
  if (import.meta.env.VITE_CHAT_URL) return import.meta.env.VITE_CHAT_URL;
  if (import.meta.env.DEV) return 'http://localhost:3001/api/chat';

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('[chat] VITE_SUPABASE_URL is not set. Add it to .env or set VITE_CHAT_URL.');
  }
  // Same Edge Function as analyze — it branches on body.mode.
  return `${supabaseUrl}/functions/v1/analyze`;
}

/**
 * Flatten a (re-hydrated) canonical report into a compact plain-text context
 * for the model to answer from.
 */
function buildContext(report) {
  const lines = [];
  const list = (label, arr) => {
    if (Array.isArray(arr) && arr.length) {
      lines.push(`${label}:`);
      arr.forEach((item) => lines.push(`- ${item}`));
    }
  };

  if (report.plain_language_summary) lines.push(`Summary: ${report.plain_language_summary}`);
  lines.push(`Urgency: ${report.urgency ?? 'medium'}`);
  list('What matters', report.what_matters);
  list('What happens if ignored', report.what_happens_if_ignored);
  list('What to do next', report.what_to_do_next);
  list('Deadlines', (report.deadlines ?? []).map((d) => `${d.date}: ${d.task}${d.consequence ? ` (if missed: ${d.consequence})` : ''}`));
  list('Who can help', (report.who_can_help ?? []).map((h) => `${h.name}${h.contact ? ` (${h.contact})` : ''}${h.note ? ` — ${h.note}` : ''}`));
  list('Checklist', (report.checklist ?? []).map((c) => `${c.text}${c.deadline ? ` [due ${c.deadline}]` : ''}`));
  list('Questions to ask', report.questions_to_ask);
  return lines.join('\n');
}

/**
 * Ask a follow-up question about an analyzed report.
 *
 * @param {string} question — the user's typed question (raw)
 * @param {object} report   — the re-hydrated canonical report being viewed
 * @returns {Promise<string>} — plain-text answer, re-hydrated on this device
 */
export async function runChat(question, report) {
  const context = buildContext(report);

  // One Guardian pass over context + question → consistent tokens, one map.
  const combined = `${context}\n${QUESTION_MARKER}\n${question}`;
  const { tokenized, mappingTable } = runGuardian(combined);

  const markerIdx = tokenized.indexOf(QUESTION_MARKER);
  const tokenizedContext = (markerIdx >= 0 ? tokenized.slice(0, markerIdx) : tokenized).trim();
  const tokenizedQuestion = (markerIdx >= 0 ? tokenized.slice(markerIdx + QUESTION_MARKER.length) : question).trim();

  const res = await fetch(getChatUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'chat', context: tokenizedContext, question: tokenizedQuestion }),
  });

  if (!res.ok) {
    let message = `Chat service error (${res.status})`;
    try { const body = await res.json(); if (body.error) message = body.error; } catch { /* ignore */ }
    throw new Error(message);
  }

  const data = await res.json();
  const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
  if (!answer) throw new Error('The chat service returned an empty answer.');

  // Restore real values on this device only.
  return rehydrate(answer, mappingTable);
}
