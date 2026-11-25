import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { App } from './App.jsx';
import { AppCrashScreen, RenderErrorBoundary } from './components/ui/RenderErrorBoundary.jsx';
import { closeDesktopPrompts } from './core/desktopPrompts.js';
import './styles/index.css';
const handleRenderError = () => {
  void closeDesktopPrompts().catch(() => {});
  if (window.__ARC_STUDIO_CONFIG__?.desktop) {
    void invoke('show_main_window_after_startup').catch(() => {});
  }
};
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {import.meta.env.DEV && new URLSearchParams(window.location.search).has('error-preview')
      ? <AppCrashScreen />
      : <RenderErrorBoundary onError={handleRenderError} fallback={<AppCrashScreen />}><App /></RenderErrorBoundary>}
  </React.StrictMode>
);

if (import.meta.env.PROD && !window.__ARC_STUDIO_CONFIG__?.desktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
  }, { once: true });
}
