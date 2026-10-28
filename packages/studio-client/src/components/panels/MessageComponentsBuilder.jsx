import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';
import { DiscordTextField } from '../ui/DiscordTextField.jsx';
import { CustomEmoji } from '../ui/CustomEmoji.jsx';
//
export const BUTTON_STYLES = [
  { value: 'primary', label: 'Primary (Blurple)', color: '#5865F2' },
  { value: 'secondary', label: 'Secondary (Grey)', color: '#4E5058' },
  { value: 'success', label: 'Success (Green)', color: '#248046' },
  { value: 'danger', label: 'Danger (Red)', color: '#DA373C' },
  { value: 'link', label: 'Link (URL)', color: '#4E5058', isLink: true }
];

export const SELECT_TYPES = [
  { value: 'string_select', label: 'Text options' },
  { value: 'user_select', label: 'User select' },
  { value: 'role_select', label: 'Role select' },
  { value: 'mentionable_select', label: 'Users & roles select' },
  { value: 'channel_select', label: 'Channel select' }
];

export const SELECT_COMPONENT_TYPES = {
  string_select: 3,
  user_select: 5,
  role_select: 6,
  mentionable_select: 7,
  channel_select: 8
};

const componentId = () => `component_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`}`;

export function parseDiscordEmoji(input, appEmojis = []) {
  if (!input) return undefined;
  if (typeof input === 'object') {
    const id = input.id == null ? '' : String(input.id);
    const name = String(input.name || '');
    if (id && name && /^[a-zA-Z0-9_~]{2,32}$/.test(name) && /^\d+$/.test(id)) {
      return {
        id,
        name,
        ...(input.animated ? { animated: true } : {})
      };
    }
    return isSingleUnicodeEmoji(name) ? { name } : undefined;
  }
  const str = String(input).trim();
  if (!str) return undefined;
  const match = /^<(a?):([a-zA-Z0-9_~]{2,32}):(\d+)>$/.exec(str);
  if (match) {
    return {
      name: match[2],
      id: match[3],
      ...(match[1] === 'a' ? { animated: true } : {})
    };
  }
  const unbracketed = /^(?:(a):)?([a-zA-Z0-9_~]{2,32}):(\d+)$/.exec(str);
  if (unbracketed) {
    return {
      name: unbracketed[2],
      id: unbracketed[3],
      ...(unbracketed[1] === 'a' ? { animated: true } : {})
    };
  }
  const shortcode = /^:([a-zA-Z0-9_~]{2,32}):$/.exec(str);
  const found = shortcode && Array.isArray(appEmojis)
    ? appEmojis.find((emoji) => emoji?.name?.toLowerCase() === shortcode[1].toLowerCase())
    : null;
  if (found?.id && found.name) {
    return { id: String(found.id), name: found.name, ...(found.animated ? { animated: true } : {}) };
  }
  return isSingleUnicodeEmoji(str) ? { name: str } : undefined;
}

function isSingleUnicodeEmoji(value) {
  const text = String(value || '').trim();
  if (!text || !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text)) return false;
  if (typeof Intl.Segmenter !== 'function') return Array.from(text).length === 1;
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length === 1;
}

function emojiFieldValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (value.id && value.name) return `<${value.animated ? 'a' : ''}:${value.name}:${value.id}>`;
    return String(value.name || '');
  }
  return '';
}

function isEmojiFieldDraft(value, appEmojis) {
  if (!value) return true;
  if (parseDiscordEmoji(value, appEmojis)) return true;
  return /^:[a-z\d_+-]*$/i.test(value)
    || /^:[a-z\d_~]{2,32}:$/i.test(value)
    || /^<(?:a)?(?::[a-z\d_~]{0,32}(?::\d{0,24}>?)?)?$/i.test(value);
}

function SingleEmojiField({ value, appEmojis = [], onChange, ...props }) {
  const fieldValue = emojiFieldValue(value);
  const updateValue = (rawValue) => {
    const next = String(rawValue || '').trim();
    if (isEmojiFieldDraft(next, appEmojis)) onChange?.(next);
  };
  useEffect(() => {
    if (fieldValue && !isEmojiFieldDraft(fieldValue.trim(), appEmojis)) onChange?.('');
  }, [appEmojis, fieldValue, onChange]);
  const finishValue = () => {
    if (fieldValue && !parseDiscordEmoji(fieldValue, appEmojis)) onChange?.('');
  };
  return <DiscordTextField
    {...props}
    as="input"
    discordAutocomplete
    appEmojis={appEmojis}
    value={fieldValue}
    maxLength={100}
    autoCapitalize="none"
    autoCorrect="off"
    spellCheck={false}
    onChange={(event) => updateValue(event.target.value)}
    onBlur={finishValue}
  />;
}

export function renderComponentEmoji(emoji, appEmojis = []) {
  if (!emoji) return null;
  const parsed = parseDiscordEmoji(emoji, appEmojis);
  if (!parsed) return null;
  if (parsed.id) {
    const ext = parsed.animated ? 'gif' : 'webp';
    const url = `https://cdn.discordapp.com/emojis/${encodeURIComponent(parsed.id)}.${ext}?size=48&quality=lossless`;
    return <CustomEmoji src={url} alt={`:${parsed.name}:`} className="component-emoji-frame" />;
  }
  if (parsed.name) {
    return <span className="component-emoji-text">{parsed.name}</span>;
  }
  return null;
}

