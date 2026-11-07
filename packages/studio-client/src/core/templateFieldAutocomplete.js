import { getCaretCoordinates } from './caretCoordinates.js';

const SKIP_INPUT_TYPES = new Set(['checkbox', 'radio', 'color', 'range', 'file', 'password', 'hidden', 'submit', 'button', 'reset', 'image']);
const MAX_SUGGESTIONS = 8;
//
function isEligibleField(element) {
  if (!element) return false;
  const tag = element.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
  if (element.disabled || element.readOnly) return false;
  if (tag === 'INPUT' && SKIP_INPUT_TYPES.has(String(element.type || 'text').toLowerCase())) return false;
  if (element.closest('[data-template-autocomplete="native"], [data-no-templates]')) return false;
  return true;
}

function softenMaxLength(element) {
  const limit = element.getAttribute('maxlength');
  if (limit == null) return;
  if (limit !== '') element.setAttribute('data-soft-maxlength', limit);
  element.removeAttribute('maxlength');
}

function setNativeValue(element, value) {
  const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

export const BUILTIN_TEMPLATE_FUNCTIONS = Object.freeze([
  { name: 'dateNow', label: 'dateNow()', insert: 'dateNow()' },
  { name: 'dateUnix', label: 'dateUnix()', insert: 'dateUnix()' },
  { name: 'dateIso', label: 'dateIso()', insert: 'dateIso()' },
  { name: 'dateFormat', label: 'dateFormat()', insert: 'dateFormat()' },
  { name: 'datePart', label: 'datePart()', insert: 'datePart()' },
  { name: 'round', label: 'round()', insert: 'round()' },
  { name: 'floor', label: 'floor()', insert: 'floor()' },
  { name: 'ceil', label: 'ceil()', insert: 'ceil()' },
  { name: 'abs', label: 'abs()', insert: 'abs()' },
  { name: 'sqrt', label: 'sqrt()', insert: 'sqrt()' },
  { name: 'min', label: 'min()', insert: 'min()' },
  { name: 'max', label: 'max()', insert: 'max()' },
  { name: 'clamp', label: 'clamp()', insert: 'clamp()' },
  { name: 'lerp', label: 'lerp()', insert: 'lerp()' },
  { name: 'sum', label: 'sum()', insert: 'sum()' },
  { name: 'average', label: 'average()', insert: 'average()' },
  { name: 'toNumber', label: 'toNumber()', insert: 'toNumber()' },
  { name: 'toString', label: 'toString()', insert: 'toString()' },
  { name: 'sin', label: 'sin()', insert: 'sin()' },
  { name: 'cos', label: 'cos()', insert: 'cos()' },
  { name: 'tan', label: 'tan()', insert: 'tan()' },
  { name: 'asin', label: 'asin()', insert: 'asin()' },
  { name: 'acos', label: 'acos()', insert: 'acos()' },
  { name: 'atan', label: 'atan()', insert: 'atan()' },
  { name: 'log', label: 'log()', insert: 'log()' },
  { name: 'log10', label: 'log10()', insert: 'log10()' },
  { name: 'exp', label: 'exp()', insert: 'exp()' },
  { name: 'sign', label: 'sign()', insert: 'sign()' }
]);

export function getTemplateStringContext(expression) {
  let inQuote = null;
  let escaped = false;
  let quoteStartIndex = -1;
  for (let i = 0; i < expression.length; i += 1) {
    const c = expression[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\' && inQuote) {
      escaped = true;
      continue;
    }
    if (c === '"' || c === "'") {
      if (inQuote === c) {
        inQuote = null;
        quoteStartIndex = -1;
      } else if (!inQuote) {
        inQuote = c;
        quoteStartIndex = i;
      }
    }
  }
  return inQuote ? { quote: inQuote, startIndex: quoteStartIndex } : null;
}

export const TEMPLATE_SUGGESTION_FILTERS = Object.freeze([
  { label: 'toNumber', insert: 'toNumber}}', search: 'tonumber', type: 'filter', description: 'Convert to number' },
  { label: 'toString', insert: 'toString}}', search: 'tostring', type: 'filter', description: 'Convert to text' },
  { label: 'round(2)', insert: 'round(2)}}', search: 'round', type: 'filter', description: 'Round number' },
  { label: 'floor', insert: 'floor}}', search: 'floor', type: 'filter', description: 'Round down' },
  { label: 'ceil', insert: 'ceil}}', search: 'ceil', type: 'filter', description: 'Round up' },
  { label: 'lower', insert: 'lower}}', search: 'lower', type: 'filter', description: 'Lowercase text' },
  { label: 'upper', insert: 'upper}}', search: 'upper', type: 'filter', description: 'Uppercase text' },
  { label: 'title', insert: 'title}}', search: 'title', type: 'filter', description: 'Titlecase text' },
  { label: 'capitalize', insert: 'capitalize}}', search: 'capitalize', type: 'filter', description: 'Capitalize text' },
  { label: 'trim', insert: 'trim}}', search: 'trim', type: 'filter', description: 'Trim whitespace' },
  { label: 'trimStart', insert: 'trimStart}}', search: 'trimstart', type: 'filter', description: 'Trim leading whitespace' },
  { label: 'trimEnd', insert: 'trimEnd}}', search: 'trimend', type: 'filter', description: 'Trim trailing whitespace' },
  { label: 'replace("_", " ")', insert: 'replace("_", " ")}}', search: 'replace', type: 'filter', description: 'Replace all' },
  { label: 'replaceFirst("old", "new")', insert: 'replaceFirst("old", "new")}}', search: 'replacefirst', type: 'filter', description: 'Replace first' },
  { label: 'join(", ")', insert: 'join(", ")}}', search: 'join', type: 'filter', description: 'Join array elements' },
  { label: 'slice(0, 3)', insert: 'slice(0, 3)}}', search: 'slice', type: 'filter', description: 'Slice portion' },
  { label: 'length', insert: 'length}}', search: 'length', type: 'filter', description: 'Length of text or array' },
  { label: 'json', insert: 'json}}', search: 'json', type: 'filter', description: 'JSON stringify' },
  { label: 'default("fallback")', insert: 'default("fallback")}}', search: 'default', type: 'filter', description: 'Fallback if empty' },
]);

export function templateTokenAt(value, caret = String(value ?? '').length) {
  const text = String(value ?? '');
  const position = Math.max(0, Math.min(Number(caret) || 0, text.length));
  const before = text.slice(0, position);
  const match = /\{\{([^{}]*)$/.exec(before);
  if (!match || before[match.index - 1] === '\\') return null;
  const expression = match[1];
  if (getTemplateStringContext(expression)) return null;

  const pipe = expression.lastIndexOf('|');
  const isFilter = pipe >= 0;
  if (isFilter) {
    const fragment = expression.slice(pipe + 1);
    const leading = fragment.match(/^\s*/)?.[0].length || 0;
    const tokenMatch = /([A-Za-z_$][A-Za-z0-9_$.]*)$/.exec(fragment);
    const query = tokenMatch ? tokenMatch[1] : fragment.slice(leading);
    const start = tokenMatch ? position - tokenMatch[1].length : match.index + 2 + pipe + 1 + leading;
    return { anchor: match.index, start, end: position, query, isFilter: true, expression };
  }
  const tokenMatch = /([A-Za-z_$][A-Za-z0-9_$.]*)$/.exec(expression);
  const query = tokenMatch ? tokenMatch[1] : '';
  const start = tokenMatch ? position - tokenMatch[1].length : position;
  const prefixBeforeToken = expression.slice(0, expression.length - query.length);
  const isLone = prefixBeforeToken.trim() === '';
  return { anchor: match.index, start, end: position, query, isFilter: false, isLone, expression };
}

export function replaceTemplateToken(value, token, insert) {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(Number(token?.start) || 0, text.length));
  let end = Math.max(start, Math.min(Number(token?.end) || start, text.length));
  let replacement = String(insert ?? '');
  const hasClosing = text.slice(end).trimStart().startsWith('}}');
  if (token?.isLone && !hasClosing && !replacement.endsWith('}}')) {
    replacement = `${replacement}}}`;
  } else if (replacement.endsWith('}}') && text.slice(end).startsWith('}}')) {
    end += 2;
  }
  return { value: `${text.slice(0, start)}${replacement}${text.slice(end)}`, caret: start + replacement.length };
}

export function templatePathSuggestions(query, paths = [], limit = MAX_SUGGESTIONS) {
  const text = String(query ?? '').trim();
  const dotIndex = text.lastIndexOf('.');
  const seen = new Set();
  const list = [];
  const push = (path, label) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    list.push({ path, label: label || path, insert: `${path}}}` });
  };
  if (dotIndex >= 0) {
    const typedPrefix = text.slice(0, dotIndex + 1);
    const partial = text.slice(dotIndex + 1).toLowerCase();
    for (const item of paths) {
      const candidate = String(typeof item === 'string' ? item : item?.path || '');
      if (candidate.length <= typedPrefix.length) continue;
      if (candidate.slice(0, typedPrefix.length).toLowerCase() !== typedPrefix.toLowerCase()) continue;
      const remainder = candidate.slice(typedPrefix.length);
      const segment = /^([A-Za-z0-9_$]+|\[[^\]]*\])/.exec(remainder)?.[0];
      if (!segment) continue;
      if (partial && !segment.toLowerCase().startsWith(partial)) continue;
      const canonical = candidate.slice(0, typedPrefix.length + segment.length);
      push(canonical, segment);
    }
    return list.slice(0, limit);
  }
  const lower = text.toLowerCase();
  for (const item of paths) {
    const candidate = String(typeof item === 'string' ? item : item?.path || '');
    if (!candidate || (lower && !candidate.toLowerCase().includes(lower))) continue;
    push(candidate, typeof item === 'string' ? candidate : item.label);
  }
  return list.slice(0, limit);
}

