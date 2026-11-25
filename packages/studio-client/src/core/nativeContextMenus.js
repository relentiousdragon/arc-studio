const MENU_SELECTOR = [
  '.canvas-context-menu',
  '.graph-context-menu',
  '.project-context-menu',
  '.discord-text-context-menu'
].join(',');

const SOURCE_CLASS = 'arc-native-context-menu-source';
const MENU_ITEMS_SELECTOR = 'button, [role="menuitem"]';
//
function isVisibleMenu(menu) {
  if (!(menu instanceof HTMLElement) || !menu.isConnected) return false;
  if (getComputedStyle(menu).display === 'none') return false;
  return Boolean(menu.querySelector(MENU_ITEMS_SELECTOR));
}

function getMenuSignature(menu) {
  const position = `${menu.style.left || ''}:${menu.style.top || ''}`;
  const items = [...menu.querySelectorAll(MENU_ITEMS_SELECTOR)].map((item) => {
    const label = readText(item);
    return `${label}:${Boolean(item.disabled || item.getAttribute('aria-disabled') === 'true')}`;
  }).join('|');
  return `${menu.className}:${position}:${items}`;
}

function readText(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll('svg, img, kbd, [aria-hidden="true"], .context-shortcut').forEach((item) => item.remove());
  return String(copy.innerText || copy.textContent || '').replace(/\s+/g, ' ').trim();
}

function shortcutTokens(element) {
  const group = element.querySelector('.context-shortcut');
  if (!group) return [];
  const keys = [...group.querySelectorAll('kbd')].map((key) => String(key.textContent || '').trim()).filter(Boolean);
  if (keys.length > 1) return keys;
  const value = keys[0] || '';
  return value.match(/CmdOrCtrl|CommandOrCtrl|Command|Control|Ctrl|Option|Alt|Shift|Super|Cmd|⌘|⌃|⌥|⇧|Backspace|Delete|Enter|Return|Escape|Esc|Space|Arrow(?:Up|Down|Left|Right)|F\d{1,2}|[A-Za-z0-9]|[.,=\-\[\]\\/↑↓←→⌫⌦]/gi) || [];
}

function getNativeAccelerator(element, isMacOS) {
  if (!isMacOS) return undefined;
  const modifiers = [];
  const modifierNames = new Map([
    ['⌘', 'Command'], ['cmd', 'Command'], ['command', 'Command'], ['cmdorctrl', 'Command'], ['commandorctrl', 'Command'],
    ['⌃', 'Control'], ['ctrl', 'Control'], ['control', 'Control'],
    ['⌥', 'Option'], ['alt', 'Option'], ['option', 'Option'],
    ['⇧', 'Shift'], ['shift', 'Shift'], ['super', 'Command']
  ]);
  let key = '';
  for (const token of shortcutTokens(element)) {
    const normalized = token.toLowerCase();
    const modifier = modifierNames.get(normalized);
    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier);
      continue;
    }
    const aliases = new Map([
      ['return', 'Enter'], ['esc', 'Escape'], ['space', 'Space'],
      ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['←', 'ArrowLeft'], ['→', 'ArrowRight'],
      ['⌫', 'Backspace'], ['⌦', 'Delete']
    ]);
    key = aliases.get(token) || (/^f\d{1,2}$/i.test(token) ? token.toUpperCase() : /^[a-z]$/i.test(token) || /^\d$/.test(token) ? token.toUpperCase() : token);
    break;
  }
  if (!key) return undefined;
  if (/^[^A-Za-z0-9]$/.test(key) && ![',', '=', '-', '[', ']', '\\', '/', '.'].includes(key)) return undefined;
  return [...modifiers, key].join('+');
}

function getIconSvg(element) {
  return element.querySelector('svg');
}

