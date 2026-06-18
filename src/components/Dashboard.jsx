import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PIPELINES, PIPELINE_LABELS } from '../data/pipelines';
import { ProductNav } from './AuthGate';
import { listReports, deleteReport } from '../lib/reports';

const gmailSamples = [
  { id: 'g1', from: 'USCIS Updates', subject: 'Biometrics appointment reminder', body: 'USCIS reminder: Your biometrics appointment is scheduled for August 12, 2026. Bring your appointment notice and photo identification. Missing the appointment may delay your case.' },
  { id: 'g2', from: 'Financial Aid Office', subject: 'Scholarship documents due soon', body: 'Your scholarship file is missing income verification. Upload the required documents by September 1, 2026 or your award may be delayed.' },
  { id: 'g3', from: 'Hospital Discharge Team', subject: 'Follow-up care instructions', body: 'Please schedule a follow-up appointment within 7 days. Call the nurse line if breathing symptoms get worse or medication doses are missed.' },
];

export default function Dashboard({ account, onAnalyze, onBack, onLogout, onOpenReport, initialError }) {
  const [selectedPipeline, setSelectedPipeline] = useState('common');
  const [inputMode, setInputMode] = useState('document');
  const [text, setText] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(gmailSamples[0].id);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState(initialError || '');
  const [reports, setReports] = useState([]);
  const [reportsBusy, setReportsBusy] = useState(true);
  const fileInput = useRef(null);

  const pipeline = useMemo(() => PIPELINES.find((item) => item.id === selectedPipeline) ?? PIPELINES.at(-1), [selectedPipeline]);
  const selectedGmail = gmailSamples.find((item) => item.id === selectedEmail) ?? gmailSamples[0];

  useEffect(() => {
    let active = true;
    listReports()
      .then((rows) => { if (active) setReports(rows); })
      .catch((err) => console.warn('[dashboard] load reports failed:', err.message))
      .finally(() => { if (active) setReportsBusy(false); });
    return () => { active = false; };
  }, []);

  async function removeReport(id, event) {
    event.stopPropagation();
    const previous = reports;
    setReports((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteReport(id);
    } catch (err) {
      setReports(previous);
      setError('Could not delete that report. Please try again.');
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 4_000_000) {
      setError('That file is too large for the demo. Try a smaller PDF or text file.');
      return;
    }
    const lowerName = file.name.toLowerCase();
    const nextText = lowerName.endsWith('.pdf') || file.type === 'application/pdf'
      ? await extractPdfLikeText(file)
      : await file.text();
    setText(nextText);
    setFileName(file.name);
    setInputMode('document');
    setError('');
  }

  function submitText() {
    const trimmed = text.trim();
    if (trimmed.length < 30) {
      setError('Add more document text before analyzing.');
      return;
    }
    onAnalyze(trimmed, selectedPipeline, fileName || 'Uploaded document');
  }

  function submitGmail() {
    const emailText = `From: ${selectedGmail.from}\nSubject: ${selectedGmail.subject}\n\n${selectedGmail.body}`;
    onAnalyze(emailText, selectedPipeline, 'Gmail reader');
  }

  return (
    <div className="product-shell">
      <ProductNav account={account} onBack={onBack} onLogout={onLogout} />

      <main className="dash-body">
        <header>
          <span className="mono-kicker">Specialized crisis pipelines</span>
          <h1 className="display dash-title">Turn the document into a plan.</h1>
          <p className="dash-sub">
            Pick the navigator that fits, paste or upload the document, and get a calm,
            structured set of next steps — with deadlines, risks, and who can help.
          </p>
        </header>

        {/* Pipeline picker — one rectangular button per pipeline, in a spaced grid */}
        <div className="pipe-grid">
          {PIPELINES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`pipe-card ${item.id === selectedPipeline ? 'active' : ''}`}
              style={{ '--accent': item.accent }}
              onClick={() => setSelectedPipeline(item.id)}
              aria-pressed={item.id === selectedPipeline}
            >
              <span className="pipe-card-orb" />
              <span className="pipe-card-label">{item.label}</span>
              <span className="pipe-card-title">{item.title}</span>
            </button>
          ))}
        </div>

        <p className="pipe-blurb">
          <span className="pipe-dot" style={{ '--accent': pipeline.accent }} />
          <span><strong style={{ color: '#eef1f7', fontWeight: 600 }}>{pipeline.title}</strong> — {pipeline.description}</span>
        </p>

        {/* Source tabs */}
        <div className="tab-row">
          <button className={inputMode === 'document' ? 'active' : ''} onClick={() => setInputMode('document')}>Document</button>
          <button className={inputMode === 'gmail' ? 'active' : ''} onClick={() => setInputMode('gmail')}>Gmail reader</button>
        </div>

        {inputMode === 'document' ? (
          <div className="doc-input">
            <textarea
              className="bare-textarea"
              value={text}
              onChange={(e) => { setText(e.target.value); setError(''); }}
              placeholder="Paste the notice, contract, discharge instructions, school letter, or PDF-extracted text here…"
            />
            <div className="doc-actions">
              <label className="file-link">
                {fileName || 'Upload PDF / text file'}
                <input ref={fileInput} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
              <button className="primary-action" onClick={submitText}>Analyze with {pipeline.title} →</button>
            </div>
          </div>
        ) : (
          <div className="gmail-min">
            {!gmailConnected ? (
              <button className="primary-action" onClick={() => setGmailConnected(true)}>Link Gmail (demo) →</button>
            ) : (
              <>
                <ul className="gmail-rows">
                  {gmailSamples.map((email) => (
                    <li key={email.id} className={selectedEmail === email.id ? 'active' : ''} onClick={() => setSelectedEmail(email.id)}>
                      <strong>{email.subject}</strong>
                      <span>{email.from}</span>
                    </li>
                  ))}
                </ul>
                <p className="email-body">{selectedGmail.body}</p>
                <button className="primary-action" onClick={submitGmail}>Analyze selected email →</button>
              </>
            )}
          </div>
        )}

        {error && <p className="dash-error">{error}</p>}

        {(reportsBusy || reports.length > 0) && (
          <section className="saved">
            <span className="mono-kicker">Your saved reports</span>
            {reportsBusy ? (
              <p className="muted-line">Loading your reports…</p>
            ) : (
              <ul className="saved-list">
                {reports.map((r) => (
                  <li key={r.id} className="saved-row" onClick={() => onOpenReport?.(r)}>
                    <span className={`report-orb urgency-${r.urgency || 'medium'}`} />
                    <span className="saved-main">
                      <strong>{r.source || 'Untitled document'}</strong>
                      <small>{(PIPELINE_LABELS[r.pipeline_type] || r.pipeline_type)} · {new Date(r.created_at).toLocaleDateString()}</small>
                    </span>
                    <button className="del-link" onClick={(e) => removeReport(r.id, e)}>Delete</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

async function extractPdfLikeText(file) {
  const buffer = await file.arrayBuffer();
  const raw = new TextDecoder('latin1').decode(buffer);
  const chunks = [];
  for (const match of raw.matchAll(/\(([^()]{3,})\)\s*Tj/g)) chunks.push(match[1]);
  for (const match of raw.matchAll(/\[((?:\([^()]{1,}\)\s*){2,})\]\s*TJ/g)) {
    chunks.push([...match[1].matchAll(/\(([^()]*)\)/g)].map((part) => part[1]).join(''));
  }
  const text = chunks
    .join('\n')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\r|\\n/g, '\n')
    .replace(/\s{3,}/g, ' ')
    .trim();

  if (text.length >= 30) return text;
  return `PDF uploaded: ${file.name}\n\nThis browser demo could not extract readable text from this PDF because it appears to be scanned or compressed. Paste the PDF text here, or export the PDF as text, then analyze it.`;
}
