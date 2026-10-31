import React, { useEffect, useRef, useState } from 'react';
import { getArcUiScale } from '../../core/uiScale.js';
import { onPageBlur } from '../../core/pageFocus.js';
import { getContrastTextColor } from '../../core/colorContrast.js';
import {
  AlertCircle, AlertTriangle, ArrowLeftRight, Check, BookmarkPlus, Calculator, CircleAlert, ChevronDown, CircleUserRound, Copy, Download, FilePlus2, LockKeyhole, LogOut, Pencil, Sparkles, Star,
  LockOpen, Play, Redo2, Save, Settings2, Square, Undo2, Users, WifiOff, X
} from 'lucide-react';
//
const COLLABORATOR_COLORS = ['#63b3ed', '#f687b3', '#68d391', '#f6ad55', '#b794f4', '#4fd1c5', '#fc8181', '#90cdf4', '#fbd38d', '#9ae6b4'];
function getCollaboratorColor(userId) {
  let hash = 0;
  for (const char of String(userId || '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLLABORATOR_COLORS[(hash >>> 0) % COLLABORATOR_COLORS.length];
}
export function TopBar({
  tabs = [], graphTabStatuses = new Map(), projectCollaborators = [], activeTabId, saveFeedbackGraphId, hideGraphSave = false, botStatus = 'DISCONNECTED', botProfile, currentUser, graphTemplates = [], defaultGraphId = 'tab_slash_help',
  desktopMode = false, localWorkspace = false, workspaceLabel = '', activeProjectId = '', uploadProgress = null, shortcutPlatform = 'windows',
  isLocked = false, onToggleLock, onSelectTab, onFollowCollaborator,
  onAddTab, onAddBlankGraph, onAddFunctionGraph, onNewEmbed, onUseTemplate, onCloseTab, onSaveGraph, onRenameGraph, onDuplicateGraph, onSetDefault, onOpenSettings, onOpenUsers, onLogout,
  onOpenBotSettings, onStartBot, onStopBot, onUndo, onRedo, canUndo = false, canRedo = false, onValidate, validationStatus = 'warning', validationErrors = 0, validationWarnings = 0, onSwitchWorkspace, networkOnline = true, appUpdate = null, downloadedUpdateReady = null, updateInstalling = false, serverUpdateAvailable = false, onOpenStudioUpdate
}) {
  const [tabMenu, setTabMenu] = useState(null);
  const [newGraphMenu, setNewGraphMenu] = useState(null);
  const [brandExpanded, setBrandExpanded] = useState(true);
  const brandHovered = useRef(false);
  const tabMenuRef = useRef(null);
  const newGraphMenuRef = useRef(null);
  const uiScale = getArcUiScale();
  const shortcutModifier = shortcutPlatform === 'macos' ? '⌘' : 'Ctrl';
  const redoShortcut = shortcutPlatform === 'macos' ? `${shortcutModifier} + Shift + Z` : `${shortcutModifier} + Y`;
  const toggleWindowMaximize = () => {
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (desktopMode && typeof invoke === 'function') {
      invoke('plugin:window|toggle_maximize', { label: 'main' }).catch(() => {});
    }
  };
  const startWindowDragging = (event) => {
    if (!desktopMode || event.button !== 0) return;
    if (event.target.closest('button, input, a, select, textarea, [role="tab"], [role="menu"], .profile-menu, .graph-context-menu')) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke === 'function') invoke('plugin:window|start_dragging', { label: 'main' }).catch(() => {});
  };
  const handleTopbarDoubleClick = (event) => {
    if (event.target.closest('button, input, a, select, textarea, [role="tab"], [role="menu"]')) return;
    toggleWindowMaximize();
  };
  const connected = botStatus === 'ONLINE';
  const statusLabel = connected ? 'Connected' : botStatus === 'CONNECTING' ? 'Connecting' : botStatus === 'ERROR' ? 'Error' : 'Offline';
  const checkLabel = validationStatus === 'error'
    ? `Check graph · ${validationErrors} issue${validationErrors === 1 ? '' : 's'}`
    : validationStatus === 'warning'
      ? `Check graph · ${validationWarnings} warning${validationWarnings === 1 ? '' : 's'}`
      : 'Graph checks passed';
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeGraphUnsaved = graphTabStatuses.get(activeTabId)?.unsaved ?? Boolean(activeTab?.isDirty);
  const showSavedFeedback = Boolean(activeTabId && saveFeedbackGraphId === activeTabId && !activeGraphUnsaved);
  const profileInitial = !desktopMode || !localWorkspace ? Array.from(String(currentUser?.username || '').trim())[0]?.toLocaleUpperCase() : '';
  const peerColor = projectCollaborators.find((peer) => peer.userId === currentUser?.id)?.color;
  const profileColor = !profileInitial || !currentUser?.id
    ? ''
    : typeof peerColor === 'string' && /^#[\da-f]{6}$/i.test(peerColor) ? peerColor : getCollaboratorColor(currentUser.id);

  useEffect(() => {
    brandHovered.current = false;
    setBrandExpanded(true);
    const timer = window.setTimeout(() => {
      if (!brandHovered.current) setBrandExpanded(false);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, workspaceLabel]);

  useEffect(() => {
    if (!tabMenu && !newGraphMenu) return undefined;
    const close = (event) => {
      if (event.type === 'pointerdown' && event.target instanceof Node && tabMenuRef.current?.contains(event.target)) return;
      setTabMenu(null);
    };
    const closeNewGraph = (event) => {
      if (event.type === 'pointerdown' && event.target instanceof Node && newGraphMenuRef.current?.contains(event.target)) return;
      setNewGraphMenu(null);
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('pointerdown', closeNewGraph, true);
    document.addEventListener('keydown', close);
    document.addEventListener('keydown', closeNewGraph);
    const removePageBlurListener = onPageBlur(() => { setTabMenu(null); setNewGraphMenu(null); });
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('pointerdown', closeNewGraph, true);
      document.removeEventListener('keydown', close);
      document.removeEventListener('keydown', closeNewGraph);
      removePageBlurListener();
    };
  }, [tabMenu, newGraphMenu]);

  return (
    <header className="topbar" onMouseDown={startWindowDragging} onDoubleClick={handleTopbarDoubleClick}>
      <div
        className={`brand-lockup ${brandExpanded ? 'is-expanded' : 'is-collapsed'}`}
        onMouseEnter={() => { brandHovered.current = true; setBrandExpanded(true); }}
        onMouseLeave={() => { brandHovered.current = false; setBrandExpanded(false); }}
      >
        <div className="brand-mark"><img src="/arc.png" alt="" /></div>
        <span className="brand-name">ARC</span>
        <span className="brand-divider" />
        <span className="brand-product">Studio</span>
        {workspaceLabel && <span className="desktop-workspace-label">{workspaceLabel}</span>}
      </div>

      <div className="graph-tabs" role="tablist" aria-label="Graphs">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const graphStatus = graphTabStatuses.get(tab.id);
          const hasErrors = Boolean(graphStatus?.hasErrors);
          const unsaved = graphStatus ? graphStatus.unsaved : Boolean(tab.isDirty);
          const statusTitle = hasErrors ? `Graph has blocking issues${unsaved ? ' and unsaved changes' : ''}` : unsaved ? 'Unsaved changes' : '';
          const tabCollaborators = projectCollaborators
            .filter((peer) => peer.userId !== currentUser?.id && Array.isArray(peer.graphIds) && peer.graphIds.includes(tab.id))
            .sort((left, right) => left.username.localeCompare(right.username));
          const visibleCollaborators = tabCollaborators.slice(0, tabCollaborators.length >= 9 ? 2 : 3);
          return (
            <div key={tab.id} className={`graph-tab ${active ? 'is-active' : ''}`} role="presentation" onContextMenu={(event) => {
              event.preventDefault();
              setTabMenu({ tab, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 198 * uiScale)) / uiScale, y: Math.max(8, Math.min(event.clientY, window.innerHeight - 150 * uiScale)) / uiScale });
            }}>
              <button className={`graph-tab-select${tabCollaborators.length ? ' has-collaborators' : ''}`} role="tab" aria-selected={active} onClick={() => onSelectTab?.(tab.id)} title={tab.name}>
                {hasErrors ? <AlertTriangle className="graph-tab-status-error" size={13} aria-label={statusTitle} title={statusTitle} /> : unsaved ? <span className="graph-tab-dirty" role="img" aria-label={statusTitle} title={statusTitle} /> : null}
                <span className="graph-tab-name">{tab.name || 'Untitled graph'}</span>
                {defaultGraphId === tab.id && <Star className="graph-default-star" size={11} fill="currentColor" title="Default for new graphs" />}
              </button>
              {tabCollaborators.length > 0 && <span className="graph-tab-presence" aria-label={`${tabCollaborators.length} collaborator${tabCollaborators.length === 1 ? '' : 's'} viewing this graph`}>
                {visibleCollaborators.map((peer) => <button key={peer.userId} type="button" style={{ '--collaborator-color': peer.color }} title={`Follow ${peer.username} in ${tab.name || 'this graph'}`} aria-label={`Follow ${peer.username} in ${tab.name || 'this graph'}`} onClick={() => onFollowCollaborator?.(peer.userId, tab.id)}>{String(peer.username || '?').slice(0, 1).toUpperCase()}</button>)}
                {tabCollaborators.length >= 9 ? <b>9+</b> : tabCollaborators.length > 3 && <b>+{tabCollaborators.length - 3}</b>}
              </span>}
              <button className="graph-tab-close" onClick={() => onCloseTab?.(tab.id)} title={`Close ${tab.name}`} aria-label={`Close ${tab.name}`}><X size={13} /></button>
            </div>
          );
        })}
        <button className={`topbar-icon-button new-tab-button${tabs.length === 0 ? ' is-empty' : ''}`} onClick={() => onAddTab?.()} onContextMenu={(event) => {
          event.preventDefault();
          const templatesHeight = Math.min(graphTemplates.length, 4) * 32 + (graphTemplates.length ? 30 : 0);
          const height = 200 + templatesHeight;
          setNewGraphMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 218 * uiScale)) / uiScale, y: Math.max(8, Math.min(event.clientY, window.innerHeight - (height + 8) * uiScale)) / uiScale });
        }} data-tooltip="New graph · right-click for quick actions" aria-label="New graph"><FilePlus2 size={16} />{tabs.length === 0 && <span>New</span>}</button>
      </div>

      {newGraphMenu && <div ref={newGraphMenuRef} className="graph-context-menu new-graph-context-menu" style={{ left: newGraphMenu.x, top: newGraphMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
        <button onClick={() => { onAddTab?.(); setNewGraphMenu(null); }}><FilePlus2 size={14} /> New graph</button>
        <button onClick={() => { onAddBlankGraph?.(); setNewGraphMenu(null); }}><FilePlus2 size={14} /> Create new blank graph</button>
        <button onClick={() => { onAddFunctionGraph?.(); setNewGraphMenu(null); }}><Calculator size={14} /> New function graph</button>
        <button onClick={() => { onNewEmbed?.(); setNewGraphMenu(null); }}><Sparkles size={14} /> New embed graph</button>
        {graphTemplates.length > 0 && <>
          <div className="context-menu-heading"><BookmarkPlus size={13} /> Templates</div>
          {graphTemplates.slice(0, 4).map((template) => <button key={template.id} onClick={() => { onUseTemplate?.(template); setNewGraphMenu(null); }}><FilePlus2 size={14} /><span className="context-menu-item-label">{template.name || 'Untitled template'}</span></button>)}
        </>}
      </div>}

      {tabMenu && <div ref={tabMenuRef} className="graph-context-menu tab-context-menu" style={{ left: tabMenu.x, top: tabMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
        <button onClick={() => { onRenameGraph?.(tabMenu.tab); setTabMenu(null); }}><Pencil size={14} /> Rename graph</button>
        <button onClick={() => { onDuplicateGraph?.(tabMenu.tab); setTabMenu(null); }}><Copy size={14} /> Duplicate graph</button>
        <button onClick={() => { onSetDefault?.(tabMenu.tab); setTabMenu(null); }}><Star size={14} fill={defaultGraphId === tabMenu.tab.id ? 'currentColor' : 'none'} /> {defaultGraphId === tabMenu.tab.id ? 'Default for new graphs' : 'Set as new graph default'}</button>
        <button onClick={() => { onCloseTab?.(tabMenu.tab.id); setTabMenu(null); }}><X size={14} /> Close graph</button>
      </div>}

      <div className="topbar-actions">
        <button className="topbar-icon-button history-action" onClick={onUndo} disabled={!canUndo} title={`Undo (${shortcutModifier} + Z)`} aria-label="Undo"><Undo2 size={15} /></button>
        <button className="topbar-icon-button history-action" onClick={onRedo} disabled={!canRedo} title={`Redo (${redoShortcut})`} aria-label="Redo"><Redo2 size={15} /></button>
        {validationStatus !== 'success' && <>
          <button className={`topbar-icon-button validate-action is-${validationStatus}`} onClick={onValidate} title={checkLabel} aria-label={checkLabel}>
            {validationStatus === 'error' ? <AlertCircle size={16} /> : <CircleAlert size={16} />}
          </button>
          <span className="topbar-separator history-separator" />
        </>}
        {(downloadedUpdateReady || appUpdate) && <button className={`studio-update-action ${!downloadedUpdateReady && !appUpdate?.native && appUpdate?.kind === 'major' ? 'is-major' : ''}`} disabled={(!downloadedUpdateReady && !networkOnline) || updateInstalling} onClick={() => onOpenStudioUpdate?.(appUpdate?.url)} title={updateInstalling ? 'Update in progress' : downloadedUpdateReady ? `Install ARC Studio ${downloadedUpdateReady.version}` : !networkOnline ? 'Reconnect to check for the update' : appUpdate.native ? `${appUpdate.title} · download and install` : `${appUpdate.title} · open release`} aria-label={downloadedUpdateReady ? `Install ARC Studio ${downloadedUpdateReady.version}` : appUpdate.native ? `${appUpdate.title}. Update ARC Studio` : `${appUpdate.title}. Open release page`}><Download size={13} /><span>{downloadedUpdateReady ? 'Install' : appUpdate.native ? 'Update' : appUpdate.kind === 'major' ? 'Major update' : appUpdate.kind === 'feature' ? 'Feature update' : 'Maintenance update'}</span></button>}
        {!networkOnline && <span className="network-offline-indicator" role="status"><WifiOff size={12} /><span>No internet</span></span>}
        <div className={`gateway-status ${connected ? 'is-online' : botStatus === 'CONNECTING' ? 'is-pending' : botStatus === 'ERROR' ? 'is-error' : ''}`}>
          <span className="status-indicator" />
          <button className="gateway-copy" onClick={onOpenBotSettings} title="App settings and profile" aria-label="Open app settings and profile">
            <span className="gateway-label">Gateway</span>
            <span className="gateway-value">{botProfile?.application?.name || botProfile?.global_name || botProfile?.username || statusLabel}{botProfile?.verifiedBot === true && <Check className="verified-app-check" size={12} strokeWidth={3} aria-label="Discord-verified app" title="Discord-verified app" />}</span>
          </button>
          <button className="gateway-action" disabled={botStatus === 'CONNECTING' || (!networkOnline && !connected)} onClick={connected ? onStopBot : onStartBot} title={connected ? 'Disconnect gateway' : !networkOnline ? 'Gateway connection is unavailable offline' : botStatus === 'CONNECTING' ? 'Connecting…' : 'Connect gateway'} aria-label={connected ? 'Disconnect gateway' : !networkOnline ? 'Connect gateway unavailable offline' : 'Connect gateway'}>
            {connected ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          </button>
        </div>

        <span className="topbar-separator" />
        <button className={`topbar-icon-button ${isLocked ? 'is-selected' : ''}`} onClick={onToggleLock} title={isLocked ? 'Unlock canvas' : 'Lock canvas'} aria-label={isLocked ? 'Unlock canvas' : 'Lock canvas'}>
          {isLocked ? <LockKeyhole size={16} /> : <LockOpen size={16} />}
        </button>
        <button className={`topbar-icon-button${serverUpdateAvailable ? ' has-update-notice' : ''}`} onClick={onOpenSettings} title={serverUpdateAvailable ? 'Editor settings · ARC Studio Server update available' : 'Editor settings'} aria-label={serverUpdateAvailable ? 'Editor settings. ARC Studio Server update available' : 'Editor settings'}><Settings2 size={16} />{serverUpdateAvailable && <span className="update-indicator-dot" aria-hidden="true" />}</button>
        {uploadProgress && <div className="topbar-upload-progress" role="status" aria-live="polite"><span>Uploading attachments</span><progress max="100" value={uploadProgress.percent} /><b>{uploadProgress.percent}%</b></div>}
        {!hideGraphSave && (activeGraphUnsaved || showSavedFeedback) && <button className={`save-button ${showSavedFeedback ? 'is-saved' : ''}`} onClick={showSavedFeedback ? undefined : onSaveGraph} disabled={showSavedFeedback} title={showSavedFeedback ? 'Saved' : `Save graph (${shortcutModifier} + S)`}><>{showSavedFeedback ? <Check size={15} /> : <Save size={15} />}<span>{showSavedFeedback ? 'Saved' : 'Save'}</span></></button>}

        <div className="profile-menu">
          <button className="profile-trigger" title={`${currentUser?.username || 'Account'} · ${currentUser?.role || ''}`}>
            <span className={`profile-avatar ${profileInitial && profileColor ? 'has-initial' : ''}`} style={profileInitial && profileColor ? { '--collaborator-color': profileColor, '--collaborator-text-color': getContrastTextColor(profileColor), color: getContrastTextColor(profileColor) } : undefined}>{profileInitial && profileColor ? profileInitial : <CircleUserRound size={17} />}</span>
            <span className="profile-name">{currentUser?.username || 'Account'}</span>
            <ChevronDown size={13} className="profile-chevron" />
          </button>
          <div className="profile-popover" role="menu" aria-label="Account menu">
            {desktopMode && <button onClick={onSwitchWorkspace}><ArrowLeftRight size={15} /> Switch workspace</button>}
            {!desktopMode && currentUser?.role === 'admin' && <button onClick={onOpenUsers}><Users size={15} /> Team access</button>}
            <button onClick={onLogout}><LogOut size={15} /> Sign out</button>
          </div>
        </div>
      </div>
    </header>
  );
}
