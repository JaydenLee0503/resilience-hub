import React, { useState } from 'react';

export default function AuthGate({ onLogin, onBack }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const canContinue = email.includes('@') && name.trim().length >= 2;

  return (
    <div className="product-shell auth-shell">
      <ProductNav onBack={onBack} />
      <main className="auth-grid">
        <section className="auth-copy">
          <span className="mono-kicker">Private account workspace</span>
          <h1>Secure crisis rooms for every document.</h1>
          <p>
            Sign in to keep pipeline choices, Gmail-linked reviews, chat follow-ups, and downloadable reports in one
            clean workspace. The demo account stays local to this browser.
          </p>
          <div className="security-stack">
            <span>Guardian tokenization before AI</span>
            <span>Pipeline history per account</span>
            <span>Downloadable TXT and PDF reports</span>
          </div>
          <div className="auth-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        <form
          className="auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (canContinue) onLogin({ name: name.trim(), email: email.trim(), provider: 'local-demo' });
          }}
        >
          <div className="auth-card-header">
            <span className="brand-pulse" />
            <div>
              <strong>Enter ResilienceHub</strong>
              <small>No raw document leaves your browser.</small>
            </div>
          </div>
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" /></label>
          <button disabled={!canContinue}>Enter dashboard</button>
          <p>Google sign-in can replace this local form later. The browser extension is intentionally not built in this zip version.</p>
        </form>
      </main>
    </div>
  );
}

export function ProductNav({ onBack, account, onLogout }) {
  return (
    <nav className="product-nav">
      <button className="ghost-button" onClick={onBack}>Back</button>
      <div className="product-brand"><span className="brand-pulse" /><strong>ResilienceHub</strong></div>
      {account ? (
        <div className="account-pill"><span>{account.name}</span><button onClick={onLogout}>Sign out</button></div>
      ) : (
        <span className="privacy-pill">PII never leaves your device</span>
      )}
    </nav>
  );
}
