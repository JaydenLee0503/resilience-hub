import React, { useMemo, useRef, useState } from 'react';
import { PIPELINES } from '../data/pipelines';
import { ProductNav } from './AuthGate';

const gmailSamples = [
  { id: 'g1', from: 'USCIS Updates', subject: 'Biometrics appointment reminder', body: 'USCIS reminder: Your biometrics appointment is scheduled for August 12, 2026. Bring your appointment notice and photo identification. Missing the appointment may delay your case.' },
  { id: 'g2', from: 'Financial Aid Office', subject: 'Scholarship documents due soon', body: 'Your scholarship file is missing income verification. Upload the required documents by September 1, 2026 or your award may be delayed.' },
  { id: 'g3', from: 'Hospital Discharge Team', subject: 'Follow-up care instructions', body: 'Please schedule a follow-up appointment within 7 days. Call the nurse line if breathing symptoms get worse or medication doses are missed.' },
];

export default function Dashboard({ account, onAnalyze, onBack, onLogout, initialError }) {
  const [selectedPipeline, setSelectedPipeline] = useState('common');
  const [inputMode, setInputMode] = useState('document');
  const [text, setText] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(gmailSamples[0].id);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState(initialError || '');
  const fileInput = useRef(null);

  const pipeline = useMemo(() => PIPELINES.find((item) => item.id === selectedPipeline) ?? PIPELINES.at(-1), [selectedPipeline]);
  const selectedGmail = gmailSamples.find((item) => item.id === selectedEmail) ?? gmailSamples[0];

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
    <div className="product-shell dashboard-shell">
      <ProductNav account={account} onBack={onBack} onLogout={onLogout} />
      <main className="dashboard-grid">
        <section className="pipeline-column">
          <div className="dashboard-heading">
            <span className="mono-kicker">Choose your crisis pipeline</span>
            <h1>Pick the specialist first. Use Common Bot when nothing fits.</h1>
          </div>

          <button className={`gmail-link-button ${gmailConnected ? 'connected' : ''}`} onClick={() => setGmailConnected(true)}>
            <span className="brand-pulse" />
            <strong>{gmailConnected ? 'Gmail linked for demo' : 'Link Gmail'}</strong>
            <small>{gmailConnected ? 'Inbox samples unlocked' : 'Connect inbox review separately'}</small>
          </button>

          <div className="pipeline-list">
            {PIPELINES.map((item) => (
              <button key={item.id} className={`pipeline-row ${item.id === selectedPipeline ? 'active' : ''}`} style={{ '--accent': item.accent }} onClick={() => setSelectedPipeline(item.id)}>
                <span className="pipeline-orb" />
                <span><strong>{item.label}</strong><small>{item.title}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <div className="dashboard-topline">
            <div>
              <span className="mono-kicker">Account workspace</span>
              <strong>{account.name}'s action room</strong>
            </div>
            <span>{gmailConnected ? 'Gmail linked' : 'Gmail not linked'}</span>
          </div>

          <div className="selected-pipeline" style={{ '--accent': pipeline.accent }}>
            <span className="pipeline-orb" />
            <div>
              <span className="mono-kicker">{pipeline.label}</span>
              <h2>{pipeline.title}</h2>
              <p>{pipeline.description}</p>
              <div className="example-chips">{pipeline.examples.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          </div>

          <div className="input-tabs">
            <button className={inputMode === 'document' ? 'active' : ''} onClick={() => setInputMode('document')}>Document upload</button>
            <button className={inputMode === 'gmail' ? 'active' : ''} onClick={() => setInputMode('gmail')}>Gmail reader</button>
          </div>

          {inputMode === 'document' ? (
            <section className="input-card document-card">
              <div className="drop-line" onClick={() => fileInput.current?.click()}>
                <input ref={fileInput} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={(event) => handleFile(event.target.files?.[0])} />
                <strong>{fileName || 'Upload a PDF or text document'}</strong>
                <span>or paste the document text directly below</span>
              </div>
              <textarea value={text} onChange={(event) => { setText(event.target.value); setError(''); }} placeholder="Paste the document, notice, contract, discharge instructions, school letter, or PDF-extracted text here..." />
              <button className="primary-action" onClick={submitText}>Analyze with {pipeline.title}</button>
            </section>
          ) : (
            <section className="input-card gmail-card">
              <div className="gmail-connect">
                <div><strong>Gmail Reader</strong><p>Use the separate Link Gmail button to connect inbox review. This zip demo uses safe sample emails until Google OAuth credentials are added.</p></div>
                <button onClick={() => setGmailConnected(true)}>{gmailConnected ? 'Gmail linked' : 'Link Gmail'}</button>
              </div>
              {gmailConnected ? (
                <>
                  <div className="gmail-list">
                    {gmailSamples.map((email) => (
                      <button key={email.id} className={selectedEmail === email.id ? 'active' : ''} onClick={() => setSelectedEmail(email.id)}>
                        <strong>{email.subject}</strong><span>{email.from}</span>
                      </button>
                    ))}
                  </div>
                  <div className="email-preview"><span>{selectedGmail.from}</span><strong>{selectedGmail.subject}</strong><p>{selectedGmail.body}</p></div>
                  <button className="primary-action" onClick={submitGmail}>Analyze selected Gmail</button>
                </>
              ) : (
                <div className="gmail-empty"><strong>Gmail is not linked yet.</strong><span>Click Link Gmail to unlock inbox review. No extension is being built in this version.</span></div>
              )}
            </section>
          )}

          {error && <div className="inline-error">{error}</div>}
        </section>
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
