/**
 * server/dev.js — Local development server
 *
 * Holds the FEATHERLESS_API_KEY on the server side.
 * The React app calls this server at http://localhost:3001/api/analyze.
 * In production this is replaced by the Supabase Edge Function.
 *
 * NEVER deploy this file. It is dev-only.
 * The API key in .env is never sent to the browser.
 *
 * Usage:
 * node server/dev.js          (requires .env file with FEATHERLESS_API_KEY)
 * npm run dev:all              (runs this + Vite concurrently)
 */

import http from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Load .env manually (no external dependency) ────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env missing — rely on actual environment variables
}

const API_KEY = process.env.FEATHERLESS_API_KEY;
const FEATHERLESS_BASE_URL = process.env.FEATHERLESS_BASE_URL || 'https://api.featherless.ai/v1';
const FEATHERLESS_MODEL = process.env.FEATHERLESS_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
if (!API_KEY) {
  console.warn('[server/dev.js] FEATHERLESS_API_KEY is not set. Server will return demo-mode analyses.');
}

// Follow-up chat — answers questions from an already-analyzed report.
// The context it receives is tokenized (no real PII); tokens must be preserved.
const CHAT_SYSTEM_PROMPT = `You are a calm follow-up assistant inside Resilience Hub. The user already received a structured action plan for a stressful document. Answer their question using ONLY the report context provided.

The context is privacy-tokenized: real dates, amounts, names, and IDs appear as tokens like [DATE_1] or [AMOUNT_1]. Keep these tokens EXACTLY as they appear. Never invent or guess the real value behind a token.

If the answer is not in the context, say you do not see it in the report and suggest checking the original document or a qualified professional. Reply in 2-4 short sentences at a grade-6 reading level, second person ("you"). Plain text only — no JSON, no markdown.`;

// ─── Import pipeline modules ─────────────────────────────────────────────────
async function loadPipelines() {
  const { classifyDocument } = await import('../src/agents/pipelines/classifier.js');
  const { SYSTEM_PROMPT: immigrationPrompt, enrichResponse: immigrationEnrich } =
    await import('../src/agents/pipelines/immigration.js');
  const { SYSTEM_PROMPT: medicalPrompt, enrichResponse: medicalEnrich } =
    await import('../src/agents/pipelines/medical.js');
  const { SYSTEM_PROMPT: legalPrompt, enrichResponse: legalEnrich } =
    await import('../src/agents/pipelines/legal.js');
  const { SYSTEM_PROMPT: housingPrompt, enrichResponse: housingEnrich } =
    await import('../src/agents/pipelines/housing.js');
  const { SYSTEM_PROMPT: financialAidPrompt, enrichResponse: financialAidEnrich } =
    await import('../src/agents/pipelines/financial_aid.js');
  const { SYSTEM_PROMPT: schoolPrompt, enrichResponse: schoolEnrich } =
    await import('../src/agents/pipelines/school.js');
  const { SYSTEM_PROMPT: employmentPrompt, enrichResponse: employmentEnrich } =
    await import('../src/agents/pipelines/employment.js');

  const PIPELINE_PROMPTS = {
    immigration: immigrationPrompt,
    medical: medicalPrompt,
    legal: legalPrompt,
    housing: housingPrompt,
    financial_aid: financialAidPrompt,
    school: schoolPrompt,
    employment: employmentPrompt,
  };

  const PIPELINE_ENRICH = {
    immigration: immigrationEnrich,
    medical: medicalEnrich,
    legal: legalEnrich,
    housing: housingEnrich,
    financial_aid: financialAidEnrich,
    school: schoolEnrich,
    employment: employmentEnrich,
  };

  const FALLBACK_PROMPT = `
You are a document intelligence assistant inside Resilience Hub.
You may be acting as any Specialized Crisis Pipeline: immigration, medical, school, legal, financial_aid, housing, employment, or common.
Analyze the tokenized document and return ONE JSON object matching this exact shape:
{
  "pipeline_type": "string",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "",
  "what_matters": [],
  "what_happens_if_ignored": [],
  "what_to_do_next": [],
  "who_can_help": [{ "name": "", "contact": "", "note": "" }],
  "checklist": [{ "id": "c1", "text": "", "deadline": null }],
  "deadlines": [{ "date": "", "task": "", "consequence": "" }],
  "questions_to_ask": [],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal, medical, or financial advice."
}
No markdown fences. No prose outside the object. Grade-6 reading level, second person.
If pipeline_type is common, say no exact specialized pipeline matched but still extract what matters, risks, next steps, help, checklist, and deadlines.
Tokens like [DATE_1] must appear exactly as-is in the output.
`.trim();

  return { classifyDocument, PIPELINE_PROMPTS, PIPELINE_ENRICH, FALLBACK_PROMPT };
}

