import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.jsx';
import { AppCrashScreen, RenderErrorBoundary } from './components/ui/RenderErrorBoundary.jsx';
import './styles/index.css';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {import.meta.env.DEV && new URLSearchParams(window.location.search).has('error-preview')
      ? <AppCrashScreen />
      : <RenderErrorBoundary fallback={<AppCrashScreen />}><App /></RenderErrorBoundary>}
  </React.StrictMode>
);

if (import.meta.env.PROD && !window.__ARC_STUDIO_CONFIG__?.desktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
  }, { once: true });
}
