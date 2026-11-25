import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_SHORTCUTS, shortcutMatches } from '../../core/shortcuts.js';
import { onPageBlur } from '../../core/pageFocus.js';

import { getCaretCoordinates } from '../../core/caretCoordinates.js';
//
const EmojiPicker = lazy(async () => {
  const { default: Picker, Theme } = await import('emoji-picker-react');
  function ThemedEmojiPicker(props) {
    const theme = document.documentElement.dataset.theme === 'light' ? Theme.LIGHT : Theme.DARK;
    return <Picker {...props} theme={theme} />;
  }
  ThemedEmojiPicker.displayName = 'ThemedEmojiPicker';
  return { default: ThemedEmojiPicker };
});

function isTextField(element) {
  if (!(element instanceof HTMLElement) || element.isContentEditable) return false;
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (!(element instanceof HTMLInputElement)) return false;
  return !element.disabled && !element.readOnly && !['number', 'range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'date', 'datetime-local', 'month', 'time', 'week', 'hidden'].includes(element.type);
}

function customMarkup(emojiObject, appEmojis) {
  if (!emojiObject?.isCustom) return emojiObject?.emoji || '';
  const name = emojiObject.names?.[0];
  const custom = appEmojis.find((item) => item.name?.toLowerCase() === name?.toLowerCase());
  return custom ? `<${custom.animated ? 'a' : ''}:${custom.name}:${custom.id}>` : emojiObject.emoji || '';
}

export function EmojiPickerOverlay({ appEmojis = [], shortcut = DEFAULT_SHORTCUTS.emojiPicker, desktopMode = false }) {
  const pickerRef = useRef(null);
  const targetRef = useRef(null);
  const selectionRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const pickerEmojis = useMemo(() => appEmojis.map((emoji) => ({
    id: emoji.id,
    names: [emoji.name],
    imgUrl: `https://cdn.discordapp.com/emojis/${encodeURIComponent(emoji.id)}.${emoji.animated ? 'gif' : 'webp'}?size=64`
  })), [appEmojis]);

  const updatePosition = useCallback(() => {
    const target = targetRef.current;
    if (!target?.isConnected) return setIsOpen(false);
    const rect = target.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 20);
    const height = Math.min(430, window.innerHeight - 20);

    const caretPos = selectionRef.current?.start ?? (target.selectionStart ?? target.value.length);
    const caret = getCaretCoordinates(target, caretPos);
    const scrollLeft = target.scrollLeft || 0;
    const scrollTop = target.scrollTop || 0;

    const caretScreenX = rect.left + caret.left - scrollLeft;
    const caretScreenY = rect.top + caret.top - scrollTop;

    const left = Math.max(10, Math.min(caretScreenX - 12, window.innerWidth - width - 10));
    const spaceBelow = window.innerHeight - (caretScreenY + caret.height);
    const top = spaceBelow >= height + 10 || spaceBelow >= caretScreenY
      ? Math.min(window.innerHeight - height - 10, caretScreenY + caret.height + 8)
      : Math.max(10, caretScreenY - height - 8);

    setPosition({ left, top, width, height });
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (window.__ARC_STUDIO_PROMPT_BLOCKED__) return;
      if (isOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        return;
      }
      if (!shortcutMatches(event, shortcut)) return;
      const target = document.activeElement;
      if (!isTextField(target) || target.closest('.arc-full-emoji-picker')) return;
      event.preventDefault();
      event.stopPropagation();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      targetRef.current = target;
      selectionRef.current = { start, end, value: target.value };
      window.dispatchEvent(new CustomEvent('arc:emoji-picker-open'));
      setIsOpen(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, shortcut]);

  useEffect(() => {
    if (!isOpen) return undefined;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const removePageBlurListener = onPageBlur(() => setIsOpen(false));
    const closeOutside = (event) => {
      if (pickerRef.current?.contains(event.target)) return;
      if (targetRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', closeOutside, true);
      removePageBlurListener();
    };
  }, [isOpen, updatePosition]);

  const insertEmoji = (emojiObject) => {
    const target = targetRef.current;
    const saved = selectionRef.current;
    if (!target?.isConnected || !saved) return setIsOpen(false);
    const text = customMarkup(emojiObject, appEmojis);
    const current = String(target.value ?? '');
    const start = Math.min(saved.start, current.length);
    const end = Math.min(saved.end, current.length);
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`;
    if (target.maxLength >= 0 && next.length > target.maxLength) return;
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(target, next);
    const caret = start + text.length;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
    target.setSelectionRange?.(caret, caret);
    selectionRef.current = { start: caret, end: caret, value: next };
    setIsOpen(false);
  };

  if (!isOpen || !position) return null;
  return createPortal(<div ref={pickerRef} className="discord-emoji-picker arc-full-emoji-picker" style={{ left: position.left, top: position.top, width: position.width }} onPointerDown={(event) => event.stopPropagation()}>
    <Suspense fallback={desktopMode
      ? <div className="emoji-picker-loading" role="status">Loading emoji picker…</div>
      : <div className="emoji-picker-skeleton" role="status" aria-label="Loading emoji picker"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>}>
      <EmojiPicker onEmojiClick={insertEmoji} customEmojis={pickerEmojis} lazyLoadEmojis width="100%" height={position.height} searchPlaceHolder="Search all emojis" />
    </Suspense>
  </div>, document.body);
}
