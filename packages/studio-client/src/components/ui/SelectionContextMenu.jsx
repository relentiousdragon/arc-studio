import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import { onPageBlur } from '../../core/pageFocus.js';
//
function readSelectedText(target) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start !== null && end !== null && end > start) return target.value.slice(start, end);
  }
  return window.getSelection?.().toString() || '';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
}

export function SelectionContextMenu() {
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const onContextMenu = (event) => {
      if (event.altKey) return;
      if (event.target instanceof Element && event.target.closest('[data-node-card-id]')) return;
      const text = readSelectedText(event.target);
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      setMenu({ x: event.clientX, y: event.clientY, text });
    };
    document.addEventListener('contextmenu', onContextMenu, true);
    const removePageBlurListener = onPageBlur(() => setMenu(null));
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      removePageBlurListener();
    };
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setMenu(null);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const bounds = menuRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8));
    const y = Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8));
    if (x !== menu.x || y !== menu.y) setMenu((current) => current ? { ...current, x, y } : current);
  }, [menu]);

  if (!menu) return null;
  return createPortal(<div ref={menuRef} className="canvas-context-menu selection-context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
    <button role="menuitem" onClick={() => { void copyText(menu.text); setMenu(null); }}><Copy size={14} /> Copy selection</button>
  </div>, document.body);
}
