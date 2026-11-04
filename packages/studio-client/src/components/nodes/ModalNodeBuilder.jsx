import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';
import { DiscordTextField } from '../ui/DiscordTextField.jsx';

const FIELD_TYPES = [
  { value: 'text', label: 'Text field' }, { value: 'string_select', label: 'String select' },
  { value: 'user_select', label: 'User select' }, { value: 'role_select', label: 'Role select' },
  { value: 'mentionable_select', label: 'User or role select' }, { value: 'channel_select', label: 'Channel select' },
  { value: 'file_upload', label: 'File upload' }, { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox_group', label: 'Checkbox group' }, { value: 'radio_group', label: 'Radio group' }
];

export const createDefaultModal = () => ({
  customId: 'arc_modal', title: 'Tell us more',
  components: [{ type: 'text', customId: 'field_1', label: 'Question 1', style: 1, required: true, minLength: 0, maxLength: 4000, options: [] }]
});

function createDefaultField(index) {
  return { type: 'text', customId: `field_${index + 1}`, label: `Question ${index + 1}`, style: 1, required: true, minLength: 0, maxLength: 4000, options: [] };
}

function TextInput({ label, value = '', maxLength, onChange, ...props }) {
  return <label><span className="modal-builder-label-row"><span>{label}</span><small>{String(value).length}/{maxLength}</small></span><input {...props} value={value} maxLength={maxLength} onChange={onChange} /></label>;
}

function TemplateTitleInput({ value = '', maxLength = 45, onChange, graphVariables = [], templateValuePaths = [] }) {
  return <label>
    <span className="modal-builder-label-row"><span>Modal title</span><small>{String(value).length}/{maxLength}</small></span>
    <DiscordTextField value={value} maxLength={maxLength} graphVariables={graphVariables} templateValuePaths={templateValuePaths} templateAutocomplete onChange={onChange} placeholder="Tell us more" aria-label="Modal title" />
  </label>;
}

export function ModalNodeBuilder({ value, onChange, graphVariables = [], templateValuePaths = [] }) {
  const draft = value || createDefaultModal();
  const fields = Array.isArray(draft.components) ? draft.components : [];
  const commit = (next) => onChange?.(next);
  const patchField = (index, patch) => commit({ ...draft, components: fields.map((field, i) => i === index ? { ...field, ...patch } : field) });
  const addField = () => commit({ ...draft, components: [...fields, createDefaultField(fields.length)] });
  const optionsFor = (index) => Array.isArray(fields[index]?.options) ? fields[index].options : [];
  const patchOption = (fieldIndex, optionIndex, patch) => {
    const options = [...optionsFor(fieldIndex)];
    const current = options[optionIndex] || { label: '', value: '' };
    const next = { ...current, ...patch };
    if (Object.hasOwn(patch, 'label') && (current.value === '' || current.value === current.label)) next.value = patch.label;
    options[optionIndex] = next;
    patchField(fieldIndex, { options });
  };
  const addOption = (fieldIndex, max) => {
    const options = optionsFor(fieldIndex);
    if (options.length >= max) return;
    patchField(fieldIndex, { options: [...options, { label: '', value: '' }] });
  };
  const removeOption = (fieldIndex, optionIndex) => patchField(fieldIndex, { options: optionsFor(fieldIndex).filter((_option, i) => i !== optionIndex) });
  const renderOptions = (fieldIndex, max) => {
    const options = optionsFor(fieldIndex);
    return <div className="modal-builder-options">
      {options.map((option, optionIndex) => <div className="modal-builder-option" key={`option-${optionIndex}`}>
        <span>{optionIndex + 1}</span>
        <div className="modal-builder-counted-input"><input value={option.label || ''} maxLength={100} aria-label={`Option ${optionIndex + 1} label`} placeholder="Label" onChange={(event) => patchOption(fieldIndex, optionIndex, { label: event.target.value })} /><small>{String(option.label || '').length}/100</small></div>
        <div className="modal-builder-counted-input"><input value={option.value || ''} maxLength={100} aria-label={`Option ${optionIndex + 1} value`} placeholder="Value sent to bot" onChange={(event) => patchOption(fieldIndex, optionIndex, { value: event.target.value })} /><small>{String(option.value || '').length}/100</small></div>
        <button type="button" className="icon-button compact is-danger" onClick={() => removeOption(fieldIndex, optionIndex)} aria-label={`Remove option ${optionIndex + 1}`}><Trash2 size={13} /></button>
      </div>)}
      <button type="button" className="modal-builder-add-option" disabled={options.length >= max} onClick={() => addOption(fieldIndex, max)}><Plus size={13} /> Add option <small>{options.length}/{max}</small></button>
    </div>;
  };

  return <div className="modal-builder-config">
    <div className="modal-builder-heading">
      <TemplateTitleInput value={draft.title || ''} maxLength={45} graphVariables={graphVariables} templateValuePaths={templateValuePaths} onChange={(event) => commit({ ...draft, title: event.target.value })} />
      <TextInput label="Modal custom ID" value={draft.customId || ''} maxLength={100} onChange={(event) => commit({ ...draft, customId: event.target.value })} placeholder="arc_modal" />
    </div>
    <div className="modal-builder-fields-heading"><strong>Fields</strong><span>{fields.length}/5</span></div>
    {fields.map((field, index) => <section className="modal-builder-field" key={`${field.customId}-${index}`}>
      <header><strong>Field {index + 1}</strong><button type="button" className="icon-button compact is-danger" disabled={fields.length <= 1} onClick={() => commit({ ...draft, components: fields.filter((_item, i) => i !== index) })} aria-label={`Remove field ${index + 1}`}><Trash2 size={13} /></button></header>
      <label>Input type<AnimatedDropdown value={field.type || 'text'} options={FIELD_TYPES} onChange={(type) => patchField(index, { ...createDefaultField(index), ...field, type })} ariaLabel={`Field ${index + 1} input type`} className="modal-builder-type" /></label>
      <div className="modal-builder-heading">
        <TextInput label="Label" value={field.label || ''} maxLength={45} onChange={(event) => patchField(index, { label: event.target.value })} placeholder="Question" />
        <TextInput label="Field custom ID" value={field.customId || ''} maxLength={100} onChange={(event) => patchField(index, { customId: event.target.value })} placeholder={`field_${index + 1}`} />
      </div>
      <TextInput label="Description (optional)" value={field.description || ''} maxLength={100} onChange={(event) => patchField(index, { description: event.target.value })} placeholder="Help the user answer" />
      {field.type !== 'text' && ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(field.type) && <TextInput label="Placeholder" value={field.placeholder || ''} maxLength={150} onChange={(event) => patchField(index, { placeholder: event.target.value })} />}
      {field.type === 'text' && <>
        <TextInput label="Placeholder" value={field.placeholder || ''} maxLength={100} onChange={(event) => patchField(index, { placeholder: event.target.value })} />
        <div className="modal-builder-heading"><label>Text style<AnimatedDropdown value={Number(field.style) || 1} options={[{ value: 1, label: 'Short answer' }, { value: 2, label: 'Paragraph' }]} onChange={(style) => patchField(index, { style: Number(style) })} ariaLabel="Text input style" /></label><label>Maximum characters<input type="number" min="1" max="4000" value={field.maxLength ?? 4000} onChange={(event) => patchField(index, { maxLength: Number(event.target.value) })} /></label></div>
      </>}
      {field.type === 'string_select' && <>
        <div><span className="modal-builder-options-label">Options</span>{renderOptions(index, 25)}</div>
        <div className="modal-builder-heading"><label>Minimum selections<input type="number" min="0" max="25" value={field.minValues ?? (field.required === false ? 0 : 1)} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum selections<input type="number" min="1" max="25" value={field.maxValues ?? 1} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>
      </>}
      {['checkbox_group', 'radio_group'].includes(field.type) && <>
        <div><span className="modal-builder-options-label">Options</span>{renderOptions(index, 10)}</div>
        {field.type === 'checkbox_group' && <div className="modal-builder-heading"><label>Minimum selections<input type="number" min="0" max="10" value={field.minValues ?? (field.required === false ? 0 : 1)} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum selections<input type="number" min="1" max="10" value={field.maxValues ?? 10} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>}
      </>}
      {field.type === 'file_upload' && <>
        <div className="modal-builder-heading"><label>Minimum files<input type="number" min="0" max="10" value={field.minValues ?? (field.required === false ? 0 : 1)} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum files<input type="number" min="1" max="10" value={field.maxValues ?? 1} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>
        <label>Allowed file types (optional)<textarea rows={2} maxLength={179} value={(Array.isArray(field.fileTypes) ? field.fileTypes : []).join('\n')} onChange={(event) => patchField(index, { fileTypes: event.target.value.split('\n').map((item) => item.trim().slice(0, 17)).filter(Boolean).slice(0, 10) })} placeholder={'image\n.pdf'} /><small className="modal-builder-field-note">Up to 10 filters · 17 characters each. Use image, video, audio, or an extension such as .pdf.</small></label>
      </>}
      {['user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(field.type) && <div className="modal-builder-heading"><label>Minimum selections<input type="number" min="0" max="25" value={field.minValues ?? 0} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum selections<input type="number" min="1" max="25" value={field.maxValues ?? 1} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>}
      <div className="modal-builder-required">{field.type === 'checkbox' ? <><AnimatedCheckbox checked={Boolean(field.defaultChecked)} onChange={(defaultChecked) => patchField(index, { defaultChecked })} label={`Checkbox ${index + 1} checked by default`} /><span>Checked by default</span></> : <><AnimatedCheckbox checked={field.required !== false} onChange={(required) => patchField(index, { required })} label={`Required field ${index + 1}`} /><span>Required</span></>}</div>
    </section>)}
    <button type="button" className="modal-builder-add" disabled={fields.length >= 5} onClick={addField}><Plus size={14} /> Add field <small>{fields.length}/5</small></button>
    <small className="node-config-hint">Discord modals allow 1–5 fields, up to 25 string-select options, and up to 10 checkbox or radio choices.</small>
  </div>;
}
