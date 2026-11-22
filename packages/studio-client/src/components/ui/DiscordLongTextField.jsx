import React from 'react';
import { ArrowUpRight, Code2 } from 'lucide-react';
//
export const LONG_TEXT_THRESHOLD = 500;

export function DiscordLongTextField({ value = '', onOpenEditor, label = 'Message text', maxLength, force = false }) {
  const text = String(value ?? '');
  if (text.length <= LONG_TEXT_THRESHOLD && !force) return null;
  const overLimit = maxLength != null && text.length > Number(maxLength);
  const openEditor = () => onOpenEditor?.();
  return <div className="long-discord-text-card" role="button" tabIndex={0} onPointerDown={(event) => event.stopPropagation()} onClick={openEditor} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEditor(); } }}>
    <div className="long-discord-text-summary"><Code2 size={14} /><span>{label}</span><small className={overLimit ? 'is-over-limit' : undefined}>{text.length.toLocaleString()}{maxLength != null ? ` / ${Number(maxLength).toLocaleString()}` : ''} chars</small></div>
    <button type="button" className="embed-node-open" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openEditor(); }}><ArrowUpRight size={13} /> Edit</button>
  </div>;
}

export function LongTextSummary({ value = '', onEdit, label = 'Text', maxLength }) {
  return <DiscordLongTextField value={value} onOpenEditor={onEdit} label={label} maxLength={maxLength} />;
}

const CODE_FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

export function inferDiscordCodeLanguage(source) {
  const code = source.trim();
  if (!code) return '';
  if (/^(?:\+\+\+|---|@@\s|diff --git )/m.test(code)) return 'diff';
  if (/^(?:#!\s*\/|(?:echo|export|cd|mkdir|npm|pnpm|yarn|git|curl|sudo)\s)/m.test(code)) return 'bash';
  if (/^(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE|DELETE\s+FROM)\b/im.test(code)) return 'sql';
  if (/^(?:<!doctype\s+html|<html\b|<[a-z][\w-]*(?:\s|>|\/))/i.test(code)) return 'html';
  if (/^(?:@media\b|[.#\w\[\]:-]+\s*\{[\s\S]*\})/.test(code) && /(?:^|[;}])\s*[\w-]+\s*:\s*[^;{}]+;/m.test(code)) return 'css';
  if (/^(?:\{|\[)[\s\S]*(?:\}|\])$/.test(code)) {
    try { JSON.parse(code); return 'json'; } catch { /* keep checking */ }
  }
  if (/^(?:from\s+\w+\s+import|import\s+\w|def\s+\w+\s*\(|class\s+\w+\s*[:(]|print\s*\()/m.test(code)) return 'py';
  if (/^(?:#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/m.test(code)) return 'md';
  if (/^(?:[\w.-]+:\s*(?:\S.*)?$|\s+-\s+\S)/m.test(code) && !/[{};]/.test(code)) return 'yaml';
  if (/\b(?:interface|type)\s+\w+\s*=|:\s*(?:string|number|boolean)(?:\s*[;=,)]|$)/m.test(code)) return 'ts';
  if (/\b(?:const|let|var|function|return|console\.log)\b|=>|require\s*\(/.test(code)) return 'js';
  return '';
}

export function detectDiscordCodeLanguages(text) {
  return String(text ?? '').replace(CODE_FENCE, (whole, language, source) => {
    if (String(language).trim()) return whole;
    const detected = inferDiscordCodeLanguage(source);
    return detected ? `\`\`\`${detected}\n${source}\`\`\`` : whole;
  });
}

export function countDiscordCodeBlocks(text) {
  return [...String(text ?? '').matchAll(CODE_FENCE)].map(([, language, source]) => ({ language: String(language).trim() || inferDiscordCodeLanguage(source) || 'undetected' }));
}