export function templateFieldSuggestions(query, context = {}) {
  const text = String(query ?? '').trim();
  const lower = text.toLowerCase();
  const isFilter = Boolean(context.isFilter);
  if (isFilter) {
    return TEMPLATE_SUGGESTION_FILTERS
      .filter((item) => !lower || item.search.includes(lower) || item.label.toLowerCase().includes(lower))
      .slice(0, MAX_SUGGESTIONS);
  }
  const seen = new Set();
  const list = [];
  const push = (label, insert) => {
    const token = `${insert}}}`;
    if (!insert || seen.has(token)) return;
    seen.add(token);
    list.push({ label: label || insert, insert: token, search: insert.toLowerCase() });
  };
  if (text.includes('.')) {
    for (const item of templatePathSuggestions(text, context.paths || [])) push(item.label, item.path);
    return list.slice(0, MAX_SUGGESTIONS);
  }
  for (const variable of context.variables || []) {
    if (!variable?.insert || (lower && !variable.insert.toLowerCase().includes(lower))) continue;
    push(variable.label, variable.insert);
  }
  for (const path of context.paths || []) {
    if (!path?.path) continue;
    if (lower && !path.path.toLowerCase().includes(lower)) continue;
    push(path.label || path.path, path.path);
  }
  for (const socket of context.sockets || []) {
    if (!socket?.insert || (lower && !socket.insert.toLowerCase().includes(lower))) continue;
    push(socket.label, socket.insert);
  }
  for (const entry of context.functions || []) {
    const name = typeof entry === 'string' ? entry : entry?.insert || '';
    if (!name || (lower && !name.toLowerCase().includes(lower))) continue;
    push(typeof entry === 'string' ? name : entry.label || name, name);
  }
  for (const entry of context.constants || []) {
    const name = typeof entry === 'string' ? entry : entry?.insert || '';
    if (!name || (lower && !name.toLowerCase().includes(lower))) continue;
    push(typeof entry === 'string' ? name : entry.label || name, name);
  }
  return list.slice(0, MAX_SUGGESTIONS);
}

