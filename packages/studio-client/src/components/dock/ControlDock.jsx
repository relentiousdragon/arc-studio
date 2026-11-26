import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { emitTo, listen as listenTauriEvent } from '@tauri-apps/api/event';
import { GatewayIntentCatalog } from 'chezcord/gateway-events';
import {
  Activity, AlertTriangle, Archive, Check, ChevronDown, ChevronLeft, ChevronUp, CircleCheck, CircleX, ClipboardCopy, Cpu, FileText,
  GitCompare, Globe2, PictureInPicture2, Play, Plus, Save, Search, Server, ShieldCheck, Smile, Square, StepForward, Terminal, Trash2, Upload, X
} from 'lucide-react';
import { arcEvents } from '../../core/ArcEvents.js';
import { apiUrl } from '../../core/api.js';
import { xhrJson } from '../../core/xhrJson.js';
import { onPageBlur } from '../../core/pageFocus.js';
import { readAppStorage, writeAppStorage } from '../../core/storage.js';
import { isDesktopPromptActive } from '../../core/desktopPrompts.js';
import { AnimatedDropdown } from '../ui/CustomControls.jsx';
import { CharacterLimit } from '../ui/Inputs.jsx';
import { CustomEmoji } from '../ui/CustomEmoji.jsx';
import { getArcUiScale } from '../../core/uiScale.js';
import { BuiltInNodeDefinitions } from '../nodes/nodeDefinitions.js';
import { Modal } from '../ui/Modal.jsx';
import { DISCORD_PERMISSIONS, permissionsToBitfield, bitfieldToPermissions } from '../nodes/permissionCatalog.js';

const PERMISSION_DROPDOWN_OPTIONS = DISCORD_PERMISSIONS.map((perm) => ({ value: perm.key, label: perm.label }));
const DEFAULT_MOCK_PERMISSIONS = Object.freeze([
  'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'UseApplicationCommands', 'AddReactions'
]);
const HTTP_METHOD_OPTIONS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((value) => ({ value, label: value }));

const EMPTY_DEBUG_VALUES = [];
//
function deploymentCommandStatusMap(changes = {}) {
  const entries = new Map();
  for (const [key, label] of [['created', 'Create'], ['updated', 'Update'], ['unchanged', 'Unchanged'], ['removed', 'Remove']]) {
    for (const command of changes[key] || []) {
      const commandKey = `${Number(command?.type || 1)}:${String(command?.name || '').toLowerCase()}`;
      const items = entries.get(commandKey) || [];
      items.push({ label, targets: command.guildIds?.length || 1 });
      entries.set(commandKey, items);
    }
  }
  return new Map([...entries].map(([key, items]) => [key, items.map(({ label, targets }) => targets > 1 ? `${label} · ${targets} targets` : label).join(' · ')]));
}

function parseSimulationObject(source, label) {
  let value;
  try { value = JSON.parse(String(source || '{}')); }
  catch { throw new Error(`${label} must be valid JSON.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function matchSimulationPath(routePattern, requestPath) {
  const expected = String(routePattern || '').split('/');
  const actual = String(requestPath || '').split('/');
  if (expected.length !== actual.length || !String(requestPath || '').startsWith('/')) throw new Error('Request path does not match the selected On Web Request route.');
  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(':')) {
      try { params[expected[index].slice(1)] = decodeURIComponent(actual[index]); }
      catch { throw new Error('Request path contains an invalid encoded parameter.'); }
    } else if (expected[index] !== actual[index]) throw new Error('Request path does not match the selected On Web Request route.');
  }
  return params;
}

function simulationSamplePath(routePath) {
  return String(routePath || '/').split('/').map((part) => part.startsWith(':') ? 'sample' : part).join('/') || '/';
}

function createMockWebRequestPayload(values, timestamp) {
  const route = values.webRequestNode;
  if (!route) throw new Error('Add an On Web Request node before testing an HTTP request.');
  const method = String(values.httpMethod || route.data?.method || 'GET').toUpperCase();
  const path = String(values.httpPath || '');
  const params = matchSimulationPath(route.data?.path || '/', path);
  const rawQuery = parseSimulationObject(values.httpQuery, 'Query parameters');
  const query = Object.create(null);
  for (const [name, value] of Object.entries(rawQuery)) {
    query[name] = /token|secret|password|authorization|cookie|api[_-]?key/i.test(name) ? '[REDACTED]' : value;
  }
  const rawHeaders = parseSimulationObject(values.httpHeaders, 'Request headers');
  const headers = Object.fromEntries(Object.entries(rawHeaders)
    .filter(([name]) => !/authorization|cookie|token|secret|password|api[_-]?key/i.test(name))
    .map(([name, value]) => [name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value ?? '')]));
  const contentType = String(values.httpBodyType || 'application/json');
  const bodyText = String(values.httpBody || '');
  if (new TextEncoder().encode(bodyText).length > 16 * 1024) throw new Error('Request body exceeds 16 KB.');
  let body = bodyText;
  if (contentType.includes('json')) {
    try { body = bodyText.trim() ? JSON.parse(bodyText) : null; }
    catch { throw new Error('Request body must be valid JSON. Open it in Text Studio to edit larger payloads.'); }
  }
  if (contentType && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['content-type'] = contentType;
  const requestId = `mock_request_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
  const webServerId = (values.graph?.connections || []).find((connection) => connection.targetNodeId === route.id && connection.targetPinId === 'web_server_id')?.sourceNodeId || route.data?.web_server_id || '';
  const safeQuery = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) safeQuery.append(name, String(item ?? ''));
  }
  const requestUrl = `${path}${safeQuery.size ? `?${safeQuery.toString()}` : ''}`;
  return {
    requestId,
    routeId: route.id,
    webServerId,
    method,
    path,
    query,
    params,
    headers,
    body,
    request: { method, url: requestUrl, path, headers }
  };
}

function SimulatorTextField({ label, value, onChange, onOpenTextStudio, maxLength = 100000, rows = 2 }) {
  return <div className="simulator-text-field">
    <label className="dock-field-label"><span>{label}</span><textarea className="studio-field simulator-json-field" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} spellCheck={false} autoCapitalize="off" autoCorrect="off" /></label>
    <button type="button" className="dock-icon-button simulator-text-editor-button" title={`Open ${label} in Text Studio`} aria-label={`Open ${label} in Text Studio`} onClick={() => onOpenTextStudio?.(label, value, maxLength, onChange)}><FileText size={13} /></button>
  </div>;
}

function commandRequestError(error, fallback) {
  if (error?.message === 'Failed to fetch') return 'ARC Studio server is unreachable. Check that it is running, then try again.';
  if (error?.message === 'The string did not match the expected pattern.') return 'Command review could not form a valid Discord request. Reconnect the gateway to refresh the app details, then try again.';
  return error?.message || fallback;
}

