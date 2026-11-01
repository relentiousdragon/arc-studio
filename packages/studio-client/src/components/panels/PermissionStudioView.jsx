import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy, Plus, Search, Trash2 } from 'lucide-react';
import { DISCORD_PERMISSION_GROUPS, bitfieldToPermissions, permissionsToBitfield } from '../nodes/permissionCatalog.js';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { notifyStudioSwitchCancelled, useStudioEscape, useStudioSwitchClose } from './useStudioEscape.js';
//
const MAX_OVERWRITES = 100;
const KNOWN_PERMISSION_MASK = DISCORD_PERMISSION_GROUPS.flatMap((group) => group.permissions).reduce((mask, [, , bit]) => mask | (1n << BigInt(bit)), 0n);
const parseBitfield = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return 0n;
  if (!/^(?:\d+|0x[\da-f]+)$/i.test(text)) return null;
  try { return BigInt(text); } catch { return null; }
};
const withCustomBits = (names, raw) => {
  const rawBits = parseBitfield(raw);
  const knownBits = BigInt(permissionsToBitfield(names));
  return (knownBits | ((rawBits ?? 0n) & ~KNOWN_PERMISSION_MASK)).toString();
};
const canonicalBitfield = (value) => {
  const parsed = parseBitfield(value);
  return parsed === null ? null : parsed.toString();
};

