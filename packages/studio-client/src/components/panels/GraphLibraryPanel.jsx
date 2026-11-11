import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getArcUiScale } from '../../core/uiScale.js';
import { arcEvents } from '../../core/ArcEvents.js';
import { readAppStorage, writeAppStorage } from '../../core/storage.js';
import { onPageBlur } from '../../core/pageFocus.js';
import { AlertCircle, AlertTriangle, AudioLines, BookmarkPlus, Braces, Calculator, ChevronDown, ChevronRight, Clock3, Copy, Database, Download, File, FileCode2, FileImage, FileUp, FileVideo, FolderTree, GitCompare, GripVertical, Layers, MoreHorizontal, PackageOpen, Pencil, Play, Plus, Puzzle, RotateCcw, Save, Search, Sparkles, Star, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import { BuiltInNodeDefinitions, createDefaultNodeData, getVisibleNewNodeDefinitions, isNodeDefinitionHidden, isNodeDefinitionNew, markNewNodeDefinitionsSeen } from '../nodes/nodeDefinitions.js';
import { NodeTypeIcon } from '../nodes/NodeTypeIcon.jsx';
import { CharacterLimit, TextInput } from '../ui/Inputs.jsx';
import { SidebarResizeHandle } from '../ui/SidebarResizeHandle.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { createSearchIndex } from '../palette/nodeSearch.js';
import { readLibraryUsage, recordLibraryItemUsage } from '../../core/libraryUsage.js';
import { mediaKind } from '../ui/mediaTypes.js';

export { recordLibraryItemUsage };

const EXPANSION_STORAGE_KEY = 'arc_library_expansion_by_project';
const DEFAULT_EXPANDED_GRAPH_GROUPS = { 'Slash Commands': true, 'Context Commands': true, Messages: true, Components: true, 'Member Events': true, Functions: true, Other: true };
const BUILT_IN_GRAPH_CATEGORIES = ['Slash Commands', 'Context Commands', 'Messages', 'Message Events', 'Components', 'Member Events', 'Voice & Presence', 'Bot Events', 'Channel Events', 'Roles', 'Moderation Events', 'Invites', 'Cron Jobs', 'Scheduled Events', 'Functions', 'Other'];
const readGraphCategories = (key) => { try { const value = JSON.parse(readAppStorage(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } };
//
function readLibraryExpansion() {
  try {
    const stored = readAppStorage(EXPANSION_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function GraphLibraryPanel({
  graphs = [], graphValidationReports = new Map(), templates = [], snapshots = [], nodePrefabs = [], embedAssets = [], mediaAssets = [], graphVariables = [], graphActivity = [], definitions = BuiltInNodeDefinitions, newNodesUserKey = 'anonymous', defaultGraphId, activeGraph, openGraphIds = [], activeTabId, usageScope = 'default', desktopMode = false, canImportGraph = true, canEditGraphs = true, sidebarWidth = 320, activeSection: activeSectionProp, onActiveSectionChange, onSidebarResize, onClose, onOpenGraph, onOpenGraphReview, onImportGraph, onUseTemplate, onCreateGraph, onCreateFunction, onDeleteGraph, onDeleteGraphs, onDuplicateGraph, onRenameGraph, onSaveTemplate, onDeleteTemplate, onSetDefault, onExportGraph, onExportBot, onSetGraphEnabled, exportInProgress = false, onAddNode, onAddPrefab, onDeletePrefab, onCreateEmbed, onCreateComponentsV2, onOpenEmbed, onDeleteEmbed, onManageVariables, onManageMedia, onCreateSnapshot, onDeleteSnapshot, onRestoreSnapshot
}) {
  const uiScale = getArcUiScale();
  const [query, setQuery] = useState('');
  const [localActiveSection, setLocalActiveSection] = useState('graphs');
  const activeSection = activeSectionProp || localActiveSection;
  const setActiveSection = (section) => { setLocalActiveSection(section); onActiveSectionChange?.(section); };
  const [expandedByProject, setExpandedByProject] = useState(readLibraryExpansion);
  const [contextMenu, setContextMenu] = useState(null);
  const categoryStorageKey = `arc_library_graph_categories:${usageScope || 'default'}`;
  const [graphCategories, setGraphCategories] = useState(() => readGraphCategories(categoryStorageKey));
  const [categoryDrag, setCategoryDrag] = useState(null);
  const [categoryDropTarget, setCategoryDropTarget] = useState(null);
  const [graphMoveDropTarget, setGraphMoveDropTarget] = useState(null);
  const [libraryDragEdge, setLibraryDragEdge] = useState(null);
  const [libraryDragGhost, setLibraryDragGhost] = useState(null);
  const [selectedLibraryNodeTypes, setSelectedLibraryNodeTypes] = useState([]);
  const [selectedGraphKeys, setSelectedGraphKeys] = useState([]);
  const [selectedVariableIds, setSelectedVariableIds] = useState([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [showSnapshotName, setShowSnapshotName] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotError, setSnapshotError] = useState('');
  const [, setNewNodeRevision] = useState(0);
  const [compareSnapshot, setCompareSnapshot] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState('create');
  const [categoryModalName, setCategoryModalName] = useState('');
  const [categoryModalTarget, setCategoryModalTarget] = useState(null);
  const libraryTreeRef = useRef(null);
  const categoryNameRef = useRef(null);

  const handleCategoryModalConfirm = () => {
    const name = categoryModalName.trim();
    if (!name) return;
    if (categoryModalMode === 'create') {
      const taken = Object.entries(graphCategories).some(([id, category]) => id !== '__order' && category?.name?.toLowerCase() === name.toLowerCase());
      if (taken) return;
      setGraphCategories((current) => ({ ...current, [`category:${Date.now()}`]: { name, graphIds: [] } }));
    } else {
      const target = categoryModalTarget;
      if (!target) return;
      setGraphCategories((current) => {
        const existingCategoryId = target.categoryId && current[target.categoryId]
          ? target.categoryId
          : Object.entries(current).find(([id, category]) => id !== '__order' && category?.name === target.groupName)?.[0];
        if (!existingCategoryId) return current;
        const nameTaken = Object.entries(current).some(([id, category]) => id !== '__order' && id !== existingCategoryId && category?.name?.toLowerCase() === name.toLowerCase());
        if (nameTaken) return current;
        const next = { ...current };
        const category = { ...next[existingCategoryId] };
        delete category.source;
        next[existingCategoryId] = { ...category, name };
        if (Array.isArray(next.__order)) next.__order = next.__order.map((item) => item === target.groupName ? name : item);
        return next;
      });
    }
    setShowCategoryModal(false);
    setCategoryModalName('');
    setCategoryModalTarget(null);
  };
  const uniqueSelectedGraphKeys = [...new Set(selectedGraphKeys)];
  const isSearching = Boolean(query.trim());
  useEffect(() => {
    if (activeSection !== 'nodes') return undefined;
    markNewNodeDefinitionsSeen(getVisibleNewNodeDefinitions(definitions, newNodesUserKey), newNodesUserKey);
    const timer = window.setInterval(() => {
      markNewNodeDefinitionsSeen(getVisibleNewNodeDefinitions(definitions, newNodesUserKey), newNodesUserKey);
      setNewNodeRevision((revision) => revision + 1);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeSection, definitions, newNodesUserKey]);
  const projectExpansion = expandedByProject[usageScope || 'default'] || {};
  const expandedGroups = projectExpansion.graphs || DEFAULT_EXPANDED_GRAPH_GROUPS;
  const expandedNodeGroups = projectExpansion.nodes || {};
  const updateExpandedGroups = (kind, update) => setExpandedByProject((current) => {
    const projectId = usageScope || 'default';
    const currentProject = current[projectId] || {};
    const previous = kind === 'graphs' ? currentProject.graphs || DEFAULT_EXPANDED_GRAPH_GROUPS : currentProject.nodes || {};
    return { ...current, [projectId]: { ...currentProject, [kind]: typeof update === 'function' ? update(previous) : update } };
  });
  useEffect(() => {
    const pluginCategories = [...new Set(definitions.filter((node) => node.pluginAdapter && !isNodeDefinitionHidden(node)).map((node) => node.category).filter(Boolean))];
    if (!pluginCategories.length) return;
    updateExpandedGroups('nodes', (current) => {
      const additions = Object.fromEntries(pluginCategories.filter((category) => current[category] === undefined).map((category) => [category, true]));
      return Object.keys(additions).length ? { ...current, ...additions } : current;
    });
  }, [definitions, usageScope]);
  const usageStorageKey = `arc_library_usage:${usageScope || 'default'}`;
  const usageRef = useRef(readLibraryUsage(usageStorageKey));
  const [usage, setUsage] = useState(usageRef.current);
  const contextMenuRef = useRef(null);
  const importGraphInputRef = useRef(null);
  const pointerDragRef = useRef(null);
  const graphSelectionAnchorRef = useRef(null);
  const graphSearchIndex = useMemo(() => createSearchIndex(graphs, (graph) => [graph.name, graph.graphType, graph.id]), [graphs]);
  const templateSearchIndex = useMemo(() => createSearchIndex(templates, (graph) => [graph.name, graph.graphType, graph.id]), [templates]);
  const nodeSearchIndex = useMemo(() => createSearchIndex(definitions.filter((node) => !isNodeDefinitionHidden(node)), (node) => [
    node.label, node.description, node.category, node.type.replaceAll('_', ' '), node.pluginName, node.pluginId,
    ...(node.inputs || []).map((pin) => pin.label), ...(node.outputs || []).map((pin) => pin.label)
  ]), [definitions]);
  const prefabSearchIndex = useMemo(() => createSearchIndex(nodePrefabs, (prefab) => [prefab.name, prefab.node?.label, prefab.node?.type?.replaceAll('_', ' ')]), [nodePrefabs]);
  const embedSearchIndex = useMemo(() => createSearchIndex(embedAssets, (asset) => [asset.name, asset.description]), [embedAssets]);
  const variableSearchIndex = useMemo(() => createSearchIndex(graphVariables, (variable) => [variable.name, variable.type]), [graphVariables]);
  const mediaSearchIndex = useMemo(() => createSearchIndex(mediaAssets, (asset) => [asset.filename, asset.contentType]), [mediaAssets]);
  const search = (index, source) => query.trim() ? index.search(query, Number.MAX_SAFE_INTEGER).map(({ item }) => item) : source;
  const filteredGraphs = search(graphSearchIndex, graphs);
  const filteredTemplates = search(templateSearchIndex, templates);
  const graphGroups = groupGraphs(filteredGraphs, graphCategories);
  const graphCategoryById = useMemo(() => {
    const categories = new Map();
    for (const [name, items] of groupGraphs(graphs, graphCategories)) {
      for (const graph of items) categories.set(String(graph.id), name);
    }
    return categories;
  }, [graphs, graphCategories]);
  const isGraphMoveDisabled = (graphIds, groupName) => {
    const ids = [...new Set((graphIds || []).map(String))];
    return ids.length > 0 && ids.every((id) => graphCategoryById.get(id) === groupName);
  };
  const getDraggedGraphIds = (event) => {
    if (window.__arcGraphMovePayload?.graphIds?.length) return window.__arcGraphMovePayload.graphIds;
    try { return JSON.parse(event.dataTransfer?.getData('application/x-arc-graph-move') || 'null')?.graphIds || []; } catch { return []; }
  };
  const handleCreateGraphInCategory = (groupName) => {
    const graph = onCreateGraph?.();
    if (!graph?.id) return;
    const categoryId = Object.entries(graphCategories).find(([id, category]) => id !== '__order' && category?.name === groupName)?.[0];
    if (categoryId) setGraphCategories((current) => ({ ...current, [categoryId]: { ...current[categoryId], graphIds: [...new Set([...(current[categoryId]?.graphIds || []), graph.id])] } }));
    setContextMenu(null);
  };
  const deleteCategory = async (categoryId) => {
    const category = graphCategories[categoryId];
    if (!category) return;
    setContextMenu(null);
    const categoryGraphIds = [...new Set(category.graphIds || [])];
    const categoryGraphs = graphs.filter((graph) => categoryGraphIds.includes(graph.id));
    if (!categoryGraphs.length) {
      setGraphCategories((current) => {
        const next = { ...current };
        delete next[categoryId];
        next.__order = (next.__order || []).filter((name) => name !== category.name);
        return next;
      });
    } else {
      const deleted = await onDeleteGraphs?.(categoryGraphs);
      if (!deleted) return;
      setGraphCategories((current) => {
        const next = { ...current };
        delete next[categoryId];
        next.__order = (next.__order || []).filter((name) => name !== category.name);
        return next;
      });
    }
  };

  const finishCategoryReorder = (event, targetName, targetElement) => {
    if (!categoryDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = targetElement?.getBoundingClientRect();
    const position = bounds && event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before';
    const names = graphGroups.map(([name]) => name).filter((name) => name !== categoryDrag);
    const targetIndex = names.indexOf(targetName);
    if (targetIndex < 0) return;
    names.splice(targetIndex + (position === 'after' ? 1 : 0), 0, categoryDrag);
    setGraphCategories((current) => ({ ...current, __order: names }));
    setCategoryDrag(null);
    setCategoryDropTarget(null);
  };
  const moveGraphsToCategory = (graphIds, groupName) => {
    const ids = [...new Set((graphIds || []).map(String))];
    if (!ids.length || isGraphMoveDisabled(ids, groupName)) return;
    const categoryId = Object.entries(graphCategories).find(([id, category]) => id !== '__order' && category?.name === groupName)?.[0];
    const targetCategoryId = categoryId || (BUILT_IN_GRAPH_CATEGORIES.includes(groupName) ? `system:${groupName}` : null);
    setGraphCategories((current) => {
      const next = Object.fromEntries(Object.entries(current).map(([id, category]) => [id, id === '__order' ? category : {
        ...category,
        graphIds: (category.graphIds || []).filter((graphId) => !ids.includes(String(graphId)))
      }]));
      if (targetCategoryId) {
        const currentTarget = next[targetCategoryId] || { name: groupName, graphIds: [], ...(BUILT_IN_GRAPH_CATEGORIES.includes(groupName) ? { source: 'system' } : {}) };
        next[targetCategoryId] = { ...currentTarget, graphIds: [...new Set([...(currentTarget.graphIds || []), ...ids])] };
      }
      for (const [id, category] of Object.entries(next)) {
        if (id !== '__order' && category?.source === 'system' && !category.graphIds?.length) delete next[id];
      }
      return next;
    });
    setGraphMoveDropTarget(null);
  };
  const graphLastSeen = new Map(graphActivity.map((entry) => [entry.graphId, entry]));
  const searchNodes = search(nodeSearchIndex, definitions.filter((node) => !isNodeDefinitionHidden(node)));
  const nodeGroups = groupNodes(searchNodes);
  const compatiblePrefabs = nodePrefabs;
  const filteredPrefabs = search(prefabSearchIndex, compatiblePrefabs);
  const searchedAssets = search(embedSearchIndex, embedAssets);
  const filteredEmbeds = searchedAssets.filter((asset) => asset.kind !== 'components-v2');
  const filteredComponentsV2 = searchedAssets.filter((asset) => asset.kind === 'components-v2');
  const filteredVariables = search(variableSearchIndex, graphVariables);
  const activeSnapshots = snapshots.filter((snapshot) => snapshot.graphId === activeGraph?.id);
  const frequentNodes = rankByUsage(searchNodes, usage.nodes, (node) => node.type, 5);
  const frequentGraphs = graphs.length >= 10 ? rankByUsage(filteredGraphs, usage.graphs, (graph) => graph.id, 3) : [];
  const frequentEmbeds = filteredEmbeds.length >= 10 ? rankByUsage(filteredEmbeds, usage.embeds, (asset) => asset.id, 3) : [];
  const allGraphGroupNames = groupGraphs(graphs, graphCategories).map(([name]) => name);
  const allNodeGroupNames = groupNodes(definitions.filter((node) => !isNodeDefinitionHidden(node))).map(([name]) => name);
  const activeGroupKind = activeSection === 'graphs' ? 'graphs' : activeSection === 'nodes' ? 'nodes' : null;
  const activeGroupNames = activeGroupKind === 'graphs' ? allGraphGroupNames : activeGroupKind === 'nodes' ? allNodeGroupNames : [];
  const activeExpandedGroups = activeGroupKind === 'graphs' ? expandedGroups : expandedNodeGroups;
  const allGroupsExpanded = activeGroupNames.length > 0 && activeGroupNames.every((name) => Boolean(activeExpandedGroups[name]));
  const toggleAllGroups = () => {
    if (!activeGroupKind) return;
    const expand = !allGroupsExpanded;
    updateExpandedGroups(activeGroupKind, (current) => ({ ...current, ...Object.fromEntries(activeGroupNames.map((name) => [name, expand])) }));
  };

  useEffect(() => { writeAppStorage(EXPANSION_STORAGE_KEY, JSON.stringify(expandedByProject)); }, [expandedByProject]);
  useEffect(() => { setGraphCategories(readGraphCategories(categoryStorageKey)); }, [categoryStorageKey]);
  useEffect(() => { writeAppStorage(categoryStorageKey, JSON.stringify(graphCategories)); }, [categoryStorageKey, graphCategories]);
  useEffect(() => {
    const existing = new Set(graphVariables.map((variable) => variable.id));
    setSelectedVariableIds((current) => {
      const next = current.filter((id) => existing.has(id));
      return next.length === current.length ? current : next;
    });
  }, [graphVariables]);
  useEffect(() => {
    const existing = new Set(graphs.map(graphSelectionKey));
    setSelectedGraphKeys((current) => {
      const next = [...new Set(current.filter((key) => existing.has(key)))];
      if (graphSelectionAnchorRef.current && !existing.has(graphSelectionAnchorRef.current)) graphSelectionAnchorRef.current = null;
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [graphs]);

  useEffect(() => {
    const nextUsage = readLibraryUsage(usageStorageKey);
    usageRef.current = nextUsage;
    setUsage(nextUsage);
    return arcEvents.on('library:usage-updated', ({ usageScope: scope, usage: next }) => {
      if ((scope || 'default') === (usageScope || 'default')) {
        usageRef.current = next;
        setUsage(next);
      }
    });
  }, [usageStorageKey, usageScope]);

  const recordUsage = (kind, id) => {
    if (!id || !['nodes', 'graphs', 'embeds'].includes(kind)) return;
    const previous = usageRef.current;
    const next = { nodes: { ...previous.nodes }, graphs: { ...previous.graphs }, embeds: { ...previous.embeds } };
    const current = next[kind][id] || { count: 0, usedAt: 0 };
    next[kind][id] = { count: current.count + 1, usedAt: Date.now() };
    const entries = Object.entries(next[kind]).sort((a, b) => b[1].usedAt - a[1].usedAt).slice(0, 300);
    next[kind] = Object.fromEntries(entries);
    usageRef.current = next;
    setUsage(next);
    writeAppStorage(usageStorageKey, JSON.stringify(next));
  };
  const recordUsageRef = useRef(recordUsage);
  recordUsageRef.current = recordUsage;

  const saveSnapshot = async (event) => {
    event.preventDefault();
    if (!activeGraph || snapshotBusy) return;
    setSnapshotBusy(true);
    setSnapshotError('');
    try {
      await onCreateSnapshot?.(activeGraph, snapshotName);
      setSnapshotName('');
      setShowSnapshotName(false);
    } catch (error) {
      setSnapshotError(error.message);
    } finally { setSnapshotBusy(false); }
  };

  const startNodeDrag = (event, payload) => {
    hideNativeDragImage(event);
    const dragPayload = payload.nodeType ? { ...payload, previewNode: { type: payload.nodeType, data: payload.data || createDefaultNodeData(payload.nodeType) } } : payload;
    window.__arcNodeDragPayload = dragPayload;
    setLibraryTransferData(event, 'application/x-arc-node', dragPayload);
    const type = dragPayload.previewNode?.type || dragPayload.prefabNode?.type || dragPayload.nodeType;
    const definition = definitions.find((node) => node.type === type);
    const prefab = dragPayload.type === 'prefab' ? nodePrefabs.find((item) => item.id === dragPayload.prefabId) : null;
    startLibraryGhost(event, {
      type,
      label: prefab?.name || definition?.label || dragPayload.prefabNode?.label || 'Node',
      color: definition?.color || '#778196',
      pluginAdapter: Boolean(definition?.pluginAdapter)
    });
  };

  const nodeDragPayload = (node) => ({ type: 'builtin', nodeType: node.type, ...(selectedLibraryNodeTypes.includes(node.type) && selectedLibraryNodeTypes.length > 1 ? { type: 'multi-node', nodeTypes: selectedLibraryNodeTypes } : {}) });
  const variableDragPayload = (variable) => {
    const selected = selectedVariableIds.includes(variable.id) && selectedVariableIds.length > 1
      ? graphVariables.filter((item) => selectedVariableIds.includes(item.id)) : [variable];
    return { type: 'variable-get', nodeType: 'variable_get', data: { variableId: variable.id, scope: variable.scope || 'graph' }, variables: selected.map((item) => ({ variableId: item.id, scope: item.scope || 'graph' })) };
  };

  const startLibraryGhost = (event, { type, label, color, pluginAdapter }) => {
    setLibraryDragGhost({
      clientX: event.clientX,
      clientY: event.clientY,
      type,
      label: label || 'Node',
      color: color || '#778196',
      pluginAdapter: Boolean(pluginAdapter),
      hidden: false
    });
  };

  const finishNodeDrag = () => { window.__arcNodeDragPayload = null; clearLibraryDragPayload(); setLibraryDragGhost(null); };

  const ignoreLibraryDrop = (event) => {
    const types = event.dataTransfer.types;
    const hasPayload = window.__arcNodeDragPayload || window.__arcGraphDragPayload || window.__arcEmbedDragPayload || window.__arcComponentsV2DragPayload
      || types.includes('application/x-arc-node') || types.includes('application/x-arc-graph-call') || types.includes('application/x-arc-embed-asset') || types.includes('application/x-arc-components-v2-asset')
      || readLibraryTransferText(event.dataTransfer).startsWith('arc-studio:');
    if (!hasPayload) return;
    event.preventDefault();
    event.stopPropagation();
    setLibraryDragGhost(null);
    window.__arcNodeDragPayload = null;
    window.__arcGraphDragPayload = null;
    window.__arcEmbedDragPayload = null;
    window.__arcComponentsV2DragPayload = null;
    clearLibraryDragPayload();
  };

  const startEmbedDrag = (event, asset) => {
    hideNativeDragImage(event);
    const payload = { type: 'embed-asset', id: asset.id, name: asset.name || 'Untitled embed', blocks: asset.blocks || [], components: asset.components || [] };
    window.__arcEmbedDragPayload = payload;
    setLibraryTransferData(event, 'application/x-arc-embed-asset', payload);
    startLibraryGhost(event, { type: 'build_embed', label: asset.name || 'Untitled embed', color: '#8b5cf6' });
  };

  const startComponentsV2Drag = (event, asset) => {
    hideNativeDragImage(event);
    const payload = { type: 'components-v2-asset', id: asset.id, name: asset.name || 'Untitled Components V2', componentsV2Layout: asset.componentsV2Layout || [], attachments: asset.attachments || [] };
    window.__arcComponentsV2DragPayload = payload;
    const transferPayload = { ...payload, attachments: [] };
    setLibraryTransferData(event, 'application/x-arc-components-v2-asset', transferPayload);
    startLibraryGhost(event, { type: 'build_components', label: asset.name || 'Untitled Components V2', color: '#06b6d4' });
  };

  const finishEmbedDrag = () => { window.__arcEmbedDragPayload = null; window.__arcComponentsV2DragPayload = null; clearLibraryDragPayload(); setLibraryDragGhost(null); };

  const startGraphDrag = (event, graph) => {
    hideNativeDragImage(event);
    setLibraryDragEdge(null);
    const payload = { type: 'graph-call', graphId: graph.id };
    const graphIds = uniqueSelectedGraphKeys.includes(graphSelectionKey(graph))
      ? uniqueSelectedGraphKeys.map((key) => graphs.find((item) => graphSelectionKey(item) === key)?.id).filter(Boolean)
      : [graph.id];
    window.__arcGraphMovePayload = { graphIds };
    try { event.dataTransfer.setData('application/x-arc-graph-move', JSON.stringify({ graphIds })); } catch {}
    window.__arcGraphDragPayload = payload;
    setLibraryTransferData(event, 'application/x-arc-graph-call', payload);
    try { event.dataTransfer.effectAllowed = 'copyMove'; } catch {}
    startLibraryGhost(event, { type: 'function_call', label: graph.name || 'Untitled graph', color: '#7a889b' });
  };

  const finishGraphDrag = () => { window.__arcGraphDragPayload = null; window.__arcGraphMovePayload = null; clearLibraryDragPayload(); setLibraryDragGhost(null); setGraphMoveDropTarget(null); setLibraryDragEdge(null); };

  const beginPointerDrag = (event, payload) => {
    if (!desktopMode || event.button !== 0) return;
    const dragPayload = payload.nodeType ? { ...payload, previewNode: { type: payload.nodeType, data: payload.data || createDefaultNodeData(payload.nodeType) } } : payload;
    pointerDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, payload: dragPayload, active: false };
  };

  const suppressClickAfterDrag = (event) => {
    if (!window.__arcLibraryPointerDragMoved) return;
    event.preventDefault();
    event.stopPropagation();
    window.__arcLibraryPointerDragMoved = false;
  };

  useEffect(() => {
    if (!libraryDragGhost) return undefined;
    const onWindowDragOver = (event) => {
      if (event.clientX === 0 && event.clientY === 0) return;
      const isOverCanvas = Boolean(event.target?.closest?.('.node-canvas, .canvas-container'));
      setLibraryDragGhost((current) => current ? {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
        hidden: isOverCanvas
      } : null);
    };
    const onWindowDragEnd = () => {
      setLibraryDragGhost(null);
    };
    window.addEventListener('dragover', onWindowDragOver, { passive: true });
    window.addEventListener('dragend', onWindowDragEnd);
    window.addEventListener('drop', onWindowDragEnd);
    return () => {
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('dragend', onWindowDragEnd);
      window.removeEventListener('drop', onWindowDragEnd);
    };
  }, [Boolean(libraryDragGhost)]);

  useEffect(() => {
    if (!desktopMode) return undefined;
    const clearPointerDrag = () => {
      pointerDragRef.current = null;
      window.__arcLibraryPointerDragActive = false;
      window.__arcLibraryPointerDrag = null;
    };
    const onMove = (event) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      drag.active = true;
      event.preventDefault();
      window.__arcLibraryPointerDragActive = true;
      const detail = { payload: drag.payload, clientX: event.clientX, clientY: event.clientY };
      window.__arcLibraryPointerDrag = detail;
      window.dispatchEvent(new CustomEvent('arc-library-pointermove', { detail }));
    };
    const onUp = (event) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.active) {
        event.preventDefault();
        window.__arcLibraryPointerDragMoved = true;
        window.dispatchEvent(new CustomEvent('arc-library-pointerdrop', { detail: { payload: drag.payload, clientX: event.clientX, clientY: event.clientY } }));
        window.setTimeout(() => { window.__arcLibraryPointerDragMoved = false; }, 0);
      }
      clearPointerDrag();
    };
    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', clearPointerDrag, true);
    return () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', clearPointerDrag, true);
      clearPointerDrag();
    };
  }, [desktopMode]);

  useEffect(() => {
    if (!desktopMode) return undefined;
    const onPointerMove = (event) => {
      const payload = event.detail?.payload;
      if (payload?.type !== 'graph-call') return;
      const tree = libraryTreeRef.current;
      const bounds = tree?.getBoundingClientRect();
      let edge = null;
      if (bounds && event.detail.clientY >= bounds.top && event.detail.clientY <= bounds.bottom) {
        const edgeSize = Math.min(72, bounds.height * 0.16);
        if (event.detail.clientY < bounds.top + edgeSize) {
          const strength = Math.min(1, Math.max(0, (bounds.top + edgeSize - event.detail.clientY) / edgeSize));
          if (strength > 0) edge = { direction: -1, strength: Math.round(strength * 20) / 20 };
        } else if (event.detail.clientY > bounds.bottom - edgeSize) {
          const strength = Math.min(1, Math.max(0, (event.detail.clientY - (bounds.bottom - edgeSize)) / edgeSize));
          if (strength > 0) edge = { direction: 1, strength: Math.round(strength * 20) / 20 };
        }
      }
      setLibraryDragEdge((current) => current?.direction === edge?.direction && current?.strength === edge?.strength ? current : edge);
      const target = document.elementFromPoint(event.detail.clientX, event.detail.clientY)?.closest?.('[data-graph-category]');
      setGraphMoveDropTarget(target ? {
        name: target.dataset.graphCategory,
        disabled: isGraphMoveDisabled(payload.graphIds || [payload.graphId], target.dataset.graphCategory)
      } : null);
    };
    const onPointerDrop = (event) => {
      const payload = event.detail?.payload;
      if (payload?.type !== 'graph-call') return;
      const target = document.elementFromPoint(event.detail.clientX, event.detail.clientY)?.closest?.('[data-graph-category]');
      if (target) moveGraphsToCategory(payload.graphIds || [payload.graphId], target.dataset.graphCategory);
      setLibraryDragEdge(null);
      setGraphMoveDropTarget(null);
    };
    window.addEventListener('arc-library-pointermove', onPointerMove);
    window.addEventListener('arc-library-pointerdrop', onPointerDrop);
    return () => {
      window.removeEventListener('arc-library-pointermove', onPointerMove);
      window.removeEventListener('arc-library-pointerdrop', onPointerDrop);
    };
  }, [desktopMode, graphCategories, graphCategoryById]);

  useEffect(() => {
    if (!libraryDragEdge) return undefined;
    const tree = libraryTreeRef.current;
    if (!tree) return undefined;
    let frame = 0;
    let previousTime = 0;
    const scroll = (time) => {
      if (previousTime) {
        const elapsed = Math.min(40, time - previousTime);
        const speed = 240 * libraryDragEdge.strength ** 1.6;
        tree.scrollTop += libraryDragEdge.direction * speed * elapsed / 1000;
        const atTop = tree.scrollTop <= 0 && libraryDragEdge.direction < 0;
        const atBottom = tree.scrollTop + tree.clientHeight >= tree.scrollHeight - 1 && libraryDragEdge.direction > 0;
        if (atTop || atBottom) {
          setLibraryDragEdge(null);
          return;
        }
      }
      previousTime = time;
      frame = window.requestAnimationFrame(scroll);
    };
    frame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frame);
  }, [libraryDragEdge]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = (event) => {
      if (event.target instanceof Node && contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    const onKeyDown = () => setContextMenu(null);
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKeyDown);
    const removePageBlurListener = onPageBlur(() => setContextMenu(null));
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKeyDown);
      removePageBlurListener();
    };
  }, [contextMenu, uiScale]);

  useEffect(() => { setCompareSnapshot(null); }, [activeGraph?.id]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const bounds = contextMenuRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - bounds.width - 8));
    const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - bounds.height - 8));
    if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu((current) => current ? { ...current, x, y } : current);
  }, [contextMenu, uiScale]);

  const openContextMenu = (event, graph) => {
    event.preventDefault();
    const graphKey = graphSelectionKey(graph);
    const graphKeys = uniqueSelectedGraphKeys.includes(graphKey) ? uniqueSelectedGraphKeys : [graphKey];
    setContextMenu({ graph, graphKeys, kind: 'graph', x: event.clientX, y: event.clientY });
  };

  const handleGraphClick = (event, graph) => {
    const graphKey = graphSelectionKey(graph);
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      const graphKeys = filteredGraphs.map(graphSelectionKey);
      const targetIndex = graphKeys.indexOf(graphKey);
      const anchorKey = graphSelectionAnchorRef.current || graphKey;
      const anchorIndex = graphKeys.indexOf(anchorKey);
      if (event.shiftKey && targetIndex >= 0 && anchorIndex >= 0) {
        const range = graphKeys.slice(Math.min(targetIndex, anchorIndex), Math.max(targetIndex, anchorIndex) + 1);
        setSelectedGraphKeys((current) => event.metaKey || event.ctrlKey ? [...new Set([...current, ...range])] : range);
      } else {
        setSelectedGraphKeys((current) => current.includes(graphKey)
          ? current.filter((key) => key !== graphKey)
          : [...current, graphKey]);
      }
      graphSelectionAnchorRef.current = graphKey;
      return;
    }
    setSelectedGraphKeys([]);
    graphSelectionAnchorRef.current = null;
    recordUsage('graphs', graph.id);
    onOpenGraph?.(graph);
  };

  const openTemplateMenu = (event, graph) => {
    event.preventDefault();
    setContextMenu({ graph, kind: 'template', x: event.clientX, y: event.clientY });
  };

  const openPrefabMenu = (event, prefab) => {
    event.preventDefault();
    setContextMenu({ graph: prefab, kind: 'prefab', x: event.clientX, y: event.clientY });
  };

  const openEmbedMenu = (event, asset) => {
    event.preventDefault();
    setContextMenu({ graph: asset, kind: 'embed', x: event.clientX, y: event.clientY });
  };

  const renderNodeEntry = (node, keyPrefix = '') => {
    const payload = nodeDragPayload(node);
    const selected = selectedLibraryNodeTypes.includes(node.type);
    return <button key={`${keyPrefix}${node.type}`} type="button" className={`graph-library-entry node-library-entry ${selected ? 'is-multi-selected' : ''} ${node.loadFailed ? 'is-node-load-failed' : ''}`} aria-pressed={selected} aria-disabled={Boolean(node.loadFailed)} disabled={Boolean(node.loadFailed)} draggable={!desktopMode && !node.loadFailed} onPointerDown={(event) => beginPointerDrag(event, payload)} onClickCapture={suppressClickAfterDrag} onDragStart={(event) => startNodeDrag(event, payload)} onDragEnd={finishNodeDrag} onClick={(event) => {
      if (node.loadFailed) return;
      if (event.metaKey || event.ctrlKey) { setSelectedLibraryNodeTypes((current) => current.includes(node.type) ? current.filter((type) => type !== node.type) : [...current, node.type]); return; }
      setSelectedLibraryNodeTypes([]); recordUsage('nodes', node.type); onAddNode?.(node.type);
    }} title={node.loadFailed ? 'Failed to load this node' : `${node.description || ''}${selected ? ' · Drag to add selected nodes' : ''}`} aria-label={node.pluginAdapter ? `${node.label}. Plugin node from ${node.pluginName || node.pluginId || 'an installed plugin'}` : undefined}><NodeTypeIcon type={node.type} color={node.color} size={14} /><span>{node.label}</span>{isNodeDefinitionNew(node, Date.now(), newNodesUserKey) && <i className="node-new-badge">NEW</i>}{node.pluginAdapter && <span className="node-plugin-origin library-plugin-origin" title={`Plugin node from ${node.pluginName || node.pluginId || 'an installed plugin'}`} aria-label={`Plugin node from ${node.pluginName || node.pluginId || 'an installed plugin'}`}><Puzzle size={12} /></span>}</button>;
  };

  return <aside className="graph-library-panel" aria-label="Graph library" style={{ '--arc-sidebar-width': `${sidebarWidth}px` }} onDragOver={(event) => {
    event.preventDefault();
    try {
      const target = event.target instanceof Element ? event.target.closest('[data-graph-category]') : null;
      const disabled = target && window.__arcGraphMovePayload && isGraphMoveDisabled(getDraggedGraphIds(event), target.dataset.graphCategory);
      event.dataTransfer.dropEffect = disabled ? 'none' : categoryDrag || window.__arcGraphMovePayload ? 'move' : 'copy';
    } catch {}
  }} onDrop={ignoreLibraryDrop}>
    <SidebarResizeHandle width={sidebarWidth} defaultWidth={320} onResize={onSidebarResize} />
    <header className="graph-library-header"><span><FolderTree size={15} /> Library</span><div className="graph-library-header-actions">{activeGroupKind && activeGroupNames.length > 0 && <button className="graph-library-expand-all" onClick={toggleAllGroups} aria-label={`${allGroupsExpanded ? 'Collapse' : 'Expand'} all ${activeGroupKind} groups`} title={`${allGroupsExpanded ? 'Collapse' : 'Expand'} all ${activeGroupKind} groups`}><ChevronDown size={12} /><span>{allGroupsExpanded ? 'Collapse all' : 'Expand all'}</span></button>}{activeSection === 'graphs' && <button className="icon-button compact" aria-label="Create graph category" title="Create category" onClick={() => { setCategoryModalMode('create'); setCategoryModalTarget(null); setCategoryModalName(''); setShowCategoryModal(true); }}><Plus size={14} /></button>}<input ref={importGraphInputRef} type="file" accept=".arcgraph,application/vnd.arc-studio.graph+json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportGraph?.(file); event.target.value = ''; }} /><button className="icon-button compact" onClick={() => importGraphInputRef.current?.click()} disabled={!canImportGraph} aria-label="Import graph file" title={canImportGraph ? 'Import .arcgraph file' : 'Graph editing access required'}><FileUp size={14} /></button><button className="icon-button compact" onClick={onClose} aria-label="Close graph library"><X size={14} /></button></div></header>
    <div className="graph-library-tabs" role="tablist" aria-label="Library sections">
      {[
        ['graphs', 'Graphs', FolderTree],
        ['nodes', 'Nodes', FileCode2],
        ['data', 'Data', Database],
        ['assets', 'Assets', Sparkles]
      ].map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={activeSection === id} className={activeSection === id ? 'is-active' : ''} onClick={() => setActiveSection(id)}><Icon size={13} /><span>{label}</span></button>)}
    </div>
    <label className="graph-library-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${activeSection}`} aria-label={`Filter ${activeSection}`} /></label>
    <div ref={libraryTreeRef} className={`graph-library-tree${['graph', 'graph-group'].includes(contextMenu?.kind) ? ' is-context-menu-open' : ''}`} role="tree" onWheel={(event) => {
      const nativeDrag = Boolean(categoryDrag || window.__arcGraphMovePayload || window.__arcLibraryPointerDragActive && window.__arcLibraryPointerDrag?.payload?.type === 'graph-call');
      if (!nativeDrag) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1;
      event.currentTarget.scrollTop += event.deltaY * unit;
      event.preventDefault();
      event.stopPropagation();
    }} onDragOver={(event) => {
      const dragging = Boolean(categoryDrag || window.__arcGraphMovePayload);
      if (!dragging) { setLibraryDragEdge(null); return; }
      const bounds = event.currentTarget.getBoundingClientRect();
      const edgeSize = Math.min(72, bounds.height * 0.16);
      let next = null;
      if (event.clientY < bounds.top + edgeSize) {
        const strength = Math.min(1, Math.max(0, (bounds.top + edgeSize - event.clientY) / edgeSize));
        if (strength > 0) next = { direction: -1, strength: Math.round(strength * 20) / 20 };
      } else if (event.clientY > bounds.bottom - edgeSize) {
        const strength = Math.min(1, Math.max(0, (event.clientY - (bounds.bottom - edgeSize)) / edgeSize));
        if (strength > 0) next = { direction: 1, strength: Math.round(strength * 20) / 20 };
      }
      setLibraryDragEdge((current) => current?.direction === next?.direction && current?.strength === next?.strength ? current : next);
    }} onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setLibraryDragEdge(null);
    }}>
      {activeSection === 'graphs' && <>
        {uniqueSelectedGraphKeys.length > 0 && <div className="graph-library-selection-hint" role="status"><span>{uniqueSelectedGraphKeys.length} graph{uniqueSelectedGraphKeys.length === 1 ? '' : 's'} selected</span><button type="button" onClick={() => { setSelectedGraphKeys([]); graphSelectionAnchorRef.current = null; }} aria-label="Deselect all graphs">Deselect all</button></div>}
        {frequentGraphs.length > 0 && <section className="graph-library-frequent">
          <div className="graph-library-section-heading graph-library-subsection"><span><Star size={13} /> Frequently used</span><small>{frequentGraphs.length} / 3</small></div>
          <div className="graph-library-frequent-list">{frequentGraphs.map((graph) => {
            const lastSeen = graphLastSeen.get(graph.id);
            const selected = uniqueSelectedGraphKeys.includes(graphSelectionKey(graph));
            const active = graph.id === activeTabId;
            const report = graphValidationReports?.get?.(graph.id);
            const errorCount = report?.errors?.length || 0;
            const warningCount = report?.warnings?.length || 0;
            const graphKey = graphSelectionKey(graph);
            return <button key={graph.id} className={`graph-library-entry graph-library-entry-with-activity${active ? ' is-active' : ''}${selected ? ' is-multi-selected' : ''}${contextMenu?.kind === 'graph' && contextMenu.graph?.id === graph.id ? ' is-context-menu-open' : ''}`} aria-pressed={selected} aria-current={active ? 'page' : undefined} draggable={!desktopMode} onPointerDown={(event) => {
              const graphIds = uniqueSelectedGraphKeys.includes(graphKey)
                ? uniqueSelectedGraphKeys.map((key) => graphs.find((item) => graphSelectionKey(item) === key)?.id).filter(Boolean)
                : [graph.id];
              beginPointerDrag(event, { type: 'graph-call', graphId: graph.id, graphIds });
            }} onClickCapture={suppressClickAfterDrag} onDragStart={(event) => startGraphDrag(event, graph)} onDragEnd={finishGraphDrag} onClick={(event) => handleGraphClick(event, graph)} onContextMenu={(event) => openContextMenu(event, graph)} title={active ? 'Currently active graph. Drag into the canvas to call this graph.' : lastSeen ? `Last here: ${lastSeen.username || 'Collaborator'} · ${formatGraphLastSeen(lastSeen.updatedAt)}. Drag into the canvas to call this graph.` : 'Drag into the canvas to call this graph'}><FileCode2 size={14} /><span className="graph-library-entry-copy"><span className="graph-library-entry-title"><span>{graph.name || 'Untitled graph'}</span>{defaultGraphId === graph.id && <Star className="graph-default-star" size={11} fill="currentColor" title="Default for new graphs" />}{errorCount > 0 ? (
              <span role="button" tabIndex={0} className="graph-library-issue is-error" title={`${errorCount} blocking error${errorCount === 1 ? '' : 's'}`} aria-label={`${errorCount} blocking error${errorCount === 1 ? '' : 's'}`} onClick={(event) => { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); } }}><AlertCircle size={13} /></span>
            ) : warningCount > 0 ? (
              <span role="button" tabIndex={0} className="graph-library-issue is-warning" title={`${warningCount} review warning${warningCount === 1 ? '' : 's'}`} aria-label={`${warningCount} review warning${warningCount === 1 ? '' : 's'}`} onClick={(event) => { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); } }}><AlertTriangle size={13} /></span>
            ) : null}</span>{lastSeen?.username && <small>{lastSeen.username} · {formatGraphLastSeen(lastSeen.updatedAt)}</small>}</span>{openGraphIds.includes(graph.id) && !active && <span className="graph-library-open-indicator" title="Open in another tab" aria-label="Open in another tab"><Layers size={11} /></span>}</button>;
          })}</div>
        </section>}
        {graphGroups.map(([groupName, items]) => <section data-graph-category={groupName} className={`graph-library-group${categoryDropTarget?.name === groupName ? ` is-drop-${categoryDropTarget.position}` : ''}${graphMoveDropTarget?.name === groupName ? ` is-drop-into${graphMoveDropTarget.disabled ? ' is-drop-disabled' : ''}` : ''}`} key={groupName} onDragOver={(event) => {
          const movingGraph = Boolean(window.__arcGraphMovePayload) || Array.from(event.dataTransfer?.types || []).includes('application/x-arc-graph-move');
          if (movingGraph) {
            event.preventDefault();
            const graphIds = getDraggedGraphIds(event);
            const disabled = isGraphMoveDisabled(graphIds, groupName);
            event.dataTransfer.dropEffect = disabled ? 'none' : 'move';
            setGraphMoveDropTarget((current) => current?.name === groupName && current?.disabled === disabled ? current : { name: groupName, disabled });
            return;
          }
          if (!categoryDrag || categoryDrag === groupName) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          const nextTarget = { name: groupName, position: event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before' };
          setCategoryDropTarget((current) => current?.name === nextTarget.name && current?.position === nextTarget.position ? current : nextTarget);
        }} onDrop={(event) => {
          if (categoryDrag) finishCategoryReorder(event, groupName, event.currentTarget);
          else {
            let payload = window.__arcGraphMovePayload;
            try { payload ||= JSON.parse(event.dataTransfer.getData('application/x-arc-graph-move') || 'null'); } catch {}
            if (payload?.graphIds?.length && !isGraphMoveDisabled(payload.graphIds, groupName)) {
              event.preventDefault();
              event.stopPropagation();
              moveGraphsToCategory(payload.graphIds, groupName);
              window.__arcGraphMovePayload = null;
              window.__arcGraphDragPayload = null;
              clearLibraryDragPayload();
              setLibraryDragGhost(null);
            }
          }
        }} onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) { setCategoryDropTarget(null); setGraphMoveDropTarget(null); }
        }}>
          <div className="graph-library-category-heading">
          <button type="button" className="graph-library-category-drag-handle" draggable={!isSearching} aria-label={`Drag to reorder ${groupName}`} title="Drag to reorder category" onDragStart={(event) => {
              event.stopPropagation();
              hideNativeDragImage(event);
              setLibraryDragEdge(null);
              setCategoryDrag(groupName);
              event.dataTransfer.setData('application/x-arc-category-order', groupName);
              event.dataTransfer.effectAllowed = 'move';
            }} onDragEnd={() => { setCategoryDrag(null); setCategoryDropTarget(null); setLibraryDragEdge(null); }}><GripVertical size={13} /></button>
            <button className="graph-library-root graph-library-subroot" onClick={() => { if (!isSearching) updateExpandedGroups('graphs', (current) => ({ ...current, [groupName]: !current[groupName] })); }} onContextMenu={(event) => { event.preventDefault(); const categoryId = Object.entries(graphCategories || {}).find(([id, category]) => id !== '__order' && category?.name === groupName)?.[0];
              setContextMenu({ kind: 'graph-group', groupName, categoryId, graphIds: items.map((item) => item.id), graphKeys: items.map(graphSelectionKey), x: event.clientX, y: event.clientY }); }} aria-expanded={isSearching || Boolean(expandedGroups[groupName])} role="treeitem">
              {isSearching || expandedGroups[groupName] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{groupName === 'Functions' ? <Calculator size={13} /> : <FolderTree size={13} />}<span>{groupName}</span><small>{items.length}</small>
            </button>
          </div>
          {(isSearching || expandedGroups[groupName]) && <div className="graph-library-children" role="group">{items.map((graph) => {
            const isOpen = openGraphIds.includes(graph.id);
            const lastSeen = graphLastSeen.get(graph.id);
            const graphKey = graphSelectionKey(graph);
            const selected = uniqueSelectedGraphKeys.includes(graphKey);
            const active = graph.id === activeTabId;
            const report = graphValidationReports?.get?.(graph.id);
            const errorCount = report?.errors?.length || 0;
            const warningCount = report?.warnings?.length || 0;
            return <div key={graphKey} className={`graph-library-item ${active ? 'is-active' : ''}${graph.enabled === false ? ' is-disabled-graph' : ''}${selected ? ' is-multi-selected' : ''} ${contextMenu?.kind === 'graph' && graphSelectionKey(contextMenu.graph) === graphKey ? 'is-context-menu-open' : ''}`} role="treeitem" aria-selected={selected} aria-current={active ? 'page' : undefined}>
              <button className={`graph-library-entry${lastSeen?.username ? ' graph-library-entry-with-activity' : ''}`} aria-pressed={selected} draggable={!desktopMode} onPointerDown={(event) => {
                const graphIds = uniqueSelectedGraphKeys.includes(graphKey)
                  ? uniqueSelectedGraphKeys.map((key) => graphs.find((item) => graphSelectionKey(item) === key)?.id).filter(Boolean)
                  : [graph.id];
                beginPointerDrag(event, { type: 'graph-call', graphId: graph.id, graphIds });
              }} onClickCapture={suppressClickAfterDrag} onDragStart={(event) => startGraphDrag(event, graph)} onDragEnd={finishGraphDrag} onClick={(event) => handleGraphClick(event, graph)} onContextMenu={(event) => openContextMenu(event, graph)} title={lastSeen?.username ? `Last here: ${lastSeen.username} · ${formatGraphLastSeen(lastSeen.updatedAt)}. Drag into the canvas to call this graph or onto a category to move it.` : 'Drag into the canvas to call this graph or onto a category to move it'}>
                <FileCode2 size={14} /><span className="graph-library-entry-copy"><span className="graph-library-entry-title"><span>{graph.name || 'Untitled graph'}</span>{defaultGraphId === graph.id && <Star className="graph-default-star" size={11} fill="currentColor" title="Default for new graphs" />}{errorCount > 0 ? (
                  <span role="button" tabIndex={0} className="graph-library-issue is-error" title={`${errorCount} blocking error${errorCount === 1 ? '' : 's'}`} aria-label={`${errorCount} blocking error${errorCount === 1 ? '' : 's'}`} onClick={(event) => { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); } }}><AlertCircle size={13} /></span>
                ) : warningCount > 0 ? (
                  <span role="button" tabIndex={0} className="graph-library-issue is-warning" title={`${warningCount} review warning${warningCount === 1 ? '' : 's'}`} aria-label={`${warningCount} review warning${warningCount === 1 ? '' : 's'}`} onClick={(event) => { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); onOpenGraphReview?.(graph); } }}><AlertTriangle size={13} /></span>
                ) : null}</span>{lastSeen?.username && <small>{lastSeen.username} · {formatGraphLastSeen(lastSeen.updatedAt)}</small>}</span>{isOpen && !active && <span className="graph-library-open-indicator" title="Open in another tab" aria-label="Open in another tab"><Layers size={11} /></span>}
              </button>
              <button className="graph-library-more" onClick={(event) => openContextMenu(event, graph)} aria-label={`Actions for ${graph.name || 'graph'}`} title="Graph actions"><MoreHorizontal size={14} /></button>
            </div>;
          })}</div>}
        </section>)}
        {!filteredGraphs.length && <div className="graph-library-empty">{graphs.length ? 'No matches' : 'No saved graphs'}</div>}
        <div className="graph-library-section-heading graph-library-subsection"><span><BookmarkPlus size={13} /> Templates</span><small>{templates.length}</small></div>
        {filteredTemplates.map((template) => <div className={`graph-library-item ${contextMenu?.kind === 'template' && contextMenu.graph?.id === template.id ? 'is-context-menu-open' : ''}`} key={template.id} onContextMenu={(event) => openTemplateMenu(event, template)}>
          <button className="graph-library-entry" onClick={() => onUseTemplate?.(template)} title="Create a graph from this template"><FileCode2 size={14} /><span>{template.name || 'Untitled template'}</span>{defaultGraphId === template.id && <Star className="graph-default-star" size={11} fill="currentColor" />}</button>
          <button className="graph-library-more" onClick={(event) => openTemplateMenu(event, template)} aria-label={`Actions for ${template.name || 'template'}`}><MoreHorizontal size={14} /></button>
        </div>)}
        {!filteredTemplates.length && <div className="graph-library-empty">{templates.length ? 'No matching templates' : 'No templates'}</div>}
      </>}
      {activeSection === 'nodes' && <>
        <div className="graph-library-section-heading graph-library-subsection"><span><FileCode2 size={13} /> Node library</span><small>{definitions.filter((node) => !isNodeDefinitionHidden(node)).length}</small></div>
        <section className="graph-library-frequent">
          <div className="graph-library-section-heading graph-library-subsection"><span><Star size={13} /> Frequently used</span><small>{frequentNodes.length} / 5</small></div>
          {frequentNodes.length > 0
            ? <div className="graph-library-frequent-list">{frequentNodes.map((node) => renderNodeEntry(node, 'frequent-'))}</div>
            : <div className="graph-library-empty graph-library-frequent-empty">Use or drag nodes to build this list.</div>}
        </section>
        {nodeGroups.map(([category, items]) => <section className="graph-library-group" key={category}>
          <button className="graph-library-root graph-library-subroot" onClick={() => { if (!isSearching) updateExpandedGroups('nodes', (current) => ({ ...current, [category]: !current[category] })); }} aria-expanded={isSearching || Boolean(expandedNodeGroups[category])} role="treeitem">
            {isSearching || expandedNodeGroups[category] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span>{category}</span><small>{items.length}</small>
          </button>
          {(isSearching || expandedNodeGroups[category]) && <div className="graph-library-children" role="group">{items.map((node) => renderNodeEntry(node))}</div>}
        </section>)}
        <div className="graph-library-section-heading graph-library-subsection"><span><BookmarkPlus size={13} /> Saved nodes</span><small>{compatiblePrefabs.length}</small></div>
        {filteredPrefabs.map((prefab) => {
          const definition = definitions.find((node) => node.type === prefab.node?.type);
          const pluginTooltip = `Plugin node from ${definition?.pluginName || definition?.pluginId || 'an installed plugin'}`;
          const nodeLoadFailed = !definition || definition.loadFailed;
          return <div className={`graph-library-item ${contextMenu?.kind === 'prefab' && contextMenu.graph?.id === prefab.id ? 'is-context-menu-open' : ''}`} key={prefab.id} onContextMenu={(event) => openPrefabMenu(event, prefab)}>
          <button type="button" className={`graph-library-entry ${nodeLoadFailed ? 'is-node-load-failed' : ''}`} disabled={nodeLoadFailed} aria-disabled={nodeLoadFailed} draggable={!desktopMode && !nodeLoadFailed} onPointerDown={(event) => beginPointerDrag(event, { type: 'prefab', prefabId: prefab.id, prefabNode: prefab.node })} onClickCapture={suppressClickAfterDrag} onDragStart={(event) => startNodeDrag(event, { type: 'prefab', prefabId: prefab.id, prefabNode: prefab.node })} onDragEnd={finishNodeDrag} onClick={() => onAddPrefab?.(prefab)} title={nodeLoadFailed ? 'Failed to load this node' : 'Drag to canvas or click to add'} aria-label={definition?.pluginAdapter ? `${prefab.name || 'Node prefab'}. ${pluginTooltip}` : undefined}><NodeTypeIcon type={prefab.node?.type} color={definition?.color} size={14} /><span>{prefab.name || 'Node prefab'}</span>{definition?.pluginAdapter && <span className="node-plugin-origin library-plugin-origin" title={pluginTooltip} aria-label={pluginTooltip}><Puzzle size={12} /></span>}</button>
          <button className="graph-library-more" onClick={(event) => openPrefabMenu(event, prefab)} aria-label={`Actions for ${prefab.name || 'node prefab'}`}><MoreHorizontal size={14} /></button>
        </div>;
        })}
        {!filteredPrefabs.length && <div className="graph-library-empty">{nodePrefabs.length ? 'No matching saved nodes' : 'No saved nodes'}</div>}
      </>}
      {activeSection === 'data' && <>
        <div className="graph-library-section-heading graph-library-subsection"><span><Database size={13} /> Variables</span><button className="graph-library-section-action" onClick={onManageVariables} aria-label="Manage graph variables" title="Manage variables"><Plus size={13} /></button></div>
        {filteredVariables.map((variable) => {
          const selected = selectedVariableIds.includes(variable.id);
          const payload = variableDragPayload(variable);
          return <button className={`graph-library-entry graph-library-variable ${selected ? 'is-multi-selected' : ''}`} key={variable.id} draggable={!desktopMode} onPointerDown={(event) => beginPointerDrag(event, payload)} onClickCapture={suppressClickAfterDrag} onDragStart={(event) => startNodeDrag(event, payload)} onDragEnd={finishNodeDrag} onClick={(event) => {
            if (event.metaKey || event.ctrlKey) { setSelectedVariableIds((current) => current.includes(variable.id) ? current.filter((id) => id !== variable.id) : [...current, variable.id]); return; }
            setSelectedVariableIds([]); onManageVariables?.();
          }} title={`Drag to canvas to add Get Variable · ${variable.name || 'Untitled variable'}${selected ? ' · Drag to add selected variables' : ''}`} aria-pressed={selected}><Braces size={13} /><span>{variable.name || 'Untitled variable'}</span><small>{variable.type || 'string'}</small></button>;
        })}
        {!filteredVariables.length && <div className="graph-library-empty">{graphVariables.length ? 'No matching variables' : 'No graph variables'}</div>}
        <div className="graph-library-section-heading graph-library-subsection"><span><Sparkles size={13} /> Project media</span><small>{mediaAssets.length}</small><button className="graph-library-section-action" onClick={onManageMedia} aria-label="Open project media library" title="Open project media library"><Plus size={13} /></button></div>
        {search(mediaSearchIndex, mediaAssets).slice(0, 24).map((asset) => { const kind = mediaKind(asset); const Icon = kind === 'image' ? FileImage : kind === 'video' ? FileVideo : kind === 'audio' ? AudioLines : File; return <button className="graph-library-entry graph-library-variable" key={asset.id} onClick={onManageMedia} title={`${asset.filename} · Open project media library`}><Icon className="graph-library-media-icon" size={14} /><span>{asset.filename}</span></button>; })}
        {!mediaAssets.length && <div className="graph-library-empty">No project media files</div>}
        <div className="graph-library-section-heading graph-library-subsection"><span><Clock3 size={13} /> Snapshots</span><small>{activeSnapshots.length}</small><button className="graph-library-section-action" onClick={() => { setSnapshotError(''); setShowSnapshotName((value) => !value); }} aria-label="Save graph snapshot" title={activeGraph ? 'Save a checkpoint of the active graph' : 'Open a graph to save a snapshot'} disabled={!activeGraph}><Plus size={13} /></button></div>
        {showSnapshotName && activeGraph && <form className="graph-snapshot-form" onSubmit={saveSnapshot}><CharacterLimit value={snapshotName} maxLength={80}><input value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} maxLength={80} placeholder="Checkpoint name" aria-label="Snapshot name" autoFocus /></CharacterLimit><button type="submit" disabled={snapshotBusy}><Save size={12} />Save</button>{snapshotError && <small role="alert">{snapshotError}</small>}</form>}
        {activeSnapshots.map((snapshot) => <div className="graph-snapshot-row" key={snapshot.id}>
          <span><strong>{snapshot.name}</strong><small>{new Date(snapshot.createdAt).toLocaleString()}</small></span>
          <button onClick={() => setCompareSnapshot(snapshot)} title="Compare with active graph" aria-label={`Compare ${snapshot.name}`}><GitCompare size={12} /></button>
          <button onClick={() => onRestoreSnapshot?.(snapshot)} title="Restore snapshot" aria-label={`Restore ${snapshot.name}`}><RotateCcw size={12} /></button>
          <button onClick={async () => { try { await onDeleteSnapshot?.(snapshot); setSnapshotError(''); } catch (error) { setSnapshotError(error.message); } }} title="Delete snapshot" aria-label={`Delete ${snapshot.name}`}><Trash2 size={12} /></button>
        </div>)}
        {snapshotError && <div className="graph-library-empty" role="alert">{snapshotError}</div>}
        {!activeSnapshots.length && <div className="graph-library-empty">{activeGraph ? 'No checkpoints for this graph' : 'Open a graph to see its checkpoints'}</div>}
      </>}
      {activeSection === 'assets' && <>
        <div className="graph-library-section-heading graph-library-subsection"><span><Sparkles size={13} /> Embeds</span><small>{filteredEmbeds.length}</small><button className="graph-library-section-action" onClick={onCreateEmbed} aria-label="Create embed" title="Create embed"><Plus size={13} /></button></div>
        {frequentEmbeds.length > 0 && <section className="graph-library-frequent">
          <div className="graph-library-section-heading graph-library-subsection"><span><Star size={13} /> Frequently used</span><small>{frequentEmbeds.length} / 3</small></div>
          <div className="graph-library-frequent-list">{frequentEmbeds.map((asset) => <button key={asset.id} className="graph-library-entry" onClick={() => { recordUsage('embeds', asset.id); onOpenEmbed?.(asset); }} title="Open embed"><Sparkles size={14} /><span>{asset.name || 'Untitled embed'}</span></button>)}</div>
        </section>}
        {filteredEmbeds.map((asset) => <div className={`graph-library-item ${contextMenu?.kind === 'embed' && contextMenu.graph?.id === asset.id ? 'is-context-menu-open' : ''}`} key={asset.id} onContextMenu={(event) => openEmbedMenu(event, asset)}>
          <button className="graph-library-entry" draggable={!desktopMode} onPointerDown={(event) => beginPointerDrag(event, { type: 'embed-asset', id: asset.id, name: asset.name || 'Untitled embed', blocks: asset.blocks || [], components: asset.components || [] })} onClickCapture={suppressClickAfterDrag} onDragStart={(event) => startEmbedDrag(event, asset)} onDragEnd={finishEmbedDrag} onClick={() => { recordUsage('embeds', asset.id); onOpenEmbed?.(asset); }} title="Open embed or drag it onto the canvas"><Sparkles size={13} /><span>{asset.name || 'Untitled embed'}</span></button>
          <button className="graph-library-more" onClick={(event) => openEmbedMenu(event, asset)} aria-label={`Actions for ${asset.name || 'embed'}`} title="Embed actions"><MoreHorizontal size={14} /></button>
        </div>)}
        {!filteredEmbeds.length && <div className="graph-library-empty">{embedAssets.some((asset) => asset.kind !== 'components-v2') ? 'No matching embeds' : 'No saved embeds'}</div>}
        <div className="graph-library-section-heading graph-library-subsection"><span><Layers size={13} /> Components V2</span><small>{filteredComponentsV2.length}</small><button className="graph-library-section-action" onClick={onCreateComponentsV2} aria-label="Create Components V2" title="Create Components V2"><Plus size={13} /></button></div>
        {filteredComponentsV2.map((asset) => <div className={`graph-library-item ${contextMenu?.kind === 'embed' && contextMenu.graph?.id === asset.id ? 'is-context-menu-open' : ''}`} key={asset.id} onContextMenu={(event) => openEmbedMenu(event, asset)}>
          <button className="graph-library-entry" draggable={!desktopMode} onPointerDown={(event) => beginPointerDrag(event, { type: 'components-v2-asset', id: asset.id, name: asset.name || 'Untitled Components V2', componentsV2Layout: asset.componentsV2Layout || [], attachments: asset.attachments || [] })} onClickCapture={suppressClickAfterDrag} onDragStart={(event) => startComponentsV2Drag(event, asset)} onDragEnd={finishEmbedDrag} onClick={() => { recordUsage('embeds', asset.id); onOpenEmbed?.(asset); }} title="Open Components V2 or drag it onto a compatible node"><Layers size={13} /><span>{asset.name || 'Untitled Components V2'}</span></button>
          <button className="graph-library-more" onClick={(event) => openEmbedMenu(event, asset)} aria-label={`Actions for ${asset.name || 'Components V2'}`} title="Components V2 actions"><MoreHorizontal size={14} /></button>
        </div>)}
        {!filteredComponentsV2.length && <div className="graph-library-empty">{embedAssets.some((asset) => asset.kind === 'components-v2') ? 'No matching Components V2 assets' : 'No saved Components V2 assets'}</div>}
      </>}
    </div>
    <footer className="graph-library-footer">
      <button className="graph-template-button" onClick={onCreateFunction} title="Create a new function graph"><Calculator size={14} /><span>New function</span></button>
      <button className="graph-template-button" onClick={onCreateEmbed}><Sparkles size={14} /><span>New embed</span></button>
      <button className="graph-template-button" onClick={() => onSaveTemplate?.(activeGraph)} disabled={!activeGraph}><BookmarkPlus size={14} /><span>Save graph as template</span></button>
      <button className="graph-template-button" onClick={onCreateComponentsV2}><Layers size={14} /><span>New Component</span></button>
      <button className="graph-export-button" onClick={() => onExportBot?.()} disabled={exportInProgress || (!graphs.length && !openGraphIds.length)}><PackageOpen size={15} /><span>{exportInProgress ? 'Exporting…' : 'Export app'}</span><kbd>.zip</kbd></button>
    </footer>
    {contextMenu && createPortal(<div ref={contextMenuRef} className="graph-context-menu" style={{ left: contextMenu.x, top: contextMenu.y, transform: `scale(${uiScale})`, transformOrigin: 'top left' }} onPointerDown={(event) => event.stopPropagation()}>
      {contextMenu.kind === 'graph' ? <>
        <button onClick={() => { onOpenGraph?.(contextMenu.graph); setContextMenu(null); }}><FileCode2 size={14} /> Open graph</button>
        <button disabled={!canEditGraphs} title={!canEditGraphs ? 'Graph editing access required' : undefined} onClick={() => { onSetGraphEnabled?.(contextMenu.graph, contextMenu.graph.enabled === false); setContextMenu(null); }}>{contextMenu.graph.enabled === false ? <ToggleLeft size={14} /> : <ToggleRight size={14} />} {contextMenu.graph.enabled === false ? 'Enable graph' : 'Disable graph'}</button>
        <button onClick={() => { onDuplicateGraph?.(contextMenu.graph); setContextMenu(null); }}><Copy size={14} /> Duplicate graph</button>
        <button onClick={() => { onRenameGraph?.(contextMenu.graph); setContextMenu(null); }}><Pencil size={14} /> Rename graph</button>
        {Object.entries(graphCategories).filter(([id, value]) => id !== '__order' && value?.name).map(([id, value]) => <button key={id} onClick={() => { const ids = (contextMenu.graphKeys || [graphSelectionKey(contextMenu.graph)]).map((key) => graphs.find((graph) => graphSelectionKey(graph) === key)?.id).filter(Boolean); setGraphCategories((current) => Object.fromEntries(Object.entries(current).map(([key, category]) => [key, key === id ? { ...category, graphIds: [...new Set([...(category.graphIds || []), ...ids])] } : key === '__order' ? [key, category] : { ...category, graphIds: (category.graphIds || []).filter((graphId) => !ids.includes(graphId)) }]))); setContextMenu(null); }}><FolderTree size={14} /> Move to {value.name}</button>)}
        <button onClick={() => { onSetDefault?.(contextMenu.graph); setContextMenu(null); }}><Star size={14} fill={defaultGraphId === contextMenu.graph.id ? 'currentColor' : 'none'} /> {defaultGraphId === contextMenu.graph.id ? 'Default for new graphs' : 'Set as new graph default'}</button>
        <button onClick={() => { onSaveTemplate?.(contextMenu.graph); setContextMenu(null); }}><BookmarkPlus size={14} /> Save as template</button>
        <button onClick={() => { onExportGraph?.(contextMenu.graph); setContextMenu(null); }}><Download size={14} /> Export graph</button>
        <button className="is-danger" onClick={() => {
          const selectedGraphs = (contextMenu.graphKeys || [graphSelectionKey(contextMenu.graph)]).map((key) => graphs.find((graph) => graphSelectionKey(graph) === key)).filter(Boolean);
          if (selectedGraphs.length > 1) onDeleteGraphs?.(selectedGraphs);
          else onDeleteGraph?.(contextMenu.graph);
          setSelectedGraphKeys([]);
          setContextMenu(null);
        }}><X size={14} /> {contextMenu.graphKeys?.length > 1 ? `Delete ${contextMenu.graphKeys.length} selected graphs` : 'Delete saved graph'}</button>
      </> : contextMenu.kind === 'graph-group' ? <>
        <button onClick={() => handleCreateGraphInCategory(contextMenu.groupName)}><Plus size={14} /> Create graph here</button>
        <button onClick={() => { setSelectedGraphKeys([...new Set(contextMenu.graphKeys || [])]); graphSelectionAnchorRef.current = null; setContextMenu(null); }}><FileCode2 size={14} /> Select all {contextMenu.groupName} graphs</button>
        <button onClick={() => { setCategoryModalMode('create'); setCategoryModalTarget(null); setCategoryModalName(''); setShowCategoryModal(true); setContextMenu(null); }}><Plus size={14} /> Create category</button>
        {contextMenu.categoryId && <>
          <button onClick={() => {
            setCategoryModalMode('rename');
            setCategoryModalTarget({ categoryId: contextMenu.categoryId, groupName: contextMenu.groupName, graphIds: [...(contextMenu.graphIds || [])] });
            setCategoryModalName(contextMenu.groupName || '');
            setShowCategoryModal(true);
            setContextMenu(null);
          }}><Pencil size={14} /> Rename category</button>
          <button className="is-danger" onClick={() => deleteCategory(contextMenu.categoryId)}><Trash2 size={14} /> Delete category{graphCategories[contextMenu.categoryId]?.graphIds?.length ? ` and ${graphCategories[contextMenu.categoryId].graphIds.length} graphs` : ''}</button>
        </>}
      </> : contextMenu.kind === 'prefab' ? <>
        <button onClick={() => { onAddPrefab?.(contextMenu.graph); setContextMenu(null); }}><FileCode2 size={14} /> Add to graph</button>
        <button className="is-danger" onClick={() => { onDeletePrefab?.(contextMenu.graph); setContextMenu(null); }}><X size={14} /> Delete saved node</button>
      </> : contextMenu.kind === 'embed' ? <>
        <button onClick={() => { onOpenEmbed?.(contextMenu.graph); setContextMenu(null); }}><Pencil size={14} /> {contextMenu.graph.kind === 'components-v2' ? 'Edit in Component Studio' : 'Edit in Embed Studio'}</button>
        <button className="is-danger" onClick={() => { onDeleteEmbed?.(contextMenu.graph); setContextMenu(null); }}><X size={14} /> {contextMenu.graph.kind === 'components-v2' ? 'Delete Components V2' : 'Delete embed'}</button>
      </> : <>
        <button onClick={() => { onUseTemplate?.(contextMenu.graph); setContextMenu(null); }}><Play size={14} /> Create from template</button>
        <button onClick={() => { onSetDefault?.(contextMenu.graph); setContextMenu(null); }}><Star size={14} fill={defaultGraphId === contextMenu.graph.id ? 'currentColor' : 'none'} /> {defaultGraphId === contextMenu.graph.id ? 'Default for new graphs' : 'Set as new graph default'}</button>
        <button className="is-danger" onClick={() => { onDeleteTemplate?.(contextMenu.graph); setContextMenu(null); }}><X size={14} /> Delete template</button>
      </>}
    </div>, document.body)}
    {compareSnapshot && activeGraph && <div className="graph-snapshot-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setCompareSnapshot(null); }}><section className="graph-snapshot-dialog" role="dialog" aria-modal="true" aria-labelledby="snapshot-compare-title">
      <header><div><strong id="snapshot-compare-title">Snapshot comparison</strong><span>{compareSnapshot.name} → current graph</span></div><button onClick={() => setCompareSnapshot(null)} aria-label="Close comparison"><X size={14} /></button></header>
      <SnapshotComparison base={compareSnapshot.graph} current={activeGraph} definitions={definitions} />
      <footer><button onClick={() => { onRestoreSnapshot?.(compareSnapshot); setCompareSnapshot(null); }}><RotateCcw size={13} />Restore snapshot</button><button onClick={() => setCompareSnapshot(null)}>Close</button></footer>
    </section></div>}
    {libraryDragGhost && !libraryDragGhost.hidden && createPortal(
      <div
        className="library-drag-ghost"
        style={{
          position: 'fixed',
          left: `${libraryDragGhost.clientX + 14}px`,
          top: `${libraryDragGhost.clientY + 12}px`,
          transform: `scale(${getArcUiScale()})`,
          transformOrigin: 'top left',
          '--node-accent': libraryDragGhost.color,
          pointerEvents: 'none',
          zIndex: 99999
        }}
        aria-hidden="true"
      >
        <NodeTypeIcon type={libraryDragGhost.type} color={libraryDragGhost.color} size={14} pluginAdapter={libraryDragGhost.pluginAdapter} />
        <span>{libraryDragGhost.label}</span>
        {libraryDragGhost.pluginAdapter && <span className="node-plugin-origin library-plugin-origin" title="Plugin node"><Puzzle size={12} /></span>}
      </div>,
      document.body
    )}
    {showCategoryModal && (
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setCategoryModalName(''); setCategoryModalTarget(null); }}
        title={categoryModalMode === 'create' ? 'Create category' : 'Rename category'}
        initialFocusRef={categoryNameRef}
      >
        <TextInput label="Category name" value={categoryModalName} onChange={(event) => setCategoryModalName(event.target.value)} inputRef={categoryNameRef} autoFocus />
        <footer className="modal-footer">
          <Button variant="secondary" onClick={() => { setShowCategoryModal(false); setCategoryModalName(''); setCategoryModalTarget(null); }}>Cancel</Button>
          <Button variant="primary" onClick={handleCategoryModalConfirm}>{categoryModalMode === 'create' ? 'Create' : 'Rename'}</Button>
        </footer>
      </Modal>
    )}
  </aside>;
}

