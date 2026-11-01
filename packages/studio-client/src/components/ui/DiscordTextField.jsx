import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { onPageBlur } from '../../core/pageFocus.js';
import { getCaretCoordinates } from '../../core/caretCoordinates.js';

let emojiEntriesPromise;
function loadEmojiEntries() {
  if (!emojiEntriesPromise) emojiEntriesPromise = import('emoji-picker-react/dist/data/emojis-en.js').then(({ default: emojiData }) => Object.values(emojiData.emojis || {}).flat().filter((item) => item?.u && Array.isArray(item.n)).map((item) => ({
    emoji: String.fromCodePoint(...String(item.u).split('-').map((part) => Number.parseInt(part, 16))),
    names: item.n || []
  })).filter((item) => item.emoji && item.names.length)).catch((error) => {
    emojiEntriesPromise = null;
    throw error;
  });
  return emojiEntriesPromise;
}

function insertAtSelection(element, value, start, end, text) {
  const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
  return { value: next, caret: start + text.length };
}

const TEMPLATE_FILTERS = ['lower', 'upper', 'title', 'capitalize', 'trim', 'trimStart', 'trimEnd', 'replace("_", " ")', 'replaceFirst("old", "new")', 'join(", ")', 'slice(0, 3)', 'length', 'json', 'default("fallback")'];
//
export const DiscordTextField = forwardRef(function DiscordTextField({ as = 'input', appEmojis = [], graphVariables = [], templateValuePaths = [], templateSuggestions = [], discordAutocomplete = false, templateAutocomplete = false, onChange, value = '', className = '', onPointerDown, onKeyDown, ...props }, forwardedRef) {
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const [match, setMatch] = useState(null);
  const [position, setPosition] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [textMenu, setTextMenu] = useState(null);
  const [emojiEntries, setEmojiEntries] = useState(null);
  const onOpenTextEditor = props.onOpenTextEditor;
  const { onOpenTextEditor: _onOpenTextEditor, ...fieldProps } = props;
  useImperativeHandle(forwardedRef, () => inputRef.current);

  const suggestions = useMemo(() => {
    if (!match) return [];
    if (match.kind === 'template') {
      const query = match.query.toLowerCase();
      const list = match.filterStage
        ? TEMPLATE_FILTERS.map((name) => ({ key: `filter:${name}`, label: name, insert: name }))
        : match.pathStage
          ? templateValuePaths.map((item) => typeof item === 'string' ? { path: item, label: item } : item).filter((item) => item?.path).map((item) => ({ key: `path:${item.path}`, label: item.label || item.path, insert: `${item.path}}}` }))
          : [
            ...graphVariables.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean).map((name) => ({ key: `variable:${name}`, label: name, insert: `${name}}}` })),
            ...templateSuggestions.map((item) => typeof item === 'string' ? { name: item, label: item } : item)
              .filter((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item?.name || ''))
              .map((item) => ({ key: `socket:${item.name}:${item.label}`, label: item.label || item.name, insert: `${item.name}}}` }))
          ];
      return list.filter((item) => item.label.toLowerCase().includes(query) || item.insert.slice(0, -2).toLowerCase().includes(query)).slice(0, 8);
    }
    const query = match.query.toLowerCase();
    const builtIn = (emojiEntries || [])
      .filter((item) => item.names.some((name) => name.toLowerCase().includes(query)))
      .sort((left, right) => {
        const rank = (item) => item.names.some((name) => name.toLowerCase() === query) ? 0 : item.names.some((name) => name.toLowerCase().startsWith(query)) ? 1 : 2;
        return rank(left) - rank(right);
      })
      .map((item) => ({ ...item, key: `unicode:${item.emoji}`, label: (item.names.find((name) => /\s/.test(name)) || item.names[0]).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), isCustom: false }));
    const custom = appEmojis
      .filter((item) => item.name?.toLowerCase().includes(query))
      .map((item) => ({
        key: `custom:${item.id}`, label: item.name, isCustom: true, custom: item,
        emoji: `<${item.animated ? 'a' : ''}:${item.name}:${item.id}>`,
        image: `https://cdn.discordapp.com/emojis/${encodeURIComponent(item.id)}.${item.animated ? 'gif' : 'webp'}?size=48`
      }));
    return [...custom, ...builtIn].slice(0, 6);
  }, [appEmojis, emojiEntries, graphVariables, match, templateSuggestions, templateValuePaths]);

  useEffect(() => {
    if (!discordAutocomplete || !match || match.kind === 'template' || emojiEntries !== null) return undefined;
    let current = true;
    loadEmojiEntries().then((entries) => { if (current) setEmojiEntries(entries); }).catch(() => { if (current) setEmojiEntries([]); });
    return () => { current = false; };
  }, [discordAutocomplete, emojiEntries, match]);


  useEffect(() => {
    if (!match || !inputRef.current) return undefined;
    const update = () => {
      const el = inputRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const caret = getCaretCoordinates(el, match.start);
      const scrollLeft = el.scrollLeft || 0;
      const caretScreenX = rect.left + caret.left - scrollLeft;
      const gutter = 10;
      const width = Math.max(1, Math.min(286, window.innerWidth - gutter * 2));
      const left = Math.max(gutter, Math.min(caretScreenX - 8, window.innerWidth - width - gutter));
      const popupHeight = pickerRef.current?.getBoundingClientRect().height
        || Math.min(284, 150 + Math.max(1, suggestions.length) * 34);
      const spaceAbove = Math.max(0, rect.top - gutter * 2);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gutter * 2);
      const showAbove = spaceAbove >= popupHeight || spaceAbove >= spaceBelow;
      const availableSpace = showAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(72, Math.min(284, availableSpace));
      const height = Math.min(popupHeight, maxHeight);
      const top = showAbove
        ? Math.max(gutter, rect.top - height - 8)
        : Math.min(window.innerHeight - height - gutter, rect.bottom + 8);

      setPosition({ left, top, width, maxHeight });
    };
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const closeOutside = (event) => {
      if (inputRef.current?.contains(event.target) || pickerRef.current?.contains(event.target)) return;
      setMatch(null);
    };
    const onFullPicker = () => setMatch(null);
    document.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('arc:emoji-picker-open', onFullPicker);
    const removePageBlurListener = onPageBlur(() => setMatch(null));
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('arc:emoji-picker-open', onFullPicker);
      removePageBlurListener();
    };
  }, [match, suggestions.length]);

  useEffect(() => setSelectedIndex(0), [match?.query]);

  useEffect(() => {
    if (!textMenu) return undefined;
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && event.target.closest?.('.discord-text-context-menu')) return;
      setTextMenu(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
    const removePageBlurListener = onPageBlur(() => setTextMenu(null));
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', dismiss, true);
      removePageBlurListener();
    };
  }, [textMenu]);

  const onInputChange = (event) => {
    onChange?.(event);
    const textBeforeCaret = event.target.value.slice(0, event.target.selectionStart ?? event.target.value.length);
    if (templateAutocomplete) {
      const token = /\{\{([^{}]*)$/.exec(textBeforeCaret);
      if (token && textBeforeCaret[token.index - 1] !== '\\') {
        const caret = event.target.selectionStart ?? event.target.value.length;
        const expression = token[1];
        const pipe = expression.lastIndexOf('|');
        const filterStage = pipe >= 0;
        const fragment = filterStage ? expression.slice(pipe + 1) : expression;
        const leading = fragment.match(/^\s*/)?.[0].length || 0;
        const pathStage = !filterStage && /^[A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*(?:[A-Za-z_$][A-Za-z0-9_$]*)?|\s*\[\s*\d*)+/.test(fragment.trim());
        const start = pathStage ? token.index + 2 : textBeforeCaret.length - fragment.length + leading;
        const closingBrace = event.target.value.indexOf('}}', caret);
        const end = closingBrace >= 0 ? closingBrace + 2 : caret;
        setMatch({ kind: 'template', start, end, query: pathStage ? fragment.trim().replace(/\.\s*\[/g, '[') : fragment.slice(leading), filterStage, pathStage });
        return;
      }
    }
    if (!discordAutocomplete) return setMatch(null);
    const found = textBeforeCaret.match(/(?:^|\s)(:[a-z\d_+-]*)$/i);
    if (!found) return setMatch(null);
    const token = found[1];
    const start = textBeforeCaret.length - token.length;
    const query = token.slice(1);
    setMatch({ start, end: event.target.selectionStart ?? event.target.value.length, query });
  };

  const selectSuggestion = (item) => {
    const element = inputRef.current;
    if (!element || !match) return;
    const currentValue = String(element.value ?? value);
    const insert = match.kind === 'template'
      ? `${item.insert}${match.filterStage || !item.insert.endsWith('}}') ? (currentValue.slice(match.end).startsWith('}}') ? '' : '}}') : ''}`
      : item.emoji;
    const next = insertAtSelection(element, currentValue, match.start, match.end, insert);
    if (Number.isFinite(Number(props.maxLength)) && next.value.length > Number(props.maxLength)) return;
    onChange?.({ target: { value: next.value, selectionStart: next.caret, selectionEnd: next.caret } });
    setMatch(null);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange?.(next.caret, next.caret);
    });
  };

  const handleKeyDown = (event) => {
    onKeyDown?.(event);
    if (!match || !suggestions.length) {
      if (event.key === 'Escape') setMatch(null);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if ((event.key === 'Enter' || event.key === 'Tab') && suggestions[selectedIndex]) {
      event.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setMatch(null);
    }
  };

  const Component = as;
  const handleFocus = (event) => {
    fieldProps.onFocus?.(event);
    if (!discordAutocomplete || emojiEntries !== null) return;
    loadEmojiEntries().then(setEmojiEntries).catch(() => setEmojiEntries([]));
  };
  const handleContextMenu = (event) => {
    fieldProps.onContextMenu?.(event);
    if (!onOpenTextEditor || String(value ?? '').length > 500 || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    setTextMenu({ x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 54) });
  };
  const showSuggestions = suggestions.length > 0 || (match?.kind !== 'template' && emojiEntries === null);
  return <>
    <Component {...fieldProps} ref={inputRef} className={className} value={value} onFocus={handleFocus} onChange={onInputChange} onKeyDown={handleKeyDown} onPointerDown={onPointerDown} onContextMenu={handleContextMenu} />
    {textMenu && <div className="discord-text-context-menu" style={{ left: textMenu.x, top: textMenu.y }} role="menu"><button type="button" role="menuitem" onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); setTextMenu(null); onOpenTextEditor?.(); }}>Open in text editor</button></div>}
    {(discordAutocomplete || templateAutocomplete) && match && position && showSuggestions && createPortal(<div ref={pickerRef} className="discord-emoji-suggestions" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, overflowY: 'auto' }} role="listbox" aria-label={match.kind === 'template' ? 'Template suggestions' : 'Emoji suggestions'}>
      <div className="discord-emoji-suggestion-heading">{match.kind === 'template' ? (match.filterStage ? 'FILTER' : match.pathStage ? 'VALUE PATH' : 'VARIABLE') : 'EMOJI'}{match.query ? ` · ${match.query}` : ''}</div>
      {suggestions.length ? suggestions.map((item, index) => <button type="button" role="option" aria-selected={index === selectedIndex} className={`discord-emoji-suggestion ${index === selectedIndex ? 'is-selected' : ''}`} key={item.key} onPointerDown={(event) => event.preventDefault()} onMouseEnter={() => setSelectedIndex(index)} onClick={() => selectSuggestion(item)}>
        {match.kind === 'template' ? <span className="discord-emoji-suggestion-glyph">{match.filterStage ? 'ƒ' : '{{'}</span> : item.isCustom ? <img src={item.image} alt="" /> : <span className="discord-emoji-suggestion-glyph">{item.emoji}</span>}
        <span className="discord-emoji-suggestion-label">{match.kind === 'template' ? item.label : `:${item.label}:`}</span>
        {item.custom?.animated && <small>GIF</small>}
      </button>) : <div className="discord-emoji-suggestion-empty">{match.kind === 'template' ? 'No matching suggestions' : emojiEntries === null ? 'Loading emoji suggestions…' : 'No matching emoji'}</div>}
      <div className="discord-emoji-suggestion-footer">↑ ↓ to browse <kbd>Enter</kbd> to insert</div>
    </div>, document.body)}
  </>;
});