export function createComponentRow() {
  return { id: componentId(), components: [] };
}

export function createMessageButton(style = 'primary', label = 'Button 1', emoji = '') {
  return {
    id: componentId(),
    type: 'button',
    style,
    label,
    emoji,
    customId: style === 'link' ? '' : `btn_${Math.random().toString(36).slice(2, 7)}`,
    url: style === 'link' ? 'https://discord.com' : '',
    disabled: false
  };
}

export function createStringSelect() {
  return {
    id: componentId(),
    type: 'string_select',
    customId: `select_${Math.random().toString(36).slice(2, 7)}`,
    placeholder: 'Select an option…',
    minValues: 1,
    maxValues: 1,
    options: [
      { id: componentId(), label: 'Option 1', value: 'opt_1', description: '', emoji: '' }
    ]
  };
}

export function toDiscordComponents(rows = [], appEmojis = []) {
  return rows.filter((row) => row.components?.length).slice(0, 5).map((row) => ({
    type: 1,
    components: row.components.slice(0, 5).map((component) => SELECT_COMPONENT_TYPES[component.type] ? {
      type: SELECT_COMPONENT_TYPES[component.type],
      custom_id: String(component.customId || '').slice(0, 100),
      placeholder: String(component.placeholder || '').slice(0, 150) || undefined,
      min_values: Math.max(0, Math.min(25, Number(component.minValues) || 0)),
      max_values: Math.max(1, Math.min(25, Number(component.maxValues) || 1)),
      ...(component.type === 'string_select' ? {
        options: (component.options || []).slice(0, 25).map((option) => ({
          label: String(option.label || '').slice(0, 100),
          value: String(option.value || '').slice(0, 100),
          ...(option.description ? { description: String(option.description).slice(0, 100) } : {}),
          ...(option.emoji ? { emoji: parseDiscordEmoji(option.emoji, appEmojis) } : {})
        }))
      } : {}),
      ...(component.type === 'channel_select' && component.channelTypes?.length ? {
        channel_types: component.channelTypes.slice(0, 8).map(Number).filter(Number.isInteger)
      } : {})
    } : {
      type: 2,
      style: ({ primary: 1, secondary: 2, success: 3, danger: 4, link: 5 })[component.style] || 1,
      label: String(component.label || '').slice(0, 80),
      ...(component.emoji ? { emoji: parseDiscordEmoji(component.emoji, appEmojis) } : {}),
      ...(component.style === 'link' ? { url: String(component.url || '').slice(0, 512) } : { custom_id: String(component.customId || '').slice(0, 100) }),
      disabled: component.style === 'link' ? false : Boolean(component.disabled)
    })
  }));
}