let blankDragCanvas = null;
function getBlankDragCanvas() {
  if (!blankDragCanvas && typeof document !== 'undefined') {
    blankDragCanvas = document.createElement('canvas');
    blankDragCanvas.width = 1;
    blankDragCanvas.height = 1;
    blankDragCanvas.style.position = 'fixed';
    blankDragCanvas.style.left = '-9999px';
    blankDragCanvas.style.top = '-9999px';
    blankDragCanvas.style.opacity = '0';
    blankDragCanvas.style.pointerEvents = 'none';
    if (document.body) document.body.appendChild(blankDragCanvas);
  }
  return blankDragCanvas;
}

function hideNativeDragImage(event) {
  const dt = event?.dataTransfer;
  if (!dt || typeof dt.setDragImage !== 'function') return;
  try {
    const canvas = getBlankDragCanvas();
    if (canvas) {
      dt.setDragImage(canvas, 0, 0);
    }
  } catch {}
}

function setLibraryTransferData(event, mimeType, payload) {
  const token = `drag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  window.__arcLibraryDragPayloads ||= Object.create(null);
  window.__arcLibraryDragPayloads[token] = { mimeType, payload };
  window.__arcLibraryDragToken = token;
  try { event.dataTransfer.effectAllowed = 'copy'; } catch {}
  try { event.dataTransfer.setData(mimeType, JSON.stringify(payload)); } catch {}
  try { event.dataTransfer.setData('text/plain', `arc-studio:${mimeType}:${token}`); } catch {}
  hideNativeDragImage(event);
}


function rankByUsage(items, usage, getId, limit) {
  return items
    .filter((item) => Number(usage[getId(item)]?.count) > 0)
    .sort((left, right) => {
      const leftUsage = usage[getId(left)] || {};
      const rightUsage = usage[getId(right)] || {};
      return Number(rightUsage.count || 0) - Number(leftUsage.count || 0) || Number(rightUsage.usedAt || 0) - Number(leftUsage.usedAt || 0);
    })
    .slice(0, limit);
}

function clearLibraryDragPayload() {
  const token = window.__arcLibraryDragToken;
  if (token && window.__arcLibraryDragPayloads) delete window.__arcLibraryDragPayloads[token];
  window.__arcLibraryDragToken = null;
}

function readLibraryTransferText(dataTransfer) {
  try { return dataTransfer.getData('text/plain') || ''; } catch { return ''; }
}

function SnapshotComparison({ base, current, definitions = BuiltInNodeDefinitions }) {
  const before = new Map((base.nodes || []).map((node) => [node.id, node]));
  const after = new Map((current.nodes || []).map((node) => [node.id, node]));
  const added = [...after.values()].filter((node) => !before.has(node.id));
  const removed = [...before.values()].filter((node) => !after.has(node.id));
  const changed = [...after.values()].filter((node) => before.has(node.id) && JSON.stringify(node) !== JSON.stringify(before.get(node.id)));
  const wireKey = (wire) => wire.id || `${wire.sourceNodeId}:${wire.sourcePinId}->${wire.targetNodeId}:${wire.targetPinId}`;
  const beforeWires = new Map((base.connections || []).map((wire) => [wireKey(wire), wire]));
  const afterWires = new Map((current.connections || []).map((wire) => [wireKey(wire), wire]));
  const addedWires = [...afterWires.keys()].filter((id) => !beforeWires.has(id) || JSON.stringify(beforeWires.get(id)) !== JSON.stringify(afterWires.get(id)));
  const removedWires = [...beforeWires.keys()].filter((id) => !afterWires.has(id) || JSON.stringify(beforeWires.get(id)) !== JSON.stringify(afterWires.get(id)));
  const beforeVariables = new Map((base.variables || []).map((variable) => [variable.id, variable]));
  const afterVariables = new Map((current.variables || []).map((variable) => [variable.id, variable]));
  const addedVariables = [...afterVariables.keys()].filter((id) => !beforeVariables.has(id));
  const removedVariables = [...beforeVariables.keys()].filter((id) => !afterVariables.has(id));
  const changedVariables = [...afterVariables.keys()].filter((id) => beforeVariables.has(id) && JSON.stringify(beforeVariables.get(id)) !== JSON.stringify(afterVariables.get(id)));
  const label = (node) => node.label || definitions.find((definition) => definition.type === node.type)?.label || node.type;
  return <div className="graph-snapshot-diff">
    <div className="graph-snapshot-diff-counts"><span><b>{added.length}</b> nodes added</span><span><b>{changed.length}</b> nodes changed</span><span><b>{removed.length}</b> nodes removed</span><span><b>+{addedWires.length} / −{removedWires.length}</b> wires</span><span><b>+{addedVariables.length} / ~{changedVariables.length} / −{removedVariables.length}</b> variables</span></div>
    {[['Added', added], ['Changed', changed], ['Removed', removed]].map(([heading, nodes]) => nodes.length > 0 && <section key={heading}><strong>{heading}</strong>{nodes.map((node) => <span key={node.id}>{label(node)}</span>)}</section>)}
    {!added.length && !changed.length && !removed.length && !addedWires.length && !removedWires.length && !addedVariables.length && !changedVariables.length && !removedVariables.length && <p>Graphs match this checkpoint.</p>}
  </div>;
}

function groupNodes(nodes) {
  const groups = new Map();
  for (const node of nodes) groups.set(node.category, [...(groups.get(node.category) || []), node]);
  return [...groups.entries()];
}

function formatGraphLastSeen(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupGraphs(graphs, categoryState = {}) {
  const order = BUILT_IN_GRAPH_CATEGORIES;
  const assignments = new Map();
  const customCategories = [];
  for (const [id, category] of Object.entries(categoryState || {})) {
    if (id === '__order' || !category || typeof category !== 'object') continue;
    if (typeof category.name === 'string' && category.name.trim()) {
      if (category.source !== 'system' && !customCategories.includes(category.name)) customCategories.push(category.name);
      for (const graphId of Array.isArray(category.graphIds) ? category.graphIds : []) assignments.set(graphId, category.name);
    }
  }
  const groups = new Map([...order, ...customCategories].map((name) => [name, []]));
  for (const graph of graphs) {
    const eventTypes = (graph.nodes || []).filter((node) => String(node.type).startsWith('event_')).map((node) => node.type);
    let group = assignments.get(graph.id) || 'Other';
    if (assignments.has(graph.id)) { groups.set(group, [...(groups.get(group) || []), graph]); continue; }
    if (graph.graphType === 'function') group = 'Functions';
    else if (eventTypes.length > 1) group = 'Other';
    else if (eventTypes.includes('event_slash_command')) group = 'Slash Commands';
    else if (eventTypes.some((type) => ['event_user_command', 'event_message_command'].includes(type))) group = 'Context Commands';
    else if (eventTypes.includes('event_message_create')) group = 'Messages';
    else if (eventTypes.some((type) => type.startsWith('event_message_') || type.startsWith('event_reaction_'))) group = 'Message Events';
    else if (eventTypes.some((type) => ['event_button_click', 'event_select_menu', 'event_modal_submit'].includes(type))) group = 'Components';
    else if (eventTypes.includes('event_member_join')) group = 'Member Events';
    else if (eventTypes.includes('event_member_remove')) group = 'Member Events';
    else if (eventTypes.includes('event_voice_state_update') || eventTypes.includes('event_presence_update')) group = 'Voice & Presence';
    else if (eventTypes.some((type) => type.startsWith('event_channel_'))) group = 'Channel Events';
    else if (eventTypes.some((type) => type.startsWith('event_role_'))) group = 'Roles';
    else if (eventTypes.some((type) => type.startsWith('event_guild_ban_') || type === 'event_automod_action' || type === 'event_guild_audit_log_entry_create')) group = 'Moderation Events';
    else if (eventTypes.some((type) => type.startsWith('event_invite_'))) group = 'Invites';
    else if (eventTypes.includes('event_cron')) group = 'Cron Jobs';
    else if (eventTypes.includes('event_bot_ready')) group = 'Bot Events';
    else if (eventTypes.some((type) => type.startsWith('event_scheduled_event_'))) group = 'Scheduled Events';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(graph);
  }
  const naturalOrder = [...order, ...customCategories.filter((name) => !order.includes(name))];
  const requestedOrder = Array.isArray(categoryState?.__order) ? categoryState.__order : [];
  const finalOrder = [...requestedOrder.filter((name) => groups.has(name)), ...naturalOrder.filter((name) => !requestedOrder.includes(name))];
  return finalOrder.map((name) => [name, groups.get(name)]).filter(([name, items]) => items.length || customCategories.includes(name));
}

function graphSelectionKey(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return JSON.stringify([
    graph?.id || '',
    graph?.graphType || '',
    nodes.map((node) => [node?.id || '', node?.type || '']).sort(([leftId, leftType], [rightId, rightType]) => leftId.localeCompare(rightId) || leftType.localeCompare(rightType))
  ]);
}

// contributors: @paccman-0, @relentiousdragon
