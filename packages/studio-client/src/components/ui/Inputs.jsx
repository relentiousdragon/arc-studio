import React, { useId, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Key, Minus, Plus } from 'lucide-react';
import { AnimatedDropdown } from './CustomControls.jsx';

function makeId(prefix, label, generatedId) {
  return prefix + (label ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-') : generatedId);
}
//
export function TextInput({ label, error, helper, icon: Icon, rightElement, className = '', wrapperClassName = '', inputRef, id, type = 'text', ...props }) {
  const generatedId = useId();
  const inputId = id || makeId('field-', label, generatedId);
  const maxLength = props.maxLength;
  const characterCount = maxLength != null ? String(props.value ?? '').length : 0;
  return <div className="field-group">
    {label && <div className="field-heading"><label htmlFor={inputId}>{label}</label>{helper && <small>{helper}</small>}</div>}
    <div className={`field-control ${Icon ? 'has-icon' : ''} ${error ? 'has-error' : ''} ${maxLength != null ? 'has-character-count' : ''} ${wrapperClassName}`}>
      {Icon && <Icon className="field-leading-icon" size={15} />}
      <input ref={inputRef} id={inputId} type={type} className={className} aria-invalid={error ? 'true' : undefined} {...props} autoCapitalize="none" autoCorrect="off" />
      {rightElement && <span className="field-trailing">{rightElement}</span>}
      {maxLength != null && <small className="character-count" aria-hidden="true">{characterCount} / {maxLength}</small>}
    </div>
    {error && <p className="field-error">{error}</p>}
  </div>;
}

export function CharacterLimit({ value = '', maxLength, children, className = '' }) {
  if (maxLength == null) return children;
  const over = String(value ?? '').length > maxLength;
  return <div className={`character-limit-control ${className}`}>{children}<small className={`character-count ${over ? 'is-over' : ''}`} style={over ? { color: '#f87171', fontWeight: 600 } : undefined} aria-hidden="true">{String(value ?? '').length} / {maxLength}</small></div>;
}

export function PasswordInput({ label = 'Password', error, showStrength = false, value = '', className = '', id, ...props }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || `password-${generatedId}`;
  const strength = passwordStrength(String(value));
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return <div className="field-group">
    <div className="field-heading"><label htmlFor={inputId}>{label}</label>{showStrength && value && <small className={`strength-label strength-label-${strength}`}>{labels[strength]}</small>}</div>
    <div className={`field-control has-trailing ${error ? 'has-error' : ''}`}>
      <input id={inputId} type={visible ? 'text' : 'password'} value={value} className={className} aria-invalid={error ? 'true' : undefined} {...props} autoCapitalize="none" autoCorrect="off" />
      <button className="field-trailing-button" type="button" onClick={() => setVisible((shown) => !shown)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </div>
    {showStrength && value && <div className="strength-meter">{[1, 2, 3, 4].map((index) => <span key={index} className={strength >= index ? `is-filled strength-${strength}` : ''} />)}</div>}
    {error && <p className="field-error">{error}</p>}
  </div>;
}

export function SecretKeyInput({ label, value = '', onChange, placeholder = 'Enter token or secret', error, helper, id, conceal = false }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const generatedId = useId();
  const inputId = id || `secret-${generatedId}`;
  const copyValue = async () => {
    if (!value || !navigator.clipboard) return;
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch {}
  };
  return <div className="field-group">
    <div className="field-heading"><label htmlFor={inputId}>{label}</label>{helper && <small>{helper}</small>}</div>
    <div className={`field-control has-icon ${conceal ? '' : 'has-trailing'} ${error ? 'has-error' : ''}`}><Key className="field-leading-icon" size={15} /><input id={inputId} type={conceal || !revealed ? 'password' : 'text'} value={value} onChange={onChange} placeholder={placeholder} autoComplete="off" autoCapitalize="none" autoCorrect="off" />{!conceal && <><button className="field-trailing-button" type="button" onClick={() => setRevealed((shown) => !shown)} aria-label={revealed ? 'Hide secret' : 'Reveal secret'}>{revealed ? <EyeOff size={15} /> : <Eye size={15} />}</button>{value && <button className="field-trailing-button" type="button" onClick={copyValue} aria-label="Copy secret">{copied ? <Check size={15} /> : <Copy size={15} />}</button>}</>}</div>
    {error && <p className="field-error">{error}</p>}
  </div>;
}

export function Toggle({ label, description, checked, onChange, id, disabled = false }) {
  const generatedId = useId();
  const toggleId = id || `toggle-${generatedId}`;
  return <div className="setting-row">
    <div className="setting-copy"><label htmlFor={toggleId}>{label}</label>{description && <p>{description}</p>}</div>
    <button id={toggleId} type="button" role="switch" aria-checked={Boolean(checked)} disabled={disabled} className={`toggle-switch ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
  </div>;
}

export function NumberInput({ label, value, onChange, min = 0, max = 100000, step = 1, id }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  React.useEffect(() => setDraft(value == null ? '' : String(value)), [value]);
  const generatedId = useId();
  const inputId = id || `number-${generatedId}`;
  const change = (amount) => onChange(Math.min(max, Math.max(min, (Number(value) || 0) + amount)));
  return <div className="field-group"><label className="field-heading" htmlFor={inputId}>{label}</label><div className="number-stepper"><button type="button" onClick={() => change(-step)} aria-label="Decrease"><Minus size={14} /></button><input id={inputId} type="number" value={draft} min={min} max={max} step={step} className={draft === '' ? 'is-empty-number' : ''} aria-invalid={draft === '' || undefined} onChange={(event) => { const next = event.target.value; setDraft(next); if (next !== '') onChange(Number(next)); }} /><button type="button" onClick={() => change(step)} aria-label="Increase"><Plus size={14} /></button></div></div>;
}

export function SelectInput({ label, value, onChange, options = [], id }) {
  const generatedId = useId();
  const inputId = id || `select-${generatedId}`;
  return <div className="field-group">{label && <div className="field-heading">{label}</div>}<AnimatedDropdown value={value} onChange={onChange} options={options} ariaLabel={label || inputId} className="form-dropdown" searchable={options.length >= 8} /></div>;
}

export function TwoFactorInput({ length = 6, onComplete }) {
  const [digits, setDigits] = useState(Array(length).fill(''));
  const update = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...digits]; next[index] = value.slice(-1); setDigits(next);
    if (value && index < length - 1) document.getElementById(`pin-${index + 1}`)?.focus();
    if (next.every(Boolean)) onComplete?.(next.join(''));
  };
  return <div className="pin-input-row">{digits.map((digit, index) => <input key={index} id={`pin-${index}`} inputMode="numeric" maxLength={1} value={digit} onChange={(event) => update(index, event.target.value)} onKeyDown={(event) => { if (event.key === 'Backspace' && !digit && index > 0) document.getElementById(`pin-${index - 1}`)?.focus(); }} />)}</div>;
}

function passwordStrength(value) {
  if (!value) return 0;
  let score = 1;
  if (value.length >= 10) score++;
  if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(score, 4);
}