// ─── CORS headers ────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── Main handler ────────────────────────────────────────────────────────────
async function handleRequest(req, res, pipelines) {
  const { classifyDocument, PIPELINE_PROMPTS, PIPELINE_ENRICH, FALLBACK_PROMPT } = pipelines;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    return handleChat(req, res);
  }

  if (req.method !== 'POST' || req.url !== '/api/analyze') {
    res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let tokenizedText, requestedPipelineType;
  try {
    ({ tokenizedText, pipelineType: requestedPipelineType } = JSON.parse(body));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!tokenizedText || typeof tokenizedText !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'tokenizedText is required' }));
    return;
  }

  const residualPii = auditRawPii(tokenizedText);
  if (residualPii.length) {
    res.writeHead(422, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: `Guardian blocked this request because tokenized text still looks sensitive: ${residualPii.join(', ')}` }));
    return;
  }

  // ── Step 1: Classify ──────────────────────────────────────────────────────
  const { pipeline_type, confidence } = requestedPipelineType
    ? { pipeline_type: requestedPipelineType, confidence: 1 }
    : classifyDocument(tokenizedText);

  console.log(`[analyze] pipeline=${pipeline_type} confidence=${confidence}`);

  // ── Step 2: Pick system prompt ───────────────────────────────────────────
  const systemPrompt = PIPELINE_PROMPTS[pipeline_type] ?? FALLBACK_PROMPT;

  if (!API_KEY) {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify(demoAnalysis(tokenizedText, pipeline_type)));
    return;
  }

