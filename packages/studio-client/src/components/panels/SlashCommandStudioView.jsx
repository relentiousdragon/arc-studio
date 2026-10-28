import React, { useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { useStudioEscape } from './useStudioEscape.js';
import { validateSlashCommandOptions } from '../../../../studio-server/src/engine/SlashCommandOptions.js';

const MAX_OPTIONS = 25;
const TEXT_TYPES = new Set([3, 4, 10]);
const PARAMETER_TYPES = [
  { value: 3, label: 'Text' }, { value: 4, label: 'Integer' }, { value: 10, label: 'Number' },
  { value: 5, label: 'Boolean' }, { value: 6, label: 'User' }, { value: 7, label: 'Channel' },
  { value: 8, label: 'Role' }, { value: 9, label: 'Mentionable' }, { value: 11, label: 'Attachment' }
];
const CHANNEL_TYPES = [[0, 'Text'], [1, 'Direct message'], [2, 'Voice'], [3, 'Group direct message'], [4, 'Category'], [5, 'Announcement'], [10, 'Announcement thread'], [11, 'Public thread'], [12, 'Private thread'], [13, 'Stage'], [14, 'Directory'], [15, 'Forum'], [16, 'Media']];
const CHOICE_MODES = [{ value: 'choices', label: 'Fixed choices' }, { value: 'autocomplete', label: 'Autocomplete' }];
const createLocalId = (kind) => `${kind}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const newParameter = (index) => ({ id: createLocalId('option'), name: `argument_${index + 1}`, description: '', type: 3, required: false, choices: [] });
const newSubcommand = (index) => ({ id: createLocalId('subcommand'), type: 1, name: `action_${index + 1}`, description: 'Describe this action', options: [] });
const newGroup = (index) => ({ id: createLocalId('subcommand-group'), type: 2, name: `group_${index + 1}`, description: 'Describe this group', options: [newSubcommand(0)] });

function updateItemAtPath(items, path, updater) {
  if (!path.length) return items;
  return items.map((item, index) => {
    if (index !== path[0]) return item;
    if (path.length === 1) return updater(item);
    return { ...item, options: updateItemAtPath(item.options || [], path.slice(1), updater) };
  });
}

function updateListAtPath(items, path, updater) {
  if (!path.length) return updater(items);
  return items.map((item, index) => index === path[0]
    ? { ...item, options: updateListAtPath(item.options || [], path.slice(1), updater) }
    : item);
}

function cleanOptions(options) {
  return options.map((option) => {
    const base = { ...option, name: String(option.name || '').trim(), description: String(option.description || '').trim() };
    if ([1, 2].includes(Number(option.type))) return { ...base, options: cleanOptions(option.options || []) };
    base.choices = (option.choices || []).map((choice) => ({
      ...choice,
      name: String(choice.name || '').trim(),
      value: [4, 10].includes(Number(option.type)) ? Number(choice.value) : String(choice.value ?? '')
    }));
    return base;
  });
}

function countArguments(options = []) {
  return options.reduce((count, option) => count + ([1, 2].includes(Number(option.type)) ? countArguments(option.options || []) : 1), 0);
}

export function SlashCommandStudioView({ commandName, options = [], collaborators = [], onDraftChange, onApply, onClose }) {
  const draft = Array.isArray(options) ? options : [];
  const [discardOpen, setDiscardOpen] = useState(false);
  const [appliedOptions] = useState(() => structuredClone(draft));
  const changed = JSON.stringify(draft) !== JSON.stringify(appliedOptions);
  const issue = validateSlashCommandOptions(draft, commandName)[0] || '';
  const requestClose = () => changed ? setDiscardOpen(true) : onClose?.();
  useStudioEscape(requestClose);
  const updateDraft = (updater) => onDraftChange?.(typeof updater === 'function' ? updater(draft) : updater);
  const updateItem = (path, patch) => updateDraft((current) => updateItemAtPath(current, path, (item) => ({ ...item, ...patch })));
  const updateList = (parentPath, updater) => updateDraft((current) => updateListAtPath(current, parentPath, updater));
  const addItem = (parentPath, item) => updateList(parentPath, (items) => items.length >= MAX_OPTIONS ? items : [...items, item]);
  const removeItem = (path) => updateList(path.slice(0, -1), (items) => items.filter((_item, index) => index !== path.at(-1)));
  const moveItem = (path, offset) => updateList(path.slice(0, -1), (items) => {
    const index = path.at(-1);
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  const apply = () => { if (!issue) onApply?.(cleanOptions(draft)); };
  const rootHasArguments = draft.some((item) => ![1, 2].includes(Number(item.type)));
  const rootHasCommands = draft.some((item) => [1, 2].includes(Number(item.type)));

  const renderOptionList = (items, parentPath = [], level = 0, parentType = 'root') => <div className={`slash-option-list level-${level}`}>
    {items.map((option, index) => {
      const path = [...parentPath, index];
      const type = Number(option.type) || 3;
      const structural = type === 1 || type === 2;
      const choices = Array.isArray(option.choices) ? option.choices : [];
      const mode = option.autocomplete ? 'autocomplete' : 'choices';
      const supportsChoices = TEXT_TYPES.has(type);
      const kindLabel = type === 1 ? 'Subcommand' : type === 2 ? 'Subcommand group' : PARAMETER_TYPES.find((item) => item.value === type)?.label || 'Argument';
      return <article className={`slash-option-card${structural ? ' is-structural' : ''}${type === 2 ? ' is-group' : ''}`} key={option.id || `${path.join('.')}:${option.name}`}>
        <header><span><b>{String(index + 1).padStart(2, '0')}</b><strong>{option.name || `New ${kindLabel.toLowerCase()}`}</strong><small>{kindLabel}{!structural ? option.required ? ' · Required' : ' · Optional' : ''}</small></span><div className="slash-option-order"><button type="button" title="Move up" aria-label={`Move ${option.name || kindLabel} up`} disabled={index === 0} onClick={() => moveItem(path, -1)}><ChevronUp size={15} /></button><button type="button" title="Move down" aria-label={`Move ${option.name || kindLabel} down`} disabled={index === items.length - 1} onClick={() => moveItem(path, 1)}><ChevronDown size={15} /></button><button type="button" className="is-danger" title={`Remove ${kindLabel.toLowerCase()}`} aria-label={`Remove ${option.name || kindLabel}`} onClick={() => removeItem(path)}><Trash2 size={14} /></button></div></header>
        <div className="slash-option-fields">
          <label><span className="slash-option-field-label"><span>{structural ? `${kindLabel} name` : 'Option name'}</span><small>{Array.from(String(option.name || '')).length}/32</small></span><input value={option.name || ''} maxLength={64} onChange={(event) => updateItem(path, { name: Array.from(event.target.value.toLowerCase()).slice(0, 32).join('') })} placeholder={type === 2 ? 'moderation' : type === 1 ? 'ban' : 'target'} autoCapitalize="none" autoCorrect="off" spellCheck="false" /></label>
          {!structural && <label>Type<AnimatedDropdown value={type} options={PARAMETER_TYPES} onChange={(value) => updateItem(path, { type: Number(value), autocomplete: false, choices: [], dynamicAutocomplete: false, channel_types: undefined, min_value: undefined, max_value: undefined, min_length: undefined, max_length: undefined })} ariaLabel={`Type for ${option.name || `argument ${index + 1}`}`} /></label>}
          <label className="slash-option-description"><span className="slash-option-field-label"><span>Description</span><small>{String(option.description || '').length}/100</small></span><input value={option.description || ''} maxLength={100} onChange={(event) => updateItem(path, { description: event.target.value })} placeholder={structural ? `What ${kindLabel.toLowerCase()} ${option.name || 'this'} handles` : 'What should the user provide?'} /></label>
          {!structural && <label className="slash-option-required"><AnimatedCheckbox checked={Boolean(option.required)} label={`Required ${option.name || `argument ${index + 1}`}`} onChange={(required) => updateItem(path, { required })} /><span>Required</span></label>}
        </div>
        {!structural && type === 7 && <details className="slash-option-advanced"><summary>Channel type filters <small>{option.channel_types?.length ? `${option.channel_types.length} selected` : 'All channel types'}</small></summary><div className="slash-channel-type-list">{CHANNEL_TYPES.map(([channelType, label]) => <label key={channelType}><AnimatedCheckbox checked={(option.channel_types || []).includes(channelType)} label={label} onChange={(checked) => updateItem(path, { channel_types: checked ? [...(option.channel_types || []), channelType] : (option.channel_types || []).filter((value) => value !== channelType) })} /><span>{label}</span></label>)}</div></details>}
        {!structural && [3, 4, 10].includes(type) && <details className="slash-option-advanced"><summary>Input limits</summary><div className="slash-option-bounds">{type === 3 ? <><label>Minimum length<input type="number" min="0" max="6000" value={option.min_length ?? ''} onChange={(event) => updateItem(path, { min_length: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label>Maximum length<input type="number" min="0" max="6000" value={option.max_length ?? ''} onChange={(event) => updateItem(path, { max_length: event.target.value === '' ? undefined : Number(event.target.value) })} /></label></> : <><label>Minimum value<input type="number" step={type === 4 ? '1' : 'any'} value={option.min_value ?? ''} onChange={(event) => updateItem(path, { min_value: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label>Maximum value<input type="number" step={type === 4 ? '1' : 'any'} value={option.max_value ?? ''} onChange={(event) => updateItem(path, { max_value: event.target.value === '' ? undefined : Number(event.target.value) })} /></label></>}</div></details>}
        {!structural && supportsChoices && <section className="slash-option-choices">
          <div className="slash-option-choice-toolbar"><label>Input<AnimatedDropdown value={mode} options={CHOICE_MODES} onChange={(value) => updateItem(path, { autocomplete: value === 'autocomplete', ...(value !== 'autocomplete' ? { dynamicAutocomplete: false } : {}) })} ariaLabel={`Input mode for ${option.name || `argument ${index + 1}`}`} /></label>{!option.dynamicAutocomplete && <button type="button" disabled={choices.length >= 25} onClick={() => updateItem(path, { choices: [...choices, { id: createLocalId('choice'), name: '', value: '' }] })}><Plus size={13} /> Add {mode === 'autocomplete' ? 'suggestion' : 'choice'}</button>}</div>
          {mode === 'autocomplete' && <label className="slash-dynamic-suggestions"><AnimatedCheckbox checked={Boolean(option.dynamicAutocomplete)} label={`Use graph-generated suggestions for ${option.name || `argument ${index + 1}`}`} onChange={(dynamicAutocomplete) => updateItem(path, { dynamicAutocomplete })} /><span>Build suggestions in the graph</span></label>}
          {option.dynamicAutocomplete ? <small>Use <b>On Command Autocomplete</b> and wire an array of {'{ name, value }'} objects into <b>Respond to Autocomplete</b>.</small> : <>
            {choices.length > 0 && <div className="slash-option-choice-head"><span>Shown to user</span><span>Value received by graph</span><span /></div>}
            {choices.map((choice, choiceIndex) => <div className="slash-option-choice-row" key={choice.id || choiceIndex}>
              <label className="slash-option-choice-input"><input value={choice.name || ''} maxLength={100} onChange={(event) => updateItem(path, { choices: choices.map((item, i) => i === choiceIndex ? { ...item, name: event.target.value } : item) })} placeholder={mode === 'autocomplete' ? 'Suggestion' : 'Choice'} aria-label={`${mode === 'autocomplete' ? 'Suggestion' : 'Choice'} shown to user`} /><small>{String(choice.name || '').length}/100</small></label>
              <label className={`slash-option-choice-input ${[4, 10].includes(type) ? 'is-number' : ''}`}><input type={[4, 10].includes(type) ? 'number' : 'text'} step={type === 4 ? '1' : 'any'} value={choice.value ?? ''} maxLength={[4, 10].includes(type) ? undefined : 100} onChange={(event) => updateItem(path, { choices: choices.map((item, i) => i === choiceIndex ? { ...item, value: [4, 10].includes(type) ? event.target.value : event.target.value.slice(0, 100) } : item) })} placeholder={[4, 10].includes(type) ? 'Number' : 'Submitted value'} aria-label="Value received by graph" />{![4, 10].includes(type) && <small>{String(choice.value ?? '').length}/100</small>}</label>
              <button type="button" title="Remove choice" aria-label="Remove choice" onClick={() => updateItem(path, { choices: choices.filter((_choice, i) => i !== choiceIndex) })}><Trash2 size={13} /></button>
            </div>)}
          </>}
          <small>{option.autocomplete ? 'Fixed suggestions are filtered by what the user types.' : 'The user must choose one of these values.'} Up to 25.</small>
        </section>}
        {structural && <div className="slash-option-nested">
          {renderOptionList(option.options || [], path, level + 1, type === 2 ? 'group' : 'subcommand')}
          <div className="slash-option-nested-actions">{type === 2
            ? <button type="button" disabled={(option.options || []).length >= MAX_OPTIONS} onClick={() => addItem(path, newSubcommand(option.options?.length || 0))}><Plus size={13} /> Add subcommand</button>
            : <button type="button" disabled={(option.options || []).length >= MAX_OPTIONS} onClick={() => addItem(path, newParameter(option.options?.length || 0))}><Plus size={13} /> Add argument</button>}</div>
        </div>}
      </article>;
    })}
    {parentType === 'root' && <div className="slash-option-root-actions">
      <button type="button" disabled={items.length >= MAX_OPTIONS || rootHasCommands} onClick={() => addItem([], newParameter(items.length))}><Plus size={14} /> Add argument</button>
      <button type="button" disabled={items.length >= MAX_OPTIONS || rootHasArguments} onClick={() => addItem([], newSubcommand(items.length))}><Plus size={14} /> Add subcommand</button>
      <button type="button" disabled={items.length >= MAX_OPTIONS || rootHasArguments} onClick={() => addItem([], newGroup(items.length))}><Plus size={14} /> Add group</button>
    </div>}
  </div>;

  return <section className="slash-command-studio" aria-label="Slash command argument editor">
    <header className="slash-command-studio-header">
      <button type="button" className="permission-studio-back" onClick={requestClose}><ArrowLeft size={16} /> Back</button>
      <div className="permission-studio-title"><div><h1>Command options</h1><p>/{commandName || 'command'} · {countArguments(draft)} arguments</p></div></div>
      <button type="button" className="permission-studio-apply" onClick={apply} disabled={Boolean(issue)}><Check size={15} /> Apply</button>
    </header>
    <div className="slash-command-studio-toolbar"><span>{collaborators.length ? `Editing with ${collaborators.map((peer) => peer.username).join(', ')}` : 'Use arguments, subcommands, or groups. Discord supports one group level, with subcommands inside each group.'}</span></div>
    <div className="slash-command-studio-scroll" onWheel={(event) => event.stopPropagation()} tabIndex={0} aria-label="Command option fields">
      {!draft.length && <div className="slash-command-studio-empty"><strong>No options</strong><span>Arguments collect values, subcommands select an action, and groups organize subcommands.</span></div>}
      {renderOptionList(draft)}
      {issue && <p className="slash-command-studio-error" role="alert">{issue}</p>}
    </div>
    <Modal isOpen={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard option changes?" subtitle="These edits have not been applied to the graph." footer={<><Button variant="secondary" onClick={() => setDiscardOpen(false)}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard changes</Button></>}><p className="close-graph-copy">The command will keep its current options until you choose Apply.</p></Modal>
  </section>;
}
