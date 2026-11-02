import React, { useMemo, useState } from 'react';
import { FileCode2, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { AnimatedDropdown } from '../ui/CustomControls.jsx';

const EMPTY_SCHEMA = { type: 'object', properties: {}, required: [], additionalProperties: false };
const TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array'];
const schemaTypeOptions = TYPES.map((type) => ({ value: type, label: type }));
//
function parseSchema(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch { return null; }
}

function PropertyRow({ name, definition, required, onRename, onEdit, onRequired, onRemove }) {
  const [draft, setDraft] = useState(name);
  React.useEffect(() => setDraft(name), [name]);
  return <div className="json-schema-property" key={name}>
    <input aria-label="Property name" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (!draft.trim() || onRename(name, draft) === false) setDraft(name); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onPointerDown={(event) => event.stopPropagation()} />
    <AnimatedDropdown ariaLabel={`${name} type`} value={TYPES.includes(definition?.type) ? definition.type : 'string'} options={schemaTypeOptions} onChange={(type) => onEdit(name, { type })} onPointerDown={(event) => event.stopPropagation()} />
    <label><input type="checkbox" checked={required.includes(name)} onChange={(event) => onRequired(name, event.target.checked)} />Required</label>
    <button type="button" title={`Remove ${name}`} aria-label={`Remove ${name}`} onClick={() => onRemove(name)}><Trash2 size={14} /></button>
  </div>;
}

export function JsonSchemaEditor({ value, onChange, onOpenTextEditor, label = 'JSON Schema' }) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseSchema(value), [value]);
  const schema = parsed || EMPTY_SCHEMA;
  const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const update = (next) => onChange?.(JSON.stringify({ ...EMPTY_SCHEMA, ...next, type: 'object', properties: next.properties || {}, required: next.required || [] }, null, 2));
  const addProperty = () => {
    let index = Object.keys(properties).length + 1;
    let name = `field${index}`;
    while (Object.hasOwn(properties, name)) name = `field${++index}`;
    update({ ...schema, properties: { ...properties, [name]: { type: 'string' } }, required });
  };
  const renameProperty = (oldName, newName) => {
    const name = newName.trim();
    if (!name || (name !== oldName && Object.hasOwn(properties, name))) return false;
    const nextProperties = {};
    for (const [key, definition] of Object.entries(properties)) nextProperties[key === oldName ? name : key] = definition;
    update({ ...schema, properties: nextProperties, required: required.map((key) => key === oldName ? name : key) });
    return true;
  };
  const editProperty = (name, patch) => update({ ...schema, properties: { ...properties, [name]: { ...properties[name], ...patch } }, required });
  const removeProperty = (name) => {
    const nextProperties = { ...properties };
    delete nextProperties[name];
    update({ ...schema, properties: nextProperties, required: required.filter((key) => key !== name) });
  };

  return <>
    <div className="plugin-json-editor">
      <textarea rows={3} value={value ?? JSON.stringify(EMPTY_SCHEMA, null, 2)} onChange={(event) => onChange?.(event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="{}" aria-label={label} />
      <div className="plugin-json-editor-actions">
        <button type="button" className="node-config-editor-button" onClick={(event) => { event.stopPropagation(); setOpen(true); }}>Build schema</button>
        <button type="button" className="node-config-editor-button" onClick={(event) => { event.stopPropagation(); onOpenTextEditor?.(); }}><FileCode2 size={13} />JSON</button>
      </div>
    </div>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Document schema" subtitle="Define the document fields and required values" icon={FileCode2}>
      {!parsed && <p className="plugin-store-error">The current schema is invalid JSON. Edit it in the text editor to continue.</p>}
      <div className="json-schema-builder">
        <div className="json-schema-builder-heading"><strong>Object properties</strong><Button size="sm" variant="secondary" icon={Plus} onClick={addProperty}>Add field</Button></div>
        {!Object.keys(properties).length && <p className="json-schema-empty">No fields yet. Add properties to describe this document.</p>}
        {Object.entries(properties).map(([name, definition]) => <PropertyRow key={name} name={name} definition={definition} required={required} onRename={renameProperty} onEdit={editProperty} onRequired={(key, checked) => update({ ...schema, properties, required: checked ? [...required, key] : required.filter((item) => item !== key) })} onRemove={removeProperty} />)}
        <label className="json-schema-additional"><input type="checkbox" checked={schema.additionalProperties !== false} onChange={(event) => update({ ...schema, properties, required, additionalProperties: event.target.checked })} />Allow additional properties</label>
        <div className="plugin-confirm-actions"><Button variant="secondary" onClick={() => { setOpen(false); onOpenTextEditor?.(); }}>Edit JSON</Button><Button disabled={!parsed} onClick={() => { if (parsed) update({ ...schema, properties, required }); setOpen(false); }}>Apply schema</Button></div>
      </div>
    </Modal>
  </>;
}
