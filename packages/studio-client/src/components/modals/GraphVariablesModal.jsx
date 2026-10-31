import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Braces, Check, Cpu, FileCode2, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { SidebarResizeHandle } from '../ui/SidebarResizeHandle.jsx';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';

const VARIABLE_TYPES = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' }
];
const DISPLAY_VARIABLE_TYPES = [...VARIABLE_TYPES, { value: 'attachment', label: 'Attachment' }];

const SYSTEM_VARIABLES = [
  { name: 'DISCORD_APP_ID', type: 'number', label: 'Discord Application ID', description: 'Bot application ID from Discord' },
  { name: 'APP_LATENCY', type: 'number', label: 'App Latency', description: 'Discord application REST API round trip in ms' },
  { name: 'GATEWAY_LATENCY', type: 'number', label: 'Gateway Latency', description: 'Discord WebSocket ping round trip in ms' },
  { name: 'BOT_UPTIME', type: 'number', label: 'Bot Uptime', description: 'Elapsed seconds since bot connected' },
  { name: 'BOT_STATISTICS', type: 'object', label: 'Bot Statistics', description: 'Aggregated command and bot usage metrics' }
];

const SYSTEM_MANAGED_IDS = [
  'project_var_discord_app_id',
  'project_var_app_latency',
  'project_var_gateway_latency',
  'project_var_bot_uptime',
  'project_var_bot_statistics'
];

