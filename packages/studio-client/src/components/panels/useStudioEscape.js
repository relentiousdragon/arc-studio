import { useEffect, useRef } from 'react';
//
export function useStudioEscape(onEscape) {
  const callbackRef = useRef(onEscape);
  callbackRef.current = onEscape;

  useEffect(() => {
    const frame = requestAnimationFrame(() => document.querySelector('.embed-studio-back, .permission-studio-back')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      callbackRef.current?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export function useStudioSwitchClose(kind, onRequestClose) {
  const callbackRef = useRef(onRequestClose);
  callbackRef.current = onRequestClose;

  useEffect(() => {
    const requestClose = (event) => {
      if (event.detail?.kind === kind) callbackRef.current?.();
    };
    window.addEventListener('arc:studio-request-close', requestClose);
    return () => window.removeEventListener('arc:studio-request-close', requestClose);
  }, [kind]);
}

export function notifyStudioSwitchCancelled() {
  window.dispatchEvent(new Event('arc:studio-switch-cancelled'));
}
