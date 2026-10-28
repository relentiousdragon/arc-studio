import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react';
import { arcEvents } from '../../core/ArcEvents.js';
//
export function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => arcEvents.on('toast:notify', (toast) => {
    const id = toast.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item = { id, title: toast.title, message: toast.message, type: toast.type || 'info', duration: toast.duration ?? 4200, persistent: Boolean(toast.persistent), loading: Boolean(toast.loading), dismissible: toast.dismissible !== false, progress: Number.isFinite(toast.progress) ? Math.max(0, Math.min(100, Math.round(toast.progress))) : null };
    setToasts((current) => current.some((entry) => entry.id === id)
      ? current.map((entry) => entry.id === id ? item : entry)
      : [...current.filter((entry) => entry.persistent), ...current.filter((entry) => !entry.persistent).slice(-2), item]);
    if (!item.persistent) window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), item.duration);
  }), []);

  const icons = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
  return <div className="toast-stack" aria-live="polite" aria-atomic="false">{toasts.map((toast) => {
    const Icon = toast.loading ? LoaderCircle : icons[toast.type] || Info;
    const progressOffset = toast.progress === null ? 0 : 75.4 * (1 - toast.progress / 100);
    return <article className={`toast-card toast-${toast.type}`} key={toast.id}>
      {toast.progress === null ? <Icon size={17} className={`toast-icon ${toast.loading ? 'is-spinning' : ''}`} /> : <div className="toast-progress-ring" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={toast.progress}>
        <svg viewBox="0 0 28 28" aria-hidden="true"><circle className="toast-progress-track" cx="14" cy="14" r="12" /><circle className="toast-progress-value" cx="14" cy="14" r="12" style={{ strokeDashoffset: progressOffset }} /></svg>
        <span>{toast.progress}%</span>
      </div>}
      <div className="toast-copy">{toast.title && <strong>{toast.title}</strong>}{toast.message && <span>{toast.message}</span>}</div>
      {toast.dismissible && <button className="icon-button compact" onClick={() => setToasts((current) => current.filter((entry) => entry.id !== toast.id))} aria-label="Dismiss notification"><X size={14} /></button>}
    </article>;
  })}</div>;
}