/**
 * Adds `{{` template suggestions to every text field inside a node card,
 * including fields that never opted in to a template editor. Hard character
 * limits become soft limits, so a long value warns instead of blocking typing.
 */
export function attachTemplateAutocomplete(container, getContext) {
  if (!container) return () => {};
  let menu = null;
  let token = null;
  let items = [];
  let activeIndex = 0;
  let current = null;

  const highlight = () => {
    if (!menu) return;
    const options = [...menu.querySelectorAll('[role="option"]')];
    options.forEach((button, index) => {
      button.classList.toggle('is-selected', index === activeIndex);
    });
    options[activeIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const close = () => {
    menu?.remove();
    menu = null;
    token = null;
    items = [];
    activeIndex = 0;
    current = null;
  };

  const position = () => {
    if (!menu || !current || !token) return;
    const rect = current.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const caret = getCaretCoordinates(current, token.anchor);
    const gutter = 10;
    const gap = 8;
    const width = Math.max(180, Math.min(286, rect.width || 240));
    const left = Math.max(gutter, Math.min(rect.left + caret.left - (current.scrollLeft || 0) - 8, window.innerWidth - width - gutter));
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;
    menu.style.maxHeight = 'none';
    const height = menu.getBoundingClientRect().height || Math.min(284, 120 + Math.max(1, items.length) * 34);
    const spaceAbove = Math.max(0, rect.top - gutter * 2);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gutter * 2);
    const showAbove = spaceBelow < Math.min(height, 284) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(24, Math.min(284, showAbove ? spaceAbove : spaceBelow));
    menu.style.maxHeight = `${maxHeight}px`;
    if (showAbove) {
      menu.style.top = 'auto';
      menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      menu.style.top = `${rect.bottom + gap}px`;
      menu.style.bottom = 'auto';
    }
  };

  const render = (element, query, suggestions) => {
    current = element;
    items = suggestions;
    activeIndex = Math.min(activeIndex, Math.max(0, suggestions.length - 1));
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'discord-emoji-suggestions template-field-suggestions';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', 'Template suggestions');
      menu.style.overflowY = 'auto';
      menu.style.overscrollBehavior = 'contain';
      menu.addEventListener('pointerdown', (event) => event.preventDefault());
      menu.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
      document.body.appendChild(menu);
    }
    menu.textContent = '';
    const heading = document.createElement('div');
    heading.className = 'discord-emoji-suggestion-heading';
    heading.textContent = `${token?.isFilter ? 'FILTER' : 'VARIABLE'}${query ? ` · ${query}` : ''}`;
    menu.appendChild(heading);
    suggestions.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      button.className = `discord-emoji-suggestion ${index === activeIndex ? 'is-selected' : ''}`;
      const glyph = document.createElement('span');
      glyph.className = 'discord-emoji-suggestion-glyph';
      glyph.textContent = item.type === 'filter' || token?.isFilter ? '|' : '{{';
      const label = document.createElement('span');
      label.className = 'discord-emoji-suggestion-label';
      label.textContent = item.label;
      button.append(glyph, label);
      button.addEventListener('mouseenter', () => { activeIndex = index; highlight(); });
      button.addEventListener('click', () => select(items[index]));
      menu.appendChild(button);
    });
    const footer = document.createElement('div');
    footer.className = 'discord-emoji-suggestion-footer';
    footer.append('↑ ↓ to browse ');
    const key = document.createElement('kbd');
    key.textContent = 'Enter';
    footer.append(key, ' to insert');
    menu.appendChild(footer);
    highlight();
    position();
  };

  const select = (item) => {
    if (!item || !current || !token) return;
    const element = current;
    const value = String(element.value ?? '');
    const next = replaceTemplateToken(value, token, item.insert);
    setNativeValue(element, next.value);
    close();
    element.dispatchEvent(new Event('input', { bubbles: true }));
    window.requestAnimationFrame(() => {
      element.focus();
      try { element.setSelectionRange(next.caret, next.caret); } catch { /* some inputs reject selection writes. */ }
    });
  };

  const update = (element) => {
    softenMaxLength(element);
    const start = element.selectionStart ?? String(element.value ?? '').length;
    const end = element.selectionEnd ?? start;
    if (start !== end) return close();
    const templateToken = templateTokenAt(element.value ?? '', start);
    if (!templateToken) return close();
    token = templateToken;
    const suggestions = templateFieldSuggestions(templateToken.query, { ...(getContext?.() || {}), isFilter: templateToken.isFilter });
    if (!suggestions.length) return close();
    activeIndex = 0;
    render(element, templateToken.query.trim(), suggestions);
  };

  const onFocusIn = (event) => {
    if (isEligibleField(event.target)) softenMaxLength(event.target);
  };

  const onInput = (event) => {
    if (!isEligibleField(event.target)) return close();
    update(event.target);
  };

  const onBeforeInput = (event) => {
    if (isEligibleField(event.target)) softenMaxLength(event.target);
  };

  const onKeyDown = (event) => {
    if (!menu) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      highlight();
    } else if ((event.key === 'Enter' || event.key === 'Tab') && items[activeIndex]) {
      event.preventDefault();
      event.stopPropagation();
      select(items[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const onFocusOut = (event) => {
    if (event.target === current) close();
  };

  const onPointerDown = (event) => {
    if (menu && !menu.contains(event.target)) close();
  };

  const onWindowScroll = (event) => {
    if (menu && event.target === menu) return;
    position();
  };

  container.addEventListener('focusin', onFocusIn, true);
  container.addEventListener('beforeinput', onBeforeInput, true);
  container.addEventListener('input', onInput, true);
  container.addEventListener('keydown', onKeyDown, true);
  container.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', onWindowScroll, true);

  return () => {
    container.removeEventListener('focusin', onFocusIn, true);
    container.removeEventListener('beforeinput', onBeforeInput, true);
    container.removeEventListener('input', onInput, true);
    container.removeEventListener('keydown', onKeyDown, true);
    container.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', onWindowScroll, true);
    close();
  };
}