// ── Step 3: Call Featherless ──────────────────────────────────────────────
  let featherlessRes;
  try {
    // Safety check: If the tokenized text is wildly long, slice it down to save context
    // (Adjust the slice number if needed, 8000 characters is roughly ~1800 tokens)
    const truncatedText = tokenizedText.length > 8000 
      ? tokenizedText.slice(0, 8000) + "\n[Truncated due to context limits]"
      : tokenizedText;

    featherlessRes = await fetch(`${FEATHERLESS_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: FEATHERLESS_MODEL,
        temperature: 0.1,
        max_tokens: 2200,
        response_format: { type: 'json_object' },
        messages: [
          { 
            role: 'system', 
            content: systemPrompt.trim() 
          },
          { 
            role: 'user', 
            content: `Selected pipeline_type: ${pipeline_type}\nReturn that exact pipeline_type unless the document is clearly a different supported pipeline.\n\nAnalyze this tokenized document:\n\n${truncatedText.trim()}` 
          },
        ],
      }),
    });
  } catch (err) {
    console.error('[analyze] Featherless fetch failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Failed to reach AI service. Check your network.' }));
    return;
  }

  if (!featherlessRes.ok) {
    const errBody = await featherlessRes.text().catch(() => '');
    console.error(`[analyze] Featherless error ${featherlessRes.status}:`, errBody.slice(0, 200));
    res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: `AI service error: ${featherlessRes.status}` }));
    return;
  }

  // ── Step 4: Parse response ────────────────────────────────────────────────
  const data = await featherlessRes.json();
  const rawText = data.choices?.[0]?.message?.content ?? '';
  
  const parsed = parseModelJson(rawText, pipeline_type, tokenizedText);
  parsed.pipeline_type = normalizePipelineType(parsed.pipeline_type, pipeline_type);

  // ── Step 5: Enrich ────────────────────────────────────────────────────────
  const enrich = PIPELINE_ENRICH[pipeline_type];
  const final = normalizeAnalysis(enrich ? enrich(parsed) : parsed, pipeline_type, tokenizedText);

  res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify(final));
}

// ─── Follow-up chat handler ──────────────────────────────────────────────────
async function handleChat(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let question, context;
  try {
    ({ question, context } = JSON.parse(body));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!question || typeof question !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'question is required' }));
    return;
  }

  // The Guardian runs on the device before this; context/question must be tokenized.
  const residualPii = auditRawPii(`${context ?? ''}\n${question}`);
  if (residualPii.length) {
    res.writeHead(422, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: `Guardian blocked this chat because the text still looks sensitive: ${residualPii.join(', ')}` }));
    return;
  }

  if (!API_KEY) {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ answer: 'Demo mode: no AI key is set, so I can\'t generate a live answer. Check the deadlines and the "what to do next" steps in your report above.' }));
    return;
  }

  let featherlessRes;
  try {
    featherlessRes = await fetch(`${FEATHERLESS_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: FEATHERLESS_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: CHAT_SYSTEM_PROMPT },
          { role: 'user', content: `Report context:\n${(context ?? '').slice(0, 8000)}\n\nUser question: ${question}` },
        ],
      }),
    });
  } catch (err) {
    console.error('[chat] Featherless fetch failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Failed to reach AI service. Check your network.' }));
    return;
  }

  if (!featherlessRes.ok) {
    const errBody = await featherlessRes.text().catch(() => '');
    console.error(`[chat] Featherless error ${featherlessRes.status}:`, errBody.slice(0, 200));
    res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: `AI service error: ${featherlessRes.status}` }));
    return;
  }

  const data = await featherlessRes.json();
  const answer = (data.choices?.[0]?.message?.content ?? '').trim();
  console.log('[chat] answered follow-up question');

  res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify({ answer: answer || 'I could not find an answer in your report. Check the original document or a qualified professional.' }));
}

function parseModelJson(rawText, pipelineType, tokenizedText) {
  const fence = '```';
  const clean = String(rawText || '')
    .replace(new RegExp('^' + fence + '(?:json)?\\s*', 'm'), '')
    .replace(new RegExp('\\s*' + fence + '\\s*$', 'm'), '')
    .trim();
  const candidates = [clean, extractJsonObject(clean)].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  console.error('[analyze] JSON parse failed. Falling back to demo report. Raw:', String(rawText || '').slice(0, 300));
  return {
    ...demoAnalysis(tokenizedText, pipelineType),
    plain_language_summary: 'The AI model returned malformed text, so ResilienceHub generated a safe fallback report from the detected pipeline and tokens. Try a stronger JSON-following model later for better detail.',
  };
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return text.slice(start, end + 1);
}

function normalizePipelineType(value, fallback) {
  const valid = new Set(['immigration', 'medical', 'school', 'legal', 'financial_aid', 'housing', 'employment', 'common']);
  return valid.has(value) ? value : (valid.has(fallback) ? fallback : 'common');
}

function normalizeAnalysis(value, pipelineType, tokenizedText) {
  const fallback = demoAnalysis(tokenizedText, pipelineType);
  const normalized = {
    ...fallback,
    ...value,
    pipeline_type: normalizePipelineType(value?.pipeline_type, pipelineType),
    urgency: ['low', 'medium', 'high', 'critical'].includes(value?.urgency) ? value.urgency : fallback.urgency,
  };
  for (const key of ['what_matters', 'what_happens_if_ignored', 'what_to_do_next', 'who_can_help', 'checklist', 'deadlines', 'questions_to_ask']) {
    if (!Array.isArray(normalized[key])) normalized[key] = fallback[key];
  }
  if (typeof normalized.plain_language_summary !== 'string' || !normalized.plain_language_summary.trim()) {
    normalized.plain_language_summary = fallback.plain_language_summary;
  }
  if (typeof normalized.disclaimer !== 'string' || !normalized.disclaimer.trim()) {
    normalized.disclaimer = fallback.disclaimer;
  }
  return normalized;
}

