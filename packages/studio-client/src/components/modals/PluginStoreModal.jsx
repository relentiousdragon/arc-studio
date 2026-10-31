import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, FolderOpen, PackageOpen, RefreshCw, Search, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import { apiUrl } from '../../core/api.js';
import { Modal } from '../ui/Modal.jsx';
import { SidebarResizeHandle } from '../ui/SidebarResizeHandle.jsx';
import { Button } from '../ui/Button.jsx';
import { TextInput, Toggle } from '../ui/Inputs.jsx';
import { compareArcVersions } from '../../core/appUpdates.js';
//
async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function noticesFor(plugin) {
  return Array.isArray(plugin?.thirdPartyNotices) ? plugin.thirdPartyNotices : [];
}

function licenseDetails(value) {
  const match = String(value || '').match(/^(.+?)\s+\(chosen from\s+(.+)\)$/i);
  return match
    ? { expression: match[2], includedText: match[1] }
    : { expression: value, includedText: '' };
}

function hasCatalogUpdate(installed, candidate) {
  return Boolean(installed && candidate && compareArcVersions(candidate.version, installed.version) === 1);
}

function defaultCatalogTrustText(kind) {
  const review = 'The default catalogue is recommended because ARC maintainers review and test plugins before publishing them.';
  if (kind === 'host-adapter') return `${review} Host adapters run with the workspace server’s operating-system access; review their source and declared operation permissions carefully.`;
  if (kind === 'wasm-adapter') return `${review} WebAssembly adapters run in a restricted worker and cannot request host capabilities.`;
  return `${review} Function graph packs install reusable graph data; they do not run plugin code.`;
}

function validateRepositoryUrl(value) {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split('/').filter(Boolean);
    const validPath = parts.length >= 2 && parts.every((part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== '.' && part !== '..');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) return 'Use an HTTPS repository URL without credentials or query parameters.';
    if (url.hostname === 'github.com' && parts.length !== 2) return 'Enter a GitHub repository URL: https://github.com/owner/repository';
    if (url.hostname === 'gitlab.com' && !validPath) return 'Enter a GitLab project URL: https://gitlab.com/group/project';
    if (!['github.com', 'gitlab.com'].includes(url.hostname) || !validPath) return 'Use a repository hosted on github.com or gitlab.com.';
    return '';
  } catch { return 'Enter a valid HTTPS GitHub or GitLab repository URL.'; }
}

