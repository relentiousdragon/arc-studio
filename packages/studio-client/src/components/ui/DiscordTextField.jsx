import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { onPageBlur } from '../../core/pageFocus.js';
import { getCaretCoordinates } from '../../core/caretCoordinates.js';
import { BUILTIN_TEMPLATE_FUNCTIONS, getTemplateStringContext, templatePathSuggestions } from '../../core/templateFieldAutocomplete.js';

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

const TEMPLATE_FILTERS = [
  'toNumber', 'toString', 'round(2)', 'floor', 'ceil',
  'lower', 'upper', 'title', 'capitalize', 'trim', 'trimStart', 'trimEnd',
  'replace("_", " ")', 'replaceFirst("old", "new")', 'join(", ")', 'slice(0, 3)',
  'length', 'json', 'default("fallback")'
];

export { BUILTIN_TEMPLATE_FUNCTIONS, getTemplateStringContext };
//
export const DiscordTextField = forwardRef(function DiscordTextField({ as = 'input', appEmojis = [], graphVariables = [], templateValuePaths = [], templateSuggestions = [], templateFunctions = [], discordAutocomplete = false, templateAutocomplete = false, maskWhenInactive = false, onChange, value = '', className = '', onPointerDown, onKeyDown, ...props }, forwardedRef) {
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const [match, setMatch] = useState(null);
  const [position, setPosition] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [textMenu, setTextMenu] = useState(null);
  const [emojiEntries, setEmojiEntries] = useState(null);
  const skipAutocompleteRef = useRef(false);
  const onOpenTextEditor = props.onOpenTextEditor;
  const { onOpenTextEditor: _onOpenTextEditor, maxLength: _maxLength, ...fieldProps } = props;
  useImperativeHandle(forwardedRef, () => inputRef.current);

  const suggestions = useMemo(() => {
    if (!match) return [];
    if (match.kind === 'template') {
      const query = match.query.toLowerCase();
      if (match.mediaPathStage) {
        const candidates = templateValuePaths
          .map((item) => typeof item === 'string' ? { path: item, label: item } : item)
          .filter((item) => item.path?.startsWith('path://') && item.path.toLowerCase().includes(query));
        return candidates.slice(0, 8).map((item) => ({ key: `media:${item.path}`, label: item.label || item.path, insert: `${item.path}}}`, type: 'path' }));
      }
      if (match.environmentStage) return [{ key: 'template-env-reference', label: 'env:NAME · standalone bot environment', insert: 'env:NAME}}', type: 'system' }];
      if (match.filterStage) {
        return TEMPLATE_FILTERS
          .filter((name) => !query || name.toLowerCase().includes(query))
          .map((name) => ({ key: `filter:${name}`, label: name, insert: name, type: 'filter' }))
          .slice(0, 8);
      }
      if (match.pathStage) {
        return templatePathSuggestions(match.query, templateValuePaths)
          .map((item) => ({ key: `path:${item.path}`, label: item.label || item.path, insert: item.path, type: 'path' }))
          .slice(0, 8);
      }
      const variableItems = graphVariables
        .map((item) => typeof item === 'string' ? item : item?.name)
        .filter(Boolean)
        .map((name) => ({ key: `variable:${name}`, label: name, insert: name, type: 'variable' }));

      const pathItems = templateValuePaths
        .filter((item) => {
          const path = typeof item === 'string' ? item : item?.path;
          return Boolean(path) && path.includes('.');
        })
        .map((item) => {
          const path = typeof item === 'string' ? item : item.path;
          return { key: `path:${path}`, label: (typeof item === 'string' ? item : item.label || item.path), insert: path, type: 'path' };
        });

      const socketItems = templateSuggestions
        .map((item) => typeof item === 'string' ? { name: item, label: item } : item)
        .filter((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item?.name || ''))
        .map((item) => ({ key: `socket:${item.name}:${item.label}`, label: item.label || item.name, insert: item.name, type: 'socket' }));

      const builtInFuncItems = BUILTIN_TEMPLATE_FUNCTIONS.map((fn) => ({
        key: `builtin-fn:${fn.name}`,
        label: fn.label,
        insert: fn.insert,
        type: 'function'
      }));

      const customFuncItems = (templateFunctions || [])
        .map((item) => typeof item === 'string' ? { name: item, label: `${item}()` } : { name: item.name, label: item.label || `${item.name}()` })
        .filter((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name || ''))
        .map((item) => ({
          key: `custom-fn:${item.name}`,
          label: item.label,
          insert: `${item.name}()`,
          type: 'function'
        }));

      const combined = [
        ...variableItems,
        ...socketItems,
        { key: 'template-env-reference', label: 'env:NAME · standalone bot environment', insert: 'env:NAME}}', type: 'system' },
        ...builtInFuncItems,
        ...customFuncItems,
        ...pathItems
      ];

      return combined
        .filter((item) => !query || item.label.toLowerCase().includes(query) || item.insert.toLowerCase().includes(query))
        .slice(0, 8);
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
  }, [appEmojis, emojiEntries, graphVariables, match, templateFunctions, templateSuggestions, templateValuePaths]);

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
      const showAbove = spaceBelow < Math.min(popupHeight, 284) && spaceAbove > spaceBelow;
      const availableSpace = showAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(24, Math.min(284, availableSpace));

      setPosition(showAbove
        ? { left, top: 'auto', bottom: window.innerHeight - rect.top + 8, width, maxHeight }
        : { left, top: rect.bottom + 8, bottom: 'auto', width, maxHeight });
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
    if (!match || !pickerRef.current) return;
    const option = pickerRef.current.querySelectorAll('[role="option"]')[selectedIndex];
    option?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [match, selectedIndex, suggestions.length]);

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
    if (skipAutocompleteRef.current) {
      skipAutocompleteRef.current = false;
      setMatch(null);
      return;
    }
    const caret = event.target.selectionStart ?? event.target.value.length;
    const textBeforeCaret = event.target.value.slice(0, caret);

    if (templateAutocomplete) {
      const token = /\{\{([^{}]*)$/.exec(textBeforeCaret);
      if (token && textBeforeCaret[token.index - 1] !== '\\') {
        const expression = token[1];
        const stringContext = getTemplateStringContext(expression);

        if (stringContext) {
          if (discordAutocomplete) {
            const inString = expression.slice(stringContext.startIndex + 1);
            const foundEmoji = inString.match(/(?:^|\s)(:[a-z\d_+-]*)$/i);
            if (foundEmoji) {
              const emojiToken = foundEmoji[1];
              const start = caret - emojiToken.length;
              const query = emojiToken.slice(1);
              setMatch({ kind: 'emoji', start, end: caret, query });
              return;
            }
          }
          setMatch(null);
          return;
        }

        const pipe = expression.lastIndexOf('|');
        const filterStage = pipe >= 0;
        if (filterStage) {
          const fragment = expression.slice(pipe + 1);
          const leading = fragment.match(/^\s*/)?.[0].length || 0;
          const tokenMatch = /([A-Za-z_$][A-Za-z0-9_$.]*)$/.exec(fragment);
          const query = tokenMatch ? tokenMatch[1] : fragment.slice(leading);
          const start = tokenMatch ? caret - tokenMatch[1].length : textBeforeCaret.length - fragment.length + leading;
          const closingBrace = event.target.value.indexOf('}}', caret);
          const end = closingBrace >= 0 && closingBrace === caret ? closingBrace + 2 : caret;
          setMatch({ kind: 'template', start, end, query, filterStage: true, pathStage: false, isLone: false });
          return;
        }

        const externalMatch = /(?:^|\s)(env:[A-Za-z0-9_]*|path:\/\/[^{}]*)$/i.exec(expression);
        if (externalMatch) {
          const token = externalMatch[1];
          const environmentStage = /^env:/i.test(token);
          const closingBrace = event.target.value.indexOf('}}', caret);
          const end = closingBrace >= 0 && closingBrace === caret ? closingBrace + 2 : caret;
          setMatch({ kind: 'template', start: caret - token.length, end, query: environmentStage ? token.slice(4) : token.slice(7), filterStage: false, pathStage: false, mediaPathStage: !environmentStage, environmentStage, isLone: expression.slice(0, -token.length).trim() === '' });
          return;
        }

        const tokenMatch = /([A-Za-z_$][A-Za-z0-9_$.]*)$/.exec(expression);
        const query = tokenMatch ? tokenMatch[1] : '';
        const pathStage = query.includes('.');
        const start = tokenMatch ? caret - tokenMatch[1].length : caret;
        const prefixBeforeToken = expression.slice(0, expression.length - query.length);
        const isLone = prefixBeforeToken.trim() === '';
        const closingBrace = event.target.value.indexOf('}}', caret);
        const end = isLone && closingBrace >= 0 && closingBrace === caret ? closingBrace + 2 : caret;
        setMatch({
          kind: 'template',
          start,
          end,
          query: pathStage ? query.replace(/\.\s*\[/g, '[') : query,
          filterStage: false,
          pathStage,
          isLone
        });
        return;
      }
    }

    if (!discordAutocomplete) return setMatch(null);
    const found = textBeforeCaret.match(/(?:^|\s)(:[a-z\d_+-]*)$/i);
    if (!found) return setMatch(null);
    const emojiToken = found[1];
    const start = textBeforeCaret.length - emojiToken.length;
    const query = emojiToken.slice(1);
    setMatch({ kind: 'emoji', start, end: caret, query });
  };

  const selectSuggestion = (item) => {
    const element = inputRef.current;
    if (!element || !match) return;
    const currentValue = String(element.value ?? value);
    let insert = item.emoji;
    if (match.kind === 'template') {
      insert = item.insert;
      const hasClosing = currentValue.slice(match.end).trimStart().startsWith('}}');
      if (match.isLone && !hasClosing && !insert.endsWith('}}')) {
        insert = `${insert}}}`;
      }
    }
    const next = insertAtSelection(element, currentValue, match.start, match.end, insert);
    setMatch(null);
    skipAutocompleteRef.current = true;
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, next.value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
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
  const maxLen = props.maxLength ?? undefined;
  const showSuggestions = suggestions.length > 0 || (match?.kind !== 'template' && emojiEntries === null);
  return <>
    <Component {...fieldProps} {...(maxLen !== undefined ? { maxLength: maxLen } : {})} data-template-autocomplete="native" data-soft-maxlength={props.maxLength ?? undefined} ref={inputRef} className={`${className}${maskWhenInactive ? ' is-masked-when-inactive' : ''}`.trim()} value={value} onFocus={handleFocus} onChange={onInputChange} onKeyDown={handleKeyDown} onPointerDown={onPointerDown} onContextMenu={handleContextMenu} />
    {textMenu && <div className="discord-text-context-menu" style={{ left: textMenu.x, top: textMenu.y }} role="menu"><button type="button" role="menuitem" onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); setTextMenu(null); onOpenTextEditor?.(); }}>Open in text editor</button></div>}
    {(discordAutocomplete || templateAutocomplete) && match && position && showSuggestions && createPortal(<div ref={pickerRef} className="discord-emoji-suggestions" style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight, overflowY: 'auto' }} role="listbox" aria-label={match.kind === 'template' ? 'Template suggestions' : 'Emoji suggestions'}>
      <div className="discord-emoji-suggestion-heading">{match.kind === 'template' ? (match.filterStage ? 'FILTER' : match.pathStage ? 'VALUE PATH' : 'TEMPLATE') : 'EMOJI'}{match.query ? ` · ${match.query}` : ''}</div>
      {suggestions.length ? suggestions.map((item, index) => <button type="button" role="option" aria-selected={index === selectedIndex} className={`discord-emoji-suggestion ${index === selectedIndex ? 'is-selected' : ''}`} key={item.key} onPointerDown={(event) => event.preventDefault()} onMouseEnter={() => setSelectedIndex(index)} onClick={() => selectSuggestion(item)}>
        {match.kind === 'template' ? <span className="discord-emoji-suggestion-glyph">{match.filterStage ? '|' : item.type === 'function' ? 'ƒ' : item.type === 'variable' ? 'x' : '{{'}</span> : item.isCustom ? <img src={item.image} alt="" /> : <span className="discord-emoji-suggestion-glyph">{item.emoji}</span>}
        <span className="discord-emoji-suggestion-label">{match.kind === 'template' ? item.label : `:${item.label}:`}</span>
        {item.custom?.animated && <small>GIF</small>}
      </button>) : <div className="discord-emoji-suggestion-empty">{match.kind === 'template' ? 'No matching suggestions' : emojiEntries === null ? 'Loading emoji suggestions…' : 'No matching emoji'}</div>}
      <div className="discord-emoji-suggestion-footer">↑ ↓ to browse <kbd>Enter</kbd> to insert</div>
    </div>, document.body)}
  </>;
});
