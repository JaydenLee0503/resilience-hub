import React, { useState, useCallback, useMemo } from 'react';
import { rehydrateDeep } from '../agents/rehydrate';
import { PIPELINE_LABELS } from '../agents/pipelines/classifier';
import { downloadPdfReport, downloadTextReport } from '../lib/reportExport';

/**
 * CrisisActionRoom — renders the canonical Resilience Hub output schema.
 *
 * Canonical schema (CLAUDE.md §10):
 *   pipeline_type, urgency, plain_language_summary,
 *   what_matters, what_happens_if_ignored, what_to_do_next,
 *   who_can_help, checklist, deadlines, questions_to_ask, disclaimer
 *
 * Props:
 *   analysis     {object}           — raw server response (may contain tokens)
 *   mappingTable {Map<string,str>}  — Guardian's token→value map
 *   guardianStats {object}          — { total, types } for the privacy badge
 *   onReset      {function}         — return to UploadZone
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
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ask me what matters, what happens if you ignore it, what to do next, who can help, or which deadline is most urgent.' },
  ]);

  const askQuestion = useCallback(() => {
    const question = chatInput.trim();
    if (!question) return;
    setMessages((prev) => [...prev, { role: 'user', text: question }, { role: 'assistant', text: answerFromReport(question, d) }]);
    setChatInput('');
  }, [chatInput, d]);

  // ─── Design tokens ──────────────────────────────────────────────────────
  const URGENCY_STYLES = {
    critical: { border: 'rgba(239,68,68,.3)',  bg: 'rgba(239,68,68,.07)',  dot: '#f87171', label: 'Critical' },
    high:     { border: 'rgba(251,146,60,.25)', bg: 'rgba(251,146,60,.06)', dot: '#fb923c', label: 'High urgency' },
    medium:   { border: 'rgba(250,204,21,.2)',  bg: 'rgba(250,204,21,.05)', dot: '#fbbf24', label: 'Medium urgency' },
    low:      { border: 'rgba(74,222,128,.2)',  bg: 'rgba(74,222,128,.05)', dot: '#4ade80', label: 'Low urgency' },
  };
  const urgencyStyle = URGENCY_STYLES[d.urgency] ?? URGENCY_STYLES.medium;

  const BLUE  = 'rgba(91,140,255,';
  const PURP  = 'rgba(160,107,255,';
  const ARCHIVO = "'Archivo','D-DIN Bold',system-ui,sans-serif";
  const PANEL = { background:'rgba(255,255,255,.035)', border:'1px solid rgba(255,255,255,.09)', borderRadius:22, padding:'22px 26px', boxShadow:'0 24px 70px rgba(0,0,0,.22)' };
  const LABEL = { fontSize:12, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'.16em', textTransform:'uppercase', color:'#5b8cff', marginBottom:10, display:'block' };
  const MUTED = { fontSize:14, color:'#98a2bb', lineHeight:1.65, margin:0 };

  // ─── Section: string array list ─────────────────────────────────────────
  const StringList = ({ items }) => (
    <ul style={{ margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:10 }}>
      {(items ?? []).map((item, i) => (
        <li key={i} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:`${BLUE}0.6)`, flexShrink:0, marginTop:7 }} />
          <span style={{ fontSize:15, lineHeight:1.65, color:'#d8dff0' }}>{item}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="product-shell" style={{ minHeight:'100vh', color:'#eef1f7' }}>

      {/* ── Sticky Nav (matches landing / product nav) ── */}
      <nav className="product-nav">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span className="brand-pulse" />
          <span style={{ fontFamily:ARCHIVO, fontWeight:900, textTransform:'uppercase', letterSpacing:'.04em', fontSize:16 }}>ResilienceHub</span>
          {d.pipeline_type && (
            <span style={{ fontSize:12, padding:'3px 10px', borderRadius:999, background:`${BLUE}0.1)`, border:`1px solid ${BLUE}0.2)`, color:'#5b8cff', marginLeft:4 }}>
              {PIPELINE_LABELS[d.pipeline_type] ?? d.pipeline_type}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          <button onClick={() => downloadTextReport(d)} style={NAV_BUTTON}>Download TXT</button>
          <button onClick={() => downloadPdfReport(d)} style={NAV_BUTTON}>Download PDF</button>
          <button onClick={onDashboard || onReset} style={NAV_BUTTON}>Dashboard</button>
        </div>
      </nav>

      <div style={{ maxWidth:800, margin:'0 auto', padding:'36px 22px 80px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* ── Urgency banner ── */}
        <div style={{ ...PANEL, background:urgencyStyle.bg, border:`1px solid ${urgencyStyle.border}`, display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ width:10, height:10, borderRadius:'50%', background:urgencyStyle.dot, boxShadow:`0 0 10px ${urgencyStyle.dot}`, flexShrink:0 }} />
          <div>
            <span style={{ fontSize:11, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'.15em', textTransform:'uppercase', color:urgencyStyle.dot }}>{urgencyStyle.label}</span>
            <p style={{ margin:'4px 0 0', fontSize:15, lineHeight:1.6, color:'#eef1f7', fontWeight:500 }}>{d.plain_language_summary}</p>
          </div>
        </div>

        {/* ── Privacy badge ── */}
        {guardianStats?.total > 0 && (
          <div style={{ ...PANEL, background:`${BLUE}0.05)`, border:`1px solid ${BLUE}0.15)`, display:'flex', gap:14, alignItems:'flex-start' }}>
            <span style={{ fontSize:18, flexShrink:0 }}>🔒</span>
            <div>
              <span style={LABEL}>Privacy</span>
              <p style={{ ...MUTED, color:'#98a2bb' }}>
                <strong style={{ color:'#eef1f7' }}>{guardianStats.total} identifier{guardianStats.total > 1 ? 's' : ''}</strong>{' '}
                ({Object.entries(guardianStats.types ?? {}).map(([k,n]) => `${n} ${k}`).join(', ')}) were replaced with tokens before leaving your device.{' '}
                <span style={{ color:'#5a637c' }}>Open DevTools → Network to verify.</span>
              </p>
            </div>
          </div>
        )}

        {/* ── What matters ── */}
        {(d.what_matters ?? []).length > 0 && (
          <div style={PANEL}>
            <span style={LABEL}>What matters</span>
            <StringList items={d.what_matters} />
          </div>
        )}

        {/* ── What happens if ignored ── */}
        {(d.what_happens_if_ignored ?? []).length > 0 && (
          <div style={{ ...PANEL, background:'rgba(239,68,68,.04)', border:'1px solid rgba(239,68,68,.12)' }}>
            <span style={{ ...LABEL, color:'#f87171' }}>What happens if you ignore this</span>
            <ul style={{ margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:10 }}>
              {d.what_happens_if_ignored.map((item, i) => (
                <li key={i} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                  <span style={{ color:'#f87171', fontSize:16, lineHeight:1.4, flexShrink:0 }}>⚠</span>
                  <span style={{ fontSize:15, lineHeight:1.65, color:'#fca5a5' }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── What to do next ── */}
        {(d.what_to_do_next ?? []).length > 0 && (
          <div style={PANEL}>
            <span style={LABEL}>What to do next</span>
            <ol style={{ margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:12, counterReset:'steps' }}>
              {d.what_to_do_next.map((item, i) => (
                <li key={i} style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                  <span style={{ width:24, height:24, borderRadius:8, background:`${BLUE}0.12)`, border:`1px solid ${BLUE}0.22)`, color:'#5b8cff', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:"'IBM Plex Mono',monospace" }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize:15, lineHeight:1.65, color:'#d8dff0', paddingTop:2 }}>{item}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Checklist ── */}
        {checklist.length > 0 && (
          <div style={{ ...PANEL, padding:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 26px 16px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <span style={{ ...LABEL, marginBottom:0 }}>Checklist</span>
              <span style={{ fontSize:13, color:'#5a637c' }}>{doneCount}/{checklist.length} done</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column' }}>
              {checklist.map((item) => {
                const done = checked.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    style={{ display:'flex', gap:14, padding:'14px 26px', cursor:'pointer', borderLeft:`3px solid ${done ? '#4ade80' : BLUE+'0.4)'}`, background: done ? 'rgba(74,222,128,.025)' : 'transparent', transition:'background .15s' }}
                    onMouseEnter={(e) => !done && (e.currentTarget.style.background='rgba(255,255,255,.02)')}
                    onMouseLeave={(e) => e.currentTarget.style.background = done ? 'rgba(74,222,128,.025)' : 'transparent'}
                  >
                    <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${done ? '#4ade80' : BLUE+'0.5)'}`, background: done ? 'rgba(74,222,128,.15)' : 'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                      {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 3L9 1" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div style={{ flex:1, opacity: done ? 0.45 : 1 }}>
                      <span style={{ fontSize:14, lineHeight:1.6, textDecoration: done ? 'line-through' : 'none', color:'#d8dff0' }}>{item.text}</span>
                      {item.deadline && (
                        <span style={{ marginLeft:10, fontSize:12, padding:'2px 8px', borderRadius:999, background:'rgba(251,146,60,.08)', border:'1px solid rgba(251,146,60,.2)', color:'#fb923c', fontFamily:"'IBM Plex Mono',monospace" }}>
                          {item.deadline}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Deadlines ── */}
        {(d.deadlines ?? []).length > 0 && (
          <div style={PANEL}>
            <span style={LABEL}>Deadlines</span>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {d.deadlines.map((dl, i) => (
                <div key={i} style={{ display:'flex', gap:14, padding:'14px 16px', borderRadius:12, background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.06)' }}>
                  <div style={{ minWidth:90, fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:'#fb923c', fontWeight:600, paddingTop:2 }}>{dl.date}</div>
                  <div>
                    <p style={{ margin:'0 0 4px', fontSize:14, color:'#d8dff0', fontWeight:500 }}>{dl.task}</p>
                    {dl.consequence && <p style={{ margin:0, fontSize:13, color:'#5a637c' }}>If missed: {dl.consequence}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Who can help ── */}
        {(d.who_can_help ?? []).length > 0 && (
          <div style={PANEL}>
            <span style={LABEL}>Who can help</span>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {d.who_can_help.map((org, i) => (
                <div key={i} style={{ padding:'14px 16px', borderRadius:12, background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.06)' }}>
                  <p style={{ margin:'0 0 4px', fontSize:14, fontWeight:600, color:'#eef1f7' }}>{org.name}</p>
                  {org.contact && <p style={{ margin:'0 0 4px', fontSize:13, color:'#5b8cff', fontFamily:"'IBM Plex Mono',monospace" }}>{org.contact}</p>}
                  {org.note && <p style={{ margin:0, fontSize:13, color:'#98a2bb' }}>{org.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Questions to ask ── */}
        {(d.questions_to_ask ?? []).length > 0 && (
          <div style={PANEL}>
            <span style={LABEL}>Questions to ask your lawyer or caseworker</span>
            <StringList items={d.questions_to_ask} />
          </div>
        )}

        <div style={PANEL}>
          <span style={LABEL}>Follow-up chat</span>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth:'82%',
                  padding:'12px 14px',
                  borderRadius:14,
                  background: message.role === 'user' ? `${BLUE}0.18)` : 'rgba(255,255,255,.045)',
                  border: message.role === 'user' ? `1px solid ${BLUE}0.26)` : '1px solid rgba(255,255,255,.08)',
                  color:'#d8dff0',
                  fontSize:14,
                  lineHeight:1.55,
                }}
              >
                {message.text}
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') askQuestion(); }}
              placeholder="Ask about urgency, deadlines, risks, next steps, or who can help..."
              style={{
                minWidth:0,
                border:'1px solid rgba(255,255,255,.09)',
                borderRadius:999,
                padding:'12px 16px',
                background:'rgba(255,255,255,.035)',
                color:'#eef1f7',
                fontFamily:'inherit',
              }}
            />
            <button onClick={askQuestion} style={{ ...NAV_BUTTON, background:`linear-gradient(135deg,${BLUE}1),${PURP}1))`, color:'#fff' }}>Ask</button>
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <p style={{ fontSize:12, color:'#3a4255', lineHeight:1.65, textAlign:'center', maxWidth:600, margin:'8px auto 0' }}>
          {d.disclaimer || 'This is an AI-generated summary for informational purposes only. It is not legal, medical, or immigration advice. Verify all deadlines and decisions with a qualified professional before acting.'}
        </p>

      </div>
    </div>
  );
}

const NAV_BUTTON = {
  background:'rgba(255,255,255,.05)',
  border:'1px solid rgba(255,255,255,.1)',
  borderRadius:999,
  padding:'8px 16px',
  color:'#eef1f7',
  fontSize:13,
  fontWeight:500,
  cursor:'pointer',
  fontFamily:'inherit',
};

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
