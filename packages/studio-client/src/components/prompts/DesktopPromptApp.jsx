import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Bot, Braces, ChevronLeft, FileText, FolderTree, Globe2, PackageOpen, Plus, Search, Server, ShieldCheck, Ticket, TrendingUp, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';
import { apiUrl } from '../../core/api.js';
import { EditorSettingsModal } from '../modals/EditorSettingsModal.jsx';
import { BotSettingsModal } from '../modals/BotSettingsModal.jsx';
import { UserManagementModal } from '../modals/UserManagementModal.jsx';
import { PasswordInput, TextInput } from '../ui/Inputs.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { ToastContainer } from '../ui/ToastContainer.jsx';
import { ConnectedTemplateArguments, TemplateSyntaxHelpContent } from '../ui/TemplateSyntaxHelp.jsx';
import '../../styles/index.css';
import './desktopPrompt.css';
//
function readTheme() {
  try {
    const theme = localStorage.getItem('arc_theme');
    if (theme === 'light' || theme === 'dark') return theme;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function PromptHeading({ prompt }) {
  return <header className="desktop-prompt-heading">
    <h1>{prompt.title || 'ARC Studio'}</h1>
    {prompt.subtitle && <p className="desktop-prompt-subtitle">{prompt.subtitle}</p>}
    {prompt.message && <p className="desktop-prompt-message">{prompt.message}</p>}
  </header>;
}

function PromptButtons({ prompt, onCancel, onSubmit, disabled = false }) {
  return <footer className="desktop-prompt-actions">
    <button type="button" className="studio-button studio-button-secondary desktop-prompt-button" onClick={onCancel}>{prompt.cancelText || 'Cancel'}</button>
    <button type="submit" className={`studio-button desktop-prompt-button ${prompt.variant === 'danger' ? 'studio-button-danger' : 'studio-button-primary'}`} onClick={onSubmit} disabled={disabled}>{prompt.confirmText || 'Continue'}</button>
  </footer>;
}

function TextPrompt({ prompt, complete }) {
  const [value, setValue] = useState(String(prompt.defaultValue || ''));
  const expectedValue = typeof prompt.expectedValue === 'string' ? prompt.expectedValue : null;
  const isConfirmation = prompt.kind === 'text-confirm';
  const submit = (event) => {
    event.preventDefault();
    if (prompt.required && !value.trim()) return;
    if (expectedValue !== null && value.trim() !== expectedValue) return;
    complete(isConfirmation ? value.trim() : value);
  };
  return <form className="desktop-prompt-form" onSubmit={submit}>
    <PromptHeading prompt={prompt} />
    <label className="desktop-prompt-field">
      <span>{prompt.label || 'Value'}</span>
      <input autoFocus maxLength={prompt.maxLength} value={value} placeholder={prompt.placeholder || ''} onChange={(event) => setValue(event.target.value)} />
    </label>
    {isConfirmation && <p className="desktop-prompt-hint">Enter the exact value shown above to continue.</p>}
    <PromptButtons prompt={prompt} onCancel={() => complete(null)} disabled={prompt.required && !value.trim() || expectedValue !== null && value.trim() !== expectedValue} />
  </form>;
}

function ProjectExportPrompt({ prompt, complete }) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [passwordProtect, setPasswordProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (passwordProtect && (password.length < 12 || password.length > 1024)) {
      setError('Use an export password between 12 and 1,024 characters.');
      return;
    }
    if (passwordProtect && password !== confirmPassword) {
      setError('The export passwords do not match.');
      return;
    }
    complete({ includeSecrets, passwordProtect, password, confirmPassword });
  };
  return <form className="desktop-prompt-form" onSubmit={submit}>
    <PromptHeading prompt={prompt} />
    <div className="project-export-body desktop-project-export-body">
      <p className="project-export-summary">Export this project including its graphs, settings, and assets. The connected gateway token is not included.</p>
      {prompt.omittedFields > 0 && <div className="project-export-option-card">
        <label className="project-export-checkbox-label">
          <input type="checkbox" checked={includeSecrets} onChange={(event) => setIncludeSecrets(event.target.checked)} />
          <div>
            <strong>Include sensitive secrets</strong>
            <p>This project contains {prompt.omittedFields} sensitive field{prompt.omittedFields === 1 ? '' : 's'}. Eligible sensitive fields are omitted by default for safety.</p>
          </div>
        </label>
      </div>}
      <div className={`project-export-option-card ${passwordProtect ? 'is-active' : ''}`}>
        <label className="project-export-checkbox-label">
          <input type="checkbox" checked={passwordProtect} onChange={(event) => { setPasswordProtect(event.target.checked); setError(''); }} />
          <div>
            <strong>Password protect file</strong>
            <p>Encrypt this file with a password. The password will be required when importing.</p>
          </div>
        </label>
        {passwordProtect && <div className="project-export-passwords">
          <PasswordInput label="Export password" placeholder="At least 12 characters" value={password} autoFocus autoComplete="one-time-code" name="arc_export_encryption_key" id="arc-export-encryption-key" data-lpignore="true" data-1p-ignore="true" data-form-type="other" maxLength={1024} onChange={(event) => { setPassword(event.target.value); setError(''); }} />
          <PasswordInput label="Confirm password" placeholder="Re-enter password" value={confirmPassword} autoComplete="one-time-code" name="arc_export_encryption_key_confirm" id="arc-export-encryption-key-confirm" data-lpignore="true" data-1p-ignore="true" data-form-type="other" maxLength={1024} onChange={(event) => { setConfirmPassword(event.target.value); setError(''); }} />
          <p className="project-export-password-hint">Use 12 to 1,024 characters. ARC Studio cannot recover a forgotten export password.</p>
        </div>}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    <PromptButtons prompt={prompt} onCancel={() => complete(null)} />
  </form>;
}

function BotExportPrompt({ prompt, complete }) {
  const summary = prompt.summary || {};
  const issues = Array.isArray(prompt.issues) ? prompt.issues : [];
  const [includeCryptoSecret, setIncludeCryptoSecret] = useState(Boolean(prompt.includeCryptoSecret));
  const [includeBotToken, setIncludeBotToken] = useState(Boolean(prompt.includeBotToken));
  const hasErrors = issues.some((issue) => issue.kind === 'error');
  return <form className="desktop-prompt-form" onSubmit={(event) => { event.preventDefault(); complete({ action: 'build', includeCryptoSecret, includeBotToken }); }}>
    <PromptHeading prompt={prompt} />
    <div className="desktop-prompt-scroll">
      <div className="desktop-prompt-stats">
        <span><strong>{summary.graphCount || 0}</strong> graphs</span>
        <span><strong>{summary.nodeCount || 0}</strong> nodes</span>
        <span><strong>{summary.variableCount || 0}</strong> variables</span>
      </div>
      <details><summary>Included files and folders</summary><ul>{(summary.included || []).map((item) => <li key={item}>{item}</li>)}</ul></details>
      <details><summary>Graphs ({summary.graphNames?.length || 0})</summary><ul>{(summary.graphNames || []).map((item) => <li key={item}>{item}</li>)}</ul></details>
      <details><summary>Gateway intents and server permissions</summary>
        <p><strong>Gateway intents</strong><br />{summary.requiredIntents?.length ? summary.requiredIntents.join(', ') : 'Guilds (required)'}</p>
        <p><strong>Permissions used by nodes</strong><br />{summary.requiredPermissions?.length ? summary.requiredPermissions.join(', ') : 'No additional permissions inferred'}</p>
      </details>
      <details><summary>Runtime and configuration</summary><p>{summary.runtime || 'Node.js 22 or newer'}</p><ul>{(summary.configuration || []).map((item) => <li key={item}>{item}</li>)}</ul></details>
      {summary.unsupportedNodeCount > 0 && <p className="desktop-prompt-error">{summary.unsupportedNodeCount} node type{summary.unsupportedNodeCount === 1 ? ' is' : 's are'} unsupported by the bundled runtime.</p>}
      {summary.usesCryptoNodes && <label className="desktop-prompt-option">
        <input type="checkbox" checked={includeCryptoSecret} onChange={(event) => setIncludeCryptoSecret(event.target.checked)} />
        <span><strong>Include generated crypto secret in .env</strong><small>Used by AES nodes with no passphrase. Keep it private and reuse it when replacing an export that contains stored ciphertext.</small></span>
      </label>}
      {summary.showBotTokenOption && <label className={`desktop-prompt-option${summary.hasBotToken && summary.isActiveProject && summary.canIncludeBotToken ? '' : ' is-disabled'}`}>
        <input type="checkbox" checked={includeBotToken} disabled={!summary.canIncludeBotToken || !summary.hasBotToken || !summary.isActiveProject} onChange={(event) => setIncludeBotToken(event.target.checked)} />
        <span><strong>Include bot token in .env</strong><small>{!summary.isActiveProject ? 'Switch to this project before including its bot token.' : !summary.hasBotToken ? 'No bot token is configured for this project.' : 'Anyone with this ZIP can use the token.'}</small></span>
      </label>}
      <section className="desktop-prompt-issues" aria-label="Export findings">
        <h2>{issues.length} finding{issues.length === 1 ? '' : 's'}</h2>
        {issues.map((issue, index) => <div className={`desktop-prompt-issue is-${issue.kind}`} key={`${issue.kind}-${issue.graphName || ''}-${index}`}>
          <span>{issue.graphName && <strong>{issue.graphName}: </strong>}{issue.message}</span>
          {issue.nodeId && <button type="button" onClick={() => complete({ action: 'trace', graphId: issue.graphId, nodeId: issue.nodeId })}>Open</button>}
        </div>)}
      </section>
    </div>
    <PromptButtons prompt={prompt} onCancel={() => complete(null)} disabled={hasErrors} />
  </form>;
}

function NativeShortcutHelp({ prompt }) {
  const renderKeys = (shortcut) => {
    const tokens = String(shortcut).replace(/([⌘⇧⌥])/g, ' $1 ').trim().split(/\s+/).filter(Boolean);
    return tokens.map((key, index) => key === '+' || key === '/'
      ? <span className="keyboard-shortcut-separator" key={`${key}-${index}`}>{key}</span>
      : <kbd key={`${key}-${index}`}>{key}</kbd>);
  };
  return <div className="desktop-window-help-content">
    <h1>{prompt.title || 'Keyboard Shortcuts'}</h1>
    <p className="desktop-prompt-subtitle">ARC Studio editor</p>
    <div className="keyboard-shortcut-list">{(prompt.rows || []).map(([label, keys]) => <div className="keyboard-shortcut-row" key={label}><span>{label}</span><span className="keyboard-shortcut-keys" aria-label={keys}>{renderKeys(keys)}</span></div>)}</div>
  </div>;
}

function CreateProjectPrompt({ prompt, complete, callParent }) {
  const starters = Array.isArray(prompt.starters) ? prompt.starters : [];
  const [templateId, setTemplateId] = useState(prompt.defaultTemplateId || starters[0]?.id || 'blank');
  const selectedStarter = starters.find((starter) => starter.id === templateId);
  const [name, setName] = useState(prompt.defaultName || selectedStarter?.name || '');
  const [nameEdited, setNameEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !name.trim() || !selectedStarter || typeof callParent !== 'function') return;
    setBusy(true);
    setError('');
    try {
      await callParent('projects-create-from-template', { name: name.trim(), templateId });
      complete(null);
    } catch (reason) {
      setError(reason?.message || 'Could not create the project.');
    } finally { setBusy(false); }
  };
  return <form className="desktop-prompt-form desktop-create-project-form" onSubmit={submit}>
    <PromptHeading prompt={prompt} />
    <label className="desktop-prompt-field"><span>Project name</span><input autoFocus maxLength={64} value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setNameEdited(true); }} /></label>
    <div className="desktop-create-project-starters" role="radiogroup" aria-label="Project starter">{starters.map((starter) => {
      const Icon = ({ blank: Plus, ticket: Ticket, leveling: TrendingUp, moderation: ShieldCheck, basic: Bot, utility: Braces })[starter.id] || PackageOpen;
      return <button key={starter.id} type="button" role="radio" aria-checked={templateId === starter.id} disabled={busy} className={`splash-project-template${templateId === starter.id ? ' is-selected' : ''}`} onClick={() => { setTemplateId(starter.id); if (!nameEdited) setName(starter.name); }}><Icon size={16} /><span><strong>{starter.name}</strong><small>{starter.description}</small></span></button>;
    })}</div>
    {error && <p className="desktop-prompt-error" role="alert">{error}</p>}
    <footer className="desktop-prompt-actions"><button type="button" className="studio-button studio-button-secondary desktop-prompt-button" onClick={() => complete(null)} disabled={busy}>Cancel</button><button type="submit" className="studio-button studio-button-primary desktop-prompt-button" disabled={busy || !name.trim() || !selectedStarter}>{busy ? 'Creating…' : 'Create project'}</button></footer>
  </form>;
}

