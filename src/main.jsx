import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', background: '#06070e', color: '#eef1f7', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 680, border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 24, background: 'rgba(255,255,255,.04)' }}>
          <p style={{ color: '#fca5a5', margin: '0 0 10px', fontFamily: 'monospace' }}>ResilienceHub hit a browser error</p>
          <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>The page did not render cleanly.</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#98a2bb', fontSize: 13 }}>{this.state.error?.message || String(this.state.error)}</pre>
          <button
            onClick={() => {
              localStorage.removeItem('resiliencehub_account');
              window.location.reload();
            }}
            style={{ marginTop: 18, border: 0, borderRadius: 999, padding: '11px 16px', color: '#fff', background: 'linear-gradient(135deg,#5b8cff,#a06bff)', cursor: 'pointer' }}
          >
            Reset local demo state
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
