import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Github, Keyboard, RotateCcw, Scale } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Toggle, SelectInput, TextInput } from '../ui/Inputs.jsx';
import { Button } from '../ui/Button.jsx';
import { arcEvents } from '../../core/ArcEvents.js';
import { DEFAULT_SHORTCUTS, formatShortcut, getDefaultShortcut, getShortcutReservation, normalizeShortcutBinding, shortcutFromEvent } from '../../core/shortcuts.js';
import { apiUrl } from '../../core/api.js';
import studioPackage from '../../../package.json';
import chezcordPackage from '../../../../chezcord/package.json';
//
const tabs = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'interface', label: 'Interface' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'discord', label: 'Discord RPC' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'logs', label: 'Logs' },
  { id: 'data', label: 'Local data' },
  { id: 'about', label: 'About' }
];
const shortcutActions = [
  ['newGraph', 'New graph'],
  ['newBlankGraph', 'New blank graph'],
  ['switchTabNext', 'Next graph tab'],
  ['switchTabPrevious', 'Previous graph tab'],
  ['closeTab', 'Close active graph tab'],
  ['connectGateway', 'Connect / disconnect gateway'],
  ['renameNode', 'Rename selected node'],
  ['reloadStudio', 'Reload ARC Studio'],
  ['toggleConsole', 'Toggle server console'],
  ['addNode', 'Add node'],
  ['arrangeNodes', 'Arrange nodes'],
  ['toggleLibrary', 'Toggle Library'],
  ['openSearch', 'Open node search'],
  ['addNote', 'Add note'],
  ['emojiPicker', 'Open emoji picker'],
  ['exportBot', 'Export bot'],
  ['saveGraph', 'Save graph'],
  ['undo', 'Undo'],
  ['redo', 'Redo']
];

function openExternal(event) {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function') return;
  event.preventDefault();
  invoke('open_external_url', { url: event.currentTarget.href }).catch(() => {});
}

