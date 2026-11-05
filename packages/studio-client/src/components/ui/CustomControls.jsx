import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { getArcUiScale } from '../../core/uiScale.js';
//
export function AnimatedCheckbox({ checked = false, onChange, label, className = '', onPointerDown, disabled = false }) {
  return <button
    type="button"
    role="checkbox"
    aria-checked={Boolean(checked)}
    aria-label={label}
    disabled={disabled}
    className={`arc-checkbox ${checked ? 'is-checked' : ''} ${className}`}
    onPointerDown={onPointerDown}
    onClick={() => onChange?.(!checked)}
  ><Check size={11} strokeWidth={3} /></button>;
}

export function AnimatedDropdown({
  value, onChange, options = [], placeholder = 'Select…', ariaLabel, className = '', onPointerDown,
  searchable = options.length >= 8, searchThreshold = 8, disabled = false, multiple = false
}) {
  const generatedId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const uiScale = getArcUiScale();
  const searchRequested = Boolean(searchable);
  const selected = options.find((option) => option.value === value);
  const selectedValues = multiple && Array.isArray(value) ? value.map(String) : [];
  const selectedLabels = multiple ? options.filter((option) => selectedValues.includes(String(option.value))).map((option) => option.label) : [];
  const isSelected = (option) => multiple ? selectedValues.includes(String(option.value)) : option.value === value;
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => `${option.label} ${option.description || ''}`.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return undefined;
    const margin = 12;
    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const viewportWidth = window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.visualViewport?.height || document.documentElement.clientHeight || window.innerHeight;
      const width = Math.min(trigger.width, viewportWidth - margin * 2);
      const left = Math.max(margin, Math.min(trigger.left, viewportWidth - width - margin));
      const below = viewportHeight - trigger.bottom - 6;
      const above = trigger.top - 6;
      const sideSpace = Math.max(0, Math.max(below, above));
      const maxHeight = Math.min(420 * uiScale, Math.max(0, viewportHeight - margin * 2), sideSpace);
      const menuChrome = 10 * uiScale;
      const showSearch = searchRequested && (options.length >= searchThreshold || options.length * 28 * uiScale + menuChrome > maxHeight);
      const searchHeight = showSearch ? 42 * uiScale : 0;
      const fullHeight = options.length * 28 * uiScale + menuChrome + searchHeight;
      const desiredHeight = Math.min(maxHeight, fullHeight);
      const placeBelow = below >= desiredHeight || below >= above;
      const available = Math.max(0, Math.min(desiredHeight, Math.max(0, placeBelow ? below : above)));
      const top = placeBelow ? trigger.bottom + 4 : Math.max(margin, trigger.top - available - 4);
      const optionsHeight = Math.max(0, available / uiScale - (showSearch ? 42 : 10));
      const menuWidth = width / uiScale;
      setMenuPosition((current) => current && current.left === left && current.top === top && current.width === menuWidth && current.maxHeight === available / uiScale && current.optionsHeight === optionsHeight && current.showSearch === showSearch
        ? current
        : { left, top, width: menuWidth, maxHeight: available / uiScale, optionsHeight, showSearch });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    observer?.observe(triggerRef.current);
    const appRoot = document.querySelector('.app-root');
    if (appRoot) observer?.observe(appRoot);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
      observer?.disconnect();
    };
  }, [open, searchRequested, searchThreshold, options.length, uiScale]);

  useEffect(() => {
    if (open && menuPosition?.showSearch) searchRef.current?.focus();
  }, [open, menuPosition?.showSearch]);

  const choose = (option) => {
    if (multiple) {
      const entry = String(option.value);
      onChange?.(selectedValues.includes(entry) ? selectedValues.filter((item) => item !== entry) : [...selectedValues, entry]);
      setQuery('');
      return;
    }
    onChange?.(option.value);
    setOpen(false);
    setQuery('');
    setMenuPosition(null);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (!open && event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const increment = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + increment + filteredOptions.length) % Math.max(1, filteredOptions.length));
    } else if (event.key === 'Enter' && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    }
  };

  return <div
    ref={rootRef}
    className={`arc-dropdown ${open ? 'is-open' : ''} ${className}`}
    onPointerDown={onPointerDown}
    onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) setOpen(false); }}
  >
    <button
      ref={triggerRef}
      type="button"
      className={`arc-dropdown-trigger ${open ? 'is-open' : ''}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      aria-controls={`dropdown-${generatedId}`}
      disabled={disabled}
      onClick={() => {
        const nextOpen = !open;
        setOpen(nextOpen);
        setQuery('');
        if (!nextOpen) setMenuPosition(null);
        setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
      }}
      onKeyDown={handleKeyDown}
    >
      <span className={(multiple ? !selectedLabels.length : !selected) ? 'is-placeholder' : ''}>{multiple ? (selectedLabels.length ? selectedLabels.join(', ') : placeholder) : selected?.label || placeholder}</span>
      <ChevronDown size={13} className="arc-dropdown-chevron" />
    </button>
    {open && createPortal(<div
      ref={menuRef}
      className="arc-dropdown-menu"
      id={`dropdown-${generatedId}`}
      role="listbox"
      aria-label={ariaLabel}
      style={{ left: menuPosition?.left ?? -10000, top: menuPosition?.top ?? -10000, width: menuPosition?.width, maxHeight: menuPosition?.maxHeight, transform: `scale(${uiScale})`, transformOrigin: 'top left', '--dropdown-options-height': `${menuPosition?.optionsHeight ?? 220}px` }}
      onPointerDown={(event) => { event.stopPropagation(); onPointerDown?.(event); }}
    >
      {menuPosition?.showSearch && <label className="arc-dropdown-search"><Search size={13} /><input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder="Search…" aria-label="Search options" /></label>}
      <div className="arc-dropdown-options">
        {filteredOptions.length ? filteredOptions.map((option, index) => <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={isSelected(option)}
          className={`arc-dropdown-option ${isSelected(option) ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''}`}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(option); }}
        ><span>{option.label}</span>{isSelected(option) && <Check size={13} />}</button>) : <div className="arc-dropdown-empty">No matches</div>}
      </div>
    </div>, document.body)}
  </div>;
}
