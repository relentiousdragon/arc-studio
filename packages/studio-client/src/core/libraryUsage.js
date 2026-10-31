import { readAppStorage, writeAppStorage } from './storage.js';
import { arcEvents } from './ArcEvents.js';
//
export function readLibraryUsage(storageKey) {
  try {
    const parsed = JSON.parse(readAppStorage(storageKey, '{}') || '{}');
    const safeEntries = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { nodes: safeEntries(parsed.nodes), graphs: safeEntries(parsed.graphs), embeds: safeEntries(parsed.embeds) };
  } catch {
    return { nodes: {}, graphs: {}, embeds: {} };
  }
}

export function recordLibraryItemUsage(usageScope, kind, id) {
  if (!id || !['nodes', 'graphs', 'embeds'].includes(kind)) return;
  const storageKey = `arc_library_usage:${usageScope || 'default'}`;
  const previous = readLibraryUsage(storageKey);
  const next = { nodes: { ...previous.nodes }, graphs: { ...previous.graphs }, embeds: { ...previous.embeds } };
  const current = next[kind][id] || { count: 0, usedAt: 0 };
  next[kind][id] = { count: current.count + 1, usedAt: Date.now() };
  const entries = Object.entries(next[kind]).sort((a, b) => b[1].usedAt - a[1].usedAt).slice(0, 300);
  next[kind] = Object.fromEntries(entries);
  writeAppStorage(storageKey, JSON.stringify(next));
  arcEvents.emit('library:usage-updated', { usageScope, usage: next });
}

// contributors: @relentiousdragon