export function GraphVariablesModal({ isOpen, onClose, variables = [], projectVariables = [], onChange, onProjectChange, onSidebarResize, onOpenTextEditor, onRestoreSystemVariable, isSaving = false, presentation = 'modal', sidebarWidth = 320, canEdit = true, canEditProject = canEdit, canEditGraph = canEdit, activeScope: requestedScope = 'project', onScopeChange }) {
  const [activeScope, setActiveScope] = useState(requestedScope);
  const [name, setName] = useState('');
  const [type, setType] = useState('string');
  const [secretOnCreate, setSecretOnCreate] = useState(false);
  const [secretEditIds, setSecretEditIds] = useState(() => new Set());
  const [secretDrafts, setSecretDrafts] = useState({});
  const [secretEditErrors, setSecretEditErrors] = useState({});
  const [pendingSecretConversion, setPendingSecretConversion] = useState(null);
  const [jsonDrafts, setJsonDrafts] = useState({});
  const [invalidJsonIds, setInvalidJsonIds] = useState(() => new Set());
  const [nameError, setNameError] = useState('');
  const [nameDrafts, setNameDrafts] = useState({});
  const [numberDrafts, setNumberDrafts] = useState({});
  const [expandedValueIds, setExpandedValueIds] = useState(() => new Set());
  const [searchByScope, setSearchByScope] = useState({ project: '', graph: '' });
  const [systemMenuOpen, setSystemMenuOpen] = useState(false);
  const [restoringName, setRestoringName] = useState(null);
  const createRowRef = useRef(null);
  const systemMenuRef = useRef(null);

  useEffect(() => { setActiveScope(requestedScope === 'graph' ? 'graph' : 'project'); }, [requestedScope]);

  useEffect(() => {
    if (!systemMenuOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (systemMenuRef.current && !systemMenuRef.current.contains(event.target)) {
        setSystemMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, [systemMenuOpen]);

  const currentVariables = activeScope === 'project' ? projectVariables : variables;
  const currentSearch = searchByScope[activeScope];
  const filteredVariables = currentVariables.filter((variable) => `${variable.name || ''} ${variable.type || ''}`.toLowerCase().includes(currentSearch.trim().toLowerCase()));
  const changeVariables = activeScope === 'project' ? onProjectChange : onChange;
  const currentCanEdit = activeScope === 'project' ? canEditProject : canEditGraph;
  const updateVariable = (id, changes) => changeVariables?.(currentVariables.map((variable) => variable.id === id && variable.readOnly !== true ? { ...variable, ...changes } : variable));
  const valueSummaries = new Map(filteredVariables.map((variable) => {
    const value = variable.type === 'string'
      ? String(variable.initialValue ?? '')
      : jsonDrafts[variable.id] ?? JSON.stringify(variable.initialValue ?? defaultForType(variable.type), null, 2);
    const lines = value.split(/\r\n|\r|\n/).length;
    return [variable.id, { lines, characters: value.length, isLarge: presentation === 'sidebar' && ['string', 'array', 'object'].includes(variable.type) && (value.length > 140 || lines > 4) }];
  }));
  const setValueExpanded = (id, expanded) => setExpandedValueIds((current) => {
    const next = new Set(current);
    if (expanded) next.add(id); else next.delete(id);
    return next;
  });
  const addVariable = (event) => {
    event.preventDefault();
    if (!currentCanEdit) return;
    if (currentVariables.length >= 100) { setNameError('This scope can have at most 100 variables.'); return; }
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError('Enter a variable name.');
      const row = createRowRef.current;
      row?.classList.remove('field-shake');
      if (row) { void row.offsetWidth; row.classList.add('field-shake'); }
      window.setTimeout(() => row?.classList.remove('field-shake'), 360);
      return;
    }
    if (!isValidVariableName(cleanName) && !(['DISCORD_APP_ID', 'APP_LATENCY', 'GATEWAY_LATENCY', 'BOT_UPTIME', 'BOT_STATISTICS'].includes(cleanName) && (cleanName === 'BOT_STATISTICS' ? type === 'object' : type === 'number'))) {
      setNameError('Start and end with a letter or number. Use letters, numbers, hyphens, or underscores inside.');
      return;
    }
    if (currentVariables.some((variable) => variable.name?.toLowerCase() === cleanName.toLowerCase())) {
      setNameError('A variable with this name already exists in this scope.');
      return;
    }
    const variable = {
      id: `${activeScope === 'project' ? 'project_var' : 'var'}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`}`,
      name: cleanName,
      type,
      initialValue: defaultForType(type),
      ...(secretOnCreate ? { secret: true, secretValue: defaultForType(type), initialValue: '••••••' } : {}),
      ...(activeScope === 'graph' ? { persist: true } : {})
    };
    changeVariables?.([...currentVariables, variable]);
    setName('');
    setSecretOnCreate(false);
    setNameError('');
  };

  const saveSecretDraft = (variable) => {
    let secretValue = secretDrafts[variable.id] ?? '';
    try {
      if (variable.type === 'number') {
        secretValue = Number(secretValue);
        if (!Number.isFinite(secretValue)) throw new Error('Enter a valid number.');
      }
      else if (variable.type === 'boolean') {
        const normalizedBoolean = String(secretValue).toLowerCase();
        if (!['true', 'false'].includes(normalizedBoolean)) throw new Error('Enter true or false.');
        secretValue = normalizedBoolean === 'true';
      }
      else if (variable.type === 'array' || variable.type === 'object') {
        secretValue = JSON.parse(secretValue);
        if (variable.type === 'array' ? !Array.isArray(secretValue) : !secretValue || typeof secretValue !== 'object' || Array.isArray(secretValue)) throw new Error('Use valid JSON for this secret.');
      }
    } catch {
      setSecretEditErrors((current) => ({ ...current, [variable.id]: 'Enter a valid value for this variable type.' }));
      return;
    }
    updateVariable(variable.id, { secret: true, secretValue });
    setSecretDrafts((current) => { const next = { ...current }; delete next[variable.id]; return next; });
    setSecretEditErrors((current) => { const next = { ...current }; delete next[variable.id]; return next; });
    setSecretEditIds((current) => { const next = new Set(current); next.delete(variable.id); return next; });
  };

  const confirmSecretConversion = () => {
    if (!pendingSecretConversion) return;
    const { id, scope } = pendingSecretConversion;
    const variablesInScope = scope === 'project' ? projectVariables : variables;
    const variable = variablesInScope.find((item) => item.id === id);
    const canEditScope = scope === 'project' ? canEditProject : canEditGraph;
    if (!variable || variable.secret || variable.readOnly || !canEditScope) {
      setPendingSecretConversion(null);
      return;
    }
    const saveVariables = scope === 'project' ? onProjectChange : onChange;
    saveVariables?.(variablesInScope.map((item) => item.id === id
      ? { ...item, secret: true, secretValue: item.initialValue, initialValue: '••••••' }
      : item));
    setPendingSecretConversion(null);
  };

  const content = <>
    {presentation === 'sidebar' && currentVariables.length > 15 && <label className="graph-variable-search"><Search size={13} /><input value={currentSearch} onChange={(event) => setSearchByScope((current) => ({ ...current, [activeScope]: event.target.value }))} placeholder={`Filter ${activeScope} variables`} aria-label={`Filter ${activeScope} variables`} /></label>}
    <div className="variable-list">
      {filteredVariables.length ? filteredVariables.map((variable) => {
        const isSystemManaged = SYSTEM_MANAGED_IDS.includes(variable.id) || variable.systemManaged === true;
        const isNodeOwned = variable.nodeOwned === true;
        const isReadOnly = isSystemManaged || isNodeOwned || variable.readOnly === true;
        return <div className={`variable-row ${activeScope === 'graph' ? 'is-graph-variable' : ''} ${isSystemManaged ? 'is-system-variable' : ''} ${isNodeOwned ? 'is-node-owned-variable' : ''}`} key={variable.id}>
        <input className={`variable-name ${nameDrafts[variable.id] !== undefined && !isValidVariableName(nameDrafts[variable.id], variable.type) ? 'is-invalid' : ''}`} value={nameDrafts[variable.id] ?? variable.name} maxLength={64} pattern="(?:[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*|DISCORD_APP_ID|APP_LATENCY|GATEWAY_LATENCY|BOT_UPTIME|BOT_STATISTICS)" disabled={!currentCanEdit || isReadOnly} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => { const nextName = event.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64); setNameDrafts((current) => ({ ...current, [variable.id]: nextName })); const duplicate = currentVariables.some((item) => item.id !== variable.id && item.name?.toLowerCase() === nextName.toLowerCase()); if (isValidVariableName(nextName, variable.type) && !duplicate) { updateVariable(variable.id, { name: nextName }); setNameDrafts((current) => { const next = { ...current }; delete next[variable.id]; return next; }); } }} onBlur={() => setNameDrafts((current) => { const next = { ...current }; delete next[variable.id]; return next; })} aria-label={`${variable.name} variable name`} title={isNodeOwned ? 'Defined by a Create Variable node. Edit it on the graph.' : isSystemManaged ? 'Set automatically by ARC Studio.' : 'Start and end with a letter or number. Use letters, numbers, hyphens, or underscores inside.'} />
        <AnimatedDropdown value={variable.type} disabled={!currentCanEdit || isReadOnly || Boolean(variable.secret && variable.secretStored)} onChange={(nextType) => { setJsonDrafts((current) => { const next = { ...current }; delete next[variable.id]; return next; }); setNumberDrafts((current) => { const next = { ...current }; delete next[variable.id]; return next; }); setExpandedValueIds((current) => { const next = new Set(current); next.delete(variable.id); return next; }); setInvalidJsonIds((current) => { const next = new Set(current); next.delete(variable.id); return next; }); updateVariable(variable.id, { type: nextType, initialValue: defaultForType(nextType) }); }} ariaLabel={`${variable.name} variable type`} options={DISPLAY_VARIABLE_TYPES} className="variable-type-dropdown" />
        <div className={`variable-value-control ${variable.secret ? 'is-secret' : ''}`}>
        {!isSystemManaged && !isNodeOwned && !variable.readOnly && <label className="variable-secret-toggle"><AnimatedCheckbox checked={Boolean(variable.secret)} disabled={!currentCanEdit || Boolean(variable.secret)} label={`Secret ${variable.name}`} onChange={(checked) => { if (checked) setPendingSecretConversion({ id: variable.id, name: variable.name, scope: activeScope }); }} /><span>Secret</span></label>}
        {variable.readOnly
          ? <div className="variable-large-summary" title="Provided by a slash command attachment option"><span>Provided by a slash command attachment</span><span>Read only</span></div>
          : variable.secret
          ? <div className="variable-secret-control">
              <div className="variable-secret-control-top">
                {secretEditIds.has(variable.id)
                  ? <><input className="variable-value variable-secret-input" type="password" autoComplete="new-password" value={secretDrafts[variable.id] ?? ''} placeholder={variable.type === 'string' ? 'Enter new secret' : `Enter new ${variable.type} secret`} onChange={(event) => setSecretDrafts((current) => ({ ...current, [variable.id]: event.target.value }))} aria-label={`New secret value for ${variable.name}`} /><button type="button" className="variable-secret-action" disabled={!currentCanEdit} onClick={() => saveSecretDraft(variable)}>Save</button></>
                  : <><span className="variable-secret-mask" aria-label={`${variable.name} secret is hidden`}>••••••</span><button type="button" className="variable-secret-action" disabled={!currentCanEdit} onClick={() => { setSecretDrafts((current) => ({ ...current, [variable.id]: '' })); setSecretEditIds((current) => new Set(current).add(variable.id)); }}>Update</button></>}
              </div>
              {secretEditErrors[variable.id] && <small className="variable-form-error">{secretEditErrors[variable.id]}</small>}
              <small className="variable-secret-hint">Encrypted on this workspace. The saved value cannot be viewed.</small>
            </div>
          : variable.type === 'boolean'
          ? <div className="variable-boolean"><AnimatedCheckbox disabled={!currentCanEdit || isReadOnly} checked={Boolean(variable.initialValue)} onChange={(checked) => updateVariable(variable.id, { initialValue: checked })} label={`${variable.name} initial value`} /> <span>True</span></div>
          : valueSummaries.get(variable.id)?.isLarge && !expandedValueIds.has(variable.id) && !invalidJsonIds.has(variable.id)
            ? <div className="variable-large-summary" title={`${valueSummaries.get(variable.id).lines} lines · ${valueSummaries.get(variable.id).characters.toLocaleString()} characters`} aria-label={`${variable.name}: ${valueSummaries.get(variable.id).lines} lines, ${valueSummaries.get(variable.id).characters} characters. Open in Text Editor for the full value.`}><span>{valueSummaries.get(variable.id).lines} lines</span><span>{valueSummaries.get(variable.id).characters.toLocaleString()} chars</span></div>
            : ['array', 'object'].includes(variable.type)
              ? <textarea className={`variable-value variable-json-value ${invalidJsonIds.has(variable.id) ? 'is-invalid' : ''}`} rows={2} maxLength={12000} spellCheck="false" value={jsonDrafts[variable.id] ?? JSON.stringify(variable.initialValue ?? defaultForType(variable.type), null, 2)} disabled={!currentCanEdit || isReadOnly} onFocus={() => setValueExpanded(variable.id, true)} onChange={(event) => { const draft = event.target.value; setJsonDrafts((current) => ({ ...current, [variable.id]: draft })); try { const parsed = JSON.parse(draft); const rightShape = variable.type === 'array' ? Array.isArray(parsed) : parsed && typeof parsed === 'object' && !Array.isArray(parsed); if (rightShape && JSON.stringify(parsed).length <= 10000) { updateVariable(variable.id, { initialValue: parsed }); setInvalidJsonIds((current) => { const next = new Set(current); next.delete(variable.id); return next; }); } else setInvalidJsonIds((current) => new Set(current).add(variable.id)); } catch { setInvalidJsonIds((current) => new Set(current).add(variable.id)); } }} onBlur={() => { setValueExpanded(variable.id, false); if (!invalidJsonIds.has(variable.id)) setJsonDrafts((current) => { const next = { ...current }; delete next[variable.id]; return next; }); }} aria-label={`${variable.name} initial JSON value`} />
              : <input className={`variable-value ${variable.type === 'number' && numberDrafts[variable.id] === '' ? 'is-empty-number' : ''}`} type={isSystemManaged ? 'text' : variable.type === 'number' ? 'number' : 'text'} maxLength={variable.type === 'string' ? 10000 : undefined} value={variable.type === 'number' && !isSystemManaged && numberDrafts[variable.id] !== undefined ? numberDrafts[variable.id] : variable.initialValue ?? ''} disabled={!currentCanEdit || isReadOnly} readOnly={isSystemManaged || isNodeOwned} autoCapitalize="none" autoCorrect="off" spellCheck={false} onFocus={() => setValueExpanded(variable.id, true)} onBlur={() => setValueExpanded(variable.id, false)} onChange={(event) => { if (variable.type === 'number') { const draft = event.target.value; setNumberDrafts((current) => ({ ...current, [variable.id]: draft })); if (draft !== '') { updateVariable(variable.id, { initialValue: Number(draft) }); setNumberDrafts((current) => { const next = { ...current }; delete next[variable.id]; return next; }); } } else updateVariable(variable.id, { initialValue: event.target.value.slice(0, 10000) }); }} aria-label={`${variable.name} initial value`} aria-invalid={variable.type === 'number' && numberDrafts[variable.id] === '' || undefined} />}
        </div>
        {invalidJsonIds.has(variable.id) && <small className="variable-form-error">Enter a valid JSON {variable.type === 'array' ? 'array' : 'object'} under 10,000 characters.</small>}
        {activeScope === 'graph' && <div className="variable-persistence" title="When off, this variable starts at its initial value for each graph run and resets when that run ends."><AnimatedCheckbox disabled={!currentCanEdit || isReadOnly} checked={variable.persist !== false} onChange={(persist) => updateVariable(variable.id, { persist })} label={`Persist ${variable.name}`} /><span>Persist</span></div>}
        {['string', 'array', 'object'].includes(variable.type) && !variable.secret && <button className="variable-open-editor" type="button" disabled={!currentCanEdit && !isReadOnly} title={isReadOnly ? `View ${variable.name} in Text Editor (Read only)` : `Open ${variable.name} in Text Editor`} aria-label={isReadOnly ? `View ${variable.name} in Text Editor (Read only)` : `Open ${variable.name} in Text Editor`} onClick={() => onOpenTextEditor?.(variable, activeScope, isReadOnly)}><FileCode2 size={14} /></button>}
        <button className="variable-delete" disabled={!currentCanEdit || isNodeOwned || variable.readOnly} onClick={() => changeVariables?.(currentVariables.filter((item) => item.id !== variable.id))} title={isNodeOwned ? 'Remove the Create Variable node to delete this variable.' : variable.readOnly ? 'Provided by a slash command option.' : `Delete ${variable.name}`} aria-label={`Delete ${variable.name}`}><Trash2 size={15} /></button>
      </div>;
      }) : <div className="variable-empty">{currentVariables.length ? 'No matching variables' : `No ${activeScope === 'project' ? 'project' : 'graph'} variables`}</div>}
    </div>
    {!currentCanEdit && <div className="variable-empty">{activeScope === 'graph' ? 'Open an editable graph to add graph variables.' : 'You do not have permission to edit project variables.'}</div>}
    <form ref={createRowRef} className={`variable-create-row ${!currentCanEdit ? 'is-disabled' : ''}`} noValidate onSubmit={addVariable}>
      <input value={name} maxLength={64} pattern="(?:[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*|DISCORD_APP_ID|APP_LATENCY|GATEWAY_LATENCY|BOT_UPTIME|BOT_STATISTICS)" disabled={!currentCanEdit} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => { setName(event.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)); setNameError(''); }} placeholder="Variable name" aria-label="New variable name" aria-invalid={Boolean(nameError)} title="Start and end with a letter or number. Underscores and hyphens are allowed inside." />
      <AnimatedDropdown value={type} disabled={!currentCanEdit} onChange={setType} ariaLabel="New variable type" options={VARIABLE_TYPES} className="variable-type-dropdown" />
      <label className="variable-create-secret"><AnimatedCheckbox checked={secretOnCreate} disabled={!currentCanEdit} onChange={setSecretOnCreate} label="Create as a secret" /><span>Secret</span></label>
      <button className="variable-add" disabled={!currentCanEdit || currentVariables.length >= 100} type="submit" title={currentVariables.length >= 100 ? 'Maximum 100 variables per scope' : 'Create variable'} aria-label="Create variable"><Plus size={15} /></button>
      {nameError && <small className="variable-form-error" role="alert">{nameError}</small>}
    </form>
  </>;
  const selectScope = (scope) => { setActiveScope(scope); onScopeChange?.(scope); setNameError(''); };
  const scopeTabs = <>
    <div className="graph-variable-tabs" role="tablist" aria-label="Variable scope">
      <button type="button" role="tab" aria-selected={activeScope === 'project'} className={activeScope === 'project' ? 'is-active' : ''} onClick={() => selectScope('project')}>Project <span>{projectVariables.length}</span></button>
      <button type="button" role="tab" aria-selected={activeScope === 'graph'} className={activeScope === 'graph' ? 'is-active' : ''} onClick={() => selectScope('graph')}>Graph <span>{variables.length}</span></button>
    </div>
    <small className="graph-variable-scope-hint">{activeScope === 'project' ? 'Project variables are shared across graphs and always persist.' : 'Graph variables persist by default. Turn off Persist to reset a value after each run.'}</small>
  </>;

  const systemVariablesControl = <div className={`system-variables-menu-container ${presentation === 'sidebar' ? 'is-sidebar' : ''}`} ref={systemMenuRef}>
    <button type="button" className={`icon-button compact system-variables-trigger ${systemMenuOpen ? 'is-active' : ''}`} onClick={() => setSystemMenuOpen((open) => !open)} title="System variables" aria-label="System variables">
      <Cpu size={14} />
    </button>
    {systemMenuOpen && <div className="system-variables-dropdown">
      <div className="system-variables-dropdown-header">
        <strong>System variables</strong>
        <button type="button" className="system-variables-dropdown-close" onClick={() => setSystemMenuOpen(false)} aria-label="Close system variables menu"><X size={12} /></button>
      </div>
      <div className="system-variables-dropdown-list">
        {SYSTEM_VARIABLES.map((sysVar) => {
          const existing = projectVariables.find((item) => item.name === sysVar.name);
          const isManaged = existing && (SYSTEM_MANAGED_IDS.includes(existing.id) || existing.systemManaged === true);
          const hasConflict = existing && !isManaged;
          const isAdded = existing && isManaged;
          return <div key={sysVar.name} className="system-variable-item">
            <div className="system-variable-item-info">
              <div className="system-variable-item-name">
                <code>{sysVar.name}</code>
                <span className="system-variable-item-type">{sysVar.type}</span>
              </div>
              <div className="system-variable-item-desc">{sysVar.description}</div>
              {hasConflict && <small className="system-variable-conflict-warning">Delete custom variable first to restore system variable</small>}
            </div>
            <div className="system-variable-item-action">
              {isAdded ? (
                <span className="system-variable-status is-added"><Check size={12} /> Added</span>
              ) : hasConflict ? (
                <button type="button" className="system-variable-restore-btn is-disabled" disabled title="Delete the custom variable first">Restore</button>
              ) : (
                <button type="button" className="system-variable-restore-btn" disabled={restoringName === sysVar.name || !currentCanEdit} onClick={async () => {
                  setRestoringName(sysVar.name);
                  try {
                    await onRestoreSystemVariable?.(sysVar.name);
                  } finally {
                    setRestoringName(null);
                  }
                }}>
                  <RotateCcw size={12} />
                  {restoringName === sysVar.name ? 'Restoring…' : 'Restore'}
                </button>
              )}
            </div>
          </div>;
        })}
      </div>
    </div>}
  </div>;

  const secretConversionModal = <Modal isOpen={Boolean(pendingSecretConversion)} onClose={() => setPendingSecretConversion(null)} onConfirm={confirmSecretConversion} title="Make this variable a secret?" subtitle="This change cannot be undone." icon={AlertTriangle} footer={<><Button variant="secondary" onClick={() => setPendingSecretConversion(null)}>Cancel</Button><Button variant="danger" icon={AlertTriangle} onClick={confirmSecretConversion}>Make secret</Button></>}>
    <p className="settings-danger-copy">ARC Studio will encrypt the current value and replace the visible value with a mask. The secret cannot be viewed or changed back into a regular variable. You can replace it later with a new secret value.</p>
    {pendingSecretConversion?.name && <p className="settings-danger-copy">Variable: <strong>{pendingSecretConversion.name}</strong></p>}
  </Modal>;

  if (presentation === 'sidebar') return <>{isOpen ? <aside className="graph-variables-sidebar" aria-label="Variables" style={{ '--arc-sidebar-width': `${sidebarWidth}px` }}>
    <SidebarResizeHandle width={sidebarWidth} defaultWidth={320} onResize={onSidebarResize} />
    <header className="graph-library-header">
      <span><Braces size={14} />Variables<small>{projectVariables.length + variables.length}</small></span>
      <div className="graph-library-header-actions">
        {systemVariablesControl}
        <button className="icon-button compact" type="button" aria-label="Close graph variables" onClick={onClose}><X size={14} /></button>
      </div>
    </header>
    <div className="graph-variable-tabs" role="tablist" aria-label="Variable scope">
      <button type="button" role="tab" aria-selected={activeScope === 'project'} className={activeScope === 'project' ? 'is-active' : ''} onClick={() => selectScope('project')}>Project <span>{projectVariables.length}</span></button>
      <button type="button" role="tab" aria-selected={activeScope === 'graph'} className={activeScope === 'graph' ? 'is-active' : ''} onClick={() => selectScope('graph')}>Graph <span>{variables.length}</span></button>
    </div>
    <div className={`graph-variables-sidebar-content ${isSaving ? 'is-saving' : ''}`}>
      {isSaving && <div className="variable-save-progress" role="status" aria-label="Saving variables"><i /></div>}
      <small className="graph-variable-scope-hint">{activeScope === 'project' ? 'Project variables are shared across graphs and always persist.' : 'Graph variables persist by default. Turn off Persist to reset a value after each run.'}</small>
      {content}
    </div>
  </aside> : null}{secretConversionModal}</>;
  return <><Modal isOpen={isOpen} onClose={onClose} title="Variables" subtitle="Project-wide and graph-specific values" icon={Braces} maxWidth="lg" headerMeta={systemVariablesControl}>{scopeTabs}{content}</Modal>{secretConversionModal}</>;
}

function defaultForType(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return '';
}

function isValidVariableName(name, type = '') {
  if (['DISCORD_APP_ID', 'APP_LATENCY', 'GATEWAY_LATENCY', 'BOT_UPTIME'].includes(String(name || ''))) {
    return !type || type === 'number';
  }
  if (String(name || '') === 'BOT_STATISTICS') {
    return !type || type === 'object';
  }
  return /^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(String(name || ''));
}
