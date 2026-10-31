import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CanvasNode } from '../nodes/CanvasNode.jsx';
import { BuiltInNodeDefinitions, functionArgumentPinId, functionInputPinType, getFunctionGraphArguments, getFunctionInputArguments, getNodeArgumentPins, getNodeTemplateInputPins, PinColors, getTextTemplateSlots, resolveDynamicNodePins } from '../nodes/nodeDefinitions.js';
import { ChevronDown, ChevronUp, FastForward, FileCode2, FolderTree, Hand, LockKeyhole, LockOpen, Maximize, Minus, MousePointer2, Plus, Scissors, Search, StepForward, Type, X } from 'lucide-react';
import { embedBlockPins, getEmbedBlocks, getEmbedFieldSocketLabels } from '../nodes/EmbedNodeBuilder.jsx';
import { getArcUiScale } from '../../core/uiScale.js';
import { DEFAULT_SHORTCUTS, formatShortcut, shortcutMatches } from '../../core/shortcuts.js';
import { getEffectiveCanvasQuality } from '../../core/canvasQuality.js';
import { onPageBlur } from '../../core/pageFocus.js';
import { readAppStorage, writeAppStorage } from '../../core/storage.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
//
const GRID_SIZE = 24;
const NODE_WIDTH = 248;
const EMPTY_PIN_SET = new Set();
const EMPTY_TEMPLATE_PREVIEW_VALUES = Object.freeze({});
const EMPTY_REMOTE_NODE_STATE = Object.freeze({});
const warnedFailedNodeTypes = new Set();
const COLLABORATOR_COLORS = ['#63b3ed', '#f687b3', '#68d391', '#f6ad55', '#b794f4', '#4fd1c5', '#fc8181', '#90cdf4', '#fbd38d', '#9ae6b4'];
const LARGE_GRAPH_NODE_LIMIT = 48;
const LARGE_GRAPH_WIRE_LIMIT = 64;
const NODE_CULL_OVERSCAN_MIN = 520;
const NODE_CULL_OVERSCAN_MAX = 1120;
const PAN_CULL_REFRESH_DISTANCE = 560;
const EMPTY_NODE_CONNECTIONS = Object.freeze({ incoming: [], outgoing: [], incident: [] });
const textInputPopupOpen = () => typeof document !== 'undefined' && Boolean(document.querySelector('.arc-full-emoji-picker, .discord-emoji-suggestions'));
const getCanvasDisplayScale = (element) => {
  if (!element) return 1;
  const appRoot = element.closest('.app-root');
  const bounds = appRoot?.getBoundingClientRect();
  const layoutWidth = appRoot?.offsetWidth;
  if (bounds?.width > 0 && layoutWidth > 0) return bounds.width / layoutWidth;
  const canvasBounds = element.getBoundingClientRect();
  return canvasBounds.width > 0 && element.clientWidth > 0 ? canvasBounds.width / element.clientWidth : 1;
};
const getCollaboratorColor = (id) => {
  let hash = 0;
  for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLLABORATOR_COLORS[(hash >>> 0) % COLLABORATOR_COLORS.length];
};

function equalDefinitionValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => equalDefinitionValue(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(right, key) && equalDefinitionValue(left[key], right[key]));
}

function equalPinLists(left = [], right = []) {
  return left.length === right.length && left.every((pin, index) => {
    const candidate = right[index];
    if (!candidate) return false;
    const keys = Object.keys(pin);
    return keys.length === Object.keys(candidate).length && keys.every((key) => equalDefinitionValue(pin[key], candidate[key]));
  });
}

function equalNodeDefinitions(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => key === 'inputs' || key === 'outputs'
    ? equalPinLists(left[key] || [], right[key] || [])
    : Object.is(left[key], right[key]));
}

function GraphChatBubble({ bubble, isOwn, zoom, displayScale, onMove }) {
  const [position, setPosition] = useState({ x: bubble.x, y: bubble.y });
  const [fadeTiming] = useState(() => {
    const now = Date.now();
    const remaining = Math.max(1, bubble.expiresAt - now);
    const untilFade = Math.max(0, bubble.createdAt + bubble.stayMs - now);
    return {
      startOpacity: untilFade > 0 ? 1 : Math.max(0, Math.min(1, remaining / Math.max(1, bubble.fadeMs))),
      duration: `${remaining}ms`,
      delay: `${Math.min(untilFade, remaining)}ms`
    };
  });
  const dragRef = useRef(null);
  const lastMoveSentRef = useRef(0);
  const pendingMoveRef = useRef(null);
  useEffect(() => {
    if (!dragRef.current) setPosition({ x: bubble.x, y: bubble.y });
  }, [bubble.x, bubble.y]);
  const sendPosition = (point) => {
    onMove?.(bubble.id, point);
    lastMoveSentRef.current = Date.now();
    pendingMoveRef.current = null;
  };
  return <div
    className={`canvas-chat-bubble ${isOwn ? 'is-own' : 'is-remote'}`}
    style={{ left: position.x, top: position.y, '--collaborator-color': bubble.color, '--chat-start-opacity': fadeTiming.startOpacity, '--chat-fade-duration': fadeTiming.duration, '--chat-fade-delay': fadeTiming.delay }}
    onPointerDown={(event) => {
      event.stopPropagation();
      if (!isOwn || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: position.x, y: position.y };
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const next = { x: drag.x + (event.clientX - drag.startX) / (displayScale * zoom), y: drag.y + (event.clientY - drag.startY) / (displayScale * zoom) };
      setPosition(next);
      pendingMoveRef.current = next;
      if (Date.now() - lastMoveSentRef.current >= 50) sendPosition(next);
    }}
    onPointerUp={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      if (pendingMoveRef.current) sendPosition(pendingMoveRef.current);
      dragRef.current = null;
    }}
    onPointerCancel={() => { if (pendingMoveRef.current) sendPosition(pendingMoveRef.current); dragRef.current = null; }}
    onContextMenu={(event) => event.stopPropagation()}
    aria-label={`${bubble.username} says ${bubble.content}`}
  >
    <span className="canvas-chat-bubble-author"><i />{bubble.username}</span>
    <span className="canvas-chat-bubble-message">{bubble.content}</span>
  </div>;
}

