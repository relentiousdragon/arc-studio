function isMacOSDesktop() {
  return Boolean(window.__ARC_STUDIO_CONFIG__?.desktop)
    && (window.__ARC_STUDIO_CONFIG__?.platform === 'macos' || /Mac|iPhone|iPad/.test(navigator.platform || ''));
}

function isSafariBrowser() {
  const userAgent = navigator.userAgent || '';
  const safari = navigator.vendor === 'Apple Computer, Inc.'
    && /Version\//.test(userAgent)
    && /Safari\//.test(userAgent);
  return safari && !/(Chrome|Chromium|CriOS|Edg|OPR|Opera|Firefox|FxiOS|DuckDuckGo)/i.test(userAgent);
}

function copyComputedStyles(source, target) {
  const styles = getComputedStyle(source);
  for (const property of styles) {
    target.style.setProperty(property, styles.getPropertyValue(property), styles.getPropertyPriority(property));
  }
  const sourceChildren = source.children;
  const targetChildren = target.children;
  for (let index = 0; index < sourceChildren.length; index += 1) {
    if (targetChildren[index]) copyComputedStyles(sourceChildren[index], targetChildren[index]);
  }
}

export function setNativePaletteDragPreview(event) {
  if (!isMacOSDesktop() && !isSafariBrowser()) return;
  const source = event.currentTarget;
  const transfer = event.dataTransfer;
  if (!(source instanceof HTMLElement) || typeof transfer?.setDragImage !== 'function' || !document.body) return;

  const bounds = source.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;

  const preview = source.cloneNode(true);
  copyComputedStyles(source, preview);
  preview.removeAttribute('draggable');
  preview.setAttribute('aria-hidden', 'true');
  preview.tabIndex = -1;
  const scaleX = bounds.width / Math.max(1, source.offsetWidth);
  const scaleY = bounds.height / Math.max(1, source.offsetHeight);
  Object.assign(preview.style, {
    position: 'fixed',
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    zIndex: '2147483647',
    margin: '0',
    transform: `scale(${scaleX}, ${scaleY})`,
    transformOrigin: 'top left',
    transition: 'none',
    animation: 'none',
    pointerEvents: 'none'
  });

  try {
    document.body.appendChild(preview);
    const offsetX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const offsetY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    transfer.setDragImage(preview, offsetX, offsetY);
    window.setTimeout(() => preview.remove(), 0);
  } catch {
    preview.remove();
  }
}
