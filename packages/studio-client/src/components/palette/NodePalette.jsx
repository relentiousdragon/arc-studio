import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Puzzle, Search, X } from 'lucide-react';
import { BuiltInNodeDefinitions, NodeCategories, getVisibleNewNodeDefinitions, isNodeDefinitionNew, markNewNodeDefinitionsSeen } from '../nodes/nodeDefinitions.js';
import { NodeTypeIcon } from '../nodes/NodeTypeIcon.jsx';
import { createSearchIndex } from './nodeSearch.js';
//
export function NodePalette({ isOpen, onClose, onSelectNode, pluginDefinitionsRevision = 0, definitions = BuiltInNodeDefinitions, newNodesUserKey = 'anonymous' }) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeIndex, setActiveIndex] = useState(0);
  const [newNodesRevision, setNewNodesRevision] = useState(0);
  const inputRef = useRef(null);
  const categories = ['All', ...new Set([...Object.values(NodeCategories), ...definitions.map((node) => node.category).filter(Boolean)])];
  const newNodes = useMemo(() => getVisibleNewNodeDefinitions(definitions.filter((node) => !node.hidden), newNodesUserKey), [definitions, newNodesUserKey, newNodesRevision, pluginDefinitionsRevision]);
  const showNewSection = !query.trim() && selectedCategory === 'All' && newNodes.length > 0;
  const newNodeTypes = useMemo(() => new Set(showNewSection ? newNodes.map((node) => node.type) : []), [showNewSection, newNodes]);
  const searchIndex = useMemo(() => createSearchIndex(definitions.filter((node) => !node.hidden), (node) => [
    node.label, node.description, node.category, node.type.replaceAll('_', ' '), node.pluginName, node.pluginId,
    ...(node.inputs || []).map((pin) => pin.label), ...(node.outputs || []).map((pin) => pin.label)
  ]), [definitions, pluginDefinitionsRevision]);
  const filteredNodes = useMemo(() => searchIndex.search(query, 80, (node) =>
    (selectedCategory === 'All' || node.category === selectedCategory) && !newNodeTypes.has(node.type)
  ).map(({ item }) => item), [query, selectedCategory, searchIndex, newNodeTypes]);
  const navigableNodes = showNewSection ? [...newNodes, ...filteredNodes] : filteredNodes;

  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    setSelectedCategory('All');
    setActiveIndex(0);
    markNewNodeDefinitionsSeen(getVisibleNewNodeDefinitions(definitions.filter((node) => !node.hidden), newNodesUserKey), newNodesUserKey);
    setNewNodesRevision((revision) => revision + 1);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const expiryTimer = window.setInterval(() => {
      markNewNodeDefinitionsSeen(getVisibleNewNodeDefinitions(definitions.filter((node) => !node.hidden), newNodesUserKey), newNodesUserKey);
      setNewNodesRevision((revision) => revision + 1);
    }, 15000);
    return () => { window.clearTimeout(focusTimer); window.clearInterval(expiryTimer); };
  }, [isOpen, newNodesUserKey, definitions]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, navigableNodes.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && navigableNodes[activeIndex] && !navigableNodes[activeIndex].loadFailed) {
        event.preventDefault();
        onSelectNode?.(navigableNodes[activeIndex].type);
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, navigableNodes, activeIndex, onClose, onSelectNode]);

  if (!isOpen) return null;

  return (
    <div className="dialog-scrim palette-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className="node-palette" role="dialog" aria-modal="true" aria-label="Add node">
        <div className="palette-search-row">
          <Search size={18} />
          <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Find a node…" aria-label="Search nodes" />
          <button className="icon-button compact" onClick={onClose} aria-label="Close node palette"><X size={16} /></button>
        </div>
        <div className="palette-category-row" role="tablist" aria-label="Node categories" onWheel={(event) => {
          if (!event.deltaY || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
          event.preventDefault();
          event.currentTarget.scrollLeft += event.deltaY;
        }}>
          {categories.map((category) => <button key={category} role="tab" aria-selected={selectedCategory === category} className={selectedCategory === category ? 'is-active' : ''} onClick={() => { setSelectedCategory(category); setActiveIndex(0); }}>{category}</button>)}
        </div>
      <div className="palette-results" role="listbox">
          {showNewSection && <section className="palette-new-section" aria-label="New nodes">
            <h3>New nodes <span>{newNodes.length}</span></h3>
            {newNodes.map((node, index) => <button key={`new-${node.type}`} type="button" role="option" aria-selected={activeIndex === index} className={`palette-result palette-new-result ${activeIndex === index ? 'is-active' : ''} ${node.loadFailed ? 'is-node-load-failed' : ''}`} disabled={Boolean(node.loadFailed)} title={node.loadFailed ? 'Failed to load this node' : undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => { onSelectNode?.(node.type); onClose?.(); }}>
              <span className="palette-node-icon" style={{ '--node-accent': node.color }}><NodeTypeIcon type={node.type} color={node.color} size={15} /></span>
              <span className="palette-node-copy"><strong>{node.label}<i className="node-new-badge">NEW</i></strong><small>{node.description}</small></span>
              <span className="palette-node-category">{node.category}</span>
            </button>)}
          </section>}
          {filteredNodes.length ? filteredNodes.map((node, index) => (
            <button key={node.type} type="button" role="option" aria-selected={activeIndex === index + (showNewSection ? newNodes.length : 0)} aria-label={node.pluginAdapter ? `${node.label}. Plugin node from ${node.pluginName || node.pluginId || 'an installed plugin'}` : undefined} className={`palette-result ${activeIndex === index + (showNewSection ? newNodes.length : 0) ? 'is-active' : ''} ${node.loadFailed ? 'is-node-load-failed' : ''}`} disabled={Boolean(node.loadFailed)} title={node.loadFailed ? 'Failed to load this node' : undefined} onMouseEnter={() => setActiveIndex(index + (showNewSection ? newNodes.length : 0))} onClick={() => { onSelectNode?.(node.type); onClose?.(); }}>
              <span className="palette-node-icon" style={{ '--node-accent': node.color }}><NodeTypeIcon type={node.type} color={node.color} size={15} /></span>
              <span className="palette-node-copy"><strong>{node.label}{isNodeDefinitionNew(node, Date.now(), newNodesUserKey) && <i className="node-new-badge">NEW</i>}</strong><small>{node.description}</small></span>
              {node.pluginAdapter && <span className="node-plugin-origin palette-plugin-origin" title={`Plugin node from ${node.pluginName || node.pluginId || 'an installed plugin'}`} aria-label={`Plugin node from ${node.pluginName || node.pluginId || 'an installed plugin'}`}><Puzzle size={13} /></span>}
              <span className="palette-node-category">{node.category}</span>
            </button>
          )) : <div className="palette-empty">No nodes found</div>}
        </div>
        <footer className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Insert</span><span><kbd>esc</kbd> Close</span></footer>
      </section>
    </div>
  );
}
