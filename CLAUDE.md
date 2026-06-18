# CLAUDE.md — Beacon Atlas

Guidance for Claude Code (and humans) working in this repository. Read this before making changes.

> Naming note: the product is now called **Beacon Atlas** (renamed from "Resilience Hub", which
> remains the git repo / folder name and an internal codename). Use **Beacon Atlas** in all
> user-facing product copy. See §12.

---

## 1. Project Overview

Beacon Atlas is a secure, privacy-first AI platform that turns life-critical documents and
urgent emails into calm, structured action plans. A user uploads a document (or, later, connects
Gmail); the AI reads it and returns a clear plan: what matters, what happens if it is ignored,
what to do next, who can help, and a checklist.

The headline feature is **Specialized Crisis Pipelines** — domain-specific analyzers for
immigration, medical, school, legal, financial-aid, housing, and employment paperwork.

> Terminology rule: we call them **Specialized Crisis Pipelines** or **Navigators** — never
> "bots", never "chatbots" (the optional follow-up Q&A feature is the only thing that may be
> called a chat assistant).

**Current state (Phase 0):** a React + Vite + Tailwind single-page app. A client-side `Guardian`
tokenizes PII out of the text, a `Simplifier` calls an LLM, and a `CrisisActionRoom` renders the
result. There is **no backend, database, auth, or storage yet**. See §7 for where we are going.

---

## 2. Product Mission

Make a person in a stressful moment feel: **"I finally understand what this means and what I
should do next."** Replace dread and confusion with clarity, sequence, and a sense of control.
Every design and engineering decision should reduce the user's anxiety and protect their privacy.

---

## 3. Core Features

- **Specialized Crisis Pipelines** (primary) — upload a document → AI analyzes → structured plan.
- **Privacy boundary in code** — sensitive identifiers are tokenized before any data leaves the
  device/server boundary; real values are re-hydrated only for the user.
- **Structured action plan** — always the same five-part shape: what matters / what happens if
  ignored / what to do next / who can help / checklist (plus deadlines, see §10).

### Optional / later features (do not build during MVP)
- **Gmail Reader** — connect Gmail, analyze crisis emails.
- **Browser / Chrome extension** — read the current document or webpage and surface the plan.
- **Follow-up chat assistant** — ask questions about an analyzed document or email.

---

## 4. Specialized Crisis Pipelines

Each pipeline shares the same output schema (§10) but has tuned prompts and extraction priorities.

| `pipeline_type`  | Name                          | Focus |
|------------------|-------------------------------|-------|
| `immigration`    | Bureaucracy Navigator         | Asylum/visa/refugee paperwork, deadlines, appointments, biometrics, required documents, a bureaucracy timeline. Multilingual. |
| `medical`        | Medical Navigator             | Discharge papers, prescriptions, insurance forms; medication schedules, warning signs, follow-ups, urgent symptoms. |
| `school`         | Student Support Navigator     | Scholarships, disciplinary letters, accommodations, enrollment, exam/financial-aid docs; deadlines, required signatures. |
| `legal`          | LegalAid Navigator            | Eviction notices, contracts, court letters, disputes; obligations, deadlines, missing signatures, consequences. |
| `financial_aid`  | Benefits & Aid Navigator      | Grants, aid, insurance claims, government support; eligibility, missing paperwork, deadlines, payment schedules. |
| `housing`        | Housing Stability Navigator   | Leases, eviction warnings, rent assistance, landlord communications; urgent risks, tenant rights, who to contact. |
| `employment`     | Workplace Rights Navigator    | Contracts, termination notices, HR policies; legal terms, deadlines, required responses, employee rights. |

A **classifier step** chooses the `pipeline_type` (or asks the user) before running the tuned
pipeline. Always include a disclaimer (this is not legal/medical/immigration advice).

---

## 5. MVP Scope (build this first)

1. **Auth** — email/password (or magic link) sign-in; every document is owned by one user.
2. **Secure document upload** — file goes to private storage; text extracted server-side.
3. **One end-to-end pipeline** — start with **Immigration** (highest-impact, clearest deadlines).
   Tokenize → server-side LLM call → structured JSON (§10) → re-hydrate → render.