export function PermissionStudioView({ mode = 'role', nodeName = 'Permissions', data = {}, connectedTargetIds = [], permissionsConnected = false, variables = [], onApply, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(data || {}));
  const [search, setSearch] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [expandedTargets, setExpandedTargets] = useState(() => new Set());
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const isOverwrite = mode === 'overwrites';
  const isCommand = mode === 'command';
  const initialCount = Math.max(1, Number(draft.overwriteCount) || 0, ...connectedTargetIds.map((id) => Number(/target_id_(\d+)/.exec(id)?.[1]) || 0), ...Object.keys(draft).map((id) => Number(/^target_id_(\d+)$/.exec(id)?.[1]) || 0).filter((index) => index > 0 && draft[`target_id_${index}`]));
  const [targetCount, setTargetCount] = useState(Math.min(MAX_OVERWRITES, initialCount));
  const hasUnappliedChanges = JSON.stringify(draft) !== JSON.stringify(data || {}) || targetCount !== Math.min(MAX_OVERWRITES, initialCount);
  const close = () => hasUnappliedChanges ? setDiscardPromptOpen(true) : onClose?.();
  useStudioEscape(close);
  useStudioSwitchClose('permission', close);
  const query = search.trim().toLowerCase();
  const targetMatches = (index) => {
    if (!query) return true;
    const type = Number(draft[`target_type_${index}`] ?? 0) === 1 ? 'member' : 'role';
    const targetId = String(draft[`target_id_${index}`] || '');
    return [`target ${index}`, type, `${type} id`, targetId].some((value) => String(value).toLowerCase().includes(query));
  };
  const groups = useMemo(() => DISCORD_PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: group.permissions.filter(([key, label, _bit, contexts]) => (!isOverwrite || Boolean(contexts)) && (!query || `${label} ${key}`.toLowerCase().includes(query)))
  })).filter((group) => group.permissions.length), [isOverwrite, query]);
  const allOverwriteGroups = useMemo(() => DISCORD_PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: group.permissions.filter(([, , , contexts]) => Boolean(contexts))
  })).filter((group) => group.permissions.length), []);
  const editTarget = (index, key, value) => setDraft((current) => ({ ...current, [`${key}_${index}`]: value }));
  const selectedFor = (index) => isOverwrite
    ? {
      allow: [...new Set([...(Array.isArray(draft[`allow_${index}`]) ? draft[`allow_${index}`] : []), ...bitfieldToPermissions(draft[`allowBits_${index}`])])],
      deny: [...new Set([...(Array.isArray(draft[`deny_${index}`]) ? draft[`deny_${index}`] : []), ...bitfieldToPermissions(draft[`denyBits_${index}`])])]
    }
    : { allow: bitfieldToPermissions(draft.permissions), deny: [] };
  const setPermission = (index, key, state) => {
    const current = selectedFor(index);
    const allow = current.allow.filter((item) => item !== key);
    const deny = current.deny.filter((item) => item !== key);
    if (state === 'allow') allow.push(key);
    if (state === 'deny') deny.push(key);
    if (isOverwrite) setDraft((value) => ({
      ...value,
      [`allow_${index}`]: allow,
      [`deny_${index}`]: deny,
      [`allowBits_${index}`]: withCustomBits(allow, value[`allowBits_${index}`]),
      [`denyBits_${index}`]: withCustomBits(deny, value[`denyBits_${index}`])
    }));
    else setDraft((value) => ({ ...value, permissions: withCustomBits(allow, value.permissions) }));
  };
  const countSelected = (index) => selectedFor(index).allow.length + selectedFor(index).deny.length;
  const invalidBitfield = isOverwrite
    ? Array.from({ length: targetCount }, (_, offset) => offset + 1).some((index) => canonicalBitfield(draft[`allowBits_${index}`]) === null || canonicalBitfield(draft[`denyBits_${index}`]) === null)
    : canonicalBitfield(draft.permissions) === null;
  const apply = () => {
    if (invalidBitfield) return;
    if (!isOverwrite) {
      const permissions = canonicalBitfield(draft.permissions);
      return onApply?.({ ...draft, permissions: isCommand && String(draft.permissions ?? '').trim() === '' ? '' : permissions });
    }
    const normalized = { ...draft, overwriteCount: targetCount };
    for (let index = 1; index <= targetCount; index += 1) {
      normalized[`allowBits_${index}`] = canonicalBitfield(draft[`allowBits_${index}`]) || '0';
      normalized[`denyBits_${index}`] = canonicalBitfield(draft[`denyBits_${index}`]) || '0';
    }
    onApply?.(normalized);
  };
  const copyBitfield = async (field) => {
    const value = String(draft[field] || '0');
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => current === field ? '' : current), 1200);
    } catch { setCopiedField(''); }
  };

  return <section className="permission-studio" aria-label="Permission editor">
    <header className="permission-studio-header">
      <button type="button" className="permission-studio-back" onClick={close}><ArrowLeft size={16} /> Back</button>
      <div className="permission-studio-title"><div><h1>{isCommand ? 'Command permissions' : 'Permission editor'}</h1><p>{nodeName} · {isOverwrite ? 'Channel access rules' : isCommand ? 'Slash command defaults' : 'Role permissions'}</p></div></div>
      <button type="button" className="permission-studio-apply" onClick={apply} disabled={invalidBitfield}><Check size={15} /> Apply</button>
    </header>
    <div className="permission-studio-toolbar">
      <label className="permission-studio-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isOverwrite ? 'Search permissions, target type, or ID' : 'Search permissions'} autoCapitalize="none" autoCorrect="off" /></label>
      <span>{isOverwrite ? 'Unset permissions inherit from the server and parent category.' : isCommand ? 'Members need every selected permission. Administrators can always use the command.' : 'Choose the permissions this role should receive.'}</span>
    </div>
    <div className="permission-studio-scroll">
      {isOverwrite ? <div className="permission-targets">
        {Array.from({ length: targetCount }, (_, offset) => {
          const index = offset + 1;
          if (!targetMatches(index) && !groups.length) return null;
          const targetId = `target_id_${index}`;
          const isConnected = connectedTargetIds.includes(targetId);
          const isExpanded = expandedTargets.has(index) || Boolean(query && targetMatches(index));
          const targetPermissionGroups = query && targetMatches(index) && !groups.length ? allOverwriteGroups : groups;
          const allow = selectedFor(index).allow;
          const deny = selectedFor(index).deny;
          return <article className="permission-target-card" key={index}>
            <div className="permission-target-header"><button type="button" className="permission-target-toggle" aria-expanded={isExpanded} onClick={() => setExpandedTargets((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}><ChevronDown size={14} /><span><strong>Target {index}</strong><small>{isConnected ? 'ID supplied by the connected wire' : 'Role or member receiving this overwrite'}</small></span></button>{targetCount > 1 && index === targetCount && <button type="button" className="permission-icon-button" title="Remove last target" aria-label="Remove last target" disabled={isConnected} onClick={() => { setTargetCount((current) => Math.max(1, current - 1)); setDraft((current) => { const next = { ...current }; for (const suffix of ['target_id', 'target_type', 'allow', 'deny']) delete next[`${suffix}_${index}`]; return next; }); }}><Trash2 size={14} /></button>}</div>
            {isExpanded && <>
            <div className="permission-target-fields">
              {isConnected ? <div className="permission-connected-target"><span>Target ID</span><b>Connected to Target ID {index}</b></div> : <label><span>Target ID</span><input value={draft[targetId] || ''} onChange={(event) => editTarget(index, 'target_id', replaceNumericVariable(event.target.value, variables))} placeholder={index === 1 ? 'Server ID for @everyone' : 'Paste a role or member ID'} autoCapitalize="none" autoCorrect="off" spellCheck="false" /></label>}
              <div className="permission-target-type"><span>Target type</span><AnimatedDropdown value={Number(draft[`target_type_${index}`] ?? 0) === 1 ? 'member' : 'role'} onChange={(value) => editTarget(index, 'target_type', value === 'member' ? 1 : 0)} ariaLabel={`Target ${index} type`} options={[{ value: 'role', label: 'Role' }, { value: 'member', label: 'Member' }]} className="permission-target-type-dropdown" /></div>
            </div>
            <div className="permission-bitfield-grid">
              <BitfieldField label="Allow BigInt" value={draft[`allowBits_${index}`] || ''} invalid={canonicalBitfield(draft[`allowBits_${index}`]) === null} copied={copiedField === `allowBits_${index}`} onChange={(value) => editTarget(index, 'allowBits', value)} onCopy={() => copyBitfield(`allowBits_${index}`)} />
              <BitfieldField label="Deny BigInt" value={draft[`denyBits_${index}`] || ''} invalid={canonicalBitfield(draft[`denyBits_${index}`]) === null} copied={copiedField === `denyBits_${index}`} onChange={(value) => editTarget(index, 'denyBits', value)} onCopy={() => copyBitfield(`denyBits_${index}`)} />
            </div>
            {targetPermissionGroups.length ? <PermissionList groups={targetPermissionGroups} query={query && !targetMatches(index) ? query : ''} allow={allow} deny={deny} onChange={(key, state) => setPermission(index, key, state)} /> : null}
            <footer>{countSelected(index)} overrides · {allow.length} allowed · {deny.length} denied</footer>
            </>}
          </article>;
        })}
        <button type="button" className="permission-add-target" disabled={targetCount >= MAX_OVERWRITES} onClick={() => setTargetCount((current) => Math.min(MAX_OVERWRITES, current + 1))}><Plus size={15} /> Add target overwrite <span>{targetCount}/{MAX_OVERWRITES}</span></button>
      </div> : <article className="permission-role-card"><div className="permission-bitfield-grid role-bitfield"><BitfieldField label={isCommand ? 'Command permission bitfield' : 'Role permission BigInt'} value={draft.permissions || ''} invalid={canonicalBitfield(draft.permissions) === null} copied={copiedField === 'permissions'} onChange={(value) => setDraft((current) => ({ ...current, permissions: value }))} onCopy={() => copyBitfield('permissions')} /><span>Decimal or hexadecimal (`0x…`). Unknown permission bits are preserved when you toggle named permissions.</span></div>{isCommand && <label className="slash-command-choice"><AnimatedCheckbox checked={String(draft.permissions ?? '').trim() === '0'} label="Administrators only" onChange={(checked) => setDraft((current) => ({ ...current, permissions: checked ? '0' : '' }))} /><span>Administrators only. This sets Discord’s default permissions to 0.</span></label>}<PermissionList roleMode groups={groups} query={query} allow={selectedFor(0).allow} deny={[]} onChange={(key, state) => setPermission(0, key, state)} /><footer>{selectedFor(0).allow.length} known permissions selected · BigInt {draft.permissions || '0'}</footer></article>}
      {!groups.length && !(isOverwrite && Array.from({ length: targetCount }, (_, index) => targetMatches(index + 1)).some(Boolean)) && <p className="permission-empty">No permissions or targets match “{search}”.</p>}
    </div>
    <Modal isOpen={discardPromptOpen} onClose={() => { setDiscardPromptOpen(false); notifyStudioSwitchCancelled(); }} title="Discard permission changes?" subtitle="These edits have not been applied to the graph." footer={<><Button variant="secondary" onClick={() => { setDiscardPromptOpen(false); notifyStudioSwitchCancelled(); }}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard changes</Button></>}><p className="close-graph-copy">Your graph is unchanged until you choose Apply.</p></Modal>
  </section>;
}

function replaceNumericVariable(value, variables) {
  const match = /^\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}$/.exec(value);
  if (!match) return value;
  const variable = variables.find((item) => item?.type === 'number' && item.name?.toLowerCase() === match[1].toLowerCase());
  return variable ? String(variable.initialValue ?? '') : value;
}

