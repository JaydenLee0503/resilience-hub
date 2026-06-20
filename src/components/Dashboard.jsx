import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PIPELINES, PIPELINE_LABELS } from '../data/pipelines';
import { ProductNav } from './AuthGate';
import { listReports, deleteReport } from '../lib/reports';
import { extractPdfText } from '../lib/pdfText';
import {
  getGmailMessageText,
  isGmailConfigured,
  requestGmailToken,
  searchGmailMessages,
} from '../lib/gmailClient';

export default function Dashboard({
  account,
  onAnalyze,
  onBack,
  onLogout,
  onOpenReport,
  initialError,
  initialText = '',
  initialSource = '',
}) {
  const [selectedPipeline, setSelectedPipeline] = useState('common');
  const [inputMode, setInputMode] = useState(initialText ? 'document' : 'document');
  const [text, setText] = useState(initialText);
  const [fileName, setFileName] = useState(initialSource || '');
  const [error, setError] = useState(initialError || '');
  const [reports, setReports] = useState([]);
  const [reportsBusy, setReportsBusy] = useState(true);
  const [fileBusy, setFileBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  const [gmailToken, setGmailToken] = useState('');
  const [gmailQuery, setGmailQuery] = useState('newer_than:90d (deadline OR appointment OR renewal OR notice OR due)');
  const [gmailMessages, setGmailMessages] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailStatus, setGmailStatus] = useState('');

  const fileInput = useRef(null);
  const shellRef = useRef(null);

  const pipeline = useMemo(() => PIPELINES.find((item) => item.id === selectedPipeline) ?? PIPELINES.at(-1), [selectedPipeline]);

  // Drive the docked side-panel offset from the real nav height so it never
  // tucks under (or floats below) the sticky nav at any zoom / breakpoint.
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

  useEffect(() => {
    if (!initialText) return;
    setText(initialText);
    setFileName(initialSource || 'Chrome PDF import');
    setInputMode('document');
  }, [initialText, initialSource]);

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
    } catch {
      setReports(previous);
      setError('Could not delete that report. Please try again.');
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 12_000_000) {
      setError('That file is too large for this demo. Try a PDF or text file under 12 MB.');
      return;
    }

    setFileBusy(true);
    setError('');
    try {
      const lowerName = file.name.toLowerCase();
      const nextText = lowerName.endsWith('.pdf') || file.type === 'application/pdf'
        ? await extractPdfText(file)
        : await file.text();

      setText(nextText);
      setFileName(file.name);
      setInputMode('document');
    } catch (err) {
      setText('');
      setFileName(file.name);
      setError(err.message || 'Could not read that file. Try another PDF or paste the text.');
    } finally {
      setFileBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function submitText() {
    const trimmed = text.trim();
    if (trimmed.length < 30) {
      setError('Add more document text before analyzing.');
      return;
    }
    onAnalyze(trimmed, selectedPipeline, fileName || 'Uploaded document');
  }

  async function connectGmail() {
    setGmailBusy(true);
    setError('');
    setGmailStatus('');
    try {
      const token = await requestGmailToken();
      setGmailToken(token);
      setGmailStatus('Gmail connected. Searching recent messages now.');
      await runGmailSearch(token);
    } catch (err) {
      setGmailStatus('');
      setError(err.message || 'Could not connect Gmail.');
    } finally {
      setGmailBusy(false);
    }
  }

  async function runGmailSearch(token = gmailToken) {
    if (!token) {
      await connectGmail();
      return;
    }
    setGmailBusy(true);
    setError('');
    try {
      const rows = await searchGmailMessages(token, gmailQuery);
      setGmailMessages(rows);
      setSelectedEmail(null);
      setGmailStatus(rows.length ? `${rows.length} Gmail message${rows.length === 1 ? '' : 's'} found.` : 'No Gmail messages matched that search.');
    } catch (err) {
      setError(err.message || 'Could not search Gmail.');
    } finally {
      setGmailBusy(false);
    }
  }

  async function chooseGmailMessage(message) {
    if (!gmailToken) return;
    setGmailBusy(true);
    setError('');
    try {
      const full = await getGmailMessageText(gmailToken, message.id);
      setSelectedEmail(full);
    } catch (err) {
      setError(err.message || 'Could not read that Gmail message.');
    } finally {
      setGmailBusy(false);
    }
  }

  function submitGmail() {
    if (!selectedEmail?.body || selectedEmail.body.length < 30) {
      setError('Choose a Gmail message with readable text first.');
      return;
    }
    const emailText = [
      `From: ${selectedEmail.from}`,
      `Date: ${selectedEmail.date}`,
      `Subject: ${selectedEmail.subject}`,
      '',
      selectedEmail.body,
    ].join('\n');
    onAnalyze(emailText, selectedPipeline, `Gmail: ${selectedEmail.subject}`);
  }

  return (
    <div className={`product-shell ${historyOpen ? 'history-open' : ''}`} ref={shellRef}>
      <ProductNav
        account={account}
        onBack={onBack}
        onLogout={onLogout}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
      />

      <main className="dash-body">
        <header className="dash-hero">
          <div>
            <span className="mono-kicker">Specialized crisis pipelines</span>
            <h1 className="display dash-title">Turn the document into a plan.</h1>
            <p className="dash-sub">
              Pick the navigator that fits, upload a PDF or connect Gmail, and get a calm,
              structured set of next steps with deadlines, risks, and who can help.
            </p>
          </div>
        </header>

        <section className="pipeline-panel">
          <div className="panel-head">
            <span className="panel-title">Choose a specialist</span>
            <span className="panel-note">Use Common Bot when nothing fits.</span>
          </div>
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
            <span><strong>{pipeline.title}</strong> - {pipeline.description}</span>
          </p>
        </section>

        <section className="source-panel">
          <div className="tab-row">
            <button className={inputMode === 'document' ? 'active' : ''} onClick={() => setInputMode('document')}>PDF / text</button>
            <button className={inputMode === 'gmail' ? 'active' : ''} onClick={() => setInputMode('gmail')}>Gmail reader</button>
            <button className={inputMode === 'extension' ? 'active' : ''} onClick={() => setInputMode('extension')}>Browser extension</button>
            <button type="button" className="primary-action calendar-cta" disabled={true}>Connect calendar</button>
          </div>

          {inputMode === 'document' && (
            <div className="doc-input">
              <div className="upload-strip">
                <div>
                  <span>{fileName || 'No file selected'}</span>
                  <small>{fileBusy ? 'Reading your PDF...' : 'Upload a PDF, TXT, or Markdown file. PDF text is extracted automatically.'}</small>
                </div>
                <label className="file-link">
                  {fileBusy ? 'Reading...' : 'Choose file'}
                  <input ref={fileInput} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(e) => handleFile(e.target.files?.[0])} />
                </label>
              </div>
              <textarea
                className="bare-textarea"
                value={text}
                onChange={(e) => { setText(e.target.value); setError(''); }}
                placeholder="The extracted PDF text will appear here. You can also paste a notice, contract, discharge instructions, school letter, or email text..."
              />
              <div className="doc-actions">
                <span className="source-count">{text.trim().length.toLocaleString()} characters ready</span>
                <button className="primary-action" onClick={submitText} disabled={fileBusy}>Analyze with {pipeline.title}</button>
              </div>
            </div>
          )}

          {inputMode === 'gmail' && (
            <div className="gmail-min">
              <div className="gmail-connect-row">
                <div>
                  <strong>{gmailToken ? 'Gmail is linked' : 'Connect Gmail'}</strong>
                  <span>
                    {isGmailConfigured()
                      ? 'Read-only access is requested from Google, then selected email text is sent through Guardian.'
                      : 'Add VITE_GOOGLE_CLIENT_ID to .env to enable real Gmail reading.'}
                  </span>
                </div>
                <button className="primary-action" onClick={gmailToken ? () => runGmailSearch() : connectGmail} disabled={gmailBusy || !isGmailConfigured()}>
                  {gmailBusy ? 'Working...' : gmailToken ? 'Search Gmail' : 'Link Gmail'}
                </button>
              </div>

              <div className="gmail-search">
                <input
                  value={gmailQuery}
                  onChange={(e) => setGmailQuery(e.target.value)}
                  placeholder="Tell the Gmail reader what to find, e.g. from:uscis newer_than:180d"
                />
                <button onClick={() => runGmailSearch()} disabled={gmailBusy || !gmailToken}>Search</button>
              </div>

              {gmailStatus && <p className="gmail-status">{gmailStatus}</p>}

              <div className="gmail-layout">
                <ul className="gmail-rows">
                  {gmailMessages.map((email) => (
                    <li key={email.id} className={selectedEmail?.id === email.id ? 'active' : ''} onClick={() => chooseGmailMessage(email)}>
                      <strong>{email.subject}</strong>
                      <span>{email.from}</span>
                      {email.snippet && <small>{email.snippet}</small>}
                    </li>
                  ))}
                </ul>
                <div className="email-preview">
                  {selectedEmail ? (
                    <>
                      <span className="email-meta">{selectedEmail.from}</span>
                      <h2>{selectedEmail.subject}</h2>
                      <p className="email-body">{selectedEmail.body}</p>
                      <button className="primary-action" onClick={submitGmail}>Analyze selected email</button>
                    </>
                  ) : (
                    <p className="email-empty">Connect Gmail, search for a message, then select it to preview and analyze.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {inputMode === 'extension' && (
            <div className="ext-panel">
              <div className="ext-row">
                <div>
                  <strong>Beacon Atlas for Chrome</strong>
                  <span>
                    Read the PDF or page in your current browser tab and send its text straight
                    to this dashboard. PII is tokenized in your browser before any AI sees it.
                  </span>
                </div>
                <a className="primary-action" href="/beacon-atlas-extension.zip" download>Download .zip</a>
              </div>
              <ol className="ext-steps">
                <li>Unzip the download, then open <code>chrome://extensions</code>.</li>
                <li>Turn on <strong>Developer mode</strong>, then click <strong>Load unpacked</strong>.</li>
                <li>Select the unzipped <code>beacon-atlas-extension</code> folder.</li>
                <li>Open a PDF or page, click the Beacon Atlas icon, then <strong>Send to dashboard</strong>.</li>
              </ol>
              <p className="ext-foot">
                For local <code>file://</code> PDFs, enable “Allow access to file URLs” on the
                extension’s details page. Scanned image-only PDFs have no selectable text yet.
              </p>
            </div>
          )}
        </section>

        {error && <p className="dash-error">{error}</p>}
      </main>

      {/* ── AI analysis history — docked sidebar ── */}
      <aside className={`history-panel ${historyOpen ? 'open' : ''}`} aria-hidden={!historyOpen}>
        <div className="history-head">
          <span className="panel-title">Analysis history</span>
          <button className="report-chat-close" onClick={() => setHistoryOpen(false)} aria-label="Hide history">×</button>
        </div>
        <span className="panel-note history-note">Private to this account</span>
        <div className="history-list-wrap">
          {reportsBusy ? (
            <p className="muted-line">Loading your reports...</p>
          ) : reports.length === 0 ? (
            <p className="muted-line">No saved analyses yet. Run one and it will appear here.</p>
          ) : (
            <ul className="saved-list">
              {reports.map((r) => (
                <li key={r.id} className="saved-row" onClick={() => onOpenReport?.(r)}>
                  <span className={`report-orb urgency-${r.urgency || 'medium'}`} />
                  <span className="saved-main">
                    <strong>{r.source || 'Untitled document'}</strong>
                    <small>{(PIPELINE_LABELS[r.pipeline_type] || r.pipeline_type)} - {new Date(r.created_at).toLocaleDateString()}</small>
                  </span>
                  <button className="del-link" onClick={(e) => removeReport(r.id, e)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