function DesktopSettingsPrompt({ prompt, complete, callParent }) {
  const [settings, setSettings] = useState(prompt.settings || {});
  const [themeChoice, setThemeChoice] = useState(prompt.themeChoice || 'system');
  const [systemTheme, setSystemTheme] = useState(prompt.theme || readTheme());
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateCheckError, setUpdateCheckError] = useState('');
  const effectiveTheme = themeChoice === 'system' ? systemTheme : themeChoice;
  useEffect(() => {
    if (themeChoice !== 'system' || !window.matchMedia) return undefined;
    const preference = window.matchMedia('(prefers-color-scheme: light)');
    const syncTheme = (event) => setSystemTheme(event.matches ? 'light' : 'dark');
    syncTheme(preference);
    preference.addEventListener?.('change', syncTheme);
    if (!preference.addEventListener) preference.addListener?.(syncTheme);
    return () => {
      preference.removeEventListener?.('change', syncTheme);
      if (!preference.removeEventListener) preference.removeListener?.(syncTheme);
    };
  }, [themeChoice]);
  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.body.dataset.theme = effectiveTheme;
  }, [effectiveTheme]);
  const run = (action, value) => callParent(action, value);
  const checkForUpdates = async () => {
    if (checkingForUpdates) return;
    setCheckingForUpdates(true);
    setUpdateCheckError('');
    try {
      const result = await run('settings-check-for-updates');
      if (result?.error) setUpdateCheckError(result.error);
      return result;
    } catch (reason) {
      setUpdateCheckError(reason?.message || 'Could not check for updates.');
    } finally {
      setCheckingForUpdates(false);
    }
  };
  const uiScale = Number(settings.uiScale) || 100;
  const fontScale = Number(settings.fontScale) || 100;
  return <div className="app-root" data-theme={effectiveTheme} data-release-channel={prompt.releaseChannel || 'stable'} data-ui-scale={uiScale} data-font-scale={fontScale} style={{ '--arc-ui-scale': uiScale / 100, '--arc-font-scale': fontScale / 100 }}>
    <EditorSettingsModal
      isOpen
      onClose={() => complete(null)}
      settings={settings}
      initialTab={prompt.initialTab || 'canvas'}
      aboutOnly={Boolean(prompt.aboutOnly)}
      onUpdateSettings={(next) => { setSettings(next); void run('settings-update', { settings: next }); }}
      onAutoLayout={() => run('settings-auto-layout')}
      onExportGraph={() => run('settings-export-graph')}
      onResetLocalData={(password) => run('settings-reset-local-data', { password })}
      themeChoice={themeChoice}
      onThemeChange={async (choice) => {
        setThemeChoice(choice);
        const result = await run('settings-theme', { choice });
        if (choice === 'system' && (result === 'light' || result === 'dark')) setSystemTheme(result);
        return result;
      }}
      desktopMode
      hideWindowClose
      nativeWindow
      localWorkspace={Boolean(prompt.localWorkspace)}
      externalWorkspace={Boolean(prompt.externalWorkspace)}
      passkeysSupported={Boolean(prompt.passkeysSupported)}
      canResetLocalWorkspace={Boolean(prompt.canResetLocalWorkspace)}
      canManageClientAccess={Boolean(prompt.canManageClientAccess)}
      platform={prompt.platform || ''}
      appUpdate={prompt.appUpdate || null}
      serverUpdate={prompt.serverUpdate || null}
      stableUpdateReady={prompt.stableUpdateReady ?? null}
      downloadedUpdateReady={prompt.downloadedUpdateReady || null}
      updateInstalling={Boolean(prompt.updateInstalling)}
      checkingForUpdates={checkingForUpdates}
      updateCheckCooldownUntil={Number(prompt.updateCheckCooldownUntil) || 0}
      updateCheckError={updateCheckError}
      releaseChannel={prompt.releaseChannel || 'stable'}
      onOpenStudioUpdate={(url) => run('settings-open-studio-update', { url })}
      onCheckForUpdates={checkForUpdates}
      networkOnline={Boolean(prompt.networkOnline)}
      authToken={prompt.authToken || ''}
      activeProjectId={prompt.activeProjectId || ''}
      workspaceOrigin={prompt.workspaceOrigin || ''}
      canManageLogRetention={Boolean(prompt.canManageLogRetention)}
      canManageActivityWebhook={Boolean(prompt.canManageActivityWebhook)}
      idleDisconnectMinutes={Number(prompt.idleDisconnectMinutes) || 15}
      canManageIdleDisconnect={Boolean(prompt.canManageIdleDisconnect)}
      onSetIdleDisconnectMinutes={(minutes) => run('settings-idle-disconnect', { minutes })}
    />
  </div>;
}