function auditRawPii(text) {
  const checks = [
    ['SSN', /\b\d{3}-\d{2}-\d{4}\b/],
    ['SIN', /\b\d{3}[- ]\d{3}[- ]\d{3}\b/],
    ['AMOUNT', /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/],
    ['PHONE', /\b(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/],
    ['POSTAL', /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i],
  ];
  return checks.filter(([, regex]) => regex.test(text)).map(([name]) => name);
}

function demoAnalysis(tokenizedText, pipelineType) {
  const dates = [...tokenizedText.matchAll(/\[DATE_\d+\]/g)].map((match) => match[0]);
  const firstDate = dates[0] || null;
  const amount = tokenizedText.match(/\[AMOUNT_\d+\]/)?.[0] || 'any listed payment';
  const label = pipelineType === 'common' ? 'common reader' : pipelineType.replace('_', ' ');

  return {
    pipeline_type: pipelineType || 'common',
    urgency: firstDate ? 'high' : 'medium',
    plain_language_summary: `This demo analysis used the ${label} pipeline. The document appears to contain a crisis-related notice. Focus on the deadline, the consequence, and the next call or form you need to complete.`,
    what_matters: [
      firstDate ? `A deadline appears in the document: ${firstDate}.` : 'No clear deadline was detected, so verify the original document carefully.',
      `The document may mention ${amount}; keep proof of payments, fees, or benefit amounts.`,
    ],
    what_happens_if_ignored: [
      'You could miss a deadline, lose eligibility, delay care, or weaken your position depending on the document type.',
      'If the notice requires a response, silence may be treated as acceptance or non-compliance.',
    ],
    what_to_do_next: [
      firstDate ? `Put ${firstDate} on your calendar and set two reminders.` : 'Read the original document once more and find any hidden response window.',
      'Call the most relevant office or support organization and ask what they need from you next.',
      'Save a copy of the document, every message you send, and every confirmation number.',
    ],
    who_can_help: [
      { name: 'Local legal aid or community support office', contact: 'Search your city + legal aid / social services', note: 'Use this for rights, deadlines, or official notices.' },
      { name: 'The office that sent the notice', contact: 'Use the contact on the document', note: 'Ask them to confirm deadlines and required documents in writing.' },
    ],
    checklist: [
      { id: 'c1', text: 'Confirm the most urgent deadline.', deadline: firstDate },
      { id: 'c2', text: 'Gather every required document and proof item.', deadline: firstDate },
      { id: 'c3', text: 'Contact the right helper and write down the next step.', deadline: null },
    ],
    deadlines: dates.map((date, index) => ({
      date,
      task: index === 0 ? 'Most urgent date found in the notice' : `Additional date ${index + 1}`,
      consequence: 'Missing this date may create a serious delay or loss of options.',
    })),
    questions_to_ask: [
      'What is the first thing I must do?',
      'What happens if I miss this deadline?',
      'Can you confirm this deadline and next step in writing?',
    ],
    disclaimer: 'This is an AI-generated summary for informational purposes only. It is not legal, medical, immigration, financial, or education advice. Verify all deadlines and decisions with a qualified professional before acting.',
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.DEV_SERVER_PORT || 3001;

loadPipelines().then((pipelines) => {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, pipelines).catch((err) => {
      console.error('[analyze] Unhandled error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  server.listen(PORT, () => {
    console.log(`\n[Resilience Hub dev server] listening on http://localhost:${PORT}`);
    console.log('[Resilience Hub dev server] API key: set ✓');
    console.log('[Resilience Hub dev server] Route: POST /api/analyze\n');
  });
});
