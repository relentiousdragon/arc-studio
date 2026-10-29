import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Puzzle, Search, X, Plus, Workflow } from 'lucide-react';
import { NodeTypeIcon } from '../nodes/NodeTypeIcon.jsx';
import { createSearchIndex } from './nodeSearch.js';
//
export function CommandPalette({ isOpen, graphs = [], definitions = [], plugins = [], onClose, onAddNode, onOpenGraph, onOpenPlugin, onGoToNode }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const allItems = useMemo(() => {
    const definitionsByType = new Map(definitions.map((definition) => [definition.type, definition]));
    const nodeItems = definitions.filter((node) => !node.hidden).map((node) => ({
      id: `add:${node.type}`, kind: 'add', group: node.pluginAdapter ? 'Plugin nodes' : 'Nodes', label: node.label,
      detail: `${node.category || 'Node'}${node.pluginName ? ` · ${node.pluginName}` : ''}`,
      disabled: Boolean(node.loadFailed),
      searchFields: [node.label, node.description, node.category, node.pluginName, node.type.replaceAll('_', ' '), ...(node.inputs || []).map((pin) => pin.label), ...(node.outputs || []).map((pin) => pin.label)],
      icon: node, onSelect: () => { if (!node.loadFailed) onAddNode?.(node.type); }
    }));
    const graphItems = graphs.map((graph) => ({
      id: `graph:${graph.id}`, kind: 'graph', group: 'Graphs', label: graph.name || 'Untitled graph',
      detail: graph.graphType === 'function' ? 'Function graph' : 'Open graph', searchFields: [graph.name, graph.graphType, graph.id],
      icon: null, onSelect: () => onOpenGraph?.(graph)
    }));
    const instanceItems = graphs.flatMap((graph) => (graph.nodes || []).map((node) => {
      const definition = definitionsByType.get(node.type);
      return {
        id: `node:${graph.id}:${node.id}`, kind: 'instance', group: 'Nodes in graphs', label: node.label || definition?.label || node.type,
        detail: `${graph.name || 'Untitled graph'} · ${definition?.label || node.type}`,
        disabled: !definition || Boolean(definition.loadFailed),
        searchFields: [node.label, node.type.replaceAll('_', ' '), definition?.label, definition?.description, graph.name, ...(definition?.inputs || []).map((pin) => pin.label), ...(definition?.outputs || []).map((pin) => pin.label)],
        graphId: graph.id, nodeId: node.id, icon: definition || null, onSelect: () => onGoToNode?.(graph.id, node.id)
      };
    }));
    const pluginMap = new Map(plugins.map((plugin) => [plugin.id, {
      id: `plugin:${plugin.id}`, kind: 'plugin', group: 'Plugins', label: plugin.name || plugin.id,
      detail: 'Installed plugin', searchFields: [plugin.name, plugin.id, plugin.description],
      icon: null, pluginId: plugin.id, nodeCount: 0
    }]));
    for (const node of definitions.filter((item) => item.pluginAdapter)) {
      const id = node.pluginId || node.pluginName || 'plugin';
      const entry = pluginMap.get(id) || { id: `plugin:${id}`, kind: 'plugin', group: 'Plugins', label: node.pluginName || node.pluginId || 'Installed plugin', detail: 'Installed node pack', searchFields: [], icon: null, pluginId: id, nodeCount: 0 };
      entry.searchFields.push(node.pluginName, node.pluginId, node.label, node.description, node.type.replaceAll('_', ' '));
      entry.nodeCount += 1;
      pluginMap.set(id, entry);
    }
    const pluginItems = [...pluginMap.values()].map((item) => ({ ...item, detail: `${item.nodeCount} node${item.nodeCount === 1 ? '' : 's'} · installed`, onSelect: () => onOpenPlugin?.(item.pluginId) }));
    return [...nodeItems, ...instanceItems, ...graphItems, ...pluginItems];
  }, [definitions, graphs, onAddNode, onGoToNode, onOpenGraph, onOpenPlugin, plugins]);
  const searchIndex = useMemo(() => createSearchIndex(allItems, (item) => [item.label, item.detail, ...item.searchFields]), [allItems]);
  const items = useMemo(() => {
    const rawQuery = query.trim();
    const command = rawQuery.match(/^([!@#])\s*/);
    const needle = rawQuery.replace(/^([!@#])\s*/, '').trim();
    const commandKind = command?.[1] === '!' ? 'add' : command?.[1] === '@' ? 'instance' : command?.[1] === '#' ? 'graph' : null;
    if (!needle) {
      const candidates = commandKind ? allItems.filter((item) => item.kind === commandKind) : allItems;
      if (commandKind) return candidates.slice(0, 80);
      const suggestedNodes = candidates.filter((node) => node.kind === 'add').slice(0, 5);
      const graphNodes = candidates.filter((node) => node.kind === 'instance').slice(0, 5);
      return [...suggestedNodes, ...graphNodes];
    }
    return searchIndex.search(needle, 80, (item) => !commandKind || item.kind === commandKind).map((entry) => entry.item);
  }, [allItems, query, searchIndex]);

  const groups = useMemo(() => {
    const result = [];
    for (const item of items) {
      let group = result.find((entry) => entry.label === item.group);
      if (!group) { group = { label: item.group, items: [] }; result.push(group); }
      group.items.push(item);
    }
    return result;
  }, [items]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    setActiveIndex(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose?.(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, items.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && items[activeIndex] && !items[activeIndex].disabled) { event.preventDefault(); items[activeIndex].onSelect?.(); onClose?.(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, isOpen, items, onClose]);

  useEffect(() => setActiveIndex(0), [query]);
  if (!isOpen) return null;

  let index = -1;
  return <div className="dialog-scrim command-palette-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search ARC Studio">
      <div className="command-palette-search"><Search size={17} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search… · ! nodes · @ nodes in graphs · # graphs" aria-label="Search graphs, nodes, and plugins. Use exclamation mark for nodes, at sign for nodes in graphs, or number sign for graphs." /><kbd>⌘ K</kbd><button type="button" onClick={onClose} aria-label="Close search"><X size={15} /></button></div>
      <div className="command-palette-results" role="listbox">
        {groups.map((group) => <div className="command-palette-group" key={group.label}>
          <div className="command-palette-heading">{group.label}</div>
          {group.items.map((item) => {
            index += 1;
            const itemIndex = index;
            return <button key={item.id} type="button" role="option" aria-selected={activeIndex === itemIndex} className={`command-palette-result ${activeIndex === itemIndex ? 'is-active' : ''} ${item.disabled ? 'is-node-load-failed' : ''}`} disabled={Boolean(item.disabled)} title={item.disabled ? 'Failed to load this node' : undefined} onMouseEnter={() => setActiveIndex(itemIndex)} onClick={() => { item.onSelect?.(); onClose?.(); }}>
              <span className={`command-palette-item-icon ${item.kind === 'add' ? 'is-node' : ''}`}>
                {item.icon ? <NodeTypeIcon type={item.icon.type} color={item.icon.color} size={15} /> : item.kind === 'plugin' ? <Puzzle size={15} /> : <Workflow size={15} />}
              </span>
              <span className="command-palette-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className="command-palette-action" title={item.kind === 'add' ? 'Add node' : item.kind === 'instance' ? 'Go to node' : item.kind === 'graph' ? 'Open graph' : 'Open plugin store'} aria-label={item.kind === 'add' ? 'Add node' : 'Go to'}>
                {item.kind === 'add' ? <Plus size={15} /> : <ArrowRight size={15} />}
              </span>
            </button>;
          })}
        </div>)}
        {!items.length && <div className="command-palette-empty">No matching graphs, nodes, or plugins.</div>}
      </div>
      <footer className="command-palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open or add</span><span><kbd>esc</kbd> Close</span></footer>
    </section>
  </div>;
}