function AppSettingsPrompt({ prompt, complete, callParent }) {
  return <div className="app-root" data-theme={prompt.theme || readTheme()} data-release-channel={prompt.releaseChannel || 'stable'}>
    <BotSettingsModal
      isOpen
      onClose={() => complete(null)}
      authToken={prompt.authToken || ''}
      profile={prompt.profile || null}
      onProfileChange={(profile) => { void callParent('app-settings-profile', { profile }); }}
      desktopMode
      nativeWindow
    />
  </div>;
}

function CanvasSectionPrompt({ prompt, complete }) {
  const [name, setName] = useState(prompt.name || '');
  const [color, setColor] = useState(prompt.color || prompt.colors?.[0]?.value || '#9b7cf4');
  const [noteIds, setNoteIds] = useState(prompt.noteIds || []);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const notes = (prompt.notes || []).filter((note) => !search.trim() || `${note.text} ${note.createdBy}`.toLowerCase().includes(search.trim().toLowerCase()));
  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) return setError('Give this section a name.');
    if (!(prompt.nodeIds || []).length && !noteIds.length) return setError('Choose at least one node or note.');
    complete({ name: name.trim().slice(0, 48), color, noteIds });
  };
  const formId = 'desktop-canvas-section-form';
  return <Modal
    isOpen
    nativeWindow
    showCloseButton={false}
    onClose={() => complete(null)}
    title={prompt.title || 'Create canvas section'}
    subtitle={prompt.subtitle || 'Group related nodes with a colored frame.'}
    icon={FolderTree}
    footer={<><Button variant="secondary" onClick={() => complete(null)}>Cancel</Button><Button type="submit" form={formId}>{prompt.confirmText || 'Create section'}</Button></>}
  >
    <form id={formId} className="canvas-tag-group-form" onSubmit={submit}>
      <TextInput label="Section name" placeholder="e.g. Ticket creation" value={name} maxLength={48} autoFocus error={error === 'Give this section a name.' ? error : ''} onChange={(event) => { setName(event.target.value); setError(''); }} />
      <span className="field-label">Color</span>
      <div className="canvas-tag-group-colors" role="group" aria-label="Section color">{(prompt.colors || []).map((item) => <button key={item.id} type="button" className={`canvas-tag-group-color${color === item.value ? ' is-selected' : ''}`} style={{ '--tag-group-color': item.value }} aria-label={`${item.label} section color`} aria-pressed={color === item.value} onClick={() => setColor(item.value)} />)}</div>
      {error && error !== 'Give this section a name.' && <p className="field-error" role="alert">{error}</p>}
      {(prompt.notes || []).length > 0 && <><span className="field-label">Notes in section</span>{prompt.notes.length > 12 && <TextInput label="Search notes" placeholder="Filter by note text" value={search} onChange={(event) => setSearch(event.target.value)} />}<div className="canvas-tag-group-members">{notes.map((note) => <label key={note.id}><input type="checkbox" checked={noteIds.includes(note.id)} onChange={(event) => setNoteIds((current) => event.target.checked ? [...new Set([...current, note.id])] : current.filter((id) => id !== note.id))} /><span>{note.text}</span><small>{note.createdBy}</small></label>)}</div></>}
    </form>
  </Modal>;
}