function BitfieldField({ label, value, invalid, copied, onChange, onCopy }) {
  return <label className={`permission-bitfield-field${invalid ? ' is-invalid' : ''}`}><span>{label}</span><div><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="0 or 0x…" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck="false" /><button type="button" onClick={onCopy} aria-label={`Copy ${label}`} title={`Copy ${label}`}><Copy size={14} />{copied ? 'Copied' : 'Copy'}</button></div></label>;
}

function PermissionList({ groups, allow, deny, onChange, roleMode = false }) {
  return <div className="permission-list">{groups.map((group) => <section className="permission-group" key={group.id}>
    <h2>{group.label}</h2>
    <div>{group.permissions.map(([key, label, bit]) => {
      const state = allow.includes(key) ? 'allow' : deny.includes(key) ? 'deny' : 'inherit';
      return <div className={`permission-row is-${state}`} key={key}><span><b>{label}</b><small>Bit {bit}</small></span><div className="permission-state" role="group" aria-label={`${label} permission`}>
        {(roleMode ? ['inherit', 'allow'] : ['inherit', 'allow', 'deny']).map((option) => <button key={option} type="button" className={state === option ? 'is-active' : ''} aria-pressed={state === option} onClick={() => onChange(key, option)}>{roleMode ? (option === 'inherit' ? 'Off' : 'On') : option === 'inherit' ? '—' : option === 'allow' ? 'Allow' : 'Deny'}</button>)}
      </div></div>;
    })}</div>
  </section>)}</div>;
}