export function PluginStoreModal({ isOpen, onClose, authToken, onInstalled, canInstall = false, canManageSource = false, sidebarWidth = 360, onSidebarResize }) {
  const [catalog, setCatalog] = useState([]);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [studioVersion, setStudioVersion] = useState(window.__arc?.version || '0.0.0');
  const [installed, setInstalled] = useState([]);
  const [repository, setRepository] = useState({ url: 'https://github.com/relentiousdragon/arc-plugins', provider: 'github' });
  const [repositoryDraft, setRepositoryDraft] = useState('');
  const [repositoryModalOpen, setRepositoryModalOpen] = useState(false);
  const [confirmRepository, setConfirmRepository] = useState(false);
  const [repositoryTrust, setRepositoryTrust] = useState(false);
  const [repositorySaving, setRepositorySaving] = useState(false);
  const [repositoryErrorMessage, setRepositoryErrorMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmTrust, setConfirmTrust] = useState(false);
  const [confirmAutoUpdate, setConfirmAutoUpdate] = useState(true);
  const [permissionSelection, setPermissionSelection] = useState([]);
  const [hostRuntimeAcknowledged, setHostRuntimeAcknowledged] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('installed');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [importingLocal, setImportingLocal] = useState(false);
  const [error, setError] = useState('');
  const [selectedNotices, setSelectedNotices] = useState(null);
  const [settingsPlugin, setSettingsPlugin] = useState(null);
  const [pluginSettings, setPluginSettings] = useState({ schema: [], values: {}, projectId: '' });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [clearPluginSecrets, setClearPluginSecrets] = useState([]);
  const onInstalledRef = useRef(onInstalled);

  useEffect(() => { onInstalledRef.current = onInstalled; }, [onInstalled]);

  useEffect(() => {
    if (!authToken || !canInstall) return undefined;
    let cancelled = false;
    const checkUpdates = async () => {
      try {
        const response = await fetch(apiUrl('/api/plugins/auto-update'), {
          method: 'POST', headers: { 'x-arc-token': authToken }
        });
        const data = await readResponse(response, 'Could not check automatic plugin updates.');
        if (cancelled) return;
        if (Array.isArray(data.installed)) setInstalled(data.installed);
        if (data.updated?.length) await onInstalledRef.current?.(data.installed);
      } catch {
        //
      }
    };
    const interval = window.setInterval(checkUpdates, 5 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [authToken, canInstall]);

  const loadInstalled = async () => {
    const response = await fetch(apiUrl('/api/plugins/installed'), { headers: { 'x-arc-token': authToken } });
    const data = await readResponse(response, 'Could not load installed plugins.');
    const plugins = Array.isArray(data.plugins) ? data.plugins : [];
    setInstalled(plugins);
    return plugins;
  };

  const loadStore = async () => {
    setLoading(true);
    setError('');
    setCatalogUnavailable(false);
    const headers = { 'x-arc-token': authToken };
    const [installedResult, catalogResult, sourceResult] = await Promise.allSettled([
      loadInstalled(),
      fetch(apiUrl('/api/plugins/catalog'), { headers }).then((response) => readResponse(response, 'Could not load plugin catalog.')),
      fetch(apiUrl('/api/plugins/source'), { headers }).then((response) => readResponse(response, 'Could not load plugin source settings.'))
    ]);
    if (catalogResult.status === 'fulfilled') {
      setCatalog(Array.isArray(catalogResult.value.plugins) ? catalogResult.value.plugins : []);
      if (catalogResult.value.studioVersion) setStudioVersion(catalogResult.value.studioVersion);
    } else {
      setCatalogUnavailable(true);
    }
    if (sourceResult.status === 'fulfilled' && sourceResult.value.repository?.url) setRepository(sourceResult.value.repository);

    const failures = [];
    if (installedResult.status === 'rejected') failures.push(installedResult.reason?.message || 'Could not load installed plugins.');
    if (catalogResult.status === 'rejected') failures.push(catalogResult.reason?.message || 'Could not load plugin catalog.');
    if (sourceResult.status === 'rejected') failures.push(sourceResult.reason?.message || 'Could not load plugin source settings.');

    if (canInstall && installedResult.status === 'fulfilled') {
      try {
        const updateResponse = await fetch(apiUrl('/api/plugins/auto-update'), { method: 'POST', headers });
        const updateData = await readResponse(updateResponse, 'Could not check automatic plugin updates.');
        if (Array.isArray(updateData.installed)) setInstalled(updateData.installed);
        if (updateData.updated?.length) await onInstalled?.(updateData.installed);
        if (updateData.errors?.length) failures.push(`Some automatic updates failed: ${updateData.errors.map((item) => `${item.id}: ${item.message}`).join(' · ')}`);
      } catch (updateError) {
        failures.push(updateError.message || 'Could not check automatic plugin updates.');
      }
    }
    setError([...new Set(failures.filter(Boolean))].join(' · '));
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      loadStore();
    }
  }, [isOpen, authToken]);

  const installedById = useMemo(() => new Map(installed.map((plugin) => [plugin.id, plugin])), [installed]);
  const catalogById = useMemo(() => new Map(catalog.map((plugin) => [plugin.id, plugin])), [catalog]);
  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((plugin) => !query || `${plugin.name} ${plugin.description} ${plugin.author} ${(plugin.tags || []).join(' ')}`.toLowerCase().includes(query));
  }, [catalog, search]);

  const beginInstall = (plugin, permissionReviewOnly = false) => {
    setError('');
    setConfirmTrust(permissionReviewOnly);
    setConfirmAutoUpdate(!['host-adapter', 'wasm-adapter'].includes(plugin.kind) && !plugin.builtIn && installedById.get(plugin.id)?.autoUpdate !== false);
    setHostRuntimeAcknowledged(false);
    const installedPlugin = installedById.get(plugin.id);
    const permissions = installedPlugin
      ? (Array.isArray(plugin.grantedPermissions) ? plugin.grantedPermissions : installedPlugin.grantedPermissions || [])
      : (plugin.permissions || []).map((permission) => permission.id);
    setPermissionSelection(permissions);
    setConfirmAction({ kind: 'store', plugin, permissionReviewOnly });
  };

  const uninstall = async (plugin) => {
    setBusyId(plugin.id);
    setError('');
    try {
      const response = await fetch(apiUrl(`/api/plugins/${encodeURIComponent(plugin.id)}`), {
        method: 'DELETE', headers: { 'x-arc-token': authToken }
      });
      const data = await readResponse(response, 'Could not remove plugin.');
      setInstalled(Array.isArray(data.installed) ? data.installed : []);
      await onInstalled?.(Array.isArray(data.installed) ? data.installed : []);
    } catch (removeError) {
      setError(removeError.message || 'Could not remove plugin.');
    } finally {
      setBusyId('');
    }
  };

  const openPluginSettings = async (plugin) => {
    setSettingsError('');
    setClearPluginSecrets([]);
    setSettingsPlugin(plugin);
    setPluginSettings({ schema: plugin.settingsSchema || [], values: {}, projectId: '' });
    try {
      const response = await fetch(apiUrl(`/api/plugins/${encodeURIComponent(plugin.id)}/settings`), { headers: { 'x-arc-token': authToken } });
      const data = await readResponse(response, 'Could not load plugin settings.');
      setPluginSettings(data);
    } catch (loadError) { setSettingsError(loadError.message || 'Could not load plugin settings.'); }
  };

  const savePluginSettings = async () => {
    if (!settingsPlugin) return;
    setSettingsSaving(true);
    setSettingsError('');
    try {
      const response = await fetch(apiUrl(`/api/plugins/${encodeURIComponent(settingsPlugin.id)}/settings`), {
        method: 'PUT', headers: { 'x-arc-token': authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: pluginSettings.projectId, values: pluginSettings.values, clearSecrets: clearPluginSecrets })
      });
      const data = await readResponse(response, 'Could not save plugin settings.');
      setPluginSettings(data);
      setSettingsPlugin(null);
    } catch (saveError) { setSettingsError(saveError.message || 'Could not save plugin settings.'); }
    finally { setSettingsSaving(false); }
  };

  const importLocalFolder = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const rootJsonFiles = files.filter((file) => {
      const path = file.webkitRelativePath || file.name;
      const name = path.split('/').at(-1);
      return path.split('/').length <= 2 && name.toLowerCase().endsWith('.json') && name.toLowerCase() !== 'registry.json';
    });
    const manifestFile = rootJsonFiles.find((file) => (file.webkitRelativePath || file.name).split('/').at(-1) === 'arc-plugin.json')
      || (rootJsonFiles.length === 1 ? rootJsonFiles[0] : null);
    if (!manifestFile) {
      setError('Choose a plugin folder with arc-plugin.json, or one versioned pack JSON at its root.');
      return;
    }
    if (manifestFile.size > 1024 * 1024) {
      setError('The plugin manifest must be no larger than 1 MiB.');
      return;
    }
    setImportingLocal(true);
    setError('');
    try {
      let pack;
      try { pack = JSON.parse(await manifestFile.text()); }
      catch { throw new Error('arc-plugin.json is not valid JSON.'); }
      const folderName = (manifestFile.webkitRelativePath || '').split('/')[0];
      const adapterFile = pack?.kind === 'wasm-adapter'
        ? files.find((file) => (file.webkitRelativePath || '').split('/').length === 2
          && (file.webkitRelativePath || '').split('/')[0] === folderName
          && (file.webkitRelativePath || '').split('/')[1] === 'adapter.wasm')
        : null;
      if (pack?.kind === 'wasm-adapter' && !adapterFile) throw new Error('This adapter folder needs its compiled adapter.wasm beside arc-plugin.json.');
      if (typeof pack?.minArcStudioVersion !== 'string' || !pack.minArcStudioVersion.trim()) throw new Error('This plugin must declare minArcStudioVersion in its manifest.');
      const minimumStudioVersion = pack.minArcStudioVersion.trim();
      const compatibility = compareArcVersions(studioVersion, minimumStudioVersion);
      if (compatibility === null) throw new Error('This plugin has an invalid minArcStudioVersion requirement.');
      if (compatibility < 0) throw new Error(`${pack.name || pack.id || 'This plugin'} requires ARC Studio ${minimumStudioVersion} or newer. This workspace is running ${studioVersion}.`);
      if (adapterFile && adapterFile.size > 8 * 1024 * 1024) throw new Error('The adapter.wasm file must be no larger than 8 MiB.');
      setConfirmAutoUpdate(true);
      setConfirmTrust(false);
      setConfirmAction({ kind: 'local', pack, adapterFile, name: pack.name || pack.id || 'Local plugin', version: pack.version || 'Unknown version' });
    } catch (importError) {
      setError(importError.message || 'Could not read this local plugin.');
    } finally {
      setImportingLocal(false);
    }
  };

  const confirmInstall = async () => {
    if (!confirmAction || (!confirmAction.permissionReviewOnly && !confirmTrust)) return;
    if (!confirmAction.permissionReviewOnly && confirmAction.plugin?.kind === 'host-adapter' && !hostRuntimeAcknowledged) return;
    const pluginId = confirmAction.kind === 'store' ? confirmAction.plugin.id : confirmAction.pack.id;
    setBusyId(pluginId || 'local-import');
    setImportingLocal(confirmAction.kind === 'local');
    setError('');
    try {
      let endpoint;
      let body;
      let method = 'POST';
      if (confirmAction.kind === 'store' && confirmAction.permissionReviewOnly) {
        endpoint = `/api/plugins/${encodeURIComponent(confirmAction.plugin.id)}/permissions`;
        method = 'PUT';
        body = { permissions: permissionSelection };
      } else if (confirmAction.kind === 'store') {
        endpoint = `/api/plugins/${encodeURIComponent(confirmAction.plugin.id)}/install`;
        body = {
          autoUpdate: confirmAutoUpdate,
          trustConfirmed: true,
          permissions: permissionSelection,
          expectedVersion: confirmAction.plugin.version,
          expectedSha256: confirmAction.plugin.sha256 || '',
          expectedRepositoryUrl: confirmAction.plugin.repositoryUrl || '',
          hostCodeConfirmed: hostRuntimeAcknowledged
        };
      } else {
        endpoint = confirmAction.pack?.kind === 'wasm-adapter' ? '/api/plugins/import-adapter' : '/api/plugins/import-local';
        body = confirmAction.pack?.kind === 'wasm-adapter'
          ? { manifest: confirmAction.pack, wasmBase64: await fileToBase64(confirmAction.adapterFile), autoUpdate: confirmAutoUpdate, trustConfirmed: true }
          : { pack: confirmAction.pack, autoUpdate: confirmAutoUpdate, trustConfirmed: true };
      }
      const response = await fetch(apiUrl(endpoint), {
        method,
        headers: { 'x-arc-token': authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await readResponse(response, 'Could not install plugin.');
      setInstalled(Array.isArray(data.installed) ? data.installed : []);
      await onInstalled?.(Array.isArray(data.installed) ? data.installed : []);
      setConfirmAction(null);
      setActiveTab('installed');
      await loadStore();
    } catch (installError) {
      setError(installError.message || 'Could not install plugin.');
    } finally {
      setBusyId('');
      setImportingLocal(false);
    }
  };

  const saveRepository = async () => {
    const validation = validateRepositoryUrl(repositoryDraft);
    if (validation) return setRepositoryErrorMessage(validation);
    if (!canManageSource || repositoryDraft.trim() === repository.url) return;
    setRepositorySaving(true);
    setRepositoryErrorMessage('');
    try {
      const response = await fetch(apiUrl('/api/plugins/source'), {
        method: 'PATCH',
        headers: { 'x-arc-token': authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl: repositoryDraft.trim(), trustConfirmed: true })
      });
      const data = await readResponse(response, 'Could not save plugin source.');
      setRepository(data.repository);
      setRepositoryModalOpen(false);
      setConfirmRepository(false);
      setRepositoryTrust(false);
      await loadStore();
    } catch (saveError) {
      setRepositoryErrorMessage(saveError.message || 'Could not save plugin source.');
    } finally {
      setRepositorySaving(false);
    }
  };

  const repositoryError = repositoryDraft ? validateRepositoryUrl(repositoryDraft) : '';
  const repositoryChanged = repositoryDraft.trim() !== repository.url;
  const confirmationPlugin = confirmAction?.kind === 'store' ? confirmAction.plugin : null;
  const localImport = confirmAction?.kind === 'local' ? confirmAction : null;
  const confirmationSource = confirmationPlugin?.sourceUrl || (localImport ? 'Selected local folder' : '');
  const confirmationPermissions = confirmationPlugin?.permissions || [];
  const confirmationNpmDependencies = confirmationPlugin?.npmDependencies || [];
  const confirmationRuntimeDependencies = confirmationPlugin?.runtimeDependencies || [];
  const isBundledPlugin = confirmationPlugin?.builtIn || confirmationPlugin?.sourceTrust === 'bundled';
  const isUntrustedSource = Boolean(localImport || confirmationPlugin?.sourceTrust === 'custom');
  const hostRuntimeConfirmationRequired = confirmationPlugin?.kind === 'host-adapter' && !isBundledPlugin;

  return <>
    {isOpen && <aside className="plugin-store-sidebar" aria-label="Plugin store" style={{ '--arc-sidebar-width': `${sidebarWidth}px` }}>
      <SidebarResizeHandle width={sidebarWidth} defaultWidth={360} onResize={onSidebarResize} />
      <header className="graph-library-header">
        <span><PackageOpen size={14} />Plugin Store</span>
        <button className="icon-button compact" type="button" aria-label="Close plugin store" onClick={() => !busyId && onClose?.()} disabled={Boolean(busyId)}><X size={14} /></button>
      </header>
      {catalogUnavailable && <div className="plugin-store-offline-notice" role="status"><AlertTriangle size={13} /><span>The plugin catalog is unavailable, check your network.</span></div>}
      <nav className="plugin-store-tabs" aria-label="Plugin Store sections">
        {[
          ['installed', 'Installed', installed.length],
          ['store', 'Store', catalog.length],
          ['source', 'Source'],
          ['local', 'Local']
        ].map(([id, label, count]) => <button key={id} type="button" className={activeTab === id ? 'is-active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => {
          setActiveTab(id);
          setError('');
          if (id === 'installed') loadInstalled().catch((loadError) => setError(loadError.message || 'Could not load installed plugins.'));
        }}>
          {label}{count !== undefined && <span>{count}</span>}
        </button>)}
      </nav>
      <div className="plugin-store-panel-content">
      {activeTab === 'installed' && <>
      <section className="plugin-store-installed-section">
        <div className="plugin-store-section-heading"><strong>Installed</strong><span>{installed.length}</span></div>
        {loading && !installed.length ? <div className="plugin-store-inline-empty">Loading installed plugins…</div>
          : installed.length ? <div className="plugin-store-installed-list">{installed.map((plugin) => {
            const available = catalogById.get(plugin.id);
            const updateAvailable = hasCatalogUpdate(plugin, available);
            return <article className="plugin-store-installed-card" key={plugin.id}>
              <div className="plugin-store-card-copy">
                <div className="plugin-store-title"><strong>{plugin.name}</strong><span>v{plugin.version}</span></div>
                <p>{plugin.description || available?.description || 'Installed plugin pack.'}</p>
                <small className="plugin-store-installed">By {plugin.author || available?.author || 'Unknown author'} · {['host-adapter', 'wasm-adapter'].includes(plugin.kind) ? `${plugin.kind === 'host-adapter' ? 'Server' : 'WebAssembly'} adapter · manual updates` : plugin.sourceType === 'builtin' ? 'Built-in integration' : plugin.sourceType === 'local' ? 'Local development adapter' : `Installed · auto-update ${plugin.autoUpdate ? 'on' : 'off'}`}{updateAvailable ? ` · v${available.version} available` : ''}</small>
                {plugin.installedBy && <small className="plugin-store-origin">Installed by {plugin.installedBy}</small>}
                {plugin.studioCompatible === false && <small className="plugin-store-origin is-untrusted">Requires ARC Studio {plugin.minArcStudioVersion} or newer · this workspace is {plugin.studioVersion || studioVersion}</small>}
                {plugin.permissions?.length > 0 && <small className="plugin-store-origin">This project grants: {plugin.grantedPermissions?.length ? plugin.permissions.filter((permission) => plugin.grantedPermissions.includes(permission.id)).map((permission) => permission.name).join(' · ') : 'No elevated permissions'}</small>}
                {noticesFor(plugin).length > 0 && <button type="button" className="plugin-store-license-link" onClick={() => setSelectedNotices({ name: plugin.name, notices: noticesFor(plugin) })}>Third-party licenses</button>}
              </div>
              <div className="plugin-store-card-actions">
                {(plugin.settingsSchema?.length || available?.settingsSchema?.length) > 0 && <Button variant="secondary" size="sm" icon={Settings2} disabled={!canInstall || plugin.studioCompatible === false} onClick={() => openPluginSettings(plugin)}>Settings</Button>}
                {plugin.permissions?.length > 0 && <Button variant="secondary" size="sm" icon={ShieldCheck} disabled={!canInstall || plugin.studioCompatible === false} onClick={() => beginInstall({ ...plugin, builtIn: plugin.sourceType === 'builtin', grantedPermissions: plugin.grantedPermissions || [] }, true)}>Permissions</Button>}
                {updateAvailable
                  ? <Button size="sm" loading={busyId === plugin.id} disabled={!canInstall || available.arcApiVersion !== 1 || available.studioCompatible === false} title={available.studioCompatible === false ? `Requires ARC Studio ${available.minArcStudioVersion} or newer` : undefined} onClick={() => beginInstall(available)}>Update</Button>
                  : <Button variant="secondary" size="sm" icon={Trash2} loading={busyId === plugin.id} disabled={!canInstall} onClick={() => uninstall(plugin)}>Remove</Button>}
              </div>
            </article>;
          })}</div>
          : <div className="plugin-store-inline-empty">No plugins installed yet.</div>}
      </section>
      {!loading && !error && !canInstall && <p className="plugin-store-update-note">Plugin updates are managed by workspace admins.</p>}
      {error && <p className="plugin-store-error">{error}</p>}
      </>}
      {activeTab === 'store' && <>
      <div className="plugin-store-toolbar">
        <label className="plugin-store-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search plugins" aria-label="Search plugins" /></label>
        <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={loadStore} aria-label="Refresh plugin catalog">Refresh</Button>
      </div>
      <div className="plugin-store-notice"><AlertTriangle size={13} />Install only plugins from sources and publishers you trust.</div>
      {error && <p className="plugin-store-error">{error}</p>}
      <div className="plugin-store-section-heading plugin-store-catalog-heading"><strong>Available plugins</strong><span>{filteredCatalog.length}</span></div>
      {loading && !catalog.length ? <div className="plugin-store-empty">Loading catalog…</div>
        : !filteredCatalog.length ? <div className="plugin-store-empty">{catalog.length ? 'No plugins match this search.' : 'No plugins are published in this catalog yet.'}</div>
          : <div className="plugin-store-list">{filteredCatalog.map((plugin) => {
            const current = installedById.get(plugin.id);
            const updateAvailable = hasCatalogUpdate(current, plugin);
            return <article className="plugin-store-card" key={plugin.id}>
              <div className="plugin-store-card-copy">
                <div className="plugin-store-title"><strong>{plugin.name}</strong><span>v{plugin.version}</span></div>
                <p>{plugin.description || 'No description provided.'}</p>
                <div className="plugin-store-meta"><span>{plugin.author || 'Unknown author'}</span>{plugin.license && <span>{plugin.license}</span>}{(plugin.tags || []).map((tag) => <span className="plugin-store-tag" key={tag}>{tag}</span>)}</div>
                {plugin.minArcStudioVersion !== '0.0.0' && <small className={`plugin-store-origin ${plugin.studioCompatible === false ? 'is-untrusted' : ''}`}>{plugin.studioCompatible === false ? `Requires ARC Studio ${plugin.minArcStudioVersion} or newer · this workspace is ${plugin.studioVersion || studioVersion}` : `Requires ARC Studio ${plugin.minArcStudioVersion} or newer`}</small>}
                {plugin.sourceTrust === 'custom' && <small className="plugin-store-origin is-untrusted">Outside default source</small>}
                {plugin.permissions?.length > 0 && <small className="plugin-store-origin">Permissions: {plugin.permissions.map((permission) => permission.name).join(' · ')}</small>}
                {plugin.sourceTrust === 'custom' && <div className="plugin-trust-warning"><AlertTriangle size={13} /><span>This plugin comes from a non-default catalogue. ARC does not verify its publisher or review its contents.</span></div>}
                {noticesFor(plugin).length > 0 && <button type="button" className="plugin-store-license-link" onClick={() => setSelectedNotices({ name: plugin.name, notices: noticesFor(plugin) })}>Third-party licenses</button>}
                {current && <small className="plugin-store-installed">{['host-adapter', 'wasm-adapter'].includes(current.kind) ? `${current.kind === 'host-adapter' ? 'Server' : 'WebAssembly'} adapter · installed v${current.version} · manual updates` : current.sourceType === 'builtin' ? 'Built-in integration' : current.sourceType === 'local' ? 'Local import' : `Installed v${current.version}`}{updateAvailable ? ` · v${plugin.version} available` : ''}{!['local', 'builtin'].includes(current.sourceType) && !['host-adapter', 'wasm-adapter'].includes(current.kind) ? (current.autoUpdate ? ' · auto-update on' : ' · auto-update off') : ''}</small>}
              </div>
              <div className="plugin-store-card-actions">
                <a className="plugin-store-source" href={plugin.sourceUrl} target="_blank" rel="noreferrer" aria-label={`View ${plugin.name} source`}><ExternalLink size={14} /></a>
                {current && !updateAvailable
                  ? <Button variant="secondary" size="sm" icon={Trash2} loading={busyId === plugin.id} disabled={!canInstall} onClick={() => uninstall(plugin)}>Remove</Button>
                  : <Button size="sm" loading={busyId === plugin.id} disabled={!canInstall || plugin.arcApiVersion !== 1 || plugin.studioCompatible === false} title={plugin.studioCompatible === false ? `Requires ARC Studio ${plugin.minArcStudioVersion} or newer` : undefined} onClick={() => beginInstall(plugin)}>{current ? 'Update' : 'Install'}</Button>}
              </div>
            </article>;
          })}</div>}
      <a className="plugin-store-repository" href={repository.url} target="_blank" rel="noreferrer">Open plugin repository <ExternalLink size={12} /></a>
      </>}
      {activeTab === 'source' && <>
        <div className="plugin-source-bar plugin-source-detail">
          <div><strong>Catalogue source</strong><a href={repository.url} target="_blank" rel="noreferrer">{repository.url}<ExternalLink size={11} /></a></div>
          {canManageSource && <Button variant="secondary" size="sm" icon={Settings2} onClick={() => { setRepositoryDraft(repository.url); setRepositoryModalOpen(true); setError(''); setRepositoryErrorMessage(''); }}>Change source</Button>}
        </div>
        <p className="plugin-store-update-note">The catalogue lists plugins published by this repository.</p>
      </>}
      {activeTab === 'local' && <>
        <div className="plugin-local-import">
          <div><strong>Import from a folder</strong><small>Select a plugin folder containing <code>arc-plugin.json</code>. WebAssembly adapters also need <code>adapter.wasm</code>.</small></div>
          <label className={`plugin-local-import-button ${!canInstall || importingLocal ? 'is-disabled' : ''}`}>
            <FolderOpen size={14} />{importingLocal ? 'Reading…' : 'Choose folder'}
            <input type="file" multiple directory="" webkitdirectory="" disabled={!canInstall || importingLocal} onChange={importLocalFolder} aria-label="Import plugin folder" />
          </label>
        </div>
        <div className="plugin-store-notice"><AlertTriangle size={13} />Install only plugins from sources and publishers you trust.</div>
        {error && <p className="plugin-store-error">{error}</p>}
      </>}
      </div>
    </aside>}

    <Modal isOpen={Boolean(settingsPlugin)} onClose={() => !settingsSaving && setSettingsPlugin(null)} title={`${settingsPlugin?.name || 'Plugin'} settings`} subtitle="Saved securely for the active project" icon={Settings2}>
      <div className="plugin-project-settings">
        {(pluginSettings.schema || []).map((field) => <div className="plugin-project-setting" key={field.id}>
          {field.type !== 'boolean' && <span>{field.label}{field.required && <b>Required</b>}</span>}
          {field.type === 'boolean'
            ? <Toggle label={field.label} checked={Boolean(pluginSettings.values?.[field.id] ?? field.defaultValue)} onChange={(value) => setPluginSettings((current) => ({ ...current, values: { ...current.values, [field.id]: value } }))} />
            : <input type={field.secret ? 'password' : field.type === 'number' ? 'number' : 'text'} min={field.min} max={field.max} autoComplete={field.secret ? 'new-password' : 'off'} value={pluginSettings.values?.[field.id] ?? field.defaultValue ?? ''} placeholder={field.secret && pluginSettings.values?.[`${field.id}Configured`] ? 'Saved - leave blank to keep' : field.secret ? 'Optional' : ''} onChange={(event) => setPluginSettings((current) => ({ ...current, values: { ...current.values, [field.id]: event.target.value } }))} />}
          {field.secret && <small>Encrypted on this workspace and never shown again.</small>}
          {field.secret && pluginSettings.values?.[`${field.id}Configured`] && !clearPluginSecrets.includes(field.id) && <button type="button" className="plugin-store-license-link" onClick={() => setClearPluginSecrets((current) => [...current, field.id])}>Remove saved {field.label.toLowerCase()}</button>}
          {field.secret && clearPluginSecrets.includes(field.id) && <small>Saved {field.label.toLowerCase()} will be removed when you save.</small>}
        </div>)}
        {settingsError && <p className="plugin-store-error">{settingsError}</p>}
        <div className="plugin-confirm-actions"><Button variant="secondary" disabled={settingsSaving} onClick={() => setSettingsPlugin(null)}>Cancel</Button><Button loading={settingsSaving} disabled={!canInstall} onClick={savePluginSettings}>Save for project</Button></div>
      </div>
    </Modal>

    <Modal isOpen={Boolean(selectedNotices)} onClose={() => setSelectedNotices(null)} title="Third-party licenses" subtitle={selectedNotices?.name || 'Plugin'} icon={ShieldCheck}>
      <div className="plugin-license-notices">
        {selectedNotices?.notices?.map((notice, index) => {
          const license = licenseDetails(notice.license);
          return <section key={`${notice.name}-${notice.version}-${index}`}>
            <strong>{notice.name}{notice.version ? ` ${notice.version}` : ''}</strong>
            <span>{license.expression}</span>
            {license.includedText && <small>Included license text: {license.includedText}</small>}
            {notice.notice && <pre>{notice.notice}</pre>}
            <a href={notice.sourceUrl} target="_blank" rel="noreferrer">View license source <ExternalLink size={12} /></a>
          </section>;
        })}
      </div>
    </Modal>

    <Modal isOpen={repositoryModalOpen} onClose={() => { if (repositorySaving) return; setRepositoryModalOpen(false); setConfirmRepository(false); setRepositoryTrust(false); }} title={confirmRepository ? 'Trust this plugin source?' : 'Plugin repository'} subtitle="Choose where ARC Studio reads its plugin catalog" icon={confirmRepository ? ShieldCheck : Settings2}>
      {!confirmRepository ? <>
        <TextInput label="Repository URL" value={repositoryDraft} onChange={(event) => setRepositoryDraft(event.target.value)} placeholder="https://github.com/owner/repository" error={repositoryError} helper="Public HTTPS repositories on github.com and gitlab.com are supported." autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        {repositoryErrorMessage && <p className="plugin-store-error">{repositoryErrorMessage}</p>}
        <div className="plugin-trust-warning"><AlertTriangle size={15} /><span>Changing the source repository is not recommended unless you know what you’re doing. Its maintainers control the catalog, and ARC does not review or verify its plugins. The recommended source is relentiousdragon/arc-plugins.</span></div>
        <div className="plugin-confirm-actions"><Button variant="secondary" onClick={() => setRepositoryModalOpen(false)}>Cancel</Button><Button disabled={!canManageSource || !repositoryChanged || Boolean(repositoryError) || !repositoryDraft.trim()} onClick={() => { setError(''); setRepositoryErrorMessage(''); setConfirmRepository(true); }}>Review source</Button></div>
      </> : <>
        <div className="plugin-trust-summary"><strong>{repositoryDraft.trim()}</strong><span>ARC will read registry.json from this repository’s main branch. Plugin packs remain pinned to a commit and checked against their SHA-256 digest.</span></div>
        {repositoryErrorMessage && <p className="plugin-store-error">{repositoryErrorMessage}</p>}
        <div className="plugin-trust-warning"><AlertTriangle size={15} /><span>Continue only if you trust this repository’s owners and the authors of its plugins. Catalog entries and updates come from them; installed packs can add or replace function graphs.</span></div>
        <Toggle label="I trust this repository and its maintainers" description="Only public GitHub and GitLab repository URLs are accepted." checked={repositoryTrust} onChange={setRepositoryTrust} />
        <div className="plugin-confirm-actions"><Button variant="secondary" onClick={() => setConfirmRepository(false)}>Back</Button><Button loading={repositorySaving} disabled={!canManageSource || !repositoryChanged || Boolean(repositoryError) || !repositoryTrust} onClick={saveRepository}>Save trusted source</Button></div>
      </>}
    </Modal>

    <Modal isOpen={Boolean(confirmAction)} onClose={() => !busyId && setConfirmAction(null)} title={confirmAction?.permissionReviewOnly ? 'Plugin permissions' : 'Review plugin install'} subtitle={confirmAction?.permissionReviewOnly ? 'Choose the capabilities granted in this project' : 'Check the publisher before continuing'} icon={ShieldCheck} showScrollCue footer={<><Button variant="secondary" disabled={Boolean(busyId)} onClick={() => setConfirmAction(null)}>Cancel</Button><Button loading={Boolean(busyId)} disabled={(!confirmAction?.permissionReviewOnly && !confirmTrust) || (!confirmAction?.permissionReviewOnly && hostRuntimeConfirmationRequired && !hostRuntimeAcknowledged) || !canInstall} onClick={confirmInstall}>{confirmAction?.permissionReviewOnly ? 'Save permissions' : localImport ? 'Import plugin' : 'Install plugin'}</Button></>}>
      {error && <p className="plugin-store-error">{error}</p>}
      <div className="plugin-trust-summary"><strong>{confirmationPlugin?.name || localImport?.name}</strong><span>{confirmationPlugin?.id || localImport?.pack?.id} · v{confirmationPlugin?.version || localImport?.version}</span><span>Requires ARC Studio {confirmationPlugin?.minArcStudioVersion || localImport?.pack?.minArcStudioVersion} or newer</span>{(confirmationPlugin?.author || localImport?.pack?.author) && <span>Publisher: {confirmationPlugin?.author || localImport?.pack?.author}</span>}<span>{localImport ? 'Local folder import · source is unverified' : confirmationPlugin?.sourceTrust === 'local' ? 'Local development checkout' : confirmationPlugin?.sourceTrust === 'default' ? 'Default ARC plugin source' : confirmationPlugin?.sourceTrust === 'bundled' || confirmationPlugin?.builtIn ? 'Bundled with ARC Studio' : 'Outside the default plugin source'}</span><a href={confirmationSource?.startsWith('http') ? confirmationSource : undefined} target="_blank" rel="noreferrer">{confirmationSource}</a></div>
      <div className="plugin-trust-warning"><AlertTriangle size={15} /><span>{hostRuntimeConfirmationRequired ? `${confirmationPlugin?.sourceTrust === 'default' ? `${defaultCatalogTrustText('host-adapter')} ` : ''}This adapter and its dependencies run as server code with the workspace server account’s OS access. ARC does not sandbox them. npm install scripts are disabled. Only install code from a publisher you trust.` : isBundledPlugin ? 'This integration runs in the ARC server. Its host permissions are enforced per project and per database operation.' : localImport ? 'This local plugin has no verified publisher or source. Its WebAssembly module is isolated, but review its manifest, source and digest before installing.' : isUntrustedSource ? 'This plugin is from a non-default source. ARC has not reviewed or verified the publisher. Its pack digest only confirms that the downloaded file matches this catalogue entry.' : defaultCatalogTrustText(confirmationPlugin?.kind || localImport?.pack?.kind)}</span></div>
      {!confirmAction?.permissionReviewOnly && (confirmationNpmDependencies.length > 0 || confirmationRuntimeDependencies.length > 0) && <section className="plugin-dependency-review" aria-label="Plugin runtime dependencies">
        <strong>Runtime dependencies</strong>
        <p>Installed with this adapter. Package install scripts are disabled.</p>
        <ul>{confirmationNpmDependencies.map(({ name, version }) => <li key={name}><code title={`${name}@${version}`}>{name}</code><span>{version}</span></li>)}{confirmationRuntimeDependencies.map((name) => <li key={`arc-${name}`}><code title={name}>{name}</code><span>Included with ARC</span></li>)}</ul>
        {confirmationNpmDependencies.length > 0 && <small>{confirmationPlugin?.dependencyPackageCount || confirmationNpmDependencies.length} locked npm packages including dependencies</small>}
      </section>}
      {confirmationPermissions.length > 0 && <section className="plugin-permission-review" aria-label="Plugin permissions">
        <strong>Permissions for this project</strong>
        <p>Only the selected capabilities are enabled. The project owner or a workspace admin must grant access.</p>
        {confirmationPermissions.map((permission) => <Toggle key={permission.id} label={permission.name} description={permission.description} checked={permissionSelection.includes(permission.id)} onChange={(checked) => setPermissionSelection((current) => checked ? [...new Set([...current, permission.id])] : current.filter((id) => id !== permission.id))} />)}
      </section>}
      {!confirmationPlugin?.builtIn && !['host-adapter', 'wasm-adapter'].includes(confirmationPlugin?.kind) && <Toggle label="Automatically install future catalog updates" description="Eligible data-pack updates are checked every 5 minutes. Adapter code updates always require manual review." checked={confirmAutoUpdate} onChange={setConfirmAutoUpdate} />}
      {hostRuntimeConfirmationRequired && !confirmAction?.permissionReviewOnly && <Toggle label="I understand and trust this server runtime" description="This permission cannot be limited to the plugin’s declared capabilities. Code updates always require another manual install review." checked={hostRuntimeAcknowledged} onChange={setHostRuntimeAcknowledged} />}
      {!confirmAction?.permissionReviewOnly && <Toggle label="I trust this plugin and its source" checked={confirmTrust} onChange={setConfirmTrust} />}
    </Modal>
  </>;
}
