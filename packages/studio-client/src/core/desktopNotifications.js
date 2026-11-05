export async function requestDesktopNotificationPermission() {
  if (!window.__ARC_STUDIO_CONFIG__?.desktop || document.visibilityState !== 'visible') return null;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (!(await getCurrentWindow().isFocused())) return null;
  } catch {}
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    if (await isPermissionGranted()) return 'granted';
    return await requestPermission();
  } catch (error) {
    console.warn('Could not request desktop notification permission:', error);
    return 'unavailable';
  }
}

export async function notifyDesktopInBackground({ enabled, title, body }) {
  if (!enabled || !window.__ARC_STUDIO_CONFIG__?.desktop) return false;

  let isBackground = document.visibilityState === 'hidden';
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    isBackground ||= !(await getCurrentWindow().isFocused());
  } catch {}
  if (!isBackground) return false;

  try {
    const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification');
    if (!(await isPermissionGranted())) {
      if (window.Notification?.permission === 'denied') window.dispatchEvent(new Event('arc:desktop-notifications-denied'));
      return false;
    }
    sendNotification({ title, body });
    return true;
  } catch (error) {
    console.warn('Could not send desktop notification:', error);
    return false;
  }
}
