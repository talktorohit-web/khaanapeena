import React from 'react'

// Catches any render/runtime error so the whole app never white-screens on a
// counter mid-service. The owner's data is safe in localStorage — a reload recovers.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // keep a breadcrumb for support without exposing anything to the user
    try { console.error('KhaanaPeena crashed:', error, info?.componentStack) } catch { /* ignore */ }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f5f2', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: 'center', background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 10px 40px rgba(0,0,0,.08)' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🍛</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1c1917', margin: '0 0 6px' }}>Something hiccuped</h1>
          <p style={{ fontSize: 14, color: '#78716c', margin: '0 0 4px' }}>Your data is safe. Reopen to continue billing.</p>
          <p style={{ fontSize: 11, color: '#a8a29e', margin: '0 0 18px', wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error).slice(0, 140)}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ background: '#f06008', color: '#fff', fontWeight: 700, border: 0, borderRadius: 12, padding: '12px 22px', fontSize: 14, cursor: 'pointer' }}
          >
            Reload KhaanaPeena
          </button>
        </div>
      </div>
    )
  }
}