function RemoteCollaborationCursor({ peer }) {
  const elementRef = useRef(null);
  const displayedRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const cursor = peer.action.cursor;
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || !Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return undefined;
    const target = { x: cursor.x, y: cursor.y };
    if (!displayedRef.current) {
      displayedRef.current = target;
      element.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
      lastUpdateRef.current = Number(peer.updatedAt) || Date.now();
      return undefined;
    }
    const from = displayedRef.current;
    const serverUpdatedAt = Number(peer.updatedAt) || Date.now();
    const gap = lastUpdateRef.current ? Math.max(0, serverUpdatedAt - lastUpdateRef.current) : 70;
    const duration = Math.min(150, Math.max(55, gap * 1.15));
    lastUpdateRef.current = serverUpdatedAt;
    let frame = 0;
    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const point = { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased };
      displayedRef.current = point;
      element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
      if (progress < 1) frame = requestAnimationFrame(step);
      else { displayedRef.current = target; element.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`; }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cursor?.x, cursor?.y, peer.updatedAt]);
  const idle = peer.action.kind === 'idle' || peer.action.cursorIdle;
  return <div ref={elementRef} className={`canvas-collaborator-cursor is-${idle ? 'idle' : peer.action.mode || peer.action.kind}`} style={{ '--collaborator-color': idle ? '#858c98' : peer.color }}>
    {peer.action.mode === 'text' ? <Type size={16} strokeWidth={2.4} /> : peer.action.mode === 'cut' ? <Scissors size={16} strokeWidth={2.4} /> : ['node-drag', 'note-drag', 'library-drag', 'pan'].includes(peer.action.kind) || peer.action.mode === 'pan' ? <Hand size={17} strokeWidth={2.4} /> : <MousePointer2 size={17} strokeWidth={2.4} />}
    <span>{peer.username}</span>
    {peer.action.mode === 'chat-typing' && <span className="canvas-chat-typing-indicator" title="Typing" aria-label="Typing"><i /><i /><i /></span>}
    {peer.action.kind === 'wire-drag' && <small>Connecting</small>}
    {peer.action.kind === 'arrow-drag' && <small>Drawing arrow</small>}
    {peer.action.kind === 'node-drag' && <small>Moving {peer.action.nodeIds?.length > 1 ? `${peer.action.nodeIds.length} nodes` : 'node'}</small>}
    {peer.action.kind === 'note-drag' && <small>Moving note</small>}
    {peer.action.kind === 'node-edit' && <small>Editing node</small>}
    {peer.action.kind === 'library-drag' && <small>Adding {peer.action.label || 'node'}</small>}
    {peer.action.kind === 'studio-focus' && <small>Editing {peer.action.label || peer.action.studioType}</small>}
    {peer.action.kind === 'studio-draft' && <small>Editing {peer.action.studioType === 'text' ? 'text' : peer.action.studioType === 'arguments' ? 'command arguments' : 'embed'}</small>}
  </div>;
}

function RemoteWirePreview({ peer, computePath }) {
  const pathRef = useRef(null);
  const circleRef = useRef(null);
  const displayedRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const lastStartRef = useRef('');
  const computePathRef = useRef(computePath);
  computePathRef.current = computePath;
  const { start, cursor } = peer.action;
  useLayoutEffect(() => {
    if (!Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y) || !start) return undefined;
    const target = { x: cursor.x, y: cursor.y };
    const startKey = `${start.x}:${start.y}`;
    const sameStart = lastStartRef.current === startKey;
    if (!displayedRef.current || !sameStart) {
      displayedRef.current = target;
      lastStartRef.current = startKey;
      lastUpdateRef.current = Number(peer.updatedAt) || Date.now();
      if (pathRef.current) pathRef.current.setAttribute('d', computePathRef.current(start.x, start.y, target.x, target.y));
      if (circleRef.current) { circleRef.current.setAttribute('cx', String(target.x)); circleRef.current.setAttribute('cy', String(target.y)); }
      return undefined;
    }
    const from = displayedRef.current;
    const serverUpdatedAt = Number(peer.updatedAt) || Date.now();
    const updateGap = lastUpdateRef.current ? Math.max(0, serverUpdatedAt - lastUpdateRef.current) : 0;
    const duration = sameStart && displayedRef.current ? Math.min(125, Math.max(50, updateGap * 1.2)) : 0;
    lastStartRef.current = startKey;
    lastUpdateRef.current = serverUpdatedAt;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now) => {
      const progress = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = 1 - (1 - progress) ** 3;
      const point = { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased };
      displayedRef.current = point;
      if (pathRef.current) pathRef.current.setAttribute('d', computePathRef.current(start.x, start.y, point.x, point.y));
      if (circleRef.current) { circleRef.current.setAttribute('cx', String(point.x)); circleRef.current.setAttribute('cy', String(point.y)); }
      if (progress < 1) frame = requestAnimationFrame(step);
      else displayedRef.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [start?.x, start?.y, cursor?.x, cursor?.y, peer.updatedAt]);
  return <g className="collaboration-wire-preview" style={{ '--collaborator-color': peer.color }}>
    <path ref={pathRef} />
    <circle ref={circleRef} r="4" />
  </g>;
}

function getWireCutSegments(pathElement, event) {
  try {
    const length = pathElement.getTotalLength();
    const matrix = pathElement.getScreenCTM();
    const svg = pathElement.ownerSVGElement;
    if (!length || !matrix || !svg) return [];
    const click = svg.createSVGPoint();
    click.x = event.clientX;
    click.y = event.clientY;
    const localClick = click.matrixTransform(matrix.inverse());
    let splitAt = 0;
    let nearest = Infinity;
    const samples = 100;
    for (let index = 0; index <= samples; index += 1) {
      const distance = length * index / samples;
      const point = pathElement.getPointAtLength(distance);
      const delta = (point.x - localClick.x) ** 2 + (point.y - localClick.y) ** 2;
      if (delta < nearest) { nearest = delta; splitAt = distance; }
    }
    const buildSegment = (from, to, step) => {
      const points = [];
      for (let distance = from; step > 0 ? distance <= to : distance >= to; distance += step) {
        points.push(pathElement.getPointAtLength(Math.max(0, Math.min(length, distance))));
      }
      points.push(pathElement.getPointAtLength(to));
      const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
      const pathLength = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
      return { d, length: pathLength + 1 };
    };
    const stride = Math.max(length / 36, 1);
    return [buildSegment(splitAt, 0, -stride), buildSegment(splitAt, length, stride)].filter((segment) => segment.d && segment.length > 1);
  } catch { return []; }
}

export function NodeCanvas({
  nodes: suppliedNodes = [], connections: suppliedConnections = [], graphId = '', projectId = '', focusRequest = null, followRequest = null, onFollowComplete, activePulseNodeIds = [], debugStep = null, onDebugAction, settings = {}, isLocked = false, canvasLocked = isLocked, canWriteGraphs = true, desktopMode = false, shortcutPlatform = 'windows', authToken = '', graphName = 'Untitled graph',
  tagGroups = [], notes = [], arrows = [], transientArrows = [], currentUser = null, projectOwnerId = '', noteEditLocks = {}, collaborationOnline = false, collaborationReady = false, collaborationMotionSupported = false, collaborationClientId = '', onRequestNoteEditLock, onReleaseNoteEditLock, onNotesChange, onArrowsChange, onCanvasArrowAction, onTagGroupsChange, onRequestCreateTagGroup, onRequestEditTagGroup, onRenameNode,
  graphVariables = [], functionGraphs = [], callableGraphs = functionGraphs, appEmojis = [], nodeDefinitions = BuiltInNodeDefinitions, nodeDefinitionsReady = false, onNodesChange, onConnectionsChange, onOpenPalette, onViewportCenterChange, onSelectedNodeChange, onSelectedNodeCountChange, onOpenLibrary, onOpenVariables,
  onHistoryGroupStart, onHistoryGroupEnd, onNodeDrop, onSaveNodePrefab, onOpenEmbedStudio, onOpenTextStudio, onOpenPermissionStudio, onOpenSlashCommandStudio, onOpenModalStudio, onOpenFunctionGraph, remoteActions = [], onCollaborationAction,
  graphChatEnabled = false, graphChatBubbles = [], onSendGraphChat, onMoveGraphChatBubble
}) {
  const previousNodesRef = useRef([]);
  const nodes = useMemo(() => {
    const next = Array.isArray(suppliedNodes) ? suppliedNodes.filter((node) => node && typeof node === 'object' && typeof node.type === 'string') : [];
    const previous = previousNodesRef.current;
    if (previous.length === next.length && previous.every((node, index) => equalDefinitionValue(node, next[index]))) return previous;
    previousNodesRef.current = next;
    return next;
  }, [suppliedNodes]);
  const previousConnectionsRef = useRef([]);
  const connections = useMemo(() => {
    const next = Array.isArray(suppliedConnections) ? suppliedConnections.filter((connection) => connection && typeof connection === 'object') : [];
    const previous = previousConnectionsRef.current;
    if (previous.length === next.length && previous.every((connection, index) => equalDefinitionValue(connection, next[index]))) return previous;
    previousConnectionsRef.current = next;
    return next;
  }, [suppliedConnections]);
  const graphVariablesRef = useRef({ value: graphVariables });
  const canvasGraphVariables = useMemo(() => {
    const previous = graphVariablesRef.current;
    if (equalDefinitionValue(previous.value, graphVariables)) return previous.value;
    graphVariablesRef.current = { value: graphVariables };
    return graphVariables;
  }, [graphVariables]);
  const functionGraphDefinitionViewsRef = useRef({ signature: '', value: [] });
  const functionGraphDefinitionViews = useMemo(() => {
    const availableFunctionGraphs = Array.isArray(functionGraphs) ? functionGraphs : [];
    const availableCallableGraphs = Array.isArray(callableGraphs) ? callableGraphs : [];
    const source = availableFunctionGraphs.length ? availableFunctionGraphs : availableCallableGraphs.filter((graph) => graph.graphType === 'function');
    const signatureData = source.map((graph) => ({
      id: graph.id,
      name: graph.name,
      nodes: (graph.nodes || []).filter((node) => node.type === 'function_input' || node.type === 'function_return').map((node) => node.type === 'function_input'
        ? [node.id, node.type, getFunctionInputArguments(node)]
        : [node.id, node.type, node.data?.valueType])
    }));
    const signature = JSON.stringify(signatureData);
    const previous = functionGraphDefinitionViewsRef.current;
    if (signature === previous.signature) return previous.value;
    const value = source.map((graph) => ({
      id: graph.id,
      name: graph.name,
      graphType: 'function',
      nodes: (graph.nodes || []).filter((node) => node.type === 'function_input' || node.type === 'function_return')
    }));
    functionGraphDefinitionViewsRef.current = { signature, value };
    return value;
  }, [functionGraphs, callableGraphs]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const previousNodePositionsRef = useRef(new Map());
  const nodePositionById = useMemo(() => {
    const previous = previousNodePositionsRef.current;
    const positions = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const unchanged = previous.size === positions.size && [...positions].every(([id, position]) => {
      const oldPosition = previous.get(id);
      return oldPosition?.x === position.x && oldPosition?.y === position.y;
    });
    if (unchanged) return previous;
    previousNodePositionsRef.current = positions;
    return positions;
  }, [nodes]);
  const nodeLayoutCacheKey = `${projectId}:${graphId}`;
  const nodeWorldSizeCacheRef = useRef({ key: nodeLayoutCacheKey, sizes: new Map() });
  if (nodeWorldSizeCacheRef.current.key !== nodeLayoutCacheKey) nodeWorldSizeCacheRef.current = { key: nodeLayoutCacheKey, sizes: new Map() };
  const nodeDefinitionInputsRef = useRef({ token: {}, entries: new Map() });
  const nodeDefinitionInputsToken = useMemo(() => {
    const previous = nodeDefinitionInputsRef.current;
    const unchanged = previous.entries.size === nodes.length && nodes.every((node) => {
      const entry = previous.entries.get(node.id);
      return entry?.type === node.type && entry?.label === node.label && equalDefinitionValue(entry.data, node.data);
    });
    if (unchanged) return previous.token;
    const entries = new Map(nodes.map((node) => [node.id, { type: node.type, label: node.label, data: node.data }]));
    for (const [id, entry] of previous.entries) {
      const next = entries.get(id);
      if (!next || next.type !== entry.type || next.label !== entry.label || !equalDefinitionValue(next.data, entry.data)) nodeWorldSizeCacheRef.current.sizes.delete(id);
    }
    for (const id of entries.keys()) if (!previous.entries.has(id)) nodeWorldSizeCacheRef.current.sizes.delete(id);
    const token = {};
    nodeDefinitionInputsRef.current = { token, entries };
    return token;
  }, [nodes]);
  const nodeCardIdsRef = useRef({ token: {}, ids: [] });
  const nodeCardIdsToken = useMemo(() => {
    const previous = nodeCardIdsRef.current;
    if (previous.ids.length === nodes.length && previous.ids.every((id, index) => id === nodes[index].id)) return previous.token;
    const token = {};
    nodeCardIdsRef.current = { token, ids: nodes.map((node) => node.id) };
    return token;
  }, [nodes]);
  const definitionNodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodeDefinitionInputsToken]);
  const nodeConnectionsById = useMemo(() => {
    const byNode = new Map();
    const ensure = (id) => {
      let entry = byNode.get(id);
      if (!entry) { entry = { incoming: [], outgoing: [], incident: [] }; byNode.set(id, entry); }
      return entry;
    };
    for (const connection of connections) {
      const outgoing = ensure(connection.sourceNodeId);
      const incoming = ensure(connection.targetNodeId);
      outgoing.outgoing.push(connection);
      outgoing.incident.push(connection);
      incoming.incoming.push(connection);
      if (incoming !== outgoing) incoming.incident.push(connection);
    }
    return byNode;
  }, [connections]);
  const connectionByNodePin = useMemo(() => {
    const incoming = new Map();
    const outgoing = new Map();
    for (const connection of connections) {
      let targetPins = incoming.get(connection.targetNodeId);
      if (!targetPins) { targetPins = new Map(); incoming.set(connection.targetNodeId, targetPins); }
      if (!targetPins.has(connection.targetPinId)) targetPins.set(connection.targetPinId, connection);
      let sourcePins = outgoing.get(connection.sourceNodeId);
      if (!sourcePins) { sourcePins = new Map(); outgoing.set(connection.sourceNodeId, sourcePins); }
      if (!sourcePins.has(connection.sourcePinId)) sourcePins.set(connection.sourcePinId, connection);
    }
    return { incoming, outgoing };
  }, [connections]);
  const shortcutModifier = shortcutPlatform === 'macos' ? '⌘' : 'Ctrl';
  const containerRef = useRef(null);
  const visibleNodeIdsCacheRef = useRef(null);
  const visibleWireIdsCacheRef = useRef(null);
  const canvasRenderVersionRef = useRef(0);
  const pointerMoveFrameRef = useRef(0);
  const pendingPointerMoveRef = useRef(null);
  const pointerMoveHandlerRef = useRef(null);
  const canvasInteractionActiveRef = useRef(false);
  const pinDoubleClickRef = useRef(null);
  const pendingPinDragRef = useRef(null);
  const frameTimingRef = useRef({ last: 0, samples: 0, slow: 0, fast: 0 });
  const canvasWorldRef = useRef(null);
  const autoPanFrameTimeRef = useRef(0);
  const [performanceReduced, setPerformanceReduced] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    const lowMemory = Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4;
    const fewCores = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
    return lowMemory || fewCores;
  });
  const canvasQualityMode = ['auto', 'fast', 'optimal', 'quality'].includes(settings.canvasQuality) ? settings.canvasQuality : 'auto';
  const canvasQualityModeRef = useRef(canvasQualityMode);
  canvasQualityModeRef.current = canvasQualityMode;
  const performanceReducedRef = useRef(performanceReduced);
  performanceReducedRef.current = performanceReduced;
  canvasRenderVersionRef.current += 1;
  const socketPositionCacheRef = useRef({ renderVersion: -1, positions: new Map() });
  const handledFocusRequestRef = useRef(null);
  const viewportGraphKey = graphId ? `arc_project_${projectId || 'default'}_arc_canvas_view_${graphId}` : '';
  const viewportGraphKeyRef = useRef(viewportGraphKey);
  const [pan, setPan] = useState({ x: 22, y: 18 });
  const [zoom, setZoom] = useState(1);
  const [canvasFindOpen, setCanvasFindOpen] = useState(false);
  const [canvasFindQuery, setCanvasFindQuery] = useState('');
  const [canvasFindCaseSensitive, setCanvasFindCaseSensitive] = useState(false);
  const [canvasFindWholeWord, setCanvasFindWholeWord] = useState(false);
  const [canvasFindRegex, setCanvasFindRegex] = useState(false);
  const [canvasFindIndex, setCanvasFindIndex] = useState(-1);
  const canvasFindInputRef = useRef(null);
  const viewportRef = useRef({ pan, zoom });
  const [isPanning, setIsPanning] = useState(false);
  viewportRef.current = { pan: isPanning ? viewportRef.current.pan : pan, zoom };
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);
  const [selectedArrowIds, setSelectedArrowIds] = useState([]);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [deleteConfirmationIds, setDeleteConfirmationIds] = useState(null);
  const [deleteConfirmationNoteIds, setDeleteConfirmationNoteIds] = useState([]);
  const [deleteConfirmationArrowIds, setDeleteConfirmationArrowIds] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const draggingNodeRef = useRef(draggingNode);
  draggingNodeRef.current = draggingNode;
  const [draggingNote, setDraggingNote] = useState(null);
  const [draggingArrows, setDraggingArrows] = useState(null);
  const [drawingArrow, setDrawingArrow] = useState(null);
  const [localTransientArrows, setLocalTransientArrows] = useState([]);
  const [arrowClock, setArrowClock] = useState(Date.now());
  const observedArrowSourcesRef = useRef(new Map());
  const [focusedNote, setFocusedNote] = useState(null);
  const [graphChatComposerOpen, setGraphChatComposerOpen] = useState(false);
  const [graphChatDraft, setGraphChatDraft] = useState('');
  const [graphChatAnchor, setGraphChatAnchor] = useState(null);
  const graphChatComposerRef = useRef(null);
  const graphChatInputRef = useRef(null);
  const graphChatTypingRef = useRef(false);
  const graphChatTypingTimerRef = useRef(null);
  const [noteLockClock, setNoteLockClock] = useState(Date.now());
  const focusedNoteRef = useRef(null);
  const noteEditHistoryRef = useRef(null);
  const collaborationRoomKey = `${projectId}:${graphId}`;
  const focusedNoteId = focusedNote?.roomKey === collaborationRoomKey ? focusedNote.noteId : '';
  const focusedNoteLock = focusedNoteId ? noteEditLocks[focusedNoteId] : null;
  const ownsFocusedNoteLock = Boolean(focusedNoteLock && focusedNoteLock.userId === currentUser?.id && focusedNoteLock.clientId === collaborationClientId);
  const userRank = { viewer: 1, operator: 2, editor: 3, admin: 4, owner: 5 };
  const mayManageArrow = (arrow) => !arrow.locked || Boolean(canWriteGraphs && currentUser && (
    arrow.createdById === currentUser.id
    || currentUser.id === projectOwnerId
    || (userRank[String(currentUser.role || '').toLowerCase()] || 0) > (userRank[String(arrow.createdByRole || 'viewer').toLowerCase()] || 0)
  ));
  const mayEditNote = (note) => !note.locked || Boolean(currentUser && (
    (note.createdById && currentUser.id && note.createdById === currentUser.id)
    || (note.createdBy && currentUser.username && note.createdBy.toLocaleLowerCase() === currentUser.username.toLocaleLowerCase())
    || (userRank[String(currentUser.role || '').toLowerCase()] || 0) > (userRank[String(note.createdByRole || 'viewer').toLowerCase()] || 0)
  ));
  const focusedNoteRecord = focusedNoteId ? notes.find((note) => note.id === focusedNoteId) : null;
  const canRequestFocusedNoteLock = Boolean(focusedNoteRecord && !isLocked && mayEditNote(focusedNoteRecord));
  const canvasArrows = useMemo(() => {
    const byId = new Map();
    for (const arrow of transientArrows) if (arrow?.id && arrow.start && arrow.end) byId.set(arrow.id, arrow);
    for (const arrow of localTransientArrows) if (arrow?.id && arrow.start && arrow.end) byId.set(arrow.id, arrow);
    for (const arrow of arrows) if (arrow?.locked && arrow.id && arrow.start && arrow.end) byId.set(arrow.id, arrow);
    return [...byId.values()].filter((arrow) => !arrow.hidden);
  }, [arrows, transientArrows, localTransientArrows]);

  useEffect(() => {
    setLocalTransientArrows([]);
    setSelectedArrowIds([]);
    if (drawingArrow) onCollaborationAction?.({ kind: 'cursor', cursor: drawingArrow.end, mode: 'move', selectedNodeIds }, true);
    setDrawingArrow(null);
    setDraggingArrows(null);
  }, [graphId, projectId]);
  useEffect(() => {
    if (!canvasArrows.length && !localTransientArrows.length) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setArrowClock(now);
      setLocalTransientArrows((previous) => previous.filter((arrow) => arrow.expiresAt > now));
    }, 100);
    return () => window.clearInterval(timer);
  }, [canvasArrows.length, localTransientArrows.length]);
  useEffect(() => {
    const acknowledged = new Set(transientArrows.map((arrow) => arrow?.clientActionId).filter(Boolean));
    if (!acknowledged.size) return;
    setLocalTransientArrows((previous) => previous.filter((arrow) => !acknowledged.has(arrow.clientActionId)));
  }, [transientArrows]);
  useEffect(() => {
    const current = new Map([
      ...transientArrows.filter((arrow) => arrow?.id && arrow.start && arrow.end).map((arrow) => [arrow.id, arrow]),
      ...arrows.filter((arrow) => arrow?.locked && arrow.id && arrow.start && arrow.end).map((arrow) => [arrow.id, arrow])
    ]);
    const previous = observedArrowSourcesRef.current;
    const removed = [...previous].filter(([id]) => !current.has(id)).map(([, arrow]) => arrow);
    observedArrowSourcesRef.current = current;
    if (removed.length) {
      const now = Date.now();
      const removedIds = new Set(removed.map((arrow) => arrow.id));
      setLocalTransientArrows((existing) => {
        const hiddenIds = new Set(existing.filter((arrow) => arrow.hidden).map((arrow) => arrow.id));
        return [
          ...existing.filter((arrow) => hiddenIds.has(arrow.id) || !removedIds.has(arrow.id)),
          ...removed.filter((arrow) => !hiddenIds.has(arrow.id)).map((arrow) => ({ ...arrow, removing: true, expiresAt: now + 220 }))
        ];
      });
    }
  }, [arrows, transientArrows]);
  useEffect(() => {
    const activeIds = new Set(canvasArrows.filter((arrow) => !arrow.removing).map((arrow) => arrow.id));
    setSelectedArrowIds((previous) => {
      const next = previous.filter((id) => activeIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [canvasArrows]);
  useEffect(() => {
    setGraphChatComposerOpen(false);
    setGraphChatDraft('');
    setGraphChatAnchor(null);
    graphChatTypingRef.current = false;
    window.clearTimeout(graphChatTypingTimerRef.current);
    graphChatTypingTimerRef.current = null;
  }, [graphChatEnabled, collaborationReady, graphId, projectId]);
  useEffect(() => {
    if (!graphChatComposerOpen) return undefined;
    const frame = window.requestAnimationFrame(() => graphChatInputRef.current?.focus());
    const closeOnOutsidePointer = (event) => {
      if (graphChatComposerRef.current?.contains(event.target)) return;
      clearGraphChatTyping();
      setGraphChatComposerOpen(false);
      setGraphChatDraft('');
      setGraphChatAnchor(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    const removePageBlurListener = onPageBlur(() => {
      clearGraphChatTyping();
      setGraphChatComposerOpen(false);
      setGraphChatDraft('');
      setGraphChatAnchor(null);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      removePageBlurListener();
      window.clearTimeout(graphChatTypingTimerRef.current);
    };
  }, [graphChatComposerOpen]);

  useEffect(() => {
    if (!Object.keys(noteEditLocks).length) return undefined;
    const timer = window.setInterval(() => setNoteLockClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [noteEditLocks]);

  useEffect(() => {
    if (!focusedNoteId || !canRequestFocusedNoteLock || !collaborationOnline || !collaborationReady) return undefined;
    const requestWhileFocused = () => {
      if (focusedNoteRef.current?.roomKey === collaborationRoomKey && focusedNoteRef.current.noteId === focusedNoteId) onRequestNoteEditLock?.(focusedNoteId);
    };
    if (!focusedNoteLock) {
      requestWhileFocused();
      const retry = window.setInterval(requestWhileFocused, 1000);
      return () => window.clearInterval(retry);
    }
    if (!ownsFocusedNoteLock) return undefined;
    const renewal = window.setInterval(requestWhileFocused, 5000);
    return () => window.clearInterval(renewal);
  }, [canRequestFocusedNoteLock, collaborationOnline, collaborationReady, collaborationRoomKey, focusedNoteId, focusedNoteLock?.clientId, focusedNoteLock?.expiresAt, focusedNoteLock?.userId, onRequestNoteEditLock, ownsFocusedNoteLock]);

  useEffect(() => { onSelectedNodeChange?.(selectedNodeId || null); }, [onSelectedNodeChange, selectedNodeId]);
  useEffect(() => { onSelectedNodeCountChange?.(selectedNodeIds.length); }, [onSelectedNodeCountChange, selectedNodeIds.length]);
  useEffect(() => {
    const noteIds = new Set(notes.map((note) => note.id));
    setSelectedNoteIds((current) => {
      const filtered = current.filter((id) => noteIds.has(id));
      return filtered.length === current.length ? current : filtered;
    });
  }, [notes]);
  useEffect(() => () => {
    if (noteEditHistoryRef.current?.historyStarted) onHistoryGroupEnd?.();
  }, [graphId, onHistoryGroupEnd]);
  const [libraryDragPreview, setLibraryDragPreview] = useState(null);
  const [wireLayoutRevision, refreshWireLayout] = useState(0);
  const [nodeBoundsRevision, refreshNodeBounds] = useState(0);
  const nodeMeasurementInputsRef = useRef({ nodes, zoom });
  nodeMeasurementInputsRef.current = { nodes, zoom };
  const measureVisibleNodeCards = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { nodes: currentNodes, zoom: currentZoom } = nodeMeasurementInputsRef.current;
    const scale = getCanvasDisplayScale(container) * currentZoom;
    if (!(scale > 0)) return;
    const actualNodeIds = new Set(currentNodes.map((node) => node.id));
    const sizes = nodeWorldSizeCacheRef.current.sizes;
    let changed = false;
    for (const card of container.querySelectorAll('[data-node-card-id]')) {
      const rect = card.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) continue;
      const id = card.dataset.nodeCardId;
      if (!actualNodeIds.has(id)) continue;
      const next = {
        width: Math.round(rect.width / scale * 100) / 100,
        height: Math.round(rect.height / scale * 100) / 100
      };
      const previous = sizes.get(id);
      if (!previous || Math.abs(previous.width - next.width) > 0.5 || Math.abs(previous.height - next.height) > 0.5) {
        sizes.set(id, next);
        changed = true;
      }
    }
    for (const id of sizes.keys()) if (!actualNodeIds.has(id)) sizes.delete(id);
    if (changed) refreshNodeBounds((revision) => revision + 1);
  }, []);
  const [connectingWire, setConnectingWire] = useState(null);
  canvasInteractionActiveRef.current = Boolean(isPanning || draggingNode || draggingNote || connectingWire || selectionBox);
  const connectingWireRef = useRef(connectingWire);
  connectingWireRef.current = connectingWire;
  const [wireCutAnimations, setWireCutAnimations] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [viewportSectionId, setViewportSectionId] = useState(null);
  const [shakingNodeId, setShakingNodeId] = useState(null);
  const clipboardRef = useRef(null);
  const pointerPositionRef = useRef(null);
  const touchPointersRef = useRef(new Map());
  const touchPinchRef = useRef(null);
  const lastPastePositionRef = useRef(null);
  const pasteCascadeRef = useRef(0);
  const uiScale = getArcUiScale();
  const contextMenuRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const wireCutTimersRef = useRef(new Map());
  const panStartRef = useRef({ x: 0, y: 0 });
  const selectionStartRef = useRef(null);
  const rightPanMovedRef = useRef(false);
  const rightPanOriginRef = useRef(null);
  const collaborationCursorRef = useRef(null);
  const applyPanDuringGesture = (nextPan) => {
    viewportRef.current = { ...viewportRef.current, pan: nextPan };
    if (canvasWorldRef.current) {
      canvasWorldRef.current.style.transform = `translate3d(${nextPan.x}px, ${nextPan.y}px, 0) scale(${viewportRef.current.zoom})`;
    }
    containerRef.current?.style.setProperty('--grid-x', `${nextPan.x}px`);
    containerRef.current?.style.setProperty('--grid-y', `${nextPan.y}px`);
    if (Math.hypot(nextPan.x - pan.x, nextPan.y - pan.y) >= PAN_CULL_REFRESH_DISTANCE) setPan(nextPan);
  };
  useEffect(() => { collaborationCursorRef.current = null; }, [graphId]);
  const reportGraphChatCursorMode = (mode) => {
    let cursor = collaborationCursorRef.current;
    const pointer = pointerPositionRef.current;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (pointer && bounds) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      cursor = {
        x: ((pointer.x - bounds.left) / displayScale - viewportRef.current.pan.x) / viewportRef.current.zoom,
        y: ((pointer.y - bounds.top) / displayScale - viewportRef.current.pan.y) / viewportRef.current.zoom
      };
      collaborationCursorRef.current = cursor;
    }
    if (cursor) onCollaborationAction?.({ kind: 'cursor', cursor, mode, selectedNodeIds }, true);
  };
  const updateGraphChatTyping = (value) => {
    window.clearTimeout(graphChatTypingTimerRef.current);
    graphChatTypingTimerRef.current = null;
    const typing = Boolean(String(value || '').trim());
    graphChatTypingRef.current = typing;
    reportGraphChatCursorMode(typing ? 'chat-typing' : 'move');
    if (typing) {
      graphChatTypingTimerRef.current = window.setTimeout(() => {
        graphChatTypingTimerRef.current = null;
        graphChatTypingRef.current = false;
        reportGraphChatCursorMode('move');
      }, 5000);
    }
  };
  const clearGraphChatTyping = () => {
    window.clearTimeout(graphChatTypingTimerRef.current);
    graphChatTypingTimerRef.current = null;
    graphChatTypingRef.current = false;
    reportGraphChatCursorMode('move');
  };
  const spaceDownRef = useRef(false);
  const altDownRef = useRef(false);
  const cancelConnectingWire = useCallback(() => {
    const current = connectingWireRef.current;
    if (current?.originalConnection && !current.clickToConnect) onConnectionsChange?.([...connections.filter((item) => item.id !== current.originalConnection.id), current.originalConnection]);
    setConnectingWire(null);
  }, [connections, onConnectionsChange]);
  const snapToGrid = settings.snapToGrid ?? true;
  const wireStyle = settings.wireStyle || 'bezier';
  const wirePulse = settings.wirePulse ?? true;
  const reduceWireColorNoise = nodes.length >= LARGE_GRAPH_NODE_LIMIT || connections.length >= LARGE_GRAPH_WIRE_LIMIT;
  const denseWiring = connections.length >= 14;
  const wireFanout = useMemo(() => {
    const counts = new Map();
    const orders = new Map();
    const indices = new Map();
    connections.forEach((connection, index) => {
      const key = `${connection.sourceNodeId}:${connection.sourcePinId}`;
      const order = counts.get(key) || 0;
      orders.set(connection.id, order);
      indices.set(connection.id, index);
      counts.set(key, order + 1);
    });
    return { counts, orders, indices };
  }, [connections]);
  const activePulseNodeSet = useMemo(() => new Set(activePulseNodeIds), [activePulseNodeIds]);

  useLayoutEffect(() => {
    viewportGraphKeyRef.current = viewportGraphKey;
    if (!viewportGraphKey) { setPan({ x: 22, y: 18 }); setZoom(1); return; }
    try {
      const saved = JSON.parse(readAppStorage(viewportGraphKey) || 'null');
      const valid = Number.isFinite(saved?.pan?.x) && Number.isFinite(saved?.pan?.y) && Number.isFinite(saved?.zoom);
      setPan(valid ? saved.pan : { x: 22, y: 18 });
      setZoom(valid ? clamp(saved.zoom, 0.25, 2.5) : 1);
    } catch { setPan({ x: 22, y: 18 }); setZoom(1); }
  }, [viewportGraphKey]);

  useEffect(() => {
    if (!viewportGraphKeyRef.current) return;
    const timer = window.setTimeout(() => writeAppStorage(viewportGraphKeyRef.current, JSON.stringify(viewportRef.current)), 120);
    return () => window.clearTimeout(timer);
  }, [pan, zoom]);

  useLayoutEffect(() => {
    const publishCenter = () => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const displayScale = getCanvasDisplayScale(containerRef.current);
      onViewportCenterChange?.({
        x: Math.round((bounds.width / displayScale / 2 - pan.x) / zoom),
        y: Math.round((bounds.height / displayScale / 2 - pan.y) / zoom)
      });
    };
    publishCenter();
    const observer = typeof ResizeObserver === 'function' && containerRef.current ? new ResizeObserver(publishCenter) : null;
    if (observer && containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', publishCenter);
    return () => { observer?.disconnect(); window.removeEventListener('resize', publishCenter); };
  }, [pan, zoom, onViewportCenterChange]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (canvasFindOpen && event.key === 'Escape') return;
      if (event.key === 'Shift') setShiftHeld(true);
      if (event.key === 'Alt') altDownRef.current = true;
      const shortcutBlocked = isTextTarget(event.target) || (event.target instanceof HTMLElement && Boolean(event.target.closest('[role="dialog"]')));
      if (event.code === 'Space' && !event.repeat && !shortcutBlocked) spaceDownRef.current = true;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'a' && !shortcutBlocked) {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          const viewport = containerRef.current?.getBoundingClientRect();
          const visibleIds = [...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])]
            .filter((card) => {
              const rect = card.getBoundingClientRect();
              return viewport && rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom;
            })
            .map((card) => card.dataset.nodeCardId);
          selectNodes(visibleIds);
          const visibleNoteIds = [...(containerRef.current?.querySelectorAll('[data-note-id]') || [])]
            .filter((card) => {
              const rect = card.getBoundingClientRect();
              return viewport && rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom;
            })
            .map((card) => card.dataset.noteId);
          const visibleArrowIds = [...(containerRef.current?.querySelectorAll('[data-arrow-id]') || [])]
            .filter((path) => {
              const rect = path.getBoundingClientRect();
              return viewport && rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom;
            })
            .map((path) => path.dataset.arrowId);
          setSelectedNoteIds(visibleNoteIds);
          setSelectedArrowIds(visibleArrowIds);
          onCollaborationAction?.({ kind: 'selection', selectedNodeIds: visibleIds, selectedNoteIds: visibleNoteIds, selectedArrowIds: visibleArrowIds });
        } else {
          const allNodeIds = nodes.map((node) => node.id);
          const allNoteIds = notes.map((note) => note.id);
          const allArrowIds = canvasArrows.map((arrow) => arrow.id);
          selectNodes(allNodeIds);
          setSelectedNoteIds(allNoteIds);
          setSelectedArrowIds(allArrowIds);
          onCollaborationAction?.({ kind: 'selection', selectedNodeIds: allNodeIds, selectedNoteIds: allNoteIds, selectedArrowIds: allArrowIds });
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !shortcutBlocked
        && ((!isLocked && (selectedNodeIds.length || selectedNoteIds.length)) || (!canvasLocked && selectedArrowIds.length))) {
        event.preventDefault();
        deleteSelectedItems(isLocked ? [] : selectedNodeIds, isLocked ? [] : selectedNoteIds, false, selectedArrowIds);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selectedNodeIds.length && !shortcutBlocked) {
        event.preventDefault();
        copyNodes(selectedNodeIds);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && clipboardRef.current && !shortcutBlocked && !isLocked) {
        event.preventDefault();
        pasteNodes();
      }
      if (!shortcutBlocked && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (event.key === '/' && graphChatEnabled && collaborationReady && graphId && !graphChatComposerOpen && !contextMenu && !textInputPopupOpen()) {
          const bounds = containerRef.current?.getBoundingClientRect();
          if (!bounds) return;
          const pointer = pointerPositionRef.current;
          const inside = pointer && pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom;
          if (!inside && !(event.target instanceof Node && containerRef.current?.contains(event.target))) return;
          const displayScale = getCanvasDisplayScale(containerRef.current);
          const position = inside
            ? { x: Math.round(((pointer.x - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((pointer.y - bounds.top) / displayScale - pan.y) / zoom) }
            : { x: Math.round((bounds.width / displayScale / 2 - pan.x) / zoom), y: Math.round((bounds.height / displayScale / 2 - pan.y) / zoom) };
          event.preventDefault();
          event.stopPropagation();
          setGraphChatAnchor(position);
          setGraphChatDraft('');
          setGraphChatComposerOpen(true);
        } else if (shortcutMatches(event, settings.shortcuts?.addNote || DEFAULT_SHORTCUTS.addNote) && !isLocked) {
          event.preventDefault();
          const bounds = containerRef.current?.getBoundingClientRect();
          const pointer = pointerPositionRef.current;
          const displayScale = getCanvasDisplayScale(containerRef.current);
          const position = bounds && pointer && pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom
            ? { x: Math.round(((pointer.x - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((pointer.y - bounds.top) / displayScale - pan.y) / zoom) }
            : bounds ? { x: Math.round((bounds.width / displayScale / 2 - pan.x) / zoom), y: Math.round((bounds.height / displayScale / 2 - pan.y) / zoom) } : { x: 100, y: 100 };
          addNote(position);
        } else if (key === 'f' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          setContextMenu(null);
          fitView();
        } else if (key === 'g' && event.shiftKey && !isLocked) {
          const note = notes.find((item) => item.id === contextMenu?.noteId);
          const ids = contextMenu?.nodeIds?.length ? contextMenu.nodeIds : selectedNodeIds;
          if ((note && mayEditNote(note)) || (!note && ids.length)) {
            event.preventDefault();
            onRequestCreateTagGroup?.(note ? [] : ids, note ? [note.id] : undefined);
            setContextMenu(null);
          }
        }
      }
      if (event.key === 'Escape') {
        if (connectingWire) cancelConnectingWire();
        if (drawingArrow) onCollaborationAction?.({ kind: 'cursor', cursor: drawingArrow.end, mode: 'move', selectedNodeIds }, true);
        setDrawingArrow(null);
        setDraggingArrows(null);
      }
    };
    const onKeyUp = (event) => {
      if (event.code === 'Space') spaceDownRef.current = false;
      if (event.key === 'Shift') setShiftHeld(false);
      if (event.key === 'Alt') altDownRef.current = false;
    };
    const onBlur = () => { spaceDownRef.current = false; altDownRef.current = false; setShiftHeld(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [selectedNodeId, selectedNodeIds, selectedNoteIds, selectedArrowIds, canvasArrows, connectingWire, drawingArrow, isLocked, canvasLocked, nodes, connections, onOpenPalette, cancelConnectingWire, pan, zoom, notes, contextMenu, onRequestCreateTagGroup, currentUser, onNotesChange, onCollaborationAction, graphChatEnabled, collaborationReady, graphId, graphChatComposerOpen, canvasFindOpen, settings.shortcuts?.addNote]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    if (isPanning) setPan(viewportRef.current.pan);
    setIsPanning(false);
    rightPanOriginRef.current = null;
    const close = (event) => {
      if (event.target instanceof Node && contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKeyDown);
    const removePageBlurListener = onPageBlur(() => setContextMenu(null));
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKeyDown);
      removePageBlurListener();
    };
  }, [contextMenu, isPanning, uiScale]);

  useEffect(() => () => {
    window.clearTimeout(shakeTimerRef.current);
    for (const timer of wireCutTimersRef.current.values()) window.clearTimeout(timer);
    wireCutTimersRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!contextMenu || !menu) return;
    const bounds = menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - bounds.width - 8));
    const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - bounds.height - 8));
    if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu((current) => current ? { ...current, x, y } : current);
  }, [contextMenu, uiScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => {
      const menuOpen = Boolean(document.querySelector('.canvas-context-menu, .arc-dropdown.is-open'));
      if (menuOpen) {
        if (event.target instanceof Element && event.target.closest('.arc-dropdown')) return;
        event.preventDefault();
        return;
      }
      let scrollArea = event.target instanceof Element ? event.target : null;
      while (scrollArea && scrollArea !== container) {
        const style = window.getComputedStyle(scrollArea);
        const vertical = ['auto', 'scroll'].includes(style.overflowY) && scrollArea.scrollHeight > scrollArea.clientHeight;
        const horizontal = ['auto', 'scroll'].includes(style.overflowX) && scrollArea.scrollWidth > scrollArea.clientWidth;
        const canScrollY = event.deltaY !== 0 && vertical && (event.deltaY < 0 ? scrollArea.scrollTop > 0 : scrollArea.scrollTop + scrollArea.clientHeight < scrollArea.scrollHeight - 1);
        const canScrollX = event.deltaX !== 0 && horizontal && (event.deltaX < 0 ? scrollArea.scrollLeft > 0 : scrollArea.scrollLeft + scrollArea.clientWidth < scrollArea.scrollWidth - 1);
        if ((canScrollY || canScrollX) && !event.ctrlKey && !event.metaKey && !event.shiftKey) return;
        scrollArea = scrollArea.parentElement;
      }
      if (textInputPopupOpen()) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const zoomWithWheel = settings.zoomCanvasWithScroll && !event.shiftKey;
      if (event.ctrlKey || event.metaKey || zoomWithWheel) {
        const rect = container.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(container);
        const cursorX = (event.clientX - rect.left) / displayScale;
        const cursorY = (event.clientY - rect.top) / displayScale;
        const factor = Math.exp(-(event.deltaY / displayScale) * 0.006);
        setZoom((currentZoom) => {
          const nextZoom = clamp(currentZoom * factor, 0.25, 2.5);
          setPan((currentPan) => {
            const nextPan = {
              x: cursorX - ((cursorX - currentPan.x) / currentZoom) * nextZoom,
              y: cursorY - ((cursorY - currentPan.y) / currentZoom) * nextZoom
            };
            panStartRef.current = {
              x: event.clientX / displayScale - nextPan.x,
              y: event.clientY / displayScale - nextPan.y
            };
            return nextPan;
          });
          return nextZoom;
        });
      } else if (event.shiftKey) {
        const displayScale = getCanvasDisplayScale(container);
        setPan((current) => ({ x: current.x - event.deltaY / displayScale, y: current.y }));
      } else {
        const displayScale = getCanvasDisplayScale(container);
        setPan((current) => ({ x: current.x - event.deltaX / displayScale, y: current.y - event.deltaY / displayScale }));
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [settings.zoomCanvasWithScroll]);

  useEffect(() => {
    const validIds = selectedNodeIds.filter((id) => nodes.some((node) => node.id === id));
    if (validIds.length !== selectedNodeIds.length) setSelectedNodeIds(validIds);
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) setSelectedNodeId(validIds[0] || null);
  }, [nodes, selectedNodeId, selectedNodeIds]);

  const definitionsByType = useMemo(() => new Map(nodeDefinitions.map((definition) => [definition.type, definition])), [nodeDefinitions]);
  useEffect(() => {
    if (!nodeDefinitionsReady) return;
    for (const type of new Set(nodes.map((node) => node.type))) {
      if ((!definitionsByType.has(type) || definitionsByType.get(type)?.loadFailed) && !warnedFailedNodeTypes.has(type)) {
        warnedFailedNodeTypes.add(type);
        console.warn(`Failed to load node "${type}".`);
      }
    }
  }, [definitionsByType, nodeDefinitionsReady, nodes]);
  const modalFieldOptions = useMemo(() => nodes.flatMap((modalNode) => {
    if (modalNode.type !== 'build_modal') return [];
    const modal = modalNode.data?.modal || {};
    return (modal.components || []).filter((field) => field.customId).map((field) => ({
      value: field.customId,
      label: `${modal.title || modal.customId || 'Popup modal'} · ${field.label || field.customId} (${field.customId})`
    }));
  }), [nodeDefinitionInputsToken]);

  const getNodeDefinition = useCallback((node, seen = new Set()) => {
    const definition = definitionsByType.get(node.type);
    if (!definition) return undefined;
    if (seen.has(node.id)) return definition;
    const nextSeen = new Set(seen).add(node.id);
    const nodeConnections = nodeConnectionsById.get(node.id) || EMPTY_NODE_CONNECTIONS;
    const resolveInputPinColor = (pin) => {
      if (!pin || (pin.type !== 'arg' && pin.type !== 'any')) return pin;
      const wire = connectionByNodePin.incoming.get(node.id)?.get(pin.id);
      if (!wire) {
        if (pin.colorType) {
          const { colorType: _, ...rest } = pin;
          return rest;
        }
        return pin;
      }
      const sourceNode = definitionNodesById.get(wire.sourceNodeId);
      const sourceDefinition = sourceNode && getNodeDefinition(sourceNode, nextSeen);
      const sourcePin = sourceDefinition?.outputs?.find((item) => item.id === wire.sourcePinId);
      const declaredType = sourcePin?.colorType || sourcePin?.type;
      const colorType = declaredType && !['arg', 'any'].includes(declaredType) ? declaredType : wire.type;
      if (colorType && colorType !== 'arg' && colorType !== 'any') {
        return { ...pin, colorType };
      }
      if (pin.colorType) {
        const { colorType: _, ...rest } = pin;
        return rest;
      }
      return pin;
    };
    const withExecInputPins = (nextDefinition) => {
      const baseInputs = nextDefinition.inputs || [];
      const existingIds = new Set(baseInputs.map((pin) => pin.id));
      const templatePins = getNodeTemplateInputPins(node, baseInputs, canvasGraphVariables, nodeConnections.incident);
      let inputs = [...baseInputs, ...templatePins.filter((pin) => !existingIds.has(pin.id))];
      inputs = inputs.map(resolveInputPinColor);
      const execPin = inputs.find((pin) => pin.type === 'exec');
      if (!execPin) return { ...nextDefinition, inputs };
      const baseId = execPin.id;
      const highestConnected = nodeConnections.incoming.reduce((highest, wire) => {
        if (wire.targetPinId === baseId) return Math.max(highest, 1);
        const match = new RegExp(`^${baseId}_(\\d+)$`).exec(wire.targetPinId);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      const count = Math.min(16, Math.max(1, highestConnected + 1));
      return { ...nextDefinition, inputs: [...inputs, ...Array.from({ length: count - 1 }, (_, index) => ({ ...execPin, id: `${baseId}_${index + 2}`, label: `Exec ${index + 2}` }))] };
    };
    const schemaPins = resolveDynamicNodePins(definition, node, nodeConnections.incident);
    if (node.type === 'utility_wire_extender') {
      const resolvePin = (nodeId, pinId, direction, seen = new Set()) => {
        const key = `${nodeId}:${pinId}:${direction}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const candidate = definitionNodesById.get(nodeId);
        if (!candidate) return null;
        if (candidate.type !== 'utility_wire_extender') {
          const base = definitionsByType.get(candidate.type);
          return (direction === 'output' ? base?.outputs : base?.inputs)?.find((pin) => pin.id === pinId) || null;
        }
        const index = pinId.match(/_(\d+)$/)?.[1] || (pinId === 'value_in' || pinId === 'value_out' ? '1' : null);
        if (!index) return null;
        const candidateConnections = nodeConnectionsById.get(candidate.id) || EMPTY_NODE_CONNECTIONS;
        const wire = direction === 'output'
          ? candidateConnections.incoming.find((item) => item.targetPinId === `value_in_${index}` || (index === '1' && item.targetPinId === 'value_in'))
          : candidateConnections.outgoing.find((item) => item.sourcePinId === `value_out_${index}` || (index === '1' && item.sourcePinId === 'value_out'));
        if (!wire) return null;
        return direction === 'output'
          ? resolvePin(wire.sourceNodeId, wire.sourcePinId, 'output', seen)
          : resolvePin(wire.targetNodeId, wire.targetPinId, 'input', seen);
      };
      const resolveExtenderPin = (pin) => {
        if (pin.type === 'exec') return pin;
        const index = pin.id.match(/_(\d+)$/)?.[1] || '1';
        const inputId = pin.id.startsWith('value_in') ? pin.id : `value_in_${index}`;
        const outputId = pin.id.startsWith('value_out') ? pin.id : `value_out_${index}`;
        const incoming = connectionByNodePin.incoming.get(node.id)?.get(inputId);
        const outgoing = connectionByNodePin.outgoing.get(node.id)?.get(outputId);
        const inferred = (incoming && resolvePin(incoming.sourceNodeId, incoming.sourcePinId, 'output'))
          || (outgoing && resolvePin(outgoing.targetNodeId, outgoing.targetPinId, 'input'));
        return inferred?.type && inferred.type !== 'any' ? { ...pin, label: inferred.label || pin.label, type: inferred.type } : pin;
      };
      const inputs = (schemaPins?.inputs || definition.inputs).map(resolveExtenderPin);
      const outputs = (schemaPins?.outputs || definition.outputs).map(resolveExtenderPin);
      return withExecInputPins({ ...definition, inputs, outputs });
    };
    const withArgumentPins = (nextDefinition) => {
      const argumentPins = nextDefinition.pluginAdapter ? [] : getNodeArgumentPins(node, nextDefinition.inputs || [], nodeConnections.incident);
      const existingIds = new Set((nextDefinition.inputs || []).map((pin) => pin.id));
      const withArguments = argumentPins.length
        ? { ...nextDefinition, inputs: [...(nextDefinition.inputs || []), ...argumentPins.filter((pin) => !existingIds.has(pin.id))] }
        : nextDefinition;
      return withExecInputPins(withArguments);
    };
    if (schemaPins) return withExecInputPins({ ...definition, ...schemaPins });
    if (node.type === 'variable_create') {
      const valueWire = connectionByNodePin.incoming.get(node.id)?.get('value');
      const sourceNode = valueWire && definitionNodesById.get(valueWire.sourceNodeId);
      const sourceDefinition = sourceNode && definitionsByType.get(sourceNode.type);
      const sourcePin = sourceDefinition?.outputs?.find((pin) => pin.id === valueWire?.sourcePinId);
      const createdSource = sourceNode?.type === 'variable_create'
        ? canvasGraphVariables.find((variable) => variable.id === `nodevar_${sourceNode.id}`)
        : sourceNode?.type === 'variable_get'
          ? canvasGraphVariables.find((variable) => variable.id === sourceNode.data?.variableId || variable.sourceNodeId === connectionByNodePin.incoming.get(sourceNode.id)?.get('variable')?.sourceNodeId)
          : null;
      let inferredType = createdSource?.type || sourcePin?.type || node.data?.valueType || 'string';
      if (sourcePin?.type === 'object' && ['data_array_create', 'data_array_append', 'data_array_concat'].includes(sourceNode?.type)) inferredType = 'array';
      if (sourceNode?.type === 'data_parse_json' && !connectionByNodePin.incoming.get(sourceNode.id)?.has('json')) {
        try { inferredType = Array.isArray(JSON.parse(sourceNode.data?.json || '')) ? 'array' : 'object'; } catch {}
      }
      const socketType = ['array', 'object'].includes(inferredType) ? 'object' : inferredType;
      const inputs = definition.inputs.map((pin) => pin.id === 'value' ? { ...pin, colorType: inferredType } : pin);
      const outputs = definition.outputs.map((pin) => pin.id === 'value' ? { ...pin, type: socketType, colorType: inferredType } : pin);
      return withExecInputPins({ ...definition, inputs, outputs });
    }
    if (node.type === 'variable_get' || node.type === 'variable_set') {
      const resolveVariable = (targetNode, seen = new Set()) => {
        if (!targetNode || seen.has(targetNode.id)) return null;
        const nextSeen = new Set(seen).add(targetNode.id);
        const referenceWire = connectionByNodePin.incoming.get(targetNode.id)?.get('variable');
        if (referenceWire) {
          const sourceNode = definitionNodesById.get(referenceWire.sourceNodeId);
          const sourceVariable = canvasGraphVariables.find((item) => item.sourceNodeId === sourceNode?.id);
          if (sourceVariable) return sourceVariable;
          if (sourceNode && ['variable_get', 'variable_set'].includes(sourceNode.type)) return resolveVariable(sourceNode, nextSeen);
        }
        return canvasGraphVariables.find((item) => item.id === targetNode.data?.variableId) || null;
      };
      const variable = resolveVariable(node);
      const pinType = ['array', 'object', 'attachment'].includes(variable?.type) ? 'object' : variable?.type || 'string';
      const pinLabel = variable?.name || 'Value';
      return node.type === 'variable_get'
        ? withArgumentPins({ ...definition, outputs: definition.outputs.map((pin) => pin.id === 'value' ? { ...pin, label: pinLabel, type: pinType, colorType: variable?.type === 'attachment' ? 'attachment' : variable?.type || pinType } : pin) })
        : withArgumentPins({ ...definition, inputs: definition.inputs.map((pin) => pin.id === 'value' ? { ...pin, label: pinLabel, type: pinType, colorType: variable?.type === 'attachment' ? 'attachment' : variable?.type || pinType, defaultValue: variable?.initialValue ?? '' } : pin) });
    }
    if (node.type === 'build_embed' && Array.isArray(node.data?.blocks)) {
      return withArgumentPins({ ...definition, inputs: embedBlockPins(getEmbedBlocks(node.data), canvasGraphVariables) });
    }
    if (node.type === 'build_embed' && Array.isArray(node.data?.fields) && node.data.fields.length) {
      const fields = node.data.fields;
      return withArgumentPins({
        ...definition,
        inputs: [...definition.inputs, ...fields.flatMap((field, index) => {
          const labels = getEmbedFieldSocketLabels(field, index, fields);
          return [
            { id: `field_${field.id}_name`, label: labels.name, type: 'string', defaultValue: field.name || '' },
            { id: `field_${field.id}_value`, label: labels.value, type: 'string', defaultValue: field.value || '' }
          ];
        })]
      });
    }
    if (node.type === 'format_text') {
      const variableNames = new Set(canvasGraphVariables.map((variable) => variable.name?.toLowerCase()).filter(Boolean));
      const placeholders = getTextTemplateSlots(node.data?.template);
      return withArgumentPins({ ...definition, inputs: placeholders.flatMap((name) => {
        const argument = /^arg(\d+)$/i.exec(name);
        return argument
          ? [{ id: `arg_${argument[1]}`, label: `arg${argument[1]}`, type: 'arg', defaultValue: '' }]
          : variableNames.has(name.toLowerCase()) ? []
            : [{ id: `slot_${name}`, label: name, type: 'arg', defaultValue: '' }];
      }) });
    }
    if (node.type === 'function_input') {
      const hasArgumentList = Array.isArray(node.data?.arguments);
      return withExecInputPins({
        ...definition,
        outputs: hasArgumentList ? [
          { id: 'exec', label: 'Exec', type: 'exec' },
          ...getFunctionInputArguments(node).map((argument, index) => ({
            id: functionArgumentPinId(argument), label: argument.name?.trim() || `Input ${index + 1}`, type: functionInputPinType(argument),
            ...(argument.valueType.endsWith('_id') || argument.valueType === 'interaction_token' ? { semanticType: argument.valueType } : {})
          }))
        ] : [
          { id: 'exec', label: 'Exec', type: 'exec' },
          { id: 'value', label: node.data?.name || 'Value', type: node.data?.valueType || 'number' }
        ]
      });
    }
    if (node.type === 'function_return') {
      const type = node.data?.valueType || 'number';
      return withExecInputPins({
        ...definition,
        inputs: [
          { id: 'exec', label: 'Exec', type: 'exec' },
          { id: 'value', label: 'Return', type, defaultValue: defaultForType(type) }
        ]
      });
    }
    if (node.type === 'function_call') {
      const target = functionGraphDefinitionViews.find((graph) => graph.id === node.data?.graphId);
      const params = getFunctionGraphArguments(target);
      const returnNode = target?.nodes?.find((item) => item.type === 'function_return');
      return withExecInputPins({
        ...definition,
        inputs: [
          { id: 'exec', label: 'Exec', type: 'exec' },
          ...params.map((param) => ({ id: functionArgumentPinId(param), label: `${param.name || 'Input'}${param.optional ? ' (optional)' : ''}`, type: functionInputPinType(param), defaultValue: param.defaultValue ?? defaultForType(functionInputPinType(param)), ...(param.valueType.endsWith('_id') || param.valueType === 'interaction_token' ? { semanticType: param.valueType } : {}) }))
        ],
        outputs: [
          { id: 'exec', label: 'Exec', type: 'exec' },
          ...(returnNode ? [{ id: 'result', label: 'Result', type: returnNode.data?.valueType || 'number' }] : [])
        ]
      });
    }
    return withArgumentPins(definition);
  }, [definitionsByType, functionGraphDefinitionViews, canvasGraphVariables, nodeDefinitionInputsToken, definitionNodesById, nodeConnectionsById, connectionByNodePin]);
  const previousNodeDefinitionsRef = useRef(new Map());
  const nodeDefinitionsById = useMemo(() => {
    const previous = previousNodeDefinitionsRef.current;
    const next = new Map();
    for (const node of nodes) {
      const definition = getNodeDefinition(node);
      const oldDefinition = previous.get(node.id);
      if (equalNodeDefinitions(oldDefinition, definition)) next.set(node.id, oldDefinition);
      else {
        next.set(node.id, definition);
        nodeWorldSizeCacheRef.current.sizes.delete(node.id);
      }
    }
    previousNodeDefinitionsRef.current = next;
    return next;
  }, [nodeDefinitionInputsToken, getNodeDefinition]);
  const breadcrumbNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
  const breadcrumbNodeLabel = breadcrumbNode?.label || (breadcrumbNode ? getNodeDefinition(breadcrumbNode)?.label || breadcrumbNode.type : '');

  useEffect(() => {
    if (!focusRequest || focusRequest.graphId !== graphId || handledFocusRequestRef.current === focusRequest.requestId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const node = nodes.find((item) => item.id === focusRequest.nodeId);
      const container = containerRef.current;
      if (!node || !container) return;
      const bounds = container.getBoundingClientRect();
      const displayScale = getCanvasDisplayScale(container);
      const card = [...container.querySelectorAll('[data-node-card-id]')].find((item) => item.dataset.nodeCardId === node.id);
      const cardBounds = card?.getBoundingClientRect();
      const cachedSize = nodeWorldSizeCacheRef.current.sizes.get(node.id);
      const width = cardBounds?.width ? cardBounds.width / displayScale / zoom : cachedSize?.width || NODE_WIDTH;
      const height = cardBounds?.height ? cardBounds.height / displayScale / zoom : cachedSize?.height || estimateNodeCardHeight(node, getNodeDefinition(node));
      const viewportWidth = bounds.width / displayScale;
      const viewportHeight = bounds.height / displayScale;
      setPan({
        x: viewportWidth / 2 - (node.x + width / 2) * zoom,
        y: viewportHeight / 2 - (node.y + height / 2) * zoom
      });
      setSelectedNodeId(node.id);
      setSelectedNodeIds([node.id]);
      handledFocusRequestRef.current = focusRequest.requestId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest, graphId, nodes, zoom, getNodeDefinition]);

  useEffect(() => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    let changed = false;
    const repaired = connections.map((connection) => {
      const source = nodesById.get(connection.sourceNodeId);
      const target = nodesById.get(connection.targetNodeId);
      if (source?.type !== 'data_permission_overwrites' || connection.sourcePinId !== 'overwrites' || connection.targetPinId !== 'exec' || !['action_create_channel', 'action_edit_channel'].includes(target?.type)) return connection;
      changed = true;
      return { ...connection, targetPinId: 'permission_overwrites' };
    });
    if (changed) onConnectionsChange?.(repaired);
  }, [connections, nodes, onConnectionsChange]);

  useLayoutEffect(() => {
    refreshWireLayout((revision) => revision + 1);
  }, [nodes, connections, pan, zoom, nodeDefinitionsById, settings.uiScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => refreshWireLayout((revision) => revision + 1));
    observer.observe(container);
    const appRoot = container.closest('.app-root');
    if (appRoot) observer.observe(appRoot);
    const controlDock = document.querySelector('.control-dock');
    if (controlDock) observer.observe(controlDock);
    return () => observer.disconnect();
  }, [nodes.length]);

  const showLibraryDragPreview = useCallback((payload, clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return;
    const target = document.elementFromPoint(clientX, clientY);
    if (!target || !container.contains(target)) { setLibraryDragPreview(null); return; }
    const bounds = container.getBoundingClientRect();
    const type = payload?.previewNode?.type || payload?.prefabNode?.type || payload?.nodeType || (payload?.type === 'graph-call' ? 'function_call' : payload?.type === 'embed-asset' ? 'build_embed' : payload?.type === 'components-v2-asset' ? 'build_components' : null);
    const definition = definitionsByType.get(type);
    if (!definition) { setLibraryDragPreview(null); return; }
    const targetGraph = payload.type === 'graph-call' ? callableGraphs.find((graph) => graph.id === payload.graphId) : null;
    const sourceNode = payload.previewNode || payload.prefabNode || (targetGraph ? { type, label: `Call ${targetGraph.name || 'Graph'}`, data: { graphId: targetGraph.id } } : payload.type === 'embed-asset' ? { type, label: payload.name || 'Embed', data: { blocks: payload.blocks || [], embedName: payload.name || 'Untitled embed' } } : payload.type === 'components-v2-asset' ? { type, label: payload.name || 'Components V2', data: { componentsV2: payload.componentsV2Layout || [] } } : null);
    const node = sourceNode
      ? { ...sourceNode, id: '__arc_drag_preview__', type, x: 0, y: 0, data: sourceNode.data || {} }
      : { id: '__arc_drag_preview__', type, x: 0, y: 0, data: {} };
    const displayScale = getCanvasDisplayScale(container);
    const x = ((clientX - bounds.left) / displayScale - pan.x) / zoom;
    const y = ((clientY - bounds.top) / displayScale - pan.y) / zoom;
    const preview = { node, definition: getNodeDefinition(node), x, y };
    setLibraryDragPreview(preview);
    onCollaborationAction?.({ kind: 'library-drag', cursor: { x: preview.x, y: preview.y }, nodeType: type, label: node.label || preview.definition?.label || type });
  }, [definitionsByType, callableGraphs, getNodeDefinition, onCollaborationAction, pan, zoom]);

  const updateLibraryDragPreview = (event) => {
    const activePayload = window.__arcNodeDragPayload || window.__arcGraphDragPayload || window.__arcEmbedDragPayload || window.__arcComponentsV2DragPayload;
    const raw = readTransferData(event.dataTransfer, 'application/x-arc-node');
    const graphRaw = readTransferData(event.dataTransfer, 'application/x-arc-graph-call');
    const embedRaw = readTransferData(event.dataTransfer, 'application/x-arc-embed-asset');
    const componentsV2Raw = readTransferData(event.dataTransfer, 'application/x-arc-components-v2-asset');
    const fallback = parseLibraryTransferText(readTransferData(event.dataTransfer, 'text/plain'));
    let payload = activePayload;
    if (!payload && raw) { try { payload = JSON.parse(raw); } catch {} }
    if (!payload && graphRaw) { try { payload = { type: 'graph-call', ...JSON.parse(graphRaw) }; } catch {} }
    if (!payload && embedRaw) { try { payload = JSON.parse(embedRaw); } catch {} }
    if (!payload && componentsV2Raw) { try { payload = JSON.parse(componentsV2Raw); } catch {} }
    if (!payload && fallback) payload = window.__arcLibraryDragPayloads?.[fallback.token]?.payload;
    if (!payload || (!payload.previewNode?.type && !payload.nodeType && !payload.prefabNode?.type && payload.type !== 'graph-call' && payload.type !== 'embed-asset' && payload.type !== 'components-v2-asset')) {
      setLibraryDragPreview(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    showLibraryDragPreview(payload, event.clientX, event.clientY);
  };

  const applyComponentsV2AssetToTarget = useCallback((payload, targetElement) => {
    const targetId = targetElement?.closest?.('[data-node-card-id]')?.getAttribute('data-node-card-id');
    const target = nodes.find((node) => node.id === targetId);
    if (!target) return false;
    const allowedMessageTypes = new Set(['action_send_message', 'action_reply_interaction', 'action_edit_message', 'action_edit_components', 'action_edit_interaction_reply']);
    const layout = Array.isArray(payload?.componentsV2Layout) ? payload.componentsV2Layout : [];
    let reason = '';
    if (!layout.length) reason = 'This Components V2 asset is empty.';
    else if (target.type === 'build_components') {
      if ((target.data?.componentsV2 || []).length) reason = 'This Component Builder already has content.';
    } else if (allowedMessageTypes.has(target.type)) {
      const incoming = connections.filter((connection) => connection.targetNodeId === target.id);
      const isWired = (pinId) => incoming.some((connection) => connection.targetPinId === pinId);
      const hasEmbedContent = Array.isArray(target.data?.blocks) && target.data.blocks.length > 0;
      const hasLegacyComponents = Array.isArray(target.data?.components) && target.data.components.some((row) => row.components?.length);
      const hasV2Content = Array.isArray(target.data?.componentsV2Layout) && target.data.componentsV2Layout.length > 0;
      if (isWired('content') || String(target.data?.content || '').trim()) reason = 'Message content must be empty and unconnected.';
      else if (isWired('embed') || hasEmbedContent) reason = 'The embed must be empty and unconnected.';
      else if (isWired('components') || hasLegacyComponents || hasV2Content) reason = 'Components must be empty and unconnected.';
    } else reason = 'Drop this asset onto a Component Builder or a message action node.';

    if (reason) {
      shakeNode(target.id);
      return true;
    }
    const nextNodes = nodes.map((node) => {
      if (node.id !== target.id) return node;
      const attachmentsByName = new Map((node.data?.attachments || []).map((attachment) => [String(attachment.filename || '').toLowerCase(), attachment]));
      for (const attachment of payload.attachments || []) attachmentsByName.set(String(attachment.filename || '').toLowerCase(), attachment);
      return node.type === 'build_components'
        ? { ...node, data: { ...node.data, componentsV2: structuredCloneSafe(layout), attachments: [...attachmentsByName.values()] } }
        : { ...node, data: { ...node.data, componentsV2Enabled: true, componentsV2Layout: structuredCloneSafe(layout), attachments: [...attachmentsByName.values()] } };
    });
    onNodesChange?.(nextNodes);
    return true;
  }, [connections, nodes, onNodesChange, shakeNode]);

  const dropLibraryPayload = useCallback((payload, clientX, clientY, targetElement) => {
    const container = containerRef.current;
    if (!container || !targetElement || !container.contains(targetElement)) return;
    const bounds = container.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(container);
    const position = { x: Math.round(((clientX - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((clientY - bounds.top) / displayScale - pan.y) / zoom) };
    if (payload?.type === 'components-v2-asset') applyComponentsV2AssetToTarget(payload, targetElement);
    else if (payload?.type === 'embed-asset') {
      const targetId = targetElement.closest?.('[data-node-card-id]')?.getAttribute('data-node-card-id');
      const target = nodes.find((node) => node.id === targetId && node.type === 'build_embed');
      if (target) onNodesChange?.(nodes.map((node) => node.id === target.id ? { ...node, data: { ...node.data, blocks: structuredCloneSafe(payload.blocks || []), embedName: payload.name || 'Untitled embed' } } : node));
      else onNodeDrop?.(payload, position);
    } else onNodeDrop?.(payload, position);
  }, [applyComponentsV2AssetToTarget, nodes, onNodesChange, onNodeDrop, pan, zoom]);

  useEffect(() => {
    if (!desktopMode) return undefined;
    const onPointerMove = (event) => showLibraryDragPreview(event.detail?.payload, event.detail?.clientX, event.detail?.clientY);
    const onPointerDrop = (event) => {
      const { payload, clientX, clientY } = event.detail || {};
      const target = document.elementFromPoint(clientX, clientY);
      dropLibraryPayload(payload, clientX, clientY, target);
      setLibraryDragPreview(null);
    };
    window.addEventListener('arc-library-pointermove', onPointerMove);
    window.addEventListener('arc-library-pointerdrop', onPointerDrop);
    return () => {
      window.removeEventListener('arc-library-pointermove', onPointerMove);
      window.removeEventListener('arc-library-pointerdrop', onPointerDrop);
    };
  }, [desktopMode, dropLibraryPayload, showLibraryDragPreview]);

  const previousRemoteNodePositionsRef = useRef(new Map());
  const remoteNodePositionById = useMemo(() => {
    const previous = previousRemoteNodePositionsRef.current;
    const positions = new Map();
    for (const peer of remoteActions) if (Array.isArray(peer.action?.nodePositions)) {
      for (const position of peer.action.nodePositions) if (position && typeof position.id === 'string') positions.set(position.id, position);
    }
    const unchanged = previous.size === positions.size && [...positions].every(([id, position]) => {
      const oldPosition = previous.get(id);
      return oldPosition?.x === position.x && oldPosition?.y === position.y;
    });
    if (unchanged) return previous;
    previousRemoteNodePositionsRef.current = positions;
    return positions;
  }, [remoteActions]);

  const localNodePositionById = useMemo(() => {
    if (!draggingNode?.historyStarted && !draggingNode?.deltaX && !draggingNode?.deltaY) return null;
    const ids = new Set(draggingNode.nodeIds || [draggingNode.id]);
    const initialPositions = draggingNode.initialPositions || {};
    const positions = new Map();
    for (const node of nodes) {
      if (!ids.has(node.id)) continue;
      const initial = initialPositions[node.id] || node;
      positions.set(node.id, {
        x: Math.round(initial.x + (draggingNode.deltaX || 0)),
        y: Math.round(initial.y + (draggingNode.deltaY || 0))
      });
    }
    return positions;
  }, [draggingNode, nodes]);

  const getSocketPosition = useCallback((nodeId, pinId, direction) => {
    let cache = socketPositionCacheRef.current;
    const renderVersion = canvasRenderVersionRef.current;
    if (cache.renderVersion !== renderVersion) {
      const positions = new Map();
      const container = containerRef.current;
      if (container) {
        const cardBoundsById = new Map();
        for (const row of container.querySelectorAll('.node-pin-row')) {
          const { nodeId: rowNodeId, pinId: rowPinId, direction: rowDirection } = row.dataset;
          const socket = row.querySelector('.pin-socket');
          const card = row.closest('[data-node-card-id]');
          if (!nodePositionById.has(rowNodeId) || !socket || !card) continue;
          let cardBounds = cardBoundsById.get(rowNodeId);
          if (!cardBounds) {
            cardBounds = card.getBoundingClientRect();
            cardBoundsById.set(rowNodeId, cardBounds);
          }
          const socketBounds = socket.getBoundingClientRect();
          if (!cardBounds.width) continue;
          const nodePosition = localNodePositionById?.get(rowNodeId) || remoteNodePositionById.get(rowNodeId) || nodePositionById.get(rowNodeId);
          const scale = cardBounds.width / NODE_WIDTH;
          positions.set(`${rowNodeId}\u0000${rowPinId}\u0000${rowDirection}`, {
            x: nodePosition.x + (socketBounds.left + socketBounds.width / 2 - cardBounds.left) / scale,
            y: nodePosition.y + (socketBounds.top + socketBounds.height / 2 - cardBounds.top) / scale
          });
        }
      }
      cache = { renderVersion, positions };
      socketPositionCacheRef.current = cache;
    }
    const cachedPosition = cache.positions.get(`${nodeId}\u0000${pinId}\u0000${direction}`);
    if (cachedPosition) return cachedPosition;
    if (!nodePositionById.has(nodeId)) return { x: 0, y: 0 };
    const nodePosition = localNodePositionById?.get(nodeId) || remoteNodePositionById.get(nodeId) || nodePositionById.get(nodeId);
    const definition = nodeDefinitionsById.get(nodeId);
    const pins = direction === 'output' ? definition?.outputs || [] : definition?.inputs || [];
    const index = Math.max(0, pins.findIndex((pin) => pin.id === pinId));
    return {
      x: nodePosition.x + (direction === 'output' ? NODE_WIDTH : 0),
      y: nodePosition.y + 72 + index * 23
    };
  }, [nodePositionById, nodeDefinitionsById, remoteNodePositionById, localNodePositionById]);

  const pinFromRow = useCallback((row) => row ? ({
    nodeId: row.dataset.nodeId,
    pinId: row.dataset.pinId,
    direction: row.dataset.direction,
    pinType: row.dataset.pinType
  }) : null, []);

  const isCompatiblePin = useCallback((start, candidate) => {
    if (!candidate || !start || candidate.nodeId === start.nodeId || candidate.direction === start.direction) return false;
    const output = start.direction === 'output' ? start : candidate;
    const input = start.direction === 'input' ? start : candidate;
    if (output.pinType === 'exec' || input.pinType === 'exec') return output.pinType === 'exec' && input.pinType === 'exec';
    return output.pinType === input.pinType || output.pinType === 'any' || input.pinType === 'any' || input.pinType === 'arg';
  }, []);

  const findClosestPin = useCallback((clientX, clientY, start, maxDistance = 28) => {
    const rows = containerRef.current?.querySelectorAll('.node-pin-row') || [];
    let closest = null;
    let closestDistance = maxDistance;
    rows.forEach((row) => {
      const pin = pinFromRow(row);
      if (!isCompatiblePin(start, pin)) return;
      const socket = row.querySelector('.pin-socket');
      const bounds = socket?.getBoundingClientRect();
      if (!bounds) return;
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const distance = Math.hypot(clientX - x, clientY - y) / getCanvasDisplayScale(containerRef.current);
      if (distance <= closestDistance) {
        closestDistance = distance;
        closest = { ...pin, screenPosition: { x, y }, distance };
      }
    });
    return closest;
  }, [isCompatiblePin, pinFromRow]);

  function deleteNode(nodeId) {
    onHistoryGroupStart?.();
    onNodesChange?.(nodes.filter((node) => node.id !== nodeId));
    onConnectionsChange?.(connections.filter((connection) => connection.sourceNodeId !== nodeId && connection.targetNodeId !== nodeId));
    onHistoryGroupEnd?.();
    setSelectedNodeId((selected) => selected === nodeId ? null : selected);
    setSelectedNodeIds((selected) => selected.filter((id) => id !== nodeId));
  }

  function deleteSelectedItems(nodeIds = selectedNodeIds, noteIds = selectedNoteIds, confirmed = false, arrowIds = selectedArrowIds) {
    const uniqueNodeIds = [...new Set(nodeIds)];
    const removableNoteIds = [...new Set(noteIds)].filter((id) => {
      const note = notes.find((item) => item.id === id);
      return note && !isNoteBeingEditedByOther(id) && (!note.locked || mayEditNote(note));
    });
    const removableArrowIds = [...new Set(arrowIds)].filter((id) => {
      const arrow = canvasArrows.find((item) => item.id === id);
      return arrow && (!arrow.locked || mayManageArrow(arrow));
    });
    if (uniqueNodeIds.length > 1 && !confirmed) {
      setDeleteConfirmationIds(uniqueNodeIds);
      setDeleteConfirmationNoteIds(removableNoteIds);
      setDeleteConfirmationArrowIds(removableArrowIds);
      return;
    }
    if (!uniqueNodeIds.length && !removableNoteIds.length && !removableArrowIds.length) return;
    if (uniqueNodeIds.length || removableNoteIds.length || removableArrowIds.some((id) => canvasArrows.find((arrow) => arrow.id === id)?.locked)) onHistoryGroupStart?.();
    if (uniqueNodeIds.length) {
      const ids = new Set(uniqueNodeIds);
      onNodesChange?.(nodes.filter((node) => !ids.has(node.id)));
      onConnectionsChange?.(connections.filter((connection) => !ids.has(connection.sourceNodeId) && !ids.has(connection.targetNodeId)));
    }
    if (removableNoteIds.length) {
      const ids = new Set(removableNoteIds);
      onNotesChange?.(notes.filter((note) => !ids.has(note.id)));
    }
    const removedLockedArrowIds = new Set(removableArrowIds.filter((id) => canvasArrows.find((arrow) => arrow.id === id)?.locked));
    if (removedLockedArrowIds.size) onArrowsChange?.(arrows.filter((arrow) => !removedLockedArrowIds.has(arrow.id)));
    for (const id of removableArrowIds.filter((arrowId) => !canvasArrows.find((arrow) => arrow.id === arrowId)?.locked)) {
      if (!onCanvasArrowAction || onCanvasArrowAction('delete', { id }) === false) removeTransientArrowLocally(id);
    }
    if (uniqueNodeIds.length || removableNoteIds.length || removedLockedArrowIds.size) onHistoryGroupEnd?.();
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedNoteIds([]);
    setSelectedArrowIds([]);
    setDeleteConfirmationIds(null);
    setDeleteConfirmationNoteIds([]);
    setDeleteConfirmationArrowIds([]);
    onCollaborationAction?.({ kind: 'selection', selectedNodeIds: [], selectedNoteIds: [], selectedArrowIds: [] }, true);
  }

  const selectNodes = (ids, primaryId = ids[ids.length - 1] || null, { preserveNotes = false, preserveArrows = false } = {}) => {
    const validIds = [...new Set(ids)];
    setSelectedNodeIds(validIds);
    setSelectedNodeId(primaryId && validIds.includes(primaryId) ? primaryId : validIds[validIds.length - 1] || null);
    if (!preserveNotes) setSelectedNoteIds([]);
    if (!preserveArrows) setSelectedArrowIds([]);
    onCollaborationAction?.({ kind: 'selection', selectedNodeIds: validIds, selectedNoteIds: preserveNotes ? selectedNoteIds : [], selectedArrowIds: preserveArrows ? selectedArrowIds : [] });
  };

  const selectNotes = (noteIds, { additive = false } = {}) => {
    const validIds = [...new Set(noteIds)].filter((id) => notes.some((note) => note.id === id));
    const nextIds = additive ? [...new Set([...selectedNoteIds.filter((id) => notes.some((note) => note.id === id)), ...validIds])] : validIds;
    setSelectedNoteIds(nextIds);
    if (!additive) {
      setSelectedNodeIds([]);
      setSelectedNodeId(null);
      setSelectedArrowIds([]);
    }
    onCollaborationAction?.({ kind: 'selection', selectedNodeIds: additive ? selectedNodeIds : [], selectedNoteIds: nextIds, selectedArrowIds: additive ? selectedArrowIds : [] });
  };

  const selectCanvasArrow = (event, arrow) => {
    if (event.button !== 0) return;
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const nextIds = additive
      ? selectedArrowIds.includes(arrow.id) ? selectedArrowIds.filter((id) => id !== arrow.id) : [...selectedArrowIds, arrow.id]
      : [arrow.id];
    setSelectedArrowIds(nextIds);
    if (!additive) {
      setSelectedNodeIds([]);
      setSelectedNodeId(null);
      setSelectedNoteIds([]);
    }
    onCollaborationAction?.({ kind: 'selection', selectedNodeIds: additive ? selectedNodeIds : [], selectedNoteIds: additive ? selectedNoteIds : [], selectedArrowIds: nextIds });
  };

  const removeTransientArrowLocally = (id) => {
    const arrow = canvasArrows.find((item) => item.id === id);
    if (!arrow) return;
    const now = Date.now();
    setLocalTransientArrows((previous) => [...previous.filter((item) => item.id !== id), { ...arrow, removing: true, expiresAt: Math.max(arrow.expiresAt || 0, now + 220) }]);
    window.setTimeout(() => {
      setLocalTransientArrows((previous) => previous.map((item) => item.id === id ? { ...item, removing: false, hidden: true } : item));
    }, 190);
  };

  const beginArrowDrag = (event, arrow) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    if (additive) {
      selectCanvasArrow(event, arrow);
      return;
    }
    const selectedIds = selectedArrowIds.includes(arrow.id) ? selectedArrowIds : [arrow.id];
    if (!selectedArrowIds.includes(arrow.id)) {
      setSelectedArrowIds(selectedIds);
      setSelectedNodeIds([]);
      setSelectedNodeId(null);
      setSelectedNoteIds([]);
      onCollaborationAction?.({ kind: 'selection', selectedNodeIds: [], selectedNoteIds: [], selectedArrowIds: selectedIds });
    }
    if (canvasLocked || (arrow.locked && (isLocked || !canWriteGraphs || !mayManageArrow(arrow)))) return;
    const moving = canvasArrows.filter((item) => selectedIds.includes(item.id) && mayManageArrow(item));
    setDraggingArrows({
      ids: moving.map((item) => item.id),
      initial: Object.fromEntries(moving.map((item) => [item.id, { start: item.start, end: item.end }])),
      startX: event.clientX,
      startY: event.clientY,
      startPan: viewportRef.current.pan,
      deltaX: 0,
      deltaY: 0
    });
    if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const toggleArrowLock = (arrow) => {
    if (canvasLocked || isLocked || !canWriteGraphs || !mayManageArrow(arrow)) return;
    if (!arrow.locked) {
      if (arrows.filter((item) => item?.locked).length >= 300) return;
      if (!onCanvasArrowAction || onCanvasArrowAction('lock', { id: arrow.id }) === false) {
        if (arrow.createdById !== currentUser?.id) return;
        onArrowsChange?.([...arrows, { ...arrow, locked: true, expiresAt: null }]);
        setLocalTransientArrows((previous) => previous.filter((item) => item.id !== arrow.id));
      }
      return;
    }
    if (!onCanvasArrowAction || onCanvasArrowAction('unlock', { id: arrow.id }) === false) {
      const now = Date.now();
      onArrowsChange?.(arrows.filter((item) => item.id !== arrow.id));
      setLocalTransientArrows((previous) => [...previous, { ...arrow, locked: false, createdAt: now, expiresAt: now + 12_000 }]);
    }
  };

  const handleNoteSelectionPointerDown = (event, noteId) => {
    if (event.button !== 0) return false;
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const nextIds = additive
      ? selectedNoteIds.includes(noteId) ? selectedNoteIds.filter((id) => id !== noteId) : [...selectedNoteIds, noteId]
      : [noteId];
    setSelectedNoteIds(nextIds);
    if (!additive) {
      setSelectedNodeIds([]);
      setSelectedNodeId(null);
      setSelectedArrowIds([]);
    }
    onCollaborationAction?.({ kind: 'selection', selectedNodeIds: additive ? selectedNodeIds : [], selectedNoteIds: nextIds, selectedArrowIds: additive ? selectedArrowIds : [] });
    return additive;
  };

  const isCanvasBackgroundTarget = (target) => target instanceof Element
    && Boolean(containerRef.current?.contains(target))
    && !target.closest('[data-node-card-id], [data-note-id], [data-wire-id], button, input, textarea, select, .canvas-tools, .canvas-breadcrumbs');

  const selectTagGroupNodes = (groupId) => {
    const group = tagGroups.find((item) => item.id === groupId);
    if (!group) return;
    const nodeIds = (group.nodeIds || []).filter((id) => nodes.some((node) => node.id === id));
    if (nodeIds.length) selectNodes(nodeIds);
  };

  function copyNodes(nodeIds) {
    const ids = new Set(nodeIds);
    const selected = nodes.filter((node) => ids.has(node.id));
    if (!selected.length) return;
    const selectedIds = new Set(selected.map((node) => node.id));
    clipboardRef.current = {
      nodes: structuredCloneSafe(selected),
      connections: structuredCloneSafe(connections.filter((wire) => selectedIds.has(wire.sourceNodeId) && selectedIds.has(wire.targetNodeId)))
    };
  }

  function pasteNodes(source = clipboardRef.current) {
    if (!source) return;
    const fragment = Array.isArray(source.nodes) ? source : { nodes: [source], connections: [] };
    const bounds = containerRef.current?.getBoundingClientRect();
    const pointer = pointerPositionRef.current;
    let pasteOrigin = null;
    if (bounds && pointer && pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const currentViewport = viewportRef.current;
      pasteOrigin = { x: ((pointer.x - bounds.left) / displayScale - currentViewport.pan.x) / currentViewport.zoom, y: ((pointer.y - bounds.top) / displayScale - currentViewport.pan.y) / currentViewport.zoom };
      const last = lastPastePositionRef.current;
      pasteCascadeRef.current = last && Math.hypot(pointer.x - last.x, pointer.y - last.y) < 4 ? pasteCascadeRef.current + 1 : 0;
      lastPastePositionRef.current = { ...pointer };
      pasteOrigin.x += pasteCascadeRef.current * 24;
      pasteOrigin.y += pasteCascadeRef.current * 24;
    }
    const minX = Math.min(...fragment.nodes.map((node) => Number(node.x) || 0));
    const minY = Math.min(...fragment.nodes.map((node) => Number(node.y) || 0));
    const idMap = new Map(fragment.nodes.map((node) => [node.id, `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`]));
    const pastedNodes = fragment.nodes.map((node) => ({
      ...structuredCloneSafe(node),
      id: idMap.get(node.id),
      x: Math.round(pasteOrigin ? pasteOrigin.x + ((Number(node.x) || 0) - minX) : (node.x || 0) + 40),
      y: Math.round(pasteOrigin ? pasteOrigin.y + ((Number(node.y) || 0) - minY) : (node.y || 0) + 40)
    }));
    const pastedConnections = (fragment.connections || []).filter((wire) => idMap.has(wire.sourceNodeId) && idMap.has(wire.targetNodeId)).map((wire) => ({
      ...structuredCloneSafe(wire), id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceNodeId: idMap.get(wire.sourceNodeId), targetNodeId: idMap.get(wire.targetNodeId)
    }));
    onNodesChange?.([...nodes, ...pastedNodes]);
    onConnectionsChange?.([...connections, ...pastedConnections]);
    selectNodes(pastedNodes.map((node) => node.id), pastedNodes[pastedNodes.length - 1]?.id);
  }

  function duplicateNode(nodeId) {
    const source = nodes.find((node) => node.id === nodeId);
    if (!source) return;
    copyNodes([nodeId]);
    pasteNodes();
  }

  function shakeNode(nodeId) {
    if (!nodeId) return;
    window.clearTimeout(shakeTimerRef.current);
    setShakingNodeId(null);
    requestAnimationFrame(() => setShakingNodeId(nodeId));
    shakeTimerRef.current = window.setTimeout(() => setShakingNodeId(null), 240);
  }

  const updateNodeData = (nodeId, data, label) => {
    onCollaborationAction?.({ kind: 'node-edit', nodeId });
    const previousNode = nodes.find((node) => node.id === nodeId);
    const migratingFunctionInput = previousNode?.type === 'function_input' && !Array.isArray(previousNode.data?.arguments) && Array.isArray(data?.arguments);
    const nextNodes = nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...data }, ...(label !== undefined ? { label } : {}) } : node);
    const nextConnectionsSource = migratingFunctionInput && data.arguments[0]
      ? connections.map((connection) => connection.sourceNodeId === nodeId && connection.sourcePinId === 'value'
        ? { ...connection, sourcePinId: `arg_${data.arguments[0].paramId}` }
        : connection)
      : connections;
    const nodesById = new Map(nextNodes.map((node) => [node.id, node]));
    const nextConnections = nextConnectionsSource.filter((connection) => {
      const sourceNode = nodesById.get(connection.sourceNodeId);
      const targetNode = nodesById.get(connection.targetNodeId);
      if (!sourceNode || !targetNode) return false;
      const sourcePin = getNodeDefinition(sourceNode)?.outputs?.find((pin) => pin.id === connection.sourcePinId);
      const targetPin = getNodeDefinition(targetNode)?.inputs?.find((pin) => pin.id === connection.targetPinId);
      return sourcePin && targetPin && (sourcePin.type === targetPin.type || sourcePin.type === 'arg' || targetPin.type === 'arg' || sourcePin.type === 'any' || targetPin.type === 'any');
    });
    onNodesChange?.(nextNodes);
    if (nextConnections.length !== connections.length || nextConnections.some((connection, index) => connection !== connections[index])) onConnectionsChange?.(nextConnections);
  };

  const startPan = (event) => {
    if (contextMenu || document.querySelector('.arc-dropdown.is-open, .canvas-context-menu')) return;
    const isCanvasTarget = isCanvasBackgroundTarget(event.target);
    const textPopupOpen = textInputPopupOpen();
    if (textPopupOpen && event.pointerType === 'touch' && isCanvasTarget) return;
    if (event.pointerType === 'touch' && isCanvasTarget && !textPopupOpen) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointersRef.current.size >= 2) {
        const pointers = [...touchPointersRef.current.values()].slice(-2);
        const midpoint = { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 };
        const distance = Math.max(1, Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y));
        const bounds = containerRef.current?.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(containerRef.current);
        if (bounds) {
          const current = viewportRef.current;
          const localMidpoint = { x: (midpoint.x - bounds.left) / displayScale, y: (midpoint.y - bounds.top) / displayScale };
          touchPinchRef.current = {
            distance,
            zoom: current.zoom,
            worldPoint: { x: (localMidpoint.x - current.pan.x) / current.zoom, y: (localMidpoint.y - current.pan.y) / current.zoom }
          };
        }
        event.preventDefault();
        setIsPanning(false);
        setDraggingNode(null);
        setDraggingNote(null);
        selectionStartRef.current = null;
        setSelectionBox(null);
        for (const pointerId of touchPointersRef.current.keys()) containerRef.current?.setPointerCapture?.(pointerId);
        return;
      }
    }
    const rightPan = event.button === 2;
    const spacePan = event.button === 0 && spaceDownRef.current;
    if (rightPan && !isCanvasTarget) return;
    if (textPopupOpen && (rightPan || spacePan || event.button === 1)) return;
    if (settings.canvasRightClickPan && event.button === 0 && isCanvasTarget) return;
    if (rightPan || spacePan) {
      event.preventDefault();
      setIsPanning(true);
      rightPanOriginRef.current = rightPan ? { x: event.clientX, y: event.clientY } : null;
      rightPanMovedRef.current = false;
      const displayScale = getCanvasDisplayScale(containerRef.current);
      panStartRef.current = { x: event.clientX / displayScale - pan.x, y: event.clientY / displayScale - pan.y };
      if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      setIsPanning(true);
      const displayScale = getCanvasDisplayScale(containerRef.current);
      panStartRef.current = { x: event.clientX / displayScale - pan.x, y: event.clientY / displayScale - pan.y };
      if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0 || !isCanvasTarget) return;
    if (event.button === 0 && isCanvasTarget) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && focused !== document.documentElement) focused.blur();
    }
    event.preventDefault();
    selectionStartRef.current = { x: event.clientX, y: event.clientY, additive: event.shiftKey || event.metaKey || event.ctrlKey };
    setSelectionBox({ x1: event.clientX, y1: event.clientY, x2: event.clientX, y2: event.clientY });
    if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const activatePendingPinDrag = (event) => {
    const pending = pendingPinDragRef.current;
    if (!pending || (Number.isInteger(pending.pointerId) && pending.pointerId !== event.pointerId)
      || Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 4) return false;
    pendingPinDragRef.current = null;
    pinDoubleClickRef.current = null;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const wire = {
      nodeId: pending.nodeId,
      pinId: pending.pinId,
      direction: pending.direction,
      pinType: pending.pinType,
      startPos: getSocketPosition(pending.nodeId, pending.pinId, pending.direction),
      currentPos: { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom },
      snapTarget: null
    };
    connectingWireRef.current = wire;
    setConnectingWire(wire);
    onCollaborationAction?.({ kind: 'wire-drag', cursor: wire.currentPos, start: wire.startPos, pinType: wire.pinType, nodeId: wire.nodeId, pinId: wire.pinId, direction: wire.direction });
    return true;
  };

  const movePointer = (event) => {
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    activatePendingPinDrag(event);
    if (textInputPopupOpen() && (isPanning || touchPinchRef.current)) {
      if (isPanning) setPan(viewportRef.current.pan);
      setIsPanning(false);
      rightPanOriginRef.current = null;
      touchPinchRef.current = null;
      touchPointersRef.current.clear();
      return;
    }
    if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPinchRef.current && touchPointersRef.current.size >= 2) {
        const pointers = [...touchPointersRef.current.values()].slice(-2);
        const midpoint = { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 };
        const distance = Math.max(1, Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y));
        const bounds = containerRef.current?.getBoundingClientRect();
        if (bounds) {
          event.preventDefault();
          const displayScale = getCanvasDisplayScale(containerRef.current);
          const localMidpoint = { x: (midpoint.x - bounds.left) / displayScale, y: (midpoint.y - bounds.top) / displayScale };
          const nextZoom = clamp(touchPinchRef.current.zoom * (distance / touchPinchRef.current.distance), 0.25, 2.5);
          setZoom(nextZoom);
          setPan({
            x: localMidpoint.x - touchPinchRef.current.worldPoint.x * nextZoom,
            y: localMidpoint.y - touchPinchRef.current.worldPoint.y * nextZoom
          });
        }
        return;
      }
    }
    if ((contextMenu || document.querySelector('.arc-dropdown.is-open, .canvas-context-menu')) && isPanning) {
      setPan(viewportRef.current.pan);
      setIsPanning(false);
      rightPanOriginRef.current = null;
      return;
    }
    const bounds = containerRef.current?.getBoundingClientRect();
    if (bounds) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const currentViewport = viewportRef.current;
      const cursor = { x: ((event.clientX - bounds.left) / displayScale - currentViewport.pan.x) / currentViewport.zoom, y: ((event.clientY - bounds.top) / displayScale - currentViewport.pan.y) / currentViewport.zoom };
      collaborationCursorRef.current = cursor;
      if (drawingArrow) {
        const end = { x: Math.round(cursor.x), y: Math.round(cursor.y) };
        setDrawingArrow((current) => current ? { ...current, end } : current);
        onCollaborationAction?.({ kind: 'arrow-drag', cursor: end, start: drawingArrow.start });
      } else if (draggingArrows) {
        const deltaX = Math.round(((event.clientX - draggingArrows.startX) / displayScale - (currentViewport.pan.x - draggingArrows.startPan.x)) / currentViewport.zoom);
        const deltaY = Math.round(((event.clientY - draggingArrows.startY) / displayScale - (currentViewport.pan.y - draggingArrows.startPan.y)) / currentViewport.zoom);
        setDraggingArrows((current) => current ? { ...current, deltaX, deltaY } : current);
      } else if (connectingWire) onCollaborationAction?.({ kind: 'wire-drag', cursor, start: connectingWire.startPos, pinType: connectingWire.pinType, nodeId: connectingWire.nodeId, pinId: connectingWire.pinId, direction: connectingWire.direction, snapTarget: connectingWire.snapTarget ? { nodeId: connectingWire.snapTarget.nodeId, pinId: connectingWire.snapTarget.pinId } : null, selectedNodeIds });
      else if (draggingNode) {
        const currentPan = viewportRef.current.pan;
        const deltaX = ((event.clientX - draggingNode.startX) / displayScale - (currentPan.x - draggingNode.startPan.x)) / zoom;
        const deltaY = ((event.clientY - draggingNode.startY) / displayScale - (currentPan.y - draggingNode.startPan.y)) / zoom;
        let x = draggingNode.initialX + deltaX;
        let y = draggingNode.initialY + deltaY;
        if (snapToGrid) { x = Math.round(x / GRID_SIZE) * GRID_SIZE; y = Math.round(y / GRID_SIZE) * GRID_SIZE; }
        const groupDeltaX = x - draggingNode.initialX;
        const groupDeltaY = y - draggingNode.initialY;
        const ids = draggingNode.nodeIds || [draggingNode.id];
        const initialPositions = draggingNode.initialPositions || { [draggingNode.id]: { x: draggingNode.initialX, y: draggingNode.initialY } };
        const nodePositions = collaborationMotionSupported && Math.hypot(deltaX * zoom, deltaY * zoom) >= 2 ? ids.map((id) => {
          const initial = initialPositions[id] || nodes.find((node) => node.id === id) || { x: 0, y: 0 };
          return { id, x: Math.round(initial.x + groupDeltaX), y: Math.round(initial.y + groupDeltaY) };
        }) : undefined;
        onCollaborationAction?.({ kind: 'node-drag', cursor, nodeIds: ids, nodePositions });
      }
      else if (draggingNote) {
        const deltaX = Math.round((event.clientX - draggingNote.startX) / displayScale / zoom);
        const deltaY = Math.round((event.clientY - draggingNote.startY) / displayScale / zoom);
        const ids = draggingNote.noteIds || [draggingNote.id];
        const notePositions = collaborationMotionSupported && (draggingNote.historyStarted || Math.hypot(deltaX, deltaY) >= 2) ? ids.map((id) => {
          const initial = draggingNote.initialPositions[id] || notes.find((note) => note.id === id) || { x: 0, y: 0 };
          return { id, x: initial.x + deltaX, y: initial.y + deltaY };
        }) : undefined;
        onCollaborationAction?.({ kind: 'note-drag', cursor, noteId: draggingNote.id, noteIds: ids, notePositions });
      }
      else if (selectionStartRef.current) {
        const start = selectionStartRef.current;
        const toWorld = (x, y) => ({ x: ((x - bounds.left) / displayScale - pan.x) / zoom, y: ((y - bounds.top) / displayScale - pan.y) / zoom });
        const startWorld = toWorld(start.x, start.y);
        const currentWorld = toWorld(event.clientX, event.clientY);
        const selectionRect = {
          left: Math.min(startWorld.x, currentWorld.x), top: Math.min(startWorld.y, currentWorld.y),
          right: Math.max(startWorld.x, currentWorld.x), bottom: Math.max(startWorld.y, currentWorld.y)
        };
        const screenRect = {
          left: Math.min(start.x, event.clientX), top: Math.min(start.y, event.clientY),
          right: Math.max(start.x, event.clientX), bottom: Math.max(start.y, event.clientY)
        };
        const hitIds = [...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])].filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.right >= screenRect.left && rect.left <= screenRect.right && rect.bottom >= screenRect.top && rect.top <= screenRect.bottom;
        }).map((card) => card.dataset.nodeCardId);
        const hitNoteIds = [...(containerRef.current?.querySelectorAll('[data-note-id]') || [])].filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.right >= screenRect.left && rect.left <= screenRect.right && rect.bottom >= screenRect.top && rect.top <= screenRect.bottom;
        }).map((card) => card.dataset.noteId);
        const hitArrowIds = [...(containerRef.current?.querySelectorAll('[data-arrow-id]') || [])].filter((path) => {
          const rect = path.getBoundingClientRect();
          return rect.right >= screenRect.left && rect.left <= screenRect.right && rect.bottom >= screenRect.top && rect.top <= screenRect.bottom;
        }).map((path) => path.dataset.arrowId);
        const selected = start.additive ? [...new Set([...selectedNodeIds, ...hitIds])] : hitIds;
        const selectedNotes = start.additive ? [...new Set([...selectedNoteIds, ...hitNoteIds])] : hitNoteIds;
        const selectedArrows = start.additive ? [...new Set([...selectedArrowIds, ...hitArrowIds])] : hitArrowIds;
        onCollaborationAction?.({ kind: 'selection', cursor, mode: 'select', selectedNodeIds: selected, selectedNoteIds: selectedNotes, selectedArrowIds: selectedArrows, selectionRect });
      }
      else {
        const target = event.target instanceof Element ? event.target : null;
        const isTextField = Boolean(target?.closest('input, textarea, [contenteditable="true"], .cm-content'));
        const isWire = Boolean(target?.closest('.wire-group, .wire-visible, .wire-hit-area'));
        const mode = graphChatTypingRef.current ? 'chat-typing' : isTextField ? 'text' : isWire ? 'cut' : isPanning ? 'pan' : 'move';
        onCollaborationAction?.({ kind: 'cursor', cursor, mode, selectedNodeIds });
      }
    }
    if (isPanning) {
      if (rightPanOriginRef.current && Math.hypot(event.clientX - rightPanOriginRef.current.x, event.clientY - rightPanOriginRef.current.y) > 4) rightPanMovedRef.current = true;
      const displayScale = getCanvasDisplayScale(containerRef.current);
      applyPanDuringGesture({ x: event.clientX / displayScale - panStartRef.current.x, y: event.clientY / displayScale - panStartRef.current.y });
      return;
    }
    if (selectionStartRef.current) {
      setSelectionBox((current) => current ? { ...current, x2: event.clientX, y2: event.clientY } : current);
      return;
    }
    if (draggingNode) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const currentPan = viewportRef.current.pan;
      const deltaX = (event.clientX - draggingNode.startX) / displayScale - (currentPan.x - draggingNode.startPan.x);
      const deltaY = (event.clientY - draggingNode.startY) / displayScale - (currentPan.y - draggingNode.startPan.y);
      if (!draggingNode.historyStarted && Math.hypot(deltaX, deltaY) < 2) return;
      if (!draggingNode.historyStarted) {
        onHistoryGroupStart?.();
      }
      let x = draggingNode.initialX + deltaX / zoom;
      let y = draggingNode.initialY + deltaY / zoom;
      if (snapToGrid) {
        x = Math.round(x / GRID_SIZE) * GRID_SIZE;
        y = Math.round(y / GRID_SIZE) * GRID_SIZE;
      }
      const groupDeltaX = x - draggingNode.initialX;
      const groupDeltaY = y - draggingNode.initialY;
      setDraggingNode((current) => current ? { ...current, historyStarted: true, deltaX: groupDeltaX, deltaY: groupDeltaY } : current);
      return;
    }
    if (draggingNote) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const deltaX = (event.clientX - draggingNote.startX) / displayScale / zoom;
      const deltaY = (event.clientY - draggingNote.startY) / displayScale / zoom;
      if (!draggingNote.historyStarted && Math.hypot(deltaX, deltaY) < 2) return;
      if (!draggingNote.historyStarted) {
        onHistoryGroupStart?.();
        setDraggingNote((current) => current ? { ...current, historyStarted: true } : current);
      }
      setDraggingNote((current) => current ? { ...current, deltaX: Math.round(deltaX), deltaY: Math.round(deltaY) } : current);
      return;
    }
    if (connectingWire && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const snapTarget = settings.magneticSnap === false ? null : findClosestPin(event.clientX, event.clientY, connectingWire);
      const currentPos = snapTarget
        ? {
            x: ((snapTarget.screenPosition.x - rect.left) / displayScale - pan.x) / zoom,
            y: ((snapTarget.screenPosition.y - rect.top) / displayScale - pan.y) / zoom
          }
        : { x: ((event.clientX - rect.left) / displayScale - pan.x) / zoom, y: ((event.clientY - rect.top) / displayScale - pan.y) / zoom };
      setConnectingWire((current) => current ? ({
        ...current,
        currentPos,
        snapTarget
      }) : current);
    }
  };

  pointerMoveHandlerRef.current = movePointer;
  const schedulePointerMoveFrame = () => {
    if (pointerMoveFrameRef.current) return;
    pointerMoveFrameRef.current = window.requestAnimationFrame((timestamp) => {
      pointerMoveFrameRef.current = 0;
      const pending = pendingPointerMoveRef.current;
      pendingPointerMoveRef.current = null;
      if (pending) pointerMoveHandlerRef.current?.(pending);

      const activeDrag = draggingNodeRef.current;
      const pointer = pointerPositionRef.current;
      const container = containerRef.current;
      if (activeDrag && pointer && container && document.visibilityState !== 'hidden') {
        const bounds = container.getBoundingClientRect();
        const edgeSize = 56;
        const speed = 760;
        const axisVelocity = (position, size) => {
          if (position < edgeSize) return speed * Math.max(0, Math.min(1, (edgeSize - position) / edgeSize));
          if (position > size - edgeSize) return -speed * Math.max(0, Math.min(1, (position - (size - edgeSize)) / edgeSize));
          return 0;
        };
        const elapsed = autoPanFrameTimeRef.current ? Math.min(32, timestamp - autoPanFrameTimeRef.current) : 16;
        autoPanFrameTimeRef.current = timestamp;
        const displayScale = getCanvasDisplayScale(container);
        const deltaPanX = axisVelocity(pointer.x - bounds.left, bounds.width) * elapsed / 1000 / displayScale;
        const deltaPanY = axisVelocity(pointer.y - bounds.top, bounds.height) * elapsed / 1000 / displayScale;
        if (deltaPanX || deltaPanY) {
          const nextPan = { x: viewportRef.current.pan.x + deltaPanX, y: viewportRef.current.pan.y + deltaPanY };
          setPan(nextPan);
          if (!activeDrag.historyStarted) onHistoryGroupStart?.();
          const deltaX = ((pointer.x - activeDrag.startX) / displayScale - (nextPan.x - activeDrag.startPan.x)) / zoom;
          const deltaY = ((pointer.y - activeDrag.startY) / displayScale - (nextPan.y - activeDrag.startPan.y)) / zoom;
          const x = snapToGrid ? Math.round((activeDrag.initialX + deltaX) / GRID_SIZE) * GRID_SIZE : activeDrag.initialX + deltaX;
          const y = snapToGrid ? Math.round((activeDrag.initialY + deltaY) / GRID_SIZE) * GRID_SIZE : activeDrag.initialY + deltaY;
          setDraggingNode((current) => current ? { ...current, historyStarted: true, deltaX: x - current.initialX, deltaY: y - current.initialY } : current);
        }
      } else autoPanFrameTimeRef.current = 0;

      const timing = frameTimingRef.current;
      if (document.visibilityState === 'hidden') {
        timing.last = 0;
      } else if (timing.last) {
        const interval = timestamp - timing.last;
        timing.samples += 1;
        if (interval > 24) { timing.slow += 1; timing.fast = 0; }
        else if (interval <= 18) { timing.fast += 1; timing.slow = Math.max(0, timing.slow - 1); }
        else { timing.fast = 0; }

        if (canvasQualityModeRef.current === 'auto') {
          if (!performanceReducedRef.current && timing.samples >= 30) {
            if (timing.slow >= 8) setPerformanceReduced(true);
            timing.samples = 0;
            timing.slow = 0;
          } else if (performanceReducedRef.current && timing.fast >= 180) {
            setPerformanceReduced(false);
            timing.samples = 0;
            timing.fast = 0;
          } else if (timing.samples >= 60) {
            timing.samples = 0;
            timing.slow = 0;
          }
        } else {
          timing.samples = 0;
          timing.slow = 0;
          timing.fast = 0;
        }
      }
      timing.last = document.visibilityState === 'hidden' ? 0 : timestamp;

      if (canvasInteractionActiveRef.current) schedulePointerMoveFrame();
      else timing.last = 0;
    });
  };
  const queuePointerMove = (event) => {
    if (event.pointerType === 'touch' && touchPinchRef.current && event.cancelable) event.preventDefault();
    pendingPointerMoveRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      target: event.target,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      preventDefault() {}
    };
    canvasInteractionActiveRef.current = true;
    schedulePointerMoveFrame();
  };

  useEffect(() => () => {
    if (pointerMoveFrameRef.current) window.cancelAnimationFrame(pointerMoveFrameRef.current);
    pointerMoveFrameRef.current = 0;
    pendingPointerMoveRef.current = null;
  }, []);

  const connectPins = (start, end, replacedConnectionId = null) => {
    if (!isCompatiblePin(start, end)) return;
    const source = start.direction === 'output' ? start : end;
    const target = start.direction === 'input' ? start : end;
    const allowsExecFanIn = target.pinType === 'exec';
    const next = connections.filter((connection) => connection.id !== replacedConnectionId && (allowsExecFanIn || !(connection.targetNodeId === target.nodeId && connection.targetPinId === target.pinId)));
    next.push({
      id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sourceNodeId: source.nodeId,
      sourcePinId: source.pinId,
      targetNodeId: target.nodeId,
      targetPinId: target.pinId,
      type: source.pinType
    });
    onConnectionsChange?.(next);
  };

  const finishPointer = (event, activeWire = connectingWire) => {
    if (drawingArrow) {
      const bounds = containerRef.current?.getBoundingClientRect();
      const scale = getCanvasDisplayScale(containerRef.current);
      const end = bounds ? {
        x: Math.round(((event.clientX - bounds.left) / scale - pan.x) / zoom),
        y: Math.round(((event.clientY - bounds.top) / scale - pan.y) / zoom)
      } : drawingArrow.end;
      setDrawingArrow(null);
      onCollaborationAction?.({ kind: 'cursor', cursor: end, mode: 'move', selectedNodeIds }, true);
      if (!canvasLocked && Math.hypot(end.x - drawingArrow.start.x, end.y - drawingArrow.start.y) >= 8) {
        const now = Date.now();
        const clientActionId = globalThis.crypto?.randomUUID?.() || `local-arrow-${now}-${Math.random().toString(36).slice(2)}`;
        const payload = { start: drawingArrow.start, end, clientActionId };
        setLocalTransientArrows((previous) => [...previous, {
          id: `local_arrow_${clientActionId}`,
          ...payload,
          color: currentUser?.color || getCollaboratorColor(currentUser?.id),
          createdBy: currentUser?.username || 'You',
          createdById: currentUser?.id || '',
          createdByRole: currentUser?.role || 'viewer',
          createdAt: now,
          expiresAt: now + 12_000,
          locked: false
        }]);
        onCanvasArrowAction?.('create', payload);
      }
      return;
    }
    if (draggingArrows) {
      const scale = getCanvasDisplayScale(containerRef.current);
      const deltaX = Math.round(((event.clientX - draggingArrows.startX) / scale - (pan.x - draggingArrows.startPan.x)) / zoom);
      const deltaY = Math.round(((event.clientY - draggingArrows.startY) / scale - (pan.y - draggingArrows.startPan.y)) / zoom);
      const moved = Math.hypot(deltaX, deltaY) >= 1;
      if (moved) {
        const positions = new Map(draggingArrows.ids.map((id) => {
          const initial = draggingArrows.initial[id];
          return [id, { start: { x: initial.start.x + deltaX, y: initial.start.y + deltaY }, end: { x: initial.end.x + deltaX, y: initial.end.y + deltaY } }];
        }));
        const lockedIds = new Set(draggingArrows.ids.filter((id) => arrows.some((arrow) => arrow.id === id && arrow.locked)));
        const nextArrows = arrows.map((arrow) => positions.has(arrow.id) && lockedIds.has(arrow.id)
          ? { ...arrow, ...positions.get(arrow.id) }
          : arrow);
        if (lockedIds.size) {
          onHistoryGroupStart?.();
          onArrowsChange?.(nextArrows);
          onHistoryGroupEnd?.();
        }
        const transientMoves = draggingArrows.ids.filter((id) => !lockedIds.has(id)).map((id) => ({ id, ...positions.get(id) }));
        if (transientMoves.length && (!onCanvasArrowAction || onCanvasArrowAction('move-many', { arrows: transientMoves }) === false)) {
          const fallback = new Map(transientMoves.map((arrow) => [arrow.id, arrow]));
          const sourceById = new Map(canvasArrows.map((arrow) => [arrow.id, arrow]));
          setLocalTransientArrows((previous) => [
            ...previous.filter((arrow) => !fallback.has(arrow.id)),
            ...transientMoves.flatMap((move) => {
              const source = sourceById.get(move.id);
              return source ? [{ ...source, ...move }] : [];
            })
          ]);
        }
      }
      setDraggingArrows(null);
      return;
    }
    let finalSelectedNodeIds = selectedNodeIds;
    let finalSelectedNoteIds = selectedNoteIds;
    let finalSelectedArrowIds = selectedArrowIds;
    const finishedDraggingNode = draggingNode;
    const finishBounds = containerRef.current?.getBoundingClientRect();
    const finishScale = getCanvasDisplayScale(containerRef.current);
    const finishCursor = finishBounds ? {
      x: ((event.clientX - finishBounds.left) / finishScale - pan.x) / zoom,
      y: ((event.clientY - finishBounds.top) / finishScale - pan.y) / zoom
    } : collaborationCursorRef.current;
    const finalNodeDelta = finishedDraggingNode ? {
      x: ((event.clientX - finishedDraggingNode.startX) / finishScale - (pan.x - finishedDraggingNode.startPan.x)) / zoom,
      y: ((event.clientY - finishedDraggingNode.startY) / finishScale - (pan.y - finishedDraggingNode.startPan.y)) / zoom
    } : null;
    let finalNodeX = finishedDraggingNode ? finishedDraggingNode.initialX + finalNodeDelta.x : 0;
    let finalNodeY = finishedDraggingNode ? finishedDraggingNode.initialY + finalNodeDelta.y : 0;
    if (finishedDraggingNode && snapToGrid) { finalNodeX = Math.round(finalNodeX / GRID_SIZE) * GRID_SIZE; finalNodeY = Math.round(finalNodeY / GRID_SIZE) * GRID_SIZE; }
    const finalNodeMoveX = finishedDraggingNode ? finalNodeX - finishedDraggingNode.initialX : 0;
    const finalNodeMoveY = finishedDraggingNode ? finalNodeY - finishedDraggingNode.initialY : 0;
    const nodeMoveStarted = Boolean(finishedDraggingNode && (finishedDraggingNode.historyStarted || Math.hypot(finalNodeDelta.x * zoom, finalNodeDelta.y * zoom) >= 2));
    const finalNodePositions = nodeMoveStarted ? (finishedDraggingNode.nodeIds || [finishedDraggingNode.id]).map((id) => {
      const initial = finishedDraggingNode.initialPositions?.[id] || nodes.find((item) => item.id === id) || { x: 0, y: 0 };
      return { id, x: Math.round(initial.x + finalNodeMoveX), y: Math.round(initial.y + finalNodeMoveY) };
    }) : undefined;
    const finishedNodePositions = collaborationMotionSupported ? finalNodePositions : undefined;
    if (nodeMoveStarted && finalNodePositions?.length) {
      const finalPositionsById = new Map(finalNodePositions.map((position) => [position.id, position]));
      onNodesChange?.(nodes.map((node) => finalPositionsById.has(node.id) ? { ...node, ...finalPositionsById.get(node.id) } : node));
    }
    const finalNoteDelta = draggingNote ? {
      x: Math.round((event.clientX - draggingNote.startX) / finishScale / zoom),
      y: Math.round((event.clientY - draggingNote.startY) / finishScale / zoom)
    } : null;
    const noteMoveStarted = Boolean(draggingNote && (draggingNote.historyStarted || Math.hypot(finalNoteDelta.x, finalNoteDelta.y) >= 2));
    const finishedNotePositions = collaborationMotionSupported && noteMoveStarted ? (draggingNote.noteIds || [draggingNote.id]).map((id) => {
      const note = notes.find((item) => item.id === id);
      if (!note) return null;
      const initial = draggingNote.initialPositions[id] || { x: note.x, y: note.y };
      return { id, x: initial.x + finalNoteDelta.x, y: initial.y + finalNoteDelta.y };
    }).filter(Boolean) : undefined;
    if (!isLocked && finishedDraggingNode && (event.altKey || altDownRef.current || finishedDraggingNode.altKey)) {
      const selectedIds = [...new Set(finishedDraggingNode.nodeIds || [finishedDraggingNode.id])];
      const bounds = containerRef.current?.getBoundingClientRect();
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const point = bounds ? {
        x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom,
        y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom
      } : null;
      const targetGroup = point && tagGroupLayouts
        .filter((group) => point.x >= group.left && point.x <= group.left + group.width && point.y >= group.top && point.y <= group.top + group.height)
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
      const finalPositionById = new Map((finalNodePositions || []).map((position) => [position.id, position]));
      const finalNodes = new Map(nodes.map((node) => [node.id, finalPositionById.has(node.id) ? { ...node, ...finalPositionById.get(node.id) } : node]));
      const cards = new Map(Array.from(containerRef.current?.querySelectorAll('[data-node-card-id]') || [], (card) => [card.dataset.nodeCardId, card]));
      const scale = getCanvasDisplayScale(containerRef.current) * zoom;
      const isInsideGroup = (nodeId, group) => {
        const node = finalNodes.get(nodeId);
        if (!node || !group) return false;
        const rect = cards.get(nodeId)?.getBoundingClientRect();
        const cachedSize = nodeWorldSizeCacheRef.current.sizes.get(nodeId);
        const width = rect?.width && scale ? rect.width / scale : cachedSize?.width || NODE_WIDTH;
        const height = rect?.height && scale ? rect.height / scale : cachedSize?.height || estimateNodeCardHeight(node, getNodeDefinition(node));
        return node.x >= group.left && node.y >= group.top && node.x + width <= group.left + group.width && node.y + height <= group.top + group.height;
      };
      const nextGroups = tagGroups.map((group) => {
        const layout = tagGroupLayouts.find((item) => item.id === group.id);
        let nodeIds = (group.nodeIds || []).filter((id) => !selectedIds.includes(id) || isInsideGroup(id, layout));
        if (targetGroup?.id === group.id) nodeIds = [...new Set([...nodeIds, ...selectedIds.filter((id) => isInsideGroup(id, layout))])];
        return nodeIds.length === (group.nodeIds || []).length && nodeIds.every((id, index) => id === group.nodeIds[index])
          ? group
          : { ...group, nodeIds };
      });
      if (nextGroups.some((group, index) => group !== tagGroups[index])) onTagGroupsChange?.(nextGroups);
    }
    const marqueeStart = selectionStartRef.current;
    if (marqueeStart) {
      const moved = selectionBox && Math.hypot(selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1) > 4;
      if (moved) {
        const box = { left: Math.min(selectionBox.x1, selectionBox.x2), right: Math.max(selectionBox.x1, selectionBox.x2), top: Math.min(selectionBox.y1, selectionBox.y2), bottom: Math.max(selectionBox.y1, selectionBox.y2) };
        const hitIds = [...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])].filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.right >= box.left && rect.left <= box.right && rect.bottom >= box.top && rect.top <= box.bottom;
        }).map((card) => card.dataset.nodeCardId);
        const hitNoteIds = [...(containerRef.current?.querySelectorAll('[data-note-id]') || [])].filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.right >= box.left && rect.left <= box.right && rect.bottom >= box.top && rect.top <= box.bottom;
        }).map((card) => card.dataset.noteId);
        const hitArrowIds = [...(containerRef.current?.querySelectorAll('[data-arrow-id]') || [])].filter((path) => {
          const rect = path.getBoundingClientRect();
          return rect.right >= box.left && rect.left <= box.right && rect.bottom >= box.top && rect.top <= box.bottom;
        }).map((path) => path.dataset.arrowId);
        finalSelectedNodeIds = marqueeStart.additive ? [...new Set([...selectedNodeIds, ...hitIds])] : hitIds;
        finalSelectedNoteIds = marqueeStart.additive ? [...new Set([...selectedNoteIds, ...hitNoteIds])] : hitNoteIds;
        finalSelectedArrowIds = marqueeStart.additive ? [...new Set([...selectedArrowIds, ...hitArrowIds])] : hitArrowIds;
        selectNodes(finalSelectedNodeIds, finalSelectedNodeIds[finalSelectedNodeIds.length - 1] || null, { preserveNotes: true });
        setSelectedNoteIds(finalSelectedNoteIds);
        setSelectedArrowIds(finalSelectedArrowIds);
      } else if (!marqueeStart.additive) {
        finalSelectedNodeIds = [];
        finalSelectedNoteIds = [];
        finalSelectedArrowIds = [];
        selectNodes([]);
        setSelectedNoteIds([]);
        setSelectedArrowIds([]);
      }
      selectionStartRef.current = null;
      setSelectionBox(null);
    }
    if (isPanning) setPan(viewportRef.current.pan);
    setIsPanning(false);
    setDraggingNode(null);
    if (draggingNote) {
      if (noteMoveStarted) {
        if (!draggingNote.historyStarted) onHistoryGroupStart?.();
        const movingIds = new Set(draggingNote.noteIds || [draggingNote.id]);
        const deltaX = finalNoteDelta.x;
        const deltaY = finalNoteDelta.y;
        onNotesChange?.(notes.map((note) => {
          if (!movingIds.has(note.id)) return note;
          const initial = draggingNote.initialPositions[note.id] || { x: note.x, y: note.y };
          return { ...note, x: initial.x + deltaX, y: initial.y + deltaY };
        }));
      }
      setDraggingNote(null);
    }
    onHistoryGroupEnd?.();
    if (activeWire?.clickToConnect) {
      setConnectingWire((current) => current ? { ...current, currentPos: finishBounds ? {
        x: ((event.clientX - finishBounds.left) / finishScale - pan.x) / zoom,
        y: ((event.clientY - finishBounds.top) / finishScale - pan.y) / zoom
      } : current.currentPos } : null);
    } else if (activeWire) {
      const snapTarget = settings.magneticSnap === false ? null : findClosestPin(event.clientX, event.clientY, activeWire, 30);
      const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.node-pin-row');
      const target = snapTarget || pinFromRow(targetRow);
      if (isCompatiblePin(activeWire, target)) connectPins(activeWire, target, activeWire.connectionId);
      else if (activeWire.originalConnection) onConnectionsChange?.([...connections.filter((item) => item.id !== activeWire.originalConnection.id), activeWire.originalConnection]);
      else if (targetRow && targetRow.dataset.nodeId !== activeWire.nodeId) shakeNode(targetRow.closest('[data-node-card-id]')?.dataset.nodeCardId);
      setConnectingWire(null);
    }
    if (finalSelectedNodeIds.length || finalSelectedNoteIds.length || finalSelectedArrowIds.length || marqueeStart) onCollaborationAction?.({ kind: 'selection', cursor: finishCursor, selectedNodeIds: finalSelectedNodeIds, selectedNoteIds: finalSelectedNoteIds, selectedArrowIds: finalSelectedArrowIds, nodePositions: finishedNodePositions, notePositions: finishedNotePositions }, true);
    else if (finishCursor) onCollaborationAction?.({ kind: 'cursor', cursor: finishCursor, mode: 'move', selectedNodeIds, nodePositions: finishedNodePositions, notePositions: finishedNotePositions }, true);
  };

  const finishCanvasPointer = (event) => {
    if (pointerMoveFrameRef.current) window.cancelAnimationFrame(pointerMoveFrameRef.current);
    pointerMoveFrameRef.current = 0;
    pendingPointerMoveRef.current = null;
    canvasInteractionActiveRef.current = false;
    movePointer(event);
    pendingPinDragRef.current = null;
    const wasPinching = event.pointerType === 'touch' && Boolean(touchPinchRef.current);
    if (event.pointerType === 'touch') touchPointersRef.current.delete(event.pointerId);
    if (wasPinching) {
      touchPinchRef.current = null;
      selectionStartRef.current = null;
      setSelectionBox(null);
      setIsPanning(false);
      setDraggingNode(null);
      setDraggingNote(null);
      onHistoryGroupEnd?.();
      if (collaborationCursorRef.current) onCollaborationAction?.({ kind: 'cursor', cursor: collaborationCursorRef.current, mode: 'move', selectedNodeIds }, true);
      return;
    }
    finishPointer(event, connectingWireRef.current || connectingWire);
  };

  const startWire = (event, nodeId, pinId, direction, pinType) => {
    if (event.button !== 0 || isLocked) return;
    event.stopPropagation();
    const position = getSocketPosition(nodeId, pinId, direction);
    const bounds = containerRef.current.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const pointer = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
    setConnectingWire({ nodeId, pinId, direction, pinType, startPos: position, currentPos: pointer, snapTarget: null });
      onCollaborationAction?.({ kind: 'wire-drag', cursor: pointer, start: position, pinType, nodeId, pinId, direction });
    if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const startWireFromConnection = (event, connection, direction = 'output', moveExisting = false) => {
    if (isLocked || !containerRef.current) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const nodeId = direction === 'output' ? connection.sourceNodeId : connection.targetNodeId;
    const pinId = direction === 'output' ? connection.sourcePinId : connection.targetPinId;
    const node = nodeById.get(nodeId);
    const pin = direction === 'output'
      ? getNodeDefinition(node)?.outputs?.find((item) => item.id === pinId)
      : getNodeDefinition(node)?.inputs?.find((item) => item.id === pinId);
    if (!pin) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const pointer = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
    setConnectingWire({ nodeId, pinId, direction, pinType: pin.type, startPos: getSocketPosition(nodeId, pinId, direction), currentPos: pointer, snapTarget: null, connectionId: moveExisting ? connection.id : null, originalConnection: moveExisting ? connection : null });
    onCollaborationAction?.({ kind: 'wire-drag', cursor: pointer, start: getSocketPosition(nodeId, pinId, direction), pinType: pin.type, nodeId, pinId, direction });
    if (moveExisting) onConnectionsChange?.(connections.filter((item) => item.id !== connection.id));
    if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const startWireFromInput = (event, nodeId, pinId) => {
    const connection = connections.find((item) => item.targetNodeId === nodeId && item.targetPinId === pinId);
    if (connection) startWireFromConnection(event, connection, 'output', false);
  };

  const startWireFromOutput = (event, nodeId, pinId) => {
    const connection = connections.find((item) => item.sourceNodeId === nodeId && item.sourcePinId === pinId);
    if (connection) startWireFromConnection(event, connection, 'output', true);
  };

  const handlePinPointerDownCapture = (event) => {
    if (event.button === 0 && event.altKey && event.shiftKey && !canvasLocked
      && containerRef.current?.contains(event.target)
      && !(event.target instanceof Element && event.target.closest('.canvas-tools, .canvas-breadcrumbs, [data-arrow-control-id]'))) {
      const bounds = containerRef.current.getBoundingClientRect();
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const point = {
        x: Math.round(((event.clientX - bounds.left) / displayScale - pan.x) / zoom),
        y: Math.round(((event.clientY - bounds.top) / displayScale - pan.y) / zoom)
      };
      event.preventDefault();
      event.stopPropagation();
      setSelectedNodeIds([]);
      setSelectedNodeId(null);
      setSelectedNoteIds([]);
      setSelectedArrowIds([]);
      setDrawingArrow({ start: point, end: point });
      onCollaborationAction?.({ kind: 'arrow-drag', cursor: point, start: point });
      containerRef.current.setPointerCapture?.(event.pointerId);
      return;
    }
    const row = event.target instanceof Element ? event.target.closest('.node-pin-row') : null;
    if (event.button !== 0 || !row || !containerRef.current?.contains(row)) {
      pinDoubleClickRef.current = null;
      if (event.button === 0 && connectingWireRef.current?.clickToConnect && containerRef.current?.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        cancelConnectingWire();
      }
      return;
    }

    const { nodeId, pinId, direction } = row.dataset;
    const target = { nodeId, pinId, direction, pinType: row.dataset.pinType };
    const activeWire = connectingWireRef.current;
    if (activeWire?.clickToConnect) {
      event.preventDefault();
      event.stopPropagation();
      pinDoubleClickRef.current = null;
      if (!isLocked && isCompatiblePin(activeWire, target)) {
        connectPins(activeWire, target, activeWire.connectionId);
        setConnectingWire(null);
      } else cancelConnectingWire();
      return;
    }

    const now = performance.now();
    const previous = pinDoubleClickRef.current;
    const isDoubleClick = previous?.nodeId === nodeId && previous.pinId === pinId && previous.direction === direction
      && previous.pointerType === event.pointerType && now - previous.at <= 650 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 18;
    pinDoubleClickRef.current = isDoubleClick ? null : { nodeId, pinId, direction, pointerType: event.pointerType, at: now, x: event.clientX, y: event.clientY };
    if (!isDoubleClick || isLocked) {
      if (direction === 'output' && !isLocked) {
        event.preventDefault();
        event.stopPropagation();
        pendingPinDragRef.current = {
          nodeId,
          pinId,
          direction,
          pinType: target.pinType,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY
        };
        if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const originalConnection = direction === 'input'
      ? connections.find((connection) => connection.targetNodeId === nodeId && connection.targetPinId === pinId)
      : null;
    if (direction === 'input' && !originalConnection) return;
    const wireStart = direction === 'input' && originalConnection
      ? {
          nodeId: originalConnection.sourceNodeId,
          pinId: originalConnection.sourcePinId,
          direction: 'output',
          pinType: originalConnection.type || target.pinType
        }
      : target;
    const bounds = containerRef.current.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const pointer = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
    const nextWire = {
      ...wireStart,
      startPos: getSocketPosition(wireStart.nodeId, wireStart.pinId, wireStart.direction),
      currentPos: pointer,
      snapTarget: null,
      clickToConnect: true,
      connectionId: originalConnection?.id || null,
      originalConnection: originalConnection || null
    };
    connectingWireRef.current = nextWire;
    setConnectingWire(nextWire);
    onCollaborationAction?.({ kind: 'wire-drag', cursor: pointer, start: getSocketPosition(wireStart.nodeId, wireStart.pinId, wireStart.direction), pinType: wireStart.pinType, nodeId: wireStart.nodeId, pinId: wireStart.pinId, direction: wireStart.direction });
  };

  const cutWire = (event, connection) => {
    if (isLocked) return;
    const existingTimer = wireCutTimersRef.current.get(connection.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    if (settings.reduceMotion) {
      setWireCutAnimations((current) => current.filter((item) => item.id !== connection.id));
      wireCutTimersRef.current.delete(connection.id);
      onConnectionsChange?.(connections.filter((item) => item.id !== connection.id));
      return;
    }
    const pathElement = event.currentTarget;
    const segments = getWireCutSegments(pathElement, event);
    const sourceNode = nodeById.get(connection.sourceNodeId);
    const targetNode = nodeById.get(connection.targetNodeId);
    const sourcePin = getNodeDefinition(sourceNode)?.outputs?.find((pin) => pin.id === connection.sourcePinId);
    const targetPin = getNodeDefinition(targetNode)?.inputs?.find((pin) => pin.id === connection.targetPinId);
    const pinType = sourcePin?.colorType || sourcePin?.type || targetPin?.colorType || targetPin?.type;
    setWireCutAnimations((current) => [...current.filter((item) => item.id !== connection.id), { id: connection.id, segments, color: PinColors[pinType] || '#9299a6' }]);
    const timer = window.setTimeout(() => {
      wireCutTimersRef.current.delete(connection.id);
      setWireCutAnimations((current) => current.filter((item) => item.id !== connection.id));
      onConnectionsChange?.(connections.filter((item) => item.id !== connection.id));
    }, 230);
    wireCutTimersRef.current.set(connection.id, timer);
  };

  const beginNodeDrag = (event, node) => {
    if (isLocked || event.button !== 0 || spaceDownRef.current || event.target.closest('button, input, textarea, select, [data-pin-id], .node-config')) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      const nextIds = selectedNodeIds.includes(node.id) ? selectedNodeIds.filter((id) => id !== node.id) : [...selectedNodeIds, node.id];
      selectNodes(nextIds, nextIds.includes(node.id) ? node.id : nextIds[nextIds.length - 1] || null, { preserveNotes: true });
      return;
    }
    setSelectedNoteIds([]);
    let nextIds = selectedNodeIds;
    if (!selectedNodeIds.includes(node.id)) nextIds = [node.id];
    selectNodes(nextIds, node.id);
    const movingIds = nextIds.includes(node.id) ? nextIds : [node.id];
    const initialPositions = Object.fromEntries(nodes.filter((item) => movingIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]));
    setDraggingNode({ id: node.id, nodeIds: movingIds, initialPositions, startX: event.clientX, startY: event.clientY, startPan: viewportRef.current.pan, initialX: node.x, initialY: node.y, historyStarted: false, altKey: event.altKey });
    containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const fitView = () => {
    if (textInputPopupOpen()) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || !nodes.length) { setZoom(1); setPan({ x: 22, y: 18 }); return; }
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const viewWidth = bounds.width / displayScale;
    const viewHeight = bounds.height / displayScale;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const cards = new Map([...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])].map((card) => [card.dataset.nodeCardId, card]));
    const maxX = Math.max(...nodes.map((node) => node.x + (cards.get(node.id)?.getBoundingClientRect().width / displayScale / zoom || nodeWorldSizeCacheRef.current.sizes.get(node.id)?.width || NODE_WIDTH)));
    const maxY = Math.max(...nodes.map((node) => node.y + (cards.get(node.id)?.getBoundingClientRect().height / displayScale / zoom || nodeWorldSizeCacheRef.current.sizes.get(node.id)?.height || estimateNodeCardHeight(node, getNodeDefinition(node)))));
    const nextZoom = clamp(Math.min((viewWidth - 120) / (maxX - minX + 32), (viewHeight - 120) / (maxY - minY + 32), 1.2), 0.25, 1.2);
    setZoom(nextZoom);
    setPan({ x: (viewWidth - (maxX - minX) * nextZoom) / 2 - minX * nextZoom, y: (viewHeight - (maxY - minY) * nextZoom) / 2 - minY * nextZoom });
  };

  const focusWorldPoint = useCallback((x, y) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const scale = getCanvasDisplayScale(containerRef.current);
    setPan({ x: bounds.width / scale / 2 - x * zoom, y: bounds.height / scale / 2 - y * zoom });
  }, [zoom]);

  const canvasFindResults = useMemo(() => {
    const query = canvasFindQuery.trim();
    if (!query) return { results: [], error: '' };
    let expression;
    try {
      const source = canvasFindRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expression = new RegExp(source, `gu${canvasFindCaseSensitive ? '' : 'i'}`);
    } catch (error) {
      return { results: [], error: error instanceof Error ? error.message : 'Invalid regular expression' };
    }
    const results = [];
    for (const node of nodes) {
      const definition = getNodeDefinition(node);
      const content = [
        node.id, node.label, definition?.label, definition?.category, node.type,
        ...(definition?.inputs || []).map((pin) => pin.label),
        ...(definition?.outputs || []).map((pin) => pin.label),
        JSON.stringify(node.data || {})
      ]
        .filter((value) => typeof value === 'string' && value.length)
        .join('\n');
      expression.lastIndex = 0;
      let match = expression.exec(content);
      while (match) {
        const start = match.index;
        const end = start + match[0].length;
        const isWord = (character) => Boolean(character && /[\p{L}\p{N}_]/u.test(character));
        if (!canvasFindWholeWord || (!isWord(content[start - 1]) && !isWord(content[end]))) {
          results.push(node);
          break;
        }
        if (!expression.global) break;
        if (match[0].length === 0) expression.lastIndex += 1;
        match = expression.exec(content);
      }
    }
    return { results, error: '' };
  }, [canvasFindQuery, canvasFindCaseSensitive, canvasFindWholeWord, canvasFindRegex, nodes, getNodeDefinition]);
  const canvasFindResultIds = useMemo(() => new Set(canvasFindResults.results.map((node) => node.id)), [canvasFindResults.results]);
  const canvasFindCurrentNodeId = canvasFindOpen && canvasFindQuery.trim()
    ? canvasFindResults.results[canvasFindIndex]?.id
    : undefined;

  const navigateCanvasFind = useCallback((direction) => {
    const results = canvasFindResults.results;
    if (!results.length) {
      setCanvasFindIndex(-1);
      return;
    }
    const nextIndex = canvasFindIndex < 0
      ? (direction > 0 ? 0 : results.length - 1)
      : (canvasFindIndex + direction + results.length) % results.length;
    setCanvasFindIndex(nextIndex);
    const node = results[nextIndex];
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedNoteIds([]);
    const size = nodeWorldSizeCacheRef.current.sizes.get(node.id);
    focusWorldPoint(node.x + (size?.width || NODE_WIDTH) / 2, node.y + (size?.height || estimateNodeCardHeight(node, getNodeDefinition(node))) / 2);
  }, [canvasFindResults, canvasFindIndex, focusWorldPoint, getNodeDefinition]);

  useEffect(() => {
    if (!canvasFindOpen) return undefined;
    const frame = window.requestAnimationFrame(() => canvasFindInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [canvasFindOpen]);

  useEffect(() => {
    const closeCanvasFind = () => setCanvasFindOpen(false);
    window.addEventListener('arc:canvas-find-close', closeCanvasFind);
    return () => window.removeEventListener('arc:canvas-find-close', closeCanvasFind);
  }, []);

  useEffect(() => {
    setCanvasFindIndex((current) => current >= canvasFindResults.results.length ? -1 : current);
  }, [canvasFindResults.results.length]);

  useEffect(() => {
    if (!canvasFindOpen) return undefined;
    const dismissOutside = (event) => {
      if (event.target instanceof Element && !event.target.closest('.canvas-tools')) setCanvasFindOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [canvasFindOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      const command = event.metaKey || event.ctrlKey;
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      );
      if (canvasFindOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setCanvasFindOpen(false);
        return;
      }
      const isCanvasTarget = target instanceof HTMLElement && Boolean(target.closest('.node-canvas'));
      if (command && !event.altKey && event.key.toLowerCase() === 'f' && (!isEditing || isCanvasTarget)) {
        event.preventDefault();
        if (canvasFindOpen) {
          canvasFindInputRef.current?.focus();
          canvasFindInputRef.current?.select();
          return;
        }
        setCanvasFindQuery('');
        setCanvasFindIndex(-1);
        setContextMenu(null);
        setCanvasFindOpen(true);
        return;
      }
      if (canvasFindOpen && command && !event.altKey && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        navigateCanvasFind(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canvasFindOpen, navigateCanvasFind]);

  const handledFollowRequestRef = useRef(null);
  useEffect(() => {
    if (!followRequest || followRequest.graphId !== graphId || handledFollowRequestRef.current === followRequest.requestId) return;
    const peer = remoteActions.find((item) => item.graphId === graphId && item.userId === followRequest.userId && item.action?.cursor
      && Number.isFinite(item.action.cursor.x) && Number.isFinite(item.action.cursor.y));
    if (!peer) return;
    const frame = window.requestAnimationFrame(() => {
      if (handledFollowRequestRef.current === followRequest.requestId) return;
      focusWorldPoint(peer.action.cursor.x, peer.action.cursor.y);
      handledFollowRequestRef.current = followRequest.requestId;
      onFollowComplete?.(followRequest.requestId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [followRequest, focusWorldPoint, graphId, onFollowComplete, remoteActions]);

  const computePath = (x1, y1, x2, y2) => {
    if (wireStyle === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`;
    const curve = Math.max(Math.abs(x2 - x1) * 0.5, 52);
    return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
  };
  const arrowMarkerId = `canvas-arrow-head-${String(projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '')}-${String(graphId || 'active').replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const getArrowMarkerId = (id) => `${arrowMarkerId}-${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const openContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (rightPanMovedRef.current) { rightPanMovedRef.current = false; rightPanOriginRef.current = null; return; }
    rightPanOriginRef.current = null;
    if (settings.canvasRightClickPan && event.button === 2 && isCanvasBackgroundTarget(event.target)) return;
    if (event.target.closest?.('.canvas-tools, .canvas-breadcrumbs')) return;
    const nodeCard = event.target.closest?.('[data-node-card-id]');
    const noteCard = event.target.closest?.('[data-note-id]');
    const arrowPath = event.target.closest?.('[data-arrow-id]');
    const arrowControl = event.target.closest?.('[data-arrow-control-id]');
    const tagGroupElement = event.target.closest?.('[data-tag-group-id]');
    const wireGroup = event.target.closest?.('[data-wire-id]');
    const nodeId = nodeCard?.dataset.nodeCardId || null;
    const noteId = noteCard?.dataset.noteId || null;
    const arrowId = arrowPath?.dataset.arrowId || arrowControl?.dataset.arrowControlId || null;
    const groupId = tagGroupElement?.dataset.tagGroupId || null;
    if (nodeId && !selectedNodeIds.includes(nodeId)) selectNodes([nodeId], nodeId);
    if (noteId && !selectedNoteIds.includes(noteId)) selectNotes([noteId]);
    if (arrowId) {
      const nextArrowIds = selectedArrowIds.includes(arrowId) ? selectedArrowIds : [arrowId];
      if (!selectedArrowIds.includes(arrowId)) {
        setSelectedNodeIds([]);
        setSelectedNodeId(null);
        setSelectedNoteIds([]);
        setSelectedArrowIds(nextArrowIds);
      }
      onCollaborationAction?.({ kind: 'selection', selectedNodeIds: [], selectedNoteIds: [], selectedArrowIds: nextArrowIds });
    }
    setContextMenu({
      x: Math.max(8, event.clientX),
      y: Math.max(8, event.clientY),
      position: (() => {
        const bounds = containerRef.current.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(containerRef.current);
        return { x: Math.round(((event.clientX - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((event.clientY - bounds.top) / displayScale - pan.y) / zoom) };
      })(),
      nodeId,
      noteId,
      arrowId,
      arrowIds: arrowId ? (selectedArrowIds.includes(arrowId) ? selectedArrowIds : [arrowId]) : selectedArrowIds,
      nodeIds: nodeId ? (selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId]) : selectedNodeIds,
      groupId,
      wireId: wireGroup?.dataset.wireId || null,
      node: nodeId ? nodes.find((node) => node.id === nodeId) : null
    });
  };

  const addNote = (position) => {
    if (isLocked) return;
    const now = new Date().toISOString();
    onNotesChange?.([...notes, { id: `note_${crypto.randomUUID()}`, x: position.x, y: position.y, text: '', color: '#f6d365', locked: false, createdAt: now, createdBy: currentUser?.username || 'Unknown', createdById: currentUser?.id || '', createdByRole: currentUser?.role || 'viewer', editedAt: now, editedBy: currentUser?.username || 'Unknown' }]);
    setContextMenu(null);
  };

  const updateNote = (noteId, patch) => onNotesChange?.(notes.map((note) => note.id === noteId ? { ...note, ...patch, editedAt: new Date().toISOString(), editedBy: currentUser?.username || 'Unknown' } : note));
  const isNoteBeingEditedByOther = (noteId) => {
    const lock = noteEditLocks[noteId];
    return Boolean(collaborationOnline && lock && (lock.userId !== currentUser?.id || lock.clientId !== collaborationClientId));
  };

  const gridSize = Math.max(12, GRID_SIZE * zoom);
  const inputConnectionByNodePin = connectionByNodePin.incoming;
  const tagGroupLayouts = useMemo(() => tagGroups.map((group) => {
    const members = nodes.filter((node) => (group.nodeIds || []).includes(node.id));
    const noteMembers = notes.filter((note) => (group.noteIds || []).includes(note.id));
    if (!members.length && !noteMembers.length) return null;
    const cards = new Map(Array.from(containerRef.current?.querySelectorAll('[data-node-card-id]') || [], (card) => [card.dataset.nodeCardId, card]));
    const scale = getCanvasDisplayScale(containerRef.current) * zoom;
    const measuredNodes = members.map((node) => {
      const card = cards.get(node.id);
      const rect = card?.getBoundingClientRect();
      const cachedSize = nodeWorldSizeCacheRef.current.sizes.get(node.id);
      const initialPosition = draggingNode && (draggingNode.altKey || altDownRef.current) ? draggingNode.initialPositions?.[node.id] : null;
      return { x: initialPosition?.x ?? node.x, y: initialPosition?.y ?? node.y, width: rect?.width && scale ? rect.width / scale : cachedSize?.width || NODE_WIDTH, height: rect?.height && scale ? rect.height / scale : cachedSize?.height || estimateNodeCardHeight(node, getNodeDefinition(node)) };
    });
    const measured = measuredNodes.length ? measuredNodes : noteMembers.map((note) => ({ x: note.x, y: note.y, width: 224, height: 156 }));
    const side = 28;
    const topPadding = 42;
    const left = Math.min(...measured.map((item) => item.x)) - side;
    const top = Math.min(...measured.map((item) => item.y)) - topPadding;
    const right = Math.max(...measured.map((item) => item.x + item.width)) + side;
    const bottom = Math.max(...measured.map((item) => item.y + item.height)) + side;
    return { ...group, left, top, width: right - left, height: bottom - top };
  }).filter(Boolean), [tagGroups, nodes, notes, zoom, wireLayoutRevision, nodeBoundsRevision, getNodeDefinition, draggingNode]);
  const nearbyTagGroups = (nodeIds) => {
    const selectedNodes = nodes.filter((node) => nodeIds.includes(node.id));
    if (!selectedNodes.length) return [];
    const nearbyLimit = NODE_WIDTH * 2.5;
    return tagGroupLayouts.map((group) => {
      const distance = Math.min(...selectedNodes.map((node) => {
        const nodeHeight = nodeWorldSizeCacheRef.current.sizes.get(node.id)?.height || estimateNodeCardHeight(node, getNodeDefinition(node));
        const dx = Math.max(group.left - (node.x + NODE_WIDTH), 0, node.x - (group.left + group.width));
        const dy = Math.max(group.top - (node.y + nodeHeight), 0, node.y - (group.top + group.height));
        return Math.hypot(dx, dy);
      }));
      return { group, distance };
    }).filter(({ distance }) => distance <= nearbyLimit)
      .sort((a, b) => a.distance - b.distance || a.group.name.localeCompare(b.group.name))
      .slice(0, 10)
      .map(({ group }) => group);
  };
  const tagGroupContainsNote = (group, note) => {
    if (!(group.noteIds || []).includes(note.id)) return false;
    const layout = tagGroupLayouts.find((item) => item.id === group.id);
    if (!layout) return false;
    const hasNodeMembers = nodes.some((node) => (group.nodeIds || []).includes(node.id));
    if (!hasNodeMembers) return true;
    const centerX = note.x + 112;
    const centerY = note.y + 78;
    return centerX >= layout.left && centerX <= layout.left + layout.width
      && centerY >= layout.top && centerY <= layout.top + layout.height;
  };
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(container);
    const centerX = (bounds.width / displayScale / 2 - pan.x) / zoom;
    const centerY = (bounds.height / displayScale / 2 - pan.y) / zoom;
    const section = tagGroupLayouts
      .filter((group) => centerX >= group.left && centerX <= group.left + group.width && centerY >= group.top && centerY <= group.top + group.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    setViewportSectionId((current) => current === (section?.id || null) ? current : section?.id || null);
  }, [pan, zoom, tagGroupLayouts, wireLayoutRevision]);
  const previousConnectedInputIdsRef = useRef(new Map());
  const connectedInputIds = useMemo(() => {
    const previous = previousConnectedInputIdsRef.current;
    const byNode = new Map();
    for (const connection of connections) {
      if (!byNode.has(connection.targetNodeId)) byNode.set(connection.targetNodeId, new Set());
      byNode.get(connection.targetNodeId).add(connection.targetPinId);
    }
    for (const [nodeId, pins] of byNode) {
      const oldPins = previous.get(nodeId);
      if (oldPins && oldPins.size === pins.size && [...pins].every((pinId) => oldPins.has(pinId))) byNode.set(nodeId, oldPins);
    }
    previousConnectedInputIdsRef.current = byNode;
    return byNode;
  }, [connections]);
  const { baseConnections, elevatedConnections, relatedNodeIds } = useMemo(() => {
    if (!selectedNodeIds.length) return { baseConnections: connections, elevatedConnections: [], relatedNodeIds: new Set() };
    const selectedIds = new Set(selectedNodeIds);
    const relatedIds = new Set(selectedNodeIds);
    const base = [];
    const elevated = [];
    for (const connection of connections) {
      if (selectedIds.has(connection.sourceNodeId) || selectedIds.has(connection.targetNodeId)) {
        elevated.push(connection);
        relatedIds.add(connection.sourceNodeId);
        relatedIds.add(connection.targetNodeId);
      } else {
        base.push(connection);
      }
    }
    return { baseConnections: base, elevatedConnections: elevated, relatedNodeIds: relatedIds };
  }, [connections, selectedNodeIds]);
const previewOutput = (node, outputId, seen = new Set()) => {
  if (!node || seen.has(node.id) || seen.size > 24) return undefined;
  const nextSeen = new Set(seen).add(node.id);
  const data = node.data || {};
  if (node.type.startsWith('event_') || node.type === 'function_input' || node.type === 'function_call') return undefined;
  if (node.type === 'value_text' || node.type === 'value_number' || node.type === 'value_boolean') return data.value ?? (node.type === 'value_boolean');
  if (node.type === 'variable_get') return canvasGraphVariables.find((item) => item.id === data.variableId)?.initialValue;
  const definition = getNodeDefinition(node);
  const input = (id, fallback) => {
    const wire = inputConnectionByNodePin.get(node.id)?.get(id);
    if (wire) return previewOutput(nodeById.get(wire.sourceNodeId), wire.sourcePinId, nextSeen);
    return data[id] ?? fallback;
  };
  if (node.type.startsWith('math_')) {
    const a = Number(input('a', 0)); const b = Number(input('b', 0)); const value = Number(input('value', 0));
    const operations = { math_add: a + b, math_subtract: a - b, math_multiply: a * b, math_divide: b ? a / b : 0, math_modulo: b ? a % b : 0, math_power: a ** b, math_min: Math.min(a, b), math_max: Math.max(a, b), math_abs: Math.abs(value), math_sqrt: value >= 0 ? Math.sqrt(value) : 0, math_round: Number(value.toFixed(Math.max(0, Math.min(12, Number(data.precision) || 0)))), math_floor: Math.floor(value), math_ceil: Math.ceil(value), math_sin: Math.sin(value), math_cos: Math.cos(value), math_tan: Math.tan(value), math_asin: Math.asin(value), math_acos: Math.acos(value), math_atan: Math.atan(value), math_log: value > 0 ? Math.log(value) : 0, math_log10: value > 0 ? Math.log10(value) : 0, math_exp: Math.exp(value), math_sign: Math.sign(value), math_clamp: Math.min(Number(input('max', 1)), Math.max(Number(input('min', 0)), value)), math_lerp: Number(input('a', 0)) + (Number(input('b', 1)) - Number(input('a', 0))) * Number(input('t', 0.5)), math_compare: ({ less_than: a < b, less_or_equal: a <= b, equal: a === b, not_equal: a !== b, greater_or_equal: a >= b, greater_than: a > b }[data.operation || 'less_than']) };
    if (node.type === 'math_constant') return ({ pi: Math.PI, tau: Math.PI * 2, e: Math.E, golden_ratio: (1 + Math.sqrt(5)) / 2, sqrt_two: Math.SQRT2 }[data.constant || 'pi']);
    const result = operations[node.type];
    return Number.isFinite(result) ? result : undefined;
  }
  if (node.type === 'logic_not') return !input('value', false);
  if (node.type === 'logic_and') return Boolean(input('a', false)) && Boolean(input('b', false));
  if (node.type === 'logic_or') return Boolean(input('a', false)) || Boolean(input('b', false));
  if (node.type === 'logic_xor') return Boolean(input('a', false)) !== Boolean(input('b', false));
  if (node.type === 'data_text_uppercase') return String(input('text', '')).toLocaleUpperCase();
  if (node.type === 'data_text_lowercase') return String(input('text', '')).toLocaleLowerCase();
  if (node.type === 'data_text_trim') return String(input('text', '')).trim();
  if (node.type === 'data_check_value') {
    const value = input('value', undefined); const fallback = input('fallback', '');
    const state = value === undefined ? 'missing' : value === null ? 'null' : typeof value === 'string' && !value.trim() ? 'empty' : 'value';
    return ({ value: state === 'value' ? value : fallback, state, is_missing: state === 'missing', is_null: state === 'null', is_empty: state === 'empty', has_value: state === 'value' })[outputId];
  }
  if (node.type === 'data_array_get') {
    const array = input('array', []); const index = Math.trunc(Number(input('index', 0))); const found = Array.isArray(array) && index >= 0 && index < array.length;
    return ({ value: found ? array[index] : null, found })[outputId];
  }
  if (node.type === 'data_object_get' || node.type === 'data_get_value_by_path') {
    const source = input(node.type === 'data_object_get' ? 'object' : 'value', {});
    const path = node.type === 'data_object_get' ? String(input('key', '')) : String(input('path', ''));
    if (node.type === 'data_object_get') {
      const exists = Boolean(path) && source != null && Object.hasOwn(Object(source), path);
      return ({ value: exists ? source[path] : null, exists })[outputId];
    }
    const keys = path.match(/(?:^|\.)([A-Za-z_$][A-Za-z0-9_$-]*)|\[(?:([0-9]+)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\]/g);
    let current = source; let exists = Boolean(path);
    if (!keys || keys.join('').replace(/^\./, '') !== path.replace(/^\./, '')) exists = false;
    for (const token of keys || []) {
      const key = /\[(\d+)\]/.exec(token)?.[1] ?? /\["((?:\\.|[^"\\])*)"\]/.exec(token)?.[1] ?? /\['((?:\\.|[^'\\])*)'\]/.exec(token)?.[1] ?? token.replace(/^\./, '');
      if (['__proto__', 'prototype', 'constructor'].includes(key) || current == null || !Object.hasOwn(Object(current), key)) { exists = false; break; }
      current = current[key];
    }
    const fallback = input('fallback', '');
    return ({ value: exists ? current : fallback, exists })[outputId];
  }
  if (node.type === 'data_find_array_item' || node.type === 'data_filter_array') {
    const array = input('array', []); const items = Array.isArray(array) ? array : []; const path = String(input('path', '') || ''); const wanted = input('value', '');
    const select = (item) => {
      if (!path) return { exists: true, value: item };
      const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); let value = item;
      for (const key of tokens) { if (['__proto__', 'prototype', 'constructor'].includes(key) || value == null || !Object.hasOwn(Object(value), key)) return { exists: false, value: undefined }; value = value[key]; }
      return { exists: true, value };
    };
    if (node.type === 'data_find_array_item') { const index = items.findIndex((item) => { const found = select(item); return found.exists && Object.is(found.value, wanted); }); return ({ item: index >= 0 ? items[index] : null, index, found: index >= 0 })[outputId]; }
    const operator = String(input('operator', 'equals')); const filtered = items.filter((item) => { const actual = select(item); const value = actual.value; if (operator === 'exists') return actual.exists; if (!actual.exists) return false; if (operator === 'not_equals') return !Object.is(value, wanted); if (operator === 'contains') return typeof value === 'string' ? value.includes(String(wanted)) : Array.isArray(value) && value.some((entry) => Object.is(entry, wanted)); if (operator === 'starts_with') return typeof value === 'string' && value.startsWith(String(wanted)); if (operator === 'ends_with') return typeof value === 'string' && value.endsWith(String(wanted)); if (operator === 'greater_than') return value > wanted; if (operator === 'greater_or_equal') return value >= wanted; if (operator === 'less_than') return value < wanted; if (operator === 'less_or_equal') return value <= wanted; if (operator === 'is_empty') return value == null || value === '' || Array.isArray(value) && !value.length || typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length; return Object.is(value, wanted); }); return ({ array: filtered, count: filtered.length })[outputId];
  }
  if (definition?.inputs?.some((pin) => pin.id === outputId)) return undefined;
  return undefined;
};

  const activeCanvasNodeId = containerRef.current?.ownerDocument?.activeElement?.closest?.('[data-node-card-id]')?.dataset.nodeCardId || '';
  const visibleCanvasNodeIds = useMemo(() => {
    if (nodes.length <= LARGE_GRAPH_NODE_LIMIT) {
      visibleNodeIdsCacheRef.current = null;
      return null;
    }
    const container = containerRef.current;
    if (!container && typeof window === 'undefined') {
      visibleNodeIdsCacheRef.current = null;
      return null;
    }
    const bounds = container?.getBoundingClientRect();
    const scaleElement = container || (typeof document !== 'undefined' ? document.querySelector('.app-root') : null);
    const displayScale = getCanvasDisplayScale(scaleElement);
    const viewWidth = (bounds?.width || window.innerWidth) / displayScale;
    const viewHeight = (bounds?.height || window.innerHeight) / displayScale;
    if (!(viewWidth > 0 && viewHeight > 0 && zoom > 0)) {
      visibleNodeIdsCacheRef.current = null;
      return null;
    }
    const overscanPixels = Math.max(NODE_CULL_OVERSCAN_MIN, Math.min(NODE_CULL_OVERSCAN_MAX, Math.max(viewWidth, viewHeight) * 0.68));
    const overscan = overscanPixels / zoom;
    const left = -pan.x / zoom - overscan;
    const top = -pan.y / zoom - overscan;
    const right = (viewWidth - pan.x) / zoom + overscan;
    const bottom = (viewHeight - pan.y) / zoom + overscan;
    const pinnedIds = new Set([
      ...selectedNodeIds,
      ...(draggingNode?.nodeIds || []),
      draggingNode?.id,
      ...(contextMenu?.nodeIds || []),
      contextMenu?.nodeId,
      connectingWire?.nodeId,
      connectingWire?.snapTarget?.nodeId,
      connectingWire?.originalConnection?.sourceNodeId,
      connectingWire?.originalConnection?.targetNodeId,
      activeCanvasNodeId,
      focusRequest?.requestId !== handledFocusRequestRef.current ? focusRequest?.nodeId : null
    ].filter((id) => typeof id === 'string' && id));
    for (const peer of remoteActions) {
      const action = peer.action;
      if (!action) continue;
      if (Array.isArray(action.selectedNodeIds)) for (const id of action.selectedNodeIds) if (typeof id === 'string') pinnedIds.add(id);
      if (action.kind === 'node-drag') {
        for (const id of action.nodeIds || []) if (typeof id === 'string') pinnedIds.add(id);
        for (const position of action.nodePositions || []) if (typeof position?.id === 'string') pinnedIds.add(position.id);
      }
      if (action.kind === 'node-edit' && typeof action.nodeId === 'string') pinnedIds.add(action.nodeId);
      if (action.kind === 'wire-drag') {
        if (typeof action.nodeId === 'string') pinnedIds.add(action.nodeId);
        if (typeof action.snapTarget?.nodeId === 'string') pinnedIds.add(action.snapTarget.nodeId);
      }
    }
    const sizes = nodeWorldSizeCacheRef.current.sizes;
    const next = new Set();
    for (const node of nodes) {
      if (pinnedIds.has(node.id)) {
        next.add(node.id);
        continue;
      }
      const position = localNodePositionById?.get(node.id) || remoteNodePositionById.get(node.id) || node;
      const size = sizes.get(node.id);
      const width = size?.width || NODE_WIDTH;
      const height = Math.max(size?.height || 0, estimateCulledNodeHeight(node, nodeDefinitionsById.get(node.id)));
      if (position.x + width >= left && position.x <= right && position.y + height >= top && position.y <= bottom) next.add(node.id);
    }
    const previous = visibleNodeIdsCacheRef.current;
    if (previous && previous.size === next.size && [...next].every((id) => previous.has(id))) return previous;
    visibleNodeIdsCacheRef.current = next;
    return next;
  }, [nodes, nodeDefinitionsById, remoteNodePositionById, localNodePositionById, remoteActions, selectedNodeIds, pan, zoom, draggingNode?.id, draggingNode?.nodeIds, connectingWire?.nodeId, connectingWire?.snapTarget?.nodeId, connectingWire?.originalConnection, contextMenu?.nodeId, contextMenu?.nodeIds, activeCanvasNodeId, focusRequest?.requestId, focusRequest?.nodeId, wireLayoutRevision, nodeBoundsRevision, graphId, projectId]);

  const previousTemplatePreviewsRef = useRef(new Map());
  const templatePreviewValuesByNode = useMemo(() => {
    const previous = previousTemplatePreviewsRef.current;
    const next = new Map();
    for (const node of nodes) {
      if (visibleCanvasNodeIds && !visibleCanvasNodeIds.has(node.id)) continue;
      const values = {};
      for (const wire of nodeConnectionsById.get(node.id)?.incoming || EMPTY_NODE_CONNECTIONS.incoming) {
        const value = previewOutput(nodeById.get(wire.sourceNodeId), wire.sourcePinId);
        if (value !== undefined) values[wire.targetPinId] = value;
      }
      const keys = Object.keys(values);
      const oldValues = previous.get(node.id);
      const canReuse = oldValues && keys.length === Object.keys(oldValues).length
        && keys.every((key) => Object.hasOwn(oldValues, key) && Object.is(oldValues[key], values[key]));
      next.set(node.id, canReuse ? oldValues : keys.length ? values : EMPTY_TEMPLATE_PREVIEW_VALUES);
    }
    previousTemplatePreviewsRef.current = next;
    return next;
  }, [nodes, nodeDefinitionInputsToken, visibleCanvasNodeIds, nodeConnectionsById, inputConnectionByNodePin, canvasGraphVariables, getNodeDefinition, nodeById]);
  const renderedCanvasNodes = useMemo(() => visibleCanvasNodeIds ? nodes.filter((node) => visibleCanvasNodeIds.has(node.id)) : nodes, [nodes, visibleCanvasNodeIds]);
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const activePulseNodeIdSet = useMemo(() => new Set(activePulseNodeIds), [activePulseNodeIds]);

  useLayoutEffect(() => {
    measureVisibleNodeCards();
  }, [visibleCanvasNodeIds, zoom, nodeDefinitionInputsToken, nodeDefinitionsById, graphId, projectId, measureVisibleNodeCards]);

  useLayoutEffect(() => {
    refreshWireLayout((revision) => revision + 1);
  }, [visibleCanvasNodeIds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      measureVisibleNodeCards();
      refreshWireLayout((revision) => revision + 1);
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    container.querySelectorAll('[data-node-card-id]').forEach((card) => {
      if (nodeIds.has(card.dataset.nodeCardId)) observer.observe(card);
    });
    return () => observer.disconnect();
  }, [visibleCanvasNodeIds, nodeCardIdsToken, measureVisibleNodeCards]);

  const remoteNodeVisualStateById = useMemo(() => {
    const states = new Map();
    const getState = (id) => {
      let state = states.get(id);
      if (!state) { state = {}; states.set(id, state); }
      return state;
    };
    for (const peer of remoteActions) {
      const action = peer.action || {};
      for (const id of action.selectedNodeIds || []) {
        const state = getState(id);
        state.selection ||= peer;
      }
      if (action.kind === 'node-edit' && action.nodeId) getState(action.nodeId).owner ||= peer;
      if (action.kind === 'node-drag') {
        for (const id of action.nodeIds || []) {
          const state = getState(id);
          state.owner ||= peer;
          state.dragging = true;
        }
      }
      if (Array.isArray(action.nodePositions)) for (const position of action.nodePositions) {
        if (!position || typeof position.id !== 'string') continue;
        const state = getState(position.id);
        state.owner ||= peer;
        state.position = position;
      }
    }
    for (const state of states.values()) if (!state.owner) state.owner = state.selection;
    return states;
  }, [remoteActions]);
  const canvasNodeActionsRef = useRef({});
  canvasNodeActionsRef.current = {
    selectNodes, deleteNode, updateNodeData, startWire, startWireFromInput, startWireFromOutput,
    onOpenVariables, onOpenEmbedStudio, onOpenTextStudio, onOpenPermissionStudio,
    onOpenSlashCommandStudio, onOpenModalStudio, onOpenFunctionGraph, callableGraphs
  };
  const canvasNodeHandlers = useMemo(() => ({
    onSelect: (id, event) => {
      if (!event?.metaKey && !event?.ctrlKey && !event?.shiftKey) canvasNodeActionsRef.current.selectNodes?.([id], id);
    },
    onDelete: (id) => canvasNodeActionsRef.current.deleteNode?.(id),
    onNodeDataChange: (id, data, label) => canvasNodeActionsRef.current.updateNodeData?.(id, data, label),
    onPinStartConnect: (...args) => canvasNodeActionsRef.current.startWire?.(...args),
    onOpenVariables: (...args) => canvasNodeActionsRef.current.onOpenVariables?.(...args),
    onOpenEmbedStudio: (...args) => canvasNodeActionsRef.current.onOpenEmbedStudio?.(...args),
    onOpenTextStudio: (...args) => canvasNodeActionsRef.current.onOpenTextStudio?.(...args),
    onOpenPermissionStudio: (...args) => canvasNodeActionsRef.current.onOpenPermissionStudio?.(...args),
    onOpenSlashCommandStudio: (...args) => canvasNodeActionsRef.current.onOpenSlashCommandStudio?.(...args),
    onOpenModalStudio: (...args) => canvasNodeActionsRef.current.onOpenModalStudio?.(...args),
    onOpenFunctionGraph: (graph) => {
      const latestGraph = canvasNodeActionsRef.current.callableGraphs?.find((item) => item.id === graph?.id) || graph;
      return canvasNodeActionsRef.current.onOpenFunctionGraph?.(latestGraph);
    }
  }), []);

  const renderWire = (connection, isSelectedNodeWire, isPrimarySelectedWire = false) => {
    if (connectingWire?.clickToConnect && connectingWire.direction === 'output' && connectingWire.originalConnection?.id === connection.id) return null;
    const start = getSocketPosition(connection.sourceNodeId, connection.sourcePinId, 'output');
    const end = getSocketPosition(connection.targetNodeId, connection.targetPinId, 'input');
    const path = computePath(start.x, start.y, end.x, end.y);
    const sourceNode = nodeById.get(connection.sourceNodeId);
    const targetNode = nodeById.get(connection.targetNodeId);
    const outputValue = shiftHeld ? previewOutput(sourceNode, connection.sourcePinId) : undefined;
    let outputPreview = '';
    if (shiftHeld) {
      try { outputPreview = outputValue === undefined ? 'Preview unavailable · requires runtime data or an unsupported node' : `Value · ${typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue)}`; } catch { outputPreview = 'Preview unavailable'; }
      if (outputPreview.length > 180) outputPreview = `${outputPreview.slice(0, 177)}…`;
    }
    const sourcePin = nodeDefinitionsById.get(sourceNode?.id)?.outputs?.find((pin) => pin.id === connection.sourcePinId);
    const targetPin = nodeDefinitionsById.get(targetNode?.id)?.inputs?.find((pin) => pin.id === connection.targetPinId);
    const sourceType = sourcePin?.colorType || sourcePin?.type;
    const targetType = targetPin?.colorType || targetPin?.type;
    const pinColor = PinColors[sourceType || connection.type || targetType] || '#9299a6';
    const active = activePulseNodeSet.has(connection.sourceNodeId) && activePulseNodeSet.has(connection.targetNodeId);
    const fanoutKey = `${connection.sourceNodeId}:${connection.sourcePinId}`;
    const fanout = wireFanout.counts.get(fanoutKey) || 1;
    const fanoutOrder = wireFanout.orders.get(connection.id) || 0;
    const denseShades = [-13, -4, 5, -9, 2];
    const shade = fanout > 1 ? (fanoutOrder % 2 === 0 ? -12 : 5) : denseWiring ? denseShades[(wireFanout.indices.get(connection.id) || 0) % denseShades.length] : 0;
    const color = reduceWireColorNoise && !active && !isSelectedNodeWire ? '#737d8b' : shade ? shadeWireColor(pinColor, shade) : pinColor;
    return (
      <g key={connection.id} className={`wire-group ${fanout > 1 ? 'is-fanout' : ''} ${denseWiring ? 'is-dense' : ''} ${reduceWireColorNoise && !active && !isSelectedNodeWire ? 'is-muted' : ''} ${isLocked ? 'is-locked' : ''} ${isSelectedNodeWire ? 'is-connected-selected' : ''} ${isPrimarySelectedWire ? 'is-primary-selection' : ''}`} data-wire-id={connection.id} style={{ '--wire-opacity': fanout > 1 ? 0.66 : denseWiring ? 0.68 : 0.84 }}>
        <path d={path} className="wire-hit-area" data-tooltip={shiftHeld ? outputPreview : undefined} aria-label={settings.doubleClickWireToCut ? 'Single-click to reroute; double-click to disconnect' : 'Single-click to disconnect; double-click to reroute'} onClick={(event) => {
          if (settings.doubleClickWireToCut) {
            startWireFromConnection(event, connection, 'output');
            return;
          }
          cutWire(event, connection);
        }} onDoubleClick={(event) => {
          if (isLocked) return;
          event.preventDefault();
          event.stopPropagation();
          if (settings.doubleClickWireToCut) {
            setConnectingWire(null);
            cutWire(event, connection);
          } else {
            const timer = wireCutTimersRef.current.get(connection.id);
            if (timer) window.clearTimeout(timer);
            wireCutTimersRef.current.delete(connection.id);
            setWireCutAnimations((current) => current.filter((item) => item.id !== connection.id));
            startWireFromConnection(event, connection, 'output');
          }
        }} />
        {!wireCutAnimations.some((item) => item.id === connection.id) && <path d={path} className={`wire-visible ${active && wirePulse ? 'wire-visible-active' : ''} ${isSelectedNodeWire ? 'wire-connected-selected' : ''}`} style={{ '--wire-color': color }} />}
      </g>
    );
  };

  const canvasWidth = containerRef.current?.clientWidth || 0;
  const canvasHeight = containerRef.current?.clientHeight || 0;
  const canvasBounds = containerRef.current?.getBoundingClientRect();
  const canvasDisplayScale = getCanvasDisplayScale(containerRef.current);
  const wireViewportWidth = canvasWidth || (typeof window !== 'undefined' ? window.innerWidth / canvasDisplayScale : 0);
  const wireViewportHeight = canvasHeight || (typeof window !== 'undefined' ? window.innerHeight / canvasDisplayScale : 0);
  const visibleWireIds = useMemo(() => {
    if (connections.length <= LARGE_GRAPH_WIRE_LIMIT || !(wireViewportWidth > 0 && wireViewportHeight > 0 && zoom > 0)) {
      visibleWireIdsCacheRef.current = null;
      return null;
    }
    const overscanPixels = Math.max(600, Math.min(1400, Math.max(wireViewportWidth, wireViewportHeight) * 0.4));
    const overscan = overscanPixels / zoom;
    const bounds = {
      left: -pan.x / zoom - overscan,
      top: -pan.y / zoom - overscan,
      right: (wireViewportWidth - pan.x) / zoom + overscan,
      bottom: (wireViewportHeight - pan.y) / zoom + overscan
    };
    const padding = 16 / zoom;
    const next = new Set();
    for (const connection of connections) {
      const start = getSocketPosition(connection.sourceNodeId, connection.sourcePinId, 'output');
      const end = getSocketPosition(connection.targetNodeId, connection.targetPinId, 'input');
      let left = Math.min(start.x, end.x);
      let right = Math.max(start.x, end.x);
      if (wireStyle !== 'straight') {
        const curve = Math.max(Math.abs(end.x - start.x) * 0.5, 52);
        left = Math.min(left, start.x + curve, end.x - curve);
        right = Math.max(right, start.x + curve, end.x - curve);
      }
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      if (right + padding >= bounds.left && left - padding <= bounds.right
        && bottom + padding >= bounds.top && top - padding <= bounds.bottom) next.add(connection.id);
    }
    const previous = visibleWireIdsCacheRef.current;
    if (previous && previous.size === next.size && [...next].every((id) => previous.has(id))) return previous;
    visibleWireIdsCacheRef.current = next;
    return next;
  }, [connections, getSocketPosition, pan, zoom, wireStyle, wireViewportWidth, wireViewportHeight]);
  const visibleBaseConnections = useMemo(() => visibleWireIds ? baseConnections.filter((wire) => visibleWireIds.has(wire.id)) : baseConnections, [baseConnections, visibleWireIds]);
  const visibleElevatedConnections = useMemo(() => visibleWireIds ? elevatedConnections.filter((wire) => visibleWireIds.has(wire.id)) : elevatedConnections, [elevatedConnections, visibleWireIds]);
  const denseViewportWorkload = useMemo(() => {
    if (zoom > 0.55 || renderedCanvasNodes.length < 80 || visibleBaseConnections.length + visibleElevatedConnections.length < 100) {
      return { nodeCount: 0, wireCount: 0 };
    }
    const viewport = {
      left: -pan.x / zoom,
      top: -pan.y / zoom,
      right: (wireViewportWidth - pan.x) / zoom,
      bottom: (wireViewportHeight - pan.y) / zoom
    };
    const sizes = nodeWorldSizeCacheRef.current.sizes;
    let nodeCount = 0;
    for (const node of renderedCanvasNodes) {
      const position = localNodePositionById?.get(node.id) || remoteNodePositionById.get(node.id) || node;
      const size = sizes.get(node.id);
      const width = size?.width || NODE_WIDTH;
      const height = Math.max(size?.height || 0, estimateCulledNodeHeight(node, nodeDefinitionsById.get(node.id)));
      if (position.x + width >= viewport.left && position.x <= viewport.right
        && position.y + height >= viewport.top && position.y <= viewport.bottom) nodeCount++;
    }
    let wireCount = 0;
    const countVisibleWires = (wires) => {
      for (const connection of wires) {
        const start = getSocketPosition(connection.sourceNodeId, connection.sourcePinId, 'output');
        const end = getSocketPosition(connection.targetNodeId, connection.targetPinId, 'input');
        let left = Math.min(start.x, end.x);
        let right = Math.max(start.x, end.x);
        if (wireStyle !== 'straight') {
          const curve = Math.max(Math.abs(end.x - start.x) * 0.5, 52);
          left = Math.min(left, start.x + curve, end.x - curve);
          right = Math.max(right, start.x + curve, end.x - curve);
        }
        const padding = 8 / zoom;
        if (right + padding >= viewport.left && left - padding <= viewport.right
          && Math.max(start.y, end.y) + padding >= viewport.top
          && Math.min(start.y, end.y) - padding <= viewport.bottom) wireCount++;
      }
    };
    countVisibleWires(visibleBaseConnections);
    countVisibleWires(visibleElevatedConnections);
    return { nodeCount, wireCount };
  }, [
    renderedCanvasNodes,
    visibleBaseConnections,
    visibleElevatedConnections,
    pan,
    zoom,
    wireViewportWidth,
    wireViewportHeight,
    localNodePositionById,
    remoteNodePositionById,
    nodeDefinitionsById,
    nodeBoundsRevision,
    getSocketPosition,
    wireStyle
  ]);
  const effectiveCanvasQuality = getEffectiveCanvasQuality({
    mode: canvasQualityMode,
    performanceReduced,
    zoom,
    visibleNodeCount: denseViewportWorkload.nodeCount,
    visibleWireCount: denseViewportWorkload.wireCount
  });
  const visibleCanvas = { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight };
  const sidebar = containerRef.current?.parentElement?.querySelector('.project-sidebar, .graph-library-panel, .plugin-store-sidebar, .bot-settings-sidebar, .graph-variables-sidebar');
  if (sidebar && canvasBounds) {
    const sidebarBounds = sidebar.getBoundingClientRect();
    if (sidebarBounds.left <= canvasBounds.left + 1 && sidebarBounds.right > canvasBounds.left) {
      visibleCanvas.left = Math.min(canvasWidth, Math.max(visibleCanvas.left, (sidebarBounds.right - canvasBounds.left) / canvasDisplayScale));
    }
  }
  const dockBounds = document.querySelector('.control-dock')?.getBoundingClientRect();
  if (dockBounds && canvasBounds && dockBounds.left < canvasBounds.right && dockBounds.right > canvasBounds.left && dockBounds.top < canvasBounds.bottom) {
    visibleCanvas.bottom = Math.max(0, Math.min(canvasHeight, (dockBounds.top - canvasBounds.top) / canvasDisplayScale));
  }
  const safeMargin = Math.min(16, Math.max(1, (visibleCanvas.right - visibleCanvas.left) / 3), Math.max(1, (visibleCanvas.bottom - visibleCanvas.top) / 3));
  const safeLeft = Math.min(visibleCanvas.right, visibleCanvas.left + safeMargin);
  const safeRight = Math.max(safeLeft, visibleCanvas.right - safeMargin);
  const safeTop = Math.min(visibleCanvas.bottom, visibleCanvas.top + safeMargin);
  const safeBottom = Math.max(safeTop, visibleCanvas.bottom - safeMargin);
  const canvasToolsBounds = document.querySelector('.canvas-tools')?.getBoundingClientRect();
  const canvasToolsObstacle = canvasToolsBounds && canvasBounds ? {
    left: (canvasToolsBounds.left - canvasBounds.left) / canvasDisplayScale - 10,
    top: (canvasToolsBounds.top - canvasBounds.top) / canvasDisplayScale - 10,
    right: (canvasToolsBounds.right - canvasBounds.left) / canvasDisplayScale + 10,
    bottom: (canvasToolsBounds.bottom - canvasBounds.top) / canvasDisplayScale + 10
  } : null;
  const remoteCursorViews = remoteActions.filter((peer) => peer.action?.cursor).map((peer) => {
    const cursor = peer.action.cursor;
    const screenX = pan.x + cursor.x * zoom;
    const screenY = pan.y + cursor.y * zoom;
    const offscreen = canvasWidth > 0 && canvasHeight > 0 && (screenX < safeLeft || screenX > safeRight || screenY < safeTop || screenY > safeBottom);
    if (!offscreen) return { peer, offscreen: false };
    const centerX = (safeLeft + safeRight) / 2;
    const centerY = (safeTop + safeBottom) / 2;
    const dx = screenX - centerX;
    const dy = screenY - centerY;
    const availableX = Math.max(1, (safeRight - safeLeft) / 2);
    const availableY = Math.max(1, (safeBottom - safeTop) / 2);
    const xScale = dx ? availableX / Math.abs(dx) : Infinity;
    const yScale = dy ? availableY / Math.abs(dy) : Infinity;
    const scale = Math.min(xScale, yScale);
    let left = centerX + dx * scale - 10;
    let top = centerY + dy * scale - 10;
    let edge = xScale <= yScale ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
    const overlapsTools = canvasToolsObstacle && left < canvasToolsObstacle.right && left + 20 > canvasToolsObstacle.left && top < canvasToolsObstacle.bottom && top + 20 > canvasToolsObstacle.top;
    if (overlapsTools) {
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
      const alternatives = [
        { left: clamp(canvasToolsObstacle.left - 20, safeLeft - 10, safeRight - 10), top: safeTop - 10, edge: 'top' },
        { left: safeRight - 10, top: clamp(canvasToolsObstacle.bottom, safeTop - 10, safeBottom - 10), edge: 'right' }
      ].filter((point) => !(point.left < canvasToolsObstacle.right && point.left + 20 > canvasToolsObstacle.left && point.top < canvasToolsObstacle.bottom && point.top + 20 > canvasToolsObstacle.top));
      alternatives.sort((a, b) => Math.hypot(a.left - left, a.top - top) - Math.hypot(b.left - left, b.top - top));
      if (alternatives.length) ({ left, top, edge } = alternatives[0]);
    }
    return {
      peer,
      offscreen: true,
      left,
      top,
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
      edge
    };
  });

  return (
    <div
      ref={containerRef}
      className={`node-canvas ${isPanning ? 'is-panning' : ''} ${draggingNode ? 'is-dragging-node' : ''} ${connectingWire ? 'is-connecting-wire' : ''} ${connectingWire?.clickToConnect ? 'is-click-connecting' : ''} ${graphChatComposerOpen ? 'has-graph-chat-composer' : ''}`}
      data-performance={performanceReduced ? 'reduced' : 'normal'}
      data-canvas-quality={effectiveCanvasQuality}
      data-pin-descriptions={settings.pinDescriptionsAlways || shiftHeld ? 'true' : undefined}
      onPointerDownCapture={handlePinPointerDownCapture}
      onPointerDown={startPan}
      onPointerMove={queuePointerMove}
      onClick={(event) => {
        if (settings.canvasRightClickPan && event.button === 0 && event.detail === 1 && isCanvasBackgroundTarget(event.target)) {
          openContextMenu(event);
          return;
        }
        if (event.detail !== 3 || event.target.closest?.('button, input, textarea, select, [data-node-card-id], [data-note-id], [data-wire-id], [data-arrow-id], [data-arrow-control-id]')) return;
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const displayScale = getCanvasDisplayScale(containerRef.current);
        const point = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
        const group = [...tagGroupLayouts].reverse().find((item) => point.x >= item.left && point.x <= item.left + item.width && point.y >= item.top && point.y <= item.top + item.height);
        if (group) {
          event.preventDefault();
          selectTagGroupNodes(group.id);
        }
      }}
      onPointerUp={finishCanvasPointer}
      onPointerCancel={() => {
        if (pointerMoveFrameRef.current) window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = 0; pendingPointerMoveRef.current = null; canvasInteractionActiveRef.current = false;
        pendingPinDragRef.current = null;
        touchPointersRef.current.clear(); touchPinchRef.current = null;
        if (isPanning) setPan(viewportRef.current.pan);
        setIsPanning(false);
        const nodePositions = collaborationMotionSupported && draggingNode ? (draggingNode.nodeIds || [draggingNode.id]).map((id) => { const node = nodes.find((item) => item.id === id); return node ? { id, x: node.x, y: node.y } : null; }).filter(Boolean) : undefined;
        if (collaborationCursorRef.current) onCollaborationAction?.({ kind: 'cursor', cursor: collaborationCursorRef.current, mode: 'move', selectedNodeIds, nodePositions }, true);
        setDraggingNode(null); setDraggingNote(null); selectionStartRef.current = null; setSelectionBox(null); rightPanOriginRef.current = null; rightPanMovedRef.current = false; cancelConnectingWire(); onHistoryGroupEnd?.();
        if (drawingArrow && !collaborationCursorRef.current) onCollaborationAction?.({ kind: 'cursor', cursor: drawingArrow.end, mode: 'move', selectedNodeIds }, true);
        setDrawingArrow(null); setDraggingArrows(null);
      }}
      onContextMenu={openContextMenu}
      onDragOver={updateLibraryDragPreview}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setLibraryDragPreview(null); }}
      onDrop={(event) => {
        const graphRaw = readTransferData(event.dataTransfer, 'application/x-arc-graph-call');
        const raw = readTransferData(event.dataTransfer, 'application/x-arc-node');
        const embedRaw = readTransferData(event.dataTransfer, 'application/x-arc-embed-asset');
        const componentsV2Raw = readTransferData(event.dataTransfer, 'application/x-arc-components-v2-asset');
        const fallback = parseLibraryTransferText(readTransferData(event.dataTransfer, 'text/plain'));
        let nodePayload = window.__arcNodeDragPayload;
        let graphPayload = window.__arcGraphDragPayload;
        let embedPayload = window.__arcEmbedDragPayload;
        let componentsV2Payload = window.__arcComponentsV2DragPayload;
        if (raw) { try { nodePayload = JSON.parse(raw); } catch {} }
        if (graphRaw) { try { graphPayload = JSON.parse(graphRaw); } catch {} }
        if (embedRaw) { try { embedPayload = JSON.parse(embedRaw); } catch {} }
        if (componentsV2Raw) { try { componentsV2Payload = JSON.parse(componentsV2Raw); } catch {} }
        if (componentsV2Payload?.id && window.__arcComponentsV2DragPayload?.id === componentsV2Payload.id) {
          componentsV2Payload = { ...componentsV2Payload, attachments: window.__arcComponentsV2DragPayload.attachments || [] };
        }
        const fallbackPayload = fallback && window.__arcLibraryDragPayloads?.[fallback.token]?.payload;
        if (!nodePayload && !graphPayload && !embedPayload && !componentsV2Payload && fallbackPayload) {
          if (fallback.mimeType === 'application/x-arc-node') nodePayload = fallbackPayload;
          else if (fallback.mimeType === 'application/x-arc-graph-call') graphPayload = fallbackPayload;
          else if (fallback.mimeType === 'application/x-arc-embed-asset') embedPayload = fallbackPayload;
          else if (fallback.mimeType === 'application/x-arc-components-v2-asset') componentsV2Payload = fallbackPayload;
        }
        setLibraryDragPreview(null);
        if (collaborationCursorRef.current) onCollaborationAction?.({ kind: 'cursor', cursor: collaborationCursorRef.current, mode: 'move', selectedNodeIds }, true);
        window.__arcNodeDragPayload = null;
        window.__arcGraphDragPayload = null;
        window.__arcEmbedDragPayload = null;
        window.__arcComponentsV2DragPayload = null;
        if (!nodePayload && !graphPayload && !embedPayload && !componentsV2Payload) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = containerRef.current.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(containerRef.current);
        try {
          const position = { x: Math.round(((event.clientX - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((event.clientY - bounds.top) / displayScale - pan.y) / zoom) };
          if (componentsV2Payload) {
            applyComponentsV2AssetToTarget(componentsV2Payload, event.target);
          } else if (embedPayload) {
            const targetId = event.target instanceof Element ? event.target.closest('[data-node-card-id]')?.getAttribute('data-node-card-id') : null;
            const target = nodes.find((node) => node.id === targetId && node.type === 'build_embed');
            if (target) {
              onNodesChange?.(nodes.map((node) => node.id === target.id ? { ...node, data: { ...node.data, blocks: structuredCloneSafe(embedPayload.blocks || []), embedName: embedPayload.name || 'Untitled embed' } } : node));
            } else {
              onNodeDrop?.(embedPayload, position);
            }
          } else {
            onNodeDrop?.(graphPayload ? { type: 'graph-call', ...graphPayload } : nodePayload, position);
          }
        } catch {}
      }}
      style={{ '--grid-size': `${gridSize}px`, '--grid-x': `${viewportRef.current.pan.x}px`, '--grid-y': `${viewportRef.current.pan.y}px` }}
    >
      <div className={`canvas-surface ${settings.showGrid === false ? 'is-grid-hidden' : ''}`} aria-hidden="true" />
      {connectingWire?.clickToConnect && <div className="wire-connect-hint">Click or tap a matching socket to connect <kbd>Esc</kbd></div>}

      <div ref={canvasWorldRef} className="canvas-world" style={{ transform: `translate3d(${viewportRef.current.pan.x}px, ${viewportRef.current.pan.y}px, 0) scale(${zoom})`, willChange: canvasQualityMode === "quality" ? "auto" : "transform" }}>
        {tagGroupLayouts.map((group) => <div key={group.id} className="canvas-tag-group" aria-hidden="true" style={{ left: group.left, top: group.top, width: group.width, height: group.height, '--tag-group-color': group.color }} />)}
        {remoteActions.filter((peer) => peer.action?.kind === 'selection' && peer.action.selectionRect).map((peer) => {
          const rect = peer.action.selectionRect;
          return <div key={`remote-selection-box-${peer.userId}`} className="canvas-remote-selection-box" style={{ left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top, '--collaborator-color': peer.color }}><span>{peer.username}</span></div>;
        })}
        <svg className="wire-layer wire-layer-base" width="20000" height="20000" aria-label="Graph connections">
          {visibleBaseConnections.map((connection) => renderWire(connection, false))}
        </svg>
        <svg className="canvas-arrow-layer" width="20000" height="20000" aria-label="Canvas arrows">
          <defs>
            {canvasArrows.map((arrow) => <marker key={arrow.id} id={getArrowMarkerId(arrow.id)} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={arrow.color || getCollaboratorColor(arrow.createdById)} />
            </marker>)}
            {remoteActions.filter((peer) => peer.action?.kind === 'arrow-drag' && peer.action.start && peer.action.cursor)
              .map((peer) => <marker key={`remote-${peer.userId}`} id={`${arrowMarkerId}-remote-${String(peer.userId).replace(/[^a-zA-Z0-9_-]/g, '')}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={peer.color} />
              </marker>)}
            <marker id={`${arrowMarkerId}-preview`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={currentUser?.color || getCollaboratorColor(currentUser?.id)} />
            </marker>
          </defs>
          {canvasArrows.map((arrow) => {
            const drag = draggingArrows?.ids.includes(arrow.id) ? draggingArrows : null;
            const initial = drag?.initial[arrow.id];
            const offsetX = initial ? drag.deltaX || 0 : 0;
            const offsetY = initial ? drag.deltaY || 0 : 0;
            const start = { x: (initial?.start.x ?? arrow.start.x) + offsetX, y: (initial?.start.y ?? arrow.start.y) + offsetY };
            const end = { x: (initial?.end.x ?? arrow.end.x) + offsetX, y: (initial?.end.y ?? arrow.end.y) + offsetY };
            const selected = selectedArrowIds.includes(arrow.id);
            const remotelySelected = remoteActions.some((peer) => peer.action?.kind === 'selection' && peer.action.selectedArrowIds?.includes(arrow.id));
            const remaining = Math.max(0, (arrow.expiresAt || Infinity) - arrowClock);
            const opacity = arrow.locked ? 1 : Math.min(1, remaining / 2000);
            const path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            return <g key={arrow.id} className={`canvas-arrow ${arrow.locked ? 'is-locked' : 'is-transient'} ${selected ? 'is-selected' : ''} ${remotelySelected ? 'is-collaborator-selected' : ''} ${arrow.removing ? 'is-removing' : ''}`} style={{ '--arrow-color': arrow.color || getCollaboratorColor(arrow.createdById), opacity: settings.reduceMotion && arrow.removing ? 0 : opacity }}>
              {selected && <path d={path} className="canvas-arrow-selection-outline" />}
              <path d={path} className="canvas-arrow-visible" markerEnd={`url(#${getArrowMarkerId(arrow.id)})`} />
              <path
                d={path}
                className="canvas-arrow-hit-area"
                data-arrow-id={arrow.id}
                onPointerDown={arrow.removing ? undefined : (event) => beginArrowDrag(event, arrow)}
                onContextMenu={arrow.removing ? undefined : openContextMenu}
              />
              {selected && <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 10} className="canvas-arrow-author" textAnchor="middle">{arrow.createdBy || 'Unknown'}</text>}
              {selected && <g className="canvas-arrow-endpoints" pointerEvents="none"><circle cx={start.x} cy={start.y} r="3" /><circle cx={end.x} cy={end.y} r="3" /></g>}
            </g>;
          })}
          {drawingArrow && <path d={`M ${drawingArrow.start.x} ${drawingArrow.start.y} L ${drawingArrow.end.x} ${drawingArrow.end.y}`} className="canvas-arrow-visible canvas-arrow-preview" style={{ '--arrow-color': currentUser?.color || getCollaboratorColor(currentUser?.id) }} markerEnd={`url(#${arrowMarkerId}-preview)`} />}
          {remoteActions.filter((peer) => peer.action?.kind === 'arrow-drag' && peer.action.start && peer.action.cursor)
            .map((peer) => <path key={`remote-arrow-${peer.userId}`} d={`M ${peer.action.start.x} ${peer.action.start.y} L ${peer.action.cursor.x} ${peer.action.cursor.y}`} className="canvas-arrow-visible canvas-arrow-preview" style={{ '--arrow-color': peer.color }} markerEnd={`url(#${arrowMarkerId}-remote-${String(peer.userId).replace(/[^a-zA-Z0-9_-]/g, '')})`} />)}
        </svg>
        {canvasArrows.filter((arrow) => selectedArrowIds.includes(arrow.id)).map((arrow) => {
          const drag = draggingArrows?.ids.includes(arrow.id) ? draggingArrows : null;
          const initial = drag?.initial[arrow.id];
          const end = {
            x: (initial?.end.x ?? arrow.end.x) + (drag?.deltaX || 0),
            y: (initial?.end.y ?? arrow.end.y) + (drag?.deltaY || 0)
          };
          const manageable = !canvasLocked && !isLocked && canWriteGraphs && mayManageArrow(arrow)
            && (arrow.locked || (arrows.filter((item) => item?.locked).length < 300
              && (collaborationReady || arrow.createdById === currentUser?.id)));
          const lockTitle = !arrow.locked && arrows.filter((item) => item?.locked).length >= 300
            ? 'This graph already has the maximum of 300 saved arrows'
            : arrow.locked ? 'Unlock arrow and let it fade' : 'Keep arrow permanently';
          return <div key={`arrow-controls-${arrow.id}`} className="canvas-arrow-controls" data-arrow-control-id={arrow.id} style={{ left: end.x + 10, top: end.y - 13 }}>
            <button type="button" title={lockTitle} aria-label={lockTitle} disabled={!manageable} onPointerDown={(event) => event.stopPropagation()} onClick={() => toggleArrowLock(arrow)}>{arrow.locked ? <LockKeyhole size={12} /> : <LockOpen size={12} />}</button>
            <button type="button" title="Delete arrow" aria-label="Delete arrow" disabled={canvasLocked || (arrow.locked && (isLocked || !canWriteGraphs || !mayManageArrow(arrow)))} onPointerDown={(event) => event.stopPropagation()} onClick={() => deleteSelectedItems([], [], false, [arrow.id])}><X size={12} /></button>
          </div>;
        })}
        {renderedCanvasNodes.map((node) => {
          const isSelected = selectedNodeIdSet.has(node.id);
          const isWireRelated = relatedNodeIds.has(node.id) && !isSelected;
          const isFindMatch = canvasFindResultIds.has(node.id);
          const isFindCurrent = isFindMatch && canvasFindCurrentNodeId === node.id;
          const definition = nodeDefinitionsById.get(node.id);
          const templatePreviewValues = templatePreviewValuesByNode.get(node.id) || EMPTY_TEMPLATE_PREVIEW_VALUES;
          const remoteVisual = remoteNodeVisualStateById.get(node.id) || EMPTY_REMOTE_NODE_STATE;
          const remoteSelection = remoteVisual.selection;
          const remoteOwner = remoteVisual.owner;
          const remotePosition = remoteNodePositionById.get(node.id);
          const localPosition = localNodePositionById?.get(node.id);
          const displayPosition = localPosition || remotePosition || node;
          const nodeLoadFailed = nodeDefinitionsReady && (!definition || definition.loadFailed);
          return (
            <div
              className={`node-position ${shakingNodeId === node.id ? 'is-shaking' : ''} ${isSelected ? 'is-selected' : ''} ${isFindMatch ? 'is-canvas-find-match' : ''} ${isFindCurrent ? 'is-canvas-find-current' : ''} ${remoteOwner ? 'is-collaborator-active' : ''} ${remoteVisual.dragging ? 'is-collaborator-dragging' : ''} ${remotePosition ? 'is-remote-moving' : ''} ${remoteSelection ? 'is-collaborator-selected' : ''} ${nodeLoadFailed ? 'is-node-load-failed' : ''}`}
              key={node.id}
              style={{ transform: `translate3d(${displayPosition.x}px, ${displayPosition.y}px, 0)`, zIndex: isSelected ? 16 : isWireRelated ? 14 : undefined, '--collaborator-color': remoteOwner?.color }}
              onPointerDown={nodeLoadFailed ? undefined : (event) => beginNodeDrag(event, node)}
            >
              <CanvasNode
                node={node}
                definition={definition}
                loadFailed={nodeLoadFailed}
                authToken={authToken}
                connectedInputIds={connectedInputIds.get(node.id) || EMPTY_PIN_SET}
                componentsV2SourceConnected={Boolean(connectionByNodePin.incoming.get(node.id)?.get('components') && nodeById.get(connectionByNodePin.incoming.get(node.id).get('components').sourceNodeId)?.type === 'build_components')}
                graphVariables={canvasGraphVariables}
                templatePreviewValues={templatePreviewValues}
                modalFieldOptions={modalFieldOptions}
                appEmojis={appEmojis}
                callableGraphs={callableGraphs}
                snappedPin={connectingWire?.snapTarget?.nodeId === node.id ? connectingWire.snapTarget : null}
                selected={isSelected}
                illuminated={activePulseNodeIdSet.has(node.id)}
                isLocked={isLocked}
                findOptions={canvasFindOpen && canvasFindQuery.trim() ? {
                  query: canvasFindQuery,
                  matchCase: canvasFindCaseSensitive,
                  wholeWord: canvasFindWholeWord,
                  regex: canvasFindRegex
                } : null}
                isFindCurrent={isFindCurrent}
                {...canvasNodeHandlers}
              />
            </div>
          );
        })}

        <svg className="wire-layer wire-layer-selected" width="20000" height="20000" aria-label="Elevated connections">
          {visibleElevatedConnections.map((connection) => renderWire(connection, true, true))}
          {wireCutAnimations.flatMap((animation) => animation.segments.map((segment, index) => <path key={`${animation.id}-${index}`} d={segment.d} className="wire-cut-segment" style={{ '--wire-color': animation.color, '--wire-cut-length': `${segment.length}px` }} />))}
          {connectingWire && <path
            d={connectingWire.direction === 'output'
              ? computePath(connectingWire.startPos.x, connectingWire.startPos.y, connectingWire.currentPos.x, connectingWire.currentPos.y)
              : computePath(connectingWire.currentPos.x, connectingWire.currentPos.y, connectingWire.startPos.x, connectingWire.startPos.y)}
            className={`wire-preview ${connectingWire.originalConnection ? 'wire-preview-reroute' : ''}`} style={{ '--wire-color': PinColors[connectingWire.pinType] || '#9299a6' }} />}
          {remoteActions.filter((peer) => peer.action?.kind === 'wire-drag' && peer.action.start && peer.action.cursor).map((peer) => <RemoteWirePreview key={`remote-wire-${peer.userId}`} peer={peer} computePath={computePath} />)}
        </svg>
        {notes.map((note) => {
          const noteDragInitial = draggingNote?.noteIds?.includes(note.id) ? draggingNote.initialPositions[note.id] : null;
          const activePosition = noteDragInitial ? { x: noteDragInitial.x + (draggingNote.deltaX || 0), y: noteDragInitial.y + (draggingNote.deltaY || 0) } : note;
          const mayEdit = mayEditNote(note) && !isLocked;
          const noteLock = noteEditLocks[note.id];
          const ownsNoteLock = Boolean(noteLock && noteLock.userId === currentUser?.id && noteLock.clientId === collaborationClientId);
          const lockHeldByOther = isNoteBeingEditedByOther(note.id);
          const canEditText = mayEdit && (!collaborationOnline || ownsNoteLock);
          const remotePosition = remoteActions.find((peer) => peer.action?.notePositions?.some((position) => position.id === note.id))?.action.notePositions.find((position) => position.id === note.id);
          const remoteOwner = remoteActions.find((peer) => peer.action?.kind === 'note-drag' && (peer.action.noteId === note.id || peer.action.noteIds?.includes(note.id))
            || peer.action?.notePositions?.some((position) => position.id === note.id));
          const headerLabel = lockHeldByOther ? 'Note'
            : focusedNoteId === note.id && collaborationOnline && mayEdit
              ? !collaborationReady ? 'Connecting…' : ownsNoteLock ? 'Editing' : 'Waiting for edit access…'
              : 'Note';
          const displayPosition = noteDragInitial ? activePosition : remotePosition || activePosition;
          return <article key={note.id} data-note-id={note.id} className={`canvas-note-card ${note.locked ? 'is-locked' : ''} ${selectedNoteIds.includes(note.id) ? 'is-selected' : ''} ${remoteOwner || lockHeldByOther ? 'is-collaborator-active' : ''} ${remoteActions.some((peer) => peer.action?.kind === 'note-drag' && (peer.action.noteId === note.id || peer.action.noteIds?.includes(note.id))) ? 'is-collaborator-dragging' : ''} ${remotePosition ? 'is-remote-moving' : ''} ${remoteActions.some((peer) => peer.action?.selectedNoteIds?.includes(note.id)) ? 'is-collaborator-selected' : ''}`} style={{ left: displayPosition.x, top: displayPosition.y, '--note-color': note.color || '#f6d365', '--collaborator-color': remoteOwner?.color || noteLock?.color || '#b794f4' }} onPointerDown={(event) => { event.stopPropagation(); if (!(event.target instanceof Element) || !event.target.closest('.canvas-note-header')) handleNoteSelectionPointerDown(event, note.id); }} onContextMenu={(event) => { event.stopPropagation(); openContextMenu(event); }}>
            <header className="canvas-note-header" onPointerDown={(event) => {
              if (event.button !== 0 || event.target instanceof Element && event.target.closest('button') || !mayEdit || lockHeldByOther) return;
              if (event.metaKey || event.ctrlKey || event.shiftKey) { event.stopPropagation(); handleNoteSelectionPointerDown(event, note.id); return; }
              if (!selectedNoteIds.includes(note.id)) handleNoteSelectionPointerDown(event, note.id);
              event.preventDefault(); event.stopPropagation();
              const movingNotes = (selectedNoteIds.includes(note.id) ? notes.filter((item) => selectedNoteIds.includes(item.id)) : [note])
                .filter((item) => mayEditNote(item) && !isNoteBeingEditedByOther(item.id));
              const initialPositions = Object.fromEntries(movingNotes.map((item) => [item.id, { x: item.x, y: item.y }]));
              setDraggingNote({ id: note.id, noteIds: movingNotes.map((item) => item.id), initialPositions, startX: event.clientX, startY: event.clientY, deltaX: 0, deltaY: 0, historyStarted: false });
              containerRef.current?.setPointerCapture?.(event.pointerId);
            }}>
              <span>{headerLabel}</span>
              {noteLock && Number.isFinite(noteLock.expiresAt) && (() => {
                const seconds = Math.max(0, Math.ceil((noteLock.expiresAt - noteLockClock) / 1000));
                const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
                const owner = noteLock.username || 'A collaborator';
                return <span className={`canvas-note-lock-timer${seconds <= 5 ? ' is-expiring' : ''}`} title={`${owner} · lock ${time}`} aria-label={`${owner} is editing this note, lock ${time}`} onPointerDown={(event) => event.stopPropagation()}>{time}</span>;
              })()}
              <span className="canvas-note-actions">
                <button type="button" title={note.locked ? 'Unlock note' : 'Lock note'} disabled={!mayEdit || lockHeldByOther} onClick={(event) => { event.stopPropagation(); updateNote(note.id, { locked: !note.locked }); }} aria-label={note.locked ? 'Unlock note' : 'Lock note'}>{note.locked ? <LockKeyhole size={12} /> : <LockOpen size={12} />}</button>
                <button type="button" title="Delete note" disabled={!mayEdit || lockHeldByOther} onClick={(event) => { event.stopPropagation(); onNotesChange?.(notes.filter((item) => item.id !== note.id)); }} aria-label="Delete note">×</button>
              </span>
            </header>
            <textarea aria-label="Graph note" value={note.text || ''} readOnly={!canEditText} placeholder="Add a note…" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={4000} onFocus={() => { focusedNoteRef.current = { roomKey: collaborationRoomKey, noteId: note.id }; noteEditHistoryRef.current = { noteId: note.id, historyStarted: false }; setFocusedNote(focusedNoteRef.current); }} onBlur={() => { if (focusedNoteRef.current?.roomKey === collaborationRoomKey && focusedNoteRef.current.noteId === note.id) focusedNoteRef.current = null; if (noteEditHistoryRef.current?.noteId === note.id) { if (noteEditHistoryRef.current.historyStarted) onHistoryGroupEnd?.(); noteEditHistoryRef.current = null; } setFocusedNote((current) => current?.roomKey === collaborationRoomKey && current.noteId === note.id ? null : current); if (ownsNoteLock) onReleaseNoteEditLock?.(note.id); }} onChange={(event) => { if (canEditText) { if (noteEditHistoryRef.current?.noteId === note.id && !noteEditHistoryRef.current.historyStarted) { onHistoryGroupStart?.(); noteEditHistoryRef.current.historyStarted = true; } updateNote(note.id, { text: event.target.value }); } }} />
            <div className="canvas-note-colors" aria-label="Note color">
              {['#f6d365', '#fca5a5', '#93c5fd', '#86efac', '#c4b5fd', '#f0abfc'].map((color) => <button key={color} type="button" aria-label={`Set note color ${color}`} title="Change note color" disabled={!mayEdit || lockHeldByOther} className={note.color === color ? 'is-selected' : ''} style={{ '--note-color': color }} onClick={() => updateNote(note.id, { color })} />)}
            </div>
            <footer title={`Created by ${note.createdBy || 'Unknown'} · ${new Date(note.createdAt).toLocaleString()}${note.editedBy ? ` · Edited by ${note.editedBy} · ${new Date(note.editedAt).toLocaleString()}` : ''}`}>
              <span>By {note.createdBy || 'Unknown'}</span>{note.editedAt && note.editedAt !== note.createdAt && <span>Edited {note.editedBy || ''}</span>}
            </footer>
          </article>;
        })}
        <div className="canvas-tag-group-label-layer" aria-label="Canvas sections">
          {tagGroupLayouts.map((group) => <div key={group.id} className={`canvas-tag-group-label-anchor ${zoom < 0.48 ? 'is-zoomed-out' : ''}`} data-tag-group-id={group.id} style={{ left: group.left, top: group.top, width: group.width, height: group.height, '--tag-group-color': group.color, '--tag-label-size': `${Math.max(11, 12 / zoom)}px` }}>
            <button type="button" className="canvas-tag-group-label" data-tag-group-id={group.id} title="Triple-click to select nodes in this section" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (event.detail === 3) selectTagGroupNodes(group.id); }}>{group.name}</button>
          </div>)}
        </div>
        <div className="canvas-collaborator-cursors" aria-hidden="true">
          {remoteCursorViews.filter((item) => !item.offscreen).map(({ peer }) => <RemoteCollaborationCursor key={`remote-cursor-${peer.userId}`} peer={peer} />)}
        </div>
        {remoteActions.filter((peer) => peer.action?.kind === 'library-drag' && peer.action.cursor).map((peer) => {
          const definition = definitionsByType.get(peer.action.nodeType);
          if (!definition) return null;
          const node = { id: `remote-preview-${peer.userId}`, type: peer.action.nodeType, label: peer.action.label || definition.label, data: {}, x: 0, y: 0 };
          return <div key={`remote-library-preview-${peer.userId}`} className="node-position node-drag-preview is-remote" style={{ transform: `translate3d(${peer.action.cursor.x}px, ${peer.action.cursor.y}px, 0)`, '--collaborator-color': peer.color }} aria-hidden="true"><CanvasNode node={node} definition={definition} connectedInputIds={EMPTY_PIN_SET} graphVariables={canvasGraphVariables} callableGraphs={callableGraphs} appEmojis={appEmojis} /></div>;
        })}
        {libraryDragPreview && <div className="node-position node-drag-preview" style={{ transform: `translate3d(${libraryDragPreview.x}px, ${libraryDragPreview.y}px, 0)` }} aria-hidden="true">
          <CanvasNode node={libraryDragPreview.node} definition={libraryDragPreview.definition} connectedInputIds={EMPTY_PIN_SET} graphVariables={canvasGraphVariables} callableGraphs={callableGraphs} appEmojis={appEmojis} />
        </div>}
        <div className="canvas-chat-bubble-layer" aria-live="polite">
          {graphChatEnabled && graphChatBubbles.filter((bubble) => bubble.projectId === projectId && bubble.graphId === graphId && bubble.expiresAt > Date.now()).map((bubble) => <GraphChatBubble
            key={bubble.id}
            bubble={bubble}
            isOwn={bubble.userId === currentUser?.id}
            zoom={zoom}
            displayScale={getCanvasDisplayScale(containerRef.current)}
            onMove={onMoveGraphChatBubble}
          />)}
        </div>
      </div>

      {graphChatEnabled && graphChatComposerOpen && <div className="canvas-chat-composer-layer">
        <form
          ref={graphChatComposerRef}
          className="canvas-chat-composer"
          aria-label="Message graph collaborators"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            const content = graphChatDraft.trim();
            if (!content || !graphChatAnchor) return;
            if (onSendGraphChat?.(content, graphChatAnchor) === false) return;
            clearGraphChatTyping();
            setGraphChatComposerOpen(false);
            setGraphChatDraft('');
            setGraphChatAnchor(null);
          }}
        >
          <textarea
            ref={graphChatInputRef}
            aria-label="Canvas message"
            placeholder="Send message to users in graph..."
            value={graphChatDraft}
            maxLength={280}
            rows={1}
            onFocus={() => reportGraphChatCursorMode('move')}
            onBlur={clearGraphChatTyping}
            onChange={(event) => {
              updateGraphChatTyping(event.target.value);
              setGraphChatDraft(event.target.value);
              event.currentTarget.style.height = '42px';
              event.currentTarget.style.height = `${Math.min(120, Math.max(42, event.currentTarget.scrollHeight))}px`;
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape' || (event.key === 'Backspace' && !graphChatDraft)) {
                event.preventDefault();
                clearGraphChatTyping();
                setGraphChatComposerOpen(false);
                setGraphChatDraft('');
                setGraphChatAnchor(null);
              } else if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </form>
      </div>}

      <div className="canvas-collaborator-offscreen-layer" aria-live="polite">
        {remoteCursorViews.filter((item) => item.offscreen).map(({ peer, left, top, angle, edge }) => <div key={`remote-offscreen-${peer.userId}`} className={`canvas-collaborator-offscreen is-edge-${edge} ${peer.action.kind === 'idle' || peer.action.cursorIdle ? 'is-idle' : ''}`} tabIndex={0} title={`${peer.username} is outside your view`} aria-label={`${peer.username} is outside your canvas view`} style={{ left, top, '--collaborator-color': peer.action.kind === 'idle' || peer.action.cursorIdle ? '#858c98' : peer.color, '--collaborator-angle': `${angle}deg` }}><i aria-hidden="true" /><span>{peer.username}</span></div>)}
      </div>

      <div className="canvas-collaborator-navigation-layer" aria-live="polite">
        {remoteActions.filter((peer) => peer.action?.kind === 'navigation').map((peer) => <div key={`remote-navigation-${peer.userId}`} className="canvas-collaborator-navigation" tabIndex={0} title={`${peer.username} · ${peer.action.label || 'Navigating menus'}`} aria-label={`${peer.username}: ${peer.action.label || 'Navigating menus'}`} style={{ '--collaborator-color': peer.color }}><i /><b>{String(peer.username || '?').slice(0, 1).toUpperCase()}</b><span>{peer.username} · {peer.action.label || 'Navigating menus'}</span></div>)}
      </div>

      {selectionBox && (() => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return null;
        const displayScale = getCanvasDisplayScale(containerRef.current);
        return <div className="canvas-selection-box" aria-hidden="true" style={{ left: (Math.min(selectionBox.x1, selectionBox.x2) - bounds.left) / displayScale, top: (Math.min(selectionBox.y1, selectionBox.y2) - bounds.top) / displayScale, width: Math.abs(selectionBox.x2 - selectionBox.x1) / displayScale, height: Math.abs(selectionBox.y2 - selectionBox.y1) / displayScale }} />;
      })()}

      <nav className="canvas-breadcrumbs" aria-label="Graph path">
        <button className="breadcrumb-library" onClick={onOpenLibrary} aria-label="Open Library" title="Library"><FolderTree size={13} /><span>Library</span></button><span>/</span>
        <span className="breadcrumb-graph"><FileCode2 size={13} />{graphName}</span>
        {viewportSectionId && tagGroups.find((group) => group.id === viewportSectionId) && <><span>/</span><span className="breadcrumb-section"><i style={{ '--tag-group-color': tagGroups.find((group) => group.id === viewportSectionId)?.color || '#5865f2' }} />{tagGroups.find((group) => group.id === viewportSectionId)?.name}</span></>}
        {breadcrumbNode && <><span>/</span><span className="breadcrumb-node" title={breadcrumbNodeLabel} aria-label={`Selected node: ${breadcrumbNodeLabel}`}>{breadcrumbNodeLabel}</span></>}
      </nav>

      {nodes.length === 0 && <div className="canvas-empty-hint"><span className="empty-hint-glyph"><Plus size={17} /></span><span>Build a graph</span><button onClick={() => onOpenPalette?.()}>Add first node <span className="context-shortcut" aria-label="Shift plus A"><kbd>Shift</kbd><kbd>A</kbd></span></button></div>}

      <div className={`canvas-tools ${canvasFindOpen ? 'is-finding' : ''}`} aria-label={canvasFindOpen ? 'Find on canvas' : 'Canvas controls'}>
        <div className="canvas-toolset" aria-hidden={canvasFindOpen}>
          <button tabIndex={canvasFindOpen ? -1 : 0} className="canvas-tool-button" onClick={() => { if (!textInputPopupOpen()) setZoom((value) => clamp(value / 1.15, 0.25, 2.5)); }} title="Zoom out" aria-label="Zoom out"><Minus size={15} /></button>
          <button tabIndex={canvasFindOpen ? -1 : 0} className="canvas-zoom-readout" onClick={() => { if (textInputPopupOpen()) return; setZoom(1); setPan({ x: 22, y: 18 }); }} title="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button tabIndex={canvasFindOpen ? -1 : 0} className="canvas-tool-button" onClick={() => { if (!textInputPopupOpen()) setZoom((value) => clamp(value * 1.15, 0.25, 2.5)); }} title="Zoom in" aria-label="Zoom in"><Plus size={15} /></button>
          <span className="canvas-tool-divider" />
          <button tabIndex={canvasFindOpen ? -1 : 0} className="canvas-tool-button" onClick={fitView} title="Frame graph" aria-label="Frame graph"><Maximize size={15} /></button>
          <button tabIndex={canvasFindOpen ? -1 : 0} className="canvas-tool-button canvas-find-toggle" onClick={() => { setCanvasFindQuery(''); setCanvasFindIndex(-1); setCanvasFindOpen(true); }} title="Find on canvas (⌘F)" aria-label="Find on canvas"><Search size={15} /></button>
        </div>
        <div className="canvas-find-controls" aria-hidden={!canvasFindOpen}>
          <label className="canvas-find-input"><Search size={14} /><input ref={canvasFindInputRef} value={canvasFindQuery} onChange={(event) => { setCanvasFindQuery(event.target.value); setCanvasFindIndex(-1); }} onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); navigateCanvasFind(event.shiftKey ? -1 : 1); }
            if (event.key === 'Escape') { event.preventDefault(); setCanvasFindOpen(false); }
          }} placeholder="Find on canvas" aria-label="Find nodes on canvas" tabIndex={canvasFindOpen ? 0 : -1} /></label>
          {Boolean(canvasFindQuery.trim()) && <span className="canvas-find-count" role="status">{canvasFindResults.error ? 'Invalid pattern' : canvasFindResults.results.length ? `${canvasFindIndex < 0 ? 0 : canvasFindIndex + 1} of ${canvasFindResults.results.length}` : 'No results'}</span>}
          <button type="button" className="canvas-find-button" onClick={() => navigateCanvasFind(-1)} title="Previous result (⌘⇧G)" aria-label="Previous canvas result" tabIndex={canvasFindOpen ? 0 : -1}><ChevronUp size={15} /></button>
          <button type="button" className="canvas-find-button" onClick={() => navigateCanvasFind(1)} title="Next result (⌘G)" aria-label="Next canvas result" tabIndex={canvasFindOpen ? 0 : -1}><ChevronDown size={15} /></button>
          <label className="canvas-find-option" title="Match case"><input type="checkbox" checked={canvasFindCaseSensitive} onChange={(event) => { setCanvasFindCaseSensitive(event.target.checked); setCanvasFindIndex(-1); }} tabIndex={canvasFindOpen ? 0 : -1} /> Aa</label>
          <label className="canvas-find-option" title="Match whole word"><input type="checkbox" checked={canvasFindWholeWord} onChange={(event) => { setCanvasFindWholeWord(event.target.checked); setCanvasFindIndex(-1); }} tabIndex={canvasFindOpen ? 0 : -1} /> ab</label>
          <label className="canvas-find-option" title="Use regular expression"><input type="checkbox" checked={canvasFindRegex} onChange={(event) => { setCanvasFindRegex(event.target.checked); setCanvasFindIndex(-1); }} tabIndex={canvasFindOpen ? 0 : -1} /> .*</label>
          <button type="button" className="canvas-find-button canvas-find-close" onClick={() => setCanvasFindOpen(false)} title="Close find (Esc)" aria-label="Close canvas find" tabIndex={canvasFindOpen ? 0 : -1}><X size={14} /></button>
        </div>
      </div>
      {!!(tagGroupLayouts.length || notes.length) && <aside className="canvas-note-timeline" aria-label="Graph sections and notes">
        <header>Sections &amp; notes</header>
        <div className="canvas-timeline-list">
          {tagGroupLayouts.map((group) => {
            const groupNotes = notes.filter((note) => tagGroupContainsNote(group, note));
            return <section className="canvas-timeline-section" key={group.id}>
              <button type="button" className="canvas-timeline-entry is-section" title={group.name} onClick={() => focusWorldPoint(group.left + group.width / 2, group.top + group.height / 2)}><i style={{ '--timeline-color': group.color || '#5865f2' }} /><span>{group.name}</span></button>
              {groupNotes.map((note) => <button key={note.id} type="button" className="canvas-timeline-entry is-note" title={`${note.createdBy || 'Unknown'} · ${note.text || 'Empty note'}`} onClick={() => focusWorldPoint(note.x + 112, note.y + 78)}><i style={{ '--timeline-color': note.color || group.color || '#f6d365' }} /><span>{String(note.text || 'Empty note').split('\n')[0].slice(0, 48) || 'Empty note'}</span></button>)}
            </section>;
          })}
          {notes.filter((note) => !tagGroupLayouts.some((group) => tagGroupContainsNote(group, note))).map((note, index) => <button key={note.id} type="button" className="canvas-timeline-entry is-note" title={`${note.createdBy || 'Unknown'} · ${note.text || 'Empty note'}`} onClick={() => focusWorldPoint(note.x + 112, note.y + 78)}><i style={{ '--timeline-color': note.color || '#f6d365' }} /><span>{String(note.text || `Note ${index + 1}`).split('\n')[0].slice(0, 48) || `Note ${index + 1}`}</span></button>)}
        </div>
      </aside>}
      {debugStep && <div className="canvas-debug-controls" role="group" aria-label="Paused graph debugging">
        <span><i />Paused · {debugStep.label || 'Node'}</span>
        <button onClick={() => onDebugAction?.('step')} title="Run the next node" aria-label="Step to next node"><StepForward size={14} />Step</button>
        <button onClick={() => onDebugAction?.('continue')} title="Continue until the next pause or completion" aria-label="Continue debug run"><FastForward size={14} />Continue</button>
      </div>}
      {contextMenu && createPortal(<div ref={contextMenuRef} className="canvas-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y, transform: `scale(${uiScale})`, transformOrigin: 'top left' }} onPointerDown={(event) => event.stopPropagation()}>
        {contextMenu.arrowId ? (() => {
          const arrow = canvasArrows.find((item) => item.id === contextMenu.arrowId);
          if (!arrow) return null;
          const manageable = !canvasLocked && !isLocked && canWriteGraphs && mayManageArrow(arrow)
            && (arrow.locked || (arrows.filter((item) => item?.locked).length < 300
              && (collaborationReady || arrow.createdById === currentUser?.id)));
          const ids = contextMenu.arrowIds?.length ? contextMenu.arrowIds : [arrow.id];
          return <>
            <button role="menuitem" title={!arrow.locked && arrows.filter((item) => item?.locked).length >= 300 ? 'This graph already has the maximum of 300 saved arrows' : undefined} disabled={!manageable} onClick={() => { toggleArrowLock(arrow); setContextMenu(null); }}>{arrow.locked ? 'Unlock arrow' : 'Keep arrow permanently'}</button>
            <button role="menuitem" className="is-danger" disabled={canvasLocked || ids.some((id) => { const item = canvasArrows.find((candidate) => candidate.id === id); return item?.locked && (isLocked || !canWriteGraphs || !mayManageArrow(item)); })} onClick={() => { deleteSelectedItems([], [], false, ids); setContextMenu(null); }}>Delete arrow{ids.length > 1 ? ` (${ids.length})` : ''}</button>
          </>;
        })() : contextMenu.noteId ? (() => {
          const note = notes.find((item) => item.id === contextMenu.noteId);
          return note ? <>
            <button role="menuitem" disabled={isLocked || (note.locked && !mayEditNote(note))} onClick={() => { onRequestCreateTagGroup?.([], [note.id]); setContextMenu(null); }}>Create color section… <span className="context-shortcut"><kbd>Shift</kbd><kbd>G</kbd></span></button>
            {tagGroups.map((group) => {
              const hasNote = (group.noteIds || []).includes(note.id);
              return <button key={group.id} role="menuitem" disabled={isLocked || (note.locked && !mayEditNote(note))} onClick={() => { onTagGroupsChange?.(tagGroups.map((item) => item.id === group.id ? { ...item, noteIds: hasNote ? (item.noteIds || []).filter((id) => id !== note.id) : [...(item.noteIds || []), note.id] } : item)); setContextMenu(null); }}>{hasNote ? 'Remove from' : 'Add to'} {group.name}</button>;
            })}
            <button role="menuitem" disabled={isLocked || isNoteBeingEditedByOther(note.id) || (note.locked && !mayEditNote(note))} onClick={() => { onNotesChange?.(notes.filter((item) => item.id !== note.id)); setContextMenu(null); }}>Delete note</button>
          </> : null;
        })() : contextMenu.groupId ? (() => {
          const group = tagGroups.find((item) => item.id === contextMenu.groupId);
          return group ? <>
            <button role="menuitem" disabled={isLocked} onClick={() => { onRequestEditTagGroup?.(group); setContextMenu(null); }}>Edit section</button>
            <button role="menuitem" className="is-danger" disabled={isLocked} onClick={() => { onTagGroupsChange?.(tagGroups.filter((item) => item.id !== group.id)); setContextMenu(null); }}>Delete section</button>
          </> : null;
        })() : contextMenu.wireId ? <button role="menuitem" disabled={isLocked} onClick={() => { onConnectionsChange?.(connections.filter((wire) => wire.id !== contextMenu.wireId)); setContextMenu(null); }}>Disconnect wire</button> : contextMenu.nodeId ? <>
          {(() => {
            const ids = contextMenu.nodeIds?.length ? contextMenu.nodeIds : [contextMenu.nodeId];
            const connected = connections.filter((wire) => ids.includes(wire.sourceNodeId) || ids.includes(wire.targetNodeId));
            return <button role="menuitem" disabled={isLocked || !connected.length} onClick={() => { const selected = new Set(ids); onConnectionsChange?.(connections.filter((wire) => !selected.has(wire.sourceNodeId) && !selected.has(wire.targetNodeId))); setContextMenu(null); }}>Disconnect all sockets{ids.length > 1 ? ` (${connected.length})` : ''}</button>;
          })()}
          <button role="menuitem" onClick={() => { copyNodes(contextMenu.nodeIds?.length ? contextMenu.nodeIds : [contextMenu.nodeId]); setContextMenu(null); }}>Copy {contextMenu.nodeIds?.length > 1 ? `${contextMenu.nodeIds.length} nodes` : 'node'} <span className="context-shortcut"><kbd>{shortcutModifier}</kbd><kbd>C</kbd></span></button>
          <button role="menuitem" disabled={isLocked} onClick={() => { onRenameNode?.(nodes.find((node) => node.id === contextMenu.nodeId)); setContextMenu(null); }}>Rename node <span className="context-shortcut"><kbd>{shortcutModifier}</kbd><kbd>R</kbd></span><span className="context-shortcut"><kbd>F11</kbd></span></button>
          <button role="menuitem" disabled={isLocked} onClick={() => { onRequestCreateTagGroup?.(contextMenu.nodeIds); setContextMenu(null); }}>Create color section… <span className="context-shortcut"><kbd>Shift</kbd><kbd>G</kbd></span></button>
          {(() => {
            const selectedIds = (contextMenu.nodeIds?.length ? contextMenu.nodeIds : [contextMenu.nodeId]).filter((id) => nodes.some((node) => node.id === id));
            return nearbyTagGroups(selectedIds).map((group) => {
            const groupNodeIds = group.nodeIds || [];
            const removeSelected = selectedIds.length > 0 && selectedIds.every((id) => groupNodeIds.includes(id));
            const actionLabel = selectedIds.length > 1 ? `${removeSelected ? 'Remove selected from' : 'Add selected to'}` : `${removeSelected ? 'Remove from' : 'Add to'}`;
            return <button key={group.id} role="menuitem" disabled={isLocked} onClick={() => { onTagGroupsChange?.(tagGroups.map((item) => item.id === group.id ? { ...item, nodeIds: removeSelected ? groupNodeIds.filter((id) => !selectedIds.includes(id)) : [...new Set([...groupNodeIds, ...selectedIds])] } : item)); setContextMenu(null); }}>{actionLabel} {group.name}</button>;
            });
          })()}
          <button role="menuitem" disabled={isLocked} onClick={() => { onSaveNodePrefab?.(contextMenu.node); setContextMenu(null); }}>Save as node prefab</button>
          <button role="menuitem" disabled={isLocked} onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); }}>Duplicate node</button>
          <button role="menuitem" className="is-danger" disabled={isLocked} onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); }}>Delete node <span className="context-shortcut"><kbd>Delete</kbd></span></button>
        </> : <>
          <button role="menuitem" onClick={() => { onOpenPalette?.(contextMenu.position); setContextMenu(null); }}>Add node <span className="context-shortcut" aria-label="Shift plus A"><kbd>Shift</kbd><kbd>A</kbd></span></button>
          <button role="menuitem" disabled={isLocked} onClick={() => addNote(contextMenu.position)}>Add note <span className="context-shortcut"><kbd>{formatShortcut(settings.shortcuts?.addNote || DEFAULT_SHORTCUTS.addNote, shortcutPlatform)}</kbd></span></button>
          {nodes.length > 0 && <button role="menuitem" disabled={isLocked} onClick={() => { onRequestCreateTagGroup?.(contextMenu.nodeIds); setContextMenu(null); }}>Create color section… {contextMenu.nodeIds?.length > 0 && <span className="context-shortcut"><kbd>Shift</kbd><kbd>G</kbd></span>}</button>}
          {(() => {
            const selectedIds = (contextMenu.nodeIds || []).filter((id) => nodes.some((node) => node.id === id));
            if (!selectedIds.length) return null;
            return nearbyTagGroups(selectedIds).filter((group) => selectedIds.some((id) => (group.nodeIds || []).includes(id))).map((group) => {
              const groupNodeIds = group.nodeIds || [];
              const removeIds = selectedIds.filter((id) => groupNodeIds.includes(id));
              return <button key={`remove-selected-${group.id}`} role="menuitem" disabled={isLocked} onClick={() => { onTagGroupsChange?.(tagGroups.map((item) => item.id === group.id ? { ...item, nodeIds: groupNodeIds.filter((id) => !removeIds.includes(id)) } : item)); setContextMenu(null); }}>Remove {removeIds.length > 1 ? 'selected from' : 'from'} {group.name}</button>;
            });
          })()}
          <button role="menuitem" disabled={!clipboardRef.current || isLocked} onClick={() => { pasteNodes(); setContextMenu(null); }}>Paste {clipboardRef.current?.nodes?.length > 1 ? `${clipboardRef.current.nodes.length} nodes` : 'node'} <kbd>{shortcutModifier} V</kbd></button>
          <button role="menuitem" onClick={() => { fitView(); setContextMenu(null); }}>Frame graph <span className="context-shortcut"><kbd>F</kbd></span></button>
        </>}
      </div>, document.body)}
      <Modal
        isOpen={Boolean(deleteConfirmationIds)}
        onClose={() => { setDeleteConfirmationIds(null); setDeleteConfirmationNoteIds([]); setDeleteConfirmationArrowIds([]); }}
        onConfirm={() => deleteSelectedItems(deleteConfirmationIds || [], deleteConfirmationNoteIds, true, deleteConfirmationArrowIds)}
        title="Delete selected items?"
        subtitle={`This will delete ${deleteConfirmationIds?.length || 0} nodes${deleteConfirmationNoteIds.length ? ` and ${deleteConfirmationNoteIds.length} notes` : ''}${deleteConfirmationArrowIds.length ? ` and ${deleteConfirmationArrowIds.length} arrows` : ''} and their connections.`}
        footer={<><Button variant="secondary" onClick={() => { setDeleteConfirmationIds(null); setDeleteConfirmationNoteIds([]); setDeleteConfirmationArrowIds([]); }}>Cancel</Button><Button variant="danger" onClick={() => deleteSelectedItems(deleteConfirmationIds || [], deleteConfirmationNoteIds, true, deleteConfirmationArrowIds)}>Delete selected</Button></>}
      >
        <p className="close-graph-copy">This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

function isTextTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || Boolean(target.closest('.arc-dropdown')));
}

function shadeWireColor(hex, amount) {
  const normalized = /^#[\da-f]{6}$/i.test(hex) ? hex.slice(1) : '9299a6';
  const channels = [0, 2, 4].map((index) => Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(index, index + 2), 16) * (1 + amount / 100)))));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function estimateNodeHeight(definition) {
  const rows = Math.max(definition?.inputs?.length || 0, definition?.outputs?.length || 0);
  return 48 + rows * 23 + 28;
}

function estimateNodeCardHeight(node, definition) {
  const pinHeight = estimateNodeHeight(definition);
  let configHeight = 120;
  if (node?.type === 'value_number' || node?.type === 'value_boolean' || node?.type?.startsWith('math_')) configHeight = 64;
  else if (node?.type === 'variable_create') configHeight = 320;
  else if (node?.type === 'format_text') configHeight = 180;
  else if (node?.type === 'build_embed') configHeight = 370;
  else if (node?.type === 'build_modal') configHeight = 82;
  else if (node?.type === 'data_permission_overwrites') configHeight = 78;
  else if (node?.type === 'action_web_fetch') configHeight = 470;
  else if (node?.type === 'action_web_retry') configHeight = 590;
  else if (node?.type === 'action_http_download') configHeight = 320;
  else if (node?.type === 'action_send_message' || node?.type === 'action_edit_message' || node?.type === 'action_edit_components') configHeight = 490;
  else if (['action_create_thread', 'action_start_thread_from_message'].includes(node?.type)) configHeight = 320;
  else if (node?.type === 'branch_switch') configHeight = 150;
  else if (definition?.pluginAdapter) configHeight = 120 + (definition.inputs || []).filter((pin) => pin.type !== 'exec').length * 42;
  return pinHeight + configHeight;
}

function estimateCulledNodeHeight(node, definition) {
  return Math.max(720, estimateNodeCardHeight(node, definition) + 220);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function readTransferData(dataTransfer, type) {
  try { return dataTransfer.getData(type); } catch { return ''; }
}

function parseLibraryTransferText(value) {
  const prefix = 'arc-studio:';
  if (!String(value || '').startsWith(prefix)) return null;
  const payloadStart = value.indexOf(':', prefix.length);
  if (payloadStart < 0) return null;
  return { mimeType: value.slice(prefix.length, payloadStart), token: value.slice(payloadStart + 1) };
}

function defaultForType(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'object') return {};
  return '';
}