function GraphNamePrompt({ prompt, complete, callParent }) {
  const [name, setName] = useState(prompt.defaultValue || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await callParent('graph-name-submit', { graphId: prompt.graphId, mode: prompt.mode, name });
      if (result?.ok) complete(null);
      else setError(result?.error || 'Could not save this graph name.');
    } catch (reason) { setError(reason?.message || 'Could not save this graph name.'); }
    finally { setBusy(false); }
  };
  return <form className="desktop-prompt-form" onSubmit={submit}>
    <PromptHeading prompt={prompt} />
    <label className="desktop-prompt-field"><span>Graph name</span><input autoFocus maxLength={80} value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setError(''); }} /></label>
    {error && <p className="desktop-prompt-error" role="alert">{error}</p>}
    <footer className="desktop-prompt-actions"><button type="button" className="studio-button studio-button-secondary desktop-prompt-button" disabled={busy} onClick={() => complete(null)}>Cancel</button><button type="submit" className="studio-button studio-button-primary desktop-prompt-button" disabled={busy || !name.trim()}>{busy ? 'Saving…' : prompt.confirmText || 'Save graph'}</button></footer>
  </form>;
}

function PluginActionPrompt({ prompt, complete, callParent }) {
  const [permissions, setPermissions] = useState(prompt.permissionSelection || []);
  const [trust, setTrust] = useState(Boolean(prompt.confirmTrust));
  const [autoUpdate, setAutoUpdate] = useState(prompt.confirmAutoUpdate !== false);
  const [runtimeAcknowledged, setRuntimeAcknowledged] = useState(Boolean(prompt.hostRuntimeAcknowledged));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const review = prompt.review || {};
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await callParent('plugin-confirm', { permissions, trust, autoUpdate, runtimeAcknowledged });
      if (result?.ok) complete(null);
      else setError(result?.error || 'Could not save plugin settings.');
    } catch (reason) { setError(reason?.message || 'Could not save plugin settings.'); }
    finally { setBusy(false); }
  };
  return <form className="desktop-prompt-form" onSubmit={submit}>
    <PromptHeading prompt={prompt} />
    <div className="desktop-prompt-scroll">
      <section className="desktop-plugin-summary"><strong>{review.name}</strong><span>{review.id} · v{review.version}</span><span>Requires ARC Studio {review.minArcStudioVersion || 'current'} or newer</span>{review.author && <span>Publisher: {review.author}</span>}<span>{review.sourceLabel}</span>{review.sourceUrl && <small>{review.sourceUrl}</small>}</section>
      <p className="desktop-plugin-warning"><AlertTriangle size={15} />{review.warning}</p>
      {review.dependencies?.length > 0 && <details><summary>Runtime dependencies ({review.dependencies.length})</summary><ul>{review.dependencies.map((item) => <li key={item.name}>{item.name} · {item.version}</li>)}</ul></details>}
      {review.permissions?.length > 0 && <section className="desktop-plugin-permissions"><strong>Permissions for this project</strong><p>Only selected capabilities are enabled. The project owner or a workspace admin must grant access.</p>{review.permissions.map((permission) => <label key={permission.id}><input type="checkbox" checked={permissions.includes(permission.id)} onChange={(event) => setPermissions((current) => event.target.checked ? [...new Set([...current, permission.id])] : current.filter((id) => id !== permission.id))} /><span><b>{permission.name}</b><small>{permission.description}</small></span></label>)}</section>}
      {review.showAutoUpdate && <label className="desktop-prompt-option"><input type="checkbox" checked={autoUpdate} onChange={(event) => setAutoUpdate(event.target.checked)} /><span><strong>Automatically install future catalog updates</strong><small>Adapter code updates still require manual review.</small></span></label>}
      {review.requiresRuntimeTrust && <label className="desktop-prompt-option"><input type="checkbox" checked={runtimeAcknowledged} onChange={(event) => setRuntimeAcknowledged(event.target.checked)} /><span><strong>I understand and trust this server runtime</strong><small>Server adapters run with the workspace server account’s operating system access.</small></span></label>}
      {!review.permissionReviewOnly && <label className="desktop-prompt-option"><input type="checkbox" checked={trust} onChange={(event) => setTrust(event.target.checked)} /><span><strong>I trust this plugin and its source</strong></span></label>}
    </div>
    {error && <p className="desktop-prompt-error" role="alert">{error}</p>}
    <footer className="desktop-prompt-actions"><button type="button" className="studio-button studio-button-secondary desktop-prompt-button" disabled={busy} onClick={() => complete(null)}>Cancel</button><button type="submit" className="studio-button studio-button-primary desktop-prompt-button" disabled={busy || (!review.permissionReviewOnly && !trust) || (review.requiresRuntimeTrust && !runtimeAcknowledged) || !prompt.canInstall}>{busy ? 'Working…' : prompt.confirmText || 'Continue'}</button></footer>
  </form>;
}

