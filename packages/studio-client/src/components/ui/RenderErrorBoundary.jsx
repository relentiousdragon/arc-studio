import React from 'react';
//
export class RenderErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, details) {
    this.props.onError?.(error, details);
  }

  render() {
    if (this.state.failed) return this.props.fallback || null;
    return this.props.children;
  }
}

export function AppCrashScreen() {
  return <main className="app-crash-screen" role="alert">
    <div className="app-crash-content">
      <img src="/arc.png" alt="ARC Studio" />
      <h1>Uh oh, something went wrong.</h1>
      <p>Try reloading ARC Studio.</p>
      <a href="/" onClick={(event) => { event.preventDefault(); window.location.reload(); }}>Reload ARC Studio</a>
    </div>
  </main>;
}