function duplicateSlashCommandName(message) {
  const value = String(message || '');
  const match = value.match(/(?:^|\s)\/([^\s".]+) is also defined|named \/([^\s.]+)|defines \/([^\s.]+)|Slash command \/([^\s.]+) is defined more than once/i);
  return (match?.[1] || match?.[2] || match?.[3] || match?.[4] || '').toLowerCase();
}

function duplicateSlashCommandMessage(name) {
  return `Slash command /${name} is defined more than once. Names must be unique.`;
}

function flattenReviewedSlashOptions(options = [], parents = []) {
  return (Array.isArray(options) ? options : []).flatMap((option) => {
    const type = Number(option.type || 3);
    const name = [...parents, option.name].filter(Boolean).join(' / ');
    if (type === 1 || type === 2) return [
      { key: `${name}:${type}`, name, description: `${type === 2 ? 'Subcommand group' : 'Subcommand'} · ${option.description || ''}` },
      ...flattenReviewedSlashOptions(option.options, [...parents, option.name])
    ];
    const typeLabel = ({ 3: 'Text', 4: 'Integer', 5: 'Boolean', 6: 'User', 7: 'Channel', 8: 'Role', 9: 'Mentionable', 10: 'Number', 11: 'Attachment' })[type] || 'Argument';
    const details = [];
    if (option.autocomplete && option.dynamicAutocomplete) details.push('Graph generated autocomplete');
    else if (Array.isArray(option.choices) && option.choices.length) {
      details.push(`Choices: ${option.choices.map((choice) => `${choice.name} (${choice.value})`).join(', ')}`);
    }
    if (type === 3 && (option.min_length !== undefined || option.max_length !== undefined)) {
      details.push(`Length ${option.min_length ?? 0}–${option.max_length ?? 'unlimited'}`);
    } else if ([4, 10].includes(type) && (option.min_value !== undefined || option.max_value !== undefined)) {
      details.push(`Range ${option.min_value ?? 'unlimited'}–${option.max_value ?? 'unlimited'}`);
    }
    if (type === 7 && option.channel_types?.length) details.push(`Channel filters: ${option.channel_types.join(', ')}`);
    return [{ key: name, name, description: `${typeLabel} · ${option.required ? 'Required' : 'Optional'} · ${option.description || ''}${details.length ? ` · ${details.join(' · ')}` : ''}` }];
  });
}
//
function resolveLogNodeTarget(log, activeTabId) {
  if (log?.meta?.graphId && log?.meta?.nodeId) {
    return { graphId: log.meta.graphId, nodeId: log.meta.nodeId };
  }
  const text = String(log?.message || '');
  const idMatch = /\((node_[a-zA-Z0-9_]+)\)/.exec(text)
    || /node\s+["“]?([a-zA-Z0-9_-]+)["”]?/i.exec(text)
    || /Failed on node\s+([a-zA-Z0-9_-]+)/i.exec(text);
  if (idMatch) {
    return { graphId: log?.meta?.graphId || activeTabId, nodeId: idMatch[1] };
  }
  return null;
}

export function ControlDock({
  logs = [], botStatus = 'DISCONNECTED', discordAuthWarning = null, botMetrics = {}, botProfile, activeTabId, activeProjectId = '', authToken, onEmojisChange, emojiCacheScope = '', networkOnline = true, cachedAppEmojis = [],
  graphs = [], graphLookup = new Map(), graphValidationReports = [], graphNodes = [], nodeDefinitions = BuiltInNodeDefinitions, compactContextMenus = false, autoResizeDockOnScroll = true, isLocked = false, canControlBot = false, desktopMode = false, consoleOpenRequest = 0, gatewayStartedRequest = 0, commandBrowserRequest = 0, onClearLogs, onStartBot, onStopBot, onEnsureGraphsSaved, onOpenGraph, onTraceLog, onTraceIssue, onIntentSummaryChange, onOpenTextStudio, onOpenChange
}) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  const [activeTab, setActiveTab] = useState('console');
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const lastConsoleShortcutRequestRef = useRef(consoleOpenRequest);
  const lastGatewayStartedRequestRef = useRef(gatewayStartedRequest);
  useEffect(() => {
    if (!isOpen || activeTab !== 'hub' || !authToken || !networkOnline || !canControlBot) return undefined;
    let current = true;
    const refreshIntents = async () => {
      try {
        const response = await fetch(apiUrl('/api/bot/intents'), { headers: { 'x-arc-token': authToken } });
        const data = await response.json();
        if (current && response.ok && Array.isArray(data.intents)) onIntentSummaryChange?.(data.intents);
      } catch {}
    };
    refreshIntents();
    const timer = window.setInterval(refreshIntents, 60_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [isOpen, activeTab, authToken, networkOnline, canControlBot, onIntentSummaryChange]);
  const [dockHeight, setDockHeight] = useState(() => {
    try { return clamp(Number(readAppStorage('arc_dock_height')) || 284, 180, 620); }
    catch { return 284; }
  });
  const dockHeightRef = useRef(dockHeight);
  const lastExpandedDockHeightRef = useRef(Math.max(284, dockHeight));
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef({ y: 0, height: 0 });
  const dockRef = useRef(null);
  const autoResizeStateRef = useRef(null);
  const wheelDeltaRef = useRef(0);
  const wheelFrameRef = useRef(0);
  const wheelCommitTimerRef = useRef(0);
  const wheelGestureRef = useRef({ direction: 0, amount: 0, lastAt: 0 });
  const wheelGuardUntilRef = useRef(0);
  const dockTabSwipeRef = useRef(null);
  const dockTabSwipeFrameRef = useRef(0);
  const dockWheelAxisRef = useRef({ axis: '', lastAt: 0 });
  autoResizeStateRef.current = { enabled: autoResizeDockOnScroll, isOpen, isLocked, isResizing };
  const logContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastLogsLengthRef = useRef(logs?.length || 0);
  const prevTabRef = useRef(activeTab);
  const [consolePopupRoot, setConsolePopupRoot] = useState(null);
  const consolePopupWindowRef = useRef(null);
  const prevOpenRef = useRef(Boolean(isOpen || consolePopupRoot));

  const handleConsoleScroll = useCallback((event) => {
    const el = event.currentTarget;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom <= 56;
  }, []);
  const [filterLevel, setFilterLevel] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDebugLogs, setShowDebugLogs] = useState(() => readAppStorage('arc_console_show_debug_logs') === 'true');
  const [expandedLogGroups, setExpandedLogGroups] = useState(() => new Set());
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileContent, setFileContent] = useState(null);
  const [consoleContextMenu, setConsoleContextMenu] = useState(null);
  const [consoleContextLog, setConsoleContextLog] = useState(null);
  const consoleContextMenuRef = useRef(null);
  const lastProjectIdRef = useRef(activeProjectId);

  const closeConsolePopup = () => {
    const popup = consolePopupWindowRef.current;
    consolePopupWindowRef.current = null;
    setConsolePopupRoot(null);
    setActiveTab('console');
    setIsOpen(true);
    if (popup && !popup.closed) popup.close();
  };

  const openConsolePopup = () => {
    const existing = consolePopupWindowRef.current;
    if (existing && !existing.closed) { existing.focus(); return; }
    const popup = window.open('', 'arc-studio-console', 'popup=yes,width=1100,height=720,resizable=yes,scrollbars=no');
    if (!popup) return;
    const popupDocument = popup.document;
    popupDocument.open();
    popupDocument.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARC Studio Console</title></head><body></body></html>');
    popupDocument.close();
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((styleNode) => {
      popupDocument.head.appendChild(styleNode.cloneNode(true));
    });
    popupDocument.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark';
    const appRoot = document.querySelector('.app-root');
    const root = popupDocument.createElement('div');
    root.className = 'app-root console-popout-root';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.transform = 'none';
    for (const attribute of ['data-theme', 'data-release-channel', 'data-ui-scale', 'data-compact-context', 'data-reduce-motion']) {
      if (appRoot?.hasAttribute(attribute)) root.setAttribute(attribute, appRoot.getAttribute(attribute));
    }
    root.style.setProperty('--arc-ui-scale', getComputedStyle(appRoot || document.documentElement).getPropertyValue('--arc-ui-scale').trim() || '1');
    popupDocument.body.appendChild(root);
    consolePopupWindowRef.current = popup;
    setConsolePopupRoot(root);
    setActiveTab('console');
    setIsOpen(false);
    popup.addEventListener('pagehide', () => {
      if (consolePopupWindowRef.current !== popup) return;
      consolePopupWindowRef.current = null;
      setConsolePopupRoot(null);
      setActiveTab('console');
      setIsOpen(true);
    }, { once: true });
  };

  useEffect(() => {
    if (lastProjectIdRef.current === activeProjectId) return;
    lastProjectIdRef.current = activeProjectId;
    closeConsolePopup();
    commandPreviewRequestRef.current += 1;
    setCommandReview(null);
    setReviewingCommands(false);
    setUpdatingCommandReview(false);
    setGuildIdDraft('');
    setGuildIdError('');
    setDeployError('');
  }, [activeProjectId]);

  useEffect(() => {
    if (!consolePopupRoot) return undefined;
    const popup = consolePopupWindowRef.current;
    if (!popup) return undefined;
    const syncTheme = () => {
      const appRoot = document.querySelector('.app-root');
      for (const attribute of ['data-theme', 'data-release-channel', 'data-ui-scale', 'data-compact-context', 'data-reduce-motion']) {
        if (appRoot?.hasAttribute(attribute)) consolePopupRoot.setAttribute(attribute, appRoot.getAttribute(attribute));
        else consolePopupRoot.removeAttribute(attribute);
      }
      popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark';
      consolePopupRoot.style.setProperty('--arc-ui-scale', getComputedStyle(appRoot || document.documentElement).getPropertyValue('--arc-ui-scale').trim() || '1');
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const appRoot = document.querySelector('.app-root');
    if (appRoot) observer.observe(appRoot, { attributes: true, attributeFilter: ['data-theme', 'data-release-channel', 'data-ui-scale', 'data-compact-context', 'data-reduce-motion', 'style'] });
    const monitor = window.setInterval(() => {
      if (popup.closed) {
        consolePopupWindowRef.current = null;
        setConsolePopupRoot(null);
        setActiveTab('console');
        setIsOpen(true);
      }
    }, 400);
    return () => { observer.disconnect(); window.clearInterval(monitor); };
  }, [consolePopupRoot]);

  useEffect(() => () => {
    const popup = consolePopupWindowRef.current;
    consolePopupWindowRef.current = null;
    if (popup && !popup.closed) popup.close();
  }, []);

  const [selectedEvent, setSelectedEvent] = useState('MESSAGE_CREATE');
  const [mockContent, setMockContent] = useState('!ping');
  const [mockAuthor, setMockAuthor] = useState('Studio Tester');
  const [mockChannelId, setMockChannelId] = useState('120000000000000002');
  const [mockCommand, setMockCommand] = useState('help');
  const [mockCustomId, setMockCustomId] = useState('mock_button_click');
  const [mockPermissions, setMockPermissions] = useState(() => DEFAULT_MOCK_PERMISSIONS);
  const [mockModalFieldId, setMockModalFieldId] = useState('sample-input');
  const [mockModalValues, setMockModalValues] = useState({});
  const [selectedWebRequestNodeId, setSelectedWebRequestNodeId] = useState('');
  const [mockHttpMethod, setMockHttpMethod] = useState('GET');
  const [mockHttpPath, setMockHttpPath] = useState('/items/sample');
  const [mockHttpQuery, setMockHttpQuery] = useState('{\n  "allow": "yes"\n}');
  const [mockHttpHeaders, setMockHttpHeaders] = useState('{\n  "content-type": "application/json"\n}');
  const [mockHttpBodyType, setMockHttpBodyType] = useState('application/json');
  const [mockHttpBody, setMockHttpBody] = useState('{\n  "name": "Sample"\n}');
  const [selectedModalNodeId, setSelectedModalNodeId] = useState('');
  const [modalSubmissionSnapshot, setModalSubmissionSnapshot] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [tracePathExpanded, setTracePathExpanded] = useState(false);
  const [traceOutputsExpanded, setTraceOutputsExpanded] = useState(false);
  const [expandedTraceOutputIds, setExpandedTraceOutputIds] = useState(() => new Set());
  const [debugRunId, setDebugRunId] = useState('');
  const debugRunIdRef = useRef('');
  const [debugStep, setDebugStep] = useState(null);
  const [debugAdvancing, setDebugAdvancing] = useState(false);
  const [fixtures, setFixtures] = useState(() => {
    try { const raw = readAppStorage('arc_simulation_fixtures'); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  });
  const [fixtureName, setFixtureName] = useState('');
  const [showFixtureName, setShowFixtureName] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const traceGraph = graphs.find((graph) => graph.id === (simResult?.tabId || activeTabId));
  const traceNodeById = useMemo(() => new Map((traceGraph?.nodes || (simResult?.tabId === activeTabId ? graphNodes : [])).map((node) => [node.id, node])), [traceGraph, simResult?.tabId, activeTabId, graphNodes]);
  const simulationModals = useMemo(() => graphNodes.filter((node) => node.type === 'build_modal' && Array.isArray(node.data?.modal?.components)).map((node) => ({ node, modal: node.data.modal })), [graphNodes]);
  const selectedSimulationModal = simulationModals.find(({ node }) => node.id === selectedModalNodeId) || null;
  const selectedModalFields = selectedSimulationModal?.modal?.components || [];
  const simulationWebRequestNodes = useMemo(() => graphNodes.filter((node) => node.type === 'event_web_server_request'), [graphNodes]);
  const selectedWebRequestNode = simulationWebRequestNodes.find((node) => node.id === selectedWebRequestNodeId) || null;
  useEffect(() => {
    if (!simulationModals.some(({ node }) => node.id === selectedModalNodeId)) {
      const first = simulationModals[0] || null;
      setSelectedModalNodeId(first?.node.id || '');
      if (first) {
        setMockCustomId(String(first.modal.customId || ''));
        setMockModalValues(Object.fromEntries(first.modal.components.map((field) => [field.customId, mockModalDefault(field)])));
      }
    }
  }, [simulationModals, selectedModalNodeId]);
  useEffect(() => {
    if (!simulationWebRequestNodes.some((node) => node.id === selectedWebRequestNodeId)) {
      const first = simulationWebRequestNodes[0] || null;
      setSelectedWebRequestNodeId(first?.id || '');
      if (first) {
        setMockHttpMethod(String(first.data?.method || 'GET').toUpperCase());
        setMockHttpPath(simulationSamplePath(first.data?.path || '/'));
      }
    }
  }, [simulationWebRequestNodes, selectedWebRequestNodeId]);
  const nodeDefinitionByType = useMemo(() => new Map(nodeDefinitions.map((definition) => [definition.type, definition])), [nodeDefinitions]);
  const tracePathEntries = useMemo(() => {
    const executions = simResult?.executedNodeIds || [];
    const labels = executions.map((id) => {
      const node = traceNodeById.get(id);
      return node?.label || nodeDefinitionByType.get(node?.type)?.label || 'Unknown node';
    });
    const totals = new Map();
    for (const label of labels) totals.set(label, (totals.get(label) || 0) + 1);
    const nodeTotals = new Map();
    for (const id of executions) nodeTotals.set(id, (nodeTotals.get(id) || 0) + 1);
    const occurrences = new Map();
    const nodeOccurrences = new Map();
    return executions.map((id, index) => {
      const label = labels[index];
      const occurrence = (occurrences.get(label) || 0) + 1;
      occurrences.set(label, occurrence);
      const visit = (nodeOccurrences.get(id) || 0) + 1;
      nodeOccurrences.set(id, visit);
      const displayLabel = nodeTotals.get(id) > 1
        ? `${label} ↻${visit}`
        : totals.get(label) > 1 ? `${label} · ${occurrence}` : label;
      return { id, label, displayLabel };
    });
  }, [simResult?.executedNodeIds, traceNodeById, nodeDefinitionByType]);
  useEffect(() => {
    setTracePathExpanded(false);
    setTraceOutputsExpanded(false);
    setExpandedTraceOutputIds(new Set());
  }, [simResult]);

  const [emojiName, setEmojiName] = useState('');
  const [emojiImageBase64, setEmojiImageBase64] = useState('');
  const [emojiFileName, setEmojiFileName] = useState('');
  const [uploadingEmoji, setUploadingEmoji] = useState(false);
  const [emojiUploadProgress, setEmojiUploadProgress] = useState(0);
  const [appEmojis, setAppEmojis] = useState(cachedAppEmojis);
  const [emojiLimit, setEmojiLimit] = useState(2000);
  const [loadingEmojis, setLoadingEmojis] = useState(false);
  const [emojiError, setEmojiError] = useState('');
  const [deletingEmojiId, setDeletingEmojiId] = useState('');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPage, setEmojiPage] = useState(0);
  const [copiedEmojiId, setCopiedEmojiId] = useState('');
  const emojiFetchCacheRef = useRef({ scope: '', fetchedAt: 0 });
  const emojiPageSize = 15;
  const searchableEmojis = useMemo(() => {
    const needle = emojiSearch.trim().toLowerCase();
    const matches = needle ? appEmojis.filter((emoji) => `${emoji.name} ${emoji.id}`.toLowerCase().includes(needle)) : appEmojis;
    return matches;
  }, [appEmojis, emojiSearch]);
  const emojiPageCount = Math.ceil(searchableEmojis.length / emojiPageSize);
  const visibleAppEmojis = searchableEmojis.slice(emojiPage * emojiPageSize, (emojiPage + 1) * emojiPageSize);
  useEffect(() => setEmojiPage((page) => Math.min(page, Math.max(0, emojiPageCount - 1))), [emojiPageCount]);
  const [deployingCommands, setDeployingCommands] = useState(false);
  const [commandDeployUntil, setCommandDeployUntil] = useState(0);
  const [commandDeploySeconds, setCommandDeploySeconds] = useState(0);
  const [commandReview, setCommandReview] = useState(null);
  const commandReviewOpenRef = useRef(false);
  useLayoutEffect(() => { commandReviewOpenRef.current = Boolean(commandReview); }, [commandReview]);
  const [reviewingCommands, setReviewingCommands] = useState(false);
  const [updatingCommandReview, setUpdatingCommandReview] = useState(false);
  const [guildIdDraft, setGuildIdDraft] = useState('');
  const [guildIdError, setGuildIdError] = useState('');
  const [deployError, setDeployError] = useState('');
  const [rateLimitClock, setRateLimitClock] = useState(Date.now());
  const rateLimitUntil = Number(botMetrics?.rateLimitedUntil) || 0;
  const rateLimitSeconds = Math.max(0, Math.ceil((rateLimitUntil - rateLimitClock) / 1000));
  const isDiscordRateLimited = rateLimitSeconds > 0;

  useEffect(() => { setAppEmojis(Array.isArray(cachedAppEmojis) ? cachedAppEmojis : []); }, [cachedAppEmojis]);
  const [commandListOpen, setCommandListOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [selectedReviewCommand, setSelectedReviewCommand] = useState(null);
  const [selectedCommandStats, setSelectedCommandStats] = useState(null);
  const [commandDirectoryItems, setCommandDirectoryItems] = useState(null);
  const commandBrowserRequestRef = useRef(commandBrowserRequest);
  const commandPreviewRequestRef = useRef(0);
  const desktopCommandActionRef = useRef({});
  const [loadingCommandStats, setLoadingCommandStats] = useState(false);
  const [expandedReviewIssues, setExpandedReviewIssues] = useState(() => new Set());
  const commandReviewOpen = Boolean(commandReview);
  const cachedGuildOptionCount = commandReview?.guildOptions?.length || 0;
  useEffect(() => {
    if (!commandReviewOpen || !commandReview?.supportsScopedDeployment || cachedGuildOptionCount || botStatus !== 'ONLINE') return undefined;
    let current = true;
    let attempts = 0;
    let timer = 0;
    const requestId = commandPreviewRequestRef.current;
    const requestProjectId = activeProjectId;
    const refresh = async () => {
      attempts += 1;
      try {
        const response = await fetch(apiUrl('/api/bot/commands/guilds'), { cache: 'no-store', headers: { 'x-arc-token': authToken } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        if (!current || requestId !== commandPreviewRequestRef.current || lastProjectIdRef.current !== requestProjectId || !commandReviewOpenRef.current) return;
        if (Array.isArray(data.guilds) && data.guilds.length) {
          setCommandReview((review) => review ? { ...review, guildOptions: data.guilds, gatewayConnected: Boolean(data.gatewayConnected), guildDirectoryError: '' } : review);
          return;
        }
      } catch {}
      if (current && attempts < 8) timer = window.setTimeout(refresh, 1000);
    };
    void refresh();
    return () => { current = false; window.clearTimeout(timer); };
  }, [activeProjectId, authToken, botStatus, cachedGuildOptionCount, commandReview?.supportsScopedDeployment, commandReviewOpen]);
  const reviewCommandItems = useMemo(() => {
    if (!commandReview) return [];
    const commandKey = (cmd) => `${Number(cmd?.type || 1)}:${String(cmd?.name || '').toLowerCase()}`;
    const statusByKey = deploymentCommandStatusMap(commandReview.changes);
    const desired = (commandReview.commands || []).map((command) => {
      const graph = graphs.find((item) => (item.nodes || []).some((node) => {
        if (!['event_slash_command', 'event_user_command', 'event_message_command'].includes(node.type)) return false;
        const nodeType = node.type === 'event_user_command' ? 2 : node.type === 'event_message_command' ? 3 : 1;
        return nodeType === Number(command.type || 1) && String(node.data?.commandName || '').toLowerCase() === String(command.name).toLowerCase();
      }));
      return { ...command, status: statusByKey.get(commandKey(command)) || 'Command', graphName: graph?.name || '', graphId: graph?.id || '' };
    });
    const removed = (commandReview.changes?.removed || []).map((command) => ({ ...command, status: statusByKey.get(commandKey(command)) || 'Remove', description: 'This managed command will be removed.' }));
    return [...desired, ...removed];
  }, [commandReview, graphs]);
  const availableReviewCommands = commandReview?.availableCommands || commandReview?.commands || [];
  const allReviewCommandKeys = availableReviewCommands.map((command) => `${Number(command?.type || 1)}:${String(command?.name || '').toLowerCase()}`);
  const includedReviewCommandKeys = commandReview?.commandKeys == null ? allReviewCommandKeys : commandReview.commandKeys;
  const workspaceCommandItems = useMemo(() => {
    const byKey = new Map();
    for (const graph of graphs) {
      for (const node of graph.nodes || []) {
        if (!['event_slash_command', 'event_user_command', 'event_message_command'].includes(node.type)) continue;
        const type = node.type === 'event_user_command' ? 2 : node.type === 'event_message_command' ? 3 : 1;
        const rawName = String(node.data?.commandName || '').trim();
        if (!rawName) continue;
        const name = type === 1 ? rawName.toLowerCase() : rawName;
        const key = `${type}:${name.toLowerCase()}`;
        const current = byKey.get(key) || {
          name,
          type,
          description: type === 1 ? String(node.data?.description || '') : (type === 2 ? 'User context command' : 'Message context command'),
          options: Array.isArray(node.data?.options) ? node.data.options : [],
          status: 'Configured',
          graphName: graph.name || 'Untitled graph',
          graphId: graph.id,
          graphs: []
        };
        if (!current.graphs.some((item) => item.id === graph.id)) current.graphs.push({ id: graph.id, name: graph.name || 'Untitled graph' });
        byKey.set(key, current);
      }
    }
    return [...byKey.values()].map((command) => command.graphs.length > 1
      ? { ...command, graphName: `${command.graphs.length} graphs` }
      : command);
  }, [graphs]);
  const commandListItems = commandDirectoryItems || reviewCommandItems;
  const filteredReviewCommands = useMemo(() => {
    const needle = commandSearch.trim().toLowerCase();
    if (!needle) return commandListItems;
    return commandListItems.filter((command) => `${command.name} ${command.description || ''} ${command.graphName || ''} ${command.status}`.toLowerCase().includes(needle));
  }, [commandListItems, commandSearch]);
  const reviewIssueGroups = useMemo(() => {
    const groups = new Map();
    const add = (severity, message, location, keyOverride = '') => {
      const key = keyOverride || `${severity}:${message}`;
      if (!groups.has(key)) groups.set(key, { key, severity, message, locations: [] });
      const locations = groups.get(key).locations;
      if (!location.graph || !locations.some((item) => item.graph?.id === location.graph.id)) locations.push(location);
    };
    const privilegedIntentLabels = Object.entries(GatewayIntentCatalog)
      .filter(([, intent]) => intent.privileged && !intent.aliasOf)
      .map(([key, intent]) => ({ key, label: intent.label }));
    const freshIntentStatus = new Map((commandReview?.intents || []).map((intent) => [intent.key, intent.portalEnabled]));
    for (const { graph, report } of graphValidationReports) {
      for (const [severity, messages] of [['error', report.errors || []], ['warning', report.warnings || []]]) {
        for (const message of messages) {
          const duplicateName = severity === 'error' ? duplicateSlashCommandName(message) : '';
          let reviewMessage = duplicateName ? duplicateSlashCommandMessage(duplicateName) : message;
          if (severity === 'warning' && message.includes('Discord Developer Portal') && commandReview) {
            const mentionedIntents = privilegedIntentLabels.filter(({ label }) => message.includes(label));
            if (mentionedIntents.length) {
              const confirmedDisabled = mentionedIntents.filter(({ key }) => freshIntentStatus.get(key) === false);
              if (!confirmedDisabled.length) continue;
              reviewMessage = `Enable ${confirmedDisabled.map(({ label }) => label).join(' and ')} intent${confirmedDisabled.length > 1 ? 's' : ''} in the Discord Developer Portal, then reconnect the gateway.`;
            }
          }
          const node = (graph.nodes || []).find((item) => message.startsWith(`${item.label || item.type}:`));
          add(severity, reviewMessage, { graph, graphName: graph.name || 'Untitled graph', nodeName: node?.label || '', nodeId: report.errorNodeIds?.[message] || report.warningNodeIds?.[message] || node?.id }, duplicateName ? `error:duplicate-slash:${duplicateName}` : '');
        }
      }
    }
    for (const message of commandReview?.errors || []) {
      const duplicateName = duplicateSlashCommandName(message);
      const key = duplicateName ? `error:duplicate-slash:${duplicateName}` : '';
      if (duplicateName && groups.has(key)) continue;
      add('error', duplicateName ? duplicateSlashCommandMessage(duplicateName) : message, { graphName: 'Deployment review' }, key);
    }
    return [...groups.values()].sort((left, right) => left.severity === right.severity ? left.message.localeCompare(right.message) : left.severity === 'error' ? -1 : 1);
  }, [graphValidationReports, commandReview?.errors]);
  const reviewIssueCount = (severity) => reviewIssueGroups.filter((group) => group.severity === severity).length;
  const graphCheckCounts = useMemo(() => graphValidationReports.reduce((totals, { report }) => {
    totals.errors += report.errors?.length || 0;
    totals.warnings += report.warnings?.length || 0;
    return totals;
  }, { errors: 0, warnings: 0 }), [graphValidationReports]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--arc-dock-height', `${isOpen ? dockHeight : 45}px`);
    return () => document.documentElement.style.removeProperty('--arc-dock-height');
  }, [isOpen, dockHeight]);

  useEffect(() => {
    if (!isResizing) return undefined;
    document.body.classList.add('is-resizing-dock');
    return () => document.body.classList.remove('is-resizing-dock');
  }, [isResizing]);

  useEffect(() => {
    if (!commandDeployUntil) { setCommandDeploySeconds(0); return undefined; }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((commandDeployUntil - Date.now()) / 1000));
      setCommandDeploySeconds(remaining);
      if (remaining === 0) setCommandDeployUntil(0);
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [commandDeployUntil]);

  useEffect(() => {
    const offStep = arcEvents.on('simulation:debug-step', (payload) => {
      if (debugRunIdRef.current !== payload?.runId) return;
      setDebugStep(payload.step);
      setDebugAdvancing(false);
    });
    const offFinished = arcEvents.on('simulation:debug-finished', (payload) => {
      if (debugRunIdRef.current !== payload?.runId) return;
      debugRunIdRef.current = '';
      setDebugRunId('');
      setDebugAdvancing(false);
      setDebugStep(null);
      if (payload.result) {
        setSimResult(payload.result);
        arcEvents.emit('toast:notify', { title: payload.result.error ? 'Debug run failed' : 'Debug run complete', message: payload.result.error || `${payload.result.elapsedMs} ms · ${payload.result.interceptedOutputs.length} outputs`, type: payload.result.error ? 'error' : 'success' });
      } else if (payload.error) arcEvents.emit('toast:notify', { title: 'Debug run failed', message: payload.error, type: 'error' });
    });
    return () => { offStep(); offFinished(); };
  }, []);

  useEffect(() => {
    if (!isResizing) return undefined;
    const onMove = (event) => {
      const scale = getArcUiScale();
      const availableHeight = (window.visualViewport?.height || window.innerHeight) / scale;
      const next = clamp(resizeRef.current.height + (resizeRef.current.y - event.clientY) / scale, 180, Math.min(availableHeight - 100, 620));
      dockHeightRef.current = next;
      if (next > 180) lastExpandedDockHeightRef.current = next;
      setDockHeight(next);
    };
    const onUp = () => {
      setIsResizing(false);
      writeAppStorage('arc_dock_height', String(dockHeight));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [isResizing, dockHeight]);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return undefined;
    const dockContent = dock.querySelector('.dock-content');
    const clearTabSwipe = (swipe) => {
      if (!swipe || dockTabSwipeRef.current !== swipe) return;
      window.clearTimeout(swipe.endTimer);
      if (swipe.transitionEndHandler) dockContent?.removeEventListener('transitionend', swipe.transitionEndHandler);
      dockContent?.style.removeProperty('translate');
      dockContent?.style.removeProperty('transition');
      dockContent?.style.removeProperty('opacity');
      dockContent?.style.removeProperty('will-change');
      dockTabSwipeRef.current = null;
    };
    const completeTabSwipe = (swipe, nextTab) => {
      if (!swipe || swipe.finishing || !dockContent) return;
      swipe.finishing = true;
      window.clearTimeout(swipe.endTimer);
      if (dockTabSwipeFrameRef.current) window.cancelAnimationFrame(dockTabSwipeFrameRef.current);
      dockTabSwipeFrameRef.current = 0;
      const tabOrder = ['console', 'simulator', 'hub'];
      const tabStep = Math.sign(tabOrder.indexOf(nextTab) - tabOrder.indexOf(swipe.startTab));
      const outgoingOffset = swipe.offset - tabStep * 32;
      const incomingOffset = tabStep * 28;
      const finishOutgoing = () => {
        if (dockTabSwipeRef.current !== swipe) return;
        window.clearTimeout(swipe.endTimer);
        if (swipe.transitionEndHandler) dockContent.removeEventListener('transitionend', swipe.transitionEndHandler);
        swipe.transitionEndHandler = null;
        if (!autoResizeStateRef.current?.isOpen || activeTabRef.current !== swipe.startTab) {
          clearTabSwipe(swipe);
          return;
        }
        if (nextTab === 'console' && consolePopupWindowRef.current) closeConsolePopup();
        setActiveTab(nextTab);
        dockContent.style.transition = 'none';
        dockContent.style.translate = `${incomingOffset}px 0px`;
        dockContent.style.opacity = '0';
        dockTabSwipeFrameRef.current = window.requestAnimationFrame(() => {
          dockTabSwipeFrameRef.current = 0;
          if (dockTabSwipeRef.current !== swipe) return;
          dockContent.style.transition = 'translate 180ms cubic-bezier(.22,.61,.36,1), opacity 150ms ease-out';
          dockContent.style.translate = '0px 0px';
          dockContent.style.opacity = '1';
          swipe.endTimer = window.setTimeout(() => clearTabSwipe(swipe), 200);
        });
      };
      swipe.transitionEndHandler = (event) => {
        if (event.target === dockContent && event.propertyName === 'translate') finishOutgoing();
      };
      dockContent.addEventListener('transitionend', swipe.transitionEndHandler);
      dockContent.style.transition = 'translate 180ms cubic-bezier(.22,.61,.36,1), opacity 130ms ease-out';
      dockTabSwipeFrameRef.current = window.requestAnimationFrame(() => {
        dockTabSwipeFrameRef.current = 0;
        if (dockTabSwipeRef.current !== swipe) return;
        dockContent.style.transition = 'translate 180ms cubic-bezier(.22,.61,.36,1), opacity 130ms ease-out';
        dockContent.style.translate = `${outgoingOffset}px 0px`;
        dockContent.style.opacity = '0';
        swipe.endTimer = window.setTimeout(finishOutgoing, 210);
      });
    };
    const finishTabSwipe = () => {
      const swipe = dockTabSwipeRef.current;
      if (!swipe || !dockContent) return;
      const width = dockContent.getBoundingClientRect().width;
      const tabs = ['console', 'simulator', 'hub'];
      const nextTab = tabs[tabs.indexOf(swipe.startTab) + swipe.direction];
      const threshold = Math.max(72, Math.min(150, width * 0.2));
      const shouldChangeTab = autoResizeStateRef.current?.isOpen
        && activeTabRef.current === swipe.startTab
        && swipe.samples >= 3
        && swipe.distance >= threshold
        && Boolean(nextTab);
      if (shouldChangeTab) {
        completeTabSwipe(swipe, nextTab);
        return;
      }
      swipe.finishing = true;
      if (dockTabSwipeFrameRef.current) window.cancelAnimationFrame(dockTabSwipeFrameRef.current);
      dockTabSwipeFrameRef.current = 0;
      dockContent.style.transition = 'translate 180ms cubic-bezier(.4,0,.2,1)';
      dockContent.style.translate = '0px 0px';
      swipe.endTimer = window.setTimeout(() => clearTabSwipe(swipe), 200);
    };
    const onWheel = (event) => {
      const state = autoResizeStateRef.current;
      const now = performance.now();
      const target = event.target instanceof Element ? event.target : null;
      const tabs = ['console', 'simulator', 'hub'];
      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      const horizontalCandidate = !state?.isResizing
        && event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
        && absX >= Math.max(14, absY * 0.85);
      const axisLocked = dockWheelAxisRef.current.axis === 'horizontal'
        && now - dockWheelAxisRef.current.lastAt < 240;
      if (horizontalCandidate || axisLocked) {
        if (horizontalCandidate) dockWheelAxisRef.current = { axis: 'horizontal', lastAt: now };
        if (!horizontalCandidate || !target || !dockContent?.contains(target)) return;
        if (target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="option"], .arc-dropdown, .dock-tabs, [data-no-dock-swipe]')) return;
        for (let element = target; element && element !== dockContent; element = element.parentElement) {
          const style = window.getComputedStyle(element);
          if (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 2) return;
        }
        const currentSwipe = dockTabSwipeRef.current;
        if (currentSwipe?.finishing) {
          event.preventDefault();
          return;
        }
        const direction = Math.sign(event.deltaX);
        const sameGesture = currentSwipe && currentSwipe.direction === direction && now - currentSwipe.lastAt <= 240;
        const startTab = sameGesture ? currentSwipe.startTab : activeTabRef.current;
        const nextTab = tabs[tabs.indexOf(startTab) + direction];
        if (!nextTab) {
          if (currentSwipe) {
            window.clearTimeout(currentSwipe.endTimer);
            dockTabSwipeRef.current = null;
            if (dockTabSwipeFrameRef.current) window.cancelAnimationFrame(dockTabSwipeFrameRef.current);
            dockTabSwipeFrameRef.current = 0;
            dockContent.style.removeProperty('translate');
            dockContent.style.removeProperty('transition');
            dockContent.style.removeProperty('will-change');
          }
          event.preventDefault();
          return;
        }
        let swipe = sameGesture ? currentSwipe : null;
        if (!swipe) {
          if (currentSwipe) {
            window.clearTimeout(currentSwipe.endTimer);
            if (dockTabSwipeFrameRef.current) window.cancelAnimationFrame(dockTabSwipeFrameRef.current);
            dockTabSwipeFrameRef.current = 0;
            dockContent.style.removeProperty('translate');
            dockContent.style.removeProperty('transition');
            dockContent.style.removeProperty('will-change');
          }
          swipe = { direction, distance: 0, samples: 0, lastAt: now, endTimer: 0, finishing: false, startTab, offset: 0 };
          dockTabSwipeRef.current = swipe;
          dockContent.style.transition = 'none';
          dockContent.style.willChange = 'translate';
        }
        const width = dockContent.getBoundingClientRect().width;
        swipe.distance += absX;
        swipe.samples += 1;
        swipe.lastAt = now;
        const threshold = Math.max(72, Math.min(150, width * 0.2));
        swipe.offset = direction > 0
          ? -Math.min(width, swipe.distance)
          : Math.min(width, swipe.distance);
        if (!dockTabSwipeFrameRef.current) {
          dockTabSwipeFrameRef.current = window.requestAnimationFrame(() => {
            dockTabSwipeFrameRef.current = 0;
            if (dockTabSwipeRef.current === swipe && !swipe.finishing) dockContent.style.translate = `${swipe.offset}px 0px`;
          });
        }
        event.preventDefault();
        if (swipe.distance >= threshold && swipe.samples >= 3) {
          if (dockTabSwipeFrameRef.current) window.cancelAnimationFrame(dockTabSwipeFrameRef.current);
          dockTabSwipeFrameRef.current = 0;
          completeTabSwipe(swipe, nextTab);
          return;
        }
        window.clearTimeout(swipe.endTimer);
        swipe.endTimer = window.setTimeout(finishTabSwipe, 160);
        return;
      }
      if (!state?.enabled || state.isLocked || state.isResizing || event.deltaY === 0) return;
      if (now < wheelGuardUntilRef.current) {
        event.preventDefault();
        return;
      }
      const scale = getArcUiScale();
      const rawDelta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1) / scale;
      const direction = Math.sign(rawDelta);
      const gesture = wheelGestureRef.current;
      if (gesture.direction !== direction || now - gesture.lastAt > 260) {
        gesture.direction = direction;
        gesture.amount = 0;
      }
      gesture.amount += Math.abs(rawDelta);
      gesture.lastAt = now;

      if (!state.isOpen) {
        if (direction < 0) return;
        event.preventDefault();
        if (gesture.amount < 150) return;
        const viewportHeight = (window.visualViewport?.height || window.innerHeight) / scale;
        const maximum = Math.max(180, Math.min(viewportHeight - 100, 620));
        const restoreHeight = clamp(Math.max(284, lastExpandedDockHeightRef.current), 180, maximum);
        const hoveredTab = event.target instanceof Element ? event.target.closest('[data-dock-tab]')?.dataset.dockTab : '';
        const tabToOpen = ['console', 'simulator', 'hub'].includes(hoveredTab) ? hoveredTab : activeTabRef.current;
        setActiveTab(tabToOpen);
        if (tabToOpen === 'console' && consolePopupWindowRef.current) closeConsolePopup();
        dockHeightRef.current = restoreHeight;
        setDockHeight(restoreHeight);
        writeAppStorage('arc_dock_height', String(restoreHeight));
        setIsOpen(true);
        wheelGestureRef.current = { direction: 0, amount: 0, lastAt: 0 };
        wheelGuardUntilRef.current = now + 260;
        return;
      }

      if (direction < 0) {
        let scrollable = event.target instanceof Element ? event.target : null;
        while (scrollable && scrollable !== dock) {
          const style = window.getComputedStyle(scrollable);
          if (/(auto|scroll)/.test(style.overflowY) && scrollable.scrollHeight > scrollable.clientHeight + 1) break;
          scrollable = scrollable.parentElement;
        }
        if (scrollable !== dock && scrollable && scrollable.scrollTop > 0) {
          wheelGestureRef.current = { direction: 0, amount: 0, lastAt: 0 };
          return;
        }
      }

      const viewportHeight = (window.visualViewport?.height || window.innerHeight) / scale;
      const maximum = Math.max(180, Math.min(viewportHeight - 100, 620));
      const currentHeight = dockHeightRef.current;
      if (direction > 0 && currentHeight >= maximum) return;
      if (direction < 0 && currentHeight <= 180) {
        event.preventDefault();
        if (gesture.amount < 170) return;
        setIsOpen(false);
        wheelGestureRef.current = { direction: 0, amount: 0, lastAt: 0 };
        wheelGuardUntilRef.current = now + 260;
        return;
      }

      event.preventDefault();
      wheelGestureRef.current = { direction: 0, amount: 0, lastAt: 0 };
      wheelDeltaRef.current += rawDelta;
      if (wheelFrameRef.current) return;
      wheelFrameRef.current = window.requestAnimationFrame(() => {
        wheelFrameRef.current = 0;
        const amount = wheelDeltaRef.current;
        wheelDeltaRef.current = 0;
        const next = clamp(dockHeightRef.current + amount, 180, maximum);
        if (next === dockHeightRef.current) return;
        dockHeightRef.current = next;
        if (next > 180) lastExpandedDockHeightRef.current = next;
        dock.style.setProperty('--dock-height', `${next}px`);
        dock.style.height = `${next}px`;
        dock.classList.add('is-auto-resizing');
        document.documentElement.style.setProperty('--arc-dock-height', `${next}px`);
        window.clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = window.setTimeout(() => {
          dock.classList.remove('is-auto-resizing');
          setDockHeight(dockHeightRef.current);
          writeAppStorage('arc_dock_height', String(dockHeightRef.current));
        }, 180);
      });
    };
    dock.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      dock.removeEventListener('wheel', onWheel);
      const swipe = dockTabSwipeRef.current;
      if (swipe) {
        window.clearTimeout(swipe.endTimer);
        if (swipe.transitionEndHandler) dockContent?.removeEventListener('transitionend', swipe.transitionEndHandler);
      }
      dockTabSwipeRef.current = null;
      if (dockTabSwipeFrameRef.current) window.cancelAnimationFrame(dockTabSwipeFrameRef.current);
      dockTabSwipeFrameRef.current = 0;
      dockWheelAxisRef.current = { axis: '', lastAt: 0 };
      if (dockContent) {
        dockContent.style.removeProperty('translate');
        dockContent.style.removeProperty('transition');
        dockContent.style.removeProperty('will-change');
      }
      if (wheelFrameRef.current) window.cancelAnimationFrame(wheelFrameRef.current);
      window.clearTimeout(wheelCommitTimerRef.current);
      dock.classList.remove('is-auto-resizing');
    };
  }, []);

  useEffect(() => {
    const isConsoleActive = (isOpen || consolePopupRoot) && activeTab === 'console';
    const justOpenedOrSwitched = isConsoleActive && (
      prevTabRef.current !== activeTab ||
      !prevOpenRef.current
    );
    prevTabRef.current = activeTab;
    prevOpenRef.current = Boolean(isOpen || consolePopupRoot);

    const prevLength = lastLogsLengthRef.current;
    const currentLength = logs?.length || 0;
    lastLogsLengthRef.current = currentLength;

    if (!isConsoleActive || !logContainerRef.current) return;

    if (justOpenedOrSwitched) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      isNearBottomRef.current = true;
      return;
    }

    if (currentLength > prevLength && isNearBottomRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen, activeTab, consolePopupRoot]);

  useEffect(() => {
    if (gatewayStartedRequest === lastGatewayStartedRequestRef.current) return;
    lastGatewayStartedRequestRef.current = gatewayStartedRequest;
    if (isOpen || consolePopupRoot) return;
    setActiveTab('console');
    setIsOpen(true);
  }, [gatewayStartedRequest, isOpen, consolePopupRoot]);

  useEffect(() => {
    if (rateLimitUntil <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setRateLimitClock(now);
      if (rateLimitUntil <= now) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rateLimitUntil]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'hub' || !authToken) return undefined;
    if (!networkOnline) {
      setAppEmojis(Array.isArray(cachedAppEmojis) ? cachedAppEmojis : []);
      setLoadingEmojis(false);
      return undefined;
    }
    const scope = `${emojiCacheScope}:${botProfile?.application?.id || ''}:${authToken}`;
    if (emojiFetchCacheRef.current.scope !== scope) emojiFetchCacheRef.current = { scope, fetchedAt: 0 };
    if (Date.now() - emojiFetchCacheRef.current.fetchedAt < 180000) {
      setLoadingEmojis(false);
      return undefined;
    }
    if (rateLimitUntil > Date.now()) {
      setLoadingEmojis(false);
      return undefined;
    }
    let current = true;
    setLoadingEmojis(true);
    setEmojiError('');
    fetch(apiUrl('/api/bot/emojis'), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load app emojis.');
        if (current) {
          const emojis = data.emojis || [];
          emojiFetchCacheRef.current = { scope, fetchedAt: Date.now() };
          setAppEmojis(emojis);
          onEmojisChange?.(emojis);
          setEmojiLimit(data.limit || 2000);
        }
      })
      .catch((error) => { if (current) setEmojiError(error.message); })
      .finally(() => { if (current) setLoadingEmojis(false); });
    return () => { current = false; };
  }, [isOpen, activeTab, authToken, rateLimitUntil, rateLimitClock, onEmojisChange, emojiCacheScope, botProfile?.application?.id, networkOnline, cachedAppEmojis]);

  useEffect(() => {
    if (!commandListOpen || !selectedReviewCommand || !authToken) { setSelectedCommandStats(null); return undefined; }
    let current = true;
    setLoadingCommandStats(true);
    const query = new URLSearchParams({ command: selectedReviewCommand.name });
    fetch(apiUrl(`/api/bot/statistics?${query}`), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load command statistics.');
        if (current) setSelectedCommandStats(data.statistics);
      })
      .catch(() => { if (current) setSelectedCommandStats(null); })
      .finally(() => { if (current) setLoadingCommandStats(false); });
    return () => { current = false; };
  }, [commandListOpen, selectedReviewCommand, authToken]);

  const showCommandList = (command = null) => {
    setCommandDirectoryItems(null);
    setCommandSearch('');
    setSelectedCommandStats(null);
    setSelectedReviewCommand(command);
    setCommandListOpen(true);
  };
  useEffect(() => {
    if (!commandBrowserRequest || commandBrowserRequestRef.current === commandBrowserRequest) return;
    commandBrowserRequestRef.current = commandBrowserRequest;
    setCommandDirectoryItems(workspaceCommandItems);
    setCommandSearch('');
    setSelectedCommandStats(null);
    setSelectedReviewCommand(null);
    setCommandListOpen(true);
  }, [commandBrowserRequest, workspaceCommandItems]);
  const modalRoot = typeof document !== 'undefined' ? document.querySelector('.app-root') || document.body : null;

  const filteredLogs = useMemo(() => logs.filter((log) => {
    const levelMatches = filterLevel === 'ALL' || log.level === filterLevel;
    const debugMatches = showDebugLogs || String(log.level).toUpperCase() !== 'DEBUG';
    const queryMatches = !searchQuery || `${log.message} ${log.level}`.toLowerCase().includes(searchQuery.toLowerCase());
    return levelMatches && debugMatches && queryMatches;
  }), [logs, filterLevel, searchQuery, showDebugLogs]);
  const logGroups = useMemo(() => {
    const signature = (log) => {
      const target = resolveLogNodeTarget(log, activeTabId);
      const graphId = log?.meta?.graphId || target?.graphId || '';
      const nodeId = log?.meta?.nodeId || target?.nodeId || '';
      return `${String(log.level || 'INFO').toUpperCase()}\0${String(log.message ?? '')}\0${graphId}\0${nodeId}`;
    };
    const groups = [];
    for (const log of filteredLogs) {
      const level = String(log.level || 'INFO').toUpperCase();
      const key = ['WARN', 'ERROR'].includes(level) ? signature(log) : `${signature(log)}\0${log.id}`;
      const timestamp = new Date(log.timestamp).getTime();
      const last = groups.at(-1);
      const withinRepeatWindow = Number.isFinite(timestamp) && Number.isFinite(last?.lastTimestamp)
        && timestamp >= last.lastTimestamp && timestamp - last.lastTimestamp <= 70_000;
      if (last?.signature === key && withinRepeatWindow) {
        last.logs.push(log);
        last.lastTimestamp = timestamp;
      } else groups.push({ key: `${key}\0${log.id}`, signature: key, lastTimestamp: timestamp, logs: [log] });
    }
    return groups;
  }, [activeTabId, filteredLogs]);

  const openTab = (tab) => {
    setActiveTab(tab);
    if (!isOpen) {
      const scale = getArcUiScale();
      const viewportHeight = (window.visualViewport?.height || window.innerHeight) / scale;
      const maximum = Math.max(180, Math.min(viewportHeight - 100, 620));
      const restoreHeight = clamp(Math.max(320, dockHeightRef.current, lastExpandedDockHeightRef.current), 180, maximum);
      dockHeightRef.current = restoreHeight;
      lastExpandedDockHeightRef.current = restoreHeight;
      setDockHeight(restoreHeight);
      writeAppStorage('arc_dock_height', String(restoreHeight));
    }
    setIsOpen(true);
  };

  useEffect(() => {
    if (consoleOpenRequest === lastConsoleShortcutRequestRef.current) return;
    lastConsoleShortcutRequestRef.current = consoleOpenRequest;
    if (consolePopupRoot) { closeConsolePopup(); return; }
    if (isOpen && activeTab === 'console') setIsOpen(false);
    else openTab('console');
  }, [consoleOpenRequest, isOpen, activeTab, consolePopupRoot]);

  const fetchLogFiles = async () => {
    if (!authToken) return;
    try {
      const response = await fetch(apiUrl('/api/logs/files'), { headers: { 'x-arc-token': authToken } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load saved logs.');
      setLogFiles(data.files || []);
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Log archive', message: error.message, type: 'error' });
    }
  };

  const readLogFile = async (filename) => {
    if (!filename || !authToken) return;
    setSelectedFile(filename);
    try {
      const response = await fetch(apiUrl(`/api/logs/files/${encodeURIComponent(filename)}`), { headers: { 'x-arc-token': authToken } });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'Could not read this log file.');
      setFileContent(text);
    } catch (error) {
      setFileContent(error.message);
    }
  };

  const createCurrentSimulationPayload = () => {
    const graph = graphLookup.get(activeTabId) || { nodes: [], connections: [] };
    const cronNodeId = graph.nodes?.find((node) => node.type === 'event_cron')?.id;
    return createSimulationPayload(selectedEvent, {
      mockContent, mockCommand, mockAuthor, mockChannelId, mockCustomId, mockModalFieldId, mockModalValues, mockPermissions,
      modal: selectedSimulationModal?.modal, cronNodeId, webRequestNode: selectedWebRequestNode, graph,
      httpMethod: mockHttpMethod, httpPath: mockHttpPath, httpQuery: mockHttpQuery, httpHeaders: mockHttpHeaders,
      httpBodyType: mockHttpBodyType, httpBody: mockHttpBody
    });
  };

  const runSimulation = async () => {
    if (!authToken || !activeTabId) return;
    let payload;
    try { payload = createCurrentSimulationPayload(); }
    catch (error) { arcEvents.emit('toast:notify', { title: 'Invalid HTTP request', message: error.message, type: 'error' }); return; }
    setSimulating(true);
    setSimResult(null);
    if (selectedEvent === 'MODAL_SUBMIT') setModalSubmissionSnapshot(createModalSubmissionRows(selectedSimulationModal?.modal, mockModalValues, mockModalFieldId));
    try {
      const response = await fetch(apiUrl('/api/mock/inject'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ tabId: activeTabId, eventName: selectedEvent, payload, graph: graphLookup.get(activeTabId), graphs })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Simulation failed.');
      setSimResult(data.result);
      arcEvents.emit('toast:notify', { title: 'Simulation complete', message: `${data.result.elapsedMs} ms · ${data.result.interceptedOutputs.length} outputs`, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Simulation failed', message: error.message, type: 'error' });
    } finally {
      setSimulating(false);
    }
  };

  const beginDebugRun = async () => {
    if (!authToken || !activeTabId || debugRunIdRef.current) return;
    let payload;
    try { payload = createCurrentSimulationPayload(); }
    catch (error) { arcEvents.emit('toast:notify', { title: 'Invalid HTTP request', message: error.message, type: 'error' }); return; }
    const runId = `debug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    debugRunIdRef.current = runId;
    setDebugRunId(runId);
    setDebugStep(null);
    setSimResult(null);
    setSimulating(true);
    if (selectedEvent === 'MODAL_SUBMIT') setModalSubmissionSnapshot(createModalSubmissionRows(selectedSimulationModal?.modal, mockModalValues, mockModalFieldId));
    try {
      const response = await fetch(apiUrl('/api/mock/debug/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ runId, tabId: activeTabId, eventName: selectedEvent, payload, graph: graphLookup.get(activeTabId), graphs })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not start debug run.');
    } catch (error) {
      debugRunIdRef.current = '';
      setDebugRunId('');
      setDebugStep(null);
      arcEvents.emit('toast:notify', { title: 'Debug run failed', message: error.message, type: 'error' });
    } finally { setSimulating(false); }
  };

  const advanceDebug = async (action) => {
    if (!debugRunId || debugAdvancing) return;
    setDebugAdvancing(true);
    try {
      const response = await fetch(apiUrl(`/api/mock/debug/${encodeURIComponent(debugRunId)}/advance`), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not advance the debug run.');
      if (action === 'continue') setDebugStep(null);
    } catch (error) {
      setDebugAdvancing(false);
      arcEvents.emit('toast:notify', { title: 'Debug run stopped', message: error.message, type: 'warning' });
    }
  };

  useEffect(() => {
    const off = arcEvents.on('simulation:debug-action-request', (action) => advanceDebug(action));
    return off;
  }, [debugRunId, debugAdvancing, authToken]);

  const openConsoleContextMenu = (event, log, groupKey = '') => {
    event.preventDefault();
    event.stopPropagation();
    setConsoleContextLog(log);
    setConsoleContextMenu({ x: event.clientX, y: event.clientY, groupKey });
  };

  const copyConsoleText = async (text) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(String(text ?? ''));
      else {
        const temporary = document.createElement('textarea');
        temporary.value = String(text ?? '');
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.append(temporary);
        temporary.select();
        const copied = document.execCommand('copy');
        temporary.remove();
        if (!copied) throw new Error('Clipboard access is unavailable.');
      }
    } catch {
      arcEvents.emit('toast:notify', { title: 'Could not copy', message: 'Clipboard access is unavailable.', type: 'error' });
    }
    setConsoleContextMenu(null);
  };

  const copyEmojiId = async (emoji) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(String(emoji.id));
      else {
        const temporary = document.createElement('textarea');
        temporary.value = String(emoji.id);
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.append(temporary);
        temporary.select();
        const copied = document.execCommand('copy');
        temporary.remove();
        if (!copied) throw new Error('Clipboard access is unavailable.');
      }
      setCopiedEmojiId(emoji.id);
      window.setTimeout(() => setCopiedEmojiId((current) => current === emoji.id ? '' : current), 1300);
    } catch {
      arcEvents.emit('toast:notify', { title: 'Could not copy emoji ID', message: 'Clipboard access is unavailable.', type: 'error' });
    }
  };

  useEffect(() => {
    if (!consoleContextMenu) return undefined;
    const dismiss = () => setConsoleContextMenu(null);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    const removePageBlurListener = onPageBlur(dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
      removePageBlurListener();
    };
  }, [consoleContextMenu]);

  useLayoutEffect(() => {
    if (!consoleContextMenu) return;
    const menu = consoleContextMenuRef.current;
    if (!menu) return;
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const rightEdge = leftEdge + (viewport?.width || window.innerWidth);
    const bottomEdge = topEdge + (viewport?.height || window.innerHeight);
    const bounds = menu.getBoundingClientRect();
    const menuWidth = bounds.width;
    const menuHeight = bounds.height;
    const x = Math.max(leftEdge + 8, Math.min(consoleContextMenu.x, rightEdge - menuWidth - 8));
    const belowY = consoleContextMenu.y;
    const aboveY = belowY - menuHeight;
    const y = Math.max(topEdge + 8, Math.min(belowY + menuHeight <= bottomEdge - 8 ? belowY : aboveY, bottomEdge - menuHeight - 8));
    if (Math.abs(x - consoleContextMenu.x) > 0.5 || Math.abs(y - consoleContextMenu.y) > 0.5) {
      setConsoleContextMenu((current) => current ? { ...current, x, y } : current);
    }
  }, [consoleContextMenu, modalRoot]);

  const saveFixture = (event) => {
    event.preventDefault();
    const fixture = {
      id: `fixture_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: fixtureName.trim() || (selectedEvent === 'MESSAGE_CREATE' ? mockContent : selectedEvent === 'SLASH_COMMAND' ? `/${mockCommand}` : selectedEvent.replaceAll('_', ' ').toLowerCase()),
      eventName: selectedEvent, mockContent, mockCommand, mockAuthor, mockChannelId, mockCustomId, mockPermissions,
      webRequestNodeId: selectedWebRequestNodeId, httpMethod: mockHttpMethod, httpPath: mockHttpPath,
      httpQuery: mockHttpQuery, httpHeaders: mockHttpHeaders, httpBodyType: mockHttpBodyType, httpBody: mockHttpBody,
      createdAt: new Date().toISOString()
    };
    const next = [fixture, ...fixtures].slice(0, 30);
    setFixtures(next);
    writeAppStorage('arc_simulation_fixtures', JSON.stringify(next));
    setSelectedFixtureId(fixture.id);
    setFixtureName('');
    setShowFixtureName(false);
  };

  const loadFixture = (id) => {
    const fixture = fixtures.find((item) => item.id === id);
    if (!fixture) return;
    setSelectedFixtureId(id);
    setSelectedEvent(fixture.eventName);
    setMockContent(fixture.mockContent || '');
    setMockCommand(fixture.mockCommand || 'help');
    setMockCustomId(fixture.mockCustomId ?? defaultMockCustomId(fixture.eventName));
    setMockPermissions(Array.isArray(fixture.mockPermissions) ? fixture.mockPermissions : (typeof fixture.mockPermissions === 'string' ? bitfieldToPermissions(fixture.mockPermissions) : DEFAULT_MOCK_PERMISSIONS));
    setMockAuthor(fixture.mockAuthor || 'Studio Tester');
    setMockChannelId(fixture.mockChannelId || '120000000000000002');
    setSelectedWebRequestNodeId(fixture.webRequestNodeId || '');
    setMockHttpMethod(fixture.httpMethod || 'GET');
    setMockHttpPath(fixture.httpPath || '/');
    setMockHttpQuery(fixture.httpQuery || '{}');
    setMockHttpHeaders(fixture.httpHeaders || '{}');
    setMockHttpBodyType(fixture.httpBodyType || 'application/json');
    setMockHttpBody(fixture.httpBody || '{}');
  };

  const reviewCommands = async () => {
    if (!networkOnline || !authToken || reviewingCommands || commandDeploySeconds > 0 || rateLimitUntil > Date.now()) return;
    const requestProjectId = activeProjectId;
    const requestId = ++commandPreviewRequestRef.current;
    setReviewingCommands(true);
    setDeployError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(apiUrl('/api/bot/commands/preview'), { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ graphs }) });
      const data = await response.json();
      if (!response.ok) throw new Error([data.error || 'Could not review command changes.', data.discordAuthWarning?.message].filter(Boolean).join(' '));
      if (requestId !== commandPreviewRequestRef.current || lastProjectIdRef.current !== requestProjectId) return;
      const supportsScopedDeployment = Array.isArray(data.availableCommands)
        && Array.isArray(data.guildIds)
        && typeof data.scope === 'string'
        && Object.hasOwn(data, 'commandKeys');
      setExpandedReviewIssues(new Set());
      setCommandReview({ ...data, supportsScopedDeployment, guildOptions: [], gatewayConnected: false, guildDirectoryError: '', graphs });
      setGuildIdDraft('');
    } catch (error) {
      if (requestId !== commandPreviewRequestRef.current || lastProjectIdRef.current !== requestProjectId) return;
      const message = commandRequestError(error, 'Could not review command changes.');
      setDeployError(message);
      arcEvents.emit('toast:notify', { title: 'Command review failed', message, type: 'error' });
    } finally {
      window.clearTimeout(timeout);
      if (requestId === commandPreviewRequestRef.current) setReviewingCommands(false);
    }
  };

  const updateCommandReviewOptions = async ({ scope = 'global', guildIds = [], commandKeys = null, addedGuild = null } = {}) => {
    if (!commandReview) return null;
    const previousReview = commandReview;
    const requestId = ++commandPreviewRequestRef.current;
    const uniqueGuildIds = [...new Set((guildIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (scope === 'guilds' && !uniqueGuildIds.length) {
      const next = { ...commandReview, scope: 'guilds', guildIds: [], commandKeys, commands: [], changes: { created: [], updated: [], unchanged: [], removed: [] }, noChanges: true, canDeploy: false, planHash: '' };
      setCommandReview(next);
      setDeployError('');
      setUpdatingCommandReview(false);
      return next;
    }
    setUpdatingCommandReview(true);
    setDeployError('');
    setCommandReview((current) => current ? {
      ...current,
      scope,
      guildIds: scope === 'guilds' ? uniqueGuildIds : [],
        guildSelectionError: '',
      commandKeys,
      canDeploy: false,
      guildOptions: addedGuild?.id && !(current.guildOptions || []).some((guild) => guild.id === addedGuild.id)
        ? [...(current.guildOptions || []), addedGuild]
        : current.guildOptions
    } : current);
    try {
      const response = await fetch(apiUrl('/api/bot/commands/preview'), {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ graphs, guildIds: scope === 'guilds' ? uniqueGuildIds : [], commandKeys })
      });
      const data = await response.json();
      if (!response.ok) throw new Error([data.error || 'Could not refresh the deployment review.', data.discordAuthWarning?.message].filter(Boolean).join(' '));
      const guildOptions = [...(commandReview.guildOptions || [])];
      if (addedGuild?.id && !guildOptions.some((guild) => guild.id === addedGuild.id)) guildOptions.push(addedGuild);
      const next = {
        ...data,
        guildOptions,
        gatewayConnected: commandReview.gatewayConnected,
        guildDirectoryError: commandReview.guildDirectoryError,
        guildSelectionError: '',
        canDeploy: Boolean(data.valid && !data.noChanges && networkOnline && !commandDeploySeconds && !isDiscordRateLimited && !graphValidationReports.some(({ report }) => report.errors.length)),
        graphs
      };
      const promptStillOpen = commandReviewOpenRef.current;
      if (requestId === commandPreviewRequestRef.current && promptStillOpen) setCommandReview(next);
      return next;
    } catch (error) {
      const message = commandRequestError(error, 'Could not refresh the deployment review.');
      const promptStillOpen = commandReviewOpenRef.current;
      if (requestId === commandPreviewRequestRef.current && promptStillOpen) {
        if (scope === 'guilds' && !addedGuild?.id) {
          setCommandReview({ ...previousReview, scope: 'guilds', guildIds: uniqueGuildIds, canDeploy: false, planHash: '', guildSelectionError: message });
          return { requestError: message };
        }
        setCommandReview(previousReview);
        if (addedGuild?.id) {
          const requestError = /50035|invalid form body/i.test(message)
            ? `Discord rejected server ID ${addedGuild.id}. Check that the ID is correct and the application is authorized in that server.`
            : message;
          return { requestError };
        }
        setDeployError(message);
      }
      return { requestError: message };
    } finally {
      if (requestId === commandPreviewRequestRef.current) setUpdatingCommandReview(false);
    }
  };

  const deployCommands = async () => {
    if (!networkOnline || !authToken || deployingCommands || updatingCommandReview || commandDeploySeconds > 0 || rateLimitUntil > Date.now() || !commandReview?.valid || commandReview.noChanges || commandReview.scope === 'guilds' && !commandReview.guildIds?.length || graphValidationReports.some(({ report }) => report.errors.length)) return { ok: false, error: 'The deployment is no longer ready. Review the current workspace again.' };
    setDeployingCommands(true);
    setDeployError('');
    try {
      await onEnsureGraphsSaved?.();
      const response = await fetch(apiUrl('/api/bot/commands/deploy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ graphs, planHash: commandReview.planHash, guildIds: commandReview.guildIds || [], commandKeys: commandReview.commandKeys ?? null })
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429) setCommandDeployUntil(Date.now() + Math.max(1000, Number(data.retryAfterMs) || 30_000));
        throw new Error([data.error || 'Could not deploy slash commands.', data.discordAuthWarning?.message].filter(Boolean).join(' '));
      }
      setCommandDeployUntil(Date.now() + 30_000);
      setCommandReview(null);
      arcEvents.emit('toast:notify', {
        title: 'Commands deployed',
        message: `${data.deployed} application command${data.deployed === 1 ? '' : 's'} ${commandReview.scope === 'guilds' ? `across ${data.targetCount} server${data.targetCount === 1 ? '' : 's'}` : 'deployed globally'}${data.created ? ` · ${data.created} new` : ''}`,
        type: 'success'
      });
      return { ok: true };
    } catch (error) {
      const message = commandRequestError(error, 'Could not deploy slash commands.');
      setDeployError(message);
      if (!desktopMode && !commandReviewOpenRef.current) arcEvents.emit('toast:notify', { title: 'Command deployment failed', message, type: 'error' });
      return { ok: false, error: message };
    } finally {
      setDeployingCommands(false);
    }
  };
  desktopCommandActionRef.current = { deployCommands, updateCommandReviewOptions, graphLookup, onOpenGraph, onTraceIssue };

  useEffect(() => {
    if (!desktopMode) return undefined;
    let unlisten;
    listenTauriEvent('arc:desktop-window-action', async (event) => {
      const { actionId, action, value = {}, promptLabel } = event.payload || {};
      if (!['commands-deploy', 'commands-review-options', 'command-open-graph', 'command-open-node'].includes(action)
        || typeof actionId !== 'string' || typeof promptLabel !== 'string' || !promptLabel.startsWith('arc-prompt-')) return;
      if (!isDesktopPromptActive(promptLabel)) return;
      let result = null;
      let error = '';
      try {
        const actions = desktopCommandActionRef.current;
        if (action === 'commands-deploy') result = await actions.deployCommands();
        else if (action === 'commands-review-options') result = await actions.updateCommandReviewOptions(value);
        else if (action === 'command-open-node') result = actions.onTraceIssue?.(value.graphId, value.nodeId);
        else {
          const graph = actions.graphLookup.get(value.graphId);
          if (!graph) throw new Error('That graph is no longer available.');
          result = actions.onOpenGraph?.(graph);
        }
      } catch (reason) { error = reason?.message || 'ARC Studio could not complete this command action.'; }
      try { await emitTo(promptLabel, 'arc:desktop-window-action-result', { actionId, result, error }); }
      catch (reason) { console.warn('[ARC] Could not return a command window action result.', reason); }
    }).then((stop) => { unlisten = stop; }).catch((error) => console.warn('[ARC] Could not receive command window actions.', error));
    return () => unlisten?.();
  }, [desktopMode]);

  const chooseEmojiFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setEmojiError('');
    try {
      if (!/^image\/(png|gif|jpeg|webp|avif)$/i.test(file.type)) throw new Error('Choose a PNG, GIF, JPEG, WebP, or AVIF image.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Image is too large to process (10 MiB maximum).');
      const bitmap = await createImageBitmap(file);
      const preserveSource = file.type === 'image/gif' || file.type === 'image/webp';
      let imageData;
      if (preserveSource) {
        if (bitmap.width !== 128 || bitmap.height !== 128) throw new Error('Animated GIF and WebP emoji must already be 128 × 128.');
        if (file.size > 256 * 1024) throw new Error('Emoji images must be smaller than 256 KiB.');
        const reader = new FileReader();
        imageData = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('This image could not be read.'));
          reader.readAsDataURL(file);
        });
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const scale = Math.min(128 / bitmap.width, 128 / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, (128 - width) / 2, (128 - height) / 2, width, height);
        imageData = canvas.toDataURL('image/png');
        if (imageData.length > 4 / 3 * 256 * 1024 + 128) throw new Error('Resized emoji image is larger than 256 KiB.');
      }
      bitmap.close();
      setEmojiFileName(file.name);
      setEmojiImageBase64(imageData);
    } catch (error) {
      setEmojiImageBase64('');
      setEmojiFileName('');
      setEmojiError(error.message);
    }
  };

  const uploadEmoji = async () => {
    const normalizedName = emojiName.trim();
    if (!/^[A-Za-z0-9_]{2,32}$/.test(normalizedName)) { setEmojiError('Use 2–32 letters, numbers, or underscores for the emoji name.'); return; }
    if (!networkOnline || !emojiImageBase64 || !authToken || appEmojis.length >= emojiLimit || rateLimitUntil > Date.now()) return;
    setUploadingEmoji(true);
    setEmojiUploadProgress(0);
    setEmojiError('');
    try {
      const response = await xhrJson(apiUrl('/api/bot/emojis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ name: normalizedName, image: emojiImageBase64 }),
        onUploadProgress: setEmojiUploadProgress
      });
      const data = response.data;
      if (!response.ok || !data.success) throw new Error(data.error || 'Emoji upload failed.');
      const nextEmojis = [...appEmojis, data.emoji];
      setAppEmojis(nextEmojis);
      onEmojisChange?.(nextEmojis);
      emojiFetchCacheRef.current.fetchedAt = Date.now();
      arcEvents.emit('toast:notify', { title: 'App emoji uploaded', message: `:${data.emoji.name}: · ${data.emoji.id}`, type: 'success' });
      setEmojiName(''); setEmojiImageBase64(''); setEmojiFileName('');
    } catch (error) {
      setEmojiError(error.message);
      arcEvents.emit('toast:notify', { title: 'Upload failed', message: error.message, type: 'error' });
    } finally {
      setUploadingEmoji(false);
      setEmojiUploadProgress(0);
    }
  };

  const deleteAppEmoji = async (emoji) => {
    if (!networkOnline || !authToken || !emoji?.id || deletingEmojiId || rateLimitUntil > Date.now()) return;
    setDeletingEmojiId(emoji.id);
    try {
      const response = await fetch(apiUrl(`/api/bot/emojis/${encodeURIComponent(emoji.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not delete this app emoji.');
      const nextEmojis = appEmojis.filter((item) => item.id !== emoji.id);
      setAppEmojis(nextEmojis);
      onEmojisChange?.(nextEmojis);
      emojiFetchCacheRef.current.fetchedAt = Date.now();
      arcEvents.emit('toast:notify', { title: 'App emoji deleted', message: `:${emoji.name}:`, type: 'success' });
    } catch (error) {
      setEmojiError(error.message);
      arcEvents.emit('toast:notify', { title: 'Delete failed', message: error.message, type: 'error' });
    } finally { setDeletingEmojiId(''); }
  };

  const beginResize = (event) => {
    if (isLocked) return;
    event.preventDefault();
    resizeRef.current = { y: event.clientY, height: dockHeightRef.current };
    setIsResizing(true);
  };

  const toggleDockSize = () => {
    if (isLocked) return;
    const next = dockHeightRef.current > 360 ? 284 : 460;
    dockHeightRef.current = next;
    lastExpandedDockHeightRef.current = next;
    setDockHeight(next);
    writeAppStorage('arc_dock_height', String(next));
  };

  const handleDockHeaderClick = (event) => {
    if (event.detail !== 3 || !(event.target instanceof Element) || event.target.closest('.dock-tabs, button, a, input, select, textarea')) return;
    setIsOpen(false);
  };

  const consolePanel = <div className="console-panel">
    <div className="console-toolbar">
      <div className="console-filters">{['ALL', 'INFO', 'GATEWAY', 'EXECUTION', 'MOCK', 'WARN', 'ERROR'].map((level) => <button key={level} className={filterLevel === level ? 'is-active' : ''} onClick={() => setFilterLevel(level)}>{level}</button>)}</div>
      <div className="console-actions">
        <label className="console-debug-toggle"><input type="checkbox" checked={showDebugLogs} onChange={(event) => { const enabled = event.target.checked; setShowDebugLogs(enabled); writeAppStorage('arc_console_show_debug_logs', String(enabled)); }} />Debug logs</label>
        <label className="console-search"><Search size={14} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Filter output" aria-label="Filter console" /></label>
        <button className="dock-icon-button" onClick={fetchLogFiles} title="Browse saved logs" aria-label="Browse saved logs"><Archive size={15} /></button>
        <button className="dock-icon-button" onClick={consolePopupRoot ? closeConsolePopup : openConsolePopup} title={consolePopupRoot ? 'Return console to the editor' : 'Pop out console'} aria-label={consolePopupRoot ? 'Return console to the editor' : 'Pop out console'}><PictureInPicture2 size={15} /></button>
        <button className="dock-icon-button danger-hover" onClick={onClearLogs} title="Clear output" aria-label="Clear output"><Trash2 size={15} /></button>
      </div>
    </div>
    {logFiles.length > 0 && fileContent === null && <div className="archive-strip"><span>Saved logs</span>{logFiles.map((file) => <button key={file.filename} onClick={() => readLogFile(file.filename)}>{file.filename}<small>{file.sizeKb} KB</small></button>)}<button className="archive-close" onClick={() => setLogFiles([])} aria-label="Close saved logs"><X size={14} /></button></div>}
    {fileContent !== null ? (
      <div className="archive-view">
        <div className="archive-view-header">
          <span><FileText size={14} /> {selectedFile}</span>
          <button onClick={() => setFileContent(null)}>Close <X size={13} /></button>
        </div>
        {fileContent && fileContent.trim() ? (
          <pre>{fileContent}</pre>
        ) : (
          <div className="dock-empty">
            <FileText size={17} />
            <span>No logs recorded in this file</span>
          </div>
        )}
      </div>
    ) : <div className="log-lines" ref={logContainerRef} onScroll={handleConsoleScroll}>
      {logGroups.length === 0 ? <div className="dock-empty"><Activity size={17} /><span>No output</span></div> : logGroups.map((group) => {
        const expanded = expandedLogGroups.has(group.key);
        const renderLog = (log, repeatToggle = null, repeatNumber = null) => {
            const target = resolveLogNodeTarget(log, activeTabId);
            const isTraceable = Boolean(target?.graphId && target?.nodeId);
            return <div className={`log-line${isTraceable ? ' is-traceable' : ''}`} key={log.id} onClick={() => isTraceable && onTraceLog?.(target.graphId, target.nodeId)} onDoubleClick={() => isTraceable && onTraceLog?.(target.graphId, target.nodeId)} onContextMenu={(event) => openConsoleContextMenu(event, log, group.key)}>
              <time className={repeatNumber !== null ? 'has-repeat-index' : ''} data-repeat-index={repeatNumber !== null ? repeatNumber : undefined}>{formatTime(log.timestamp)}</time><span className={`log-level log-${String(log.level || 'INFO').toLowerCase()}`}><span className="log-level-text">{log.level}</span>{repeatToggle}</span><span className="log-message">{log.message}</span>
            </div>;
        };
        const toggle = () => setExpandedLogGroups((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; });
        const severity = String(group.logs[0]?.level || '').toLowerCase();
        const repeatToggle = group.logs.length > 1 && <button type="button" className={`log-repeat-toggle log-${severity}`} aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.logs.length} repeated ${severity} entries`} title={`${expanded ? 'Collapse' : 'Expand'} ${group.logs.length} repeated entries`} onClick={(event) => { event.stopPropagation(); toggle(); }}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}<b>{group.logs.length}</b>
        </button>;
        return <div key={group.key} className={`log-repeat-group${group.logs.length > 1 ? ` log-repeat-${severity}` : ''}${expanded ? ' is-expanded' : ''}`}>
          {renderLog(group.logs[0], repeatToggle, expanded && group.logs.length > 1 ? 1 : null)}
          {expanded && group.logs.length > 1 && <div className="log-repeat-children">{group.logs.slice(1).map((log, index) => renderLog(log, null, index + 2))}</div>}
        </div>;
      })}
    </div>}
  </div>;

  return (
    <>
    <section ref={dockRef} className={`control-dock ${isOpen ? 'is-open' : ''} ${isResizing ? 'is-resizing' : ''}`} style={{ '--dock-height': `${dockHeightRef.current}px`, height: isOpen ? `${dockHeightRef.current}px` : '45px' }} aria-label="Control dock">
      {isOpen && <div className={`dock-resize-handle ${isLocked ? 'is-disabled' : ''}`} onPointerDown={beginResize} onDoubleClick={toggleDockSize} title={isLocked ? 'Canvas is locked' : 'Drag to resize · double-click to toggle size'}><span /></div>}
      <header className="dock-header" onClick={handleDockHeaderClick}>
        <nav className="dock-tabs" aria-label="Control panels">
          <DockTab tabId="console" active={isOpen && activeTab === 'console'} onClick={() => consolePopupRoot ? closeConsolePopup() : openTab('console')} icon={Terminal} label="Console" count={logs.length} />
          <DockTab tabId="simulator" active={isOpen && activeTab === 'simulator'} onClick={() => openTab('simulator')} icon={Cpu} label="Simulate" />
          <DockTab tabId="hub" active={isOpen && activeTab === 'hub'} onClick={() => openTab('hub')} icon={Smile} label="App" />
        </nav>
        <div className="dock-header-right">
          <button className="dock-toggle" onClick={() => setIsOpen((open) => !open)} title={isOpen ? 'Collapse panel' : 'Expand panel'} data-tooltip={isOpen ? 'Collapse panel' : 'Expand panel'} aria-label={isOpen ? 'Collapse panel' : 'Expand panel'}>{isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
        </div>
      </header>

      <div className="dock-content" style={{ height: 'calc(var(--dock-height) - 45px)' }}>
        {activeTab === 'console' && !consolePopupRoot && consolePanel}

        {activeTab === 'simulator' && <div className="simulator-panel">
          <div className="dock-panel-sidebar">
            <div className="panel-section-heading">Event</div>
          <AnimatedDropdown value={selectedEvent} onChange={(eventName) => {
            setSelectedEvent(eventName);
            setMockCustomId(eventName === 'MODAL_SUBMIT' ? String(selectedSimulationModal?.modal?.customId || defaultMockCustomId(eventName)) : defaultMockCustomId(eventName));
            if (eventName === 'WEB_SERVER_REQUEST' && simulationWebRequestNodes.length) {
              const route = simulationWebRequestNodes[0];
              setSelectedWebRequestNodeId(route.id);
              setMockHttpMethod(String(route.data?.method || 'GET').toUpperCase());
              setMockHttpPath(simulationSamplePath(route.data?.path || '/'));
            }
          }} options={[
              { value: 'MESSAGE_CREATE', label: 'Message created' }, { value: 'SLASH_COMMAND', label: 'Slash command' },
              { value: 'USER_COMMAND', label: 'User context command' }, { value: 'MESSAGE_COMMAND', label: 'Message context command' },
              { value: 'BUTTON_CLICK', label: 'Button clicked' }, { value: 'SELECT_MENU', label: 'Select menu used' },
              { value: 'MODAL_SUBMIT', label: 'Modal submitted' }, { value: 'GUILD_MEMBER_ADD', label: 'Member joined' },
              { value: 'CRON_TICK', label: 'Cron schedule tick' },
              { value: 'GUILD_MEMBER_REMOVE', label: 'Member left' }, { value: 'MESSAGE_UPDATE', label: 'Message edited' },
              { value: 'MESSAGE_DELETE', label: 'Message deleted' }, { value: 'MESSAGE_REACTION_ADD', label: 'Reaction added' },
              { value: 'MESSAGE_REACTION_REMOVE', label: 'Reaction removed' }, { value: 'CHANNEL_CREATE', label: 'Channel created' },
              { value: 'VOICE_STATE_UPDATE', label: 'Voice state changed' }
              ,...(simulationWebRequestNodes.length ? [{ value: 'WEB_SERVER_REQUEST', label: 'HTTP request' }] : [])
            ]} ariaLabel="Simulation event" className="simulator-event-dropdown" />
            {selectedEvent === 'WEB_SERVER_REQUEST' ? <div className="simulator-http-request-fields">
              {simulationWebRequestNodes.length ? <>
                <label className="dock-field-label">Route<AnimatedDropdown value={selectedWebRequestNodeId} onChange={(nodeId) => {
                  const route = simulationWebRequestNodes.find((node) => node.id === nodeId);
                  setSelectedWebRequestNodeId(nodeId);
                  if (route) {
                    setMockHttpMethod(String(route.data?.method || 'GET').toUpperCase());
                    setMockHttpPath(simulationSamplePath(route.data?.path || '/'));
                  }
                }} options={simulationWebRequestNodes.map((node) => ({ value: node.id, label: `${node.label || 'On Web Request'} · ${node.data?.method || 'GET'} ${node.data?.path || '/'}` }))} ariaLabel="HTTP route to test" className="simulator-event-dropdown" /></label>
                {selectedWebRequestNode && <div className="simulator-http-route-meta"><span>{String(selectedWebRequestNode.data?.method || 'GET').toUpperCase()}</span><code>{selectedWebRequestNode.data?.path || '/'}</code></div>}
                <label className="dock-field-label">Request path<input className="studio-field" value={mockHttpPath} onChange={(event) => setMockHttpPath(event.target.value)} placeholder="/items/sample" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
                <div className="simulator-sample-note">Path parameters are extracted from this route. Request bodies over 16 KB are rejected.</div>
                <SimulatorTextField label="Query parameters (JSON)" value={mockHttpQuery} onChange={setMockHttpQuery} onOpenTextStudio={onOpenTextStudio} maxLength={16 * 1024} rows={3} />
                <SimulatorTextField label="Request headers (JSON)" value={mockHttpHeaders} onChange={setMockHttpHeaders} onOpenTextStudio={onOpenTextStudio} maxLength={16 * 1024} rows={3} />
                <label className="dock-field-label">Body content type<AnimatedDropdown value={mockHttpBodyType} onChange={setMockHttpBodyType} options={[{ value: 'application/json', label: 'JSON' }, { value: 'text/plain', label: 'Text' }, { value: 'application/x-www-form-urlencoded', label: 'Form URL encoded' }]} ariaLabel="Request body content type" className="simulator-event-dropdown" /></label>
                <SimulatorTextField label="Request body" value={mockHttpBody} onChange={setMockHttpBody} onOpenTextStudio={onOpenTextStudio} maxLength={16 * 1024} rows={4} />
              </> : <div className="simulator-sample-note">Add an On Web Request node to the active graph to simulate HTTP calls.</div>}
            </div> : selectedEvent === 'MESSAGE_CREATE' ? <label className="dock-field-label">Message<input className="studio-field" value={mockContent} onChange={(event) => setMockContent(event.target.value)} placeholder="!ping" /></label> : ['SLASH_COMMAND', 'USER_COMMAND', 'MESSAGE_COMMAND'].includes(selectedEvent) ? <label className="dock-field-label">Command<input className="studio-field" value={mockCommand} onChange={(event) => setMockCommand(event.target.value)} placeholder={selectedEvent === 'SLASH_COMMAND' ? 'help' : 'Bookmark'} /></label> : null}
            {selectedEvent === 'CRON_TICK' ? <div className="simulator-sample-note">Runs the first On Schedule node in this graph once, without waiting for its cron expression.</div> : <div className="simulator-sample-note">{simulationEventHint(selectedEvent)}</div>}
            {['BUTTON_CLICK', 'SELECT_MENU'].includes(selectedEvent) && <label className="dock-field-label">Custom ID<input className="studio-field" value={mockCustomId} onChange={(event) => setMockCustomId(event.target.value)} placeholder="component_custom_id" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>}
            {selectedEvent === 'MODAL_SUBMIT' && <div className="simulation-modal-fields">
              {simulationModals.length > 0 && <label className="dock-field-label">Modal<AnimatedDropdown value={selectedModalNodeId} onChange={(nodeId) => {
                const selected = simulationModals.find(({ node }) => node.id === nodeId);
                setSelectedModalNodeId(nodeId);
                setMockCustomId(String(selected?.modal.customId || ''));
                setMockModalValues(Object.fromEntries((selected?.modal.components || []).map((field) => [field.customId, mockModalDefault(field)])));
              }} options={simulationModals.map(({ node, modal }) => ({ value: node.id, label: `${node.label || 'Popup Modal'} · ${modal.title || modal.customId || 'Untitled'}` }))} ariaLabel="Modal to submit" className="simulator-event-dropdown" /></label>}
              <label className="dock-field-label">Modal Custom ID<input className="studio-field" value={mockCustomId} onChange={(event) => setMockCustomId(event.target.value)} placeholder="modal_custom_id" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
              {selectedModalFields.length ? selectedModalFields.map((field) => <ModalSimulationField key={field.customId} field={field} value={mockModalValues[field.customId] ?? mockModalDefault(field)} onChange={(value) => setMockModalValues((previous) => ({ ...previous, [field.customId]: value }))} />) : <>
                <label className="dock-field-label">Field Custom ID<input className="studio-field" value={mockModalFieldId} onChange={(event) => setMockModalFieldId(event.target.value)} placeholder="field_custom_id" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                <label className="dock-field-label">Submitted value<input className="studio-field" value={mockModalValues[mockModalFieldId] ?? ''} onChange={(event) => setMockModalValues((previous) => ({ ...previous, [mockModalFieldId]: event.target.value }))} placeholder="Sample response" /></label>
              </>}
            </div>}
            {selectedEvent !== 'WEB_SERVER_REQUEST' && <>
              <label className="dock-field-label">Author<input className="studio-field" value={mockAuthor} onChange={(event) => setMockAuthor(event.target.value)} /></label>
              <label className="dock-field-label">Channel ID<input className="studio-field" value={mockChannelId} onChange={(event) => setMockChannelId(event.target.value)} /></label>
              <label className="dock-field-label">Permissions<AnimatedDropdown multiple={true} searchable={true} searchThreshold={6} value={mockPermissions} options={PERMISSION_DROPDOWN_OPTIONS} onChange={setMockPermissions} placeholder="Choose permissions…" ariaLabel="Permissions" className="simulator-event-dropdown" /></label>
            </>}
            <div className="simulator-run-actions"><button className="studio-button studio-button-primary simulate-button" onClick={runSimulation} disabled={simulating || Boolean(debugRunId) || !activeTabId}><Play size={14} fill="currentColor" />{simulating ? 'Running…' : 'Run'}</button><button className="studio-button debug-run-button" onClick={beginDebugRun} disabled={simulating || Boolean(debugRunId) || !activeTabId}><StepForward size={14} />Debug</button></div>
            <div className="simulator-fixtures">
              <AnimatedDropdown value={selectedFixtureId} onChange={loadFixture} options={[{ value: '', label: 'Saved fixtures' }, ...fixtures.map((fixture) => ({ value: fixture.id, label: fixture.name }))]} ariaLabel="Saved simulation fixtures" className="simulator-event-dropdown" />
              <button type="button" className="dock-icon-button" onClick={() => { setFixtureName(''); setShowFixtureName((value) => !value); }} title="Save current event as a replay fixture" aria-label="Save simulation fixture"><Save size={13} /></button>
            </div>
            {showFixtureName && <form className="simulator-fixture-form" onSubmit={saveFixture}><CharacterLimit value={fixtureName} maxLength={60}><input className="studio-field" value={fixtureName} onChange={(event) => setFixtureName(event.target.value)} maxLength={60} placeholder={selectedEvent === 'MESSAGE_CREATE' ? mockContent || 'Fixture name' : `/${mockCommand}`} aria-label="Fixture name" /></CharacterLimit><button type="submit">Save</button></form>}
            {!!fixtures.length && selectedFixtureId && <button className="simulator-fixture-delete" onClick={() => { const next = fixtures.filter((fixture) => fixture.id !== selectedFixtureId); setFixtures(next); setSelectedFixtureId(''); writeAppStorage('arc_simulation_fixtures', JSON.stringify(next)); }}>Delete selected fixture</button>}
          </div>
          <div className="simulation-output">
            <div className="panel-section-heading">Execution trace</div>
            {debugRunId ? debugStep ? <>
              <div className="simulation-summary is-paused"><StepForward size={15} /><span>Paused · {debugStep.label}</span><small>{debugStep.status}</small></div>
              {debugStep.error && <div className="debug-step-error">{debugStep.error}</div>}
              <DebugPinGroup label="Inputs" values={debugStep.inputs || EMPTY_DEBUG_VALUES} />
              <DebugPinGroup label="Outputs" values={debugStep.outputs || EMPTY_DEBUG_VALUES} />
              <p className="debug-canvas-hint">Step and Continue are available on the canvas.</p>
            </> : <div className="dock-empty simulation-empty"><Cpu size={18} /><span>Starting debug run…</span></div> : !simResult ? <div className="dock-empty simulation-empty"><Cpu size={18} /><span>Results will appear here</span></div> : <>
              <div className="simulation-summary"><CircleCheck size={16} /><span>Completed</span><small>{simResult.elapsedMs} ms</small></div>
              {selectedEvent === 'MODAL_SUBMIT' && modalSubmissionSnapshot.length > 0 && <section className="modal-submission-preview" aria-label="Submitted modal fields"><strong>Submitted fields</strong>{modalSubmissionSnapshot.map((field) => <div className="modal-submission-row" key={field.customId}><div><span>{field.label}</span><code>{field.customId}</code></div><pre>{field.displayValue}</pre></div>)}</section>}
              <div className={`simulation-path-scroll ${tracePathExpanded ? 'is-expanded' : ''}`} aria-label="Executed nodes"><div className="simulation-path">{(tracePathExpanded ? tracePathEntries : tracePathEntries.slice(0, 16)).map((entry, index, visibleNodes) => {
                return <React.Fragment key={`${entry.id}-${index}`}><code title={`Node ID: ${entry.id}`} aria-label={`${entry.displayLabel}, node ${index + 1}, ID ${entry.id}`}>{entry.displayLabel}</code>{index < visibleNodes.length - 1 && <span>→</span>}</React.Fragment>;
              })}</div></div>
              {tracePathEntries.length > 16 && <button type="button" className="simulation-show-more" onClick={() => setTracePathExpanded((expanded) => !expanded)}>{tracePathExpanded ? <ChevronUp size={12} /> : <Plus size={12} />}{tracePathExpanded ? 'Show fewer nodes' : `Show ${tracePathEntries.length - 16} more nodes`}</button>}
              <div className={`simulation-actions-scroll ${traceOutputsExpanded ? 'is-expanded' : ''}`} aria-label="Simulation outputs"><div className="simulation-actions">{(traceOutputsExpanded ? simResult.interceptedOutputs || [] : (simResult.interceptedOutputs || []).slice(0, 3)).map((action, index) => {
                const outputId = `${action.type}-${index}`;
                const output = JSON.stringify(action.payload || action.responseData, null, 2) ?? 'No output data';
                const expanded = expandedTraceOutputIds.has(outputId);
                return <article className="simulation-action" key={outputId}><strong>{action.type}</strong><pre className={expanded ? 'is-expanded' : ''}>{output}</pre>{output.length > 1200 && <button type="button" className="simulation-show-more simulation-output-more" onClick={() => setExpandedTraceOutputIds((current) => { const next = new Set(current); if (next.has(outputId)) next.delete(outputId); else next.add(outputId); return next; })}>{expanded ? <ChevronUp size={12} /> : <Plus size={12} />}{expanded ? 'Show less output' : 'Show more output'}</button>}</article>;
              })}{!simResult.interceptedOutputs?.length && <div className="dock-empty"><CircleX size={16} /><span>No outgoing actions</span></div>}</div></div>
              {(simResult.interceptedOutputs || []).length > 3 && <button type="button" className="simulation-show-more" onClick={() => setTraceOutputsExpanded((expanded) => !expanded)}>{traceOutputsExpanded ? <ChevronUp size={12} /> : <Plus size={12} />}{traceOutputsExpanded ? 'Show fewer outputs' : `Show ${simResult.interceptedOutputs.length - 3} more outputs`}</button>}
            </>}
          </div>
        </div>}

        {activeTab === 'hub' && <div className="bot-panel">
          {!networkOnline && <div className="studio-offline-banner" role="status"><AlertTriangle size={15} /><span>You’re offline. Simulation and local editing are available; Discord connections and API actions are paused.</span></div>}
          {isDiscordRateLimited && <div className="discord-rate-limit-banner" role="status">
            <AlertTriangle size={17} />
            <div><strong>Discord API cooldown</strong><span>{botMetrics?.rateLimitScope === 'global' ? 'A global limit is active.' : 'A route limit is active.'} Live API actions are paused; use Simulation to keep testing your graphs.</span><small>Changing networks does not clear a Discord API rate limit.</small></div>
            <time>{rateLimitSeconds}s</time>
          </div>}
          {discordAuthWarning && <div className="discord-auth-warning" role="status">
            <AlertTriangle size={17} />
            <div><strong>{discordAuthWarning.title || 'Discord rejected the bot token'}</strong><span>{discordAuthWarning.message}</span></div>
          </div>}
          <section className="bot-overview">
            <div className="bot-card">
              <div className="bot-avatar">{botProfile?.avatar && botProfile?.id ? <img src={`https://cdn.discordapp.com/avatars/${encodeURIComponent(botProfile.id)}/${encodeURIComponent(botProfile.avatar)}.${botProfile.avatar.startsWith('a_') ? 'gif' : 'webp'}`} alt="" /> : <Smile size={22} />}</div>
              <div className="bot-card-copy"><strong>{botProfile?.application?.name || botProfile?.global_name || botProfile?.username || 'No app connected'}{botProfile?.verifiedBot === true && <Check className="verified-app-check" size={14} strokeWidth={3} aria-label="Discord-verified app" title="Discord-verified app" />}</strong><span className="bot-account-name">{botProfile?.username ? `@${botProfile.username}` : 'Discord application'}</span><span className={`bot-state ${String(botStatus).toLowerCase()}`}><i />{botStatus}</span></div>
              <div className="bot-card-actions">
                <button className={`studio-button ${botStatus === 'ONLINE' ? 'studio-button-danger' : 'studio-button-primary'}`} disabled={botStatus === 'CONNECTING' || (!networkOnline && botStatus !== 'ONLINE')} title={!networkOnline && botStatus !== 'ONLINE' ? 'Gateway connection is unavailable offline' : undefined} onClick={botStatus === 'ONLINE' ? onStopBot : onStartBot}>{botStatus === 'ONLINE' ? <><Square size={13} /> Disconnect</> : <><Play size={13} fill="currentColor" />{botStatus === 'CONNECTING' ? 'Connecting…' : 'Connect gateway'}</>}</button>
              <button className="studio-button deploy-commands-button" onClick={reviewCommands} disabled={!networkOnline || !botProfile?.id || reviewingCommands || deployingCommands || commandDeploySeconds > 0 || isDiscordRateLimited} title={!networkOnline ? 'Discord API actions are unavailable offline' : isDiscordRateLimited ? 'Discord API cooldown is active' : 'Review command changes, intents, and permissions before deployment'}>{reviewingCommands ? 'Reviewing…' : commandDeploySeconds ? `Deploy in ${commandDeploySeconds}s` : isDiscordRateLimited ? `API cooldown · ${rateLimitSeconds}s` : 'Review deploy'}</button>
              </div>
            </div>
            <p className="bot-hosting-note">Build and debug here, then export to host independently. Live gateway runs use Studio server resources.</p>
            <div className="bot-overview-stat-cards">
              <section className="bot-overview-stat-card" aria-label="Workspace graph checks">
                <div className="bot-overview-stat-heading"><ShieldCheck size={13} /><strong>Workspace checks</strong></div>
                <div className="bot-overview-stat-grid">
                  <div className={graphCheckCounts.errors ? 'has-errors' : ''}><strong>{formatApiCount(graphCheckCounts.errors)}</strong><span>Graph errors</span></div>
                  <div className={graphCheckCounts.warnings ? 'has-warnings' : ''}><strong>{formatApiCount(graphCheckCounts.warnings)}</strong><span>Warnings</span></div>
                </div>
              </section>
              <section className="bot-overview-stat-card" aria-label="Discord application reach">
                <div className="bot-overview-stat-heading"><Globe2 size={13} /><strong>Application reach</strong></div>
                <div className="bot-overview-stat-grid">
                  <div title="Approximate server installs reported by Discord"><strong>{formatApiCount(botProfile?.application?.approximate_guild_count)}</strong><span>Server installs</span></div>
                  <div title="Approximate user installs reported by Discord"><strong>{formatApiCount(botProfile?.application?.approximate_user_install_count)}</strong><span>User installs</span></div>
                  <div title="Approximate users with an OAuth2 authorization reported by Discord"><strong>{formatApiCount(botProfile?.application?.approximate_user_authorization_count)}</strong><span>Authorized users</span></div>
                </div>
                <small>Install totals are approximate and may be unavailable.</small>
              </section>
            </div>
          </section>
          {deployError && !commandReview && !desktopMode && <p className="command-review-error" role="alert"><AlertTriangle size={14} /><span><strong>Command request failed</strong>{deployError}</span></p>}
          <div className="bot-gateway-column">
            <div className="bot-intent-list">
              <div className="panel-section-heading">Gateway intents</div>
              {(botProfile?.intentSummary || []).filter((intent) => intent.required).map((intent) => <div className={`bot-intent-row ${intent.portalEnabled === false ? 'is-missing' : ''}`} key={intent.key} title={intent.privileged ? 'Privileged intent setting from the Discord Developer Portal' : 'Standard gateway intent'}><span>{intent.portalEnabled === false ? <CircleX size={12} /> : intent.portalEnabled === true ? <CircleCheck size={12} /> : <AlertTriangle size={12} />}{intent.label}</span><small>{intent.portalEnabled === false ? 'Disabled in Developer Portal' : intent.portalEnabled === true ? 'Enabled in Developer Portal' : intent.privileged ? 'Status unavailable' : 'Requested'}</small></div>)}
              {!(botProfile?.intentSummary || []).some((intent) => intent.required) && <span className="bot-intent-empty">Connect an app to inspect required intents.</span>}
            </div>
            {botStatus === 'ONLINE' && <section className="gateway-metrics" aria-label="Gateway network metrics">
              <div className="gateway-metrics-heading"><Activity size={13} /><strong>Network</strong></div>
              <div className="gateway-metrics-values">
                <div><span>Heartbeat RTT</span><strong>{Number.isFinite(botMetrics?.latencyMs) ? `${Math.round(botMetrics.latencyMs)} ms` : '—'}</strong></div>
                <div><span>Average</span><strong>{Number.isFinite(botMetrics?.averageLatencyMs) ? `${Math.round(botMetrics.averageLatencyMs)} ms` : '—'}</strong></div>
                <div><span>Jitter</span><strong>{Number.isFinite(botMetrics?.jitterMs) ? `${Math.round(botMetrics.jitterMs)} ms` : '—'}</strong></div>
              </div>
              <div className={`gateway-api-status ${isDiscordRateLimited ? 'is-limited' : ''}`}><span>Discord API</span><strong>{isDiscordRateLimited ? `Cooldown · ${rateLimitSeconds}s` : 'Available'}</strong></div>
            </section>}
          </div>
          <div className="emoji-panel">
            <div className="emoji-heading"><div className="panel-section-heading">App emojis</div><span>{appEmojis.length} / {emojiLimit}</span></div>
            <div className="emoji-form-grid">
              <label className="dock-field-label">Name<CharacterLimit value={emojiName} maxLength={32}><input className="studio-field" value={emojiName} onChange={(event) => setEmojiName(event.target.value)} placeholder="wave" maxLength={32} /></CharacterLimit></label>
              <label className="emoji-file-button"><Upload size={15} /><span>{emojiFileName || 'Choose image'}</span><input type="file" accept="image/png,image/gif,image/jpeg,image/webp,image/avif" onChange={chooseEmojiFile} /></label>
              <button className="studio-button studio-button-primary" onClick={uploadEmoji} disabled={!networkOnline || uploadingEmoji || loadingEmojis || !emojiName || !emojiImageBase64 || appEmojis.length >= emojiLimit || isDiscordRateLimited}>{uploadingEmoji ? 'Uploading…' : !networkOnline ? 'Offline' : isDiscordRateLimited ? `Cooldown · ${rateLimitSeconds}s` : 'Upload to app'}</button>
            </div>
            {uploadingEmoji && <div className="emoji-upload-progress" role="progressbar" aria-label="Emoji upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={emojiUploadProgress}><div><span>Uploading emoji</span><b>{emojiUploadProgress}%</b></div><progress max="100" value={emojiUploadProgress} /></div>}
            <small className="emoji-upload-hint">Static images are fitted to 128 × 128. Animated GIF/WebP must be 128 × 128 and under 256 KiB.</small>
            {emojiError && <p className="emoji-inline-error" role="alert">{emojiError}</p>}
            {appEmojis.length > emojiPageSize && <div className="app-emoji-toolbar"><label className="app-emoji-search"><Search size={13} /><input value={emojiSearch} onChange={(event) => { setEmojiSearch(event.target.value); setEmojiPage(0); }} placeholder="Search app emojis" aria-label="Search app emojis" /></label><span>{searchableEmojis.length} found</span></div>}
            <div className="app-emoji-list" aria-label="Application emojis">
              {loadingEmojis ? <span className="emoji-list-empty">Loading app emojis…</span> : visibleAppEmojis.map((emoji) => <div className="app-emoji-row" key={emoji.id}>
                <CustomEmoji src={`https://cdn.discordapp.com/emojis/${encodeURIComponent(emoji.id)}.${emoji.animated ? 'gif' : 'webp'}?size=64`} alt={`:${emoji.name}:`} className="app-emoji-image" />
                <strong>:{emoji.name}:</strong><button className="app-emoji-id" type="button" onClick={() => copyEmojiId(emoji)} aria-label={copiedEmojiId === emoji.id ? `Copied ${emoji.name} emoji ID` : `Copy ${emoji.name} emoji ID`}>{copiedEmojiId === emoji.id ? <><Check size={11} />Copied</> : <><code>{emoji.id}</code><ClipboardCopy size={11} /></>}</button>
                <button className="dock-icon-button danger-hover" onClick={() => deleteAppEmoji(emoji)} disabled={!networkOnline || Boolean(deletingEmojiId) || isDiscordRateLimited} title={!networkOnline ? 'Discord API actions are unavailable offline' : isDiscordRateLimited ? 'Discord API cooldown is active' : `Delete ${emoji.name}`} aria-label={`Delete ${emoji.name}`}><Trash2 size={13} /></button>
              </div>)}
              {!loadingEmojis && appEmojis.length > 0 && !searchableEmojis.length && <span className="emoji-list-empty">No matching app emojis</span>}
              {!loadingEmojis && !appEmojis.length && !emojiError && <span className="emoji-list-empty">No app emojis yet</span>}
            </div>
            {appEmojis.length > emojiPageSize && emojiPageCount > 1 && <div className="app-emoji-pagination"><button type="button" onClick={() => setEmojiPage((page) => Math.max(0, page - 1))} disabled={emojiPage === 0}>Previous</button><span>Page {emojiPage + 1} of {emojiPageCount}</span><button type="button" onClick={() => setEmojiPage((page) => Math.min(emojiPageCount - 1, page + 1))} disabled={emojiPage + 1 >= emojiPageCount}>Next</button></div>}
          </div>
        </div>}
      </div>
      {consoleContextMenu && createPortal(<div ref={consoleContextMenuRef} className={`canvas-context-menu console-context-menu${compactContextMenus ? ' is-compact' : ''}`} role="menu" style={{ left: consoleContextMenu.x, top: consoleContextMenu.y, transform: `scale(${getArcUiScale()})`, transformOrigin: 'top left' }} onPointerDown={(event) => event.stopPropagation()}>
        {(() => {
          const group = logGroups.find((item) => item.key === consoleContextMenu.groupKey);
          if (!group || group.logs.length < 2) return null;
          const expanded = expandedLogGroups.has(group.key);
          const setExpanded = () => {
            setExpandedLogGroups((current) => {
              const next = new Set(current);
              if (expanded) next.delete(group.key);
              else next.add(group.key);
              return next;
            });
            setConsoleContextMenu(null);
          };
          return <button role="menuitem" onClick={setExpanded}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? 'Collapse repeated logs' : 'Expand repeated logs'}</button>;
        })()}
        <button role="menuitem" onClick={() => copyConsoleText(consoleContextLog?.message)}><ClipboardCopy size={13} />Copy message</button>
        <button role="menuitem" onClick={() => copyConsoleText(`${formatTime(consoleContextLog?.timestamp)}  ${consoleContextLog?.level || 'INFO'}  ${consoleContextLog?.message || ''}`)}><ClipboardCopy size={13} />Copy full line</button>
        <button role="menuitem" onClick={() => copyConsoleText(filteredLogs.map((log) => `${formatTime(log.timestamp)}  ${log.level || 'INFO'}  ${log.message}`).join('\n'))}><FileText size={13} />Copy visible output</button>
      </div>, document.body)}
      {modalRoot && createPortal(<Modal isOpen={Boolean(commandReview)} onClose={() => { setCommandReview(null); setDeployError(''); }} title="Deployment review" subtitle={`${reviewCommandItems.length} commands · ${reviewIssueCount('error')} errors · ${reviewIssueCount('warning')} warnings`} icon={ShieldCheck} maxWidth="max-w-2xl" footer={commandReview && <><button className="studio-button" onClick={() => { setCommandReview(null); setDeployError(''); }}>Cancel</button><button className="studio-button studio-button-primary" onClick={deployCommands} disabled={!networkOnline || !commandReview.valid || commandReview.noChanges || commandReview.scope === 'guilds' && !commandReview.guildIds?.length || deployingCommands || updatingCommandReview || commandDeploySeconds > 0 || isDiscordRateLimited || graphValidationReports.some(({ report }) => report.errors.length)}>{deployingCommands ? 'Deploying…' : updatingCommandReview ? 'Updating review…' : !networkOnline ? 'Offline' : isDiscordRateLimited ? `Cooldown · ${rateLimitSeconds}s` : commandReview.noChanges ? 'No changes' : `Deploy ${commandReview.commands?.length || 0} commands`}</button></>}>
        {commandReview && <div className="deployment-review-content">
          {deployError && <p className="command-review-error is-in-review" role="alert"><AlertTriangle size={14} /><span><strong>Command request failed</strong>{deployError}</span></p>}
          {(commandReview.discordAuthWarning || discordAuthWarning) && <div className="discord-auth-warning is-review" role="status">
            <AlertTriangle size={17} />
            <div><strong>{(commandReview.discordAuthWarning || discordAuthWarning).title || 'Discord rejected the bot token'}</strong><span>{(commandReview.discordAuthWarning || discordAuthWarning).message}</span></div>
          </div>}
          {commandReview.supportsScopedDeployment && <section className="command-review-section deployment-target-section"><strong>Deploy scope</strong><div className="deployment-scope-toggle"><button type="button" className={commandReview.scope !== 'guilds' ? 'is-selected' : ''} disabled={updatingCommandReview} onClick={() => void updateCommandReviewOptions({ scope: 'global', guildIds: [], commandKeys: commandReview.commandKeys ?? null })}><Globe2 size={14} />Global</button><button type="button" className={commandReview.scope === 'guilds' ? 'is-selected' : ''} disabled={updatingCommandReview} onClick={() => { if (commandReview.scope !== 'guilds') void updateCommandReviewOptions({ scope: 'guilds', guildIds: commandReview.guildIds || [], commandKeys: commandReview.commandKeys ?? null }); }}><Server size={14} />Specific servers</button></div>
            {commandReview.scope === 'guilds' && <>
              {commandReview.guildOptions?.length ? <>
                <p className="command-review-empty">The application must be authorized in each selected server. Choose up to 25 servers per deployment.</p>
                <AnimatedDropdown multiple maxSelections={25} searchable searchThreshold={0} disabled={updatingCommandReview} value={commandReview.guildIds || []} options={commandReview.guildOptions.map((guild) => ({ value: guild.id, label: guild.name || `Server ${guild.id}` }))} onChange={(guildIds) => void updateCommandReviewOptions({ scope: 'guilds', guildIds, commandKeys: commandReview.commandKeys ?? null })} ariaLabel="Servers to receive commands" placeholder="Choose one or more servers" className="command-review-guild-dropdown" />
                {commandReview.guildSelectionError && <small className="command-review-guild-hint" role="alert">{commandReview.guildSelectionError}</small>}
              </> : <div className="command-review-empty">
                <p>{commandReview.guildDirectoryError || (botStatus === 'ONLINE' ? 'No servers are cached from the connected bot yet. Wait for server data to arrive or enter a server ID below.' : botStatus === 'CONNECTING' ? 'Connecting to Discord. Server suggestions will appear when the gateway reports its servers.' : 'The bot token does not include a server list. Connect the bot gateway to load server suggestions.')}</p>
                <div className="command-review-guild-actions">
                  {botStatus !== 'ONLINE' && <button type="button" className="studio-button studio-button-primary" disabled={!networkOnline || botStatus === 'CONNECTING'} onClick={() => void onStartBot?.()}>{botStatus === 'CONNECTING' ? 'Connecting…' : <><Play size={13} fill="currentColor" />Connect bot gateway</>}</button>}
                </div>
                <p>Or enter a server ID below. Choose up to 25 servers per deployment.</p>
              </div>}
              {!!commandReview.guildIds?.length && <div className="command-review-selected-guilds" aria-label="Selected servers">{commandReview.guildIds.map((id) => {
                const guild = (commandReview.guildOptions || []).find((item) => String(item.id) === String(id));
                const label = guild?.name || `Server ${id}`;
                return <span className="command-review-guild-chip" key={id} title={`${label} · ${id}`}><span>{label}</span><button type="button" disabled={updatingCommandReview} aria-label={`Remove ${label}`} onClick={() => void updateCommandReviewOptions({ scope: 'guilds', guildIds: commandReview.guildIds.filter((guildId) => guildId !== id), commandKeys: commandReview.commandKeys ?? null })}><X size={12} /></button></span>;
              })}</div>}
              <form className="command-review-add-guild" onSubmit={async (event) => { event.preventDefault(); const id = guildIdDraft.trim(); if (!/^\d{17,20}$/.test(id) || (commandReview.guildIds || []).includes(id) || commandReview.guildIds?.length >= 25) return; const known = (commandReview.guildOptions || []).find((guild) => guild.id === id); const guild = known || { id, name: `Server ${id}` }; setGuildIdError(''); const result = await updateCommandReviewOptions({ scope: 'guilds', guildIds: [...(commandReview.guildIds || []), id], commandKeys: commandReview.commandKeys ?? null, addedGuild: guild }); if (result?.requestError) { setGuildIdError(result.requestError); return; } setGuildIdDraft(''); }}><input value={guildIdDraft} inputMode="numeric" aria-invalid={Boolean(guildIdDraft && !/^\d{17,20}$/.test(guildIdDraft)) || Boolean(guildIdError)} onChange={(event) => { setGuildIdDraft(event.target.value.replace(/\D/g, '').slice(0, 20)); setGuildIdError(''); setDeployError(''); }} placeholder="Enter a server ID" aria-label="Server ID" /><button className="studio-button" type="submit" disabled={updatingCommandReview || !/^\d{17,20}$/.test(guildIdDraft) || (commandReview.guildIds || []).includes(guildIdDraft) || commandReview.guildIds?.length >= 25}>Add server ID</button></form>
              {guildIdError ? <small className="command-review-guild-hint" role="alert">{guildIdError}</small> : guildIdDraft && !/^\d{17,20}$/.test(guildIdDraft) && <small className="command-review-guild-hint" role="status">A Discord server ID must contain 17 to 20 digits.</small>}
            </>}
          </section>}
          {!commandReview.supportsScopedDeployment && <p className="command-review-empty">This workspace supports global deployment only. Update the workspace to choose servers or individual commands.</p>}
          <div className="command-review-section"><strong>Commands · {commandReview.supportsScopedDeployment ? `${includedReviewCommandKeys.length} selected` : availableReviewCommands.length}</strong><div className={`deployment-command-selection ${commandReview.supportsScopedDeployment ? '' : 'is-readonly'}`}>{availableReviewCommands.map((command) => { const key = `${Number(command.type || 1)}:${String(command.name || '').toLowerCase()}`; const included = includedReviewCommandKeys.includes(key); const label = Number(command.type || 1) === 2 ? `User · ${command.name}` : Number(command.type || 1) === 3 ? `Message · ${command.name}` : `/${command.name}`; return <label key={key}>{commandReview.supportsScopedDeployment && <input type="checkbox" checked={included} onChange={(event) => { const next = new Set(includedReviewCommandKeys); if (event.target.checked) next.add(key); else next.delete(key); void updateCommandReviewOptions({ scope: commandReview.scope || 'global', guildIds: commandReview.guildIds || [], commandKeys: next.size === allReviewCommandKeys.length ? null : [...next] }); }} />}<span><code>{label}</code><small>{command.description || (Number(command.type || 1) === 2 ? 'User context command' : Number(command.type || 1) === 3 ? 'Message context command' : 'Slash command')}</small></span></label>; })}{!availableReviewCommands.length && <p className="command-review-empty">No configured commands.</p>}</div>{commandReview.supportsScopedDeployment && !updatingCommandReview && commandReview.noChanges && !includedReviewCommandKeys.length && <p className="command-review-empty">Select at least one command to deploy.</p>}</div>
          <section className="command-review-section"><strong>Graph checks</strong>
            {reviewIssueGroups.length ? <div className="deployment-review-issues">{reviewIssueGroups.map((group) => {
              const expanded = expandedReviewIssues.has(group.key);
              const IssueIcon = group.severity === 'error' ? CircleX : AlertTriangle;
              return <article className={`deployment-review-issue is-${group.severity}`} key={group.key}>
                <button className="deployment-review-issue-toggle" aria-expanded={expanded} onClick={() => setExpandedReviewIssues((previous) => {
                  const next = new Set(previous);
                  if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                  return next;
                })}>
                  <IssueIcon size={14} /><span>{group.message}</span><b>({group.locations.length})</b>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {expanded && <div className="deployment-review-locations">{group.locations.map((location, index) => location.graph
                  ? <button key={`${location.graph.id}-${index}`} onClick={() => { setCommandReview(null); if (location.nodeId) onTraceIssue?.(location.graph.id, location.nodeId); else onOpenGraph?.(location.graph); }}><span>{location.graphName}{location.nodeName ? ` · ${location.nodeName}` : ''}</span><small>{location.nodeId ? 'Open node' : 'Open graph'}</small></button>
                  : <div key={`${location.graphName}-${index}`}><span>{location.graphName}</span></div>)}</div>}
              </article>;
            })}</div> : <p className="command-review-empty">No graph errors or warnings.</p>}
          </section>
          <div className="command-review-section"><strong>Required intents</strong>{commandReview.intents?.length ? commandReview.intents.map((intent) => <div className={`command-review-requirement ${intent.portalEnabled === false ? 'is-missing' : ''}`} key={intent.key}><span>{intent.label}</span><small>{intent.portalEnabled === false ? 'Disabled in Developer Portal' : intent.portalEnabled === true ? 'Enabled in Developer Portal' : intent.privileged ? 'Status unavailable' : 'Requested on connection'}</small></div>) : <p className="command-review-empty">No gateway intents required.</p>}</div>
          <div className="command-review-section"><strong>Bot permissions</strong>{commandReview.permissions?.length ? <div className="command-review-permissions">{commandReview.permissions.map((permission) => <code key={permission}>{permission}</code>)}</div> : <p className="command-review-empty">No server permissions required by the current graph actions.</p>}</div>
        </div>}
      </Modal>, modalRoot)}
      {modalRoot && createPortal(<Modal isOpen={commandListOpen} onClose={() => { setCommandListOpen(false); setSelectedReviewCommand(null); setCommandDirectoryItems(null); }} title={selectedReviewCommand ? (Number(selectedReviewCommand.type || 1) === 2 ? `User command: ${selectedReviewCommand.name}` : Number(selectedReviewCommand.type || 1) === 3 ? `Message command: ${selectedReviewCommand.name}` : `/${selectedReviewCommand.name}`) : commandDirectoryItems ? 'Commands' : 'Reviewed commands'} subtitle={selectedReviewCommand ? `${selectedReviewCommand.status} · command details and usage` : `${commandListItems.length} commands`} icon={selectedReviewCommand ? Activity : FileText} maxWidth="max-w-2xl">
        {selectedReviewCommand ? <div className="review-command-detail">
          <button className="review-command-back" onClick={() => { setSelectedReviewCommand(null); setSelectedCommandStats(null); }}><ChevronLeft size={14} />All commands</button>
          <div className="review-command-description"><span className={`command-review-status is-${selectedReviewCommand.status.toLowerCase()}`}>{selectedReviewCommand.status}</span><p>{selectedReviewCommand.description || 'No description'}</p>{selectedReviewCommand.graphName && <small>Graph · {selectedReviewCommand.graphName}</small>}{(selectedReviewCommand.graphs || (selectedReviewCommand.graphId ? [{ id: selectedReviewCommand.graphId, name: selectedReviewCommand.graphName }] : [])).length > 0 && <div className="review-command-graph-links">{(selectedReviewCommand.graphs || [{ id: selectedReviewCommand.graphId, name: selectedReviewCommand.graphName }]).map((link) => <button key={link.id} type="button" onClick={() => { const graph = graphs.find((item) => item.id === link.id); if (graph) { setCommandListOpen(false); setSelectedReviewCommand(null); setCommandDirectoryItems(null); onOpenGraph?.(graph); } }}><FileText size={12} />Open {link.name}</button>)}</div>}</div>
          {selectedReviewCommand.options?.length > 0 && <section className="review-command-options"><strong>Command structure</strong>{flattenReviewedSlashOptions(selectedReviewCommand.options).map((option) => <div key={option.key}><code>{option.name}</code><span>{option.description}</span></div>)}</section>}
          <section className="review-command-statistics"><div className="review-command-stats-heading"><strong>Usage</strong><span>{selectedCommandStats?.rangeDays ? `${selectedCommandStats.rangeDays === 'forever' ? 'All time' : `Last ${selectedCommandStats.rangeDays} days`}` : 'Loading'}</span></div>
            {loadingCommandStats ? <p className="command-review-empty">Loading statistics…</p> : selectedCommandStats ? <>
              <div className="review-command-stat-grid"><StatisticCard label="Uses" value={selectedCommandStats.uses} enabled={selectedCommandStats.tracking?.commandUsage} /><StatisticCard label="Unique users" value={selectedCommandStats.uniqueUsers} enabled={selectedCommandStats.tracking?.uniqueUsers} /><StatisticCard label="Returning users" value={selectedCommandStats.returningUsers} enabled={selectedCommandStats.tracking?.returningUsers} /></div>
              {selectedCommandStats.tracking?.commandUsage && <div className="review-command-daily"><strong>Daily uses</strong>{selectedCommandStats.daily?.length ? selectedCommandStats.daily.slice(-14).map((day) => <div key={day.day}><time>{new Date(`${day.day}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time><span><i style={{ width: `${Math.max(2, day.uses / Math.max(...selectedCommandStats.daily.slice(-14).map((item) => item.uses), 1) * 100)}%` }} /></span><b>{day.uses}</b></div>) : <p className="command-review-empty">No recorded use in this period.</p>}</div>}
            </> : <p className="command-review-empty">Statistics are unavailable.</p>}
          </section>
        </div> : <>
          <label className="review-command-search"><Search size={15} /><input autoFocus value={commandSearch} onChange={(event) => setCommandSearch(event.target.value)} placeholder="Search commands" /></label>
          <div className="review-command-list">{filteredReviewCommands.map((command) => <button key={`${command.status}-${command.type || 1}-${command.name}`} onClick={() => { setSelectedReviewCommand(command); setSelectedCommandStats(null); }}><span><code>{Number(command.type || 1) === 2 ? `User: ${command.name}` : Number(command.type || 1) === 3 ? `Message: ${command.name}` : `/${command.name}`}</code><small>{Number(command.type || 1) === 2 ? 'User context command' : Number(command.type || 1) === 3 ? 'Message context command' : (command.description || command.graphName || 'No description')}</small></span><span className={`command-review-status is-${command.status.toLowerCase()}`}>{command.status}</span></button>)}{!filteredReviewCommands.length && <p className="command-review-empty">No matching commands.</p>}</div>
        </>}
      </Modal>, modalRoot)}
    </section>
    {consolePopupRoot && createPortal(consolePanel, consolePopupRoot)}
    </>
  );
}

function StatisticCard({ label, value, enabled }) {
  return <div className={`review-command-stat ${enabled ? '' : 'is-disabled'}`}><span>{label}</span><strong>{enabled ? Number(value || 0).toLocaleString() : 'Off'}</strong></div>;
}

function DebugPinGroup({ label, values = EMPTY_DEBUG_VALUES }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedPins, setExpandedPins] = useState(() => new Set());
  useEffect(() => { setShowAll(false); setExpandedPins(new Set()); }, [values]);
  const visibleValues = showAll ? values : values.slice(0, 8);
  return <section className="debug-pin-group"><strong>{label}</strong>{values.length ? <>
    <div className={`debug-pin-values-scroll ${showAll ? 'is-expanded' : ''}`}>{visibleValues.map((pin, index) => {
      const text = formatDebugValue(pin.value);
      const expanded = expandedPins.has(index);
      return <div className="debug-pin-value" key={pin.pinId}><span>{pin.label}</span><div className="debug-pin-value-content"><code className={expanded ? 'is-expanded' : ''}>{text}</code>{text.length > 600 && <button type="button" className="simulation-show-more" onClick={() => setExpandedPins((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>{expanded ? <ChevronUp size={12} /> : <Plus size={12} />}{expanded ? 'Show less' : 'Show more'}</button>}</div></div>;
    })}</div>
    {values.length > 8 && <button type="button" className="simulation-show-more" onClick={() => setShowAll((current) => !current)}>{showAll ? <ChevronUp size={12} /> : <Plus size={12} />}{showAll ? 'Show fewer values' : `Show ${values.length - 8} more values`}</button>}
  </> : <small>None</small>}</section>;
}

function formatDebugValue(value) {
  if (typeof value === 'string') return value || '""';
  if (value === undefined) return 'undefined';
  return JSON.stringify(value) ?? String(value);
}

function simulationEventHint(eventName) {
  const hints = {
    MESSAGE_CREATE: 'Uses your message, author, and channel fields; IDs and remaining Discord metadata are generated.',
    SLASH_COMMAND: 'Uses your command, author, and channel fields with generated interaction data and sample options.',
    USER_COMMAND: 'Uses your command, author, and channel fields with generated user context interaction data.',
    MESSAGE_COMMAND: 'Uses your command, author, and channel fields with generated message context interaction data.',
    BUTTON_CLICK: 'Uses your custom ID, author, and channel fields with generated interaction data.',
    SELECT_MENU: 'Uses your custom ID and author/channel fields; the selected option is sample data.',
    MODAL_SUBMIT: 'Submits the selected modal’s fields with the values shown below.',
    GUILD_MEMBER_ADD: 'Uses the author field as the joining member; remaining member details are generated.',
    GUILD_MEMBER_REMOVE: 'Uses the author field as the departing member; remaining member details are generated.',
    MESSAGE_UPDATE: 'Uses your message, author, and channel fields; IDs and remaining Discord metadata are generated.',
    MESSAGE_DELETE: 'Uses your channel field with generated deleted-message data.',
    MESSAGE_REACTION_ADD: 'Uses your author and channel fields with a sample 👍 reaction.',
    MESSAGE_REACTION_REMOVE: 'Uses your author and channel fields with a sample removed 👍 reaction.',
    CHANNEL_CREATE: 'Uses generated sample data for the new channel.',
    VOICE_STATE_UPDATE: 'Uses generated sample voice-state data for the author.'
  };
  return hints[eventName] || 'Uses generated sample data for this event.';
}
//
function createSimulationPayload(eventName, values) {
  const timestamp = Date.now();
  const permissionsBitfield = permissionsToBitfield(values.mockPermissions || DEFAULT_MOCK_PERMISSIONS);
  const author = { id: '990000000000000001', username: values.mockAuthor, discriminator: '0', bot: false };
  const member = { user: author, nick: 'Simulated Member', roles: [], permissions: permissionsBitfield };
  const base = { id: `mock_${timestamp}`, channel_id: values.mockChannelId, guild_id: '120000000000000000', member, permissions: permissionsBitfield, app_permissions: permissionsBitfield };
  if (eventName === 'WEB_SERVER_REQUEST') return createMockWebRequestPayload(values, timestamp);
  if (eventName === 'CRON_TICK') return { ...base, cronNodeId: values.cronNodeId, scheduledAt: new Date(timestamp).toISOString(), timeZone: 'UTC', cronExpression: 'manual-debug' };
  if (eventName === 'MESSAGE_CREATE') return { ...base, content: values.mockContent, author, member };
  if (eventName === 'SLASH_COMMAND') return { ...base, type: 2, token: `mock_tok_${timestamp}`, member, data: { type: 1, name: values.mockCommand, options: [] } };
  if (eventName === 'USER_COMMAND') return { ...base, type: 2, token: `mock_tok_${timestamp}`, member, data: { type: 2, name: values.mockCommand, target_id: '990000000000000002', resolved: { users: { '990000000000000002': { id: '990000000000000002', username: 'Target User', global_name: 'Target User', bot: false } }, members: { '990000000000000002': { user: { id: '990000000000000002', username: 'Target User' }, nick: 'Target Member', permissions: permissionsBitfield } } } } };
  if (eventName === 'MESSAGE_COMMAND') return { ...base, type: 2, token: `mock_tok_${timestamp}`, member, data: { type: 3, name: values.mockCommand, target_id: '120000000000000001', resolved: { messages: { '120000000000000001': { id: '120000000000000001', content: values.mockContent || 'Sample target message content', author, channel_id: values.mockChannelId } } } } };
  if (eventName === 'MODAL_SUBMIT') {
    const fields = values.modal?.components?.length ? values.modal.components : [{ customId: values.mockModalFieldId || 'sample-input', type: 'text' }];
    const submittedFields = fields.map((field) => {
      const value = values.mockModalValues?.[field.customId] ?? mockModalDefault(field);
      const isScalar = field.type === 'text' || field.type === 'checkbox';
      return {
        custom_id: field.customId || 'sample-input',
        ...(isScalar ? { value: field.type === 'checkbox' ? Boolean(value) : String(value ?? '') } : { values: Array.isArray(value) ? value : value === '' || value == null ? [] : [value] })
      };
    });
    return { ...base, type: 5, token: `mock_tok_${timestamp}`, member, data: { custom_id: values.mockCustomId || values.modal?.customId || defaultMockCustomId(eventName), components: [{ type: 1, components: submittedFields }] } };
  }
  if (['BUTTON_CLICK', 'SELECT_MENU'].includes(eventName)) {
    const componentType = eventName === 'BUTTON_CLICK' ? 2 : 3;
    const messageId = `message_${timestamp}`;
    return {
      ...base,
      type: 3,
      token: `mock_tok_${timestamp}`,
      member,
      message: { id: messageId, channel_id: base.channel_id, guild_id: base.guild_id, content: 'Simulated source message' },
      data: { component_type: componentType, custom_id: values.mockCustomId ?? defaultMockCustomId(eventName), values: eventName === 'SELECT_MENU' ? ['sample-option'] : undefined, components: [] }
    };
  }
  if (eventName === 'GUILD_MEMBER_ADD' || eventName === 'GUILD_MEMBER_REMOVE') return { ...base, user: author, member, nick: 'Simulated Member', roles: [], permissions: permissionsBitfield, joined_at: new Date(timestamp).toISOString() };
  if (eventName === 'MESSAGE_UPDATE') return { ...base, content: values.mockContent, author, member, edited_timestamp: new Date(timestamp).toISOString() };
  if (eventName === 'MESSAGE_DELETE') return base;
  if (eventName.startsWith('MESSAGE_REACTION_')) return { ...base, message_id: `message_${timestamp}`, user_id: author.id, member, emoji: { id: null, name: '👍' } };
  if (eventName === 'CHANNEL_CREATE') return { ...base, name: 'sample-channel', type: 0, parent_id: null };
  if (eventName === 'VOICE_STATE_UPDATE') return { ...base, user_id: author.id, member, session_id: `session_${timestamp}`, self_mute: false, self_deaf: false };
  return base;
}

function mockModalDefault(field = {}) {
  const options = Array.isArray(field.options) ? field.options : [];
  const firstOption = options[0]?.value ?? options[0]?.label ?? '';
  if (field.type === 'checkbox') return Boolean(field.defaultChecked);
  if (['checkbox_group', 'user_select', 'role_select', 'mentionable_select', 'channel_select', 'file_upload'].includes(field.type) || Number(field.maxValues) > 1) return firstOption ? [String(firstOption)] : [];
  if (field.type === 'string_select' || field.type === 'radio_group') return String(firstOption);
  return field.type === 'text' ? '' : 'Sample response';
}

function createModalSubmissionRows(modal, values, fallbackId) {
  const fields = modal?.components?.length ? modal.components : [{ customId: fallbackId || 'sample-input', label: 'Submitted value', type: 'text' }];
  return fields.map((field) => {
    const value = values?.[field.customId] ?? mockModalDefault(field);
    return { label: field.label || field.customId || 'Field', customId: field.customId || 'sample-input', displayValue: Array.isArray(value) ? JSON.stringify(value) : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '') };
  });
}

function ModalSimulationField({ field, value, onChange }) {
  const multiple = ['checkbox_group', 'user_select', 'role_select', 'mentionable_select', 'channel_select', 'file_upload'].includes(field.type) || Number(field.maxValues) > 1;
  const options = (Array.isArray(field.options) ? field.options : []).map((option) => ({ value: String(option.value ?? option.label), label: String(option.label ?? option.value) }));
  return <label className="dock-field-label modal-simulation-field"><span>{field.label || 'Modal field'} <code>{field.customId}</code></span>
    {field.type === 'checkbox' ? <span className="modal-simulation-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /> Checked</span>
      : options.length ? <AnimatedDropdown multiple={multiple} value={multiple ? (Array.isArray(value) ? value.map(String) : []) : String(value ?? '')} options={options} onChange={onChange} ariaLabel={field.label || 'Modal field'} placeholder={multiple ? 'Choose values' : 'Choose a value'} />
        : <input className="studio-field" value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(event) => onChange(multiple ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean) : event.target.value)} placeholder={multiple ? 'Enter values separated by commas' : 'Sample response'} />}
  </label>;
}

function defaultMockCustomId(eventName) {
  return `mock_${String(eventName || 'button_click').toLowerCase()}`;
}

function DockTab({ tabId, active, onClick, icon: Icon, label, count }) {
  return <button data-dock-tab={tabId} className={`dock-tab ${active ? 'is-active' : ''}`} onClick={onClick}><Icon size={15} /><span>{label}</span>{count > 0 && <small>{count}</small>}</button>;
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleTimeString([], { hour12: false });
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(value, maximum)); }
function formatApiCount(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat().format(Number(value));
}