function commandLabel(command) {
  return Number(command.type || 1) === 2 ? `User: ${command.name}` : Number(command.type || 1) === 3 ? `Message: ${command.name}` : `/${command.name}`;
}

function CommandBrowserPrompt({ prompt, callParent }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const commands = prompt.commands || [];
  const filtered = commands.filter((command) => `${command.name} ${command.description || ''} ${command.graphName || ''} ${command.status || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    if (!selected || !prompt.authToken) return undefined;
    let current = true;
    setLoadingStats(true);
    fetch(apiUrl(`/api/bot/statistics?${new URLSearchParams({ command: selected.name })}`), { headers: { 'x-arc-token': prompt.authToken } })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load command statistics.'); if (current) setStats(data.statistics); })
      .catch(() => { if (current) setStats(null); })
      .finally(() => { if (current) setLoadingStats(false); });
    return () => { current = false; };
  }, [selected, prompt.authToken]);
  const openGraph = async (graphId) => {
    try { await callParent('command-open-graph', { graphId }); }
    catch {}
  };
  return <main className="desktop-command-browser">
    <PromptHeading prompt={prompt} />
    {selected ? <div className="desktop-command-detail"><button className="desktop-command-back" onClick={() => { setSelected(null); setStats(null); }}><ChevronLeft size={14} />All commands</button><strong>{commandLabel(selected)}</strong><span className={`command-review-status is-${String(selected.status || 'configured').toLowerCase()}`}>{selected.status || 'Configured'}</span><p>{selected.description || 'No description'}</p>{selected.graphs?.length ? selected.graphs.map((graph) => <button key={graph.id} className="desktop-command-graph" onClick={() => void openGraph(graph.id)}><FileText size={13} />Open {graph.name}</button>) : selected.graphId && <button className="desktop-command-graph" onClick={() => void openGraph(selected.graphId)}><FileText size={13} />Open {selected.graphName || 'graph'}</button>}{selected.options?.length > 0 && <details open><summary>Command structure</summary><ul>{selected.options.map((option, index) => <li key={`${option.name}-${index}`}><code>{option.name}</code> · {option.description}</li>)}</ul></details>}<section className="desktop-command-usage"><strong>Usage</strong>{loadingStats ? <p>Loading statistics…</p> : stats ? <p>{Number(stats.uses || 0).toLocaleString()} uses · {Number(stats.uniqueUsers || 0).toLocaleString()} unique users · {Number(stats.returningUsers || 0).toLocaleString()} returning</p> : <p>Statistics are unavailable.</p>}</section></div> : <><label className="desktop-command-search"><Search size={14} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search commands" /></label><div className="desktop-command-list">{filtered.map((command) => <button key={`${command.type || 1}-${command.name}`} onClick={() => setSelected(command)}><span><strong>{commandLabel(command)}</strong><small>{command.description || command.graphName || 'No description'}</small></span><b>{command.status || 'Configured'}</b></button>)}{!filtered.length && <p>No matching commands.</p>}</div></>}
  </main>;
}

function DeploymentReviewPrompt({ prompt, complete, callParent }) {
  const [showCommands, setShowCommands] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(prompt.deployError || '');
  const [review, setReview] = useState(prompt.review || {});
  const [guildSearch, setGuildSearch] = useState('');
  const [guildIdDraft, setGuildIdDraft] = useState('');
  const commandKey = (command) => `${Number(command?.type || 1)}:${String(command?.name || '').toLowerCase()}`;
  const availableCommands = review.availableCommands || review.commands || [];
  const allCommandKeys = availableCommands.map(commandKey);
  const includedCommandKeys = review.commandKeys == null ? allCommandKeys : review.commandKeys;
  const includedSet = new Set(includedCommandKeys);
  const filteredGuilds = (review.guildOptions || []).filter((guild) => `${guild.name} ${guild.id}`.toLowerCase().includes(guildSearch.trim().toLowerCase()));
  const updateOptions = async ({ scope = review.scope || 'global', guildIds = review.guildIds || [], commandKeys = review.commandKeys ?? null, addedGuild = null } = {}) => {
    const previousReview = review;
    setBusy(true);
    setError('');
    setReview((current) => ({ ...current, scope, guildIds, commandKeys, canDeploy: false, guildOptions: addedGuild?.id && !(current.guildOptions || []).some((guild) => guild.id === addedGuild.id) ? [...(current.guildOptions || []), addedGuild] : current.guildOptions }));
    try {
      const result = await callParent('commands-review-options', { scope, guildIds, commandKeys, addedGuild });
      if (result?.requestError) { setReview(previousReview); setError(result.requestError); }
      else if (result) setReview((current) => ({ ...current, ...result, guildOptions: result.guildOptions || current.guildOptions || [] }));
      else { setReview(previousReview); setError('Could not refresh the command review.'); }
    } catch (reason) { setReview(previousReview); setError(reason?.message || 'Could not refresh the command review.'); }
    finally { setBusy(false); }
  };
  const toggleCommand = (key, checked) => {
    const next = new Set(includedCommandKeys);
    if (checked) next.add(key); else next.delete(key);
    const commandKeys = next.size === allCommandKeys.length ? null : [...next];
    void updateOptions({ scope: review.scope || 'global', guildIds: review.guildIds || [], commandKeys });
  };
  const toggleGuild = (id, checked) => {
    const next = new Set(review.guildIds || []);
    if (checked) next.add(id); else next.delete(id);
    void updateOptions({ scope: 'guilds', guildIds: [...next], commandKeys: review.commandKeys ?? null });
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const result = await callParent('commands-deploy');
      if (result?.ok) complete(null);
      else setError(result?.error || 'Could not deploy commands.');
    } catch (reason) { setError(reason?.message || 'Could not deploy commands.'); }
    finally { setBusy(false); }
  };
  const openGraph = async (location) => {
    try { await callParent(location.nodeId ? 'command-open-node' : 'command-open-graph', { graphId: location.graphId, nodeId: location.nodeId }); }
    catch {}
  };
  return <main className="desktop-deployment-review">
    <PromptHeading prompt={prompt} />
    <div className="desktop-deployment-scroll">
      {review.discordAuthWarning && <p className="desktop-plugin-warning"><AlertTriangle size={15} />{review.discordAuthWarning.message || review.discordAuthWarning.title}</p>}
      <section><strong>Graph checks · {review.errors || 0} errors · {review.warnings || 0} warnings</strong>{review.issues?.length ? review.issues.map((issue) => <article className={`desktop-review-issue is-${issue.severity}`} key={issue.key}><span>{issue.message}</span>{issue.locations?.map((location, index) => location.graphId && <button key={`${location.graphId}-${index}`} onClick={() => void openGraph(location)}>{location.graphName}{location.nodeName ? ` · ${location.nodeName}` : ''}</button>)}</article>) : <p>No graph errors or warnings.</p>}</section>
      <section className="desktop-review-deployment-options"><strong>Deploy scope</strong><div className="desktop-review-scope-options"><button type="button" className={review.scope !== 'guilds' ? 'is-selected' : ''} disabled={busy} onClick={() => void updateOptions({ scope: 'global', guildIds: [], commandKeys: review.commandKeys ?? null })}><Globe2 size={14} />Global</button><button type="button" className={review.scope === 'guilds' ? 'is-selected' : ''} disabled={busy} onClick={() => { if (review.scope !== 'guilds') void updateOptions({ scope: 'guilds', guildIds: review.guildIds || [], commandKeys: review.commandKeys ?? null }); }}><Server size={14} />Specific servers</button></div>
        {review.scope === 'guilds' && <><p>{!review.guildOptions?.length && 'Connect the bot gateway once to load server suggestions, or enter a server ID below. ' }The application must be authorized in each selected server. Choose up to 25 servers per deployment.</p><label className="desktop-review-search"><Search size={13} /><input value={guildSearch} onChange={(event) => setGuildSearch(event.target.value)} placeholder="Search servers" /></label><div className="desktop-review-guild-list">{filteredGuilds.map((guild) => <label key={guild.id}><input type="checkbox" checked={(review.guildIds || []).includes(guild.id)} disabled={busy || !(review.guildIds || []).includes(guild.id) && review.guildIds?.length >= 25} onChange={(event) => toggleGuild(guild.id, event.target.checked)} /><span>{guild.name}</span><small>{guild.id}</small></label>)}{!filteredGuilds.length && <p>No matching cached servers.</p>}</div>{!!review.guildIds?.length && <div className="command-review-selected-guilds" aria-label="Selected servers">{review.guildIds.map((id) => { const guild = (review.guildOptions || []).find((item) => String(item.id) === String(id)); const label = guild?.name || `Server ${id}`; return <span className="command-review-guild-chip" key={id} title={`${label} · ${id}`}><span>{label}</span><button type="button" disabled={busy} aria-label={`Remove ${label}`} onClick={() => toggleGuild(id, false)}><X size={12} /></button></span>; })}</div>}<form className="desktop-review-add-guild" onSubmit={(event) => { event.preventDefault(); const id = guildIdDraft.trim(); if (!/^\d{17,20}$/.test(id) || (review.guildIds || []).includes(id) || review.guildIds?.length >= 25) return; const guild = (review.guildOptions || []).find((item) => item.id === id) || { id, name: `Server ${id}` }; setGuildIdDraft(''); void updateOptions({ scope: 'guilds', guildIds: [...(review.guildIds || []), id], commandKeys: review.commandKeys ?? null, addedGuild: guild }); }}><input value={guildIdDraft} inputMode="numeric" aria-invalid={Boolean(guildIdDraft) && !/^\d{17,20}$/.test(guildIdDraft)} onChange={(event) => { setGuildIdDraft(event.target.value.replace(/\D/g, '').slice(0, 20)); setError(''); }} placeholder="Enter a server ID" aria-label="Server ID" /><button type="submit" disabled={busy || !/^\d{17,20}$/.test(guildIdDraft) || (review.guildIds || []).includes(guildIdDraft) || review.guildIds?.length >= 25}>Add server</button></form>{guildIdDraft && !/^\d{17,20}$/.test(guildIdDraft) && <small className="command-review-guild-hint" role="status">A Discord server ID must contain 17 to 20 digits.</small>}</>}
      </section>
      <section className="desktop-review-deployment-options"><div className="desktop-review-section-heading"><strong>Commands · {includedCommandKeys.length} selected</strong><button onClick={() => setShowCommands((value) => !value)}>{showCommands ? 'Hide list' : 'Choose commands'}</button></div>{showCommands && <div className="desktop-review-command-list is-selectable">{availableCommands.map((command) => { const key = commandKey(command); return <label key={key}><input type="checkbox" checked={includedSet.has(key)} onChange={(event) => toggleCommand(key, event.target.checked)} /><span><code>{commandLabel(command)}</code><small>{command.description || (Number(command.type || 1) === 2 ? 'User context command' : Number(command.type || 1) === 3 ? 'Message context command' : 'Slash command')}</small></span></label>; })}{!availableCommands.length && <p>No configured commands.</p>}</div>}{!busy && review.noChanges && <p>{includedCommandKeys.length ? 'Discord commands already match this selection.' : 'Select at least one command to deploy.'}</p>}</section>
      <section><strong>Required intents</strong>{review.intents?.length ? review.intents.map((intent) => <div className="desktop-review-requirement" key={intent.key}><span>{intent.label}</span><small>{intent.status}</small></div>) : <p>No gateway intents required.</p>}</section>
      <section><strong>Bot permissions</strong>{review.permissions?.length ? <div className="desktop-review-permissions">{review.permissions.map((permission) => <code key={permission}>{permission}</code>)}</div> : <p>No server permissions required by the current graph actions.</p>}</section>
    </div>
    {error && <p className="desktop-prompt-error" role="alert">{error}</p>}
    <footer className="desktop-prompt-actions"><button className="studio-button studio-button-secondary desktop-prompt-button" disabled={busy} onClick={() => complete(null)}>Cancel</button><button className="studio-button studio-button-primary desktop-prompt-button" disabled={busy || !review.canDeploy || review.scope === 'guilds' && !(review.guildIds || []).length || !includedCommandKeys.length} onClick={() => void submit()}>{busy ? 'Working…' : review.deployLabel || 'Deploy commands'}</button></footer>
  </main>;
}

function GraphValidationPrompt({ prompt, complete, callParent }) {
  const result = prompt.result || {};
  const errors = result.errors || [];
  const warnings = result.warnings || [];
  const fallbackItems = [
    ...errors.map((message) => ({ message, kind: 'error', nodeId: result.errorNodeIds?.[message] })),
    ...warnings.map((message) => ({ message, kind: 'warning', nodeId: result.warningNodeIds?.[message] }))
  ];
  const items = (result.issueItems?.length ? result.issueItems : fallbackItems).filter((item, index, all) => all.findIndex((candidate) => candidate.kind === item.kind && candidate.message === item.message && candidate.nodeId === item.nodeId && candidate.graphId === item.graphId) === index);
  const openIssue = async (item) => {
    const graphId = item.graphId || result.graphId;
    if (!graphId || !item.nodeId) return;
    try { await callParent('validation-open-node', { graphId, nodeId: item.nodeId }); }
    catch {}
    complete(null);
  };
  return <main className="desktop-deployment-review">
    <PromptHeading prompt={prompt} />
    <div className="desktop-deployment-scroll desktop-validation-list">
      {items.map((item, index) => <article className={`desktop-review-issue is-${item.kind}`} key={`${item.kind}-${index}`}><span>{item.message}</span>{item.nodeId && (item.graphId || result.graphId) && <button onClick={() => void openIssue(item)}>Open node</button>}</article>)}
      {!errors.length && !warnings.length && <p className="desktop-validation-empty">The graph is ready to run.</p>}
    </div>
    <footer className="desktop-prompt-actions"><button className="studio-button studio-button-primary desktop-prompt-button" onClick={() => complete(null)}>Done</button></footer>
  </main>;
}

function TeamAccessPrompt({ prompt, complete, callParent }) {
  return <main className="desktop-prompt-frame desktop-team-access">
    <UserManagementModal
      isOpen
      nativeWindow
      authToken={prompt.authToken}
      currentUsername={prompt.currentUsername || ''}
      currentUserId={prompt.currentUserId || ''}
      workspaceName={prompt.workspaceName || ''}
      onClose={() => complete(null)}
      onCurrentUserChange={(user) => callParent('team-current-user-updated', { id: user?.id, username: user?.username })}
    />
    <ToastContainer />
  </main>;
}

function DesktopPromptApp() {
  const [prompt, setPrompt] = useState(null);
  const [error, setError] = useState('');
  const pendingActions = useRef(new Map());
  const complete = (response) => invoke('complete_desktop_prompt', { response }).catch((reason) => setError(reason?.message || 'Could not close this prompt.'));
  const callParent = async (action, value = null) => {
    if (!prompt?._desktopPrompt?.parentLabel) throw new Error('The ARC Studio window is unavailable.');
    const actionId = globalThis.crypto?.randomUUID?.();
    if (!actionId) throw new Error('This device could not create a secure action identifier.');
    let resolveAction;
    let rejectAction;
    const result = new Promise((resolve, reject) => { resolveAction = resolve; rejectAction = reject; });
    const timeoutMs = action === 'plugin-confirm' ? 10 * 60_000 : ['commands-deploy', 'commands-review-options'].includes(action) ? 3 * 60_000 : 60_000;
    const timer = window.setTimeout(() => {
      pendingActions.current.delete(actionId);
      rejectAction(new Error('ARC Studio did not respond to this window action.'));
    }, timeoutMs);
    pendingActions.current.set(actionId, { resolve: resolveAction, reject: rejectAction, timer });
    try {
      await invoke('dispatch_desktop_prompt_action', { actionId, action, value });
    } catch (reason) {
      window.clearTimeout(timer);
      pendingActions.current.delete(actionId);
      rejectAction(reason);
    }
    return result;
  };

  useEffect(() => {
    document.documentElement.dataset.theme = readTheme();
    let cancelled = false;
    let unlistenLoad;
    const applyPrompt = (data) => {
      if (cancelled) return;
      if (data?.clientContext) window.__ARC_STUDIO_CONFIG__ = data.clientContext;
      const theme = data?.theme === 'light' || data?.theme === 'dark' ? data.theme : readTheme();
      document.documentElement.dataset.theme = theme;
      document.body.dataset.theme = theme;
      document.documentElement.dataset.releaseChannel = data?.releaseChannel || window.__ARC_STUDIO_CONFIG__?.releaseChannel || 'stable';
      setError('');
      setPrompt(data);
    };
    const loadCurrentPrompt = () => invoke('take_desktop_prompt_data').then(applyPrompt).catch((reason) => {
      if (cancelled) return;
      setError(reason?.message || 'Could not load this prompt.');
      invoke('show_desktop_prompt_window').catch(() => {});
    });
    listen('arc:desktop-prompt-load', loadCurrentPrompt).then((stopLoad) => {
      if (cancelled) { stopLoad(); return; }
      unlistenLoad = stopLoad;
      return loadCurrentPrompt();
    }).catch((reason) => {
      if (!cancelled) setError(reason?.message || 'Could not prepare this prompt window.');
    });
    return () => {
      cancelled = true;
      unlistenLoad?.();
    };
  }, []);
  useEffect(() => {
    if (prompt?.themeChoice !== 'system' || !window.matchMedia) return undefined;
    const preference = window.matchMedia('(prefers-color-scheme: light)');
    const syncTheme = (event) => {
      const nextTheme = event.matches ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      document.body.dataset.theme = nextTheme;
      setPrompt((current) => current ? { ...current, theme: nextTheme } : current);
    };
    syncTheme(preference);
    preference.addEventListener?.('change', syncTheme);
    if (!preference.addEventListener) preference.addListener?.(syncTheme);
    return () => {
      preference.removeEventListener?.('change', syncTheme);
      if (!preference.removeEventListener) preference.removeListener?.(syncTheme);
    };
  }, [prompt?._desktopPrompt?.requestId, prompt?.themeChoice]);
  useEffect(() => {
    if (!prompt) return undefined;
    const timer = window.setTimeout(() => {
      invoke('show_desktop_prompt_window').catch((reason) => setError(reason?.message || 'Could not show this ARC Studio window.'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [prompt]);
  useEffect(() => {
    let unlisten;
    listen('arc:desktop-window-action-result', (event) => {
      const pending = pendingActions.current.get(event.payload?.actionId);
      if (!pending) return;
      pendingActions.current.delete(event.payload.actionId);
      window.clearTimeout(pending.timer);
      if (event.payload.error) pending.reject(new Error(event.payload.error));
      else pending.resolve(event.payload.result);
    }).then((stop) => { unlisten = stop; }).catch((reason) => setError(reason?.message || 'Could not receive ARC Studio window responses.'));
    return () => {
      unlisten?.();
      pendingActions.current.forEach(({ reject, timer }) => { window.clearTimeout(timer); reject(new Error('This window was closed.')); });
      pendingActions.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!prompt?._desktopPrompt?.requestId) return undefined;
    return () => {
      pendingActions.current.forEach(({ reject, timer }) => {
        window.clearTimeout(timer);
        reject(new Error('This prompt has closed.'));
      });
      pendingActions.current.clear();
    };
  }, [prompt?._desktopPrompt?.requestId]);
  useEffect(() => {
    const cancel = (event) => {
      if (event.key === 'Escape' && prompt) {
        if (document.querySelector('[role="dialog"]')) return;
        event.preventDefault();
        void complete(null);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [prompt, complete]);

  if (error) return <main className="desktop-prompt-frame"><div className="desktop-prompt-error" role="alert">{error}</div></main>;
  if (!prompt) return null;
  const commonProps = { prompt, complete, callParent };
  if (prompt.kind === 'editor-settings') return <DesktopSettingsPrompt prompt={prompt} complete={complete} callParent={callParent} />;
  if (prompt.kind === 'app-settings') return <AppSettingsPrompt {...commonProps} />;
  if (prompt.kind === 'team-access') return <TeamAccessPrompt {...commonProps} />;
  if (prompt.kind === 'canvas-section') return <div className="app-root" data-theme={prompt.theme || readTheme()} data-release-channel={prompt.releaseChannel || 'stable'}><CanvasSectionPrompt {...commonProps} /></div>;
  return <main className="desktop-prompt-frame">
    {prompt.kind === 'project-export' ? <ProjectExportPrompt {...commonProps} />
      : prompt.kind === 'bot-export' ? <BotExportPrompt {...commonProps} />
        : prompt.kind === 'shortcuts-help' ? <NativeShortcutHelp prompt={prompt} />
          : prompt.kind === 'template-syntax-help' ? <div className="desktop-prompt-scroll desktop-template-help"><h1>{prompt.title || 'Template syntax'}</h1><TemplateSyntaxHelpContent /></div>
            : prompt.kind === 'template-inputs-help' ? <div className="desktop-prompt-scroll"><PromptHeading prompt={prompt} /><ConnectedTemplateArguments connectedArguments={prompt.connectedArguments || []} /></div>
              : prompt.kind === 'create-project' ? <CreateProjectPrompt {...commonProps} />
              : prompt.kind === 'graph-name' ? <GraphNamePrompt {...commonProps} />
                  : prompt.kind === 'plugin-action' ? <PluginActionPrompt {...commonProps} />
                    : prompt.kind === 'deployment-review' ? <DeploymentReviewPrompt {...commonProps} />
                      : prompt.kind === 'graph-validation' ? <GraphValidationPrompt {...commonProps} />
                      : prompt.kind === 'command-browser' ? <CommandBrowserPrompt {...commonProps} />
                : <TextPrompt {...commonProps} />}
  </main>;
}

createRoot(document.getElementById('root')).render(<DesktopPromptApp />);
