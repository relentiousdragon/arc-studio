import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { DiscordTextField } from '../ui/DiscordTextField.jsx';
import { AttachmentUrlInput } from '../ui/AttachmentUrlInput.jsx';
import { MessageComponentsBuilder } from './MessageComponentsBuilder.jsx';

const makeId = () => `v2_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`}`;
function findBlock(blocks, id) {
  for (const block of blocks || []) {
    if (block.id === id) return block;
    const nested = findBlock(block.children, id);
    if (nested) return nested;
  }
  return null;
}

const defaults = {
  text_display: () => ({ id: makeId(), type: 'text_display', content: '' }),
  section: () => ({ id: makeId(), type: 'section', texts: [''], accessory: { type: 'button', label: 'Open', style: 'primary', customId: 'section_action' } }),
  separator: () => ({ id: makeId(), type: 'separator', divider: true, spacing: 1 }),
  media_gallery: () => ({ id: makeId(), type: 'media_gallery', items: [{ url: '', description: '', spoiler: false }] }),
  file: () => ({ id: makeId(), type: 'file', url: 'attachment://file.png', spoiler: false }),
  action_row: () => ({ id: makeId(), type: 'action_row', components: [] }),
  container: () => ({ id: makeId(), type: 'container', children: [{ id: makeId(), type: 'text_display', content: '' }], accentColor: '#5865F2', spoiler: false })
};
//
function countComponents(components = []) {
  return (components || []).reduce((total, component) => {
    if (!component || typeof component !== 'object') return total;
    const nested = component.type === 'container'
      ? countComponents(component.children)
      : component.type === 'section'
        ? (component.texts || []).length + (component.accessory ? 1 : 0)
        : component.type === 'action_row'
          ? (component.components || []).length
          : 0;
    return total + 1 + nested;
  }, 0);
}

function countTextCharacters(components = []) {
  return (components || []).reduce((total, component) => {
    if (!component || typeof component !== 'object') return total;
    if (component.type === 'text_display') return total + String(component.content || '').length;
    if (component.type === 'section') return total + (component.texts || []).reduce((sum, text) => sum + String(text || '').length, 0);
    if (component.type === 'container') return total + countTextCharacters(component.children);
    return total;
  }, 0);
}

export function createComponentsV2Block(type) {
  return defaults[type]?.() || null;
}

function TextField({ value, onChange, graphVariables, templateValuePaths, templateSuggestions, ...props }) {
  return <DiscordTextField
    value={value ?? ''}
    onChange={(event) => onChange(event.target.value)}
    graphVariables={graphVariables}
    templateValuePaths={templateValuePaths}
    templateSuggestions={templateSuggestions}
    templateAutocomplete
    discordAutocomplete
    {...props}
  />;
}

export function ComponentsV2Builder({ value = [], focusedBlockId = null, focusedItemId = null, focusedSectionItem = null, focusedComponentId = null, onSelectComponent, focusOnly = false, onChange, onSelectBlock, graphVariables = [], templateValuePaths = [], templateSuggestions = [], appEmojis = [], attachments = [], componentBudget = 40, textBudget = 4000, maxRootBlocks = 40, insideContainer = false }) {
  const [expandedBlockId, setExpandedBlockId] = React.useState(null);
  const layout = Array.isArray(value) ? value : [];
  const componentCount = countComponents(layout);
  const textCount = countTextCharacters(layout);
  const hasGlobalCapacity = componentCount < componentBudget;
  const hasRootCapacity = layout.length < maxRootBlocks;
  const canAddType = (type) => hasRootCapacity && componentCount + countComponents([defaults[type]?.()]) <= componentBudget;
  const applyPatch = (block, patch) => Object.fromEntries(Object.entries(patch).map(([key, value]) => (
    [key, typeof value === 'function' ? value(block[key]) : value]
  )));
  const setBlock = (id, patch) => onChange?.((current) => current.map((block) => {
    if (block.id === id) return { ...block, ...applyPatch(block, patch) };
    return Array.isArray(block.children) ? { ...block, children: block.children.map((child) => updateNested(child, id, patch)) } : block;
  }));
  const updateNested = (block, id, patch) => {
    if (block.id === id) return { ...block, ...applyPatch(block, patch) };
    return Array.isArray(block.children) ? { ...block, children: block.children.map((child) => updateNested(child, id, patch)) } : block;
  };
  const removeNested = (blocks, id) => (blocks || []).filter((block) => block.id !== id).map((block) => (
    Array.isArray(block.children) ? { ...block, children: removeNested(block.children, id) } : block
  ));
  const removeBlock = (id) => onChange?.((current) => removeNested(current, id));
  const addBlock = (type) => {
    if (!canAddType(type)) return;
    const block = defaults[type]();
    setExpandedBlockId(block.id);
    onSelectBlock?.(block.id);
    onChange?.((current) => [...current, block]);
  };
  React.useEffect(() => {
    const listener = (event) => { if (event.detail?.id) { setExpandedBlockId(event.detail.id); requestAnimationFrame(() => document.getElementById(`v2_block_${event.detail.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); } };
    window.addEventListener('arc-components-select-block', listener);
    return () => window.removeEventListener('arc-components-select-block', listener);
  }, []);
  React.useEffect(() => {
    const listener = (event) => {
      const targetId = event.detail?.targetId;
      if (!targetId) return;
      const target = [...document.querySelectorAll('[data-editor-validation-target]')]
        .find((element) => element.dataset.editorValidationTarget === targetId);
      if (!target) return;
      const pulseTarget = target.matches('.v2-field') ? target.querySelector('input, textarea, select') || target : null;
      pulseTarget?.classList.remove('is-validation-focused');
      if (pulseTarget) {
        void pulseTarget.offsetWidth;
        pulseTarget.classList.add('is-validation-focused');
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      if (pulseTarget) window.setTimeout(() => pulseTarget.classList.remove('is-validation-focused'), 800);
    };
    window.addEventListener('arc-components-focus-issue', listener);
    return () => window.removeEventListener('arc-components-focus-issue', listener);
  }, []);
  React.useEffect(() => { if (focusedItemId || focusedBlockId) setExpandedBlockId(focusedItemId || focusedBlockId); }, [focusedBlockId, focusedItemId]);
  const field = (label, val, update, props = {}) => {
    const { attachmentKind, validationTarget, ...inputProps } = props;
    return <label className="v2-field" data-editor-validation-target={validationTarget || undefined}><span>{label}</span>{attachmentKind
      ? <AttachmentUrlInput value={val} onChange={update} attachments={attachments} imageOnly={attachmentKind === 'image'} graphVariables={graphVariables} templateValuePaths={templateValuePaths} templateSuggestions={templateSuggestions} appEmojis={appEmojis} {...inputProps} />
      : <TextField value={val} onChange={update} graphVariables={graphVariables} templateValuePaths={templateValuePaths} templateSuggestions={templateSuggestions} appEmojis={appEmojis} {...inputProps} />}</label>;
  };
  const sectionFields = (block, patchBlock) => {
    const selection = focusedSectionItem?.blockId === block.id ? focusedSectionItem : null;
    const texts = Array.isArray(block.texts) && block.texts.length ? block.texts : [''];
    const accessory = block.accessory || { type: 'button', label: 'Open', style: 'primary', customId: 'section_action' };
    const patchAccessory = (patch) => patchBlock({ accessory: { ...accessory, ...patch } });
    return <>
      {(!selection || selection.kind === 'text') && texts.map((text, textIndex) => (selection?.kind !== 'text' || selection.index === textIndex) && <div className="v2-inline-field" key={`${block.id}_text_${textIndex}`}>
        {field(`Text ${textIndex + 1}`, text, (next) => patchBlock({ texts: texts.map((item, itemIndex) => itemIndex === textIndex ? next : item) }), { as: 'textarea', rows: 2, maxLength: Math.max(0, Math.min(4000, textBudget - textCount + String(text || '').length)), placeholder: 'Write text or use {{variable}}' })}
        <button type="button" disabled={texts.length >= 3 || !hasGlobalCapacity} onClick={() => { if (texts.length < 3 && hasGlobalCapacity) patchBlock({ texts: [...texts, ''] }); }}>Add text</button>
        {texts.length > 1 && <button className="v2-remove-item" type="button" title={`Remove text ${textIndex + 1}`} aria-label={`Remove text ${textIndex + 1}`} onClick={() => patchBlock({ texts: texts.filter((_, itemIndex) => itemIndex !== textIndex) })}><X size={15} /></button>}
      </div>)}
      {selection?.kind === 'accessory' && <>
        <label className="v2-field"><span>Accessory</span><select value={accessory.type || 'button'} onChange={(event) => patchBlock({ accessory: event.target.value === 'thumbnail' ? { type: 'thumbnail', url: '', description: '' } : { type: 'button', label: 'Open', style: 'primary', customId: 'section_action' } })}><option value="button">Button</option><option value="thumbnail">Thumbnail</option></select></label>
        {accessory.type === 'thumbnail' ? <>
          {field('Image URL', accessory.url, (url) => patchAccessory({ url }), { maxLength: 2048, placeholder: 'https://… or attachment://image.png', attachmentKind: 'image' })}
          {field('Alt text', accessory.description, (description) => patchAccessory({ description }), { maxLength: 1024 })}
          <label className="v2-check"><input type="checkbox" checked={Boolean(accessory.spoiler)} onChange={(event) => patchAccessory({ spoiler: event.target.checked })} />Spoiler image</label>
        </> : <>
          {field('Button label', accessory.label, (label) => patchAccessory({ label }), { maxLength: 80 })}
          <label className="v2-field"><span>Button style</span><select value={accessory.style || 'primary'} onChange={(event) => patchAccessory({ style: event.target.value })}><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="success">Success</option><option value="danger">Danger</option><option value="link">Link</option></select></label>
          {field('Button emoji', accessory.emoji, (emoji) => patchAccessory({ emoji }), { placeholder: 'Choose or paste an emoji' })}
          {accessory.style === 'link' ? field('URL', accessory.url, (url) => patchAccessory({ url })) : field('Custom ID', accessory.customId, (customId) => patchAccessory({ customId }), { maxLength: 100 })}
        </>}
      </>}
    </>;
  };

  const focusedBlock = focusOnly ? findBlock(layout, focusedItemId || focusedBlockId) : null;
  const visibleLayout = focusOnly ? (focusedBlock ? [focusedBlock] : []) : layout;
  return <div className="components-v2-builder">
    {!focusOnly && <div className="v2-builder-heading"><div><strong>{insideContainer ? 'Container blocks' : 'Discord Components V2'}</strong><span>{insideContainer ? 'Containers support up to 10 child components.' : 'Arrange message blocks and preview them live. V2 replaces message text and embeds.'}</span></div>{!insideContainer && <span>{componentCount}/40 components</span>}</div>}
    <div className="v2-add-blocks" aria-label="Add component block">
      {Object.entries({ text_display: 'Text', section: 'Section', separator: 'Separator', media_gallery: 'Media gallery', file: 'File', action_row: 'Action row', ...(!insideContainer ? { container: 'Container' } : {}) }).map(([type, label]) => {
        const disabled = !canAddType(type);
        const limitTitle = insideContainer && !hasRootCapacity ? 'Discord containers support at most 10 child components' : 'Discord supports at most 40 total Components V2 components';
        return <button key={type} type="button" disabled={disabled} draggable={!disabled} onDragStart={(event) => { if (disabled) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-arc-studio-palette', JSON.stringify({ kind: 'palette', scope: 'components-v2', type })); }} onClick={() => addBlock(type)} title={disabled ? limitTitle : `Add ${label.toLowerCase()}`}><Plus size={13} />{label}</button>;
      })}
    </div>
    {!focusOnly && !layout.length && <div className="v2-empty-state">Add a block to start building this message.</div>}
    <div className="v2-block-list">{visibleLayout.map((block) => <section className={`v2-block-card ${expandedBlockId === block.id ? 'is-expanded' : ''}`} id={`v2_block_${block.id}`} data-editor-validation-target={block.id} key={block.id}>
      <header onClick={() => setExpandedBlockId((current) => current === block.id ? null : block.id)}><strong>{(layout.indexOf(block) >= 0 ? `${layout.indexOf(block) + 1}. ` : '')}{({ text_display: 'Text Display', media_gallery: 'Media Gallery', action_row: 'Action Row' })[block.type] || block.type.replaceAll('_', ' ')}</strong><button type="button" title="Remove block" aria-label="Remove block" onClick={(event) => { event.stopPropagation(); removeBlock(block.id); }}><Trash2 size={14} /></button></header>
      {expandedBlockId === block.id && <div className="v2-block-fields">
      {block.type === 'text_display' && field('Text', block.content, (content) => setBlock(block.id, { content }), { as: 'textarea', rows: 3, maxLength: Math.max(0, Math.min(4000, textBudget - textCount + String(block.content || '').length)), placeholder: 'Write text or use {{variable}}' })}
      {block.type === 'section' && sectionFields(block, (patch) => setBlock(block.id, patch))}
      {block.type === 'separator' && <label className="v2-field"><span>Spacing</span><select value={block.spacing || 1} onChange={(event) => setBlock(block.id, { spacing: Number(event.target.value) })}><option value="1">Small</option><option value="2">Large</option></select></label>}
      {block.type === 'media_gallery' && (block.items || []).map((item, itemIndex) => focusedSectionItem?.kind === 'media' && focusedSectionItem.blockId === block.id && focusedSectionItem.index !== itemIndex ? null : <div className="v2-gallery-item" key={`${block.id}_${itemIndex}`}><div className="v2-gallery-item-heading"><strong>Media {itemIndex + 1}</strong><button className="v2-remove-item" type="button" title={`Remove media ${itemIndex + 1}`} aria-label={`Remove media ${itemIndex + 1}`} onClick={() => setBlock(block.id, { items: block.items.filter((_, i) => i !== itemIndex) })}><X size={15} /></button></div>{field('Media URL', item.url, (url) => setBlock(block.id, { items: block.items.map((entry, i) => i === itemIndex ? { ...entry, url } : entry) }), { maxLength: 2048, placeholder: 'https://… or attachment://image.png', attachmentKind: 'image', validationTarget: `${block.id}:media:${itemIndex}` })}{field('Description', item.description, (description) => setBlock(block.id, { items: block.items.map((entry, i) => i === itemIndex ? { ...entry, description } : entry) }), { maxLength: 1024 })}<label className="v2-check"><input type="checkbox" checked={Boolean(item.spoiler)} onChange={(event) => setBlock(block.id, { items: block.items.map((entry, i) => i === itemIndex ? { ...entry, spoiler: event.target.checked } : entry) })} />Spoiler media</label></div>)}
      {block.type === 'media_gallery' && <button type="button" disabled={(block.items || []).length >= 10} onClick={() => setBlock(block.id, { items: [...(block.items || []), { url: '', description: '', spoiler: false }] })}>Add media item</button>}
      {block.type === 'file' && <>{attachments.length > 0 && <label className="v2-field"><span>Use uploaded file</span><select value="" onChange={(event) => { if (event.target.value) setBlock(block.id, { url: `attachment://${event.target.value}` }); }}><option value="">Choose attachment…</option>{attachments.map((file) => <option key={file.filename} value={file.filename}>{file.filename}</option>)}</select></label>}{field('Attachment URL', block.url, (url) => setBlock(block.id, { url }), { maxLength: 2048, placeholder: 'attachment://filename.zip', attachmentKind: 'file' })}<label className="v2-check"><input type="checkbox" checked={Boolean(block.spoiler)} onChange={(event) => setBlock(block.id, { spoiler: event.target.checked })} />Spoiler file</label><span className="v2-help">Upload a file with the control above, then select it here.</span></>}
      {block.type === 'container' && <><div className="v2-container-controls"><span>{(block.children || []).length} of 10 blocks</span></div>{field('Accent color', block.accentColor, (accentColor) => setBlock(block.id, { accentColor }), { placeholder: '#5865F2' })}<label className="v2-check"><input type="checkbox" checked={Boolean(block.spoiler)} onChange={(event) => setBlock(block.id, { spoiler: event.target.checked })} />Spoiler container</label><ComponentsV2Builder value={block.children || []} insideContainer maxRootBlocks={10} componentBudget={Math.max(0, componentBudget - (componentCount - countComponents(block.children || [])))} textBudget={Math.max(0, textBudget - (textCount - countTextCharacters(block.children || [])))} onChange={(children) => setBlock(block.id, { children })} graphVariables={graphVariables} templateValuePaths={templateValuePaths} templateSuggestions={templateSuggestions} appEmojis={appEmojis} attachments={attachments} /></>}
      {block.type === 'action_row' && <MessageComponentsBuilder rows={[{ id: block.id, components: block.components || [] }]} selectedComponentId={focusedComponentId} onSelectComponent={onSelectComponent} appEmojis={appEmojis} graphVariables={graphVariables} allowMultipleRows={false} canAddComponent={hasGlobalCapacity} onChange={(rows) => setBlock(block.id, { components: rows[0]?.components || [] })} />}
      </div>}
    </section>)}</div>
  </div>;
}
