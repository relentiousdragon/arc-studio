import React, { useRef, useState } from 'react';
import { AnimatedCheckbox } from '../ui/CustomControls.jsx';
import {
  ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleOff, Clock3,
  Image, Link2, Palette, Plus, Trash2, Type, User
} from 'lucide-react';
import { DiscordTextField } from '../ui/DiscordTextField.jsx';
import { TemplateVariableHints } from '../ui/TemplateVariableHints.jsx';
import { DiscordLongTextField, LONG_TEXT_THRESHOLD } from '../ui/DiscordLongTextField.jsx';
import { AttachmentUrlInput } from '../ui/AttachmentUrlInput.jsx';
import { getTextTemplateSlots } from './nodeDefinitions.js';
//
export const EmbedBlockTypes = [
  { type: 'title', label: 'Title', icon: Type },
  { type: 'description', label: 'Message', icon: Type },
  { type: 'field', label: 'Field', icon: Type },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'thumbnail', label: 'Thumbnail', icon: Image },
  { type: 'author', label: 'Author', icon: User },
  { type: 'footer', label: 'Footer', icon: Type },
  { type: 'url', label: 'Title URL', icon: Link2 },
  { type: 'timestamp', label: 'Timestamp', icon: Clock3 }
];

export const DISCORD_COLOR_PRESETS = [
  { label: 'Blurple', value: '#5865F2' },
  { label: 'Green', value: '#57F287' },
  { label: 'Yellow', value: '#FEE75C' },
  { label: 'Fuchsia', value: '#EB459E' },
  { label: 'Red', value: '#ED4245' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'Grey', value: '#4E5058' },
  { label: 'Dark', value: '#2B2D31' }
];

export function getEmbedBlocks(data = {}) {
  if (Array.isArray(data.blocks)) {
    const hasFooter = data.blocks.some((block) => block?.type === 'footer');
    return data.blocks.filter((block) => block?.type !== 'timestamp' || hasFooter);
  }
  const blocks = [];
  if (data.title) blocks.push({ id: 'legacy_title', type: 'title', value: data.title });
  if (data.description) blocks.push({ id: 'legacy_description', type: 'description', value: data.description });
  if (data.url) blocks.push({ id: 'legacy_url', type: 'url', value: data.url });
  if (data.timestamp) blocks.push({ id: 'legacy_timestamp', type: 'timestamp', value: data.timestamp });
  if (data.color) blocks.push({ id: 'legacy_color', type: 'color', value: data.color });
  if (data.author_name || data.author_url || data.author_icon) {
    blocks.push({
      id: 'legacy_author',
      type: 'author',
      name: data.author_name || '',
      url: data.author_url || '',
      icon: data.author_icon || ''
    });
  }
  if (data.footer_text || data.footer_icon) {
    blocks.push({
      id: 'legacy_footer',
      type: 'footer',
      text: data.footer_text || '',
      icon: data.footer_icon || ''
    });
  }
  if (data.thumbnail_url) blocks.push({ id: 'legacy_thumbnail', type: 'thumbnail', url: data.thumbnail_url });
  if (data.image_url) blocks.push({ id: 'legacy_image', type: 'image', url: data.image_url });
  for (const field of Array.isArray(data.fields) ? data.fields : []) {
    blocks.push({
      id: field.id || makeId(),
      type: 'field',
      name: field.name || '',
      value: field.value || '',
      inline: Boolean(field.inline)
    });
  }
  return blocks;
}

export function createEmbedBlock(type) {
  const block = { id: makeId(), type };
  if (type === 'field') return { ...block, name: '', value: '', inline: false };
  if (type === 'author') return { ...block, name: '', url: '', icon: '' };
  if (type === 'footer') return { ...block, text: '', icon: '' };
  if (type === 'timestamp') return { ...block, value: '', now: true };
  if (type === 'image' || type === 'thumbnail' || type === 'url') return { ...block, url: '' };
  if (type === 'color') return { ...block, value: '#5865F2' };
  return { ...block, value: '' };
}

