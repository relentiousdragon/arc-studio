export function onPageBlur(callback) {
  const handleBlur = () => {
    if (window.__ARC_NATIVE_CONTEXT_MENU_OPEN__) return;
    callback();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && !window.__ARC_NATIVE_CONTEXT_MENU_OPEN__) callback();
  };
  window.addEventListener('blur', handleBlur);
  window.addEventListener('pagehide', handleBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('pagehide', handleBlur);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