export function MessageComponentsBuilder({
  rows = [],
  messageContent = '',
  onMessageContentChange,
  isContentWired = false,
  appEmojis = [],
  graphVariables = [],
  onChange,
  allowMultipleRows = true,
  selectedComponentId = null,
  onSelectComponent = null,
  focusedRowId = null,
  onFocusRow = null,
  focusOnly = false,
  canAddComponent = true
}) {
  const [internalSelectedId, setInternalSelectedId] = useState(null);
  const activeSelectedId = selectedComponentId !== null ? selectedComponentId : internalSelectedId;

  const setSelected = (id) => {
    setInternalSelectedId(id);
    onSelectComponent?.(id);
  };

  const update = (nextRows) => onChange?.(nextRows);

  const patchRow = (rowId, patch) => {
    update(rows.map((row) => row.id === rowId ? { ...row, ...patch } : row));
  };

  const patchComponent = (rowId, targetComponentId, patch) => {
    update(rows.map((row) => row.id === rowId ? {
      ...row,
      components: row.components.map((item) => item.id === targetComponentId ? { ...item, ...patch } : item)
    } : row));
  };

  const removeRow = (rowId) => {
    const rowToRemove = rows.find((r) => r.id === rowId);
    if (rowToRemove?.components.some((c) => c.id === activeSelectedId)) {
      setSelected(null);
    }
    update(rows.filter((row) => row.id !== rowId));
  };

  const moveRow = (rowIndex, offset) => {
    const target = rowIndex + offset;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[rowIndex], next[target]] = [next[target], next[rowIndex]];
    update(next);
  };

  const addRow = () => {
    if (rows.length >= 5 || !canAddComponent) return;
    const newRow = createComponentRow();
    update([...rows, newRow]);
  };

  const addButton = (row) => {
    if (row.components.length >= 5 || !canAddComponent) return;
    const newBtn = createMessageButton('primary', `Button ${row.components.length + 1}`);
    patchRow(row.id, { components: [...row.components, newBtn] });
    setSelected(newBtn.id);
  };

  const addSelect = (row) => {
    if (!canAddComponent) return;
    const newSelect = createStringSelect();
    patchRow(row.id, { components: [newSelect] });
    setSelected(newSelect.id);
  };

  const addPaletteItem = (type) => {
    if (!canAddComponent) return;
    if (type !== 'row') {
      const compatibleRow = rows.find((row) => type === 'button'
        ? row.components.length < 5 && !row.components.some((component) => SELECT_COMPONENT_TYPES[component.type])
        : row.components.length === 0);
      if (compatibleRow) {
        const component = type === 'button' ? createMessageButton('primary', `Button ${compatibleRow.components.length + 1}`) : createStringSelect();
        patchRow(compatibleRow.id, { components: [...compatibleRow.components, component] });
        onFocusRow?.(compatibleRow.id, component.id);
        setSelected(component.id);
        return;
      }
    }
    if (rows.length >= 5) return;
    const row = createComponentRow();
    let selectedId = null;
    if (type === 'button') {
      const button = createMessageButton();
      row.components = [button];
      selectedId = button.id;
    } else if (type === 'select') {
      const menu = createStringSelect();
      row.components = [menu];
      selectedId = menu.id;
    }
    update([...rows, row]);
    onFocusRow?.(row.id, selectedId);
    setSelected(selectedId);
  };

  const removeComponent = (row, itemId) => {
    if (activeSelectedId === itemId) setSelected(null);
    patchRow(row.id, { components: row.components.filter((item) => item.id !== itemId) });
  };

  const moveComponent = (row, componentIndex, offset) => {
    const target = componentIndex + offset;
    if (target < 0 || target >= row.components.length) return;
    const components = [...row.components];
    [components[componentIndex], components[target]] = [components[target], components[componentIndex]];
    patchRow(row.id, { components });
  };

  const patchOption = (row, menu, optionId, patch) => {
    patchComponent(row.id, menu.id, {
      options: menu.options.map((option) => option.id === optionId ? { ...option, ...patch } : option)
    });
  };

  return (
    <div className="message-components-builder">
      {!focusOnly && <div className="component-builder-heading">
        <div>
          <strong>{allowMultipleRows ? 'Action Rows & Interactive Components' : 'Interactive Controls'}</strong>
          <span>{allowMultipleRows ? 'Compose up to 5 action rows. Each row can hold up to 5 buttons or 1 select menu.' : 'This row can hold up to 5 buttons or one select menu.'}</span>
        </div>
        {allowMultipleRows && <button
          type="button"
          className="component-add-row"
          disabled={rows.length >= 5 || !canAddComponent}
          onClick={addRow}
          title={rows.length >= 5 ? 'Discord supports at most 5 action rows' : 'Add a new action row'}
        >
          <Plus size={13} /> Add Row
        </button>}
      </div>}

      {focusOnly && allowMultipleRows && <div className="component-creation-palette" aria-label="Add message components">
        {[['button', 'Button'], ['select', 'Select menu'], ['row', 'Action row']].map(([type, label]) => {
          const hasCompatibleRow = rows.some((row) => type === 'button'
            ? row.components.length < 5 && !row.components.some((component) => SELECT_COMPONENT_TYPES[component.type])
            : type === 'select' && row.components.length === 0);
          const disabled = !canAddComponent || (type === 'row' ? rows.length >= 5 : rows.length >= 5 && !hasCompatibleRow);
          return <button key={type} type="button" draggable={!disabled} disabled={disabled} onClick={() => addPaletteItem(type)} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-arc-studio-palette', JSON.stringify({ kind: 'palette', scope: 'components', type })); }} title={disabled ? 'Discord supports at most 5 action rows' : `Add or drag ${label.toLowerCase()} to the preview`}><Plus size={13} />{label}</button>;
        })}
      </div>}

      <div className="component-rows-stack">
        {rows.map((row, sourceRowIndex) => {
          if (focusOnly && row.id !== focusedRowId) return null;
          const rowIndex = sourceRowIndex;
          const isSelectRow = row.components.length > 0 && SELECT_COMPONENT_TYPES[row.components[0]?.type];
          const canAddMoreButtons = canAddComponent && !isSelectRow && row.components.length > 0 && row.components.length < 5;

          return (
            <section className="component-action-row" key={row.id}>
              <header className="component-action-row-header">
                <div className="component-action-row-meta">
                  <span className="component-row-badge">Row {rowIndex + 1}</span>
                  <span className="component-row-count">
                    {isSelectRow ? 'Select Menu' : `${row.components.length}/5 buttons`}
                  </span>
                </div>
                <div className="component-action-row-tools">
                  <button
                    type="button"
                    disabled={rowIndex === 0}
                    aria-label={`Move action row ${rowIndex + 1} up`}
                    title="Move row up"
                    onClick={() => moveRow(rowIndex, -1)}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={rowIndex === rows.length - 1}
                    aria-label={`Move action row ${rowIndex + 1} down`}
                    title="Move row down"
                    onClick={() => moveRow(rowIndex, 1)}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    aria-label={`Remove action row ${rowIndex + 1}`}
                    title="Delete action row"
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </header>

              <div className="component-visual-row-track">
                {!row.components.length && (
                  <div className="component-row-empty">
                    <span className="component-empty-label">Empty row:</span>
                    <button type="button" disabled={!canAddComponent} className="component-quick-add-btn" onClick={() => addButton(row)}>
                      <Plus size={13} /> Add Button
                    </button>
                    <button type="button" disabled={!canAddComponent} className="component-quick-add-btn" onClick={() => addSelect(row)}>
                      <Plus size={13} /> Add Select Menu
                    </button>
                  </div>
                )}

                {row.components.map((component, componentIndex) => {
                  const isSelected = activeSelectedId === component.id;

                  if (SELECT_COMPONENT_TYPES[component.type]) {
                    return (
                      <div
                        key={component.id}
                        className={`component-chip-select ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelected(isSelected ? null : component.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="component-chip-icon">⌄</span>
                        <span className="component-chip-label">
                          {component.placeholder || 'Select Menu'}
                        </span>
                        <span className="component-chip-type-tag">
                          {SELECT_TYPES.find((t) => t.value === component.type)?.label || 'Select'}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={component.id}
                      type="button"
                      className={`component-chip-button is-style-${component.style || 'primary'} ${component.disabled ? 'is-disabled' : ''} ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelected(isSelected ? null : component.id)}
                      title={`Click to configure "${component.label || 'Button'}"`}
                    >
                      <span className="component-chip-button-label">
                        {renderComponentEmoji(component.emoji, appEmojis)}
                        <span>{component.label || 'Button'}</span>
                      </span>
                      {component.style === 'link' && (
                        <ExternalLink size={12} className="component-chip-link-icon" />
                      )}
                    </button>
                  );
                })}

                {canAddMoreButtons && (
                  <button
                    type="button"
                    className="component-track-add-btn"
                    onClick={() => addButton(row)}
                    title="Add another button to this row"
                  >
                    <Plus size={13} /> Button
                  </button>
                )}
              </div>

              {row.components.some((c) => c.id === activeSelectedId) && (() => {
                const component = row.components.find((c) => c.id === activeSelectedId);
                const componentIndex = row.components.findIndex((c) => c.id === activeSelectedId);
                if (!component) return null;

                if (SELECT_COMPONENT_TYPES[component.type]) {
                  return (
                    <div className="component-inspector-card">
                      <div className="component-inspector-header">
                        <strong>Edit Select Menu</strong>
                        <div className="component-inspector-actions">
                          <button
                            type="button"
                            className="is-danger"
                            title="Remove select menu"
                            onClick={() => removeComponent(row, component.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                          <button
                            type="button"
                            title="Close inspector"
                            onClick={() => setSelected(null)}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="component-inspector-grid">
                        <label className="component-field">
                          <span>Menu Type</span>
                          <AnimatedDropdown
                            value={component.type}
                            options={SELECT_TYPES}
                            onChange={(type) => patchComponent(row.id, component.id, {
                              type,
                              ...(type === 'string_select' && !component.options?.length ? {
                                options: [{ id: componentId(), label: '', value: '' }]
                              } : {})
                            })}
                            ariaLabel="Select menu type"
                            className="node-select"
                          />
                        </label>

                        <label className="component-field">
                          <span>Custom ID</span>
                          <DiscordTextField templateAutocomplete graphVariables={graphVariables}
                            value={component.customId}
                            maxLength={100}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={(event) => patchComponent(row.id, component.id, { customId: event.target.value })}
                            placeholder="e.g. topic_selector"
                          />
                        </label>

                        <label className="component-field full-width">
                          <span>Placeholder</span>
                          <DiscordTextField templateAutocomplete graphVariables={graphVariables}
                            value={component.placeholder}
                            maxLength={150}
                            onChange={(event) => patchComponent(row.id, component.id, { placeholder: event.target.value })}
                            placeholder="Choose an option…"
                          />
                        </label>
                      </div>

                      {component.type === 'string_select' && (
                        <div className="component-option-list">
                          <div className="component-option-heading">
                            <span>Options ({component.options?.length || 0}/25)</span>
                            <button
                              type="button"
                              disabled={(component.options || []).length >= 25}
                              onClick={() => patchComponent(row.id, component.id, {
                                options: [...(component.options || []), { id: componentId(), label: '', value: '' }]
                              })}
                            >
                              <Plus size={11} /> Add option
                            </button>
                          </div>
                          <div className="component-options-scroll">
                            {(component.options || []).map((option, index) => (
                              <div className="component-option-item" key={option.id}>
                                <div className="component-option-num" title={option.emoji ? (typeof option.emoji === 'string' ? option.emoji : option.emoji.name) : undefined}>
                                  {option.emoji ? renderComponentEmoji(option.emoji, appEmojis) : index + 1}
                                </div>
                                <SingleEmojiField
                                  aria-label={`Option ${index + 1} emoji`}
                                  value={option.emoji || ''}
                                  className="component-option-emoji-input"
                                  onChange={(emoji) => patchOption(row, component, option.id, { emoji })}
                                  placeholder="Type : for emoji suggestions"
                                  title="One Unicode or custom emoji"
                                />
                                <DiscordTextField
                                  templateAutocomplete
                                  graphVariables={graphVariables}
                                  aria-label={`Option ${index + 1} label`}
                                  value={option.label}
                                  maxLength={100}
                                  onChange={(event) => patchOption(row, component, option.id, { label: event.target.value })}
                                  placeholder="Option label"
                                />
                                <DiscordTextField
                                  templateAutocomplete
                                  graphVariables={graphVariables}
                                  aria-label={`Option ${index + 1} value`}
                                  value={option.value}
                                  maxLength={100}
                                  onChange={(event) => patchOption(row, component, option.id, { value: event.target.value })}
                                  placeholder="value_id"
                                />
                                <DiscordTextField
                                  templateAutocomplete
                                  graphVariables={graphVariables}
                                  aria-label={`Option ${index + 1} description`}
                                  value={option.description || ''}
                                  maxLength={100}
                                  onChange={(event) => patchOption(row, component, option.id, { description: event.target.value })}
                                  placeholder="Description (optional)"
                                />
                                <button
                                  type="button"
                                  title="Remove option"
                                  disabled={(component.options || []).length <= 1}
                                  onClick={() => patchComponent(row.id, component.id, {
                                    options: (component.options || []).filter((item) => item.id !== option.id)
                                  })}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="component-select-limits">
                        <label>
                          <span>Min selections</span>
                          <input
                            type="number"
                            min="0"
                            max="25"
                            value={component.minValues ?? 1}
                            onChange={(event) => patchComponent(row.id, component.id, { minValues: Math.max(0, Number(event.target.value)) })}
                          />
                        </label>
                        <label>
                          <span>Max selections</span>
                          <input
                            type="number"
                            min="1"
                            max="25"
                            value={component.maxValues ?? 1}
                            onChange={(event) => patchComponent(row.id, component.id, { maxValues: Math.max(1, Number(event.target.value)) })}
                          />
                        </label>
                      </div>
                    </div>
                  );
                }
//
                return (
                  <div className="component-inspector-card">
                    <div className="component-inspector-header">
                      <div className="component-inspector-title">
                        <strong>Edit Button {componentIndex + 1}</strong>
                        <span>({component.style || 'primary'})</span>
                      </div>
                      <div className="component-inspector-actions">
                        <button
                          type="button"
                          disabled={componentIndex === 0}
                          title="Move button left"
                          onClick={() => moveComponent(row, componentIndex, -1)}
                        >
                          <ArrowLeft size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={componentIndex === row.components.length - 1}
                          title="Move button right"
                          onClick={() => moveComponent(row, componentIndex, 1)}
                        >
                          <ArrowRight size={12} />
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          title="Remove button"
                          onClick={() => removeComponent(row, component.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          type="button"
                          title="Close inspector"
                          onClick={() => setSelected(null)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
//
                    <div className="component-style-selector">
                      <span className="component-style-label">Style:</span>
                      <div className="component-style-pills">
                        {BUTTON_STYLES.map((style) => (
                          <button
                            key={style.value}
                            type="button"
                            className={`component-style-pill is-style-${style.value} ${(component.style || 'primary') === style.value ? 'is-active' : ''}`}
                            onClick={() => patchComponent(row.id, component.id, {
                              style: style.value,
                              ...(style.value === 'link' ? { customId: '', url: component.url || 'https://', disabled: false } : { url: '', customId: component.customId || `btn_${Math.random().toString(36).slice(2, 7)}` })
                            })}
                          >
                            <span className="style-pill-dot" style={{ backgroundColor: style.color }} />
                            <span>{style.label.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="component-inspector-grid">
                      <label className="component-field">
                        <span>Button Label</span>
                        <DiscordTextField templateAutocomplete graphVariables={graphVariables}
                          value={component.label}
                          maxLength={80}
                          onChange={(event) => patchComponent(row.id, component.id, { label: event.target.value })}
                          placeholder="e.g. Click Me"
                        />
                      </label>

                      <label className="component-field">
                        <span>Button Emoji</span>
                        <SingleEmojiField
                          appEmojis={appEmojis}
                          value={component.emoji || ''}
                          onChange={(emoji) => patchComponent(row.id, component.id, { emoji })}
                          placeholder="Type : for emoji suggestions"
                          title="One Unicode or custom emoji"
                        />
                      </label>

                      {component.style === 'link' ? (
                        <label className="component-field full-width">
                          <span>Link URL</span>
                          <DiscordTextField templateAutocomplete graphVariables={graphVariables}
                            type="url"
                            value={component.url}
                            maxLength={512}
                            onChange={(event) => patchComponent(row.id, component.id, { url: event.target.value })}
                            placeholder="https://example.com"
                          />
                        </label>
                      ) : (
                        <label className="component-field full-width">
                          <span>Custom ID</span>
                          <DiscordTextField templateAutocomplete graphVariables={graphVariables}
                            value={component.customId}
                            maxLength={100}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={(event) => patchComponent(row.id, component.id, { customId: event.target.value })}
                            placeholder="e.g. accept_button"
                          />
                        </label>
                      )}
                    </div>

                    {component.style !== 'link' && (
                      <div className="component-inspector-footer">
                        <div className="component-disabled-option">
                          <AnimatedCheckbox
                            checked={component.disabled}
                            onChange={(disabled) => patchComponent(row.id, component.id, { disabled })}
                            label="Disabled button"
                          />
                          <button type="button" className="component-disabled-option-label" aria-pressed={Boolean(component.disabled)} onClick={() => patchComponent(row.id, component.id, { disabled: !component.disabled })}>Disabled state (user cannot click)</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          );
        })}

        {!rows.length && (
          <div className="component-builder-empty">
            <p>No action rows added yet.</p>
            <button type="button" className="component-add-row-primary" disabled={!canAddComponent} onClick={addRow}>
              <Plus size={14} /> Add First Action Row
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
