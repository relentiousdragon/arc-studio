function getApiBaseUrl() {
  const desktop = Boolean(window.__ARC_STUDIO_CONFIG__?.desktop);
  if (desktop) {
    try {
      if (localStorage.getItem('arc_workspace_mode') === 'remote') {
        const remote = new URL(localStorage.getItem('arc_remote_workspace_url') || '');
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(remote.hostname);
        if ((remote.protocol === 'https:' || (remote.protocol === 'http:' && loopback))
          && !remote.username && !remote.password && remote.pathname === '/' && !remote.search && !remote.hash) {
          return remote.origin;
        }
        return '';
      }
    } catch { return ''; }
  }
  const value = String(window.__ARC_STUDIO_CONFIG__?.apiBaseUrl || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return '';
    if (url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}
//
export function normalizeWorkspaceUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw new Error('Enter a valid workspace URL, such as https://studio.example.com.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Workspace URLs must use HTTPS. HTTP is allowed only for localhost.');
  }
  if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('Enter the workspace origin only, without a path, credentials, or query.');
  }
  return url.origin;
}

export function apiUrl(path) {
  const base = getApiBaseUrl();
  if (!base) return path;
  return new URL(path, `${base}/`).toString();
}

export function studioWebSocketUrl() {
  const base = getApiBaseUrl();
  if (!base) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost'
      ? `127.0.0.1${window.location.port ? `:${window.location.port}` : ''}`
      : window.location.host;
    return `${protocol}//${host}/ws`;
  }
  const url = new URL('/ws', base);
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