async function createNativeIcon(svg, Image, imageCache, imageResources) {
  if (!svg) return undefined;

  const color = getComputedStyle(svg).color || '#5f6878';
  const markup = svg.outerHTML.replace(/currentColor/g, color);
  const cacheKey = `${color}:${markup}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const imagePromise = (async () => {
    let bitmap;
    try {
      const source = new Blob([markup], { type: 'image/svg+xml' });
      bitmap = await createImageBitmap(source);
      const canvas = document.createElement('canvas');
      canvas.width = 20;
      canvas.height = 20;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return undefined;
      context.drawImage(bitmap, 2, 2, 16, 16);
      const rgba = context.getImageData(0, 0, 20, 20).data;
      const image = await Image.new(new Uint8Array(rgba), 20, 20);
      imageResources.push(image);
      return image;
    } catch {
      return undefined;
    } finally {
      bitmap?.close?.();
    }
  })();

  imageCache.set(cacheKey, imagePromise);
  return imagePromise;
}

function getMenuLabel(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll('svg, img, kbd, [aria-hidden="true"], .context-shortcut').forEach((item) => item.remove());
  const label = String(copy.innerText || copy.textContent || '').replace(/\s+/g, ' ').trim();
  return label || String(element.getAttribute('aria-label') || element.getAttribute('title') || '').trim();
}

function getMenuActions(element, root) {
  if (element.matches(MENU_ITEMS_SELECTOR)) return [element];
  return [...element.querySelectorAll(MENU_ITEMS_SELECTOR)].filter((item) => item.closest(MENU_SELECTOR) === root);
}

async function makeActionItem(element, options) {
  const label = getMenuLabel(element);
  if (!label) return null;

  const icon = await createNativeIcon(getIconSvg(element), options.Image, options.imageCache, options.imageResources);
  const accelerator = getNativeAccelerator(element, options.isMacOS);
  return {
    id: `arc-context-${++options.nextItemId}`,
    text: label,
    enabled: !element.disabled && element.getAttribute('aria-disabled') !== 'true',
    ...(accelerator ? { accelerator } : {}),
    ...(icon ? { icon } : {}),
    action: () => {
      if (element.isConnected && !element.disabled && element.getAttribute('aria-disabled') !== 'true') element.click();
      options.onAction();
    }
  };
}

function appendSeparator(items) {
  if (!items.length || items.at(-1)?.item === 'Separator') return;
  items.push({ item: 'Separator' });
}

async function makeItemsFromContainer(container, root, options) {
  const specifications = [];
  const children = [...container.children];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.matches('[data-native-submenu]')) {
      const label = getMenuLabel(child);
      const submenuItems = [];
      let cursor = index + 1;
      for (; cursor < children.length; cursor += 1) {
        const sibling = children[cursor];
        if (sibling.matches('.context-menu-heading, [data-native-submenu]') || sibling.hasAttribute('data-native-submenu-end')) break;
        submenuItems.push(...getMenuActions(sibling, root));
      }

      if (label && submenuItems.length) specifications.push({ type: 'submenu', label, icon: getIconSvg(child), actions: submenuItems });
      index = cursor - 1;
      continue;
    }

    if (child.matches('.context-menu-heading, [role="separator"]')) {
      specifications.push({ type: 'separator' });
      continue;
    }

    if (child.hasAttribute('data-native-submenu-end')) specifications.push({ type: 'separator' });
    const actions = getMenuActions(child, root);
    if (actions.length) specifications.push({ type: 'actions', actions });
  }

  const groups = await Promise.all(specifications.map(async (specification) => {
    if (specification.type === 'separator') return [{ item: 'Separator' }];
    const actions = await Promise.all(specification.actions.map((action) => makeActionItem(action, options)));
    const items = actions.filter(Boolean);
    if (specification.type === 'submenu') {
      if (!items.length) return [];
      const icon = await createNativeIcon(specification.icon, options.Image, options.imageCache, options.imageResources);
      return [{ text: specification.label, items, ...(icon ? { icon } : {}) }];
    }
    return items;
  }));

  const entries = [];
  for (const group of groups) {
    for (const item of group) {
      if (item.item === 'Separator') appendSeparator(entries);
      else entries.push(item);
    }
  }
  while (entries.at(-1)?.item === 'Separator') entries.pop();
  return entries;
}

function getContextPosition(event) {
  let x = Number(event.clientX) || 0;
  let y = Number(event.clientY) || 0;
  if (x !== 0 || y !== 0) return { x, y };

  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest('button, input, textarea, [tabindex], [data-node-card-id]') || target;
  const bounds = anchor?.getBoundingClientRect?.();
  if (bounds) {
    x = Math.max(0, Math.min(window.innerWidth, bounds.left + Math.min(bounds.width / 2, 24)));
    y = Math.max(0, Math.min(window.innerHeight, bounds.bottom));
  }
  return { x, y };
}

function findChangedMenu(snapshots, position) {
  const candidates = [...document.querySelectorAll(MENU_SELECTOR)].filter(isVisibleMenu).map((menu) => {
    const bounds = menu.getBoundingClientRect();
    const dx = position.x < bounds.left ? bounds.left - position.x : position.x > bounds.right ? position.x - bounds.right : 0;
    const dy = position.y < bounds.top ? bounds.top - position.y : position.y > bounds.bottom ? position.y - bounds.bottom : 0;
    const changed = snapshots.get(menu) !== getMenuSignature(menu);
    return { menu, changed, distance: dx + dy };
  });

  candidates.sort((left, right) => Number(right.changed) - Number(left.changed) || left.distance - right.distance);
  const best = candidates[0];
  return best && (best.changed || best.distance <= 36) ? best.menu : null;
}

function isEditableTarget(target) {
  return target instanceof Element && Boolean(target.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, [contenteditable="true"]'));
}

function createNativeTextActions(root, target, isMacOS) {
  if (!isEditableTarget(target)) return [];
  const hasSelectionAction = root.classList.contains('selection-context-menu');
  return [
    ...(isMacOS ? [{ item: 'Undo' }, { item: 'Redo' }, { item: 'Separator' }] : []),
    { item: 'Cut' },
    ...(!hasSelectionAction ? [{ item: 'Copy' }] : []),
    { item: 'Paste' },
    { item: 'SelectAll' },
    { item: 'Separator' }
  ];
}

export function installNativeContextMenuBridge() {
  if (typeof window.__TAURI_INTERNALS__?.invoke !== 'function') return () => {};

  let disposed = false;
  let nativeMenuDisabled = false;
  let requestId = 0;
  let currentMenu = null;
  let menuApiPromise;
  let active = false;

  const setActive = (value) => {
    active = value;
    window.__ARC_NATIVE_CONTEXT_MENU_OPEN__ = value;
  };

  const closeCurrentMenu = async () => {
    const menu = currentMenu;
    currentMenu = null;
    try { await menu?.close?.(); } catch {}
  };

  const clearActive = () => {
    if (!active) return;
    setActive(false);
  };

  const dispatchSourceMenuDismissal = () => {
    clearActive();
    const PointerEventType = window.PointerEvent || window.MouseEvent;
    document.dispatchEvent(new PointerEventType('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  };

  const handlePointerDown = () => clearActive();
  const loadMenuApi = () => menuApiPromise ||= Promise.all([
    import('@tauri-apps/api/menu'),
    import('@tauri-apps/api/dpi'),
    import('@tauri-apps/api/image')
  ]).then(([menu, dpi, image]) => ({ ...menu, ...dpi, Image: image.Image }));

  const openNativeMenu = async (event, snapshots, id) => {
    const position = getContextPosition(event);
    const root = findChangedMenu(snapshots, position);
    if (!root || disposed || nativeMenuDisabled || id !== requestId) return;

    root.classList.add(SOURCE_CLASS);
    const imageResources = [];
    let nativeMenu;
    try {
      await closeCurrentMenu();
      const api = await loadMenuApi();
      if (disposed || id !== requestId) {
        root.classList.remove(SOURCE_CLASS);
        return;
      }

      const options = {
        Image: api.Image,
        imageCache: new Map(),
        imageResources,
        isMacOS: window.__ARC_STUDIO_CONFIG__?.platform === 'macos' || /Mac|iPhone|iPad/.test(navigator.platform || ''),
        isWindows: window.__ARC_STUDIO_CONFIG__?.platform === 'windows' || /Win/.test(navigator.platform || ''),
        actionSelected: false,
        nextItemId: 0,
        onAction: () => {
          options.actionSelected = true;
          clearActive();
        }
      };
      const customItems = await makeItemsFromContainer(root, root, options);
      const items = [...createNativeTextActions(root, event.target, options.isMacOS), ...customItems];
      if (!items.some((item) => item.text || item.item !== 'Separator')) {
        root.classList.remove(SOURCE_CLASS);
        return;
      }

      nativeMenu = await api.Menu.new({ items });
      for (const image of imageResources) {
        try { await image.close(); } catch {}
      }
      imageResources.length = 0;

      if (disposed || id !== requestId) {
        root.classList.remove(SOURCE_CLASS);
        await nativeMenu.close();
        return;
      }

      currentMenu = nativeMenu;
      setActive(true);
      await nativeMenu.popup(new api.LogicalPosition(position.x, position.y));
      // macOS and Windows consume the outside click while tracking native menus.
      if (id === requestId && !options.actionSelected && (options.isMacOS || options.isWindows)) dispatchSourceMenuDismissal();
      if (currentMenu === nativeMenu) currentMenu = null;
      try { await nativeMenu.close(); } catch {}
    } catch (error) {
      nativeMenuDisabled = true;
      root.classList.remove(SOURCE_CLASS);
      clearActive();
      for (const image of imageResources) {
        try { await image.close(); } catch {}
      }
      try { await nativeMenu?.close?.(); } catch {}
      if (!disposed) console.warn('[ARC] Native context menus are unavailable. Using the custom menu.', error);
    }
  };

  const handleContextMenu = (event) => {
    if (nativeMenuDisabled || disposed) return;
    clearActive();
    const id = ++requestId;
    const snapshots = new Map([...document.querySelectorAll(MENU_SELECTOR)].map((menu) => [menu, getMenuSignature(menu)]));
    window.setTimeout(() => { void openNativeMenu(event, snapshots, id); }, 0);
  };

  const handleClick = (event) => {
    if (nativeMenuDisabled || disposed || event.isTrusted === false) return;
    const id = ++requestId;
    const snapshots = new Map([...document.querySelectorAll(MENU_SELECTOR)].map((menu) => [menu, getMenuSignature(menu)]));
    window.setTimeout(() => { void openNativeMenu(event, snapshots, id); }, 0);
  };

  window.addEventListener('contextmenu', handleContextMenu, true);
  window.addEventListener('click', handleClick, true);
  window.addEventListener('pointerdown', handlePointerDown, true);

  return () => {
    disposed = true;
    requestId += 1;
    clearActive();
    window.removeEventListener('contextmenu', handleContextMenu, true);
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('pointerdown', handlePointerDown, true);
    document.querySelectorAll(`.${SOURCE_CLASS}`).forEach((menu) => menu.classList.remove(SOURCE_CLASS));
    void closeCurrentMenu();
    delete window.__ARC_NATIVE_CONTEXT_MENU_OPEN__;
  };
}