export function getEmbedFieldSocketLabels(field, fieldIndex, fields = []) {
  const configuredName = String(field?.name || '').trim().replace(/\s+/g, ' ');
  const duplicateName = configuredName && fields.filter((item) => String(item?.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === configuredName.toLowerCase()).length > 1;
  const fieldLabel = configuredName
    ? `${configuredName}${duplicateName ? ` · Field ${fieldIndex + 1}` : ''}`
    : `Field ${fieldIndex + 1}`;
  return {
    name: configuredName ? fieldLabel : `${fieldLabel} name`,
    value: `${fieldLabel} value`
  };
}

export function embedBlockTemplateSlots(blocks = [], graphVariables = []) {
  const knownVariables = new Set(graphVariables.map((variable) => variable.name?.toLowerCase()).filter(Boolean));
  const slots = new Set();
  for (const block of blocks) {
    const fields = block.type === 'title' || block.type === 'description' ? ['value']
      : block.type === 'url' ? ['url']
        : block.type === 'author' ? ['name', 'url', 'icon']
          : block.type === 'footer' ? ['text', 'icon']
            : block.type === 'image' || block.type === 'thumbnail' ? ['url']
              : block.type === 'field' ? ['name', 'value'] : [];
    for (const field of fields) {
      for (const name of getTextTemplateSlots(block[field])) {
        if (!knownVariables.has(name.toLowerCase()) && !/^arg\d+$/i.test(name)) slots.add(name);
      }
    }
  }
  return [...slots].map((name) => ({ id: `slot_${name}`, label: name, type: 'arg', defaultValue: '' }));
}

export function embedBlockPins(blocks = [], graphVariables = []) {
  const fields = blocks.filter((block) => block.type === 'field');
  let fieldIndex = -1;
  const blockPins = blocks.flatMap((block) => {
    const stringPin = (id, label) => ({ id: `block_${block.id}_${id}`, label, type: 'string', defaultValue: block[id] || '' });
    if (block.type === 'title') return [stringPin('value', 'Title')];
    if (block.type === 'description') return [stringPin('value', 'Message')];
    if (block.type === 'url') return [stringPin('url', 'Title URL')];
    if (block.type === 'timestamp') return block.now ? [] : [stringPin('value', 'Timestamp')];
    if (block.type === 'color') return [stringPin('value', 'Color')];
    if (block.type === 'author') return [stringPin('name', 'Author'), stringPin('url', 'Author URL'), stringPin('icon', 'Author icon')];
    if (block.type === 'footer') return [stringPin('text', 'Footer'), stringPin('icon', 'Footer icon')];
    if (block.type === 'image' || block.type === 'thumbnail') return [stringPin('url', block.type === 'image' ? 'Image URL' : 'Thumbnail URL')];
    if (block.type === 'field') {
      fieldIndex += 1;
      const labels = getEmbedFieldSocketLabels(block, fieldIndex, fields);
      return [stringPin('name', labels.name), stringPin('value', labels.value)];
    }
    return [];
  });
  return [...blockPins, ...embedBlockTemplateSlots(blocks, graphVariables)];
}

export function EmbedNodeBuilder({
  data = {},
  onChange,
  mode = 'node',
  hasParentNode = mode === 'node',
  onOpenStudio,
  onOpenTextStudio,
  templateSuggestions = [],
  validation = {},
  connectedInputIds = new Set(),
  wiredFields = {},
  appEmojis = [],
  attachments = [],
  graphVariables = [],
  templateValuePaths = [],
  templatePreviewValues = {},
  focusedBlockId = null,
  focusOnly = false,
  onFocusBlock
}) {
  const blocks = getEmbedBlocks(data);
  const visibleBlocks = blocks.filter((block) => block.type !== 'color' && (!focusOnly || block.id === focusedBlockId));
  const [dropTarget, setDropTarget] = useState(null);
  const [collapsedBlockIds, setCollapsedBlockIds] = useState(() => mode === 'studio' ? new Set(blocks.map((block) => block.id)) : new Set());
  const [recentColors, setRecentColors] = useState(() => {
    try {
      const validColors = (value) => Array.isArray(value) ? value.filter((color) => /^#[\da-f]{6}$/i.test(color)).map((color) => color.toUpperCase()) : [];
      const storedPalette = localStorage.getItem('arc_embed_color_palette_v2');
      if (storedPalette) {
        const palette = [...new Set(validColors(JSON.parse(storedPalette)))].slice(0, 8);
        return [...palette, ...DISCORD_COLOR_PRESETS.map((preset) => preset.value).filter((color) => !palette.includes(color))].slice(0, 8);
      }
      // Older builds stored only chosen colors, replacing the full preset row.
      // Keep a few of those as recent and restore the built-in colors in the remaining slots.
      const oldRecents = validColors(JSON.parse(localStorage.getItem('arc_embed_recent_colors') || '[]')).slice(0, 4);
      return [...new Set([...oldRecents, ...DISCORD_COLOR_PRESETS.map((preset) => preset.value)])].slice(0, 8);
    } catch { return []; }
  });
  const activeDragRef = useRef(null);

  const toggleCollapse = (id) => {
    setCollapsedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addBlock = (type, index = blocks.length) => {
    if (type === 'timestamp' && !blocks.some((block) => block.type === 'footer')) return;
    if (type !== 'field' && blocks.some((block) => block.type === type)) {
      const existing = blocks.find((b) => b.type === type);
      if (existing) {
        onFocusBlock?.(existing.id);
        setCollapsedBlockIds((prev) => {
          const next = new Set(prev);
          next.delete(existing.id);
          return next;
        });
      }
      const el = document.getElementById(`embed_block_${existing.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (type === 'field' && blocks.filter((block) => block.type === 'field').length >= 25) return;
    const next = [...blocks];
    const block = createEmbedBlock(type);
    next.splice(index, 0, block);
    onFocusBlock?.(block.id);
    onChange?.(next);
  };

  const patchBlock = (id, patch) => onChange?.(blocks.map((block) => block.id === id ? { ...block, ...patch } : block));
  const removeBlock = (id) => {
    const removed = blocks.find((block) => block.id === id);
    onChange?.(blocks.filter((block) => block.id !== id && !(removed?.type === 'footer' && block.type === 'timestamp')));
  };

  const moveBlock = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange?.(next);
  };

  const colorBlock = blocks.find((b) => b.type === 'color');
  const activeColor = colorBlock ? (colorBlock.value || '') : '#5865F2';

  const setColor = (val, recordRecent = false) => {
    if (val === null) {
      if (colorBlock) patchBlock(colorBlock.id, { value: null });
      else onChange?.([...blocks, { id: makeId(), type: 'color', value: null }]);
      return;
    }
    if (!/^#[\da-f]{6}$/i.test(val)) return;
    if (recordRecent) setRecentColors((previous) => {
      const normalized = val.toUpperCase();
      if (previous.some((color) => color.toUpperCase() === normalized)) return previous;
      const startingPalette = previous.length ? previous : DISCORD_COLOR_PRESETS.map((preset) => preset.value);
      const next = [normalized, ...startingPalette.filter((color) => color.toUpperCase() !== normalized)].slice(0, 8);
      try {
        localStorage.setItem('arc_embed_color_palette_v2', JSON.stringify(next));
        localStorage.setItem('arc_embed_recent_colors', JSON.stringify(next));
      } catch { /* storage can be unavailable in private contexts. */ }
      return next;
    });
    if (colorBlock) {
      patchBlock(colorBlock.id, { value: val });
    } else {
      onChange?.([...blocks, { id: makeId(), type: 'color', value: val }]);
    }
  };

  const handleDrop = (event, index = blocks.length) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const payload = activeDragRef.current;
    activeDragRef.current = null;
    const assetRaw = event.dataTransfer.getData('application/x-arc-embed-asset');
    if (assetRaw) {
      try {
        const asset = JSON.parse(assetRaw);
        const copied = (asset.blocks || []).map((block) => ({ ...block, id: makeId() }));
        onChange?.(copied);
      } catch { /* invalid asset */ }
      return;
    }
    const type = payload?.kind === 'new' ? payload.type : event.dataTransfer.getData('application/x-arc-embed-block');
    const existingId = payload?.kind === 'existing' ? payload.id : event.dataTransfer.getData('application/x-arc-embed-existing');
    if (existingId) {
      const fromIndex = blocks.findIndex((block) => block.id === existingId);
      if (fromIndex < 0) return;
      const next = [...blocks];
      const [block] = next.splice(fromIndex, 1);
      const target = Math.max(0, Math.min(index > fromIndex ? index - 1 : index, next.length));
      next.splice(target, 0, block);
      onChange?.(next);
    } else if (EmbedBlockTypes.some((item) => item.type === type)) {
      addBlock(type, index);
    }
  };

  const stringInput = (block, key, label, maxLength = 2048, multiline = false, url = false, allowEmoji = false) => {
    if (mode !== 'studio' && connectedInputIds.has(`block_${block.id}_${key}`)) return null;
    const message = validation?.[block.id]?.[key];
    const wire = mode === 'studio' ? wiredFields?.[`block_${block.id}_${key}`] : null;
    if (wire) return (
      <label className="embed-block-field is-wire-connected">
        <div className="embed-field-label-row"><span>{label}</span><span className="embed-field-char-count">Wire connected</span></div>
        {multiline ? <textarea value="" disabled placeholder={wire.token} rows={3} aria-label={`${label} supplied by wire`} /> : <input value="" disabled placeholder={wire.token} aria-label={`${label} supplied by wire`} />}
        <small className="embed-wire-field-note">Connected to {wire.source || wire.label}. The wire value is used.</small>
      </label>
    );
    const Field = DiscordTextField;
    const attachmentKind = url && (['image', 'thumbnail'].includes(block.type) || (['author', 'footer'].includes(block.type) && key === 'icon')) ? 'image' : '';
    const openTextEditor = (value) => onOpenTextStudio?.(label, value, maxLength, (next) => patchBlock(block.id, { [key]: next }), { blockId: block.id, blockKey: key });
    return (
      <label className={`embed-block-field ${message ? 'has-error' : ''}`}>
        <div className="embed-field-label-row">
          <span>{label}</span>
          <span className="embed-field-char-count">{String(block[key] || '').length} / {maxLength}</span>
        </div>
        {String(block[key] || '').length > LONG_TEXT_THRESHOLD ? (
          <DiscordLongTextField value={block[key] || ''} onOpenEditor={() => openTextEditor(block[key] || '')} label={label} maxLength={maxLength} />
        ) : attachmentKind ? (
          <AttachmentUrlInput
            value={block[key] || ''}
            attachments={attachments}
            imageOnly
            onChange={(next) => patchBlock(block.id, { [key]: next })}
            onOpenTextEditor={() => openTextEditor(block[key] || '')}
            inputMode="url"
            maxLength={maxLength}
            placeholder={label}
            aria-invalid={message ? 'true' : undefined}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : allowEmoji ? (
          <Field
            as={multiline ? 'textarea' : 'input'}
            discordAutocomplete
            templateAutocomplete
            graphVariables={graphVariables}
            templateValuePaths={templateValuePaths}
            templateSuggestions={templateSuggestions}
            onOpenTextEditor={() => openTextEditor(block[key] || '')}
            type={multiline ? undefined : 'text'}
            inputMode={url ? 'url' : undefined}
            maxLength={maxLength}
            rows={multiline ? 3 : undefined}
            value={block[key] || ''}
            appEmojis={appEmojis}
            onChange={(event) => patchBlock(block.id, { [key]: event.target.value })}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={label}
            aria-invalid={message ? 'true' : undefined}
          />
        ) : (
          <Field
            as={multiline ? 'textarea' : 'input'}
            discordAutocomplete
            templateAutocomplete
            graphVariables={graphVariables}
            templateValuePaths={templateValuePaths}
            templateSuggestions={templateSuggestions}
            onOpenTextEditor={() => openTextEditor(block[key] || '')}
            type={multiline ? undefined : 'text'}
            inputMode={url ? 'url' : undefined}
            maxLength={maxLength}
            rows={multiline ? 3 : undefined}
            value={block[key] || ''}
            onChange={(event) => patchBlock(block.id, { [key]: event.target.value })}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={label}
            aria-invalid={message ? 'true' : undefined}
          />
        )}
        {allowEmoji && <TemplateVariableHints value={block[key]} graphVariables={graphVariables} inputSlots={hasParentNode ? embedBlockTemplateSlots(blocks, graphVariables) : []} connectedInputIds={connectedInputIds} templatePreviewValues={templatePreviewValues} />}
        {message && <small className="embed-field-error">{message}</small>}
      </label>
    );
  };

  const blockFields = (block) => {
    if (block.type === 'title') return stringInput(block, 'value', 'Title Text', 256, false, false, true);
    if (block.type === 'description') return stringInput(block, 'value', 'Message Description', 4096, true, false, true);
    if (block.type === 'url') return stringInput(block, 'url', 'Title Link URL', 2048, false, true);
    if (block.type === 'timestamp') {
      const dateValue = toLocalDateTime(block.value);
      const now = block.now ?? false;
      const wire = mode === 'studio' ? wiredFields?.[`block_${block.id}_value`] : null;
      return (
        <div className="embed-timestamp-settings">
          {wire && <label className="embed-block-field is-wire-connected"><div className="embed-field-label-row"><span>Timestamp Value</span><span className="embed-field-char-count">Wire connected</span></div><input value="" disabled placeholder={wire.token} aria-label="Timestamp supplied by wire" /><small className="embed-wire-field-note">Connected to {wire.source || wire.label}. The wire value is used.</small></label>}
          {!wire && (mode === 'studio' || !connectedInputIds.has(`block_${block.id}_value`)) && (
            <label className="embed-block-field">
              <div className="embed-field-label-row">
                <span>Timestamp Value</span>
              </div>
              <div className="embed-timestamp-control">
                <input
                  type="datetime-local"
                  value={now ? '' : dateValue}
                  disabled={now}
                  onChange={(event) => patchBlock(block.id, { value: event.target.value ? new Date(event.target.value).toISOString() : '' })}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              </div>
            </label>
          )}
          <div className="embed-block-inline">
            <AnimatedCheckbox checked={now} disabled={Boolean(wire)} onChange={(checked) => patchBlock(block.id, { now: checked })} label="Use current time when sent" />
            <span>Use current time when message is sent</span>
          </div>
        </div>
      );
    }
    if (block.type === 'color') {
      const wire = mode === 'studio' ? wiredFields?.[`block_${block.id}_value`] : null;
      if (wire) return <div className="embed-color-editor"><label className="embed-block-field is-wire-connected"><div className="embed-field-label-row"><span>Accent Color</span><span className="embed-field-char-count">Wire connected</span></div><input value="" disabled placeholder={wire.token} aria-label="Accent color supplied by wire" /><small className="embed-wire-field-note">Connected to {wire.source || wire.label}. The wire value is used.</small></label></div>;
      return (
        <div className="embed-color-editor">
          <div className="embed-field-label-row">
            <span>Color Presets</span>
          </div>
          <div className="embed-color-presets">
            {DISCORD_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`embed-color-chip ${activeColor && activeColor.toUpperCase() === preset.value.toUpperCase() ? 'is-active' : ''}`}
                style={{ backgroundColor: preset.value }}
                title={preset.label}
                onClick={() => setColor(preset.value)}
              >
                {activeColor && activeColor.toUpperCase() === preset.value.toUpperCase() && (
                  <Check size={12} color={preset.value === '#FFFFFF' ? '#000' : '#fff'} />
                )}
              </button>
            ))}
          </div>
          <div className="embed-color-custom-row">
            <label className="embed-color-picker-label">
              <span>Custom Color (Hex)</span>
              <div className="embed-color-inputs">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(block.value || '') ? block.value : '#5865F2'}
                  onChange={(event) => patchBlock(block.id, { value: event.target.value })}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="embed-native-color-picker"
                  title="Pick color"
                />
                <input
                  type="text"
                  value={block.value || '#5865F2'}
                  maxLength={7}
                  onChange={(event) => patchBlock(block.id, { value: event.target.value })}
                  placeholder="#5865F2"
                  className="embed-hex-input"
                />
              </div>
            </label>
          </div>
        </div>
      );
    }
    if (block.type === 'author') {
      return (
        <>
          {stringInput(block, 'name', 'Author Name', 256, false, false, true)}
          {stringInput(block, 'url', 'Author URL', 2048, false, true)}
          {stringInput(block, 'icon', 'Author Icon URL', 2048, false, true)}
        </>
      );
    }
    if (block.type === 'footer') {
      return (
        <>
          {stringInput(block, 'text', 'Footer Text', 2048, false, false, true)}
          {stringInput(block, 'icon', 'Footer Icon URL', 2048, false, true)}
        </>
      );
    }
    if (block.type === 'image' || block.type === 'thumbnail') {
      return stringInput(block, 'url', block.type === 'image' ? 'Image URL (or attachment://filename)' : 'Thumbnail URL', 2048, false, true);
    }
    if (block.type === 'field') {
      return (
        <>
          <div className="embed-field-block-grid">
            {stringInput(block, 'name', 'Field Name', 256, false, false, true)}
            {stringInput(block, 'value', 'Field Value', 1024, true, false, true)}
          </div>
          <div className="embed-block-inline">
            <AnimatedCheckbox checked={Boolean(block.inline)} onChange={(inline) => patchBlock(block.id, { inline })} label="Inline field" />
            <span>Inline field (places up to 3 fields side-by-side)</span>
          </div>
        </>
      );
    }
    return null;
  };

  if (mode === 'node') {
    const fields = visibleBlocks.filter((block) => block.type === 'field').length;
    const types = [...new Set(visibleBlocks.map((block) => EmbedBlockTypes.find((item) => item.type === block.type)?.label).filter(Boolean))];
    const blockCount = visibleBlocks.length;
    return (
      <div className="embed-node-reference" onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={handleDrop}>
        <div className="embed-node-reference-copy">
          <strong>{data.embedName || (blockCount ? 'Embed content' : 'No embed content')}</strong>
          <span>{blockCount ? `${blockCount} blocks${fields ? ` · ${fields} fields` : ''}${types.length ? ` · ${types.slice(0, 3).join(', ')}` : ''}` : 'Drop a saved embed here'}</span>
        </div>
        <button type="button" className="embed-node-open" onClick={(event) => { event.stopPropagation(); onOpenStudio?.(); }}>
          <ArrowUpRight size={13} />{blockCount ? 'Edit' : 'Create'}
        </button>
      </div>
    );
  }

  const fieldCount = blocks.filter((b) => b.type === 'field').length;

  return (
    <div
      className="embed-studio-builder"
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onDrop={(event) => handleDrop(event)}
    >
      {/* Quick Action Toolbar */}
      <div className="embed-toolbar-container">
        <div className="embed-quick-bar" aria-label="Quick add embed components">
          {EmbedBlockTypes.filter((t) => t.type !== 'color').map(({ type, label, icon: Icon }) => {
            const isField = type === 'field';
            const isAdded = !isField && blocks.some((b) => b.type === type);
            const needsFooter = type === 'timestamp' && !blocks.some((block) => block.type === 'footer');
            const countLabel = isField ? ` (${fieldCount}/25)` : '';

            return (
              <button
                key={type}
                type="button"
                className={`embed-quick-chip ${isAdded ? 'is-added' : ''}`}
                disabled={needsFooter}
                draggable={!needsFooter && !(isAdded && type !== 'field')}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('application/x-arc-studio-palette', JSON.stringify({ kind: 'palette', scope: 'embed', type }));
                }}
                onClick={() => addBlock(type)}
                title={needsFooter ? 'Add a footer block before adding a timestamp.' : isAdded ? `${label} is already added (click to view)` : `Add ${label}`}
              >
                {isAdded ? <Check size={12} className="embed-chip-check" /> : <Plus size={12} />}
                <Icon size={12} />
                <span>{label}{countLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Discord Embed Color Bar */}
        {!focusOnly && <div className="embed-color-bar">
          <span className="embed-color-bar-label">
            <Palette size={13} />
            <span>Accent Color</span>
          </span>
        <div className="embed-color-bar-swatches">
            <button type="button" className={`embed-color-none ${activeColor ? '' : 'is-active'}`} onClick={() => setColor(null)} title="No accent color" aria-label="No accent color"><CircleOff size={15} /></button>
            {(recentColors.length ? recentColors.map((value, index) => ({ value, label: index === 0 ? 'Most recent color' : 'Palette color' })) : DISCORD_COLOR_PRESETS).map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`embed-color-dot ${activeColor && activeColor.toUpperCase() === preset.value.toUpperCase() ? 'is-active' : ''}`}
                style={{ backgroundColor: preset.value }}
                title={preset.label}
              onClick={() => setColor(preset.value)}
              />
            ))}
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(activeColor) ? activeColor : '#5865F2'}
              onChange={(e) => setColor(e.target.value, true)}
              title="Custom color picker"
              className="embed-color-picker-input"
            />
          </div>
        </div>}
      </div>

      {/* Blocks List */}
      <div
        className={`embed-block-list ${dropTarget === blocks.length ? 'is-append-target' : ''}`}
        onDragEnter={(event) => { if (event.target === event.currentTarget) setDropTarget(blocks.length); }}
        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (event.target === event.currentTarget) setDropTarget(blocks.length); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
        onDrop={(event) => handleDrop(event, typeof dropTarget === 'number' ? dropTarget : blocks.length)}
      >
          {visibleBlocks.map((block) => {
          const index = blocks.indexOf(block);
          const descriptor = EmbedBlockTypes.find((item) => item.type === block.type);
          const Icon = descriptor?.icon || Type;
          const dropClass = dropTarget === index ? 'is-drop-before' : '';
          const isCollapsed = collapsedBlockIds.has(block.id);
          const hasConnectedWire = [...connectedInputIds].some((pinId) => pinId.startsWith(`block_${block.id}_`)) || Object.keys(wiredFields || {}).some((pinId) => pinId.startsWith(`block_${block.id}_`));

          return (
            <section
              id={`embed_block_${block.id}`}
              data-embed-block-type={block.type}
              className={`embed-subnode ${dropClass} ${isCollapsed ? 'is-collapsed' : ''}`}
              key={block.id}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDropTarget(index);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDropTarget(index);
              }}
              onDrop={(event) => handleDrop(event, typeof dropTarget === 'number' ? dropTarget : index)}
            >
              <header
                className="embed-subnode-header"
                onClick={() => toggleCollapse(block.id)}
                title={isCollapsed ? 'Click to expand block' : 'Click to collapse block'}
              >
                <div className="embed-subnode-title">
                  <span className="embed-subnode-chevron">
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </span>
                  <Icon size={14} className="embed-subnode-icon" />
                  <strong>
                    {descriptor?.label || 'Block'}
                    {block.type === 'field' && ` #${blocks.slice(0, index + 1).filter((b) => b.type === 'field').length}`}
                  </strong>
                </div>

                <div className="embed-subnode-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={index === 0}
                    title="Move up"
                    onClick={() => moveBlock(index, -1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={index === blocks.length - 1}
                    title="Move down"
                    onClick={() => moveBlock(index, 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={hasConnectedWire}
                    className="is-danger"
                    onClick={() => removeBlock(block.id)}
                    aria-label={`Remove ${descriptor?.label || 'block'}`}
                    title={hasConnectedWire ? 'Disconnect its wires before removing this block' : 'Remove block'}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </header>

              {!isCollapsed && (
                <div className="embed-subnode-fields">
                  {blockFields(block)}
                </div>
              )}
            </section>
          );
        })}

        {!focusOnly && !visibleBlocks.length && (
          <div className="embed-builder-empty">
            <p>Your embed is currently empty.</p>
            <span>Use the buttons above to add a Title, Description, Fields, or Images.</span>
          </div>
        )}
      </div>

      <div className="embed-builder-footer-info">
        <span>Discord limits: 6,000 characters total · up to 25 fields</span>
      </div>
    </div>
  );
}

function makeId() {
  return `embed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toLocalDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