export function EditorSettingsModal({ isOpen, onClose, settings, onUpdateSettings, onAutoLayout, onExportGraph, onResetLocalData, themeChoice = 'system', onThemeChange, desktopMode = false, localWorkspace = false, externalWorkspace = false, canResetLocalWorkspace = false, canManageClientAccess = false, platform = '', appUpdate = null, serverUpdate = null, stableUpdateReady = null, downloadedUpdateReady = null, updateInstalling = false, releaseChannel = 'stable', onOpenStudioUpdate, networkOnline = true, authToken = '', activeProjectId = '', canManageLogRetention = false, canManageActivityWebhook = false, idleDisconnectMinutes = 15, canManageIdleDisconnect = false, onSetIdleDisconnectMinutes }) {
  const [activeTab, setActiveTab] = useState('canvas');
  const [recording, setRecording] = useState(null);
  const [shortcutCaptureError, setShortcutCaptureError] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetPending, setResetPending] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [logRetention, setLogRetention] = useState('default');
  const [logRetentionMessage, setLogRetentionMessage] = useState('');
  const [activityWebhookStatus, setActivityWebhookStatus] = useState({ configured: false, enabled: false, environmentConfigured: false, source: 'none' });
  const [activityWebhookUrl, setActivityWebhookUrl] = useState('');
  const [activityWebhookMessage, setActivityWebhookMessage] = useState('');
  const [activityWebhookLoading, setActivityWebhookLoading] = useState(false);
  const [activityWebhookSaving, setActivityWebhookSaving] = useState(false);
  const [allowUnknownClients, setAllowUnknownClients] = useState(false);
  const [clientAccessLoading, setClientAccessLoading] = useState(false);
  const [clientAccessSaving, setClientAccessSaving] = useState(false);
  const [clientAccessMessage, setClientAccessMessage] = useState('');
  const update = (key, value) => onUpdateSettings({ ...settings, [key]: value });
  const shortcuts = { ...DEFAULT_SHORTCUTS, redo: getDefaultShortcut('redo', platform), ...(settings.shortcuts || {}) };
  if (!settings.shortcuts?.redo || settings.shortcuts.redo === DEFAULT_SHORTCUTS.redo) shortcuts.redo = getDefaultShortcut('redo', platform);
  const confirmLocalReset = async () => {
    if (resetPending || !resetPassword || !canResetLocalWorkspace) return;
    setResetPending(true);
    setResetError('');
    try { await onResetLocalData?.(resetPassword); }
    catch (error) {
      setResetError(typeof error === 'string' ? error : error?.message || 'Could not reset local data.');
      setResetPending(false);
      setConfirmResetOpen(false);
    }
  };

  useEffect(() => {
    if (!recording || !isOpen) return undefined;
    const onKeyDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { setRecording(null); setShortcutCaptureError(''); return; }
      const binding = shortcutFromEvent(event);
      if (!binding) return;
      const reservation = getShortcutReservation(binding, platform);
      if (reservation) { setShortcutCaptureError(reservation); return; }
      const normalizedBinding = normalizeShortcutBinding(binding, platform);
      const conflicts = shortcutActions.filter(([key]) => key !== recording && shortcuts[key] && normalizeShortcutBinding(shortcuts[key], platform) === normalizedBinding);
      const nextShortcuts = { ...shortcuts, [recording]: binding };
      conflicts.forEach(([key]) => { nextShortcuts[key] = ''; });
      update('shortcuts', nextShortcuts);
      setRecording(null);
      setShortcutCaptureError(conflicts.length
        ? `Shortcut moved from ${conflicts.map(([key, label]) => `“${label}”`).join(', ')}.`
        : '');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, isOpen, settings, platform]);

  useEffect(() => {
    if (!isOpen) { setRecording(null); setShortcutCaptureError(''); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'logs' || !authToken) return undefined;
    let active = true;
    fetch(apiUrl('/api/projects/log-retention'), { headers: { 'x-arc-token': authToken } }).then((response) => response.json()).then((data) => {
      if (active) setLogRetention(data.retentionDays == null ? 'default' : String(data.retentionDays));
    }).catch(() => { if (active) setLogRetentionMessage('Could not load this project’s retention setting.'); });
    return () => { active = false; };
  }, [isOpen, activeTab, authToken, activeProjectId]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'collaboration' || !authToken || !externalWorkspace || !canManageClientAccess) return undefined;
    if (!networkOnline) { setClientAccessMessage('Connect to the workspace to load this setting.'); return undefined; }
    let active = true;
    setClientAccessLoading(true);
    fetch(apiUrl('/api/client-access'), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load client access settings.');
        if (active) { setAllowUnknownClients(data.allowUnknownClients === true); setClientAccessMessage(''); }
      })
      .catch((error) => { if (active) setClientAccessMessage(error.message || 'Could not load client access settings.'); })
      .finally(() => { if (active) setClientAccessLoading(false); });
    return () => { active = false; };
  }, [isOpen, activeTab, authToken, externalWorkspace, canManageClientAccess, networkOnline]);

  const saveClientAccess = async (allow) => {
    setClientAccessSaving(true);
    setClientAccessMessage('Saving…');
    try {
      const response = await fetch(apiUrl('/api/client-access'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ allowUnknownClients: allow })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save client access settings.');
      setAllowUnknownClients(data.allowUnknownClients === true);
      setClientAccessMessage(data.allowUnknownClients ? 'Unknown clients are allowed.' : 'Only ARC Studio clients are allowed.');
    } catch (error) { setClientAccessMessage(error.message || 'Could not save client access settings.'); }
    finally { setClientAccessSaving(false); }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'logs' || !authToken || !canManageActivityWebhook || (desktopMode && localWorkspace)) return undefined;
    if (!networkOnline) { setActivityWebhookMessage('Connect to the workspace to load webhook settings.'); return undefined; }
    let active = true;
    setActivityWebhookLoading(true);
    fetch(apiUrl('/api/activity-webhook/settings'), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load activity webhook settings.');
        if (active) { setActivityWebhookStatus(data); setActivityWebhookMessage(''); }
      })
      .catch((error) => { if (active) setActivityWebhookMessage(error.message || 'Could not load activity webhook settings.'); })
      .finally(() => { if (active) setActivityWebhookLoading(false); });
    return () => { active = false; };
  }, [isOpen, activeTab, authToken, activeProjectId, canManageActivityWebhook, desktopMode, localWorkspace, networkOnline]);

  const saveActivityWebhookSettings = async (changes) => {
    setActivityWebhookSaving(true);
    setActivityWebhookMessage('Saving…');
    try {
      const response = await fetch(apiUrl('/api/activity-webhook/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify(changes)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save activity webhook settings.');
      setActivityWebhookStatus(data);
      setActivityWebhookMessage('Saved.');
      if (Object.hasOwn(changes, 'url') || changes.clearUrl) setActivityWebhookUrl('');
    } catch (error) {
      setActivityWebhookMessage(error.message || 'Could not save activity webhook settings.');
    } finally {
      setActivityWebhookSaving(false);
    }
  };

  const saveLogRetention = async (value) => {
    setLogRetention(value);
    setLogRetentionMessage('Saving…');
    try {
      const response = await fetch(apiUrl('/api/projects/log-retention'), { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ retentionDays: value === 'default' ? null : value === 'forever' ? 'forever' : Number(value) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the retention setting.');
      setLogRetentionMessage(`Saved · ${data.effectiveRetentionDays === 'forever' || Number(data.effectiveRetentionDays) === 0 ? 'kept forever' : `kept ${data.effectiveRetentionDays} days`}`);
    } catch (error) { setLogRetentionMessage(error.message || 'Could not save the retention setting.'); }
  };

  return <Modal isOpen={isOpen} onClose={onClose} title="Editor settings" subtitle="Customize your workspace" panelClassName="modal-editor-settings">
    <div className="settings-tabs" role="tablist" aria-label="Editor settings sections">
      {tabs.map((tab) => {
        const disabled = (tab.id === 'shortcuts' || tab.id === 'discord' || tab.id === 'data') && !desktopMode;
        return <button key={tab.id} type="button" role="tab" aria-selected={!disabled && activeTab === tab.id} aria-disabled={disabled || undefined} disabled={disabled} className={`settings-tab ${activeTab === tab.id && !disabled ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`} onClick={() => !disabled && setActiveTab(tab.id)}>{tab.label}{tab.id === 'about' && serverUpdate && <span className="update-indicator-dot" aria-label="Server update available" />}</button>;
      })}
    </div>

    {activeTab === 'canvas' && <div className="settings-section settings-tab-content">
      <div className="settings-section-heading"><span>Canvas behavior</span></div>
      <SelectInput label="Canvas quality" value={['auto', 'fast', 'optimal', 'quality'].includes(settings.canvasQuality) ? settings.canvasQuality : 'auto'} options={[{ value: 'auto', label: 'Auto' }, { value: 'fast', label: 'Fast' }, { value: 'optimal', label: 'Optimal' }, { value: 'quality', label: 'Quality' }]} onChange={(value) => update('canvasQuality', value)} />
      <Toggle label="Snap to grid" description="Align nodes while dragging" checked={settings.snapToGrid ?? true} onChange={(value) => update('snapToGrid', value)} />
      <Toggle label="Zoom with mouse wheel" description="Zoom the canvas without holding Ctrl or ⌘" checked={settings.zoomCanvasWithScroll ?? false} onChange={(value) => update('zoomCanvasWithScroll', value)} />
      <Toggle label="Right-click to pan canvas" description="Drag with right-click to move the canvas and use left-click for its context menu" checked={settings.canvasRightClickPan ?? false} onChange={(value) => update('canvasRightClickPan', value)} />
      <Toggle label="Canvas grid" description="Show the canvas dot pattern" checked={settings.showGrid ?? true} onChange={(value) => update('showGrid', value)} />
      <Toggle label="Execution pulse" description="Animate active connections" checked={settings.wirePulse ?? true} onChange={(value) => update('wirePulse', value)} />
      <Toggle label="Magnetic sockets" description="Assist wire placement near pins" checked={settings.magneticSnap ?? true} onChange={(value) => update('magneticSnap', value)} />
      <Toggle label="Always show socket hints" description="Show the socket’s purpose whenever you hover it" checked={settings.pinDescriptionsAlways ?? false} onChange={(value) => update('pinDescriptionsAlways', value)} />
      <Toggle label="Double-click wires to cut" description="Use a single click to pick up and reroute a wire" checked={settings.doubleClickWireToCut ?? false} onChange={(value) => update('doubleClickWireToCut', value)} />
      <SelectInput label="Connection style" value={settings.wireStyle || 'bezier'} options={[{ value: 'bezier', label: 'Bezier' }, { value: 'straight', label: 'Straight' }]} onChange={(value) => update('wireStyle', value)} />
      <Toggle label="Reduce motion" description="Use shorter transitions and disable decorative animation" checked={settings.reduceMotion ?? false} onChange={(value) => update('reduceMotion', value)} />
      <SelectInput label="UI scale" value={String(settings.uiScale || '100')} options={['80', '90', '100', '110', '120', '130', '140'].map((value) => ({ value, label: `${value}%` }))} onChange={(value) => update('uiScale', value)} />
      <small className="settings-shortcut-hint">{platform === 'macos' ? '⌘' : 'Ctrl'} + / − adjusts scale</small>
      <SelectInput label="Font scale" value={String(settings.fontScale || '100')} options={['80', '90', '100', '110', '120', '130', '140'].map((value) => ({ value, label: `${value}%` }))} onChange={(value) => update('fontScale', value)} />
    </div>}

    {activeTab === 'interface' && <div className="settings-section settings-tab-content">
      <div className="settings-section-heading"><span>Appearance and interaction</span></div>
      <SelectInput label="Color theme" value={themeChoice} options={[{ value: 'system', label: 'Use system setting' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} onChange={onThemeChange} />
      <Toggle label="Interface sounds" description="Play subtle sounds for controls and notifications" checked={settings.uiSounds ?? false} onChange={(value) => update('uiSounds', value)} />
      <Toggle label="Compact context menus" description="Use tighter spacing in right-click menus" checked={settings.compactContextMenus ?? false} onChange={(value) => update('compactContextMenus', value)} />
    </div>}

    {activeTab === 'collaboration' && <div className="settings-section settings-tab-content">
      <div className="settings-section-heading"><span>Graph synchronization</span></div>
      {localWorkspace ? <>
        <p className="settings-description">Graphs save to this computer automatically. Live collaboration is not used in Local Workspace.</p>
        <Toggle label="Auto-save graphs" description="Persist unsaved graph changes automatically." checked={settings.autoSave !== false} onChange={(value) => update('autoSave', value)} />
        <div className="settings-snapshot-options" aria-disabled={settings.autoSave === false} style={{ opacity: settings.autoSave === false ? .48 : 1, pointerEvents: settings.autoSave === false ? 'none' : 'auto' }}>
          <SelectInput label="Save interval" value={String(settings.autoSaveIntervalSeconds ?? 30)} options={[
            ['5', '5 seconds'], ['15', '15 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes'], ['300', '5 minutes']
          ].map(([value, label]) => ({ value, label }))} onChange={(value) => update('autoSaveIntervalSeconds', Number(value))} />
        </div>
      </> : <p className="settings-description">The workspace server saves live graph changes and keeps them available after a reconnect.</p>}
      {!desktopMode || !localWorkspace ? <>
        <div className="settings-section-heading"><span>Idle sessions</span></div>
        {canManageIdleDisconnect
          ? <SelectInput label="Disconnect after inactivity" value={String(idleDisconnectMinutes)} options={[
            ['0', 'Never'], ['1', '1 minute'], ['5', '5 minutes'], ['10', '10 minutes'], ['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['120', '2 hours'], ['240', '4 hours'], ['480', '8 hours'], ['1440', '24 hours']
          ].map(([value, label]) => ({ value, label }))} onChange={(value) => onSetIdleDisconnectMinutes?.(Number(value))} />
          : <p className="settings-description">{idleDisconnectMinutes === 0 ? 'This project does not sign users out for inactivity.' : `This project signs users out after ${idleDisconnectMinutes} minute${idleDisconnectMinutes === 1 ? '' : 's'} of inactivity.`}</p>}
        <small className="settings-shortcut-hint">Project owners and workspace admins can change this.</small>
      </> : <p className="settings-description">Local Workspace is exempt from idle disconnects.</p>}
      {!networkOnline && <small className="settings-shortcut-hint">Live collaboration pauses while this device is offline. The workspace keeps the last graph state it received.</small>}
      {externalWorkspace && canManageClientAccess && <>
        <div className="settings-section-heading"><span>Client access</span></div>
        <Toggle label="Allow unknown clients" description="Allows other compatible clients to connect." checked={allowUnknownClients} disabled={clientAccessLoading || clientAccessSaving || !networkOnline} onChange={saveClientAccess} />
        {clientAccessMessage && <small className="settings-shortcut-hint" role="status">{clientAccessMessage}</small>}
      </>}
      <div className="settings-section-heading"><span>Automatic snapshots</span></div>
      <Toggle label="Automatic snapshots" description="Checkpoint open graphs while you work. Unchanged graphs are skipped." checked={settings.autoSnapshots !== false} onChange={(value) => update('autoSnapshots', value)} />
      <div className="settings-snapshot-options" aria-disabled={settings.autoSnapshots === false} style={{ opacity: settings.autoSnapshots === false ? .48 : 1, pointerEvents: settings.autoSnapshots === false ? 'none' : 'auto' }}>
        <SelectInput label="Interval" value={String(settings.snapshotIntervalMinutes ?? 30)} options={[
          ['10', '10 minutes'], ['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['120', '2 hours'], ['240', '4 hours'], ['480', '8 hours'], ['720', '12 hours'], ['1440', '24 hours']
        ].map(([value, label]) => ({ value, label }))} onChange={(value) => update('snapshotIntervalMinutes', Number(value))} />
        <SelectInput label="Keep history" value={String(settings.snapshotRetentionHours ?? 12)} options={[
          ['12', '12 hours'], ['24', '1 day'], ['168', '7 days'], ['720', '30 days'], ['2160', '90 days'], ['4320', '180 days'], ['8760', '365 days'], ['0', 'Forever']
        ].map(([value, label]) => ({ value, label }))} onChange={(value) => update('snapshotRetentionHours', Number(value))} />
      </div>
    </div>}

    {activeTab === 'logs' && <div className="settings-section settings-tab-content">
      <div className="settings-section-heading"><span>Project logs</span></div>
      <p className="settings-description">Log files are stored with this project and pruned using the selected retention period.</p>
      {canManageLogRetention ? <SelectInput label="File retention" value={logRetention} options={[{ value: 'default', label: 'Global default' }, ...[1, 7, 14, 30, 90, 365].map((days) => ({ value: String(days), label: `${days} days` })), { value: 'forever', label: 'Keep forever' }]} onChange={saveLogRetention} /> : <p className="settings-description">Retention: {logRetention === 'default' ? 'Global default' : logRetention === 'forever' ? 'Kept forever' : `${logRetention} days`}</p>}
      <small className="settings-shortcut-hint">{canManageLogRetention ? (logRetentionMessage || 'The global default is set by LOG_RETENTION_DAYS.') : 'Only a workspace owner can change log retention.'}</small>
      {(!desktopMode || !localWorkspace) && <>
        <div className="settings-section-heading settings-activity-heading"><span>Discord activity log</span></div>
        {canManageActivityWebhook ? <>
          <p className="settings-description">Send account, project, graph, embed, and plugin activity to a Discord channel.</p>
          {activityWebhookLoading ? <p className="settings-description">Loading webhook settings…</p> : <>
            <Toggle
              label="Send activity to Discord"
              description={!activityWebhookStatus.configured ? 'Add a Discord webhook URL to start delivery.' : activityWebhookStatus.source === 'environment' ? 'Using the server environment webhook.' : undefined}
              checked={activityWebhookStatus.enabled}
              disabled={activityWebhookSaving || !networkOnline}
              onChange={(enabled) => {
                if (enabled && !activityWebhookStatus.configured) {
                  setActivityWebhookMessage('Add a webhook URL before enabling activity delivery.');
                  document.getElementById('activity-webhook-url')?.focus();
                  return;
                }
                saveActivityWebhookSettings({ enabled });
              }}
            />
            <TextInput
              id="activity-webhook-url"
              label="Webhook URL"
              type="url"
              value={activityWebhookUrl}
              maxLength={2048}
              placeholder="https://discord.com/api/webhooks/…"
              onChange={(event) => setActivityWebhookUrl(event.target.value)}
              disabled={activityWebhookSaving || !networkOnline}
              helper={activityWebhookStatus.configured ? 'Enter a Discord webhook URL to change the current destination.' : 'Add a Discord webhook URL for activity logs.'}
            />
            <div className="settings-shortcut-actions">
              <small>{activityWebhookMessage || (activityWebhookStatus.configured ? `Configured from ${activityWebhookStatus.source === 'environment' ? 'the server environment' : 'workspace settings'}.` : 'No webhook is configured.')}</small>
              <div className="settings-shortcut-actions-buttons">
                <Button size="sm" onClick={() => saveActivityWebhookSettings({ url: activityWebhookUrl })} disabled={!activityWebhookUrl.trim() || activityWebhookSaving || !networkOnline} loading={activityWebhookSaving}>{activityWebhookStatus.configured ? 'Update webhook' : 'Add webhook'}</Button>
                {activityWebhookStatus.source === 'workspace' && <Button size="sm" variant="secondary" onClick={() => saveActivityWebhookSettings({ clearUrl: true })} disabled={activityWebhookSaving || !networkOnline}>{activityWebhookStatus.environmentConfigured ? 'Use server URL' : 'Remove webhook'}</Button>}
              </div>
            </div>
          </>}
        </> : <p className="settings-description">Discord activity delivery is managed by the primary workspace owner.</p>}
      </>}
    </div>}

    {activeTab === 'discord' && desktopMode && <div className="settings-section settings-tab-content">
      <div className="settings-section-heading"><span>Discord Rich Presence</span></div>
      <Toggle label="Show ARC Studio on Discord" description="Share what you’re working on in your Discord activity." checked={settings.discordRpcEnabled !== false} onChange={(value) => update('discordRpcEnabled', value)} />
      <div className="settings-section-heading settings-rpc-privacy-heading"><span>Privacy</span></div>
      <Toggle label="Hide workspace name" description="Use a generic workspace label in your Discord activity." checked={settings.discordRpcRedactWorkspace ?? false} onChange={(value) => update('discordRpcRedactWorkspace', value)} />
      <Toggle label="Hide project name" description="Do not show the current project name." checked={settings.discordRpcRedactProject ?? false} onChange={(value) => update('discordRpcRedactProject', value)} />
      <Toggle label="Hide graph name" description="Use a generic activity instead of the active graph name." checked={settings.discordRpcRedactGraph ?? false} onChange={(value) => update('discordRpcRedactGraph', value)} />
      <Toggle label="Hide bot name" description="Do not include the connected Discord bot’s name." checked={settings.discordRpcRedactBot ?? false} onChange={(value) => update('discordRpcRedactBot', value)} />
    </div>}

    {activeTab === 'shortcuts' && desktopMode && <div className="settings-section settings-tab-content settings-shortcuts-content">
      <div className="settings-shortcuts-intro"><Keyboard size={17} /><div><strong>Keyboard shortcuts</strong><span>Choose a shortcut, then press the keys you want to use.</span></div></div>
      <div className="settings-shortcut-editor">{shortcutActions.filter(([key]) => key !== 'arrangeNodes' || localWorkspace).map(([key, label]) => <div className="settings-shortcut-row" key={key}><span>{label}</span><button type="button" className={`settings-shortcut-record ${recording === key ? 'is-recording' : ''}`} onClick={() => { setShortcutCaptureError(''); setRecording(key); }} aria-label={`Change shortcut for ${label}`}>{recording === key ? 'Press keys…' : shortcuts[key] ? formatShortcut(shortcuts[key], platform) : 'Unassigned'}</button></div>)}</div>
      <div className="settings-shortcut-gesture"><strong>Canvas find</strong><span>{platform === 'macos' ? '⌘F' : 'Ctrl+F'} opens the active sidebar search when one is open, otherwise it finds on the canvas. {platform === 'macos' ? '⌘G' : 'Ctrl+G'} and {platform === 'macos' ? '⌘⇧G' : 'Ctrl+Shift+G'} move through results.</span></div>
      <div className="settings-shortcut-gesture"><strong>Collaborative arrows</strong><span>Hold {platform === 'macos' ? 'Option' : 'Alt'} and Shift, then drag on the canvas. Arrows fade after 10 seconds unless you keep them.</span></div>
      <div className="settings-shortcut-gesture"><strong>Colored sections</strong><span>Hold {platform === 'macos' ? 'Option' : 'Alt'} and drag a node to move it between sections. It stays grouped while inside; drag it fully outside to remove it. The section won’t stretch to follow the node.</span></div>
      {shortcutCaptureError && <p className="field-error" role="alert">{shortcutCaptureError}</p>}
      <div className="settings-shortcut-actions"><small>Shortcuts are saved on this device. Press Esc while recording to cancel.</small><Button variant="secondary" onClick={() => update('shortcuts', { ...DEFAULT_SHORTCUTS, redo: getDefaultShortcut('redo', platform) })}>Restore defaults</Button></div>
    </div>}

    {activeTab === 'data' && desktopMode && <div className="settings-section settings-tab-content">
      <div className="settings-section-heading"><span>Reset Local Workspace</span></div>
      <p className="settings-danger-copy">This removes local projects, graphs, credentials, plugins, snapshots, and editor settings, then restarts ARC Studio.</p>
      {!localWorkspace && <p className="settings-danger-copy">Switch to Local Workspace to reset its data.</p>}
      {localWorkspace && !canResetLocalWorkspace && <p className="settings-danger-copy">Only the Local Workspace owner can delete its data.</p>}
      <form className="settings-reset-form" onSubmit={(event) => {
        event.preventDefault();
        if (!resetPassword || resetPending || !localWorkspace || !canResetLocalWorkspace) return;
        setResetError('');
        setConfirmResetOpen(true);
      }}>
        <TextInput label="ARC Studio password" type="password" autoComplete="current-password" value={resetPassword} onChange={(event) => { setResetPassword(event.target.value); setResetError(''); }} disabled={!canResetLocalWorkspace || resetPending} error={resetError} />
        <Button type="submit" variant="danger" icon={RotateCcw} loading={resetPending} disabled={!canResetLocalWorkspace || !resetPassword || resetPending}>Delete all local data</Button>
      </form>
      <Modal isOpen={confirmResetOpen} onClose={() => !resetPending && setConfirmResetOpen(false)} onConfirm={confirmLocalReset} title="Delete all Local Workspace data?" subtitle="This cannot be undone." icon={AlertTriangle} footer={<><Button variant="secondary" disabled={resetPending} onClick={() => setConfirmResetOpen(false)}>Cancel</Button><Button variant="danger" icon={RotateCcw} loading={resetPending} onClick={confirmLocalReset}>Delete everything</Button></>}>
        <p className="settings-danger-copy">This deletes every local project and its graphs, bot tokens, credentials, plugins, snapshots, variables, and editor settings. Projects without a backup somewhere else will be lost permanently.</p>
        <p className="settings-danger-copy">ARC Studio will restart and return to first-time setup.</p>
      </Modal>
    </div>}
    {activeTab === 'about' && <div className="settings-section settings-tab-content settings-about-content">
      <div className="settings-about-brand">
        <img src="/arc.png" alt="" />
        <div><strong>ARC Studio</strong><span>Discord bot creator</span></div>
        <div className="settings-about-versions" aria-label="Software versions">
          <span>ARC Studio <code>v{studioPackage.version}</code></span>
          <span>Chezcord <code>v{chezcordPackage.version}</code></span>
        </div>
      </div>
      <section className="settings-about-section" aria-labelledby="about-updates-heading">
        <h3 id="about-updates-heading">Updates{serverUpdate && <span className="update-indicator-dot" aria-label="Server update available" />}</h3>
        <Toggle label="Check for updates automatically" description={desktopMode ? 'Checks for ARC Studio releases when you’re online.' : undefined} checked={settings.autoUpdateChecks !== false} onChange={(value) => update('autoUpdateChecks', value)} />
        {desktopMode && <><div className="settings-about-credit"><strong>Release channel</strong><span>{releaseChannel === 'nightly' ? 'Nightly' : 'Stable'}</span></div></>}
        {serverUpdate && <a href={serverUpdate.url} target="_blank" rel="noreferrer" onClick={openExternal}><Download size={14} /><span>ARC Studio Server update · v{serverUpdate.version}</span><ExternalLink size={12} /></a>}
        {(downloadedUpdateReady || stableUpdateReady) && <div className="settings-update-explainer"><strong>ARC Studio v{downloadedUpdateReady?.version || stableUpdateReady.version} is ready</strong><span>It will be applied the next time you launch the app.</span></div>}
        {appUpdate?.native
          ? <button type="button" className="settings-about-update-button" disabled={updateInstalling} onClick={() => onOpenStudioUpdate?.(appUpdate.url)}><Download size={14} /><span>{updateInstalling ? 'Downloading update…' : `Install update · v${appUpdate.version}`}</span></button>
          : appUpdate ? <a href={appUpdate.url} target="_blank" rel="noreferrer" onClick={openExternal}><Download size={14} /><span>{`${appUpdate.kind === 'major' ? 'Major' : appUpdate.kind === 'feature' ? 'Feature' : 'Maintenance'} update · v${appUpdate.version}`}</span><ExternalLink size={12} /></a>
          : !serverUpdate && !stableUpdateReady && !downloadedUpdateReady && <div className="settings-about-credit"><strong>{networkOnline ? 'No updates available' : 'Update check when online'}</strong></div>}
      </section>
      <section className="settings-about-section" aria-labelledby="about-project-heading">
        <h3 id="about-project-heading">Project</h3>
        <a href="https://github.com/relentiousdragon/arc-studio" target="_blank" rel="noreferrer" onClick={openExternal}><Github size={14} /><span>ARC Studio on GitHub</span><ExternalLink size={12} /></a>
        <a href="https://github.com/relentiousdragon/arc-plugins" target="_blank" rel="noreferrer" onClick={openExternal}><Github size={14} /><span>Plugin repository</span><ExternalLink size={12} /></a>
      </section>
      <section className="settings-about-section" aria-labelledby="about-credits-heading">
        <h3 id="about-credits-heading">Credits</h3>
        <a href="https://github.com/relentiousdragon" target="_blank" rel="noreferrer" onClick={openExternal}><span className="settings-about-credit-name">@relentiousdragon</span><ExternalLink size={12} /></a>
        <a href="https://github.com/relentiousdragon/arc-studio/graphs/contributors" target="_blank" rel="noreferrer" onClick={openExternal}><span>View Contributors</span><ExternalLink size={12} /></a>
      </section>
      <section className="settings-about-license">
        <Scale size={15} />
        <div><strong>Apache License 2.0</strong><span>© 2026 relentiousdragon</span></div>
        <a href="https://github.com/relentiousdragon/arc-studio/blob/main/LICENSE" target="_blank" rel="noreferrer" onClick={openExternal} aria-label="View the Apache License 2.0"><ExternalLink size={13} /></a>
      </section>
    </div>}
  </Modal>;
}