4. **Crisis Action Room UI** — render the five sections + checklist + deadlines (already exists in
   `CrisisActionRoom.jsx`; wire it to real data).
5. **Data controls** — list my documents, view a saved plan, and **delete a document + its plan**.
6. **Server-side AI calls only** — the Anthropic key lives in the backend/Edge Function, never in
   the browser. This is a correctness requirement, not a nice-to-have.

---

## 6. Out of Scope (for now)

- Gmail integration / OAuth.
- Chrome / browser extension.
- Follow-up chat assistant.
- All 7 pipelines at once — ship 1, then template the rest.
- Multilingual translation (design the schema for it; implement later).
- Team/organization accounts, sharing, admin dashboards.
- Payments / billing.

---

## 7. Recommended Stack

**Primary recommendation: React + Vite (current shell) + Supabase + a server-side AI function.**

| Concern              | Choice |
|----------------------|--------|
| Frontend             | Keep **React 18 + Vite + Tailwind** (already working; don't migrate mid-build). |
| Auth                 | **Supabase Auth** (email/magic link). |
| Database             | **Supabase Postgres** with **Row Level Security (RLS)** — each row scoped to its owner. |
| File storage         | **Supabase Storage**, private buckets, signed URLs only. |
| Server-side AI calls | **Supabase Edge Function** (or a thin Node/Express service) holding the Anthropic key. |
| Hosting              | Vercel / Netlify (frontend) + Supabase (backend). |

**Why not MERN here:** see §4 of the response and the security note in §9. Short version: MongoDB is
fine, but a raw MERN setup makes *you* hand-build auth, file upload, access control, and signed
storage — which are exactly the slow, security-critical parts. Supabase ships those primitives
(Auth + RLS + private Storage) out of the box, which is what a privacy-first MVP needs most.

**If the team prefers a unified full-stack framework**, migrate the shell to **Next.js + Supabase**:
API routes keep the AI key server-side natively, and middleware auth makes Gmail OAuth + chat
cleaner later. Only do this if you accept the migration cost of the current Vite SPA.

---

## 8. Folder Structure Guidance

Target structure as the backend is added (keep `src/agents` as the privacy/AI core):

```
resilience-hub/
├─ src/
│  ├─ agents/              # Privacy + AI core (the "pipeline brain")
│  │  ├─ guardian.js       # PII tokenizer (runs before any LLM call)
│  │  ├─ rehydrate.js      # Token → real value, client-side only
│  │  ├─ simplifier.js     # LLM call wrapper — MUST call our backend, not Anthropic directly
│  │  └─ pipelines/        # One module per pipeline (prompt + schema tuning)
│  │     ├─ immigration.js
│  │     ├─ medical.js
│  │     └─ ...            # school, legal, financial_aid, housing, employment
│  ├─ components/          # React UI (PascalCase files)
│  │  ├─ UploadZone.jsx
│  │  └─ CrisisActionRoom.jsx
│  ├─ lib/                 # supabaseClient.js, fetch helpers, types/schema
│  ├─ App.jsx
│  └─ main.jsx
├─ server/ (or supabase/functions/)  # Server-side AI calls; holds ANTHROPIC_API_KEY
├─ supabase/               # migrations, RLS policies (if using Supabase CLI)
├─ legacy/                 # Beacon Atlas landing template (do not edit casually)
├─ public/
└─ CLAUDE.md
```

Rule: **the LLM prompt and the output schema live in `src/agents`** — UI components only render
the structured result; they never build prompts.

---

## 9. Security Rules (non-negotiable)

This product handles immigration status, medical records, financial hardship, and legal exposure.
Treat every document as highly sensitive.

1. **API keys never reach the browser.** The Anthropic key lives only in the server/Edge Function.
   (The current `src/agents/simplifier.js` calls Anthropic directly from the client — this MUST be
   moved server-side before any real data is handled.)
2. **Tokenize PII before the LLM sees it.** `Guardian` runs first; re-hydration happens only for the
   authenticated owner, client-side where possible.
3. **Private storage only.** No public buckets. Access via short-lived signed URLs scoped to the owner.
4. **Row Level Security on every table.** A user can read/write only their own rows.
5. **Secrets in environment variables.** Never commit `.env`. Server secrets are server-only;
   only `VITE_`-prefixed, non-secret values may reach the client.
6. **Real deletion.** "Delete" removes the document, extracted text, and stored plan — not just a flag.
7. **Minimize retention.** Don't store raw documents longer than needed; prefer storing the
   structured plan over the raw file when feasible.
8. **Always disclaim.** Output is informational, not legal/medical/immigration advice.

---

## 10. AI Output Format (canonical schema)

Every pipeline returns **exactly one JSON object** in this shape. No markdown fences, no prose
outside the object. Empty arrays are allowed; do not omit keys.

```json
{
  "pipeline_type": "immigration | medical | school | legal | financial_aid | housing | employment",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "",
  "what_matters": [],
  "what_happens_if_ignored": [],
  "what_to_do_next": [],
  "who_can_help": [],
  "checklist": [],
  "deadlines": [],
  "questions_to_ask": [],
  "disclaimer": ""
}
```

- Use **grade-6 reading level**, second person ("you"), short active sentences.
- Inside the model's output, dates/amounts/IDs appear as **tokens** (e.g. `[DATE_1]`); they are
  re-hydrated to real values on the device before display.
- `urgency` drives UI emphasis (`critical` = top, red).
- `checklist` items should be concrete, completable tasks.

---

## 11. Development Rules

- **Don't overbuild.** Ship the MVP in §5 before touching anything in §6.
- **One pipeline first** (Immigration), then template the others from it.
- **Prompts + schema live in `src/agents`**; UI never constructs prompts.
- **Server-side AI only** — never reintroduce a browser-side API key.
- **Match existing style** — the codebase uses inline-styled React components and clear JSDoc
  headers; follow that. Tailwind is available for layout.
- **Validate LLM output** against the §10 schema before rendering; fail gracefully.
- **Commit only when asked.** Branch off `main`; don't commit secrets.
- **Run `npm run build`** to sanity-check before declaring a change done.

---

## 12. Naming Conventions

- The feature is **Specialized Crisis Pipelines / Navigators** — never "bots".
- The follow-up Q&A feature (later) is the **chat assistant**, not a "chatbot".
- `pipeline_type` enum values (machine): `immigration`, `medical`, `school`, `legal`,
  `financial_aid`, `housing`, `employment`. Use these exact strings everywhere.
- React components: `PascalCase` files (`CrisisActionRoom.jsx`).
- Agent / pipeline modules: `camelCase` files (`immigration.js`, `guardian.js`).
- DB tables: `snake_case`, plural (`documents`, `analyses`).
- Env vars: `SCREAMING_SNAKE_CASE`; client-exposed ones must be `VITE_`-prefixed and non-secret.
- The product name is **Beacon Atlas** (renamed from "Resilience Hub"). Use **Beacon Atlas** in all
  user-facing product copy. "Resilience Hub" survives only as the git repo / folder name, an internal
  codename, and in code comments / AI system prompts — never show it in the UI.

---

## 13. Next Implementation Checklist

1. [ ] Create a Supabase project; add `documents` and `analyses` tables with RLS policies.
2. [ ] Add Supabase Auth (email/magic link) and a minimal sign-in screen.
3. [ ] **Move the Anthropic call server-side** (Supabase Edge Function holding `ANTHROPIC_API_KEY`);
       point `src/agents/simplifier.js` at that function instead of `api.anthropic.com`.
4. [ ] Wire `UploadZone` → private Supabase Storage bucket (signed URLs only).
5. [ ] Extract text server-side, run `Guardian`, call the Immigration pipeline, store the §10 JSON.
6. [ ] Re-hydrate on device and render in `CrisisActionRoom`.
7. [ ] Add "my documents" list + **delete document & plan**.
8. [ ] Validate output against the schema; handle errors gracefully.
9. [ ] Then template pipelines #2–#7 from the Immigration module.
```
