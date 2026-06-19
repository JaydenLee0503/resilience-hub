import React, { useState, useRef, useCallback } from 'react';

const ACCENT = 'rgba(91,140,255,';
const ACCENT_B = 'rgba(160,107,255,';

const DOC_TYPES = ['Eviction notice', 'USCIS / DACA letter', 'ICU discharge packet', 'IEP denial', 'Diversion contract', 'Other document'];

/**
 * UploadZone — document input for ResilienceHub
 *
 * Phase 0: accepts .txt files and pasted text.
 * Phase 1 will add PDF extraction via pdf.js.
 *
 * Props:
 *   onText(rawText: string) — called when the user submits a document
 *   onBack()                — returns to landing page
 */
export default function UploadZone({ onText, onBack }) {
  const [mode, setMode] = useState('drop'); // 'drop' | 'paste'
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const readFile = useCallback(
    (file) => {
      if (!file) return;
      if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
        setError('Phase 0 accepts .txt files only. PDF support is coming in Phase 1.');
        return;
      }
      if (file.size > 500_000) {
        setError('File is too large. Please paste or upload a smaller document (max ~500 KB).');
        return;
      }
      setError('');
      const reader = new FileReader();
      reader.onload = (e) => onText(e.target.result);
      reader.onerror = () => setError('Could not read the file. Try pasting the text instead.');
      reader.readAsText(file);
    },
    [onText]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      readFile(e.dataTransfer.files?.[0]);
    },
    [readFile]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);

  const handleFileInput = (e) => readFile(e.target.files?.[0]);

  const handlePasteSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length < 30) {
      setError('The pasted text seems too short. Please include the full document.');
      return;
    }
    setError('');
    onText(trimmed);
  };

  // ─── Shared design tokens ────────────────────────────────────────────────
  const panelStyle = {
    background: 'rgba(255,255,255,.035)',
    border: `1px solid ${dragging && mode === 'drop' ? `${ACCENT}0.55)` : 'rgba(255,255,255,.09)'}`,
    borderRadius: 18,
    transition: 'border-color .2s, background .2s',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#06070e',
        color: '#eef1f7',
        fontFamily: "'Hanken Grotesk', 'D-DIN Bold', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Nav ── */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#98a2bb',
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
            fontFamily: 'inherit',
            transition: 'color .2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#eef1f7')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#98a2bb')}
        >
          ← Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: `linear-gradient(135deg,${ACCENT}1),${ACCENT_B}1))`,
              boxShadow: `0 0 10px ${ACCENT}0.9)`,
            }}
          />
          <span
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 18,
              letterSpacing: '.005em',
            }}
          >
            ResilienceHub
          </span>
        </div>

        {/* Privacy guarantee badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            border: '1px solid rgba(91,140,255,.25)',
            borderRadius: 999,
            background: 'rgba(91,140,255,.07)',
            fontSize: 12,
            color: '#98a2bb',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 8px #4ade80',
            }}
          />
          PII never leaves your device
        </div>
      </nav>

      {/* ── Main ── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          gap: 32,
          maxWidth: 680,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Heading */}
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <h1
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(28px,4vw,44px)',
              fontWeight: 400,
              lineHeight: 1.1,
              margin: '0 0 12px',
            }}
          >
            Drop in your document
          </h1>
          <p style={{ color: '#98a2bb', fontSize: 16, lineHeight: 1.6, margin: 0 }}>
            ResilienceHub will strip the jargon, protect your data, and hand you a step-by-step
            action plan — ranked by what hurts most if you ignore it.
          </p>
        </div>

        {/* Mode toggle */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            border: '1px solid rgba(255,255,255,.09)',
            borderRadius: 999,
            background: 'rgba(255,255,255,.03)',
          }}
        >
          {['drop', 'paste'].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                border: 'none',
                borderRadius: 999,
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background .2s, color .2s',
                background: mode === m ? 'rgba(255,255,255,.10)' : 'transparent',
                color: mode === m ? '#eef1f7' : '#98a2bb',
              }}
            >
              {m === 'drop' ? 'Upload file' : 'Paste text'}
            </button>
          ))}
        </div>

        {/* Upload panel */}
        {mode === 'drop' && (
          <div
            style={{ ...panelStyle, width: '100%', cursor: 'pointer' }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                padding: '52px 32px',
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: `rgba(91,140,255,.10)`,
                  border: `1px solid ${ACCENT}0.2)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                📄
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 15 }}>
                  {dragging ? 'Release to analyze' : 'Drop your document here'}
                </p>
                <p style={{ margin: 0, color: '#98a2bb', fontSize: 14 }}>
                  or click to browse — .txt files, Phase 0
                </p>
              </div>

              {/* Doc type chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                {DOC_TYPES.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 12,
                      padding: '4px 12px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,.09)',
                      color: '#5a637c',
                      background: 'rgba(255,255,255,.02)',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Paste panel */}
        {mode === 'paste' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setError(''); }}
              placeholder="Paste the full text of your document here..."
              rows={12}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,.035)',
                border: '1px solid rgba(255,255,255,.09)',
                borderRadius: 14,
                padding: '16px 18px',
                color: '#eef1f7',
                fontSize: 14,
                lineHeight: 1.7,
                resize: 'vertical',
                fontFamily: "'IBM Plex Mono', monospace",
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = `${ACCENT}0.45)`)}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,.09)')}
            />
            <button
              onClick={handlePasteSubmit}
              disabled={text.trim().length < 30}
              style={{
                alignSelf: 'flex-end',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: 15,
                color: '#fff',
                border: 0,
                borderRadius: 999,
                padding: '13px 26px',
                cursor: text.trim().length >= 30 ? 'pointer' : 'not-allowed',
                opacity: text.trim().length >= 30 ? 1 : 0.4,
                background: `linear-gradient(135deg,${ACCENT}1),${ACCENT_B}1))`,
                boxShadow: `0 10px 30px -10px ${ACCENT}0.7)`,
                transition: 'opacity .2s, transform .2s',
              }}
              onMouseEnter={(e) => text.trim().length >= 30 && (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,.9)' }} />
              Analyze document
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(239,68,68,.08)',
              border: '1px solid rgba(239,68,68,.22)',
              color: '#fca5a5',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* What we protect */}
        <div
          style={{
            width: '100%',
            padding: '16px 20px',
            borderRadius: 14,
            background: 'rgba(91,140,255,.05)',
            border: '1px solid rgba(91,140,255,.15)',
            fontSize: 13,
            color: '#5a637c',
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: '#5b8cff', fontWeight: 600 }}>What ResilienceHub protects: </span>
          Social insurance numbers · Social security numbers · Health card numbers ·
          Phone numbers · Dollar amounts · Dates · Postal codes — all replaced with placeholders
          before anything leaves your device.{' '}
          <span style={{ color: '#98a2bb' }}>Open DevTools → Network to verify.</span>
        </div>
      </main>
    </div>
  );
}
