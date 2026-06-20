import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { rehydrateDeep } from '../agents/rehydrate';
import { runChat } from '../agents/chat';
import { PIPELINE_LABELS } from '../agents/pipelines/classifier';
import { downloadPdfReport, downloadTextReport } from '../lib/reportExport';
import { addDeadlineToGoogleCalendar } from '../lib/googleCalendar';

/**
 * CrisisActionRoom — renders the canonical Resilience Hub output schema.
 *
 * Design: Inter typeface, sharp editorial layout. Sections are separated by
 * hairlines (no rounded cards); accents use square swatches and left rules.
 *
 * Canonical schema (CLAUDE.md §10):
 *   pipeline_type, urgency, plain_language_summary,
 *   what_matters, what_happens_if_ignored, what_to_do_next,
 *   who_can_help, checklist, deadlines, questions_to_ask, disclaimer
 *
 * Props:
 *   analysis      {object}           — raw server response (may contain tokens)
 *   mappingTable  {Map<string,str>}  — Guardian's token→value map
 *   guardianStats {object}           — { total, types } for the privacy badge
 *   onReset       {function}         — return to UploadZone
 *   onDashboard   {function}         — return to dashboard
 */
export default function CrisisActionRoom({ analysis, mappingTable, guardianStats, onReset, onDashboard }) {
  // Re-hydrate all string values client-side before rendering.
  // Tokens never leave this device as real values.
  const d = rehydrateDeep(analysis, mappingTable);

  // Checklist state — persisted in localStorage
  const storageKey = useMemo(() => `rh_checklist_${d.pipeline_type}_${Date.now().toString(36).slice(-6)}`, [d.pipeline_type]);
  const [checked, setChecked] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]')); }
    catch { return new Set(); }
  });

  const toggle = useCallback((id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* quota */ }
      return next;
    });
  }, [storageKey]);

  const checklist = d.checklist ?? [];
  const doneCount = checklist.filter((i) => checked.has(i.id)).length;
  const [chatInput, setChatInput] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [calendarStatus, setCalendarStatus] = useState({});
  const shellRef = useRef(null);

  // Keep the docked chat panel offset in sync with the real nav height.
  useEffect(() => {
    const shell = shellRef.current;
    const nav = shell?.querySelector('.product-nav');
    if (!shell || !nav) return;
    const apply = () => shell.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(nav);
    window.addEventListener('resize', apply);
    return () => { ro.disconnect(); window.removeEventListener('resize', apply); };
  }, []);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ask me anything about this report.' },
  ]);

  const askQuestion = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || chatPending) return;
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setChatInput('');
    setChatPending(true);
    try {
      // Real AI answer via Featherless (server-side key). PII is tokenized in
      // chat.js before the question + report ever leave this device.
      const answer = await runChat(question, d);
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err) {
      console.warn('[chat] live answer failed, using local fallback:', err.message);
      setMessages((prev) => [...prev, { role: 'assistant', text: answerFromReport(question, d) }]);
    } finally {
      setChatPending(false);
    }
  }, [chatInput, chatPending, d]);

  const URGENCY = {
    critical: { color: '#f87171', label: 'Critical' },
    high:     { color: '#fb923c', label: 'High urgency' },
    medium:   { color: '#fbbf24', label: 'Medium urgency' },
    low:      { color: '#4ade80', label: 'Low urgency' },
  };
  const urgency = URGENCY[d.urgency] ?? URGENCY.medium;

  const handleAddDeadline = useCallback(async (deadline, index) => {
    setCalendarStatus((prev) => ({ ...prev, [index]: { state: 'adding', message: 'Adding...' } }));
    try {
      await addDeadlineToGoogleCalendar(deadline);
      setCalendarStatus((prev) => ({ ...prev, [index]: { state: 'added', message: 'Added to Google Calendar' } }));
    } catch (err) {
      setCalendarStatus((prev) => ({
        ...prev,
        [index]: { state: 'error', message: err.message || 'Could not add to Calendar' },
      }));
    }
  }, []);

  return (
    <div className={`product-shell report-shell ${chatOpen ? 'chat-open' : ''}`} style={{ minHeight: '100vh' }} ref={shellRef}>

      {/* ── Sticky nav ── */}
      <nav className="product-nav report-product-nav">
        <div className="nav-side nav-left">
          <button className="report-nav-btn accent" onClick={onDashboard || onReset}>Dashboard</button>
        </div>
        <div className="product-brand report-product-brand">
          <span className="brand-pulse" />
          <span>Beacon Atlas</span>
          {d.pipeline_type && (
            <span className="report-mono report-pipeline-chip">
              {PIPELINE_LABELS[d.pipeline_type] ?? d.pipeline_type}
            </span>
          )}
        </div>
        <div className="nav-side nav-right report-nav-actions">
          <button className="report-nav-btn" onClick={() => downloadTextReport(d)}>Download TXT</button>
          <button className="report-nav-btn" onClick={() => downloadPdfReport(d)}>Download PDF</button>
          <button
            className={`report-nav-btn ${chatOpen ? '' : 'accent'}`}
            onClick={() => setChatOpen((v) => !v)}
            aria-expanded={chatOpen}
          >
            {chatOpen ? 'Hide chat' : 'Chat'}
          </button>
        </div>
      </nav>

      <div className="report-body">

        {/* ── Lead: urgency + plain summary ── */}
        <header className="report-head" style={{ '--urgency': urgency.color }}>
          <span className="report-urgency">{urgency.label}</span>
          <p className="report-lead">{d.plain_language_summary}</p>
        </header>

        {/* ── What matters ── */}
        {(d.what_matters ?? []).length > 0 && (
          <section className="report-section">
            <span className="report-label">What matters</span>
            <ul className="report-list">
              {d.what_matters.map((item, i) => <li key={i}><span>{item}</span></li>)}
            </ul>
          </section>
        )}

        {/* ── What happens if ignored ── */}
        {(d.what_happens_if_ignored ?? []).length > 0 && (
          <section className="report-section">
            <span className="report-label danger">What happens if you ignore this</span>
            <ul className="report-risk">
              {d.what_happens_if_ignored.map((item, i) => <li key={i}><span>{item}</span></li>)}
            </ul>
          </section>
        )}

        {/* ── What to do next ── */}
        {(d.what_to_do_next ?? []).length > 0 && (
          <section className="report-section">
            <span className="report-label">What to do next</span>
            <ol className="report-steps">
              {d.what_to_do_next.map((item, i) => <li key={i}><span>{item}</span></li>)}
            </ol>
          </section>
        )}

        {/* ── Checklist ── */}
        {checklist.length > 0 && (
          <section className="report-section">
            <div className="report-checkhead">
              <span className="report-label" style={{ marginBottom: 0 }}>Checklist</span>
              <span className="report-count">{doneCount}/{checklist.length} done</span>
            </div>
            <div className="report-check">
              {checklist.map((item) => {
                const done = checked.has(item.id);
                return (
                  <div key={item.id} className={`report-check-row ${done ? 'done' : ''}`} onClick={() => toggle(item.id)}>
                    <span className="report-check-box">
                      {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 3L9 1" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span className="report-check-text">{item.text}</span>
                      {item.deadline && <span className="report-check-due">{item.deadline}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Deadlines ── */}
        {(d.deadlines ?? []).length > 0 && (
          <section className="report-section">
            <span className="report-label">Deadlines</span>
            <div className="report-rows">
              {d.deadlines.map((dl, i) => {
                const status = calendarStatus[i];
                const isAdded = status?.state === 'added';
                const isAdding = status?.state === 'adding';
                const consequence = cleanIfMissedPrefix(dl.consequence);
                return (
                  <div key={i} className="report-row">
                    <span className="report-date">{dl.date}</span>
                    <div>
                      <p className="report-task">{dl.task}</p>
                      {consequence && <p className="report-meta">If missed: {consequence}</p>}
                      {status?.message && (
                        <p
                          className="report-meta"
                          style={{
                            color: isAdded ? '#4ade80' : status.state === 'error' ? '#fca5a5' : undefined,
                            fontWeight: isAdded ? 700 : undefined,
                          }}
                        >
                          {status.message}
                        </p>
                      )}
                    </div>
                    <button
                      className={`report-nav-btn ${isAdded ? 'accent' : ''}`}
                      type="button"
                      onClick={() => handleAddDeadline(dl, i)}
                      disabled={isAdding || isAdded}
                      style={{
                        marginLeft: 'auto',
                        alignSelf: 'flex-start',
                        whiteSpace: 'nowrap',
                        opacity: isAdded ? 0.85 : undefined,
                        cursor: isAdded ? 'default' : undefined,
                      }}
                    >
                      {isAdding ? 'Adding...' : isAdded ? 'Added to Calendar' : 'Add to Calendar'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Who can help ── */}
        {(d.who_can_help ?? []).length > 0 && (
          <section className="report-section">
            <span className="report-label">Who can help</span>
            <div className="report-rows">
              {d.who_can_help.map((org, i) => (
                <div key={i} className="report-row" style={{ display: 'block' }}>
                  <p className="report-name">{org.name}</p>
                  {org.contact && <p className="report-contact">{org.contact}</p>}
                  {org.note && <p className="report-meta">{org.note}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Questions to ask ── */}
        {(d.questions_to_ask ?? []).length > 0 && (
          <section className="report-section">
            <span className="report-label">Questions to ask your lawyer or caseworker</span>
            <ul className="report-list">
              {d.questions_to_ask.map((item, i) => <li key={i}><span>{item}</span></li>)}
            </ul>
          </section>
        )}

        {/* ── Privacy trace: what happened to your data during this analysis ── */}
        <PrivacyTrace guardianStats={guardianStats} />

        {/* ── Disclaimer ── */}
        <p className="report-disclaimer">
          {d.disclaimer || 'This is an AI-generated summary for informational purposes only. It is not legal, medical, or immigration advice. Verify all deadlines and decisions with a qualified professional before acting.'}
        </p>

      </div>

      {/* ── Follow-up chat — docked sidebar ── */}
      <aside className={`report-chat-panel ${chatOpen ? 'open' : ''}`} aria-hidden={!chatOpen}>
        <div className="report-chat-panel-head">
          <span className="report-label" style={{ margin: 0 }}>Follow-up chat</span>
          <button className="report-chat-close" onClick={() => setChatOpen(false)} aria-label="Hide chat">×</button>
        </div>
        <div className="report-chat">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`report-bubble ${message.role}`}>
              {message.text}
            </div>
          ))}
          {chatPending && (
            <div className="report-bubble assistant report-typing">
              <span /><span /><span />
            </div>
          )}
        </div>
        <div className="report-chat-panel-foot">
          <div className="report-ask">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') askQuestion(); }}
              placeholder="Ask about urgency, deadlines, risks, next steps, or who can help…"
              disabled={chatPending}
            />
            <button onClick={askQuestion} disabled={chatPending}>{chatPending ? '…' : 'Ask'}</button>
          </div>
          <p className="report-chat-note report-mono">Answered by AI from your tokenized report — your real values never leave this device.</p>
        </div>
      </aside>
    </div>
  );
}

/**
 * PrivacyTrace — a small workflow that shows what happened to the user's data
 * during this analysis: PII is tokenized on the device, only tokens reach the
 * AI, the raw document is never stored, and real values are restored locally.
 */
function PrivacyTrace({ guardianStats }) {
  const total = guardianStats?.total;
  const types = guardianStats?.types ?? {};
  const typeSummary = Object.entries(types).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ');

  const steps = [
    {
      tag: 'On device',
      title: total != null ? `Tokenized ${total} identifier${total === 1 ? '' : 's'}` : 'Tokenized on device',
      sub: total
        ? `Real values${typeSummary ? ` (${typeSummary})` : ''} were swapped for [DATE_1]-style tokens in your browser.`
        : 'Personal identifiers were swapped for [DATE_1]-style tokens in your browser.',
    },
    { tag: 'Sent', title: 'Only tokens left', sub: 'The AI received the tokenized text — never your real names, dates, or amounts.' },
    { tag: 'Analyzed', title: 'Raw document not stored', sub: 'Your original file is never uploaded; only the tokenized text is processed.' },
    { tag: 'On device', title: 'Re-hydrated locally', sub: 'Tokens were turned back into your real values only here, for you.' },
  ];

  return (
    <section className="report-flow">
      <div className="report-flow-head">
        <span className="report-flow-lock" aria-hidden="true">
          <svg width="13" height="14" viewBox="0 0 13 14" fill="none"><path d="M3 6V4a3.5 3.5 0 117 0v2" stroke="currentColor" strokeWidth="1.4"/><rect x="1.5" y="6" width="10" height="7" rx="0" stroke="currentColor" strokeWidth="1.4"/></svg>
        </span>
        <span className="report-flow-title">Your real identifiers never reached the AI</span>
        <span className="report-flow-badge report-mono">PII tokenized</span>
      </div>
      <ol className="report-flow-steps">
        {steps.map((s, i) => (
          <li key={i} className="report-flow-step">
            <span className="report-flow-node report-mono">{String(i + 1).padStart(2, '0')}</span>
            <span className="report-flow-tag report-mono">{s.tag}</span>
            <span className="report-flow-step-title">{s.title}</span>
            <span className="report-flow-sub">{s.sub}</span>
          </li>
        ))}
      </ol>
      <p className="report-flow-foot report-mono">Only your structured plan is saved — privately to your account, visible to no one but you, and deletable anytime. The raw document is not kept. Verify the AI boundary in DevTools → Network: the request carries tokens, not your data.</p>
    </section>
  );
}

function answerFromReport(question, report) {
  const lower = question.toLowerCase();
  if (lower.includes('urgent') || lower.includes('first') || lower.includes('priority')) {
    const first = report.checklist?.[0]?.text || report.what_to_do_next?.[0] || report.what_matters?.[0];
    return first ? `Start here: ${first}` : 'The report did not find one clear first action. Review the checklist and deadlines.';
  }
  if (lower.includes('ignore') || lower.includes('happen') || lower.includes('risk') || lower.includes('consequence')) {
    return listAnswer(report.what_happens_if_ignored, 'The main risk is');
  }
  if (lower.includes('deadline') || lower.includes('date') || lower.includes('when')) {
    const deadlines = report.deadlines?.map((item) => `${item.date}: ${item.task}`).join(' | ');
    return deadlines || 'No explicit deadline was extracted. Check the original document before assuming there is no deadline.';
  }
  if (lower.includes('help') || lower.includes('call') || lower.includes('contact')) {
    const helpers = report.who_can_help?.map((item) => `${item.name}${item.contact ? ` (${item.contact})` : ''}`).join(' | ');
    return helpers || 'No specific helper was extracted. Consider a qualified professional or local support office.';
  }
  if (lower.includes('next') || lower.includes('do')) {
    return listAnswer(report.what_to_do_next, 'Next steps');
  }
  return report.plain_language_summary || 'I can answer from the generated report. Try asking about urgency, deadlines, risks, next steps, or who can help.';
}

function listAnswer(items = [], prefix) {
  if (!items.length) return `${prefix}: the report did not extract a clear item for this.`;
  return `${prefix}: ${items.slice(0, 3).join(' | ')}`;
}

function cleanIfMissedPrefix(value) {
  return String(value || '').replace(/^\s*if\s+missed\s*:\s*/i, '').trim();
}
