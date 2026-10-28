import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
//
export function Modal({ isOpen, onClose, onConfirm, title, subtitle, icon: Icon, iconClassName = '', headerMeta, children, footer, maxWidth, panelClassName = '', shake = false, showScrollCue = false }) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const [hasMoreContent, setHasMoreContent] = useState(false);
  const [scrollCueMounted, setScrollCueMounted] = useState(false);
  const onCloseRef = useRef(onClose);
  const onConfirmRef = useRef(onConfirm);
  onCloseRef.current = onClose;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    const body = bodyRef.current;
    if (!isOpen || !showScrollCue || !body) {
      setHasMoreContent(false);
      setScrollCueMounted(false);
      return undefined;
    }
    let hideTimer = 0;
    const updateScrollCue = () => {
      const remaining = body.scrollHeight - body.clientHeight - body.scrollTop;
      const canScrollFurther = remaining > 8;
      setHasMoreContent(canScrollFurther);
      if (canScrollFurther) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
        setScrollCueMounted(true);
      } else if (!hideTimer) {
        hideTimer = window.setTimeout(() => setScrollCueMounted(false), 180);
      }
    };
    updateScrollCue();
    body.addEventListener('scroll', updateScrollCue, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollCue);
    resizeObserver?.observe(body);
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(updateScrollCue);
    mutationObserver?.observe(body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', updateScrollCue);
    return () => {
      body.removeEventListener('scroll', updateScrollCue);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', updateScrollCue);
      window.clearTimeout(hideTimer);
    };
  }, [isOpen, showScrollCue, children]);

  useEffect(() => {
    if (!isOpen) return undefined;
    dialogRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('textarea, select, button, [role="combobox"]'))) return;
      const dialog = dialogRef.current;
      if (!dialog?.contains(target)) return;
      const form = target instanceof HTMLInputElement ? target.form : null;
      const formSubmitter = form?.querySelector('button[type="submit"], input[type="submit"]');
      if (form && formSubmitter) {
        event.preventDefault();
        form.requestSubmit(formSubmitter);
        return;
      }
      event.preventDefault();
      if (onConfirmRef.current) {
        onConfirmRef.current();
        return;
      }
      const modalButtons = [...dialog.querySelectorAll('button.studio-button')];
      const enabledButtons = modalButtons.filter((button) => !button.disabled);
      const primary = enabledButtons.filter((button) => button.classList.contains('studio-button-primary'));
      const danger = enabledButtons.filter((button) => button.classList.contains('studio-button-danger'));
      const action = primary.at(-1) || danger.at(-1) || enabledButtons.filter((button) => !button.classList.contains('studio-button-secondary')).at(-1);
      action?.click();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;
  const widthClass = String(maxWidth || '').includes('2xl') ? 'modal-wide' : String(maxWidth || '').includes('lg') ? 'modal-medium' : '';
  return <div className="dialog-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
    <section ref={dialogRef} className={`modal-panel ${widthClass} ${panelClassName} ${shake ? 'is-shaking' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <header className="modal-header">
        {Icon && <div className={`modal-title-icon ${iconClassName}`}><Icon size={17} /></div>}
        <div className="modal-title-copy"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {headerMeta && <div className="modal-header-meta">{headerMeta}</div>}
        <button type="button" className="icon-button" onClick={(event) => { event.stopPropagation(); onClose?.(); }} aria-label="Close dialog"><X size={17} /></button>
      </header>
      <div ref={bodyRef} className="modal-body">{children}</div>
      {showScrollCue && scrollCueMounted && <button type="button" className={`modal-scroll-cue ${hasMoreContent ? '' : 'is-hiding'}`} aria-label="Scroll to the remaining options" onClick={() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })}><ChevronDown size={15} /></button>}
      {footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>;
}
