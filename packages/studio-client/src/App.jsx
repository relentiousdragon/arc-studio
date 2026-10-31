import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AppWindow, Bot, Braces, ChevronDown, CircleHelp, Database, Download, FileCode2, FileUp, FolderTree, LayoutGrid, LockKeyhole, MoreHorizontal, PackageOpen, Plus, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, Ticket, TrendingUp, Trash2, Users, X } from 'lucide-react';
import { TopBar } from './components/navigation/TopBar.jsx';
import { NodeCanvas } from './components/canvas/NodeCanvas.jsx';
import { ControlDock } from './components/dock/ControlDock.jsx';
import { onPageBlur } from './core/pageFocus.js';
const lazyNamed = (loader, name) => {
  let modulePromise;
  const load = () => modulePromise ||= loader().then((module) => ({ default: module[name] }));
  const Component = lazy(load);
  Component.preload = load;
  return Component;
};
function formatCompactLastSeen(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const createEditorId = (prefix) => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`}`;
const getLocalCollaboratorColor = (id) => {
  const colors = ['#63b3ed', '#f687b3', '#68d391', '#f6ad55', '#b794f4', '#4fd1c5', '#fc8181', '#90cdf4', '#fbd38d', '#9ae6b4'];
  let hash = 0;
  for (const character of String(id || '')) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return colors[(hash >>> 0) % colors.length];
};
function getNextProjectGraphName(graphs) {
  const existingNames = new Set(graphs.map((graph) => String(graph.name || '').trim().toLowerCase()));
  let number = 1;
  while (existingNames.has(`graph ${number}`)) number += 1;
  return `Graph ${number}`;
}
const SplashScreen = lazyNamed(() => import('./components/splash/SplashScreen.jsx'), 'SplashScreen');
const NodePalette = lazyNamed(() => import('./components/palette/NodePalette.jsx'), 'NodePalette');
const CommandPalette = lazyNamed(() => import('./components/palette/CommandPalette.jsx'), 'CommandPalette');
const UserManagementModal = lazyNamed(() => import('./components/modals/UserManagementModal.jsx'), 'UserManagementModal');
const EditorSettingsModal = lazyNamed(() => import('./components/modals/EditorSettingsModal.jsx'), 'EditorSettingsModal');
const GraphVariablesModal = lazyNamed(() => import('./components/modals/GraphVariablesModal.jsx'), 'GraphVariablesModal');
const GraphLibraryPanel = lazyNamed(() => import('./components/panels/GraphLibraryPanel.jsx'), 'GraphLibraryPanel');
const EmbedStudioView = lazyNamed(() => import('./components/panels/EmbedStudioView.jsx'), 'EmbedStudioView');
const TextStudioView = lazyNamed(() => import('./components/panels/TextStudioView.jsx'), 'TextStudioView');
const PermissionStudioView = lazyNamed(() => import('./components/panels/PermissionStudioView.jsx'), 'PermissionStudioView');
const SlashCommandStudioView = lazyNamed(() => import('./components/panels/SlashCommandStudioView.jsx'), 'SlashCommandStudioView');
const PopupModalStudioView = lazyNamed(() => import('./components/panels/PopupModalStudioView.jsx'), 'PopupModalStudioView');
const GraphValidationModal = lazyNamed(() => import('./components/modals/GraphValidationModal.jsx'), 'GraphValidationModal');
const BotSettingsModal = lazyNamed(() => import('./components/modals/BotSettingsModal.jsx'), 'BotSettingsModal');
const PluginStoreModal = lazyNamed(() => import('./components/modals/PluginStoreModal.jsx'), 'PluginStoreModal');
[NodePalette, CommandPalette, EditorSettingsModal, GraphVariablesModal, GraphLibraryPanel, BotSettingsModal].forEach((Component) => {
  void Component.preload().catch(() => {});
});
import { ToastContainer } from './components/ui/ToastContainer.jsx';
import { Modal } from './components/ui/Modal.jsx';
import { TextInput } from './components/ui/Inputs.jsx';
import { Button } from './components/ui/Button.jsx';
import { TooltipLayer } from './components/ui/TooltipLayer.jsx';
import { EmojiPickerOverlay } from './components/ui/EmojiPickerOverlay.jsx';
import { SelectionContextMenu } from './components/ui/SelectionContextMenu.jsx';
import { SidebarResizeHandle } from './components/ui/SidebarResizeHandle.jsx';
import { ReleaseNotes } from './components/ui/ReleaseNotes.jsx';
import { arcEvents } from './core/ArcEvents.js';
import { listen as listenTauriEvent } from '@tauri-apps/api/event';
import { apiUrl, normalizeWorkspaceUrl, studioWebSocketUrl } from './core/api.js';
import { probeInternetConnectivity } from './core/networkConnectivity.js';
import { xhrJson } from './core/xhrJson.js';
import { readAppStorage, removeAppStorage, writeAppStorage } from './core/storage.js';
import { getArcUiScale } from './core/uiScale.js';
import { isProjectVariableUpdateForActiveProject } from './core/projectVariables.js';
import studioPackage from '../package.json';
import { classifyArcUpdate, compareArcVersions } from './core/appUpdates.js';
import { flattenSlashParameters, isValidSlashName, slashOptionPinId, validateSlashCommandOptions } from '../../studio-server/src/engine/SlashCommandOptions.js';
import { DEFAULT_SHORTCUTS, formatShortcut, getDefaultShortcut, shortcutMatches } from './core/shortcuts.js';
import { playUiSound, unlockUiSounds } from './core/uiSounds.js';
import { BuiltInNodeDefinitions, BundledNodeTypes, NODE_SCHEMA_VERSION, CLIENT_PROTOCOL_VERSION, NODE_REGISTRY_PROTOCOL_VERSION, SUPPORTED_NODE_REGISTRY_FEATURES, getNodeRegistryCompatibility, createDefaultNodeData, getAvailableNodeDefinitions, getNodeArgumentPins, getNodeRegistryDefinitions, getNodeTemplateInputPins, getTextTemplateSlots, isNodeTypeSupported, registerPluginNodeDefinitions, renderTextTemplate, resolveDynamicNodePins, setWorkspaceNodeDefinitions } from './components/nodes/nodeDefinitions.js';
import { createEmbedBlock, embedBlockPins, getEmbedBlocks } from './components/nodes/EmbedNodeBuilder.jsx';
import { createDefaultModal } from './components/nodes/ModalNodeBuilder.jsx';
import { evaluateMathNode } from '../../studio-server/src/engine/MathOperations.js';
import { FUNCTION_ARGUMENT_VALUE_TYPES, functionArgumentPinId, functionInputPinType, getFunctionGraphArguments, getFunctionInputArguments, migrateFunctionGraphEntry } from '../../studio-server/src/engine/FunctionGraphContract.js';
import { validateDiscordSemanticValue } from '../../studio-server/src/engine/DiscordValueValidation.js';
import { hasImportableTextContent } from '../../studio-server/src/storage/ImportContentReview.js';
//
const LEGACY_EMBED_PIN_FIELDS = {
  title: ['title', 'value'], description: ['description', 'value'], url: ['url', 'url'], color: ['color', 'value'],
  author_name: ['author', 'name'], author_url: ['author', 'url'], author_icon: ['author', 'icon'],
  footer_text: ['footer', 'text'], footer_icon: ['footer', 'icon'], thumbnail_url: ['thumbnail', 'url'], image_url: ['image', 'url']
};
const DEFAULT_SETTINGS = {
  snapToGrid: true,
  zoomCanvasWithScroll: false,
  canvasRightClickPan: false,
  canvasQuality: 'auto',
  wirePulse: true,
  wireStyle: 'bezier',
  doubleClickWireToCut: false,
  magneticSnap: true,
  showGrid: true,
  reduceMotion: false,
  uiScale: '100',
  fontScale: '100',
  autoSave: true,
  autoSaveIntervalSeconds: 30,
  autoSnapshots: true,
  snapshotIntervalMinutes: 30,
  snapshotRetentionHours: 12,
  uiSounds: false,
  autoUpdateChecks: true,
  compactContextMenus: false,
  discordRpcEnabled: true,
  discordRpcRedactWorkspace: false,
  discordRpcRedactProject: false,
  discordRpcRedactGraph: false,
  discordRpcRedactBot: false
};
const MAX_OPEN_GRAPH_TABS = 12;
const SIDEBAR_WIDTH_MIN = 280;
const SIDEBAR_WIDTH_MAX = 480;
const DEFAULT_SIDEBAR_WIDTHS = { projects: 320, library: 320, plugins: 360, bot: 360, variables: 320 };
const APP_EMOJI_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;
const PROJECT_STARTER_ICONS = { blank: Plus, ticket: Ticket, leveling: TrendingUp, moderation: ShieldCheck, basic: Bot, utility: Braces };
function LazyFeatureLoading({ label = 'Opening feature…', kind = 'modal', isDesktop = false, width }) {
  if (isDesktop) return <div className="studio-lazy-feature-loading" role="status" aria-live="polite"><span aria-hidden="true" />{label}</div>;
  return <div className={`studio-lazy-skeleton studio-lazy-skeleton-${kind}`} role="status" aria-label={label} style={width ? { '--arc-sidebar-width': `${width}px` } : undefined}>
    {kind === 'sidebar' ? <><div className="studio-skeleton-header"><i /><i /><i /></div><div className="studio-skeleton-tabs"><i /><i /><i /></div><div className="studio-skeleton-content"><i /><i /><i /><i /><i /><i /></div></>
      : kind === 'editor' ? <div className="studio-skeleton-editor-lines"><i /><i /><i /><i /><i /><i /></div>
        : kind === 'page' ? <div className="studio-skeleton-page"><i /><i /><i /><i /><i /></div>
          : <div className="studio-skeleton-modal"><div className="studio-skeleton-header"><i /><i /><i /></div><div className="studio-skeleton-content"><i /><i /><i /><i /><i /></div></div>}
  </div>;
}
function LazyMountedFeature({ Component, isOpen, loadingLabel, loadingKind = 'modal', isDesktop = false, ...props }) {
  const [hasOpened, setHasOpened] = useState(isOpen);
  useEffect(() => { if (isOpen) setHasOpened(true); }, [isOpen]);
  if (!hasOpened) return null;
  return <Suspense fallback={<LazyFeatureLoading label={loadingLabel} kind={loadingKind} isDesktop={isDesktop} width={props.sidebarWidth} />}><Component {...props} isOpen={isOpen} /></Suspense>;
}
const TAG_GROUP_COLORS = [
  { id: 'blue', label: 'Blue', value: '#5798ee' },
  { id: 'purple', label: 'Purple', value: '#a77af4' },
  { id: 'teal', label: 'Teal', value: '#39b8b1' },
  { id: 'green', label: 'Green', value: '#62bd74' },
  { id: 'amber', label: 'Amber', value: '#e6aa4b' },
  { id: 'red', label: 'Red', value: '#e47777' }
];

function getShortcutDisplayTokens(shortcut) {
  return String(shortcut).replace(/([⌘⇧⌥])/g, ' $1 ').trim().split(/\s+/).filter(Boolean);
}

function ExportReviewDisclosure({ title, summary, expanded, onToggle, children }) {
  return <section className="export-preflight-disclosure">
    <button type="button" className="export-preflight-disclosure-toggle" aria-expanded={expanded} onClick={onToggle}>
      <span><strong>{title}</strong><small>{summary}</small></span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {expanded && <div className="export-preflight-disclosure-content">{children}</div>}
  </section>;
}

function collectTemplateValuePaths(value, root, depth = 0, output = [], seen = new Set()) {
  if (depth >= 4 || value == null || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  const entries = Array.isArray(value)
    ? value.slice(0, 10).map((_item, index) => [index, value[index]])
    : Object.entries(value).slice(0, 40).filter(([key]) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key));
  for (const [key, child] of entries) {
    const path = Array.isArray(value) ? `${root}[${key}]` : `${root}.${key}`;
    output.push({ path, label: path });
    collectTemplateValuePaths(child, path, depth + 1, output, seen);
  }
  seen.delete(value);
  return output;
}

function slashAttachmentVariables(nodes = [], existingVariables = []) {
  const usedNames = new Set(existingVariables.map((variable) => String(variable?.name || '').toLowerCase()).filter(Boolean));
  return nodes.filter((node) => node?.type === 'event_slash_command').flatMap((node) => {
    const commandName = String(node.data?.commandName || 'command').replace(/[^A-Za-z0-9_-]/g, '_');
    return flattenSlashParameters(node.data?.options).filter(({ option, path }) => Number(option?.type) === 11 && path.every(isValidSlashName)).map(({ option, path }) => ({
      option,
      path,
      baseName: `${commandName}_${path.join('_')}`.slice(0, 64)
    })).map(({ option, path, baseName }) => {
      let name = baseName;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        const marker = `_${suffix++}`;
        name = `${baseName.slice(0, 64 - marker.length)}${marker}`;
      }
      usedNames.add(name.toLowerCase());
      return {
        id: `slash_attachment_${node.id}_${path.join('.')}`,
        name,
        type: 'attachment',
        initialValue: { id: '', filename: '', url: '', content_type: '', size: 0 },
        persist: false,
        readOnly: true,
        sourceNodeId: node.id,
        sourceOptionName: option.name,
        sourceOptionPinId: slashOptionPinId(path)
      };
    });
  });
}

function addSlashOptionEditorIds(options = [], nodeId, path = []) {
  return (Array.isArray(options) ? options : []).map((option, index) => {
    const segment = String(option?.name || index);
    const optionPath = [...path, segment];
    return {
      ...option,
      id: option.id || `option:${nodeId}:${optionPath.join('.')}`,
      choices: (Array.isArray(option.choices) ? option.choices : []).map((choice, choiceIndex) => ({ ...choice, id: choice.id || `choice:${nodeId}:${optionPath.join('.')}:${choiceIndex}` })),
      ...([1, 2].includes(Number(option.type)) ? { options: addSlashOptionEditorIds(option.options, nodeId, optionPath) } : {})
    };
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 integrity checks are unavailable in this browser.');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getNodeOutputSample(source, pinId, variables, graphNodes) {
  if (!source) return undefined;
  if (source.type === 'variable_get' && pinId === 'value') return variables.find((item) => item.id === source.data?.variableId)?.initialValue;
  if (source.type === 'event_modal_submit' && pinId === 'submitted_values') return [{ type: 1, components: [{ custom_id: 'field_id', value: 'text value', values: ['selected_value'] }] }];
  if (source.type === 'build_modal' && pinId === 'modal') {
    const modal = source.data?.modal || {};
    return { custom_id: modal.customId, title: modal.title, components: (modal.components || []).map((field) => ({ type: 18, component: { custom_id: field.customId, value: '', values: [] } })) };
  }
  if (source.type === 'data_get_modal_value' && pinId === 'value') {
    const fieldId = String(source.data?.custom_id || '');
    const field = graphNodes.flatMap((item) => item.type === 'build_modal' ? item.data?.modal?.components || [] : []).find((item) => item.customId === fieldId);
    return ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select', 'checkbox_group'].includes(field?.type) ? ['selected_value'] : '';
  }
  if (source.type === 'value_text' || source.type === 'value_number' || source.type === 'value_boolean') return source.data?.value;
  if (source.type === 'data_array_create' && pinId === 'array') return Object.keys(source.data || {}).filter((key) => /^item_\d+$/.test(key)).sort().map((key) => source.data[key]);
  const direct = source.data?.[pinId];
  if (direct !== undefined && typeof direct !== 'string') return direct;
  if (pinId === 'value' && source.data?.value !== undefined) return source.data.value;
  return undefined;
}

function getTemplatePreviewInputs(graph, node, variables) {
  if (!graph || !node) return {};
  const byId = new Map((graph.nodes || []).map((item) => [item.id, item]));
  const connections = graph.connections || [];
  const sample = (source, pinId, seen = new Set()) => {
    if (!source || seen.has(source.id) || seen.size > 24) return undefined;
    const direct = getNodeOutputSample(source, pinId, variables, graph.nodes || []);
    if (direct !== undefined) return direct;
    const nextSeen = new Set(seen).add(source.id);
    const input = (id, fallback) => {
      const wire = connections.find((item) => item.targetNodeId === source.id && item.targetPinId === id);
      return wire ? sample(byId.get(wire.sourceNodeId), wire.sourcePinId, nextSeen) : source.data?.[id] ?? fallback;
    };
    if (source.type.startsWith('math_')) {
      if (pinId !== 'result') return undefined;
      const definition = BuiltInNodeDefinitions.find((item) => item.type === source.type);
      const inputs = Object.fromEntries((definition?.inputs || []).map((pin) => [pin.id, input(pin.id, pin.defaultValue)]));
      return evaluateMathNode(source.type, inputs, source.data || {});
    }
    if (source.type === 'data_array_get') {
      const array = input('array', []); const index = Math.trunc(Number(input('index', 0)));
      if (pinId === 'found') return Array.isArray(array) && index >= 0 && index < array.length;
      return Array.isArray(array) && index >= 0 && index < array.length ? array[index] : null;
    }
    if (source.type === 'data_check_value') {
      const value = input('value', undefined); const fallback = input('fallback', '');
      const state = value === undefined ? 'missing' : value === null ? 'null' : typeof value === 'string' && !value.trim() ? 'empty' : 'value';
      return ({ value: state === 'value' ? value : fallback, state, is_missing: state === 'missing', is_null: state === 'null', is_empty: state === 'empty', has_value: state === 'value' })[pinId];
    }
    if (source.type === 'data_object_get' || source.type === 'data_get_value_by_path') {
      const object = input(source.type === 'data_object_get' ? 'object' : 'value', {});
      const path = String(input(source.type === 'data_object_get' ? 'key' : 'path', '') || '');
      let result = { exists: false, value: undefined };
      if (source.type === 'data_object_get') {
        if (path && object != null && Object.hasOwn(Object(object), path)) result = { exists: true, value: object[path] };
      } else {
        const parts = []; let offset = 0; let valid = Boolean(path) && path.length <= 512;
        while (valid && offset < path.length) {
          if (path[offset] === '.') { if (offset === 0 || offset === path.length - 1 || path[offset + 1] === '.' || path[offset + 1] === '[') { valid = false; break; } offset += 1; continue; }
          const remaining = path.slice(offset);
          const bracket = /^\[(?:(\d+)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\]/.exec(remaining);
          const property = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(remaining);
          if (bracket) { parts.push(bracket[1] !== undefined ? bracket[1] : (bracket[2] ?? bracket[3]).replace(/\\([\\"'])/g, '$1')); offset += bracket[0].length; }
          else if (property) { parts.push(property[0]); offset += property[0].length; }
          else { valid = false; break; }
          if (parts.length > 64) { valid = false; break; }
        }
        let value = object;
        if (valid) for (const key of parts) {
          if (['__proto__', 'prototype', 'constructor'].includes(String(key)) || value == null || (typeof value !== 'object' && typeof value !== 'string') || !Object.hasOwn(Object(value), key)) { valid = false; break; }
          value = value[key];
        }
        if (valid && parts.length) result = { exists: true, value };
      }
      return ({ value: result.exists ? result.value : source.type === 'data_get_value_by_path' ? input('fallback', '') : null, exists: result.exists })[pinId];
    }
    if (source.type === 'data_find_array_item' || source.type === 'data_filter_array') {
      const array = input('array', []); const items = Array.isArray(array) ? array.slice(0, 10000) : [];
      const path = String(input('path', '') || ''); const wanted = input('value', '');
      const matches = items.map((item, index) => {
        let actual = { exists: true, value: item };
        if (path) {
          const parts = []; let offset = 0; let valid = path.length <= 512;
          while (valid && offset < path.length) {
            if (path[offset] === '.') { if (offset === 0 || offset === path.length - 1 || path[offset + 1] === '.' || path[offset + 1] === '[') { valid = false; break; } offset += 1; continue; }
            const remaining = path.slice(offset); const bracket = /^\[(?:(\d+)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\]/.exec(remaining); const property = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(remaining);
            if (bracket) { parts.push(bracket[1] !== undefined ? bracket[1] : (bracket[2] ?? bracket[3]).replace(/\\([\\"'])/g, '$1')); offset += bracket[0].length; }
            else if (property) { parts.push(property[0]); offset += property[0].length; } else { valid = false; break; }
            if (parts.length > 64) valid = false;
          }
          let value = item;
          if (valid) for (const key of parts) { if (['__proto__', 'prototype', 'constructor'].includes(String(key)) || value == null || (typeof value !== 'object' && typeof value !== 'string') || !Object.hasOwn(Object(value), key)) { valid = false; break; } value = value[key]; }
          actual = valid && parts.length ? { exists: true, value } : { exists: false, value: undefined };
        }
        const operator = source.type === 'data_filter_array' ? input('operator', 'equals') : 'equals';
        const value = actual.value;
        const matched = operator === 'exists' ? actual.exists
          : operator === 'is_empty' ? actual.exists && (value == null || value === '' || Array.isArray(value) && !value.length || typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)
            : !actual.exists ? false
              : operator === 'not_equals' ? !Object.is(value, wanted)
                : operator === 'contains' ? typeof value === 'string' ? value.includes(String(wanted ?? '')) : Array.isArray(value) && value.some((entry) => Object.is(entry, wanted))
                  : operator === 'starts_with' ? typeof value === 'string' && value.startsWith(String(wanted ?? ''))
                    : operator === 'ends_with' ? typeof value === 'string' && value.endsWith(String(wanted ?? ''))
                      : operator === 'greater_than' ? value > wanted
                        : operator === 'greater_or_equal' ? value >= wanted
                          : operator === 'less_than' ? value < wanted
                            : operator === 'less_or_equal' ? value <= wanted
                              : Object.is(value, wanted);
        return { item, index, matched };
      }).filter((entry) => entry.matched);
      if (source.type === 'data_find_array_item') { const found = matches[0]; return ({ item: found?.item ?? null, index: found?.index ?? -1, found: Boolean(found) })[pinId]; }
      if (pinId === 'count') return matches.length;
      return pinId === 'array' ? matches.map(({ item }) => item) : undefined;
    }
    return undefined;
  };
  return Object.fromEntries(connections.filter((wire) => wire.targetNodeId === node.id).map((wire) => [wire.targetPinId, sample(byId.get(wire.sourceNodeId), wire.sourcePinId)]).filter(([, value]) => value !== undefined));
}

function getTemplateValuePaths(graph, node, variables) {
  const paths = [];
  for (const variable of variables) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name || '')) collectTemplateValuePaths(variable.initialValue, variable.name, 0, paths);
  }
  if (!graph || !node) return paths;
  const nodeById = new Map((graph.nodes || []).map((item) => [item.id, item]));
  for (const wire of graph.connections || []) {
    if (wire.targetNodeId !== node.id) continue;
    const argument = /^arg_(\d+)$/.exec(wire.targetPinId);
    const slot = /^slot_(.+)$/.exec(wire.targetPinId);
    if (!argument && !slot) continue;
    const root = argument ? `arg${argument[1]}` : slot[1];
    const sample = getNodeOutputSample(nodeById.get(wire.sourceNodeId), wire.sourcePinId, variables, graph.nodes || []);
    collectTemplateValuePaths(sample, root, 0, paths);
  }
  return [...new Map(paths.map((item) => [item.path, item])).values()];
}

function getTemplateSocketSuggestions(graph, targetNode) {
  if (!graph) return [];
  const definitions = new Map(BuiltInNodeDefinitions.map((definition) => [definition.type, definition]));
  const suggestions = [];
  const seen = new Set();
  for (const sourceNode of graph.nodes || []) {
    if (sourceNode.id === targetNode?.id) continue;
    const definition = definitions.get(sourceNode.type);
    for (const pin of definition?.outputs || []) {
      if (pin.type === 'exec' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(pin.id) || seen.has(pin.id.toLowerCase())) continue;
      seen.add(pin.id.toLowerCase());
      suggestions.push({ name: pin.id, label: `${sourceNode.label || definition.label} · ${pin.label || pin.id}` });
    }
  }
  if (targetNode?.type === 'format_text') {
    const definition = definitions.get(targetNode.type);
    for (const pin of getNodeArgumentPins(targetNode, definition?.inputs || [], graph.connections || [])) {
      const name = pin.id.replace(/^arg_/, 'arg');
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      suggestions.push({ name, label: pin.label || name });
    }
  }
  return suggestions;
}

function mergeCollaborativeAttachments(current, incoming) {
  const localByName = new Map((current || []).filter((item) => item?.filename).map((item) => [item.filename, item]));
  return (incoming || []).map((item) => {
    const local = localByName.get(item?.filename);
    return { ...item, ...(item?.data ? {} : local?.data ? { data: local.data } : {}) };
  });
}

function collaborativeAttachments(attachments = []) {
  return attachments.map(({ data, ...metadata }) => data && data.length <= 80_000 ? { ...metadata, data } : metadata);
}

function collaborativeEmbedDraft(studio) {
  return { name: studio.name, content: studio.content || '', blocks: studio.blocks || [], components: studio.components || [], componentsV2Layout: studio.componentsV2Layout || [], componentsV2Enabled: Boolean(studio.componentsV2Enabled), attachments: collaborativeAttachments(studio.attachments || []) };
}

function getTextEdit(base, next) {
  let start = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) start += 1;
  let suffix = 0;
  while (suffix < base.length - start && suffix < next.length - start && base[base.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
  return { start, deleteCount: base.length - start - suffix, insertText: next.slice(start, next.length - suffix) };
}

function applyTextEdit(value, edit) {
  return `${value.slice(0, edit.start)}${edit.insertText}${value.slice(edit.start + edit.deleteCount)}`;
}

function mergeCollaborativeText(base, local, remote, localUserId, remoteUserId) {
  if (local === base) return remote;
  if (remote === base || local === remote) return local;
  if (remote.includes(local)) return remote;
  if (local.includes(remote)) return local;
  const localEdit = getTextEdit(base, local);
  const remoteEdit = getTextEdit(base, remote);
  const localEnd = localEdit.start + localEdit.deleteCount;
  const remoteEnd = remoteEdit.start + remoteEdit.deleteCount;
  const sameInsertPoint = localEdit.deleteCount === 0 && remoteEdit.deleteCount === 0 && localEdit.start === remoteEdit.start;
  if (!sameInsertPoint && localEnd <= remoteEdit.start) return applyTextEdit(applyTextEdit(base, localEdit), { ...remoteEdit, start: remoteEdit.start + localEdit.insertText.length - localEdit.deleteCount });
  if (!sameInsertPoint && remoteEnd <= localEdit.start) return applyTextEdit(applyTextEdit(base, remoteEdit), { ...localEdit, start: localEdit.start + remoteEdit.insertText.length - remoteEdit.deleteCount });
  return String(localUserId || '') <= String(remoteUserId || '') ? local : remote;
}

function makeExportJsonSafe(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value !== 'object') return undefined;
  if (ancestors.has(value)) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (ArrayBuffer.isView(value)) return Array.from(value, (item) => makeExportJsonSafe(item, ancestors));
  ancestors.add(value);
  let safe;
  if (Array.isArray(value)) {
    safe = value.map((item) => {
      const result = makeExportJsonSafe(item, ancestors);
      return result === undefined ? null : result;
    });
  } else {
    safe = {};
    for (const [key, item] of Object.entries(value)) {
      const result = makeExportJsonSafe(item, ancestors);
      if (result !== undefined) safe[key] = result;
    }
  }
  ancestors.delete(value);
  return safe;
}

function exportGraphPayload(graph) {
  return makeExportJsonSafe({
    id: graph?.id,
    name: graph?.name,
    graphType: graph?.graphType,
    variables: graph?.variables || [],
    nodes: graph?.nodes || [],
    connections: graph?.connections || [],
    tagGroups: graph?.tagGroups || [],
    notes: graph?.notes || [],
    arrows: (graph?.arrows || []).filter((arrow) => arrow?.locked)
  });
}

function getInitialTheme() {
  const savedTheme = readAppStorage('arc_theme');
  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function hasSavedThemeChoice() {
  const savedTheme = readAppStorage('arc_theme');
  return savedTheme === 'dark' || savedTheme === 'light';
}

function safeStorageGet(key, fallback = '') {
  return readAppStorage(key, fallback);
}

function safeStorageSet(key, value) {
  writeAppStorage(key, value);
}

function safeStorageRemove(key) {
  removeAppStorage(key);
}

function readLocalDesktopSessionToken() {
  try { return localStorage.getItem('arc_local_session_token') || ''; }
  catch { return ''; }
}

function writeLocalDesktopSessionToken(token) {
  try { localStorage.setItem('arc_local_session_token', token); }
  catch {}
}

function removeLocalDesktopSessionToken() {
  try { localStorage.removeItem('arc_local_session_token'); }
  catch {}
  try { window.__TAURI_INTERNALS__?.invoke?.('delete_local_session_token').catch(() => {}); }
  catch {}
}

function getInitialAuthToken(desktopMode) {
  if (desktopMode) {
    try {
      if (localStorage.getItem('arc_workspace_mode') !== 'remote') {
        return readLocalDesktopSessionToken() || safeStorageGet('arc_token');
      }
    } catch {}
  }
  return safeStorageGet('arc_token');
}

function readStoredJson(key, fallback) {
  try {
    const saved = readAppStorage(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function readSidebarWidths() {
  const saved = readStoredJson('arc_sidebar_widths', DEFAULT_SIDEBAR_WIDTHS);
  return Object.fromEntries(Object.keys(DEFAULT_SIDEBAR_WIDTHS).map((id) => {
    const value = Number(saved[id]);
    return [id, Number.isFinite(value) ? Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, value)) : DEFAULT_SIDEBAR_WIDTHS[id]];
  }));
}

function nodeTopLeftAtCenter(type, center) {
  const definition = BuiltInNodeDefinitions.find((item) => item.type === type);
  const rows = Math.max(definition?.inputs?.length || 0, definition?.outputs?.length || 0);
  return { x: (center?.x || 0) - 124, y: (center?.y || 0) - (76 + rows * 23) / 2 };
}

const CANONICAL_UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

function projectIdFromRouteSegment(segment) {
  const value = String(segment || '');
  if (/^project_/i.test(value)) return value;
  return CANONICAL_UUID.test(value) ? `project_${value.toLowerCase()}` : value;
}

function projectIdToRouteSegment(projectId) {
  const match = String(projectId || '').match(/^project_([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i);
  return match ? match[1].toLowerCase() : String(projectId || '');
}

function graphIdFromRouteSegment(segment) {
  const value = String(segment || '');
  if (CANONICAL_UUID.test(value)) return `graph_${value.toLowerCase()}`;
  const imported = value.match(/^import_([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i);
  if (imported) return `graph_import_${imported[1].toLowerCase()}`;
  return value;
}

function graphIdToRouteSegment(graphId) {
  const value = String(graphId || '');
  const imported = value.match(/^graph_import_([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i);
  if (imported) return `import_${imported[1].toLowerCase()}`;
  const match = value.match(/^graph_([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i);
  return match ? match[1].toLowerCase() : value;
}

function readBrowserStudioRoute() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)(?:\/graphs\/([^/]+))?\/?$/);
  const params = new URLSearchParams(window.location.search);
  try {
    return {
      projectId: match ? projectIdFromRouteSegment(decodeURIComponent(match[1])) : '',
      graphId: match?.[2] ? graphIdFromRouteSegment(decodeURIComponent(match[2])) : '',
      nodeId: params.get('node') || '',
      panel: params.get('panel') || '',
      librarySection: params.get('library') || '',
      variableScope: params.get('variableScope') || '',
      emptyWorkspace: params.get('empty') === '1',
      studio: {
        kind: params.get('studio') || '',
        nodeId: params.get('studioNode') || '',
        fieldKey: params.get('studioField') || '',
        label: params.get('studioLabel') || '',
        maxLength: Number(params.get('studioMax')) || 0,
        scope: params.get('studioScope') || '',
        variableId: params.get('studioVariable') || '',
        mode: params.get('studioMode') || '',
        tab: params.get('studioTab') || '',
        assetId: params.get('studioAsset') || '',
        blockId: params.get('studioBlock') || '',
        blockKey: params.get('studioBlockField') || '',
        blockCollection: params.get('studioBlockCollection') || ''
      }
    };
  } catch { return { projectId: '', graphId: '', nodeId: '', panel: '', librarySection: '', variableScope: '', emptyWorkspace: false, studio: { kind: '' } }; }
}

function writeStudioRouteParams(params, route) {
  if (!route?.kind) return;
  const fields = {
    studio: route.kind,
    studioNode: route.nodeId,
    studioField: route.fieldKey,
    studioLabel: route.label,
    studioMax: route.maxLength,
    studioScope: route.scope,
    studioVariable: route.variableId,
    studioMode: route.mode,
    studioTab: route.tab,
    studioAsset: route.assetId,
    studioBlock: route.blockId,
    studioBlockField: route.blockKey,
    studioBlockCollection: route.blockCollection
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  }
}
//
export function App() {
  const desktopMode = Boolean(window.__ARC_STUDIO_CONFIG__?.desktop);
  const desktopReleaseChannel = window.__ARC_STUDIO_CONFIG__?.releaseChannel === 'nightly' ? 'nightly' : 'stable';
  const initialBrowserRouteRef = useRef(null);
  if (!desktopMode && initialBrowserRouteRef.current === null) initialBrowserRouteRef.current = readBrowserStudioRoute();
  const browserRouteHandledRef = useRef(false);
  const browserProjectSwitchRef = useRef(false);
  const browserInitialRouteSettledRef = useRef(false);
  const browserStudioRestorePendingRef = useRef(Boolean(initialBrowserRouteRef.current?.studio?.kind));
  const shortcutPlatform = window.__ARC_STUDIO_CONFIG__?.platform || (/Mac|iPhone|iPad/.test(navigator.platform) ? 'macos' : 'windows');
  const macOSDesktop = desktopMode && shortcutPlatform === 'macos';
  const shortcutModifier = shortcutPlatform === 'macos' ? '⌘' : 'Ctrl';
  const [workspaceMode, setWorkspaceMode] = useState(() => {
    try { return desktopMode && localStorage.getItem('arc_workspace_mode') === 'remote' ? 'remote' : 'local'; }
    catch { return 'local'; }
  });
  const externalCollaborativeWorkspace = !desktopMode || workspaceMode === 'remote';
  const [workspaceSwitchOpen, setWorkspaceSwitchOpen] = useState(false);
  const localSessionRef = useRef(null);
  if (desktopMode && !localSessionRef.current) {
    const savedLocalToken = readLocalDesktopSessionToken();
    if (savedLocalToken) localSessionRef.current = { token: savedLocalToken, user: null };
  }
  const localDesktopWorkspace = desktopMode && workspaceMode === 'local';
  const [remoteWorkspaceUrl, setRemoteWorkspaceUrl] = useState(() => {
    try { return desktopMode ? localStorage.getItem('arc_remote_workspace_url') || '' : ''; }
    catch { return ''; }
  });
  const [remoteWorkspaceName, setRemoteWorkspaceName] = useState(() => {
    try { return desktopMode ? (localStorage.getItem('arc_remote_workspace_name') || '').slice(0, 35) : ''; }
    catch { return ''; }
  });
  const externalWorkspaceName = remoteWorkspaceName || 'Private Workspace';
  const [supportedWorkspaceNodeTypes, setSupportedWorkspaceNodeTypes] = useState(null);
  const [failedWorkspaceNodeTypes, setFailedWorkspaceNodeTypes] = useState(() => new Set());
  const [workspaceCompatibilityNotice, setWorkspaceCompatibilityNotice] = useState('');
  const [pluginDefinitionsRevision, setPluginDefinitionsRevision] = useState(0);
  const nodeRegistryRevisionRef = useRef('');
  const availableNodeDefinitions = useMemo(() => getAvailableNodeDefinitions(BuiltInNodeDefinitions, supportedWorkspaceNodeTypes, failedWorkspaceNodeTypes), [failedWorkspaceNodeTypes, pluginDefinitionsRevision, supportedWorkspaceNodeTypes]);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine !== false);
  const [appUpdate, setAppUpdate] = useState(null);
  const [serverUpdate, setServerUpdate] = useState(null);
  const [downloadedUpdateReady, setDownloadedUpdateReady] = useState(null);
  const [releaseNotesNotice, setReleaseNotesNotice] = useState(null);
  const [updateNotice, setUpdateNotice] = useState(null);
  const [updateInstallPromptOpen, setUpdateInstallPromptOpen] = useState(false);
  const [installUpdateConfirmOpen, setInstallUpdateConfirmOpen] = useState(false);
  const [updatePermissionHelpOpen, setUpdatePermissionHelpOpen] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const updateRef = useRef(null);
  const stableAutoDownloadVersionRef = useRef('');
  const startupStagedUpdateCheckedRef = useRef(false);
  const autoInstallStagedUpdateOnLaunchRef = useRef(false);
  const [canResetPrimaryAdminWithMasterKey, setCanResetPrimaryAdminWithMasterKey] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [authToken, setAuthToken] = useState(() => getInitialAuthToken(desktopMode));
  const forceSignOutRef = useRef(null);
  const [localSessionRestoreReady, setLocalSessionRestoreReady] = useState(() => !desktopMode || workspaceMode !== 'local' || Boolean(getInitialAuthToken(desktopMode)));
  const [currentUser, setCurrentUser] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [projectCollaboration, setProjectCollaboration] = useState({ projectId: '', graphIds: [], tabsInitialized: false, users: [] });
  const [remoteCollaborationActions, setRemoteCollaborationActions] = useState([]);
  const [graphChatBubbles, setGraphChatBubbles] = useState([]);
  const [transientCanvasArrows, setTransientCanvasArrows] = useState([]);
  const [followCollaboratorRequest, setFollowCollaboratorRequest] = useState(null);
  const [noteEditLockState, setNoteEditLockState] = useState({ roomKey: '', locks: {} });
  const [collaborationSocketStatus, setCollaborationSocketStatus] = useState('connecting');
  const [minimumRequiredClientVersion, setMinimumRequiredClientVersion] = useState('');
  const [collaborationConnectionFlaky, setCollaborationConnectionFlaky] = useState(false);
  const [hasEstablishedCollaboration, setHasEstablishedCollaboration] = useState(false);
  const [transientCanvasMotionSupported, setTransientCanvasMotionSupported] = useState(false);
  const remoteGraphConflictsRef = useRef(new Set());
  const deletedGraphsRef = useRef(new Set());
  const noteEditConflictToastRef = useRef(new Set());
  const [socketReadyRevision, setSocketReadyRevision] = useState(0);
  const socketReadyRevisionRef = useRef(socketReadyRevision);
  socketReadyRevisionRef.current = socketReadyRevision;
  const [liveSyncRevision, setLiveSyncRevision] = useState(0);
  const [localAccountUsername, setLocalAccountUsername] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [studioVersion, setStudioVersion] = useState(studioPackage.version);
  const [studioServerVersion, setStudioServerVersion] = useState('');
  const currentUpdateChannel = desktopMode
    ? desktopReleaseChannel
    : /-(?:alpha|beta|rc|nightly)(?:[.-]|$)/i.test(studioServerVersion || studioVersion) ? 'nightly' : 'stable';
  const [isReady, setIsReady] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [hasThemeChoice, setHasThemeChoice] = useState(hasSavedThemeChoice);
  const [settings, setSettings] = useState(() => readStoredJson('arc_editor_settings', { ...DEFAULT_SETTINGS, uiSounds: desktopMode }));
  const uiScale = ['80', '90', '100', '110', '120', '130', '140'].includes(String(settings.uiScale)) ? String(settings.uiScale) : '100';
  const fontScale = ['80', '90', '100', '110', '120', '130', '140'].includes(String(settings.fontScale)) ? String(settings.fontScale) : '100';
  useEffect(() => {
    document.documentElement.style.setProperty('--arc-font-scale', String(Number(fontScale) / 100));
  }, [fontScale]);
  const [isLocked, setIsLocked] = useState(() => {
    try { return readAppStorage('arc_ui_locked') === 'true'; }
    catch { return false; }
  });
  const [isUserMgmtOpen, setIsUserMgmtOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [consoleOpenRequest, setConsoleOpenRequest] = useState(0);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectStarters, setProjectStarters] = useState([]);
  const [projectUsers, setProjectUsers] = useState({});
  const [projectLastSeen, setProjectLastSeen] = useState({});
  const [maxProjects, setMaxProjects] = useState(() => localDesktopWorkspace ? null : 10);
  useEffect(() => { if (localDesktopWorkspace) setMaxProjects(null); }, [localDesktopWorkspace]);
  const [projectSearch, setProjectSearch] = useState('');
  const projectQuery = projectSearch.trim().toLowerCase();
  const filteredProjects = projectQuery
    ? projects.filter((project) => String(project.name || '').toLowerCase().includes(projectQuery))
    : projects;
  const [needsProjectOnboarding, setNeedsProjectOnboarding] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState('');
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const startupProjectHandledRef = useRef(false);
  const projectVariablesSaveRef = useRef({ timer: null, revision: 0 });
  const [savingProjectVariables, setSavingProjectVariables] = useState(false);
  const [projectVariables, setProjectVariables] = useState([]);
  const [disabledBuiltInVariables, setDisabledBuiltInVariables] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectNameInvalid, setProjectNameInvalid] = useState(false);
  const [projectNameShakeKey, setProjectNameShakeKey] = useState(0);
  const [projectError, setProjectError] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);
  const [exportInProgress, setExportInProgress] = useState(false);
  const [exportReview, setExportReview] = useState(null);
  const [exportReviewSections, setExportReviewSections] = useState({});
  const exportInFlightRef = useRef(false);
  useEffect(() => {
    if (desktopMode) return undefined;
    const handleBrowserContextMenu = (event) => {
      if (event.altKey) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
    };
    document.addEventListener('contextmenu', handleBrowserContextMenu, true);
    return () => document.removeEventListener('contextmenu', handleBrowserContextMenu, true);
  }, [desktopMode]);
  const [projectMenu, setProjectMenu] = useState(null);
  const [projectDelete, setProjectDelete] = useState(null);
  const [projectDeleteName, setProjectDeleteName] = useState('');
  const [projectDeleteError, setProjectDeleteError] = useState('');
  const [projectDeletePromptError, setProjectDeletePromptError] = useState('');
  const [projectDeleteFieldShake, setProjectDeleteFieldShake] = useState(false);
  const projectDeleteInputRef = useRef(null);
  const projectDeleteFeedbackTimerRef = useRef(null);
  const projectDeleteShakeTimerRef = useRef(null);
  const [projectImportFile, setProjectImportFile] = useState(null);
  const projectImportPathRef = useRef(null);
  const [openedProjectFiles, setOpenedProjectFiles] = useState([]);
  const [desktopFileImportBusy, setDesktopFileImportBusy] = useState(false);
  const desktopGraphImportHandlerRef = useRef(null);
  const [projectImportTrusted, setProjectImportTrusted] = useState(false);
  const [projectImportEncrypted, setProjectImportEncrypted] = useState(false);
  const [projectImportPassword, setProjectImportPassword] = useState('');
  const [projectImportSharingWarning, setProjectImportSharingWarning] = useState(null);
  const [projectImportSharingApproved, setProjectImportSharingApproved] = useState(false);
  const [projectImportError, setProjectImportError] = useState('');
  const [projectImportCompatibility, setProjectImportCompatibility] = useState(null);
  const [projectImportOldVersionApproved, setProjectImportOldVersionApproved] = useState(false);
  const [projectTemplateDialog, setProjectTemplateDialog] = useState(false);
  const [newProjectTemplate, setNewProjectTemplate] = useState('ticket');
  const [projectNameManuallyEdited, setProjectNameManuallyEdited] = useState(false);
  const [isPluginStoreOpen, setIsPluginStoreOpen] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const installedPluginsRef = useRef([]);
  const [isBotSettingsOpen, setIsBotSettingsOpen] = useState(false);
  const [isBotSidebarOpen, setIsBotSidebarOpen] = useState(false);
  const [commandBrowserRequest, setCommandBrowserRequest] = useState(0);
  const [isVariablesOpen, setIsVariablesOpen] = useState(false);
  const [variableScope, setVariableScope] = useState('project');
  const [paletteNodePosition, setPaletteNodePosition] = useState(null);
  const viewportCenterRef = useRef({ x: 0, y: 0 });
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [librarySection, setLibrarySection] = useState('graphs');
  const [sidebarWidths, setSidebarWidths] = useState(readSidebarWidths);
  const [nameDialog, setNameDialog] = useState(null);
  const [nameDialogError, setNameDialogError] = useState('');
  const [nodeRenameDialog, setNodeRenameDialog] = useState(null);
  const [nodeRenameValue, setNodeRenameValue] = useState('');
  const [tagGroupDialog, setTagGroupDialog] = useState(null);
  const [tagGroupName, setTagGroupName] = useState('');
  const [tagGroupColor, setTagGroupColor] = useState(TAG_GROUP_COLORS[0].value);
  const [tagGroupNodeIds, setTagGroupNodeIds] = useState([]);
  const [tagGroupNoteIds, setTagGroupNoteIds] = useState([]);
  const [tagGroupSearch, setTagGroupSearch] = useState('');
  const [tagGroupError, setTagGroupError] = useState('');
  const [closeGraphDialog, setCloseGraphDialog] = useState(null);
  const [recoveryLoadedKey, setRecoveryLoadedKey] = useState('');
  const recoveryDraftsRef = useRef([]);
  const [gatewayIntentConfirm, setGatewayIntentConfirm] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [botStatus, setBotStatus] = useState('DISCONNECTED');
  const [botMetrics, setBotMetrics] = useState({ latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
  const [discordAuthWarning, setDiscordAuthWarning] = useState(null);
  const botStartPendingRef = useRef(false);
  const rateLimitAnnouncedUntilRef = useRef(0);
  const [gatewayStartedRequest, setGatewayStartedRequest] = useState(0);
  const [botProfile, setBotProfile] = useState(null);
  const [appEmojis, setAppEmojis] = useState([]);
  const [appEmojisLoading, setAppEmojisLoading] = useState(false);
  const [appEmojisCachedAt, setAppEmojisCachedAt] = useState(0);
  const emojiCacheStorageKey = `arc_bot_emojis:${workspaceMode}:${activeProjectId}:${botProfile?.application?.id || 'no-app'}`;
  const handleAppEmojisChange = useCallback((emojis) => {
    const list = Array.isArray(emojis) ? emojis : [];
    const cachedAt = Date.now();
    setAppEmojis(list);
    setAppEmojisCachedAt(cachedAt);
    writeAppStorage(emojiCacheStorageKey, JSON.stringify({ cachedAt, emojis: list }));
  }, [emojiCacheStorageKey]);
  const [tabs, setTabs] = useState([]);
  const projectTabSyncRef = useRef({ projectId: '', socketRevision: -1, graphIds: [] });
  const projectTabStartupPendingRef = useRef(!localDesktopWorkspace);
  const projectTabStartupBaselineRef = useRef(new Set());
  const projectTabSafeRestorePendingRef = useRef(!localDesktopWorkspace);
  const projectTabSafeRestoreProjectRef = useRef('');
  const remoteProjectTabGraphsRef = useRef(new Map());
  const unsharedProjectTabIdsRef = useRef(new Set());
  const remoteTabCloseNoticeRef = useRef(new Set());
  const initialGraphStatesRef = useRef(new Map());
  const [savedGraphs, setSavedGraphs] = useState([]);
  useEffect(() => {
    const openIds = new Set(tabs.map((tab) => tab.id));
    for (const id of initialGraphStatesRef.current.keys()) if (!openIds.has(id)) initialGraphStatesRef.current.delete(id);
    for (const tab of tabs) if (!initialGraphStatesRef.current.has(tab.id)) initialGraphStatesRef.current.set(tab.id, snapshotGraph(tab));
  }, [tabs]);
  const savedGraphsRef = useRef(savedGraphs);
  savedGraphsRef.current = savedGraphs;
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [graphTemplates, setGraphTemplates] = useState([]);
  const [graphSnapshots, setGraphSnapshots] = useState([]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const liveGraphBaseRef = useRef(new Map());
  const reconnectGraphBaseRef = useRef(new Map());
  const liveGraphRevisionRef = useRef(new Map());
  const lastLiveGraphSentRef = useRef(new Map());
  const pendingLiveGraphRef = useRef(new Map());
  const liveGraphSendTimersRef = useRef(new Map());
  const rejectedLiveGraphToastRef = useRef(new Set());
  const liveGraphReadyRef = useRef(new Set());
  const autoSaveInFlightRef = useRef(new Set());
  const collaborationClientIdRef = useRef(globalThis.crypto?.randomUUID?.() || `arc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const graphSaveClientIdRef = useRef(globalThis.crypto?.randomUUID?.() || `arc-save-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const collaborationActionTimerRef = useRef(null);
  const collaborationMotionSendIntervalRef = useRef(16);
  const pendingCollaborationActionRef = useRef(new Map());
  const latestRemoteCollaborationRevisionRef = useRef(new Map());
  const pendingCanvasArrowActionsRef = useRef(new Map());
  const pendingGraphChatMovesRef = useRef(new Map());
  const localCanvasMotionRoomRef = useRef('');
  const collaborationPresenceRef = useRef({ projectId: '', graphId: '' });
  const errorPulseUntilRef = useRef(new Map());
  const autoSnapshotInFlightRef = useRef(false);
  useEffect(() => {
    if (!desktopMode) return undefined;
    const queue = window.__ARC_STUDIO_OPEN_FILES__;
    if (Array.isArray(queue) && queue.length) {
      setOpenedProjectFiles((current) => [...new Set([...current, ...queue.filter((path) => typeof path === 'string')])]);
      window.__ARC_STUDIO_OPEN_FILES__ = [];
    }
    const onFileOpened = (event) => {
      if (typeof event.detail === 'string') {
        const queuedIndex = window.__ARC_STUDIO_OPEN_FILES__?.indexOf(event.detail) ?? -1;
        if (queuedIndex >= 0) window.__ARC_STUDIO_OPEN_FILES__.splice(queuedIndex, 1);
        setOpenedProjectFiles((current) => current.includes(event.detail) || projectImportPathRef.current === event.detail ? current : [...current, event.detail]);
      }
    };
    window.addEventListener('arc:desktop-file-opened', onFileOpened);
    return () => window.removeEventListener('arc:desktop-file-opened', onFileOpened);
  }, [desktopMode]);
  useEffect(() => {
    if (!desktopMode || projectImportFile || desktopFileImportBusy || !openedProjectFiles.length) return;
    const [path, ...remaining] = openedProjectFiles;
    setOpenedProjectFiles(remaining);
    const normalizedPath = String(path).replace(/\\/g, '/');
    const name = normalizedPath.split('/').pop() || 'project.arcproject';
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith('.arcgraph') || lowerName.endsWith('.arc.json')) {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') {
        arcEvents.emit('toast:notify', { title: 'Open failed', message: 'ARC Studio could not read this graph file.', type: 'error' });
        return;
      }
      setDesktopFileImportBusy(true);
      invoke('read_arc_graph_file', { path })
        .then((contents) => desktopGraphImportHandlerRef.current?.({ name, text: async () => contents }))
        .catch((error) => arcEvents.emit('toast:notify', { title: 'Open failed', message: error.message || 'Could not read this graph file.', type: 'error' }))
        .finally(() => setDesktopFileImportBusy(false));
      return;
    }
    if (!lowerName.endsWith('.arcproject')) {
      arcEvents.emit('toast:notify', { title: 'Unsupported file', message: 'Choose an .arcgraph file or .arcproject file.', type: 'error' });
      return;
    }
    projectImportPathRef.current = path;
    setProjectImportSharingWarning(null);
    setProjectImportSharingApproved(false);
    setProjectImportFile({ name, path, text: async () => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') throw new Error('ARC Studio could not open this project file.');
      return invoke('read_arc_project_file', { path });
    } });
    setProjectImportTrusted(false);
    setProjectImportError('');
    setProjectImportCompatibility(null);
    setProjectImportOldVersionApproved(false);
  }, [desktopFileImportBusy, desktopMode, openedProjectFiles, projectImportFile]);
  useEffect(() => {
    let active = true;
    setProjectImportEncrypted(false);
    setProjectImportPassword('');
    setProjectImportSharingWarning(null);
    setProjectImportSharingApproved(false);
    if (!projectImportFile?.text) return undefined;
    Promise.resolve(projectImportFile.text()).then((text) => {
      const parsed = JSON.parse(text);
      if (!active) return;
      const encrypted = parsed?.format === 'arc-project-encrypted';
      setProjectImportEncrypted(encrypted);
      if (!encrypted && externalCollaborativeWorkspace && hasImportableTextContent(parsed)) {
        setProjectImportSharingWarning({ workspaceName: externalWorkspaceName });
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [externalCollaborativeWorkspace, externalWorkspaceName, projectImportFile]);
  useEffect(() => {
    let active = true;
    let probeInFlight = false;
    let confirmedOffline = false;
    let probeGeneration = 0;
    const updateNetworkState = async () => {
      if (navigator.onLine !== false) {
        probeGeneration += 1;
        confirmedOffline = false;
        setNetworkOnline(true);
        return;
      }
      setNetworkOnline(false);
      if (localDesktopWorkspace || probeInFlight || confirmedOffline) return;
      probeInFlight = true;
      const generation = ++probeGeneration;
      const reachable = await probeInternetConnectivity();
      probeInFlight = false;
      if (!active) return;
      if (generation !== probeGeneration) {
        if (navigator.onLine === false) void updateNetworkState();
        return;
      }
      if (reachable) {
        setNetworkOnline(true);
        return;
      }
      confirmedOffline = true;
      setNetworkOnline(false);
      {
        const socket = wsRef.current;
        if (socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) socket.close(4000, 'Network unavailable');
      }
      arcEvents.emit('toast:notify', {
        id: 'arc-offline-signout',
        title: 'Signed out',
        message: 'ARC Studio could not reach the internet. Sign in again when your connection is restored.',
        type: 'warning',
        duration: 6000
      });
      forceSignOutRef.current?.();
    };
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    void updateNetworkState();
    return () => {
      active = false;
      probeGeneration += 1;
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
    };
  }, [localDesktopWorkspace]);

  useEffect(() => {
    if (settings.autoUpdateChecks === false) { setServerUpdate(null); return undefined; }
    if (desktopMode && workspaceMode === 'local') { setServerUpdate(null); return undefined; }
    if (!networkOnline || !studioServerVersion) return undefined;
    let active = true;
    const checkForServerUpdate = async () => {
      try {
        const endpoint = currentUpdateChannel === 'nightly'
          ? 'https://api.github.com/repos/relentiousdragon/arc-studio/releases?per_page=100'
          : 'https://api.github.com/repos/relentiousdragon/arc-studio/releases/latest';
        const response = await fetch(endpoint, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const releases = Array.isArray(data) ? data : [data];
        const release = releases.filter((item) => !item.draft && (currentUpdateChannel === 'nightly' ? item.prerelease === true : item.prerelease !== true) && compareArcVersions(item.tag_name, studioServerVersion) === 1)
          .sort((left, right) => compareArcVersions(right.tag_name, left.tag_name) || 0)[0];
        if (!active) return;
        if (!release) { setServerUpdate(null); return; }
        const version = String(release.tag_name || '').replace(/^v/i, '');
        setServerUpdate({
          version,
          url: release.html_url || `https://github.com/relentiousdragon/arc-studio/releases/tag/v${encodeURIComponent(version)}`,
          title: release.name || `ARC Studio Server ${version}`,
          kind: classifyArcUpdate(version, studioServerVersion)
        });
      } catch {}
    };
    checkForServerUpdate();
    const interval = window.setInterval(checkForServerUpdate, 6 * 60 * 60 * 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [currentUpdateChannel, desktopMode, networkOnline, settings.autoUpdateChecks, studioServerVersion, workspaceMode]);

  useEffect(() => {
    if (!desktopMode) return;
    window.__TAURI_INTERNALS__?.invoke?.('mark_update_healthy').catch((error) => console.warn('Could not confirm ARC Studio started after its update:', error));
  }, [desktopMode]);

  useEffect(() => {
    if (!desktopMode) {
      setAppUpdate(null);
      return undefined;
    }
    let active = true;
    const checkForDesktopUpdate = async () => {
      try {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;
        if (!active) return;
        const staged = await invoke('get_staged_update_status', { channel: desktopReleaseChannel });
        if (!active) return;
        if (!startupStagedUpdateCheckedRef.current) {
          startupStagedUpdateCheckedRef.current = true;
          autoInstallStagedUpdateOnLaunchRef.current = desktopReleaseChannel === 'stable' && Boolean(staged?.staged);
        }
        if (staged?.staged) {
          setAppUpdate(null);
          setDownloadedUpdateReady({ version: staged.version });
          return;
        }
        setDownloadedUpdateReady(null);
        if (settings.autoUpdateChecks === false || !networkOnline) {
          setAppUpdate(null);
          return;
        }
        const metadata = await invoke('check_channel_update', { channel: desktopReleaseChannel });
        const { Update } = await import('@tauri-apps/plugin-updater');
        const update = metadata ? new Update(metadata) : null;
        if (!active) { await update?.close(); return; }
        const previous = updateRef.current;
        updateRef.current = update;
        if (previous && previous !== update) await previous.close().catch(() => {});
        if (!update) { setAppUpdate(null); return; }
        const version = String(update.version || '').replace(/^v/i, '');
        setAppUpdate({
          native: true,
          version,
          title: `ARC Studio ${version}`,
          notes: String(update.body || '').slice(0, 6000),
          kind: classifyArcUpdate(version, update.currentVersion || studioVersion),
          url: `https://github.com/relentiousdragon/arc-studio/releases/tag/v${encodeURIComponent(version)}`
        });
      } catch (error) {
        if (active) console.warn('ARC Studio update check failed:', error);
      }
    };
    checkForDesktopUpdate();
    const interval = window.setInterval(checkForDesktopUpdate, 6 * 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
      const update = updateRef.current;
      updateRef.current = null;
      update?.close().catch(() => {});
    };
  }, [desktopMode, networkOnline, settings.autoUpdateChecks, studioVersion, desktopReleaseChannel]);

  useEffect(() => {
    const detected = appUpdate?.version
      ? { version: appUpdate.version, title: appUpdate.title, url: appUpdate.url, notes: appUpdate.notes, kind: 'install' }
      : null;
    if (!desktopMode || !detected) return undefined;
    if (desktopReleaseChannel === 'stable') {
      setUpdateNotice(null);
      return undefined;
    }

    const noticeKey = `arc_seen_update_notice_${desktopReleaseChannel}_${detected.version}`;
    try {
      if (localStorage.getItem(noticeKey)) return undefined;
      localStorage.setItem(noticeKey, '1');
      const seenKey = 'arc_seen_release_notes_versions';
      const stored = JSON.parse(localStorage.getItem(seenKey) || '[]');
      const seenVersions = Array.isArray(stored) ? stored.filter((version) => typeof version === 'string') : [];
      if (!seenVersions.includes(detected.version)) seenVersions.push(detected.version);
      if (studioVersion && !seenVersions.includes(studioVersion)) seenVersions.push(studioVersion);
      localStorage.setItem(seenKey, JSON.stringify(seenVersions.slice(-100)));
    } catch {}

    setReleaseNotesNotice(null);
    setUpdateNotice({ ...detected, notes: detected.notes || 'Loading release notes…' });
    if (detected.notes) return undefined;

    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetch(apiUrl(`/api/release-notes/${encodeURIComponent(detected.version)}`), { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Release notes request failed (${response.status}).`)))
      .then((release) => {
        if (active) setUpdateNotice((current) => current?.version === detected.version ? { ...current, title: release.title || current.title, notes: String(release.notes || '').trim() || 'This update does not include release notes.', url: release.url || current.url } : current);
      })
      .catch(() => {
        if (active) setUpdateNotice((current) => current?.version === detected.version ? { ...current, notes: 'Release notes could not be loaded. You can read them on the ARC Studio release page.' } : current);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [appUpdate?.notes, appUpdate?.title, appUpdate?.url, appUpdate?.version, desktopMode, desktopReleaseChannel]);

  useEffect(() => {
    if (!settings.uiSounds) return undefined;
    const playControl = (target) => {
      const control = target.closest?.('button, [role="button"], [role="tab"], [role="option"], [role="checkbox"], [role="switch"], input[type="checkbox"], input[type="radio"], a[href]');
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true' || control.dataset.sound === 'off') return;
      unlockUiSounds();
      playUiSound('click');
    };
    const onPointerDown = (event) => playControl(event.target);
    const onKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') playControl(event.target);
    };
    const stopToastSound = arcEvents.on('toast:notify', (toast) => playUiSound(toast?.type || 'info'));
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      stopToastSound();
    };
  }, [settings.uiSounds]);
  useEffect(() => {
    if (botStatus === 'ONLINE' && botStartPendingRef.current) {
      botStartPendingRef.current = false;
      setGatewayStartedRequest((request) => request + 1);
      arcEvents.emit('toast:notify', { title: 'Bot started', message: 'The gateway is connected and ready.', type: 'success' });
    }
    if (botStatus === 'ERROR') botStartPendingRef.current = false;
  }, [botStatus]);
  useEffect(() => {
    if (!saveFeedback) return undefined;
    const timeout = window.setTimeout(() => setSaveFeedback(null), 1500);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback]);
  const [nodePrefabs, setNodePrefabs] = useState(() => {
    try { const saved = readAppStorage('arc_node_prefabs'); const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  });
  const [embedAssets, setEmbedAssets] = useState([]);
  const [embedStudio, setEmbedStudioState] = useState(null);
  const embedStudioRef = useRef(null);
  const embedStudioHistoryRef = useRef(new Map());
  const snapshotEmbedStudio = (studio) => structuredClone({
    name: studio?.name || '',
    content: studio?.content || '',
    blocks: studio?.blocks || [],
    components: studio?.components || [],
    componentsV2Layout: studio?.componentsV2Layout || [],
    componentsV2Enabled: Boolean(studio?.componentsV2Enabled),
    attachments: studio?.attachments || []
  });
  const recordEmbedStudioHistory = (studio) => {
    if (!studio?.collabId) return;
    let history = embedStudioHistoryRef.current.get(studio.collabId);
    if (!history) {
      history = { past: [], future: [], lastAt: 0 };
      embedStudioHistoryRef.current.set(studio.collabId, history);
    }
    const now = Date.now();
    if (now - history.lastAt > 500) {
      history.past.push(snapshotEmbedStudio(studio));
      if (history.past.length > 100) history.past.shift();
    }
    history.future = [];
    history.lastAt = now;
    setHistoryRevision((revision) => revision + 1);
  };
  const setEmbedStudio = useCallback((update) => {
    const current = embedStudioRef.current;
    const next = typeof update === 'function' ? update(current) : update;
    if (next?.collabId && next.collabId !== current?.collabId) {
      embedStudioHistoryRef.current.set(next.collabId, { past: [], future: [], lastAt: 0 });
    }
    embedStudioRef.current = next;
    setEmbedStudioState(next);
  }, []);
  const saveEmbedShortcutRef = useRef(null);
  const collaborativeEmbedBaseRef = useRef(new Map());
  const [discordTextStudio, setDiscordTextStudio] = useState(null);
  const textCollaborationRef = useRef(new Map());
  const [permissionStudio, setPermissionStudio] = useState(null);
  const [slashCommandStudio, setSlashCommandStudioState] = useState(null);
  const slashCommandStudioRef = useRef(null);
  const slashCommandStudioHistoryRef = useRef(new Map());
  const recordSlashCommandStudioHistory = (studio, force = false) => {
    if (!studio?.collabId) return;
    let history = slashCommandStudioHistoryRef.current.get(studio.collabId);
    if (!history) {
      history = { past: [], future: [], lastAt: 0 };
      slashCommandStudioHistoryRef.current.set(studio.collabId, history);
    }
    const now = Date.now();
    if (force || now - history.lastAt > 500) {
      history.past.push(structuredClone(Array.isArray(studio.options) ? studio.options : []));
      if (history.past.length > 100) history.past.shift();
    }
    history.future = [];
    history.lastAt = now;
    setHistoryRevision((revision) => revision + 1);
  };
  const setSlashCommandStudio = useCallback((update) => {
    const current = slashCommandStudioRef.current;
    const next = typeof update === 'function' ? update(current) : update;
    if (next?.collabId && next.collabId !== current?.collabId) {
      slashCommandStudioHistoryRef.current.set(next.collabId, { past: [], future: [], lastAt: 0 });
    }
    slashCommandStudioRef.current = next;
    setSlashCommandStudioState(next);
  }, []);
  const [modalStudio, setModalStudio] = useState(null);
  const studioFocusReturnRef = useRef(null);
  const studioWasOpenRef = useRef(false);
  const slashCommandBaseRef = useRef(new Map());
  const [graphUploadProgress, setGraphUploadProgress] = useState(null);
  const [savingGraphIds, setSavingGraphIds] = useState([]);
  const [nodePrefabDialog, setNodePrefabDialog] = useState(null);
  const [nodePrefabError, setNodePrefabError] = useState('');
  const [defaultGraphId, setDefaultGraphId] = useState('tab_slash_help');
  const [activeTabId, setActiveTabId] = useState(null);
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState('');
  const [selectedCanvasNodeCount, setSelectedCanvasNodeCount] = useState(0);
  const [activeNodes, setActiveNodes] = useState([]);
  const [activeConnections, setActiveConnections] = useState([]);
  const [activePulseNodeIds, setActivePulseNodeIds] = useState([]);
  const [activePulseGraphId, setActivePulseGraphId] = useState(null);
  const [nodeFocusRequest, setNodeFocusRequest] = useState(null);
  const followCollaborator = (userId, graphId) => {
    if (!userId || !graphId) return;
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setActiveTabId(graphId);
    rememberUserGraph(graphId);
    setFollowCollaboratorRequest({ userId, graphId, requestId });
    window.setTimeout(() => setFollowCollaboratorRequest((current) => current?.requestId === requestId ? null : current), 5000);
  };
  const completeFollowCollaborator = useCallback((requestId) => setFollowCollaboratorRequest((current) => current?.requestId === requestId ? null : current), []);
  const handleCanvasNodeSelect = useCallback((nodeId) => setSelectedCanvasNodeId(nodeId || ''), []);
  useEffect(() => { setSelectedCanvasNodeId(''); setSelectedCanvasNodeCount(0); }, [activeTabId]);
  const traceRequestIdRef = useRef(0);
  const [activeDebugStep, setActiveDebugStep] = useState(null);
  const [logs, setLogs] = useState([]);
  const wsRef = useRef(null);
  const sendCollaborationAction = useCallback((action, immediate = false) => {
    if (tabsRef.current.find((tab) => tab.id === activeTabId)?.localRecoveryOnly) return;
    const activeSocket = wsRef.current;
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    const entry = { action, projectId: activeProjectId, graphId: activeTabId };
    const actionKey = `${activeProjectId}:${activeTabId}:${action.kind}:${action.studioId || ''}`;
    pendingCollaborationActionRef.current.set(actionKey, entry);
    const roomKey = `${entry.projectId}:${entry.graphId}`;
    if (transientCanvasMotionSupported && (action.kind === 'node-drag' || action.kind === 'note-drag')) {
      localCanvasMotionRoomRef.current = roomKey;
      const graphKey = roomKey;
      const timer = liveGraphSendTimersRef.current.get(graphKey);
      if (timer) { window.clearTimeout(timer); liveGraphSendTimersRef.current.delete(graphKey); }
    }
    else if (localCanvasMotionRoomRef.current === roomKey && ['cursor', 'selection', 'idle'].includes(action.kind)) {
      localCanvasMotionRoomRef.current = '';
      setLiveSyncRevision((revision) => revision + 1);
    }
    const flush = () => {
      collaborationActionTimerRef.current = null;
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 16 * 1024) {
        collaborationActionTimerRef.current = window.setTimeout(flush, 16);
        return;
      }
      const pending = [...pendingCollaborationActionRef.current.values()];
      pendingCollaborationActionRef.current.clear();
      let flushedMotionCommit = false;
      for (const entry of pending) if (entry.projectId && entry.graphId) {
        socket.send(JSON.stringify({ type: 'COLLAB_ACTION', projectId: entry.projectId, graphId: entry.graphId, action: entry.action }));
        if (Array.isArray(entry.action.nodePositions) || Array.isArray(entry.action.notePositions)) flushedMotionCommit = true;
      }
      if (flushedMotionCommit) setLiveSyncRevision((revision) => revision + 1);
    };
    if (immediate || action.kind === 'idle') {
      window.clearTimeout(collaborationActionTimerRef.current);
      flush();
    } else if (!collaborationActionTimerRef.current) {
      const motionAction = ['node-drag', 'note-drag', 'wire-drag', 'arrow-drag'].includes(action.kind);
      collaborationActionTimerRef.current = window.setTimeout(flush, motionAction ? collaborationMotionSendIntervalRef.current : 16);
    }
  }, [activeProjectId, activeTabId, transientCanvasMotionSupported]);
  const sendGraphChatMessage = useCallback((content, position) => {
    const socket = wsRef.current;
    if (localDesktopWorkspace || !activeProjectId || !activeTabId || !liveGraphReadyRef.current.has(`${activeProjectId}:${activeTabId}`)
      || !socket || socket.readyState !== WebSocket.OPEN) return false;
    const now = Date.now();
    const clientActionId = globalThis.crypto?.randomUUID?.() || `chat-${now}-${Math.random().toString(36).slice(2)}`;
    const cleanContent = Array.from(String(content || '').trim()).slice(0, 280).join('');
    if (!cleanContent || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return false;
    const length = Array.from(cleanContent).length;
    const stayMs = Math.min(20_000, 5_000 + Math.ceil((length / 280) * 15_000));
    const fadeMs = Math.min(2_000, 500 + Math.ceil((length / 280) * 1_500));
    setGraphChatBubbles((previous) => [...previous.filter((bubble) => bubble.expiresAt > now), {
      id: `local:${clientActionId}`, clientActionId, projectId: activeProjectId, graphId: activeTabId,
      userId: currentUser?.id || '', username: currentUser?.username || 'You', color: getLocalCollaboratorColor(currentUser?.id),
      content: cleanContent, x: position.x, y: position.y, createdAt: now, stayMs, fadeMs, expiresAt: now + stayMs + fadeMs
    }]);
    socket.send(JSON.stringify({ type: 'GRAPH_CHAT_SEND', projectId: activeProjectId, graphId: activeTabId, payload: { content: cleanContent, position, clientActionId } }));
    return true;
  }, [activeProjectId, activeTabId, currentUser, localDesktopWorkspace]);
  const sendCanvasArrowAction = useCallback((operation, payload) => {
    const socket = wsRef.current;
    if (!activeProjectId || !activeTabId || !liveGraphReadyRef.current.has(`${activeProjectId}:${activeTabId}`)
      || !socket || socket.readyState !== WebSocket.OPEN) return false;
    let actionPayload = { operation, ...payload };
    if (operation === 'create') {
      actionPayload.clientActionId ||= globalThis.crypto?.randomUUID?.() || `arrow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } else if (operation === 'move') {
      const clientActionId = globalThis.crypto?.randomUUID?.() || `arrow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      actionPayload.clientActionId = clientActionId;
      if (payload?.id) pendingCanvasArrowActionsRef.current.set(payload.id, clientActionId);
      setTransientCanvasArrows((previous) => previous.map((arrow) => arrow.id === payload?.id
        ? { ...arrow, start: payload.start, end: payload.end, clientActionId } : arrow));
    } else if (operation === 'move-many' && Array.isArray(payload?.arrows)) {
      actionPayload.arrows = payload.arrows.map((move) => {
        const clientActionId = globalThis.crypto?.randomUUID?.() || `arrow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (move?.id) pendingCanvasArrowActionsRef.current.set(move.id, clientActionId);
        return { ...move, clientActionId };
      });
      const moves = new Map(actionPayload.arrows.map((move) => [move.id, move]));
      setTransientCanvasArrows((previous) => previous.map((arrow) => moves.has(arrow.id)
        ? { ...arrow, ...moves.get(arrow.id) } : arrow));
    }
    socket.send(JSON.stringify({ type: 'CANVAS_ARROW_ACTION', projectId: activeProjectId, graphId: activeTabId, payload: actionPayload }));
    return true;
  }, [activeProjectId, activeTabId]);
  const moveGraphChatBubble = useCallback((id, position) => {
    const socket = wsRef.current;
    if (localDesktopWorkspace || !id || !activeProjectId || !activeTabId || !socket || socket.readyState !== WebSocket.OPEN) return;
    const clientActionId = globalThis.crypto?.randomUUID?.() || `chat-move-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingGraphChatMovesRef.current.set(id, clientActionId);
    setGraphChatBubbles((previous) => previous.map((bubble) => bubble.id === id
      ? { ...bubble, x: position.x, y: position.y, clientActionId } : bubble));
    socket.send(JSON.stringify({ type: 'GRAPH_CHAT_MOVE', projectId: activeProjectId, graphId: activeTabId, payload: { id, position, clientActionId } }));
  }, [activeProjectId, activeTabId, localDesktopWorkspace]);
  const requestNoteEditLock = useCallback((noteId) => {
    const socket = wsRef.current;
    if (!noteId || !activeProjectId || !activeTabId || !liveGraphReadyRef.current.has(`${activeProjectId}:${activeTabId}`)
      || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'NOTE_EDIT_LOCK_REQUEST', projectId: activeProjectId, graphId: activeTabId, noteId, clientId: collaborationClientIdRef.current }));
  }, [activeProjectId, activeTabId]);
  const releaseNoteEditLock = useCallback((noteId) => {
    const socket = wsRef.current;
    if (!noteId || !activeProjectId || !activeTabId || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'NOTE_EDIT_LOCK_RELEASE', projectId: activeProjectId, graphId: activeTabId, noteId, clientId: collaborationClientIdRef.current }));
  }, [activeProjectId, activeTabId]);
  useEffect(() => {
    setRemoteCollaborationActions([]);
    setTransientCanvasArrows([]);
    return () => sendCollaborationAction({ kind: 'idle' }, true);
  }, [activeProjectId, activeTabId, sendCollaborationAction]);
  const loadingBarTimerRef = useRef(null);
  const graphCheckToastAtRef = useRef(0);
  const graphsHydratedRef = useRef(false);
  const discordRpcRequestRef = useRef(null);
  const discordRpcRevisionRef = useRef(0);
  const discordRpcInFlightRef = useRef(false);
  const historyRef = useRef(new Map());
  const historyGroupRef = useRef(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const activeGraph = tabs.find((tab) => tab.id === activeTabId);
  const canWriteGraphs = Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'));
  const activeGraphSyncReady = tabs.length
    ? Boolean(activeTabId && activeGraph && (activeGraph.localRecoveryOnly || liveGraphReadyRef.current.has(`${activeProjectId}:${activeTabId}`)))
    : !activeTabId;
  const activeGraphIsLocalRecovery = Boolean(activeGraph?.localRecoveryOnly);
  const remoteWorkspaceStateReady = localDesktopWorkspace || Boolean(
    networkOnline
    && collaborationSocketStatus === 'connected'
    && graphsHydratedRef.current
    && (!activeProjectId || projectCollaboration.projectId === activeProjectId && projectCollaboration.tabsInitialized)
    && activeGraphSyncReady
  );
  const remoteWorkspaceBlocked = Boolean(
    authToken && currentUser && !localDesktopWorkspace
    && hasEstablishedCollaboration && !remoteWorkspaceStateReady
  );
  useEffect(() => {
    if (remoteWorkspaceStateReady) setHasEstablishedCollaboration(true);
  }, [remoteWorkspaceStateReady]);
  const graphVariables = useMemo(() => {
    const savedVariables = Array.isArray(activeGraph?.variables) ? activeGraph.variables : [];
    const graphNodes = activeGraph?.nodes || [];
    const graphConnections = activeGraph?.connections || [];
    const validVariableName = (name) => /^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name);
    const defaultValue = (type) => type === 'number' ? 0 : type === 'boolean' ? false : type === 'array' ? [] : type === 'object' ? {} : '';
    const resolveVariableType = (variableNode, seen = new Set()) => {
      if (!variableNode || seen.has(variableNode.id)) return null;
      const nextSeen = new Set(seen).add(variableNode.id);
      if (variableNode.type === 'variable_create') {
        const valueWire = graphConnections.find((item) => item.targetNodeId === variableNode.id && item.targetPinId === 'value');
        return valueWire ? resolveNodeType(valueWire.sourceNodeId, valueWire.sourcePinId, nextSeen) : variableNode.data?.valueType || 'string';
      }
      const referenceWire = graphConnections.find((item) => item.targetNodeId === variableNode.id && item.targetPinId === 'variable');
      if (referenceWire) {
        const referenceNode = graphNodes.find((item) => item.id === referenceWire.sourceNodeId);
        if (referenceNode && ['variable_create', 'variable_get', 'variable_set'].includes(referenceNode.type)) return resolveVariableType(referenceNode, nextSeen);
      }
      const saved = savedVariables.find((item) => item.id === variableNode.data?.variableId);
      if (saved) return saved.type || null;
      const created = graphNodes.find((item) => item.type === 'variable_create' && `nodevar_${item.id}` === variableNode.data?.variableId);
      return created ? resolveVariableType(created, nextSeen) : null;
    };
    const resolveNodeType = (sourceNodeId, sourcePinId, seen = new Set()) => {
      const key = `${sourceNodeId}:${sourcePinId}`;
      if (seen.has(key)) return null;
      const nextSeen = new Set(seen).add(key);
      const source = graphNodes.find((item) => item.id === sourceNodeId);
      if (!source) return null;
      if (['variable_create', 'variable_get', 'variable_set'].includes(source.type) && sourcePinId === 'variable') return 'variable';
      if (['variable_create', 'variable_get'].includes(source.type) && sourcePinId === 'value') return resolveVariableType(source, nextSeen);
      const definition = BuiltInNodeDefinitions.find((item) => item.type === source.type);
      const type = definition?.outputs?.find((pin) => pin.id === sourcePinId)?.type;
      if (type !== 'object') return type || null;
      if (['data_array_create', 'data_array_append', 'data_array_concat'].includes(source.type) || source.type === 'data_regex' && ['captures', 'matches'].includes(sourcePinId)) return 'array';
      if (source.type === 'data_parse_json' && !graphConnections.some((item) => item.targetNodeId === source.id && item.targetPinId === 'json')) {
        try { return Array.isArray(JSON.parse(source.data?.json || '')) ? 'array' : 'object'; } catch {}
      }
      return 'object';
    };
    const createdVariables = graphNodes.filter((node) => node.type === 'variable_create').flatMap((node) => {
      const name = String(node.data?.name || '').trim();
      if (!validVariableName(name)) return [];
      const wire = graphConnections.find((item) => item.targetNodeId === node.id && item.targetPinId === 'value');
      const inferredType = wire ? resolveNodeType(wire.sourceNodeId, wire.sourcePinId) : null;
      const type = ['string', 'number', 'boolean', 'array', 'object'].includes(inferredType) ? inferredType
        : ['string', 'number', 'boolean', 'array', 'object'].includes(node.data?.valueType) ? node.data.valueType : 'string';
      return [{ id: `nodevar_${node.id}`, name, type, initialValue: wire ? defaultValue(type) : node.data?.value ?? defaultValue(type), persist: node.data?.persist !== false, nodeOwned: true, sourceNodeId: node.id }];
    });
    const existingIds = new Set(savedVariables.map((item) => item.id));
    const graphVariables = [...savedVariables, ...createdVariables.filter((variable) => !existingIds.has(variable.id))];
    return [...graphVariables, ...slashAttachmentVariables(graphNodes, graphVariables)];
  }, [activeGraph]);
  const availableVariables = useMemo(() => [
    ...graphVariables.map((variable) => ({ ...variable, scope: 'graph' })),
    ...projectVariables.map((variable) => ({ ...variable, scope: 'project' }))
  ], [graphVariables, projectVariables]);
  const workspaceLabel = desktopMode && workspaceMode === 'local' ? 'Local Workspace' : 'Private Workspace';
  const graphLookup = useMemo(() => new Map([...savedGraphs, ...tabs].map((graph) => [graph.id, graph])), [savedGraphs, tabs]);
  const activeProjectName = projects.find((project) => project.id === activeProjectId)?.name || '';
  const functionGraphs = useMemo(() => [...graphLookup.values()].filter((graph) => graph.graphType === 'function'), [graphLookup]);
  const callableGraphs = useMemo(() => [...graphLookup.values()], [graphLookup]);
  const graphValidation = useMemo(() => validateGraph(activeGraph ? { ...activeGraph, variables: graphVariables } : activeGraph, graphLookup, botProfile?.intentSummary, projectVariables), [activeGraph, graphVariables, graphLookup, botProfile?.intentSummary, projectVariables]);
  const embedStudioOpenForActiveGraph = Boolean(embedStudio && embedStudio.graphId === activeTabId && embedStudio.projectId === activeProjectId);
  const discordTextStudioOpenForActiveGraph = Boolean(discordTextStudio && discordTextStudio.graphId === activeTabId && discordTextStudio.projectId === activeProjectId);
  const permissionStudioOpenForActiveGraph = Boolean(permissionStudio && permissionStudio.graphId === activeTabId && permissionStudio.projectId === activeProjectId);
  const slashCommandStudioOpenForActiveGraph = Boolean(slashCommandStudio && slashCommandStudio.graphId === activeTabId && slashCommandStudio.projectId === activeProjectId);
  const modalStudioOpenForActiveGraph = Boolean(modalStudio && modalStudio.graphId === activeTabId && modalStudio.projectId === activeProjectId);
  const embedTemplateSuggestions = useMemo(() => {
    if (!embedStudio?.nodeId) return [];
    const argumentNumbers = new Set(activeConnections
      .filter((wire) => wire.targetNodeId === embedStudio.nodeId)
      .map((wire) => /^arg_(\d+)$/.exec(wire.targetPinId)?.[1])
      .filter(Boolean));
    return [...argumentNumbers]
      .sort((left, right) => Number(left) - Number(right))
      .map((number) => ({ name: `arg${number}`, label: `arg${number}` }));
  }, [activeConnections, embedStudio?.nodeId]);
  const embedTemplateValuePaths = useMemo(() => {
    if (!embedStudio?.nodeId) return [];
    return getTemplateValuePaths(activeGraph, activeGraph?.nodes?.find((node) => node.id === embedStudio.nodeId), availableVariables);
  }, [activeGraph, availableVariables, embedStudio?.nodeId]);
  const anyStudioOpenForActiveGraph = embedStudioOpenForActiveGraph || discordTextStudioOpenForActiveGraph || permissionStudioOpenForActiveGraph || slashCommandStudioOpenForActiveGraph || modalStudioOpenForActiveGraph;
  useEffect(() => {
    if (anyStudioOpenForActiveGraph) { studioWasOpenRef.current = true; return; }
    if (!studioWasOpenRef.current) return;
    studioWasOpenRef.current = false;
    const target = studioFocusReturnRef.current;
    studioFocusReturnRef.current = null;
    if (!target || target.graphId !== activeTabId) return;
    requestAnimationFrame(() => document.querySelector(`[data-node-card-id="${CSS.escape(target.nodeId)}"]`)?.focus({ preventScroll: true }));
  }, [activeTabId, anyStudioOpenForActiveGraph]);
  const activeCollabStudio = discordTextStudioOpenForActiveGraph ? { id: discordTextStudio.collabId, type: 'text', label: discordTextStudio.label || 'Text editor' }
    : embedStudioOpenForActiveGraph ? { id: embedStudio.collabId, type: 'embed', label: 'Embed Studio' }
      : slashCommandStudioOpenForActiveGraph ? { id: slashCommandStudio.collabId, type: 'arguments', label: 'Command arguments' } : null;
  const studioCollaborators = activeCollabStudio ? remoteCollaborationActions.filter((peer) => peer.action?.studioId === activeCollabStudio.id) : [];
  const textStudioCursors = studioCollaborators.filter((peer) => peer.action?.kind === 'studio-cursor' || peer.action?.kind === 'studio-draft').map((peer) => ({ username: peer.username, color: peer.color, caret: peer.action.kind === 'studio-cursor' ? peer.action.caret : peer.action.draft?.caret ?? 0 }));
  useEffect(() => {
    if (!activeCollabStudio?.id) return undefined;
    sendCollaborationAction({ kind: 'studio-focus', studioId: activeCollabStudio.id, studioType: activeCollabStudio.type, label: activeCollabStudio.label }, true);
    return () => sendCollaborationAction({ kind: 'idle', studioId: activeCollabStudio.id }, true);
  }, [activeCollabStudio?.id, activeCollabStudio?.label, activeCollabStudio?.type, sendCollaborationAction]);
  const graphTabStatuses = useMemo(() => new Map(tabs.map((tab) => [tab.id, {
    unsaved: Boolean(tab.isDirty) || !savedGraphs.some((saved) => saved.id === tab.id),
    hasErrors: validateGraph(tab, graphLookup, botProfile?.intentSummary, projectVariables).errors.length > 0
  }])), [tabs, savedGraphs, graphLookup, botProfile?.intentSummary, projectVariables]);
  useEffect(() => {
    if (desktopMode || ![...graphTabStatuses.values()].some((status) => status.unsaved)) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [desktopMode, graphTabStatuses]);
  const historyAvailability = useMemo(() => {
    if (embedStudioOpenForActiveGraph) {
      const studioHistory = embedStudioHistoryRef.current.get(embedStudio?.collabId);
      return { canUndo: Boolean(studioHistory?.past.length), canRedo: Boolean(studioHistory?.future.length) };
    }
    if (slashCommandStudioOpenForActiveGraph) {
      const studioHistory = slashCommandStudioHistoryRef.current.get(slashCommandStudio?.collabId);
      return { canUndo: Boolean(studioHistory?.past.length), canRedo: Boolean(studioHistory?.future.length) };
    }
    const history = historyRef.current.get(activeTabId);
    return { canUndo: Boolean(history?.past.length), canRedo: Boolean(history?.future.length) };
  }, [activeTabId, embedStudio?.collabId, embedStudioOpenForActiveGraph, historyRevision, slashCommandStudio?.collabId, slashCommandStudioOpenForActiveGraph]);

  useEffect(() => {
    if (!desktopMode) return undefined;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return undefined;
    const enabled = settings.discordRpcEnabled !== false;
    const anonymous = settings.discordRpcRedactWorkspace
      && settings.discordRpcRedactProject
      && settings.discordRpcRedactGraph
      && settings.discordRpcRedactBot;
    const details = anonymous || settings.discordRpcRedactGraph
      ? 'Working on a Discord bot'
      : activeGraph?.name ? `Editing ${activeGraph.name}` : 'Building a Discord bot';
    const stateParts = [
      settings.discordRpcRedactWorkspace ? 'Workspace' : workspaceLabel,
      settings.discordRpcRedactProject ? 'Project' : activeProjectName,
      settings.discordRpcRedactBot ? '' : (botProfile?.application?.name || botProfile?.username || '')
    ].filter(Boolean);
    const stateText = anonymous ? 'Private workspace' : stateParts.join(' · ') || 'Workspace';
    const revision = ++discordRpcRevisionRef.current;
    discordRpcRequestRef.current = enabled
      ? { revision, details, stateText }
      : { revision, clear: true };
    const publishLatest = async () => {
      if (discordRpcInFlightRef.current) return;
      discordRpcInFlightRef.current = true;
      let processedRevision = 0;
      try {
        while (discordRpcRequestRef.current) {
          const request = discordRpcRequestRef.current;
          processedRevision = request.revision;
          try {
            if (request.clear) await invoke('clear_discord_presence');
            else {
              await invoke('update_discord_presence', { details: request.details, stateText: request.stateText, activityType: 0 });
            }
          } catch { /* app retries */ }
          if (discordRpcRequestRef.current?.revision === request.revision) break;
        }
      } finally {
        discordRpcInFlightRef.current = false;
        if (discordRpcRequestRef.current && discordRpcRequestRef.current.revision !== processedRevision) queueMicrotask(publishLatest);
      }
    };
    publishLatest();
    if (!enabled) return undefined;
    const retry = window.setInterval(publishLatest, 20000);
    return () => window.clearInterval(retry);
  }, [desktopMode, settings.discordRpcEnabled, settings.discordRpcRedactWorkspace, settings.discordRpcRedactProject, settings.discordRpcRedactGraph, settings.discordRpcRedactBot, workspaceLabel, activeProjectName, activeGraph?.id, activeGraph?.name, botProfile?.application?.name, botProfile?.username]);

  const triggerLoadingBar = useCallback(() => {
    const bar = document.getElementById('top-loading-bar');
    if (!bar) return;
    window.clearTimeout(loadingBarTimerRef.current);
    bar.classList.remove('is-loading', 'is-complete', 'is-fading');
    void bar.offsetWidth;
    bar.classList.add('is-loading');
    loadingBarTimerRef.current = window.setTimeout(() => {
      bar.classList.add('is-complete');
      loadingBarTimerRef.current = window.setTimeout(() => {
        bar.classList.add('is-fading');
        loadingBarTimerRef.current = window.setTimeout(() => {
          bar.classList.remove('is-loading', 'is-complete', 'is-fading');
          loadingBarTimerRef.current = null;
        }, 220);
      }, 260);
    }, 700);
  }, []);

  useEffect(() => () => window.clearTimeout(loadingBarTimerRef.current), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.releaseChannel = currentUpdateChannel;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'dark' ? '#191c21' : '#f5f6f7';
    if (hasThemeChoice) safeStorageSet('arc_theme', theme);
    if (!desktopMode) {
      document.cookie = `arc_theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
  }, [theme, hasThemeChoice, currentUpdateChannel, desktopMode]);

  useEffect(() => {
    const isCanvasGesture = (target) => target instanceof Element && Boolean(target.closest('.node-canvas'));
    const preventBrowserZoom = (event) => {
      if ((event.ctrlKey || event.metaKey) && !isCanvasGesture(event.target)) event.preventDefault();
    };
    const preventOutsideCanvasGesture = (event) => {
      if (!isCanvasGesture(event.target)) event.preventDefault();
    };
    document.addEventListener('wheel', preventBrowserZoom, { capture: true, passive: false });
    document.addEventListener('gesturestart', preventOutsideCanvasGesture, { capture: true, passive: false });
    document.addEventListener('gesturechange', preventOutsideCanvasGesture, { capture: true, passive: false });
    document.addEventListener('gestureend', preventOutsideCanvasGesture, { capture: true, passive: false });
    return () => {
      document.removeEventListener('wheel', preventBrowserZoom, true);
      document.removeEventListener('gesturestart', preventOutsideCanvasGesture, true);
      document.removeEventListener('gesturechange', preventOutsideCanvasGesture, true);
      document.removeEventListener('gestureend', preventOutsideCanvasGesture, true);
    };
  }, []);

  useEffect(() => {
    if (!isReady || !authToken || !currentUser || !studioVersion || !networkOnline) return undefined;
    const seenKey = 'arc_seen_release_notes_versions';
    let seenVersions = [];
    try {
      const stored = JSON.parse(localStorage.getItem(seenKey) || '[]');
      if (Array.isArray(stored)) seenVersions = stored.filter((version) => typeof version === 'string');
    } catch {}
    if (seenVersions.includes(studioVersion)) return undefined;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const loadReleaseNotes = async () => {
      const releaseUrl = `https://github.com/relentiousdragon/arc-studio/releases/tag/v${encodeURIComponent(studioVersion)}`;
      try {
        const response = await fetch(apiUrl(`/api/release-notes/${encodeURIComponent(studioVersion)}`), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Release notes request failed (${response.status}).`);
        const release = await response.json();
        if (cancelled) return;
        setReleaseNotesNotice({
          version: studioVersion,
          title: release.title || `ARC Studio ${studioVersion}`,
          notes: String(release.notes || '').trim().slice(0, 12000) || 'This release does not include release notes.',
          url: release.url || releaseUrl
        });
      } catch (error) {
        if (cancelled || error?.name === 'AbortError' || navigator.onLine === false) return;
        setReleaseNotesNotice({
          version: studioVersion,
          title: `ARC Studio ${studioVersion}`,
          notes: 'Release notes could not be loaded. You can read them on the ARC Studio release page.',
          url: releaseUrl
        });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    loadReleaseNotes();
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [authToken, currentUser, isReady, networkOnline, studioVersion]);

  const dismissReleaseNotes = useCallback(() => {
    if (releaseNotesNotice?.version) {
      const seenKey = 'arc_seen_release_notes_versions';
      try {
        const stored = JSON.parse(localStorage.getItem(seenKey) || '[]');
        const versions = Array.isArray(stored) ? stored.filter((version) => typeof version === 'string') : [];
        if (!versions.includes(releaseNotesNotice.version)) versions.push(releaseNotesNotice.version);
        localStorage.setItem(seenKey, JSON.stringify(versions.slice(-100)));
      } catch {}
    }
    setReleaseNotesNotice(null);
  }, [releaseNotesNotice]);

  useEffect(() => {
    if (!desktopMode || !macOSDesktop) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return;
    let cancelled = false;
    const updateDockIcon = async () => {
      try {
        const image = new Image();
        image.src = '/arc.png';
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.filter = desktopReleaseChannel === 'nightly' ? 'hue-rotate(42deg) saturate(1.08)' : 'none';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob || cancelled) return;
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        await invoke('set_release_channel_icon', { iconPng: bytes });
      } catch {}
    };
    updateDockIcon();
    return () => { cancelled = true; };
  }, [desktopMode, macOSDesktop, desktopReleaseChannel]);

  useEffect(() => {
    document.body.dataset.compactContext = settings.compactContextMenus ? 'true' : 'false';
    return () => { delete document.body.dataset.compactContext; };
  }, [settings.compactContextMenus]);

  useEffect(() => {
    if (hasThemeChoice || !window.matchMedia) return undefined;
    const preference = window.matchMedia('(prefers-color-scheme: light)');
    const syncTheme = (event) => setTheme(event.matches ? 'light' : 'dark');
    preference.addEventListener?.('change', syncTheme);
    if (!preference.addEventListener) preference.addListener?.(syncTheme);
    return () => {
      preference.removeEventListener?.('change', syncTheme);
      if (!preference.removeEventListener) preference.removeListener?.(syncTheme);
    };
  }, [hasThemeChoice]);

  const toggleTheme = useCallback(() => {
    setHasThemeChoice(true);
    setTheme((value) => value === 'dark' ? 'light' : 'dark');
  }, []);

  const handleThemeChange = useCallback((choice) => {
    if (choice === 'system') {
      safeStorageRemove('arc_theme');
      setHasThemeChoice(false);
      const preference = window.matchMedia?.('(prefers-color-scheme: light)');
      setTheme(preference?.matches ? 'light' : 'dark');
      return;
    }
    if (choice === 'dark' || choice === 'light') {
      setHasThemeChoice(true);
      setTheme(choice);
    }
  }, []);

  useEffect(() => {
    if (!desktopMode || workspaceMode !== 'local') {
      setLocalSessionRestoreReady(true);
      return undefined;
    }
    let cancelled = false;
    const keepSignedIn = (() => {
      try { return localStorage.getItem('arc_local_keep_signed_in') !== 'false'; }
      catch { return true; }
    })();
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!keepSignedIn) {
      safeStorageRemove('arc_token');
      setAuthToken('');
      removeLocalDesktopSessionToken();
      setLocalSessionRestoreReady(true);
      return undefined;
    }
    if (authToken) {
      if (typeof invoke === 'function') invoke('save_local_session_token', { token: authToken }).catch(() => {});
      setLocalSessionRestoreReady(true);
      return undefined;
    }
    if (typeof invoke !== 'function') {
      setLocalSessionRestoreReady(true);
      return undefined;
    }
    invoke('get_local_session_token')
      .then((token) => {
        if (cancelled || typeof token !== 'string' || !token) return;
        writeLocalDesktopSessionToken(token);
        safeStorageSet('arc_token', token);
        localSessionRef.current = { token, user: null };
        setAuthToken(token);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLocalSessionRestoreReady(true); });
    return () => { cancelled = true; };
  }, [desktopMode, workspaceMode]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    triggerLoadingBar();
    setWorkspaceError('');
    const startupError = desktopMode && workspaceMode === 'local' ? window.__ARC_STUDIO_CONFIG__?.startupError : null;
    if (startupError) {
      setWorkspaceError(startupError);
      setNeedsSetup(false);
      setIsReady(true);
      return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
    }
    if (desktopMode && workspaceMode === 'local' && !localSessionRestoreReady) {
      return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
    }
    fetch(apiUrl('/api/system/status'), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Workspace returned HTTP ${res.status}.`);
        return res.json();
      })
      .then(async (system) => {
        if (cancelled) return;
        if (typeof system.isSetupCompleted !== 'boolean') throw new Error('Workspace returned an invalid status response.');
        const serverVersion = String(system.version || '').trim();
        const requiredClientVersion = String(system.minimumClientVersion || serverVersion).trim();
        setMinimumRequiredClientVersion(requiredClientVersion);
        const minimumVersionOrder = compareArcVersions(studioPackage.version, requiredClientVersion);
        if (minimumVersionOrder === null || minimumVersionOrder < 0) throw new Error(`Update ARC Studio to ${requiredClientVersion || 'the required version'} or newer to connect.`);
        const systemRegistryCompatibility = getNodeRegistryCompatibility({
          nodeRegistryProtocolVersion: system.nodeRegistryProtocolVersion,
          nodeRegistryFeatures: SUPPORTED_NODE_REGISTRY_FEATURES
        }, system.nodeRegistryRequiredFeatures);
        if (!systemRegistryCompatibility.compatible) {
          const unsupported = systemRegistryCompatibility.unsupportedFeatures.length
            ? ` Unsupported features: ${systemRegistryCompatibility.unsupportedFeatures.join(', ')}.`
            : '';
          throw new Error(`This workspace requires node registry protocol ${system.nodeRegistryProtocolVersion ?? 'unknown'}, which this client cannot use.${unsupported} Update ARC Studio to a compatible build.`);
        }
        const versionOrder = compareArcVersions(serverVersion, studioPackage.version);
        let serverNodeTypes = Array.isArray(system.supportedNodeTypes) ? system.supportedNodeTypes : null;
        let hasWorkspaceSchemas = false;
        let registryLoadIssue = '';
        if (authToken) {
          try {
            const registryResponse = await fetch(apiUrl('/api/nodes/registry'), { signal: controller.signal, cache: 'no-cache', headers: { 'x-arc-token': authToken } });
            if (registryResponse.ok) {
              const registry = await registryResponse.json();
              const definitions = getNodeRegistryDefinitions(registry);
              if (definitions) {
                setWorkspaceNodeDefinitions(definitions, registry.categories);
                setFailedWorkspaceNodeTypes(new Set(Array.isArray(registry.failedNodeTypes) ? registry.failedNodeTypes : []));
                nodeRegistryRevisionRef.current = registry.registryRevision;
                registerPluginNodeDefinitions(installedPluginsRef.current);
                serverNodeTypes = definitions.map((definition) => definition.type);
                setPluginDefinitionsRevision((revision) => revision + 1);
                hasWorkspaceSchemas = true;
              } else {
                registryLoadIssue = 'Workspace node schemas are unavailable or use an unsupported schema version.';
              }
            } else {
              registryLoadIssue = `Workspace node schemas returned HTTP ${registryResponse.status}.`;
            }
          } catch (error) {
            if (error.name === 'AbortError' && cancelled) return;
            registryLoadIssue = `Workspace node schemas could not be loaded${error?.message ? `: ${error.message}` : '.'}`;
          }
        }
        if (!hasWorkspaceSchemas) {
          setWorkspaceNodeDefinitions(null);
          setFailedWorkspaceNodeTypes(new Set());
          nodeRegistryRevisionRef.current = '';
          registerPluginNodeDefinitions([]);
          setPluginDefinitionsRevision((revision) => revision + 1);
        }
        if (authToken && serverNodeTypes?.length && serverNodeTypes.every((type) => typeof type === 'string')) {
          const serverNodeTypeSet = new Set(serverNodeTypes);
          setSupportedWorkspaceNodeTypes(serverNodeTypeSet);
          const workspaceOnlyNodeCount = hasWorkspaceSchemas ? [...serverNodeTypeSet].filter((type) => !BundledNodeTypes.has(type)).length : 0;
          setWorkspaceCompatibilityNotice(workspaceOnlyNodeCount
            ? `${workspaceOnlyNodeCount} workspace node type${workspaceOnlyNodeCount === 1 ? '' : 's'} use server-provided schemas and generic editors. Node behavior runs on the workspace server.`
            : registryLoadIssue ? registryLoadIssue
            : versionOrder === null ? 'Connected using workspace-provided node support metadata.'
              : versionOrder < 0 ? `Connected to older workspace version ${serverVersion}. Node behavior runs on the workspace server.`
                : versionOrder > 0 ? `Connected to newer workspace version ${serverVersion}. Some editor-specific controls may not be available.` : '');
        } else if (!authToken) {
          setWorkspaceNodeDefinitions(null);
          setSupportedWorkspaceNodeTypes(new Set());
          setFailedWorkspaceNodeTypes(new Set());
          setWorkspaceCompatibilityNotice('');
        } else {
          setWorkspaceNodeDefinitions(null);
          setSupportedWorkspaceNodeTypes(null);
          setFailedWorkspaceNodeTypes(new Set());
          setWorkspaceCompatibilityNotice(desktopMode && workspaceMode === 'remote'
            ? `Connected to workspace version ${serverVersion || 'unknown'}. ${registryLoadIssue || 'Its node registry is unavailable.'}`
            : registryLoadIssue);
        }
        if (typeof system.version === 'string' && system.version.trim()) setStudioServerVersion(system.version.trim());
        setTransientCanvasMotionSupported(system.collaborationFeatures?.transientCanvasMotion === true);
        if (!desktopMode && typeof system.version === 'string' && system.version.trim()) setStudioVersion(system.version.trim());
        if (desktopMode && workspaceMode === 'local') {
          const ownerUsername = typeof system.localUsername === 'string' ? system.localUsername : '';
          setLocalAccountUsername(ownerUsername);
          if (ownerUsername) safeStorageSet('arc_local_username', ownerUsername);
        }
        setCanResetPrimaryAdminWithMasterKey(system.canResetPrimaryAdminWithMasterKey === true);
        if (typeof system.workspaceName === 'string' && system.workspaceName.trim()) {
          const name = system.workspaceName.trim().slice(0, 35);
          setRemoteWorkspaceName(name);
          if (desktopMode && workspaceMode === 'remote') {
            try { localStorage.setItem('arc_remote_workspace_name', name); } catch {}
          }
        }
        const localOwnerMissing = desktopMode && workspaceMode === 'local' && system.hasLocalAccount === false;
        if (!system.isSetupCompleted || localOwnerMissing) {
          setNeedsSetup(true);
          setAuthToken('');
          safeStorageRemove('arc_token');
          if (desktopMode && workspaceMode === 'local') {
            removeLocalDesktopSessionToken();
            localSessionRef.current = null;
          }
          setCurrentUser(null);
          setIsReady(true);
          return;
        }
        setNeedsSetup(false);
        let validSession = false;
        if (authToken) {
          try {
            const res = await fetch(apiUrl('/api/auth/me'), { headers: { 'x-arc-token': authToken }, signal: controller.signal });
            if (!res.ok) {
              if (res.status === 401) {
                safeStorageRemove('arc_token');
                setAuthToken('');
                setCurrentUser(null);
              }
              throw new Error(res.status === 401 ? 'Session invalid' : `Workspace returned HTTP ${res.status}.`);
            }
            const data = await res.json();
            validSession = true;
            if (!cancelled) setCurrentUser(data.user);
          } catch (error) {
            if (!cancelled && error.message === 'Session invalid') {
              setAuthToken('');
              safeStorageRemove('arc_token');
              if (desktopMode && workspaceMode === 'local') {
                removeLocalDesktopSessionToken();
                localSessionRef.current = null;
              }
            }
          }
        }
        if (validSession && !hasWorkspaceSchemas) throw new Error(`Could not load authoritative node schemas from this workspace. ${registryLoadIssue || 'Reconnect after updating the server.'}`);
        if (!cancelled) setIsReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceError(error.name === 'AbortError'
            ? 'The workspace did not respond in time. Check that it is running and try again.'
            : error.message === 'Failed to fetch'
              ? workspaceMode === 'remote' ? 'Could not reach this workspace. Check its URL and network access.' : 'Could not reach the local workspace service. Restart ARC Studio and try again.'
              : error.message || 'Could not connect to the workspace.');
          setIsReady(true);
        }
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [workspaceRevision, workspaceMode, desktopMode, localSessionRestoreReady, authToken]);

  useEffect(() => {
    if (!authToken) { setProjectVariables([]); setDisabledBuiltInVariables([]); return undefined; }
    let cancelled = false;
    fetch(apiUrl('/api/variables/project'), { headers: { 'x-arc-token': authToken } })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.variables)) setProjectVariables(data.variables);
        if (!cancelled && Array.isArray(data.disabledBuiltInVariables)) setDisabledBuiltInVariables(data.disabledBuiltInVariables);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authToken, activeProjectId, workspaceRevision, workspaceMode]);

  useEffect(() => {
    if (!authToken || projectStarters.length) return undefined;
    let cancelled = false;
    fetch(apiUrl('/api/projects/templates'), { headers: { 'x-arc-token': authToken } })
      .then((response) => response.json())
      .then((data) => { if (!cancelled && Array.isArray(data.templates)) setProjectStarters(data.templates); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authToken, projectStarters.length, workspaceMode, workspaceRevision]);

  useEffect(() => {
    if (!authToken) {
      registerPluginNodeDefinitions([]);
      installedPluginsRef.current = [];
      setInstalledPlugins([]);
      setPluginDefinitionsRevision((revision) => revision + 1);
      return undefined;
    }
    let cancelled = false;
    fetch(apiUrl('/api/plugins/installed'), { headers: { 'x-arc-token': authToken } })
      .then((response) => {
        if (!response.ok) throw new Error(`Workspace returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data.plugins)) throw new Error('Workspace returned an invalid installed plugin list.');
        const plugins = data.plugins;
        installedPluginsRef.current = plugins;
        setInstalledPlugins(plugins);
        registerPluginNodeDefinitions(plugins);
        setPluginDefinitionsRevision((revision) => revision + 1);
      })
      .catch((error) => {
        if (!cancelled) arcEvents.emit('toast:notify', { title: 'Plugin nodes could not be loaded', message: error.message || 'Could not load installed plugin definitions from this workspace.', type: 'warning' });
      });
    return () => { cancelled = true; };
  }, [authToken, workspaceRevision, workspaceMode]);

  useEffect(() => {
    if (!authToken) { setEmbedAssets([]); return undefined; }
    let current = true;
    const loadEmbeds = async () => {
      try {
        const response = await fetch(apiUrl('/api/embeds'), { headers: { 'x-arc-token': authToken } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load shared embeds.');
        let embeds = Array.isArray(data.embeds) ? data.embeds : [];
        if (!embeds.length && desktopMode && workspaceMode === 'local') {
          try {
            const legacy = readAppStorage('arc_embed_assets');
            const parsed = legacy ? JSON.parse(legacy) : [];
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 1000) {
              let migrated = true;
              for (const embed of parsed) {
                const saved = await fetch(apiUrl('/api/embeds'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify(embed) });
                if (!saved.ok) { migrated = false; break; }
                const savedData = await saved.json();
                embeds = savedData.embeds || embeds;
              }
              if (migrated) safeStorageRemove('arc_embed_assets');
            }
          } catch {}
        }
        if (current) setEmbedAssets(embeds);
      } catch (error) {
        if (current) arcEvents.emit('toast:notify', { title: 'Embed library', message: error.message, type: 'error' });
      }
    };
    loadEmbeds();
    return () => { current = false; };
  }, [authToken, workspaceRevision, workspaceMode, desktopMode]);

  useEffect(() => {
    if (!authToken) { setAppEmojis([]); setAppEmojisLoading(false); setAppEmojisCachedAt(0); return undefined; }
    let cachedEmojis = [];
    let cachedAt = 0;
    try {
      const cached = JSON.parse(readAppStorage(emojiCacheStorageKey) || 'null');
      const age = Date.now() - Number(cached?.cachedAt || 0);
      if (Array.isArray(cached?.emojis) && age >= 0 && age <= APP_EMOJI_CACHE_TTL) { cachedEmojis = cached.emojis; cachedAt = Number(cached.cachedAt); }
      else if (cached) removeAppStorage(emojiCacheStorageKey);
    } catch { removeAppStorage(emojiCacheStorageKey); }
    setAppEmojis(cachedEmojis);
    setAppEmojisCachedAt(cachedAt);
    if (!networkOnline || (Number(botMetrics?.rateLimitedUntil) || 0) > Date.now()) { setAppEmojisLoading(false); return undefined; }
    let current = true;
    setAppEmojisLoading(true);
    fetch(apiUrl('/api/bot/emojis'), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load app emojis.');
        return Array.isArray(data.emojis) ? data.emojis : [];
      })
      .then((items) => {
        if (!current) return;
        const fetchedAt = Date.now();
        setAppEmojis(items);
        setAppEmojisCachedAt(fetchedAt);
        writeAppStorage(emojiCacheStorageKey, JSON.stringify({ cachedAt: fetchedAt, emojis: items }));
      })
      .catch(() => { if (current) setAppEmojis(cachedEmojis); })
      .finally(() => { if (current) setAppEmojisLoading(false); });
    return () => { current = false; };
  }, [authToken, activeProjectId, workspaceMode, workspaceRevision, networkOnline, emojiCacheStorageKey, botMetrics?.rateLimitedUntil]);

  useEffect(() => {
    setHasEstablishedCollaboration(false);
    if (!authToken) {
      setCollaborationSocketStatus('disconnected');
      setCollaborators([]);
      reconnectGraphBaseRef.current.clear();
      return undefined;
    }
    const wsUrl = studioWebSocketUrl();
    let active = true;
    let reconnectTimer;
    let initialConnectTimer;
    let heartbeatTimer;
    let socket;
    let reconnectAttempts = 0;
    let registryRefreshPromise = null;
    let registryRefreshRequestVersion = 0;

    const refreshNodeRegistry = (expectedRevision = '') => {
      if (expectedRevision && expectedRevision === nodeRegistryRevisionRef.current && !registryRefreshPromise) return Promise.resolve();
      registryRefreshRequestVersion += 1;
      if (registryRefreshPromise) return registryRefreshPromise;
      registryRefreshPromise = (async () => {
        let completedRequestVersion = 0;
        do {
          completedRequestVersion = registryRefreshRequestVersion;
          const [pluginsResponse, registryResponse] = await Promise.all([
            fetch(apiUrl('/api/plugins/installed'), { headers: { 'x-arc-token': authToken } }),
            fetch(apiUrl('/api/nodes/registry'), { headers: { 'x-arc-token': authToken }, cache: 'no-cache' })
          ]);
          if (!pluginsResponse.ok || !registryResponse.ok) throw new Error('Could not refresh the workspace node catalog.');
          const [pluginsData, registry] = await Promise.all([pluginsResponse.json(), registryResponse.json()]);
          const definitions = getNodeRegistryDefinitions(registry);
          if (!definitions || typeof registry.registryRevision !== 'string') throw new Error('The workspace returned an invalid node catalog.');
          const installed = Array.isArray(pluginsData.plugins) ? pluginsData.plugins : [];
          setWorkspaceNodeDefinitions(definitions, registry.categories);
          setFailedWorkspaceNodeTypes(new Set(Array.isArray(registry.failedNodeTypes) ? registry.failedNodeTypes : []));
          installedPluginsRef.current = installed;
          setInstalledPlugins(installed);
          registerPluginNodeDefinitions(installed);
          setSupportedWorkspaceNodeTypes(new Set(definitions.map((definition) => definition.type)));
          nodeRegistryRevisionRef.current = registry.registryRevision;
          setPluginDefinitionsRevision((revision) => revision + 1);
        } while (completedRequestVersion !== registryRefreshRequestVersion);
      })().finally(() => { registryRefreshPromise = null; });
      return registryRefreshPromise;
    };

    const handleRegistryRefreshFailure = (error, currentSocket) => {
      if (!active) return;
      setWorkspaceNodeDefinitions(null);
      setSupportedWorkspaceNodeTypes(new Set());
      setFailedWorkspaceNodeTypes(new Set());
      installedPluginsRef.current = [];
      setInstalledPlugins([]);
      registerPluginNodeDefinitions([]);
      setPluginDefinitionsRevision((revision) => revision + 1);
      setCollaborationSocketStatus('reconnecting');
      arcEvents.emit('toast:notify', { title: 'Node catalog refresh failed', message: error?.message || 'Reconnect to load the latest node catalog.', type: 'error', duration: 9000 });
      if (currentSocket?.readyState === WebSocket.OPEN) currentSocket.close(4000, 'Node catalog refresh failed.');
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer) return;
      setCollaborationSocketStatus('reconnecting');
      if (navigator.onLine === false) return;
      const baseDelay = Math.min(30_000, 1000 * (2 ** Math.min(reconnectAttempts, 5)));
      reconnectAttempts += 1;
      const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };
    const connect = () => {
      if (!active) return;
      if (socket && [WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING].includes(socket.readyState)) return;
      if (navigator.onLine === false) {
        setCollaborationSocketStatus('reconnecting');
        return;
      }
      collaborationClientIdRef.current = globalThis.crypto?.randomUUID?.() || `arc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setCollaborationSocketStatus(reconnectAttempts ? 'reconnecting' : 'connecting');
      setCollaborationConnectionFlaky(false);
      collaborationMotionSendIntervalRef.current = 16;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      const currentSocket = socket;
      wsRef.current = currentSocket;
      let lastPongAt = Date.now();
      let pingSequence = 0;
      let pendingPing = null;
      let missedPongs = 0;
      let consecutiveBadSamples = 0;
      let consecutiveGoodSamples = 0;
      let previousRtt = null;
      const rttSamples = [];
      const recordConnectionSample = (rtt, missed = false) => {
        if (Number.isFinite(rtt)) {
          rttSamples.push(rtt);
          if (rttSamples.length > 5) rttSamples.shift();
        }
        const averageRtt = rttSamples.length ? rttSamples.reduce((total, value) => total + value, 0) / rttSamples.length : 0;
        const jitter = Number.isFinite(rtt) && Number.isFinite(previousRtt) ? Math.abs(rtt - previousRtt) : 0;
        if (Number.isFinite(rtt)) previousRtt = rtt;
        const congested = currentSocket.readyState === WebSocket.OPEN && currentSocket.bufferedAmount >= 32 * 1024;
        const isBad = missed || congested || averageRtt >= 350 || jitter >= 180;
        collaborationMotionSendIntervalRef.current = missed || congested || averageRtt >= 350 || jitter >= 180
          ? 50
          : averageRtt >= 180 || jitter >= 70 ? 32 : 16;
        if (isBad) {
          consecutiveBadSamples += 1;
          consecutiveGoodSamples = 0;
          if (consecutiveBadSamples >= 2 || missedPongs >= 2) setCollaborationConnectionFlaky(true);
        } else {
          consecutiveGoodSamples += 1;
          consecutiveBadSamples = 0;
          if (consecutiveGoodSamples >= 3) setCollaborationConnectionFlaky(false);
        }
      };
      currentSocket.onopen = () => {
        if (currentSocket.readyState === WebSocket.OPEN) {
          collaborationPresenceRef.current = { projectId: '', graphId: '' };
          currentSocket.send(JSON.stringify({
            type: 'AUTH', protocolVersion: CLIENT_PROTOCOL_VERSION, token: authToken, clientVersion: studioPackage.version,
            nodeSchemaVersion: NODE_SCHEMA_VERSION,
            nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
            nodeRegistryFeatures: SUPPORTED_NODE_REGISTRY_FEATURES,
            clientIdentity: {
              product: 'arc-studio', protocolVersion: CLIENT_PROTOCOL_VERSION, version: studioPackage.version,
              nodeSchemaVersion: NODE_SCHEMA_VERSION,
              nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
              nodeRegistryFeatures: SUPPORTED_NODE_REGISTRY_FEATURES
            }
          }));
          heartbeatTimer = window.setInterval(() => {
            if (currentSocket.readyState !== WebSocket.OPEN) return;
            if (document.visibilityState !== 'visible') { pendingPing = null; return; }
            if (Date.now() - lastPongAt > 45000) { currentSocket.close(); return; }
            if (pendingPing && performance.now() - pendingPing.sentAt > 12_000) {
              pendingPing = null;
              missedPongs += 1;
              recordConnectionSample(null, true);
              if (missedPongs >= 2) { currentSocket.close(4000, 'Collaboration heartbeat missed'); return; }
            }
            if (!pendingPing && document.visibilityState === 'visible') {
              const id = ++pingSequence;
              pendingPing = { id, sentAt: performance.now() };
              currentSocket.send(JSON.stringify({ type: 'PING', pingId: id, clientSentAt: pendingPing.sentAt }));
            }
          }, 5000);
          let lastActivitySentAt = 0;
          const reportActivity = () => {
            const now = Date.now();
            if (now - lastActivitySentAt < 15000 || currentSocket.readyState !== WebSocket.OPEN) return;
            lastActivitySentAt = now;
            currentSocket.send(JSON.stringify({ type: 'USER_ACTIVITY' }));
          };
          const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
          activityEvents.forEach((name) => window.addEventListener(name, reportActivity, { passive: true, capture: true }));
          const reportVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            pendingPing = null;
            lastPongAt = Date.now();
            reportActivity();
          };
          document.addEventListener('visibilitychange', reportVisibility);
          currentSocket.addEventListener('close', () => {
            activityEvents.forEach((name) => window.removeEventListener(name, reportActivity, true));
            document.removeEventListener('visibilitychange', reportVisibility);
          }, { once: true });
        }
      };
      currentSocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'PROBLEM') {
            const problem = msg.payload || {};
            if (problem.code === 'CLIENT_VERSION_BLOCKED') {
              setMinimumRequiredClientVersion(String(problem.minimumVersion || 'a newer ARC Studio version'));
              setCollaborationSocketStatus('incompatible');
              arcEvents.emit('toast:notify', { title: problem.title || 'ARC Studio update required', message: problem.detail || `This workspace requires version ${problem.minimumVersion || 'newer'} or newer.`, type: 'error', duration: 15000 });
            } else if (problem.code === 'NODE_REGISTRY_INCOMPATIBLE') {
              setCollaborationSocketStatus('incompatible');
              arcEvents.emit('toast:notify', { title: problem.title || 'Node registry update required', message: problem.detail || 'Update ARC Studio to a compatible build.', type: 'error', duration: 15000 });
            } else if (problem.code === 'CLIENT_PROTOCOL_INCOMPATIBLE') {
              setCollaborationSocketStatus('incompatible');
              arcEvents.emit('toast:notify', { title: problem.title || 'Client protocol update required', message: problem.detail || 'Update ARC Studio to a compatible build.', type: 'error', duration: 15000 });
            } else if (problem.code === 'CLIENT_NOT_ALLOWED') {
              setCollaborationSocketStatus('blocked');
              arcEvents.emit('toast:notify', { title: problem.title || 'Client not allowed', message: problem.detail || 'The workspace owner has disabled unknown clients.', type: 'error', duration: 15000 });
            } else if (problem.code === 'COLLABORATOR_LIMIT_REACHED') {
              setCollaborationSocketStatus('blocked');
              arcEvents.emit('toast:notify', { title: problem.title || 'Workspace is full', message: problem.detail || 'The workspace has reached its real-time collaborator limit.', type: 'error', duration: 15000 });
            } else {
              arcEvents.emit('toast:notify', { title: problem.title || 'Workspace request failed', message: problem.detail || 'The workspace could not complete the request.', type: 'error', duration: 7000 });
              return;
            }
            active = false;
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
            currentSocket.close(1008, 'Workspace protocol problem.');
            return;
          }
          if (msg.type === 'NODE_REGISTRY_UPDATED') {
            void refreshNodeRegistry(String(msg.payload?.registryRevision || '')).catch((error) => handleRegistryRefreshFailure(error, currentSocket));
            return;
          }
          if (msg.type === 'CLIENT_VERSION_BLOCKED') {
            setMinimumRequiredClientVersion(String(msg.payload?.minimumVersion || 'a newer ARC Studio version'));
            setCollaborationSocketStatus('incompatible');
            arcEvents.emit('toast:notify', {
              title: 'ARC Studio update required',
              message: `This workspace requires version ${msg.payload?.minimumVersion || 'newer'} or newer.`,
              type: 'error',
              duration: 15000
            });
            active = false;
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
            currentSocket.close(1008, 'Client update required.');
          } else if (msg.type === 'NODE_SCHEMA_BLOCKED') {
            const requiredVersion = String(msg.payload?.minimumVersion || 'a newer ARC Studio version');
            setMinimumRequiredClientVersion(requiredVersion);
            setCollaborationSocketStatus('incompatible');
            arcEvents.emit('toast:notify', { title: 'ARC Studio update required', message: `This workspace requires node schema ${msg.payload?.requiredSchemaVersion || 'a newer version'}. Update ARC Studio to a compatible build.`, type: 'error', duration: 15000 });
            active = false;
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
            currentSocket.close(1008, 'Client schema update required.');
          } else if (msg.type === 'CLIENT_NOT_ALLOWED') {
            setCollaborationSocketStatus('blocked');
            arcEvents.emit('toast:notify', { title: 'Client not allowed', message: msg.payload?.message || 'The workspace owner has disabled unknown clients.', type: 'error', duration: 15000 });
            active = false;
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
            currentSocket.close(1008, 'Client not allowed.');
          } else if (msg.type === 'PONG') {
            lastPongAt = Date.now();
            if (document.visibilityState !== 'visible') { pendingPing = null; return; }
            const sample = pendingPing;
            if (sample && (msg.pingId === undefined || msg.pingId === sample.id)) {
              const rtt = Math.max(0, performance.now() - sample.sentAt);
              pendingPing = null;
              missedPongs = 0;
              recordConnectionSample(rtt);
            }
            return;
          }
          if (msg.type === 'SESSION_REPLACEMENT_PENDING') {
            arcEvents.emit('toast:notify', { id: 'arc-session-replacement', title: 'Session change', message: "You'll be logged out in 5 seconds.", type: 'info', loading: true, persistent: true });
            return;
          }
          if (msg.type === 'SESSION_REPLACED') {
            arcEvents.emit('toast:notify', { id: 'arc-session-replacement', title: 'Signed out', message: 'This account was signed in elsewhere.', type: 'warning', duration: 3200 });
            forceSignOutRef.current?.();
            return;
          }
          if (msg.type === 'SESSION_EXPIRED') {
            forceSignOutRef.current?.();
            return;
          }
          if (msg.type === 'USER_PERMISSIONS_UPDATED') {
            const updatedUser = msg.payload?.user;
            if (updatedUser?.id) setCurrentUser((current) => current?.id === updatedUser.id ? { ...current, ...updatedUser } : current);
            return;
          }
          if (msg.type === 'USER_PROFILE_UPDATED') {
            const updatedUser = msg.payload?.user;
            if (updatedUser?.id) setCurrentUser((current) => current?.id === updatedUser.id ? { ...current, ...updatedUser } : current);
            return;
          }
          if (msg.type === 'SESSION_REVOKED') {
            arcEvents.emit('toast:notify', { id: 'arc-session-revoked', title: 'Signed out', message: 'A workspace administrator ended this session.', type: 'warning', duration: 5000 });
            forceSignOutRef.current?.();
            return;
          }
          if (msg.type === 'SESSION_IDLE_EXPIRED') {
            arcEvents.emit('toast:notify', { id: 'arc-session-idle', title: 'Signed out', message: 'You were signed out after being idle.', type: 'info', duration: 5000 });
            forceSignOutRef.current?.();
            return;
          }
          if (msg.type === 'INIT_STATE') {
            if (typeof msg.payload.collaboratorColor === 'string') {
              setCurrentUser((current) => current ? { ...current, color: msg.payload.collaboratorColor } : current);
            }
            const announcedRegistryRevision = String(msg.payload.nodeRegistryRevision || '');
            const registryNeedsRefresh = Boolean(announcedRegistryRevision && announcedRegistryRevision !== nodeRegistryRevisionRef.current);
            if (!registryNeedsRefresh && announcedRegistryRevision) nodeRegistryRevisionRef.current = announcedRegistryRevision;
            setMinimumRequiredClientVersion('');
            if (!desktopMode && typeof msg.payload.version === 'string' && msg.payload.version.trim()) setStudioVersion(msg.payload.version.trim());
            if (registryNeedsRefresh) {
              setCollaborationSocketStatus('reconnecting');
              void refreshNodeRegistry(announcedRegistryRevision)
                .then(() => { if (active && currentSocket.readyState === WebSocket.OPEN) setCollaborationSocketStatus('connected'); })
                .catch((error) => handleRegistryRefreshFailure(error, currentSocket));
            } else setCollaborationSocketStatus('connected');
            reconnectAttempts = 0;
            setTransientCanvasMotionSupported(msg.payload.collaborationFeatures?.transientCanvasMotion === true);
            setProjectLastSeen(msg.payload.projectLastSeen && typeof msg.payload.projectLastSeen === 'object' ? msg.payload.projectLastSeen : {});
            window.clearTimeout(collaborationActionTimerRef.current);
            collaborationActionTimerRef.current = null;
            pendingCollaborationActionRef.current.clear();
            latestRemoteCollaborationRevisionRef.current.clear();
            localCanvasMotionRoomRef.current = '';
            setRemoteCollaborationActions([]);
            setNoteEditLockState({ roomKey: '', locks: {} });
            liveGraphRevisionRef.current.clear();
            liveGraphReadyRef.current.clear();
            lastLiveGraphSentRef.current.clear();
            pendingLiveGraphRef.current.clear();
            for (const timer of liveGraphSendTimersRef.current.values()) window.clearTimeout(timer);
            liveGraphSendTimersRef.current.clear();
            setSocketReadyRevision((revision) => revision + 1);
            if (Array.isArray(msg.payload.projectVariables)) setProjectVariables(msg.payload.projectVariables);
            if (msg.payload.projects) {
              const nextProjects = Array.isArray(msg.payload.projects.projects) ? msg.payload.projects.projects : [];
              setProjects(nextProjects);
              setMaxProjects(localDesktopWorkspace ? null : msg.payload.projects.maxProjects === undefined ? 10 : msg.payload.projects.maxProjects);
              setActiveProjectId(msg.payload.projects.activeProjectId || '');
              setNeedsProjectOnboarding(nextProjects.length === 0 || nextProjects.some((project) => project.id === msg.payload.projects.activeProjectId && project.pendingStarterChoice));
            }
            setBotStatus(msg.payload.botStatus || 'DISCONNECTED');
            setBotMetrics(msg.payload.botMetrics || { latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
            setBotProfile(msg.payload.botProfile || null);
            setDiscordAuthWarning(msg.payload.discordAuthWarning || null);
            setLogs(msg.payload.logs || []);
            if (msg.payload.graphLibrary) {
              setGraphTemplates(msg.payload.graphLibrary.templates || []);
              setGraphSnapshots(msg.payload.graphLibrary.snapshots || []);
              setDefaultGraphId(msg.payload.graphLibrary.defaultGraphId ?? '');
            }
            if (Array.isArray(msg.payload.graphs)) {
              const graphs = msg.payload.graphs.map(migrateFunctionGraphEntry);
              const bases = new Map(graphs.map((graph) => [graph.id, reconnectGraphBaseRef.current.get(graph.id) || snapshotGraph(graph)]));
              liveGraphBaseRef.current = bases;
              liveGraphRevisionRef.current.clear();
              setSavedGraphs(graphs);
              if (!graphsHydratedRef.current) {
                graphsHydratedRef.current = true;
                const projectId = msg.payload.projects?.activeProjectId || '';
                let opened = [];
                let preferredId = null;
                if (localDesktopWorkspace) {
                  let storedIds = null;
                  try {
                    const scopedKey = projectId ? `arc_project_${projectId}_arc_open_graph_ids` : 'arc_open_graph_ids';
                    let rawIds = readAppStorage(scopedKey);
                    if (rawIds === null && projectId) {
                      rawIds = readAppStorage('arc_open_graph_ids');
                      if (rawIds !== null) writeAppStorage(scopedKey, rawIds);
                    }
                    if (rawIds !== null) {
                      const parsed = JSON.parse(rawIds);
                      storedIds = Array.isArray(parsed) ? parsed : [];
                    }
                  } catch { storedIds = []; }
                  const savedById = new Map(graphs.map((graph) => [graph.id, graph]));
                  opened = (storedIds === null ? graphs : storedIds.map((id) => savedById.get(id)).filter(Boolean)).slice(0, MAX_OPEN_GRAPH_TABS);
                  preferredId = projectId
                    ? safeStorageGet(`arc_project_${projectId}_arc_active_graph_id`, '')
                    : safeStorageGet('arc_active_graph_id', '');
                  if (!opened.some((graph) => graph.id === preferredId)) preferredId = opened[0]?.id || null;
                } else {
                  projectTabStartupPendingRef.current = true;
                  projectTabSafeRestorePendingRef.current = true;
                  projectTabSafeRestoreProjectRef.current = projectId;
                  projectTabStartupBaselineRef.current = new Set();
                }
                setTabs(opened);
                setActiveTabId(preferredId);
              }
            }
          } else if (msg.type === 'GRAPH_LIBRARY_UPDATED' && msg.payload) {
            if (Array.isArray(msg.payload.templates)) setGraphTemplates(msg.payload.templates);
            if (Array.isArray(msg.payload.snapshots)) setGraphSnapshots(msg.payload.snapshots);
            if (typeof msg.payload.defaultGraphId === 'string') setDefaultGraphId(msg.payload.defaultGraphId);
          } else if (msg.type === 'PROJECTS_UPDATED') {
            const payload = msg.payload || {};
            const nextProjects = Array.isArray(payload.projects) ? payload.projects : [];
            setProjects(nextProjects);
            setMaxProjects(localDesktopWorkspace ? null : payload.maxProjects === undefined ? 10 : payload.maxProjects);
            setNeedsProjectOnboarding(nextProjects.length === 0 || nextProjects.some((project) => project.id === payload.activeProjectId && project.pendingStarterChoice));
          } else if (msg.type === 'PROJECT_CHANGED') {
            const payload = msg.payload || {};
            const nextProjects = Array.isArray(payload.projects) ? payload.projects : [];
            const nextProjectId = payload.activeProjectId || '';
            activeProjectIdRef.current = nextProjectId;
            setProjects(nextProjects);
            setMaxProjects(localDesktopWorkspace ? null : payload.maxProjects === undefined ? 10 : payload.maxProjects);
            setActiveProjectId(nextProjectId);
            setNeedsProjectOnboarding(nextProjects.length === 0 || nextProjects.some((project) => project.id === nextProjectId && project.pendingStarterChoice));
            setProjectVariables(Array.isArray(payload.projectVariables) ? payload.projectVariables : []);
            const projectGraphs = (Array.isArray(payload.graphs) ? payload.graphs : []).map(migrateFunctionGraphEntry);
            reconnectGraphBaseRef.current.clear();
            liveGraphBaseRef.current = new Map(projectGraphs.map((graph) => [graph.id, snapshotGraph(graph)]));
            liveGraphRevisionRef.current.clear();
            lastLiveGraphSentRef.current.clear();
            pendingLiveGraphRef.current.clear();
            setSavedGraphs(projectGraphs);
            setGraphTemplates(payload.graphLibrary?.templates || []);
            setGraphSnapshots(payload.graphLibrary?.snapshots || []);
            setDefaultGraphId(payload.graphLibrary?.defaultGraphId ?? '');
            setBotProfile(payload.botProfile || null);
            setDiscordAuthWarning(payload.discordAuthWarning || null);
            setBotStatus('DISCONNECTED');
            setTabs([]);
            setActiveTabId(null);
            if (!localDesktopWorkspace) {
              projectTabStartupPendingRef.current = true;
              projectTabSafeRestorePendingRef.current = true;
              projectTabSafeRestoreProjectRef.current = nextProjectId;
              projectTabStartupBaselineRef.current = new Set();
            }
            historyRef.current.clear();
            graphsHydratedRef.current = true;
            if (localDesktopWorkspace) {
              const graphs = (Array.isArray(payload.graphs) ? payload.graphs : []).map(migrateFunctionGraphEntry);
              const byId = new Map(graphs.map((graph) => [graph.id, graph]));
              let ids = [];
              try { ids = JSON.parse(safeStorageGet(`arc_project_${nextProjectId}_arc_open_graph_ids`, '[]')); } catch {}
              const opened = (Array.isArray(ids) ? ids.map((id) => byId.get(id)).filter(Boolean) : []).slice(0, MAX_OPEN_GRAPH_TABS);
              setTabs(opened);
              const preferred = safeStorageGet(`arc_project_${nextProjectId}_arc_active_graph_id`, '');
              setActiveTabId(opened.some((graph) => graph.id === preferred) ? preferred : opened[0]?.id || null);
            } else {
              projectTabStartupPendingRef.current = true;
              projectTabSafeRestorePendingRef.current = true;
              projectTabSafeRestoreProjectRef.current = nextProjectId;
              projectTabStartupBaselineRef.current = new Set();
              setTabs([]);
              setActiveTabId(null);
            }
            setWorkspaceRevision((revision) => revision + 1);
          } else if (msg.type === 'PROJECT_VARIABLES_UPDATED') {
            if (!isProjectVariableUpdateForActiveProject(msg.payload, activeProjectIdRef.current)) return;
            setProjectVariables(Array.isArray(msg.payload.variables) ? msg.payload.variables : []);
          } else if (msg.type === 'NOTE_EDIT_LOCKS_UPDATED') {
            const payload = msg.payload || {};
            if (payload.projectId !== activeProjectIdRef.current || payload.graphId !== activeTabIdRef.current) return;
            const locks = Object.fromEntries((Array.isArray(payload.locks) ? payload.locks : []).filter((lock) => lock && typeof lock.noteId === 'string').map((lock) => [lock.noteId, lock]));
            setNoteEditLockState({ roomKey: `${payload.projectId}:${payload.graphId}`, locks });
          } else if (msg.type === 'NOTE_EDIT_LOCK_REJECTED') {
            const payload = msg.payload || {};
            if (payload.projectId === activeProjectIdRef.current && payload.graphId === activeTabIdRef.current) {
              arcEvents.emit('toast:notify', { title: 'Note edit unavailable', message: payload.message || 'This note is no longer available.', type: 'warning' });
            }
          } else if (msg.type === 'NOTE_EDIT_LOCK_LOST' || msg.type === 'NOTE_EDIT_REJECTED') {
            const payload = msg.payload || {};
            if (payload.projectId !== activeProjectIdRef.current || typeof payload.noteId !== 'string') return;
            setTabs((previous) => previous.map((tab) => {
              if (tab.id !== payload.graphId) return tab;
              const notes = Array.isArray(tab.notes) ? tab.notes : [];
              const nextNotes = payload.note && payload.note.id === payload.noteId
                ? (notes.some((note) => note.id === payload.noteId) ? notes.map((note) => note.id === payload.noteId ? payload.note : note) : [...notes, payload.note])
                : notes.filter((note) => note.id !== payload.noteId);
              const next = { ...tab, notes: nextNotes };
              const saved = savedGraphsRef.current.find((graph) => graph.id === tab.id);
              return { ...next, isDirty: saved ? !sameGraphContent(next, saved) : true };
            }));
            if (msg.type === 'NOTE_EDIT_LOCK_LOST') {
              arcEvents.emit('toast:notify', { title: 'Note edit lock expired', message: 'The shared note was restored before editing continued.', type: 'warning' });
            } else {
              const key = `${payload.graphId}:${payload.noteId}`;
              if (!noteEditConflictToastRef.current.has(key)) {
                noteEditConflictToastRef.current.add(key);
                arcEvents.emit('toast:notify', { title: 'Note edit was not shared', message: 'This note is being edited by another collaborator. The shared note text has been restored.', type: 'warning' });
              }
            }
          } else if (msg.type === 'GRAPH_STATE_SYNC' && msg.payload?.graphId) {
            const payload = msg.payload;
            if (payload.projectId !== activeProjectIdRef.current) return;
            if (deletedGraphsRef.current.has(`${payload.projectId}:${payload.graphId}`)) return;
            liveGraphReadyRef.current.add(`${payload.projectId}:${payload.graphId}`);
            setLiveSyncRevision((revision) => revision + 1);
            if (!payload.graph?.id) return;
            const incoming = scrubStoredSecretDrafts(payload.graph, payload.graph);
            if (payload.graphId !== incoming.id) return;
            if (Array.isArray(incoming.arrows)) {
              const lockedArrowIds = new Set(incoming.arrows.filter((arrow) => arrow?.locked).map((arrow) => arrow.id));
              if (lockedArrowIds.size) setTransientCanvasArrows((previous) => previous.filter((arrow) => !lockedArrowIds.has(arrow.id)));
            }
            const previousRevision = liveGraphRevisionRef.current.get(incoming.id) || 0;
            const reconnectBase = reconnectGraphBaseRef.current.get(incoming.id);
            const pending = pendingLiveGraphRef.current.get(incoming.id);
            const isOwnUpdate = payload.clientId === collaborationClientIdRef.current && pending?.syncId === payload.syncId;
            const incomingRevision = Number(payload.revision);
            if (incomingRevision <= previousRevision && liveGraphBaseRef.current.has(incoming.id) && !isOwnUpdate && !payload.resync && !reconnectBase) return;
            liveGraphRevisionRef.current.set(incoming.id, Number.isInteger(incomingRevision) && incomingRevision >= 0 ? incomingRevision : previousRevision + 1);
            if (Array.isArray(incoming.nodes) || Array.isArray(incoming.notes)) {
              const nodePositions = new Map((incoming.nodes || []).map((node) => [node.id, node]));
              const notePositions = new Map((incoming.notes || []).map((note) => [note.id, note]));
              const graphUpdatedAt = Number(payload.updatedAt) || 0;
              setRemoteCollaborationActions((previous) => previous.map((peer) => {
                if (peer.projectId !== payload.projectId || peer.graphId !== payload.graphId || !peer.action
                  || (payload.sourceUserId || payload.user?.id) !== peer.userId) return peer;
                const stateSupersedesPreview = graphUpdatedAt > 0 && graphUpdatedAt >= (Number(peer.updatedAt) || 0);
                let action = peer.action;
                if (Array.isArray(action.nodePositions)) {
                  const remaining = action.nodePositions.filter((position) => {
                    const synced = nodePositions.get(position.id);
                    return !synced || (!stateSupersedesPreview && (synced.x !== position.x || synced.y !== position.y));
                  });
                  action = { ...action, nodePositions: remaining };
                }
                if (Array.isArray(action.notePositions)) {
                  const remaining = action.notePositions.filter((position) => {
                    const synced = notePositions.get(position.id);
                    return !synced || (!stateSupersedesPreview && (synced.x !== position.x || synced.y !== position.y));
                  });
                  action = { ...action, notePositions: remaining };
                }
                return action === peer.action ? peer : { ...peer, action };
              }));
            }
            const base = scrubStoredSecretDrafts(reconnectBase || liveGraphBaseRef.current.get(incoming.id) || savedGraphsRef.current.find((item) => item.id === incoming.id) || incoming, incoming);
            const local = scrubStoredSecretDrafts(tabsRef.current.find((item) => item.id === incoming.id), incoming);
            const mergeBase = scrubStoredSecretDrafts(isOwnUpdate ? pending.graph : base, incoming);
            const merged = mergeGraphState(mergeBase, local || mergeBase, incoming);
            if (reconnectBase && local?.isDirty && !sameGraphContent(local, reconnectBase)
              && !sameGraphContent(incoming, reconnectBase) && !sameGraphContent(local, incoming)) {
              const recoveryGraph = { ...snapshotGraph(local), id: createEditorId('recovery'), name: `${local.name || 'Untitled graph'} recovery` };
              let storedRecoveryDrafts = [];
              try {
                const stored = JSON.parse(safeStorageGet(recoveryStorageKeyRef.current, '[]'));
                if (Array.isArray(stored)) storedRecoveryDrafts = stored;
              } catch {}
              recoveryDraftsRef.current = [...storedRecoveryDrafts.filter((entry) => entry?.graph?.id !== recoveryGraph.id), { graph: recoveryGraph, savedAt: Date.now(), localOnly: true }].slice(-MAX_OPEN_GRAPH_TABS);
              try { safeStorageSet(recoveryStorageKeyRef.current, JSON.stringify(recoveryDraftsRef.current)); } catch {}
              arcEvents.emit('toast:notify', { title: 'Disconnected draft preserved', message: 'A local recovery graph was kept while the latest shared graph loaded.', type: 'warning' });
            }
            if (isOwnUpdate || payload.resync) pendingLiveGraphRef.current.delete(incoming.id);
            setSlashCommandStudio((current) => {
              if (!current || current.graphId !== incoming.id) return current;
              const incomingNode = incoming.nodes?.find((node) => node.id === current.nodeId && node.type === 'event_slash_command');
              if (!incomingNode || !Array.isArray(incomingNode.data?.options)) return current;
              const remoteOptions = addSlashOptionEditorIds(incomingNode.data.options, current.nodeId);
              const baseOptions = slashCommandBaseRef.current.get(current.collabId) || current.options;
              const mergedOptions = mergeCollaborativeValue(baseOptions, current.options, remoteOptions);
              slashCommandBaseRef.current.set(current.collabId, remoteOptions);
              return { ...current, options: mergedOptions, sharedDraft: mergedOptions };
            });
            liveGraphBaseRef.current.set(incoming.id, snapshotGraph(incoming));
            reconnectGraphBaseRef.current.delete(incoming.id);
            lastLiveGraphSentRef.current.set(incoming.id, JSON.stringify(snapshotGraph(incoming)));
            setTabs((current) => current.map((tab) => {
              if (tab.id !== incoming.id) return tab;
              const saved = savedGraphsRef.current.find((item) => item.id === incoming.id);
              return { ...merged, isDirty: saved ? !sameGraphContent(merged, saved) : true };
            }));
          } else if (msg.type === 'GRAPH_AUTOSAVE_FAILED' && msg.payload?.graphId) {
            const payload = msg.payload;
            if (payload.projectId !== activeProjectIdRef.current) return;
            arcEvents.emit('toast:notify', { title: 'Workspace save delayed', message: payload.message || 'The workspace will retry saving this graph.', type: 'warning', id: `graph-autosave-${payload.graphId}` });
          } else if (msg.type === 'GRAPH_AUTOSAVED' && msg.payload?.graphId) {
            const payload = msg.payload;
            if (payload.projectId !== activeProjectIdRef.current) return;
            const graphId = payload.graphId;
            if (Number(payload.revision) !== liveGraphRevisionRef.current.get(graphId)) return;
            const persistedGraph = liveGraphBaseRef.current.get(graphId);
            if (!persistedGraph) return;
            const savedGraph = snapshotGraph(persistedGraph);
            setSavedGraphs((current) => [savedGraph, ...current.filter((graph) => graph.id !== graphId)]);
            setTabs((current) => current.map((tab) => {
              if (tab.id !== graphId || !sameGraphContent(tab, savedGraph)) return tab;
              remoteGraphConflictsRef.current.delete(graphId);
              return { ...savedGraph, isDirty: false };
            }));
            setSaveFeedback({ graphId, savedAt: Number(payload.savedAt) || Date.now() });
          } else if (msg.type === 'GRAPH_STATE_ACK' && msg.payload?.graphId) {
            const pending = pendingLiveGraphRef.current.get(msg.payload.graphId);
            if (pending?.syncId === msg.payload.syncId && pending?.clientId === collaborationClientIdRef.current) {
              lastLiveGraphSentRef.current.set(msg.payload.graphId, pending.serialized);
              pendingLiveGraphRef.current.delete(msg.payload.graphId);
              liveGraphRevisionRef.current.set(msg.payload.graphId, Number(msg.payload.revision) || liveGraphRevisionRef.current.get(msg.payload.graphId) || 0);
              setLiveSyncRevision((revision) => revision + 1);
              rejectedLiveGraphToastRef.current.delete(msg.payload.graphId);
            }
          } else if (msg.type === 'GRAPH_STATE_REJECTED') {
            const graphId = msg.payload?.graphId;
            const pending = graphId ? pendingLiveGraphRef.current.get(graphId) : null;
            if (graphId) {
              pendingLiveGraphRef.current.delete(graphId);
              if (pending) lastLiveGraphSentRef.current.set(graphId, pending.serialized);
              setTabs((current) => current.map((tab) => tab.id === graphId
                ? scrubRejectedSecretDrafts(tab)
                : tab));
              setLiveSyncRevision((revision) => revision + 1);
            }
            if (!graphId || !rejectedLiveGraphToastRef.current.has(graphId)) {
              if (graphId) rejectedLiveGraphToastRef.current.add(graphId);
              arcEvents.emit('toast:notify', { title: 'Live edit not shared', message: msg.payload?.message || 'This workspace did not accept the graph update. Check your graph edit permissions and connection.', type: 'warning' });
            }
          } else if (msg.type === 'GRAPH_DELETED') {
            const payload = msg.payload || {};
            const graphId = payload.graphId;
            if (payload.projectId !== activeProjectIdRef.current || typeof graphId !== 'string') return;
            const graphKey = `${payload.projectId}:${graphId}`;
            if (deletedGraphsRef.current.has(graphKey)) return;
            deletedGraphsRef.current.add(graphKey);
            remoteProjectTabGraphsRef.current.delete(graphKey);
            liveGraphBaseRef.current.delete(graphId);
            reconnectGraphBaseRef.current.delete(graphId);
            liveGraphRevisionRef.current.delete(graphId);
            lastLiveGraphSentRef.current.delete(graphId);
            pendingLiveGraphRef.current.delete(graphId);
            remoteGraphConflictsRef.current.delete(graphId);
            rejectedLiveGraphToastRef.current.delete(graphId);
            unsharedProjectTabIdsRef.current.delete(graphKey);
            historyRef.current.delete(graphId);
            recoveryDraftsRef.current = recoveryDraftsRef.current.filter((entry) => entry.graph?.id !== graphId);
            const sendTimer = liveGraphSendTimersRef.current.get(graphKey);
            if (sendTimer) window.clearTimeout(sendTimer);
            liveGraphSendTimersRef.current.delete(graphKey);
            if (projectTabSyncRef.current.projectId === payload.projectId) {
              projectTabSyncRef.current.graphIds = projectTabSyncRef.current.graphIds.filter((id) => id !== graphId);
            }
            setSavedGraphs((current) => current.filter((graph) => graph.id !== graphId));
            const remainingTabs = tabsRef.current.filter((tab) => tab.id !== graphId);
            setTabs(remainingTabs);
            if (activeTabIdRef.current === graphId) setActiveTabId(remainingTabs[0]?.id || null);
            setRemoteCollaborationActions((current) => current.filter((item) => item.projectId !== payload.projectId || item.graphId !== graphId));
            setGraphChatBubbles((current) => current.filter((bubble) => bubble.projectId !== payload.projectId || bubble.graphId !== graphId));
            setNoteEditLockState((current) => current.roomKey === graphKey ? { roomKey: '', locks: {} } : current);
            if (activeTabIdRef.current === graphId) {
              setActiveNodes([]);
              setActiveConnections([]);
            }
            arcEvents.emit('toast:notify', { title: 'Graph deleted', message: 'This graph was removed from the workspace.', type: 'info' });
          } else if (msg.type === 'GRAPH_UPDATED' && msg.payload?.graph?.id) {
            const incoming = msg.payload.graph;
            if (deletedGraphsRef.current.has(`${activeProjectIdRef.current}:${incoming.id}`)) return;
            const isOwnSave = msg.payload.saveClientId === graphSaveClientIdRef.current;
            const localTabBeforeSave = tabsRef.current.find((tab) => tab.id === incoming.id);
            if (!isOwnSave && !localTabBeforeSave?.isDirty) {
              historyRef.current.delete(incoming.id);
              setHistoryRevision((revision) => revision + 1);
            }
            liveGraphBaseRef.current.set(incoming.id, snapshotGraph(incoming));
            liveGraphRevisionRef.current.delete(incoming.id);
            setSavedGraphs((current) => [incoming, ...current.filter((graph) => graph.id !== incoming.id)]);
            setTabs((current) => current.map((tab) => {
              if (tab.id !== incoming.id) return tab;
              if (tab.isDirty && !sameGraphContent(tab, incoming)) {
                if (!isOwnSave && !remoteGraphConflictsRef.current.has(tab.id)) {
                  remoteGraphConflictsRef.current.add(tab.id);
                  arcEvents.emit('toast:notify', { title: 'Shared graph updated', message: `A collaborator saved “${incoming.name || incoming.id}” while you had local edits. Your draft is preserved; review it before saving.`, type: 'warning' });
                }
                return tab;
              }
              remoteGraphConflictsRef.current.delete(tab.id);
              return { ...incoming, isDirty: false };
            }));
          } else if (msg.type === 'LOG_ENTRY') {
            setLogs((previous) => [...previous.slice(-499), msg.payload]);
          } else if (msg.type === 'COLLABORATORS_UPDATED') {
            setCollaborators(Array.isArray(msg.payload) ? msg.payload : []);
          } else if (msg.type === 'PROJECT_USERS_UPDATED') {
            setProjectUsers(msg.payload && typeof msg.payload === 'object' ? msg.payload : {});
          } else if (msg.type === 'PROJECT_TAB_GRAPH_UPDATED') {
            const payload = msg.payload || {};
            const graph = payload.graph;
            if (payload.projectId !== activeProjectIdRef.current || !graph?.id || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) return;
            if (deletedGraphsRef.current.has(`${payload.projectId}:${graph.id}`)) return;
            remoteProjectTabGraphsRef.current.set(`${payload.projectId}:${graph.id}`, graph);
            unsharedProjectTabIdsRef.current.delete(`${payload.projectId}:${graph.id}`);
            if (!projectTabStartupPendingRef.current && !savedGraphsRef.current.some((item) => item.id === graph.id)) {
              setTabs((previous) => previous.some((item) => item.id === graph.id) || previous.length >= MAX_OPEN_GRAPH_TABS
                ? previous
                : [...previous, { ...graph, isDirty: false }]);
            }
          } else if (msg.type === 'PROJECT_TAB_REJECTED') {
            const payload = msg.payload || {};
            if (payload.projectId !== activeProjectIdRef.current || typeof payload.graphId !== 'string') return;
            const localTab = tabsRef.current.find((tab) => tab.id === payload.graphId);
            const saved = savedGraphsRef.current.some((graph) => graph.id === payload.graphId);
            if (payload.reason === 'limit' && localTab && saved && !localTab.isDirty) {
              const remaining = tabsRef.current.filter((tab) => tab.id !== payload.graphId);
              setTabs(remaining);
              if (activeTabIdRef.current === payload.graphId) setActiveTabId(remaining[0]?.id || null);
              if (projectTabSyncRef.current.projectId === payload.projectId) {
                projectTabSyncRef.current.graphIds = projectTabSyncRef.current.graphIds.filter((id) => id !== payload.graphId);
              }
              arcEvents.emit('toast:notify', { title: 'Shared tab limit reached', message: payload.message || 'Close a shared graph tab before opening another.', type: 'warning' });
              return;
            }
            unsharedProjectTabIdsRef.current.add(`${payload.projectId}:${payload.graphId}`);
            if (projectTabSyncRef.current.projectId === payload.projectId) {
              projectTabSyncRef.current.graphIds = projectTabSyncRef.current.graphIds.filter((id) => id !== payload.graphId);
            }
            arcEvents.emit('toast:notify', { title: 'Graph tab not shared', message: payload.message || 'Save this graph, then reopen it to share the tab.', type: 'warning' });
          } else if (msg.type === 'PROJECT_COLLABORATION_UPDATED') {
            const payload = msg.payload || {};
            if (payload.projectId !== activeProjectIdRef.current) return;
            const graphIds = [...new Set((Array.isArray(payload.graphIds) ? payload.graphIds : []).filter((id) => typeof id === 'string'
              && !deletedGraphsRef.current.has(`${payload.projectId}:${id}`)))].slice(0, MAX_OPEN_GRAPH_TABS);
            setProjectCollaboration({ ...payload, graphIds, users: Array.isArray(payload.users) ? payload.users : [] });
            if (payload.projectLastSeen && typeof payload.projectLastSeen === 'object') setProjectLastSeen(payload.projectLastSeen);
            if (!payload.tabsInitialized) return;
            if (!localDesktopWorkspace && projectTabStartupPendingRef.current) {
              projectTabStartupBaselineRef.current = new Set(graphIds);
              projectTabStartupPendingRef.current = false;
              projectTabSyncRef.current = {
                projectId: payload.projectId,
                socketRevision: socketReadyRevisionRef.current,
                graphIds: tabsRef.current.map((tab) => tab.id)
              };
              return;
            }
            const knownGraphs = new Map([...remoteProjectTabGraphsRef.current.values(), ...savedGraphsRef.current, ...tabsRef.current].map((graph) => [graph.id, graph]));
            const dirtyTabsToPreserve = tabsRef.current.filter((tab) => tab.isDirty && !graphIds.includes(tab.id)
              && !deletedGraphsRef.current.has(`${payload.projectId}:${tab.id}`));
            let effectiveGraphIds = graphIds;
            if (!localDesktopWorkspace) {
              const previousSharedIds = projectTabStartupBaselineRef.current;
              const newlySharedIds = graphIds.filter((id) => !previousSharedIds.has(id));
              const closedSharedIds = new Set([...previousSharedIds].filter((id) => !graphIds.includes(id)));
              const stillOpenLocalIds = tabsRef.current.filter((tab) => !closedSharedIds.has(tab.id)).map((tab) => tab.id);
              effectiveGraphIds = [...new Set([...stillOpenLocalIds, ...newlySharedIds])];
              projectTabStartupBaselineRef.current = new Set(graphIds);
            }
            effectiveGraphIds = [...effectiveGraphIds, ...dirtyTabsToPreserve.map((tab) => tab.id)];
            projectTabSyncRef.current = { projectId: payload.projectId, socketRevision: socketReadyRevisionRef.current, graphIds: effectiveGraphIds };
            const nextTabs = effectiveGraphIds.map((id) => knownGraphs.get(id)).filter(Boolean);
            const retainedGraphIds = new Set(effectiveGraphIds);
            const remoteGraphPrefix = `${payload.projectId}:`;
            for (const key of remoteProjectTabGraphsRef.current.keys()) {
              if (key.startsWith(remoteGraphPrefix) && !retainedGraphIds.has(key.slice(remoteGraphPrefix.length))) remoteProjectTabGraphsRef.current.delete(key);
            }
            for (const tab of dirtyTabsToPreserve) {
              if (remoteTabCloseNoticeRef.current.has(tab.id)) continue;
              remoteTabCloseNoticeRef.current.add(tab.id);
              arcEvents.emit('toast:notify', { title: 'Unsaved graph kept open', message: `A collaborator closed “${tab.name || 'Untitled graph'}”, but your unsaved changes kept it open for everyone.`, type: 'warning' });
            }
            setTabs(nextTabs);
            if (!effectiveGraphIds.includes(activeTabIdRef.current)) setActiveTabId(nextTabs[0]?.id || null);
          } else if (msg.type === 'PROJECT_LAST_SEEN_UPDATED') {
            if (msg.payload && typeof msg.payload === 'object') setProjectLastSeen(msg.payload);
          } else if (msg.type === 'BOT_EXPORT_PROGRESS') {
            const progress = msg.payload;
            if (!progress || progress.projectId !== activeProjectIdRef.current || !progress.exportId) return;
            const toastId = `bot-export:${progress.projectId}:${progress.exportId}`;
            const running = progress.status === 'running';
            setExportInProgress(running);
            arcEvents.emit('toast:notify', {
              id: toastId,
              title: running ? 'Exporting bot' : progress.status === 'complete' ? 'Bot export ready' : 'Bot export failed',
              message: progress.message || (running ? 'Preparing bot export' : 'Could not create bot export.'),
              type: running ? 'info' : progress.status === 'complete' ? 'success' : 'error',
              progress: Number.isFinite(progress.progress) ? progress.progress : null,
              persistent: running,
              dismissible: !running,
              duration: running ? undefined : 5000
            });
          } else if (msg.type === 'GRAPH_CHAT_BUBBLE') {
            const bubble = msg.payload;
            if (!bubble?.id || bubble.projectId !== activeProjectIdRef.current || bubble.graphId !== activeTabIdRef.current
              || typeof bubble.content !== 'string' || !Number.isFinite(bubble.x) || !Number.isFinite(bubble.y)
              || !Number.isFinite(bubble.expiresAt) || bubble.expiresAt <= Date.now()) return;
            const pendingMoveId = pendingGraphChatMovesRef.current.get(bubble.id);
            if (pendingMoveId && bubble.clientActionId !== pendingMoveId) return;
            if (pendingMoveId) pendingGraphChatMovesRef.current.delete(bubble.id);
            setGraphChatBubbles((previous) => [...previous.filter((item) => item.id !== bubble.id
              && (!bubble.clientActionId || item.clientActionId !== bubble.clientActionId) && item.expiresAt > Date.now()), bubble]);
          } else if (msg.type === 'GRAPH_CHAT_EXPIRED') {
            const expired = msg.payload;
            if (expired?.projectId === activeProjectIdRef.current && expired?.graphId === activeTabIdRef.current && expired?.id) {
              pendingGraphChatMovesRef.current.delete(expired.id);
              setGraphChatBubbles((previous) => previous.filter((item) => item.id !== expired.id));
            }
          } else if (msg.type === 'GRAPH_CHAT_REJECTED') {
            if (msg.payload?.clientActionId) setGraphChatBubbles((previous) => previous.filter((bubble) => bubble.clientActionId !== msg.payload.clientActionId));
            arcEvents.emit('toast:notify', { title: 'Canvas message not sent', message: msg.payload?.message || 'Please try again in a moment.', type: 'warning' });
          } else if (msg.type === 'CANVAS_ARROWS_SYNC') {
            const arrows = Array.isArray(msg.payload?.arrows) ? msg.payload.arrows.filter((arrow) => arrow?.projectId === activeProjectIdRef.current
              && arrow?.graphId === activeTabIdRef.current && Number.isFinite(arrow.expiresAt) && arrow.expiresAt > Date.now()) : [];
            setTransientCanvasArrows((previous) => {
              const pending = new Map(previous.filter((arrow) => pendingCanvasArrowActionsRef.current.has(arrow.id)).map((arrow) => [arrow.id, arrow]));
              return arrows.map((arrow) => pending.get(arrow.id) || arrow).concat([...pending.values()].filter((arrow) => !arrows.some((item) => item.id === arrow.id)));
            });
          } else if (msg.type === 'CANVAS_ARROW_UPDATED') {
            const arrow = msg.payload;
            if (!arrow?.id || arrow.projectId !== activeProjectIdRef.current || arrow.graphId !== activeTabIdRef.current
              || !Number.isFinite(arrow.expiresAt) || arrow.expiresAt <= Date.now()) return;
            const pendingActionId = pendingCanvasArrowActionsRef.current.get(arrow.id);
            if (pendingActionId && arrow.clientActionId !== pendingActionId) return;
            if (pendingActionId) pendingCanvasArrowActionsRef.current.delete(arrow.id);
            setTransientCanvasArrows((previous) => [...previous.filter((item) => item.id !== arrow.id && item.expiresAt > Date.now()), arrow]);
          } else if (msg.type === 'CANVAS_ARROW_EXPIRED' || msg.type === 'CANVAS_ARROW_DELETED') {
            const payload = msg.payload || {};
            if (payload.projectId === activeProjectIdRef.current && payload.graphId === activeTabIdRef.current && payload.id) {
              pendingCanvasArrowActionsRef.current.delete(payload.id);
              setTransientCanvasArrows((previous) => previous.filter((arrow) => arrow.id !== payload.id));
            }
          } else if (msg.type === 'CANVAS_ARROW_REJECTED') {
            if (msg.payload?.id) pendingCanvasArrowActionsRef.current.delete(msg.payload.id);
            if (msg.payload?.clientActionId) setTransientCanvasArrows((previous) => previous.filter((arrow) => arrow.clientActionId !== msg.payload.clientActionId));
            arcEvents.emit('toast:notify', { title: 'Arrow change not shared', message: msg.payload?.message || 'This arrow could not be changed.', type: 'warning' });
          } else if (msg.type === 'COLLAB_ACTION_UPDATED') {
            const action = msg.payload;
            if (action?.projectId !== activeProjectIdRef.current || action?.graphId !== activeTabIdRef.current || action.userId === currentUser?.id) return;
            const actionRevision = Number(action.revision);
            const revisionKey = `${action.projectId}:${action.graphId}:${action.userId}`;
            const lastRevision = latestRemoteCollaborationRevisionRef.current.get(revisionKey) || 0;
            if (Number.isFinite(actionRevision) && actionRevision > 0 && actionRevision <= lastRevision) return;
            if (Number.isFinite(actionRevision) && actionRevision > 0) latestRemoteCollaborationRevisionRef.current.set(revisionKey, actionRevision);
            setRemoteCollaborationActions((previous) => [...previous.filter((item) => item.userId !== action.userId), action]);
            if (action.action?.kind === 'studio-draft') {
              if (action.action.studioType === 'embed') {
                setEmbedStudio((current) => {
                  if (current?.collabId !== action.action.studioId) return current;
                  const localDraft = { name: current.name, content: current.content || '', blocks: current.blocks || [], components: current.components || [], componentsV2Layout: current.componentsV2Layout || [], componentsV2Enabled: Boolean(current.componentsV2Enabled), attachments: collaborativeAttachments(current.attachments || []) };
                  const baseDraft = collaborativeEmbedBaseRef.current.get(current.collabId) || localDraft;
                  const merged = mergeCollaborativeValue(baseDraft, localDraft, action.action.draft);
                  collaborativeEmbedBaseRef.current.set(current.collabId, action.action.draft);
                  return { ...current, ...merged, attachments: mergeCollaborativeAttachments(current.attachments || [], action.action.draft.attachments || []), isDirty: true };
                });
              } else if (action.action.studioType === 'arguments') {
                const collabId = action.action.studioId;
                const remoteOptions = Array.isArray(action.action.draft?.options) ? action.action.draft.options : null;
                if (!remoteOptions) return;
                setSlashCommandStudio((current) => {
                  if (current?.collabId !== collabId) return current;
                  const localOptions = current.options || [];
                  const baseOptions = slashCommandBaseRef.current.get(collabId) || localOptions;
                  const mergedOptions = mergeCollaborativeValue(baseOptions, localOptions, remoteOptions);
                  slashCommandBaseRef.current.set(collabId, remoteOptions);
                  return { ...current, options: mergedOptions, sharedDraft: mergedOptions };
                });
              } else {
                const collabId = action.action.studioId;
                const remoteText = String(action.action.draft?.text || '');
                const previous = textCollaborationRef.current.get(collabId) || { baseText: remoteText, localText: remoteText, caret: 0 };
                const mergedText = mergeCollaborativeText(previous.baseText, previous.localText, remoteText, currentUser?.id, action.userId);
                textCollaborationRef.current.set(collabId, { ...previous, baseText: remoteText, localText: mergedText });
                if (mergedText !== remoteText) {
                  sendCollaborationAction({ kind: 'studio-draft', studioId: collabId, studioType: 'text', draft: { text: mergedText, caret: previous.caret } });
                }
                setDiscordTextStudio((current) => current?.collabId === collabId ? { ...current, sharedDraft: mergedText, localDraft: mergedText } : current);
              }
            }
          } else if (msg.type === 'COLLAB_ACTION_CLEARED') {
            const userId = msg.payload?.userId;
            const projectId = msg.payload?.projectId;
            const graphId = msg.payload?.graphId;
            const hasRoomIdentity = typeof projectId === 'string' && typeof graphId === 'string';
            const clearRevision = Number(msg.payload?.revision);
            const revisionKey = `${projectId}:${graphId}:${userId}`;
            const lastRevision = latestRemoteCollaborationRevisionRef.current.get(revisionKey) || 0;
            if (Number.isFinite(clearRevision) && clearRevision > 0 && clearRevision <= lastRevision) return;
            if (Number.isFinite(clearRevision) && clearRevision > 0) latestRemoteCollaborationRevisionRef.current.set(revisionKey, clearRevision);
            setRemoteCollaborationActions((previous) => previous.filter((item) => item.userId !== userId
              || hasRoomIdentity && (item.projectId !== projectId || item.graphId !== graphId)));
          } else if (msg.type === 'LOGS_CLEARED') {
            setLogs([]);
          } else if (msg.type === 'EMBEDS_UPDATED' && Array.isArray(msg.payload?.embeds)) {
            setEmbedAssets(msg.payload.embeds);
          } else if (msg.type === 'BOT_STATUS') {
            setBotStatus(msg.payload.status);
            if (msg.payload.user) setBotProfile((profile) => ({ ...profile, ...msg.payload.user }));
            if (Object.prototype.hasOwnProperty.call(msg.payload, 'discordAuthWarning')) setDiscordAuthWarning(msg.payload.discordAuthWarning || null);
          } else if (msg.type === 'BOT_METRICS') {
            const rateLimitedUntil = Number(msg.payload?.rateLimitedUntil) || 0;
            if (rateLimitedUntil > Date.now() && rateLimitedUntil > rateLimitAnnouncedUntilRef.current) {
              rateLimitAnnouncedUntilRef.current = rateLimitedUntil;
              const seconds = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
              arcEvents.emit('toast:notify', { title: 'Discord API rate limit', message: `Live API requests are paused for about ${seconds}s. Use Simulation while the cooldown clears.`, type: 'warning' });
            }
            setBotMetrics((metrics) => ({ ...metrics, ...msg.payload }));
          } else if (msg.type === 'GRAPH_EXECUTION_PULSE') {
            const { tabId, nodeIds = [] } = msg.payload || {};
            setActivePulseGraphId(tabId || null);
            setActivePulseNodeIds(nodeIds);
            window.setTimeout(() => setActivePulseNodeIds((current) => current.filter((nodeId) => errorPulseUntilRef.current.get(`${tabId}:${nodeId}`) > Date.now())), 1200);
          } else if (msg.type === 'GRAPH_NODE_ERROR') {
            const failure = msg.payload || {};
            const { graphId, graphName, nodeId, nodeLabel, error } = failure;
            if (graphId && nodeId) {
              const expiresAt = Date.now() + 15000;
              errorPulseUntilRef.current.set(`${graphId}:${nodeId}`, expiresAt);
              let graph = tabsRef.current.find((item) => item.id === graphId);
              if (!graph) {
                graph = savedGraphsRef.current.find((item) => item.id === graphId);
                if (graph && tabsRef.current.length < MAX_OPEN_GRAPH_TABS) {
                  setTabs((current) => current.some((item) => item.id === graphId) ? current : [...current, { ...graph, isDirty: false }]);
                } else graph = null;
              }
              if (graph) setActiveTabId(graphId);
              setActivePulseGraphId(graphId);
              setActivePulseNodeIds([nodeId]);
              window.setTimeout(() => {
                if (errorPulseUntilRef.current.get(`${graphId}:${nodeId}`) === expiresAt) {
                  errorPulseUntilRef.current.delete(`${graphId}:${nodeId}`);
                  setActivePulseNodeIds((current) => current.filter((id) => id !== nodeId));
                }
              }, 15000);
            }
            const shortError = String(error || 'An unexpected error occurred.').replace(/\s+/g, ' ').slice(0, 120);
            arcEvents.emit('toast:notify', {
              title: 'Graph node failed',
              message: `${graphName || 'Graph'} · ${nodeLabel || 'Node'}: ${shortError}`,
              type: 'error',
              duration: 15000
            });
          } else if (msg.type === 'MOCK_DEBUG_STEP') {
            setActivePulseNodeIds(msg.payload.step?.nodeId ? [msg.payload.step.nodeId] : []);
            setActivePulseGraphId(msg.payload.tabId || null);
            setActiveDebugStep(msg.payload.step || null);
            arcEvents.emit('simulation:debug-step', msg.payload);
          } else if (msg.type === 'MOCK_DEBUG_FINISHED') {
            setActivePulseNodeIds([]);
            setActivePulseGraphId(null);
            setActiveDebugStep(null);
            arcEvents.emit('simulation:debug-finished', msg.payload);
          }
        } catch { /* malformed/unrelated socket messages. */ }
      };
      currentSocket.onclose = (event) => {
        const closeReason = String(event?.reason || '').toLowerCase();
        const authenticationClose = event?.code === 1008 && (
          closeReason.includes('authentication required')
          || closeReason.includes('session expired')
          || closeReason.includes('permissions changed')
          || closeReason.includes('session revoked')
          || closeReason.includes('change your password')
        );
        if (authenticationClose) {
          forceSignOutRef.current?.();
          active = false;
        }
        if (active) {
          const nextReconnectBases = new Map(liveGraphBaseRef.current);
          for (const [graphId, base] of reconnectGraphBaseRef.current) {
            if (!liveGraphReadyRef.current.has(`${activeProjectIdRef.current}:${graphId}`)) nextReconnectBases.set(graphId, base);
          }
          reconnectGraphBaseRef.current = nextReconnectBases;
        }
        window.clearInterval(heartbeatTimer);
        window.clearTimeout(collaborationActionTimerRef.current);
        collaborationActionTimerRef.current = null;
        pendingCollaborationActionRef.current.clear();
        setRemoteCollaborationActions([]);
        latestRemoteCollaborationRevisionRef.current.clear();
        localCanvasMotionRoomRef.current = '';
        collaborationMotionSendIntervalRef.current = 16;
        setCollaborationConnectionFlaky(false);
        setCollaborators([]);
        setProjectCollaboration({ projectId: '', graphIds: [], tabsInitialized: false, users: [] });
        setNoteEditLockState({ roomKey: '', locks: {} });
        setFollowCollaboratorRequest(null);
        if (active) setCollaborationSocketStatus('reconnecting');
        if (socket === currentSocket) socket = null;
        if (wsRef.current === currentSocket) wsRef.current = null;
        scheduleReconnect();
      };
      currentSocket.onerror = () => currentSocket.close();
    };
    const reconnectWhenOnline = () => {
      if (!active || socket) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    };
    window.addEventListener('online', reconnectWhenOnline);
    //
    initialConnectTimer = window.setTimeout(connect, 0);
    return () => {
      active = false;
      window.removeEventListener('online', reconnectWhenOnline);
      window.clearTimeout(initialConnectTimer);
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.close(1000, 'Studio view changed');
      } else if (socket?.readyState === WebSocket.CONNECTING) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.onopen = () => socket.close(1000, 'Studio view changed');
      }
      if (wsRef.current === socket) wsRef.current = null;
    };
  }, [authToken, remoteWorkspaceUrl, workspaceMode]);

  useEffect(() => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const nextPresence = { projectId: activeProjectId || '', graphId: activeProjectId && !activeGraphIsLocalRecovery ? activeTabId || '' : '' };
    const previousPresence = collaborationPresenceRef.current;
    const pending = [...pendingCollaborationActionRef.current.values()];
    window.clearTimeout(collaborationActionTimerRef.current);
    collaborationActionTimerRef.current = null;
    pendingCollaborationActionRef.current.clear();

    for (const entry of pending) {
      if (entry.projectId === previousPresence.projectId && entry.graphId === previousPresence.graphId && entry.projectId && entry.graphId) {
        socket.send(JSON.stringify({ type: 'COLLAB_ACTION', projectId: entry.projectId, graphId: entry.graphId, action: entry.action }));
      }
    }
    if (activeProjectId) liveGraphReadyRef.current.delete(`${activeProjectId}:${activeTabId}`);
    else setCollaborators([]);
    socket.send(JSON.stringify({ type: 'PRESENCE', ...nextPresence }));
    collaborationPresenceRef.current = nextPresence;
    for (const entry of pending) {
      if (entry.projectId === nextPresence.projectId && entry.graphId === nextPresence.graphId && entry.projectId && entry.graphId
        && (entry.projectId !== previousPresence.projectId || entry.graphId !== previousPresence.graphId)) {
        socket.send(JSON.stringify({ type: 'COLLAB_ACTION', projectId: entry.projectId, graphId: entry.graphId, action: entry.action }));
      }
    }
  }, [activeProjectId, activeGraphIsLocalRecovery, activeTabId, authToken, socketReadyRevision]);

  useEffect(() => {
    if (!authToken || !activeProjectId || !graphsHydratedRef.current) return;
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const graphIds = tabs.filter((tab) => !tab.localRecoveryOnly).map((tab) => tab.id).filter((id) => typeof id === 'string' && !unsharedProjectTabIdsRef.current.has(`${activeProjectId}:${id}`)).slice(0, MAX_OPEN_GRAPH_TABS);
    const previous = projectTabSyncRef.current;
    if (previous.projectId !== activeProjectId || previous.socketRevision !== socketReadyRevision) {
      projectTabSyncRef.current = { projectId: activeProjectId, socketRevision: socketReadyRevision, graphIds };
      let snapshotBytes = 0;
      const snapshots = [];
      const deferredSnapshots = [];
      for (const graphId of graphIds) {
        const graph = tabs.find((tab) => tab.id === graphId);
        if (!graph || savedGraphsRef.current.some((item) => item.id === graphId)) continue;
        try {
          const snapshot = snapshotGraph(graph);
          const size = JSON.stringify(snapshot).length;
          if (size <= 30_000_000 && snapshotBytes + size <= 19_000_000) {
            snapshots.push(snapshot);
            snapshotBytes += size;
          } else if (size <= 30_000_000) deferredSnapshots.push(snapshot);
        } catch {}
      }
      socket.send(JSON.stringify({ type: 'PROJECT_TABS_SYNC', graphIds, ...(snapshots.length ? { graphs: snapshots } : {}) }));
      for (const graph of deferredSnapshots) socket.send(JSON.stringify({ type: 'PROJECT_TAB_OPEN', graphId: graph.id, graph }));
      return;
    }
    const previousIds = new Set(previous.graphIds);
    const nextIds = new Set(graphIds);
    projectTabSyncRef.current = { projectId: activeProjectId, socketRevision: socketReadyRevision, graphIds };
    for (const graphId of previousIds) if (!nextIds.has(graphId)) socket.send(JSON.stringify({ type: 'PROJECT_TAB_CLOSE', graphId }));
    for (const graphId of nextIds) if (!previousIds.has(graphId)) {
      const graph = tabs.find((tab) => tab.id === graphId);
      const isSaved = savedGraphsRef.current.some((item) => item.id === graphId);
      let snapshot;
      if (graph && !isSaved) {
        try {
          const candidate = snapshotGraph(graph);
          if (JSON.stringify(candidate).length <= 30_000_000) snapshot = candidate;
        } catch {}
      }
      socket.send(JSON.stringify({ type: 'PROJECT_TAB_OPEN', graphId, ...(snapshot ? { graph: snapshot } : {}) }));
    }
  }, [activeProjectId, authToken, socketReadyRevision, tabs, workspaceMode]);

  useEffect(() => {
    if (!activeProjectId || !activeTabId) return undefined;
    const graph = tabs.find((tab) => tab.id === activeTabId);
    const socket = wsRef.current;
    if (!graph?.isDirty || !socket || socket.readyState !== WebSocket.OPEN || !liveGraphReadyRef.current.has(`${activeProjectId}:${activeTabId}`)) return undefined;
    if (pendingLiveGraphRef.current.has(graph.id)) return undefined;
    if ([...pendingCollaborationActionRef.current.values()].some((entry) => entry.projectId === activeProjectId && entry.graphId === graph.id
      && (Array.isArray(entry.action.nodePositions) || Array.isArray(entry.action.notePositions)))) return undefined;
    const graphKey = `${activeProjectId}:${graph.id}`;
    if (localCanvasMotionRoomRef.current === graphKey) return undefined;
    if (liveGraphSendTimersRef.current.has(graphKey)) return undefined;
    const timer = window.setTimeout(() => {
      liveGraphSendTimersRef.current.delete(graphKey);
      if (activeProjectIdRef.current !== activeProjectId) return;
      const latestGraph = tabsRef.current.find((tab) => tab.id === graph.id);
      const latestSocket = wsRef.current;
      if (!latestGraph?.isDirty || !latestSocket || latestSocket !== socket || latestSocket.readyState !== WebSocket.OPEN
        || !liveGraphReadyRef.current.has(`${activeProjectId}:${graph.id}`)) return;
      if (localCanvasMotionRoomRef.current === graphKey) return;
      if ([...pendingCollaborationActionRef.current.values()].some((entry) => entry.projectId === activeProjectId && entry.graphId === graph.id
        && (Array.isArray(entry.action.nodePositions) || Array.isArray(entry.action.notePositions)))) return;
      if (pendingLiveGraphRef.current.has(graph.id)) return;
      const graphState = snapshotGraph(latestGraph, { includeSecretDrafts: true });
      const serialized = JSON.stringify(graphState);
      if (lastLiveGraphSentRef.current.get(graph.id) === serialized) return;
      const syncId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingLiveGraphRef.current.set(graph.id, { serialized, syncId, clientId: collaborationClientIdRef.current, graph: graphState });
      latestSocket.send(JSON.stringify({
        type: 'GRAPH_STATE',
        projectId: activeProjectId,
        graphId: graph.id,
        baseRevision: liveGraphRevisionRef.current.get(graph.id) || 0,
        clientId: collaborationClientIdRef.current,
        syncId,
        graph: graphState
      }));
    }, 40);
    liveGraphSendTimersRef.current.set(graphKey, timer);
    return undefined;
  }, [activeProjectId, activeTabId, liveSyncRevision, socketReadyRevision, tabs]);

  useEffect(() => {
    if (!graphsHydratedRef.current || !activeProjectId || !localDesktopWorkspace) return;
    safeStorageSet(`arc_project_${activeProjectId}_arc_open_graph_ids`, JSON.stringify(tabs.map((tab) => tab.id)));
    if (activeTabId) safeStorageSet(`arc_project_${activeProjectId}_arc_active_graph_id`, activeTabId);
    else safeStorageRemove(`arc_project_${activeProjectId}_arc_active_graph_id`);
  }, [tabs, activeTabId, activeProjectId, localDesktopWorkspace]);

  useEffect(() => {
    if (localDesktopWorkspace || !projectTabSafeRestorePendingRef.current || !activeProjectId || !currentUser?.id
      || !graphsHydratedRef.current || projectTabSafeRestoreProjectRef.current !== activeProjectId
      || !projectCollaboration.tabsInitialized || projectCollaboration.projectId !== activeProjectId) return;

    const route = initialBrowserRouteRef.current;
    if (route?.graphId || route?.emptyWorkspace || route?.studio?.kind) {
      projectTabSafeRestorePendingRef.current = false;
      return;
    }

    const restoreKey = `arc_project_${activeProjectId}_arc_user_${currentUser.id}_last_graph_id`;
    const lastGraphId = safeStorageGet(restoreKey, '');
    projectTabSafeRestorePendingRef.current = false;
    if (!lastGraphId) return;

    const anotherUserHasGraphOpen = projectCollaboration.users.some((user) => user.userId !== currentUser.id && user.graphIds?.includes(lastGraphId));
    if (anotherUserHasGraphOpen) return;

    const recentEditor = (projectCollaboration.graphActivity || []).find((entry) => entry.graphId === lastGraphId);
    if (recentEditor?.userId && recentEditor.userId !== currentUser.id
      && Date.now() - Number(recentEditor.updatedAt || 0) <= 30 * 60 * 1000) return;

    const graph = savedGraphs.find((item) => item.id === lastGraphId)
      || remoteProjectTabGraphsRef.current.get(`${activeProjectId}:${lastGraphId}`);
    if (!graph || tabsRef.current.length >= MAX_OPEN_GRAPH_TABS) return;
    setTabs([graph]);
    setActiveTabId(graph.id);
  }, [activeProjectId, currentUser?.id, localDesktopWorkspace, projectCollaboration, savedGraphs, socketReadyRevision]);

  useEffect(() => {
    if (!activeTabId) {
      setActiveNodes([]);
      setActiveConnections([]);
      return;
    }
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (graph) {
      setActiveNodes(graph.nodes || []);
      setActiveConnections(graph.connections || []);
    }
  }, [activeTabId, tabs]);

  const recordHistory = useCallback((graphId = activeTabId, { force = false, graph: fallbackGraph = null } = {}) => {
    if (!graphId || historyGroupRef.current) return;
    const graph = tabs.find((tab) => tab.id === graphId) || fallbackGraph;
    if (!graph) return;
    let history = historyRef.current.get(graphId);
    if (!history) {
      history = { past: [], future: [], lastAt: 0 };
      historyRef.current.set(graphId, history);
    }
    const now = Date.now();
    const hadRedo = history.future.length > 0;
    if (force || now - history.lastAt > 500) {
      history.past.push(snapshotGraph(graph));
      if (history.past.length > 100) history.past.shift();
    }
    history.future = [];
    if (force || now - history.lastAt > 500 || hadRedo) setHistoryRevision((revision) => revision + 1);
    history.lastAt = now;
  }, [activeTabId, tabs]);

  const handleHistoryGroupStart = useCallback(() => {
    if (historyGroupRef.current) return;
    historyGroupRef.current = true;
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (graph) {
      let history = historyRef.current.get(activeTabId);
      if (!history) { history = { past: [], future: [], lastAt: 0 }; historyRef.current.set(activeTabId, history); }
      history.past.push(snapshotGraph(graph));
      if (history.past.length > 100) history.past.shift();
      history.future = [];
      history.lastAt = Date.now();
      setHistoryRevision((revision) => revision + 1);
    }
  }, [activeTabId, tabs]);

  const handleHistoryGroupEnd = useCallback(() => { historyGroupRef.current = false; }, []);

  const handleNodesChange = useCallback((nextNodes) => {
    const previousNodes = activeGraph?.nodes || activeNodes;
    const previousIds = previousNodes.map((node) => node.id).join('|');
    const nextIds = nextNodes.map((node) => node.id).join('|');
    const structuralChange = previousIds !== nextIds;
    recordHistory(activeTabId, { force: structuralChange });
    setActiveNodes(nextNodes);
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
  }, [activeGraph, activeNodes, activeTabId, recordHistory]);

  const handleTagGroupsChange = useCallback((nextGroups) => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    recordHistory(activeTabId, { force: true, graph });
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, tagGroups: nextGroups, isDirty: true } : tab));
  }, [tabs, activeTabId, recordHistory]);
  const handleGraphArrowsChange = useCallback((nextArrows) => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    recordHistory(activeTabId, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, arrows: nextArrows, isDirty: true } : tab));
  }, [tabs, activeTabId, recordHistory]);

  const handleGraphNotesChange = useCallback((nextNotes) => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    recordHistory(activeTabId, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, notes: nextNotes, isDirty: true } : tab));
  }, [tabs, activeTabId, recordHistory]);

  const openNodeRename = (node) => {
    if (!node) return;
    const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
    setNodeRenameValue(node.label || definition?.label || node.type);
    setNodeRenameDialog({ nodeId: node.id, fallback: definition?.label || node.type });
  };

  const saveNodeRename = (event) => {
    event?.preventDefault?.();
    if (!nodeRenameDialog) return;
    const label = nodeRenameValue.trim() || nodeRenameDialog.fallback;
    handleNodesChange(activeNodes.map((node) => node.id === nodeRenameDialog.nodeId ? { ...node, label } : node));
    setNodeRenameDialog(null);
  };

  const openTagGroupDialog = (nodeId = null, existingGroup = null, noteIds = []) => {
    setTagGroupDialog(existingGroup ? { id: existingGroup.id } : { id: null });
    setTagGroupName(existingGroup?.name || '');
    setTagGroupColor(existingGroup?.color || TAG_GROUP_COLORS[0].value);
    setTagGroupNodeIds(existingGroup ? [...(existingGroup.nodeIds || [])] : Array.isArray(nodeId) ? [...nodeId] : nodeId ? [nodeId] : []);
    setTagGroupNoteIds(existingGroup ? [...(existingGroup.noteIds || [])] : [...noteIds]);
    setTagGroupSearch('');
    setTagGroupError('');
  };

  const saveTagGroup = (event) => {
    event?.preventDefault?.();
    const name = tagGroupName.trim();
    const nodeIds = [...new Set(tagGroupNodeIds)].filter((id) => activeNodes.some((node) => node.id === id));
    const noteIds = [...new Set(tagGroupNoteIds)].filter((id) => (activeGraph?.notes || []).some((note) => note.id === id));
    if (!name) return setTagGroupError('Give this section a name.');
    if (!nodeIds.length && !noteIds.length) return setTagGroupError('Choose at least one node or note.');
    const group = { id: tagGroupDialog?.id || `tag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: name.slice(0, 48), color: tagGroupColor, nodeIds, noteIds };
    const currentGroups = activeGraph?.tagGroups || [];
    handleTagGroupsChange(tagGroupDialog?.id ? currentGroups.map((item) => item.id === group.id ? group : item) : [...currentGroups, group]);
    setTagGroupDialog(null);
  };

  const handleConnectionsChange = useCallback((nextConnections) => {
    recordHistory(activeTabId, { force: true });
    setActiveConnections(nextConnections);
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, connections: nextConnections, isDirty: true } : tab));
  }, [activeTabId, recordHistory]);

  const handleVariablesChange = useCallback((nextVariables) => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    recordHistory(activeTabId, { force: true, graph });
    const previousVariables = Array.isArray(graph.variables) ? graph.variables : [];
    const persistableVariables = nextVariables.filter((item) => !item.nodeOwned);
    const changedTypeIds = new Set(previousVariables.filter((item) => persistableVariables.some((next) => next.id === item.id && next.type !== item.type)).map((item) => item.id));
    const affectedNodeIds = new Set((graph.nodes || []).filter((node) =>
      (['variable_get', 'variable_set'].includes(node.type) && changedTypeIds.has(node.data?.variableId))
      || (node.type === 'format_text' && previousVariables.some((variable) => changedTypeIds.has(variable.id) && new RegExp(`\\{\\{\\s*${escapeRegExp(variable.name)}\\s*\\}\\}`).test(node.data?.template || '')))
    ).map((node) => node.id));
    const nextNodes = graph.nodes || [];
    const nextConnections = (graph.connections || []).filter((connection) => !affectedNodeIds.has(connection.sourceNodeId) && !affectedNodeIds.has(connection.targetNodeId));
    if (affectedNodeIds.size && graph.id === activeTabId) {
      setActiveNodes(nextNodes);
      setActiveConnections(nextConnections);
    }
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? {
      ...tab,
      variables: persistableVariables,
      isDirty: true,
      nodes: affectedNodeIds.size ? nextNodes : tab.nodes,
      connections: affectedNodeIds.size ? nextConnections : tab.connections
    } : tab));
  }, [tabs, activeTabId, recordHistory]);

  const handleProjectVariablesChange = useCallback((nextVariables) => {
    if (!authToken) return;
    const projectId = activeProjectId;
    setProjectVariables(nextVariables);
    const revision = ++projectVariablesSaveRef.current.revision;
    window.clearTimeout(projectVariablesSaveRef.current.timer);
    setSavingProjectVariables(true);
    projectVariablesSaveRef.current.timer = window.setTimeout(async () => {
      try {
        const response = await fetch(apiUrl('/api/variables/project'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
          body: JSON.stringify({ projectId, variables: nextVariables })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save project variables.');
        if (projectVariablesSaveRef.current.revision === revision && activeProjectIdRef.current === projectId) {
          setProjectVariables(Array.isArray(data.variables) ? data.variables : nextVariables);
          if (Array.isArray(data.disabledBuiltInVariables)) setDisabledBuiltInVariables(data.disabledBuiltInVariables);
        }
      } catch (error) {
        if (projectVariablesSaveRef.current.revision !== revision || activeProjectIdRef.current !== projectId) return;
        arcEvents.emit('toast:notify', { title: 'Project variables not saved', message: error.message, type: 'error' });
        try {
          const response = await fetch(apiUrl('/api/variables/project'), { headers: { 'x-arc-token': authToken } });
          const data = await response.json();
          if (response.ok && activeProjectIdRef.current === projectId && Array.isArray(data.variables)) {
            setProjectVariables(data.variables);
            if (Array.isArray(data.disabledBuiltInVariables)) setDisabledBuiltInVariables(data.disabledBuiltInVariables);
          }
        } catch {}
      } finally {
        if (projectVariablesSaveRef.current.revision === revision) setSavingProjectVariables(false);
      }
    }, 220);
  }, [authToken, activeProjectId]);

  const handleRestoreSystemVariable = useCallback(async (name) => {
    if (!authToken || !activeProjectId) return false;
    try {
      const response = await fetch(apiUrl('/api/variables/project/restore-builtin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not restore system variable.');
      if (Array.isArray(data.variables)) setProjectVariables(data.variables);
      if (Array.isArray(data.disabledBuiltInVariables)) setDisabledBuiltInVariables(data.disabledBuiltInVariables);
      arcEvents.emit('toast:notify', { title: 'System variable restored', message: `${name} is now restored and active.`, type: 'success' });
      return true;
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Could not restore system variable', message: error.message, type: 'error' });
      return false;
    }
  }, [authToken, activeProjectId]);

  useEffect(() => () => window.clearTimeout(projectVariablesSaveRef.current.timer), [activeProjectId, workspaceRevision, authToken]);

  const notifyGraphCheckIssues = useCallback((graph, lookup = graphLookup) => {
    const report = validateGraph(graph, lookup, botProfile?.intentSummary, projectVariables);
    if (!report.errors.length) return;
    const now = Date.now();
    if (now - graphCheckToastAtRef.current < 5000) return;
    graphCheckToastAtRef.current = now;
    arcEvents.emit('toast:notify', {
      title: 'Graph needs attention',
      message: `${report.errors.length} issue${report.errors.length === 1 ? '' : 's'} found`,
      type: 'warning'
    });
  }, [graphLookup, botProfile?.intentSummary, projectVariables]);

  const persistGraph = useCallback(async (graph, name = graph?.name) => {
    if (!graph || !authToken) return false;
    setSavingGraphIds((current) => current.includes(graph.id) ? current : [...current, graph.id]);
    triggerLoadingBar();
    try {
      const graphToSave = { ...graph, name };
      delete graphToSave.isDirty;
      delete graphToSave.localRecoveryOnly;
      const body = JSON.stringify(graphToSave);
      const hasAttachments = (graphToSave.nodes || []).some((node) => (node.data?.attachments || []).some((file) => typeof file.data === 'string' && file.data.startsWith('data:')));
      if (hasAttachments) setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent: 0 });
      const response = await xhrJson(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken, 'x-arc-save-client-id': graphSaveClientIdRef.current },
        body,
        onUploadProgress: hasAttachments ? (percent) => setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent }) : undefined
      });
      const data = response.data;
      if (!response.ok) throw new Error(data.error || 'Could not save graph.');
      unsharedProjectTabIdsRef.current.delete(`${activeProjectId}:${graph.id}`);
      setTabs((previous) => previous.map((tab) => {
        if (tab.id !== graph.id) return tab;
        return sameGraphContent(tab, graphToSave) ? { ...data.graph, isDirty: false } : { ...tab, name: data.graph.name, isDirty: true };
      }));
      remoteGraphConflictsRef.current.delete(graph.id);
      setSavedGraphs((previous) => [data.graph, ...previous.filter((item) => item.id !== data.graph.id)]);
      setSaveFeedback({ graphId: graph.id, savedAt: Date.now() });
      const validationLookup = new Map(graphLookup);
      validationLookup.set(data.graph.id, data.graph);
      notifyGraphCheckIssues(data.graph, validationLookup);
      return data.graph;
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Save failed', message: error.message, type: 'error' });
      return false;
    } finally {
      setGraphUploadProgress((current) => current?.graphId === graph.id ? null : current);
      setSavingGraphIds((current) => current.filter((id) => id !== graph.id));
    }
  }, [activeProjectId, authToken, graphLookup, notifyGraphCheckIssues, triggerLoadingBar]);

  const saveGraphWithProgress = useCallback(async (graph) => {
    if (graph?.localRecoveryOnly) throw new Error('Save this local recovery graph to the workspace before using it here.');
    setSavingGraphIds((current) => current.includes(graph.id) ? current : [...current, graph.id]);
    const graphToSave = { ...graph };
    delete graphToSave.isDirty;
    delete graphToSave.localRecoveryOnly;
    const hasAttachments = (graphToSave.nodes || []).some((node) => (node.data?.attachments || []).some((file) => typeof file.data === 'string' && file.data.startsWith('data:')));
    if (hasAttachments) setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent: 0 });
    try {
      const response = await xhrJson(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken, 'x-arc-save-client-id': graphSaveClientIdRef.current },
        body: JSON.stringify(graphToSave),
        onUploadProgress: hasAttachments ? (percent) => setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent }) : undefined
      });
      if (!response.ok) throw new Error(response.data.error || `Could not save ${graph.name || 'graph'}.`);
      unsharedProjectTabIdsRef.current.delete(`${activeProjectId}:${graph.id}`);
      const validationLookup = new Map(graphLookup);
      validationLookup.set(response.data.graph.id, response.data.graph);
      notifyGraphCheckIssues(response.data.graph, validationLookup);
      return response.data.graph;
    } finally {
      setGraphUploadProgress((current) => current?.graphId === graph.id ? null : current);
      setSavingGraphIds((current) => current.filter((id) => id !== graph.id));
    }
  }, [activeProjectId, authToken, graphLookup, notifyGraphCheckIssues]);

  useEffect(() => {
    if (!authToken || !localDesktopWorkspace || settings.autoSave === false) return undefined;
    const intervalSeconds = Math.max(5, Math.min(300, Number(settings.autoSaveIntervalSeconds) || 30));
    const timer = window.setInterval(async () => {
      for (const graph of tabsRef.current) {
        if (!graph?.isDirty || graph.localRecoveryOnly || remoteGraphConflictsRef.current.has(graph.id) || autoSaveInFlightRef.current.has(graph.id)) continue;
        autoSaveInFlightRef.current.add(graph.id);
        const savedSnapshot = snapshotGraph(graph);
        try {
          const saved = await saveGraphWithProgress(graph);
          liveGraphBaseRef.current.set(graph.id, snapshotGraph(saved));
          setSavedGraphs((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          setTabs((current) => current.map((tab) => tab.id !== graph.id ? tab
            : sameGraphContent(tab, savedSnapshot) ? { ...saved, isDirty: false } : tab));
        } catch (error) {
          arcEvents.emit('toast:notify', { title: 'Auto-save failed', message: error.message || `Could not save ${graph.name || 'graph'}.`, type: 'error' });
        } finally {
          autoSaveInFlightRef.current.delete(graph.id);
        }
      }
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [authToken, localDesktopWorkspace, saveGraphWithProgress, settings.autoSave, settings.autoSaveIntervalSeconds]);

  const recoveryWorkspace = workspaceMode === 'remote' ? (() => { try { const url = new URL(remoteWorkspaceUrl); return `${url.origin}${url.pathname}`; } catch { return 'remote'; } })() : (desktopMode ? 'desktop-local' : window.location.origin);
  const recoveryStorageKey = `arc_graph_recovery:${workspaceMode}:${recoveryWorkspace}:${currentUser?.id || 'guest'}:${activeProjectId || 'default'}`;
  const recoveryStorageKeyRef = useRef(recoveryStorageKey);
  recoveryStorageKeyRef.current = recoveryStorageKey;
  useEffect(() => {
    if (!authToken || !activeProjectId || !graphsHydratedRef.current || recoveryLoadedKey === recoveryStorageKey) return;
    recoveryDraftsRef.current = [];
    let stored = [];
    try { stored = JSON.parse(safeStorageGet(recoveryStorageKey, '[]')); } catch {}
    const savedById = new Map(savedGraphs.map((graph) => [graph.id, graph]));
    const recoverable = (Array.isArray(stored) ? stored : []).filter((entry) => entry?.graph?.id
      && (localDesktopWorkspace || entry.localOnly === true)
      && (!savedById.has(entry.graph.id) || !sameGraphContent(entry.graph, savedById.get(entry.graph.id))))
      .slice(0, MAX_OPEN_GRAPH_TABS);
    recoveryDraftsRef.current = recoverable;
    if (recoverable.length) {
      const recovered = recoverable.map((entry) => ({ ...entry.graph, isDirty: true, ...(entry.localOnly ? { localRecoveryOnly: true } : {}) }));
      setTabs((current) => {
        const byId = new Map(recovered.map((graph) => [graph.id, graph]));
        for (const graph of current) if (!byId.has(graph.id)) byId.set(graph.id, graph);
        return [...byId.values()].slice(0, MAX_OPEN_GRAPH_TABS);
      });
      setActiveTabId(recovered.at(-1)?.id || activeTabId);
      arcEvents.emit('toast:notify', {
        title: `Restored ${recoverable.length} unsaved graph${recoverable.length === 1 ? '' : 's'}`,
        message: 'Your tabs are open as unsaved graphs.',
        type: 'success'
      });
    }
    setRecoveryLoadedKey(recoveryStorageKey);
  }, [authToken, activeProjectId, activeTabId, localDesktopWorkspace, recoveryLoadedKey, recoveryStorageKey, savedGraphs]);

  useEffect(() => {
    if (!authToken || !activeProjectId || recoveryLoadedKey !== recoveryStorageKey) return;
    const entries = new Map(recoveryDraftsRef.current.map((entry) => [entry.graph.id, entry]));
    for (const graph of tabs) {
      if (!graph?.id) continue;
      const saved = savedGraphs.find((item) => item.id === graph.id);
      if (graph.localRecoveryOnly || localDesktopWorkspace && (graph.isDirty || !saved)) {
        entries.set(graph.id, { graph: snapshotGraph(graph), savedAt: Date.now(), ...(graph.localRecoveryOnly ? { localOnly: true } : {}) });
      }
      else if (sameGraphContent(graph, saved)) entries.delete(graph.id);
    }
    const next = [...entries.values()].filter((entry) => {
      if (!localDesktopWorkspace && entry.localOnly !== true) return false;
      const saved = savedGraphs.find((graph) => graph.id === entry.graph.id);
      return !saved || !sameGraphContent(saved, entry.graph);
    }).slice(0, MAX_OPEN_GRAPH_TABS);
    recoveryDraftsRef.current = next;
    try {
      if (next.length) safeStorageSet(recoveryStorageKey, JSON.stringify(next));
      else safeStorageRemove(recoveryStorageKey);
    } catch {}
  }, [authToken, activeProjectId, localDesktopWorkspace, recoveryLoadedKey, recoveryStorageKey, savedGraphs, tabs]);

  const handleSaveGraph = useCallback(async () => {
    if (!activeTabId || !authToken) return;
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    if (!savedGraphs.some((saved) => saved.id === graph.id)) {
      setNameDialogError('');
      setNameDialog({ graphId: graph.id, value: graph.name || '', mode: 'save' });
      return;
    }
    await persistGraph(graph);
  }, [activeTabId, authToken, persistGraph, savedGraphs, tabs]);

  const handleRenameGraph = useCallback((graph) => {
    if (!graph) return;
    setNameDialogError('');
    setNameDialog({ graphId: graph.id, value: graph.name || '', mode: 'rename' });
  }, []);

  const handleDuplicateGraph = useCallback(async (sourceGraph) => {
    if (!sourceGraph) return;
    if (tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab before duplicating this graph.', type: 'warning' });
      return;
    }
    const baseName = `${sourceGraph.name || 'Untitled graph'} copy`;
    const existingNames = new Set([...savedGraphs, ...tabs].map((graph) => String(graph.name || '').toLowerCase()));
    let name = baseName;
    let suffix = 2;
    while (existingNames.has(name.toLowerCase())) name = `${baseName} ${suffix++}`;
    const clone = structuredClone(sourceGraph);
    const id = `graph_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    const nodeIds = new Map((clone.nodes || []).map((node) => [node.id, `node_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`]));
    clone.id = id;
    clone.name = name;
    clone.nodes = (clone.nodes || []).map((node) => ({ ...node, id: nodeIds.get(node.id) }));
    clone.connections = (clone.connections || []).map((connection) => ({
      ...connection,
      id: `connection_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
      sourceNodeId: nodeIds.get(connection.sourceNodeId) || connection.sourceNodeId,
      targetNodeId: nodeIds.get(connection.targetNodeId) || connection.targetNodeId
    }));
    clone.isDirty = true;
    setTabs((previous) => [...previous, clone]);
    setActiveTabId(id);
    setIsLibraryOpen(false);
    const saved = await persistGraph(clone, name);
    if (saved) setTabs((previous) => previous.map((tab) => tab.id === id ? { ...saved, isDirty: false } : tab));
  }, [persistGraph, savedGraphs, tabs]);

  const closeTabImmediately = useCallback((id) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    recoveryDraftsRef.current = recoveryDraftsRef.current.filter((entry) => entry.graph?.id !== id);
    historyRef.current.delete(id);
    historyGroupRef.current = false;
    if (activeTabId === id) setActiveTabId(remaining[Math.min(index, remaining.length - 1)]?.id || null);
  }, [activeTabId, tabs]);

  const handleNameDialogSubmit = useCallback(async (event) => {
    event?.preventDefault?.();
    const name = String(nameDialog?.value || '').trim();
    if (!name) { setNameDialogError('Enter a graph name.'); return; }
    const graph = tabs.find((tab) => tab.id === nameDialog?.graphId) || savedGraphs.find((item) => item.id === nameDialog?.graphId);
    if (!graph) { setNameDialog(null); setNameDialogError(''); return; }
    const renamed = { ...graph, name, isDirty: true };
    const isSaveMode = nameDialog.mode === 'save' || nameDialog.mode === 'save-close';
    const wasAlreadySaved = savedGraphs.some((item) => item.id === graph.id);

    setNameDialog(null);
    setNameDialogError('');

    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? renamed : tab));
    setSavedGraphs((previous) => previous.map((item) => item.id === graph.id ? { ...item, name } : item));

    if (isSaveMode || wasAlreadySaved) {
      const saved = await persistGraph(renamed, name);
      if (saved && nameDialog.mode === 'save-close') {
        closeTabImmediately(graph.id);
      }
    } else {
      arcEvents.emit('toast:notify', { title: 'Name updated', message: `${name} · save to keep this change.`, type: 'success' });
    }
  }, [nameDialog, persistGraph, savedGraphs, tabs, closeTabImmediately]);

  const handleAutoLayout = useCallback(() => {
    if (!localDesktopWorkspace || !activeNodes.length) return;
    const nodes = activeNodes.map((node, index) => ({
      ...node,
      x: 72 + index * 286,
      y: 104 + (index % 2 ? 46 : 0)
    }));
    handleNodesChange(nodes);
  }, [activeNodes, handleNodesChange, localDesktopWorkspace]);

  const handleExportGraph = useCallback(async () => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    const exportData = { ...graph };
    delete exportData.isDirty;
    let blob;
    try {
      const payload = { format: 'arc-graph', version: 1, graph: exportData };
      payload.integrity = { algorithm: 'sha256', digest: await sha256Hex(stableJson(payload)) };
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/vnd.arc-studio.graph+json' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Graph export failed', message: error.message || 'Could not calculate the file integrity check.', type: 'error' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(graph.name || 'graph').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.arcgraph`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [activeTabId, tabs]);

  const ensureWorkspaceGraphsSaved = useCallback(async () => {
    if (!authToken) throw new Error('Sign in again before saving graphs.');
    const unsavedTabs = tabs.filter((graph) => graph.isDirty || !savedGraphs.some((saved) => saved.id === graph.id));
    const savedNow = [];
    for (const graph of unsavedTabs) {
      savedNow.push(await saveGraphWithProgress(graph));
    }
    if (savedNow.length) {
      const byId = new Map(savedNow.map((graph) => [graph.id, graph]));
      setSavedGraphs((previous) => [...byId.values(), ...previous.filter((graph) => !byId.has(graph.id))]);
      setTabs((previous) => previous.map((graph) => {
        const saved = byId.get(graph.id);
        return saved ? (sameGraphContent(graph, saved) ? { ...saved, isDirty: false } : graph) : graph;
      }));
    }
  }, [authToken, savedGraphs, saveGraphWithProgress, tabs]);

  const rememberUserGraph = useCallback((graphId, projectId = activeProjectId) => {
    if (!localDesktopWorkspace && currentUser?.id && projectId && typeof graphId === 'string' && graphId) {
      safeStorageSet(`arc_project_${projectId}_arc_user_${currentUser.id}_last_graph_id`, graphId);
    }
  }, [activeProjectId, currentUser?.id, localDesktopWorkspace]);

  const handleAddTab = useCallback((sourceGraph = null, { blank = false } = {}) => {
    if (tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab to open another graph. Saved graphs remain available in the Library.', type: 'warning' });
      return null;
    }
    const id = createEditorId('graph');
    const selectedSource = blank ? null : sourceGraph || savedGraphs.find((graph) => graph.id === defaultGraphId) || graphTemplates.find((graph) => graph.id === defaultGraphId);
    const sourceNodes = selectedSource?.nodes || (blank ? [] : [{ id: `node_${Date.now()}`, type: 'event_slash_command', label: 'On Slash Command', x: 72, y: 104, data: { commandName: 'help', description: 'Show help and bot information.' } }]);
    const clonedNodes = structuredClone(sourceNodes);
    const nodeIds = new Map(clonedNodes.map((node) => [node.id, createEditorId('node')]));
    const graph = {
      id,
      ...(selectedSource?.graphType ? { graphType: selectedSource.graphType } : {}),
      name: sourceGraph ? `${sourceGraph.name || 'Template'} copy` : getNextProjectGraphName([...savedGraphs, ...tabs]),
      variables: structuredClone(selectedSource?.variables || []),
      nodes: clonedNodes.map((node) => ({ ...node, id: nodeIds.get(node.id) })),
      connections: structuredClone(selectedSource?.connections || []).map((connection) => ({ ...connection, id: createEditorId('connection'), sourceNodeId: nodeIds.get(connection.sourceNodeId) || connection.sourceNodeId, targetNodeId: nodeIds.get(connection.targetNodeId) || connection.targetNodeId })),
      isDirty: false
    };
    setTabs((previous) => [...previous, graph]);
    setActiveTabId(id);
    rememberUserGraph(id);
    return graph;
  }, [defaultGraphId, graphTemplates, rememberUserGraph, savedGraphs, tabs]);

  const handleAddBlankGraph = useCallback(() => handleAddTab(null, { blank: true }), [handleAddTab]);

  const handleAddFunctionGraph = useCallback(() => {
    if (tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab to open another graph.', type: 'warning' });
      return;
    }
    const graphId = createEditorId('function');
    const graph = {
      id: graphId,
      graphType: 'function',
      name: `Function ${functionGraphs.length + 1}`,
      variables: [],
      nodes: [
        { id: `${graphId}_input`, type: 'function_input', label: 'Function Input', x: 72, y: 145, data: { arguments: [
          { paramId: 'param_a', name: 'A', valueType: 'number', optional: false, defaultValue: 0 },
          { paramId: 'param_b', name: 'B', valueType: 'number', optional: false, defaultValue: 0 }
        ] } },
        { id: `${graphId}_add`, type: 'math_add', label: 'Add', x: 390, y: 145, data: {} },
        { id: `${graphId}_scale`, type: 'math_multiply', label: 'Multiply', x: 690, y: 145, data: {} },
        { id: `${graphId}_factor`, type: 'value_number', label: 'Number', x: 390, y: 330, data: { value: 2 } },
        { id: `${graphId}_return`, type: 'function_return', label: 'Return Value', x: 1000, y: 145, data: { valueType: 'number' } }
      ],
      connections: [
        { id: `${graphId}_wire_a`, sourceNodeId: `${graphId}_input`, sourcePinId: 'arg_param_a', targetNodeId: `${graphId}_add`, targetPinId: 'a' },
        { id: `${graphId}_wire_b`, sourceNodeId: `${graphId}_input`, sourcePinId: 'arg_param_b', targetNodeId: `${graphId}_add`, targetPinId: 'b' },
        { id: `${graphId}_wire_sum`, sourceNodeId: `${graphId}_add`, sourcePinId: 'result', targetNodeId: `${graphId}_scale`, targetPinId: 'a' },
        { id: `${graphId}_wire_factor`, sourceNodeId: `${graphId}_factor`, sourcePinId: 'value', targetNodeId: `${graphId}_scale`, targetPinId: 'b' },
        { id: `${graphId}_wire_result`, sourceNodeId: `${graphId}_scale`, sourcePinId: 'result', targetNodeId: `${graphId}_return`, targetPinId: 'value' }
      ],
      isDirty: false
    };
    setTabs((previous) => [...previous, graph]);
    setActiveTabId(graphId);
    rememberUserGraph(graphId);
    setIsLibraryOpen(false);
  }, [functionGraphs.length, rememberUserGraph, tabs.length]);

  const handleSaveGraphTemplate = useCallback(async (graph) => {
    if (!authToken || !graph) return;
    try {
      const { isDirty, ...snapshot } = graph;
      const res = await fetch(apiUrl('/api/graphs/templates'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ graph: snapshot }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save template.');
      setGraphTemplates(data.templates || []);
      arcEvents.emit('toast:notify', { title: 'Template saved', message: data.template.name, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Template save failed', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleDeleteGraphTemplate = useCallback(async (template) => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl(`/api/graphs/templates/${encodeURIComponent(template.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete template.');
      setGraphTemplates(data.templates || []);
      setDefaultGraphId(data.defaultGraphId || 'tab_slash_help');
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Template delete failed', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleSetDefaultGraph = useCallback(async (graph) => {
    if (!authToken || !graph) return;
    const isCurrentDefault = defaultGraphId === graph.id;
    try {
      if (isCurrentDefault) {
        if (graph.id === 'tab_slash_help') {
          arcEvents.emit('toast:notify', { title: 'Default active', message: 'New graphs already use the standard slash command starter.', type: 'info' });
          return;
        }
        const res = await fetch(apiUrl('/api/graphs/default'), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
          body: JSON.stringify({ graphId: 'tab_slash_help' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not reset the default graph.');
        setDefaultGraphId(data.defaultGraphId || 'tab_slash_help');
        arcEvents.emit('toast:notify', { title: 'Default removed', message: 'Restored the standard slash command graph for new graphs.', type: 'info' });
        return;
      }

      let targetGraphId = graph.id;
      const isSaved = savedGraphs.some((saved) => saved.id === graph.id) || graphTemplates.some((t) => t.id === graph.id);
      if (!isSaved) {
        const saved = await persistGraph(graph);
        if (!saved) return;
        targetGraphId = saved.id;
      } else if (graph.isDirty) {
        await persistGraph(graph);
      }

      const res = await fetch(apiUrl('/api/graphs/default'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ graphId: targetGraphId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change the default graph.');
      setDefaultGraphId(data.defaultGraphId);
      arcEvents.emit('toast:notify', { title: 'Default updated', message: `${graph.name || 'Graph'} will be used for new graphs.`, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Default update failed', message: error.message, type: 'error' });
    }
  }, [authToken, defaultGraphId, graphTemplates, persistGraph, savedGraphs]);

  const handleCloseTab = useCallback((id) => {
    const closingGraph = tabs.find((tab) => tab.id === id);
    if (!closingGraph) return;
    const initialState = initialGraphStatesRef.current.get(id)
      || savedGraphs.find((saved) => saved.id === id)
      || closingGraph;
    if (sameGraphContent(closingGraph, initialState)) {
      closeTabImmediately(id);
      return;
    }
    setCloseGraphDialog({ id, name: closingGraph.name || 'Untitled graph' });
  }, [closeTabImmediately, savedGraphs, tabs]);

  const handleSaveAndCloseGraph = useCallback(async () => {
    if (!closeGraphDialog) return;
    const graph = tabs.find((tab) => tab.id === closeGraphDialog.id);
    if (!graph) { setCloseGraphDialog(null); return; }
    const isSaved = savedGraphs.some((saved) => saved.id === graph.id);
    setCloseGraphDialog(null);
    if (!isSaved) {
      setNameDialogError('');
      setNameDialog({ graphId: graph.id, value: graph.name || '', mode: 'save-close' });
      return;
    }
    if (await persistGraph(graph)) closeTabImmediately(graph.id);
  }, [closeGraphDialog, tabs, savedGraphs, persistGraph, closeTabImmediately]);

  const handleDiscardAndCloseGraph = useCallback(() => {
    if (!closeGraphDialog) return;
    closeTabImmediately(closeGraphDialog.id);
    setCloseGraphDialog(null);
  }, [closeGraphDialog, closeTabImmediately]);

  const handleOpenGraph = useCallback((graph) => {
    const existing = tabs.some((tab) => tab.id === graph.id);
    if (!existing && tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab to open another graph. Saved graphs remain available in the Library.', type: 'warning' });
      return;
    }
    if (!existing) setTabs((previous) => [...previous, { ...graph, isDirty: false }]);
    setActiveTabId(graph.id);
    rememberUserGraph(graph.id);
    setIsLibraryOpen(false);
  }, [rememberUserGraph, tabs]);

  const traceGraphNode = useCallback((graphId, nodeId) => {
    const graph = graphLookup.get(graphId);
    if (!graph || !nodeId) return;
    setEmbedStudio(null);
    setDiscordTextStudio(null);
    setPermissionStudio(null);
    handleOpenGraph(graph);
    setNodeFocusRequest({ graphId, nodeId, requestId: ++traceRequestIdRef.current });
    const expiresAt = Date.now() + 15000;
    errorPulseUntilRef.current.set(`${graphId}:${nodeId}`, expiresAt);
    setActivePulseGraphId(graphId);
    setActivePulseNodeIds([nodeId]);
    window.setTimeout(() => {
      if (errorPulseUntilRef.current.get(`${graphId}:${nodeId}`) === expiresAt) {
        errorPulseUntilRef.current.delete(`${graphId}:${nodeId}`);
        setActivePulseNodeIds((current) => current.filter((id) => id !== nodeId));
      }
    }, 15000);
  }, [graphLookup, handleOpenGraph]);

  const handleImportGraph = useCallback(async (file) => {
    if (!authToken || !file) return;
    try {
      const parsed = JSON.parse(await file.text());
      let integrityWarning = '';
      if (parsed?.format === 'arc-graph') {
        if (!parsed.integrity) integrityWarning = 'This graph has no integrity record. It may be an older export.';
        else {
          const { integrity, ...content } = parsed;
          const expected = await sha256Hex(stableJson(content));
          if (integrity.algorithm !== 'sha256' || integrity.digest !== expected) {
            arcEvents.emit('toast:notify', { title: 'Graph file may be corrupted', message: 'The SHA-256 integrity check failed. The file was not imported.', type: 'warning', duration: 7000 });
            return;
          }
        }
      } else if (/\.arcgraph$/i.test(file.name || '')) integrityWarning = 'This graph has no integrity record. It may be an older export.';
      const graph = parsed?.graph || parsed;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) throw new Error('Choose a valid ARC Studio graph file.');
      if (!graph.name) graph.name = file.name.replace(/\.arcgraph$|\.arc\.json$|\.json$/i, '').replace(/[_-]+/g, ' ') || 'Imported graph';
      let confirmCollaborativeText = false;
      if (externalCollaborativeWorkspace && hasImportableTextContent(graph)) {
        confirmCollaborativeText = window.confirm(`This graph contains text or request fields. Importing it into “${externalWorkspaceName}” makes this content visible to members with graph read permission and editable by members with graph write permission. Continue?`);
        if (!confirmCollaborativeText) return;
      }
      const body = JSON.stringify({ graph, confirmCollaborativeText });
      const hasAttachments = (graph.nodes || []).some((node) => (node.data?.attachments || []).some((attachment) => typeof attachment.data === 'string' && attachment.data.startsWith('data:')));
      if (hasAttachments) setGraphUploadProgress({ graphId: graph.id || 'import', graphName: graph.name || 'Graph', percent: 0 });
      let data;
      try {
        const response = await xhrJson(apiUrl('/api/graphs/import'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
          body,
          onUploadProgress: hasAttachments ? (percent) => setGraphUploadProgress({ graphId: graph.id || 'import', graphName: graph.name || 'Graph', percent }) : undefined
        });
        data = response.data;
        if (!response.ok) throw new Error(data.error || 'Could not import this graph.');
      } finally {
        if (hasAttachments) setGraphUploadProgress((current) => current?.graphId === (graph.id || 'import') ? null : current);
      }
      setSavedGraphs((previous) => [data.graph, ...previous.filter((item) => item.id !== data.graph.id)]);
      handleOpenGraph(data.graph);
      arcEvents.emit('toast:notify', integrityWarning
        ? { title: 'Graph imported with a warning', message: integrityWarning, type: 'warning', duration: 7000 }
        : { title: 'Graph imported', message: `${data.graph.name} added to the Library.`, type: 'success' });
    } catch (error) {
      const corrupted = /integrity|corrupt/i.test(error.message || '');
      arcEvents.emit('toast:notify', { title: corrupted ? 'Graph file may be corrupted' : 'Import failed', message: error.message || 'Could not read this graph file.', type: corrupted ? 'warning' : 'error' });
    }
  }, [authToken, externalCollaborativeWorkspace, externalWorkspaceName, handleOpenGraph]);
  desktopGraphImportHandlerRef.current = handleImportGraph;

  const handleDeleteSavedGraphs = useCallback(async (graphs) => {
    const targets = [...new Map(graphs.filter((graph) => graph?.id).map((graph) => [graph.id, graph])).values()];
    if (!authToken || !targets.length) return;
    const names = targets.slice(0, 3).map((graph) => graph.name || 'Untitled graph').join(', ');
    const extra = targets.length > 3 ? ` and ${targets.length - 3} more` : '';
    const confirmation = targets.length === 1
      ? `Delete “${names}” from the Library? This cannot be undone.`
      : `Delete these ${targets.length} saved graphs from the Library? ${names}${extra}. This cannot be undone.`;
    if (!window.confirm(confirmation)) return;

    const deletedIds = [];
    let nextDefaultGraphId = null;
    let deleteError = null;
    for (const graph of targets) {
      try {
        const response = await fetch(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Could not delete ${graph.name || 'saved graph'}.`);
        deletedIds.push(graph.id);
        nextDefaultGraphId = data.defaultGraphId || 'tab_slash_help';
      } catch (error) {
        deleteError = error;
        break;
      }
    }

    if (deletedIds.length) {
      const deleted = new Set(deletedIds);
      setSavedGraphs((previous) => previous.filter((graph) => !deleted.has(graph.id)));
      setDefaultGraphId(nextDefaultGraphId || 'tab_slash_help');
      const remaining = tabs.filter((tab) => !deleted.has(tab.id));
      setTabs(remaining);
      if (deleted.has(activeTabId)) setActiveTabId(remaining[0]?.id || null);
    }

    if (deleteError) {
      const message = deletedIds.length
        ? `${deletedIds.length} graph${deletedIds.length === 1 ? '' : 's'} deleted. ${deleteError.message}`
        : deleteError.message;
      arcEvents.emit('toast:notify', { title: 'Delete incomplete', message, type: 'error' });
      return;
    }
    arcEvents.emit('toast:notify', {
      title: targets.length === 1 ? 'Graph deleted' : 'Graphs deleted',
      message: targets.length === 1 ? names : `${deletedIds.length} graphs removed from the Library`,
      type: 'success'
    });
  }, [activeTabId, authToken, tabs]);
  const handleDeleteSavedGraph = useCallback((graph) => handleDeleteSavedGraphs([graph]), [handleDeleteSavedGraphs]);

  const handleExportBot = useCallback(async (projectId = activeProjectId, skipReview = false, exportOptions = {}) => {
    if (!authToken || exportInFlightRef.current) return;
    const exportProjectId = typeof projectId === 'string' ? projectId : activeProjectId;
    if (!skipReview) {
      const exportGraphs = [...new Map(savedGraphs.map((graph) => [graph.id, graph])).values()];
      const issues = exportGraphs.flatMap((graph) => {
        const report = validateGraph(graph, graphLookup, botProfile?.intentSummary, projectVariables);
        return [
          ...report.errors.map((message) => ({ graphId: graph.id, nodeId: report.errorNodeIds?.[message], graphName: graph.name || 'Untitled graph', kind: 'error', message })),
          ...report.warnings.map((message) => ({ graphId: graph.id, nodeId: report.warningNodeIds?.[message], graphName: graph.name || 'Untitled graph', kind: 'warning', message }))
        ];
      });
      for (const graph of exportGraphs) for (const node of graph.nodes || []) {
        const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
        if (!definition || definition.pluginAdapter) issues.push({ graphId: graph.id, nodeId: node.id, graphName: graph.name || 'Untitled graph', kind: 'error', message: `${node.label || node.type}: this node type is not supported by the standalone bot runtime.` });
      }
      const gatewayIntents = [...new Set(['GUILDS', 'GUILD_EMOJIS_AND_STICKERS', ...exportGraphs.flatMap((graph) => (graph.nodes || []).flatMap((node) => BuiltInNodeDefinitions.find((definition) => definition.type === node.type)?.gatewayIntents || []))])].sort();
      const disabledIntents = gatewayIntents.filter((intent) => botProfile?.intentSummary?.some((item) => item.key === intent && item.portalEnabled === false));
      for (const intent of disabledIntents) issues.push({ kind: 'warning', message: `${intent.replaceAll('_', ' ')} is required by the exported graphs but is currently disabled in the Discord Developer Portal.` });
      const permissions = new Set();
      for (const graph of exportGraphs) for (const node of graph.nodes || []) {
        if (['action_send_message', 'action_edit_message', 'action_edit_components'].includes(node.type)) {
          permissions.add('View Channels');
          permissions.add('Send Messages');
          if (node.type === 'action_send_message' && (String(node.data?.thread_id || '').trim() || graph.connections?.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'thread_id'))) permissions.add('Send Messages in Threads');
          if (node.data?.embed || node.data?.blocks?.length || graph.connections?.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed')) permissions.add('Embed Links');
          if (node.data?.files?.length || graph.connections?.some((wire) => ['files', 'file_data'].includes(wire.targetPinId) && wire.targetNodeId === node.id)) permissions.add('Attach Files');
        }
        if (node.type === 'action_create_thread') {
          permissions.add('View Channels');
          const typeIsWired = graph.connections?.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'thread_type');
          const threadType = String(node.data?.thread_type || 'public').toLowerCase();
          if (typeIsWired || !['public', 'private'].includes(threadType)) {
            permissions.add('Create Public Threads');
            permissions.add('Create Private Threads');
          } else permissions.add(threadType === 'private' ? 'Create Private Threads' : 'Create Public Threads');
        }
        if (node.type === 'action_start_thread_from_message') {
          permissions.add('View Channels');
          permissions.add('Send Messages');
          permissions.add('Create Public Threads');
        }
        if (['action_create_channel', 'action_edit_channel', 'action_delete_channel', 'action_voice_channel_status'].includes(node.type)) permissions.add('Manage Channels');
        if (['action_create_role', 'action_member_role'].includes(node.type)) permissions.add('Manage Roles');
        if (node.type === 'action_voice_state') permissions.add('Move Members');
      }
      const graphNames = exportGraphs.map((graph) => graph.name || 'Untitled graph');
      const usesCryptoNodes = exportGraphs.some((graph) => (graph.nodes || []).some((node) => ['action_crypto_encrypt', 'action_crypto_decrypt'].includes(node.type)));
      let canIncludeBotToken = false;
      let hasBotToken = false;
      try {
        const response = await fetch(apiUrl('/api/bot/state'), { headers: { 'x-arc-token': authToken } });
        if (response.ok) {
          const botState = await response.json();
          canIncludeBotToken = botState.canExportBotToken === true;
          hasBotToken = exportProjectId === activeProjectId && Boolean(botState.hasToken);
        }
      } catch {}
      const summary = {
        graphNames,
        graphCount: exportGraphs.length,
        nodeCount: exportGraphs.reduce((count, graph) => count + (graph.nodes?.length || 0), 0),
        variableCount: exportGraphs.reduce((count, graph) => count + (graph.variables?.length || 0), 0) + projectVariables.length,
        requiredIntents: gatewayIntents,
        requiredPermissions: [...permissions].sort(),
        unsupportedNodeCount: exportGraphs.reduce((count, graph) => count + (graph.nodes || []).filter((node) => {
          const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
          return !definition || definition.pluginAdapter;
        }).length, 0),
        runtime: 'Node.js 22 or newer',
        configuration: [
          'The ZIP includes a .env file and an .env.example listing all supported variables.',
          'The bot token is left blank unless you choose to include it.',
          ...(usesCryptoNodes ? ['You can include a generated ARC_CRYPTO_SECRET for AES nodes with no passphrase.'] : [])
        ],
        usesCryptoNodes,
        canIncludeBotToken,
        showBotTokenOption: canIncludeBotToken,
        hasBotToken,
        isActiveProject: exportProjectId === activeProjectId,
        included: ['graphs.json and project-variables.json', 'integrity.json with SHA-256 file hashes', 'src/index.js, src/env.js, and src/engine/{GraphRunner,NodeRegistry,MathOperations,CronSchedule,SafeHttpRequest,PluginStore}.js', 'src/security/CryptoEngine.js', 'Chezcord source and package metadata under chezcord/', 'package.json, README.md, .env, .env.example, and LICENSE']
      };
      setExportReviewSections({});
      setExportReview({
        projectId: exportProjectId,
        issues,
        summary,
        includeCryptoSecret: usesCryptoNodes,
        includeBotToken: false
      });
      return;
    }
    exportInFlightRef.current = true;
    setExportInProgress(true);
    const exportId = globalThis.crypto?.randomUUID?.() || `export_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const toastId = `bot-export:${exportProjectId}:${exportId}`;
    const reportProgress = (percent, detail) => arcEvents.emit('toast:notify', {
      id: toastId,
      title: 'Exporting bot',
      message: detail,
      type: 'info',
      persistent: true,
      dismissible: false,
      progress: Math.max(0, Math.min(100, Math.round(percent)))
    });
    try {
      reportProgress(2, 'Preparing graph data');
      const body = JSON.stringify({
        projectId: exportProjectId,
        exportId,
        includeCryptoSecret: exportOptions.includeCryptoSecret === true,
        includeBotToken: exportOptions.includeBotToken === true
      });
      const blob = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', apiUrl('/api/graphs/export/bot.zip'));
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('x-arc-token', authToken);
        request.responseType = 'blob';
        request.addEventListener('load', async () => {
          if (request.status >= 200 && request.status < 300) return resolve(request.response);
          let message = 'Could not export bot.';
          try {
            const data = JSON.parse(await request.response.text());
            message = data.error || message;
          } catch {}
          reject(new Error(message));
        });
        request.addEventListener('error', () => reject(new Error('The server could not be reached. Check the connection and try again.')));
        request.addEventListener('abort', () => reject(new Error('The export was cancelled.')));
        request.send(body);
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'arc-bot-export.zip';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const alreadyRunning = /already running for this project/i.test(error.message || '');
      arcEvents.emit('toast:notify', { id: toastId, title: alreadyRunning ? 'Bot export in progress' : 'Export failed', message: alreadyRunning ? 'A collaborator is already building this project export.' : error.message, type: alreadyRunning ? 'info' : 'error', persistent: false, dismissible: true, duration: 5000 });
    } finally {
      exportInFlightRef.current = false;
      setExportInProgress(false);
    }
  }, [activeProjectId, authToken, botProfile?.intentSummary, currentUser, graphLookup, projectVariables, savedGraphs, tabs]);

  const applyHistorySnapshot = useCallback((snapshot, graphId) => {
    const restored = { ...snapshot, isDirty: true };
    setTabs((previous) => previous.map((tab) => tab.id === graphId ? restored : tab));
    if (graphId === activeTabId) {
      setActiveNodes(restored.nodes || []);
      setActiveConnections(restored.connections || []);
    }
  }, [activeTabId]);

  const handleUndo = useCallback(() => {
    if (embedStudioOpenForActiveGraph) {
      const history = embedStudioHistoryRef.current.get(embedStudio?.collabId);
      const previous = history?.past.pop();
      const current = embedStudioRef.current;
      if (!history || !previous || !current) return;
      history.future.push(snapshotEmbedStudio(current));
      history.lastAt = 0;
      const restored = { ...current, ...previous, isDirty: true };
      setEmbedStudio(restored);
      sendCollaborationAction({ kind: 'studio-draft', studioId: current.collabId, studioType: 'embed', draft: collaborativeEmbedDraft(restored) });
      setHistoryRevision((revision) => revision + 1);
      return;
    }
    if (slashCommandStudioOpenForActiveGraph) {
      const history = slashCommandStudioHistoryRef.current.get(slashCommandStudio?.collabId);
      const previous = history?.past.pop();
      const current = slashCommandStudioRef.current;
      if (!history || !previous || !current) return;
      history.future.push(structuredClone(Array.isArray(current.options) ? current.options : []));
      history.lastAt = 0;
      const restored = { ...current, options: previous, sharedDraft: previous };
      setSlashCommandStudio(restored);
      sendCollaborationAction({ kind: 'studio-draft', studioId: current.collabId, studioType: 'arguments', draft: { options: previous } });
      setHistoryRevision((revision) => revision + 1);
      return;
    }
    const history = historyRef.current.get(activeTabId);
    const previous = history?.past.pop();
    if (!history || !previous || !activeGraph) return;
    history.future.push(snapshotGraph(activeGraph));
    history.lastAt = 0;
    applyHistorySnapshot(previous, activeTabId);
    setHistoryRevision((revision) => revision + 1);
  }, [activeGraph, activeTabId, applyHistorySnapshot, embedStudio?.collabId, embedStudioOpenForActiveGraph, sendCollaborationAction, setEmbedStudio, setSlashCommandStudio, slashCommandStudio?.collabId, slashCommandStudioOpenForActiveGraph]);

  const handleRedo = useCallback(() => {
    if (embedStudioOpenForActiveGraph) {
      const history = embedStudioHistoryRef.current.get(embedStudio?.collabId);
      const next = history?.future.pop();
      const current = embedStudioRef.current;
      if (!history || !next || !current) return;
      history.past.push(snapshotEmbedStudio(current));
      history.lastAt = 0;
      const restored = { ...current, ...next, isDirty: true };
      setEmbedStudio(restored);
      sendCollaborationAction({ kind: 'studio-draft', studioId: current.collabId, studioType: 'embed', draft: collaborativeEmbedDraft(restored) });
      setHistoryRevision((revision) => revision + 1);
      return;
    }
    if (slashCommandStudioOpenForActiveGraph) {
      const history = slashCommandStudioHistoryRef.current.get(slashCommandStudio?.collabId);
      const next = history?.future.pop();
      const current = slashCommandStudioRef.current;
      if (!history || !next || !current) return;
      history.past.push(structuredClone(Array.isArray(current.options) ? current.options : []));
      history.lastAt = 0;
      const restored = { ...current, options: next, sharedDraft: next };
      setSlashCommandStudio(restored);
      sendCollaborationAction({ kind: 'studio-draft', studioId: current.collabId, studioType: 'arguments', draft: { options: next } });
      setHistoryRevision((revision) => revision + 1);
      return;
    }
    const history = historyRef.current.get(activeTabId);
    const next = history?.future.pop();
    if (!history || !next || !activeGraph) return;
    history.past.push(snapshotGraph(activeGraph));
    history.lastAt = 0;
    applyHistorySnapshot(next, activeTabId);
    setHistoryRevision((revision) => revision + 1);
  }, [activeGraph, activeTabId, applyHistorySnapshot, embedStudio?.collabId, embedStudioOpenForActiveGraph, sendCollaborationAction, setEmbedStudio, setSlashCommandStudio, slashCommandStudio?.collabId, slashCommandStudioOpenForActiveGraph]);

  const handleValidateGraph = useCallback(() => {
    if (!activeGraph) return;
    const report = validateGraph(activeGraph, graphLookup, botProfile?.intentSummary, projectVariables);
      setValidationResult({ ...report, graphId: activeGraph.id, graphName: activeGraph?.name || 'Untitled graph' });
  }, [activeGraph, graphLookup, botProfile?.intentSummary, projectVariables]);

  const validationStatus = graphValidation.errors.length ? 'error' : graphValidation.warnings.length ? 'warning' : 'success';
  const newNodesUserKey = `${globalThis.location?.origin || 'arc'}:${apiUrl('/api/system/status')}:${desktopMode ? workspaceMode : 'web'}:${currentUser?.id || currentUser?.username || 'guest'}`;

  const makeNode = useCallback((type, position = null, data = null, label = null) => {
    const definition = BuiltInNodeDefinitions.find((item) => item.type === type);
    if (!definition) return null;
    if (!isNodeTypeSupported(type, supportedWorkspaceNodeTypes, failedWorkspaceNodeTypes)) return null;
    const nodeData = data ? structuredClone(data) : createDefaultNodeData(type);
    if (type === 'function_input' && !Array.isArray(nodeData.arguments)) nodeData.arguments = createDefaultNodeData(type).arguments;
    if (['variable_get', 'variable_set'].includes(type) && !availableVariables.some((variable) => variable.id === nodeData.variableId)) nodeData.variableId = '';
    return {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      label: label || definition.label,
      createdAt: new Date().toISOString(),
      x: position?.x ?? 300 + Math.random() * 24,
      y: position?.y ?? 150 + Math.random() * 24,
      data: nodeData
    };
  }, [availableVariables, failedWorkspaceNodeTypes, supportedWorkspaceNodeTypes]);

  const appendNodeToGraph = useCallback((graph, node) => {
    if (!graph || !node) return;
    const additions = Array.isArray(node) ? node : [node];
    if (graph.id === activeTabId) {
      handleNodesChange([...activeNodes, ...additions]);
      return;
    }
    recordHistory(graph.id, { force: true, graph });
    const nextNodes = [...(graph.nodes || []), ...additions];
    setActiveNodes(nextNodes);
    setActiveConnections(graph.connections || []);
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    setActiveTabId(graph.id);
  }, [activeNodes, activeTabId, handleNodesChange, recordHistory]);

  const handlePlaceNode = useCallback((type, position = null) => {
    if (!isNodeTypeSupported(type, supportedWorkspaceNodeTypes, failedWorkspaceNodeTypes)) return;
    const targetGraph = activeGraph || handleAddBlankGraph();
    if (!targetGraph) return;
    if (type === 'function_input' && (targetGraph.graphType !== 'function' || (targetGraph.nodes || []).some((item) => item.type === 'function_input'))) {
      arcEvents.emit('toast:notify', { title: 'Function Input unavailable', message: 'A function graph has one Function Input node. Add arguments to that node.', type: 'warning' });
      return;
    }
    const center = position || paletteNodePosition || viewportCenterRef.current;
    const node = makeNode(type, nodeTopLeftAtCenter(type, center));
    appendNodeToGraph(targetGraph, node);
    setPaletteNodePosition(null);
  }, [activeGraph, appendNodeToGraph, failedWorkspaceNodeTypes, handleAddBlankGraph, makeNode, paletteNodePosition, supportedWorkspaceNodeTypes]);

  const openPaletteAt = useCallback((position = null) => {
    const validPosition = Number.isFinite(position?.x) && Number.isFinite(position?.y) ? position : null;
    setPaletteNodePosition(validPosition || viewportCenterRef.current);
    setIsPaletteOpen(true);
  }, []);

  const handleDropNode = useCallback((payload, position) => {
    const requestedTypes = payload?.type === 'multi-node'
      ? payload.nodeTypes || []
      : [payload?.type === 'graph-call' ? 'function_call' : payload?.type === 'prefab' ? nodePrefabs.find((item) => item.id === payload.prefabId)?.node?.type : payload?.type === 'embed-asset' ? 'build_embed' : payload?.type === 'variable-get' ? 'variable_get' : payload?.nodeType].filter(Boolean);
    if (requestedTypes.length && !requestedTypes.some((type) => isNodeTypeSupported(type, supportedWorkspaceNodeTypes, failedWorkspaceNodeTypes))) return;
    const targetGraph = activeGraph || handleAddBlankGraph();
    if (!targetGraph) return;
    if (requestedTypes.includes('function_input') && (targetGraph.graphType !== 'function' || (targetGraph.nodes || []).some((item) => item.type === 'function_input') || requestedTypes.filter((type) => type === 'function_input').length > 1)) {
      arcEvents.emit('toast:notify', { title: 'Function Input unavailable', message: 'A function graph has one Function Input node. Add arguments to that node.', type: 'warning' });
      return;
    }
    const placement = position || nodeTopLeftAtCenter(
      payload?.type === 'graph-call' ? 'function_call' : payload?.type === 'prefab' ? nodePrefabs.find((item) => item.id === payload.prefabId)?.node?.type : payload?.type === 'embed-asset' ? 'build_embed' : payload?.nodeType,
      viewportCenterRef.current
    );
    let nodesToAdd = [];
    if (payload?.type === 'multi-node') {
      nodesToAdd = (payload.nodeTypes || []).map((type, index) => makeNode(type, { x: placement.x + (index % 3) * 220, y: placement.y + Math.floor(index / 3) * 150 })).filter(Boolean);
    } else if (payload?.type === 'variable-get') {
      const variables = Array.isArray(payload.variables) && payload.variables.length ? payload.variables : [payload.data || {}];
      nodesToAdd = variables.filter((item) => availableVariables.some((variable) => variable.id === item.variableId && (variable.scope || 'graph') === (item.scope || 'graph')))
        .map((item, index) => makeNode('variable_get', { x: placement.x + (index % 3) * 220, y: placement.y + Math.floor(index / 3) * 150 }, { variableId: item.variableId, scope: item.scope || 'graph' })).filter(Boolean);
      if (!nodesToAdd.length) return;
    }
    let node;
    if (payload?.type === 'graph-call') {
      const graph = graphLookup.get(payload.graphId);
      if (!graph || graph.id === targetGraph.id) return;
      node = makeNode('function_call', placement, { graphId: graph.id }, `Call ${graph.name || 'Graph'}`);
    } else if (payload?.type === 'prefab') {
      const prefab = nodePrefabs.find((item) => item.id === payload.prefabId);
      if (!prefab?.node) return;
      node = makeNode(prefab.node.type, placement, prefab.node.data, prefab.node.label || prefab.name);
    } else if (payload?.type === 'embed-asset') {
      node = makeNode('build_embed', placement, { blocks: structuredClone(payload.blocks || []), components: structuredClone(payload.components || []), attachments: structuredClone(payload.attachments || []), embedName: payload.name || 'Untitled embed' }, payload.name || 'Embed');
    } else {
      node = makeNode(payload?.nodeType, placement);
    }
    if (nodesToAdd.length) appendNodeToGraph(targetGraph, nodesToAdd);
    else if (node) appendNodeToGraph(targetGraph, node);
  }, [activeGraph, appendNodeToGraph, availableVariables, graphLookup, handleAddBlankGraph, makeNode, nodePrefabs, supportedWorkspaceNodeTypes]);

  const handleRequestSaveNodePrefab = useCallback((node) => {
    if (!node) return;
    setNodePrefabError('');
    setNodePrefabDialog({ node: structuredClone(node), name: node.label || BuiltInNodeDefinitions.find((definition) => definition.type === node.type)?.label || 'Node' });
  }, []);

  const handleSaveNodePrefab = useCallback((event) => {
    event?.preventDefault?.();
    const name = String(nodePrefabDialog?.name || '').trim();
    if (!name) { setNodePrefabError('Enter a name for this saved node.'); return; }
    const node = { ...nodePrefabDialog.node, id: undefined, x: undefined, y: undefined };
    const prefab = { id: `prefab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, node };
    const next = [prefab, ...nodePrefabs];
    setNodePrefabs(next);
    safeStorageSet('arc_node_prefabs', JSON.stringify(next));
    setNodePrefabDialog(null);
    arcEvents.emit('toast:notify', { title: 'Node saved', message: `${name} added to Saved nodes.`, type: 'success' });
  }, [nodePrefabDialog, nodePrefabs]);

  const handleDeleteNodePrefab = useCallback((prefab) => {
    const next = nodePrefabs.filter((item) => item.id !== prefab.id);
    setNodePrefabs(next);
    safeStorageSet('arc_node_prefabs', JSON.stringify(next));
  }, [nodePrefabs]);

  const openDiscordTextStudio = useCallback((node, fieldKey, label, value, maxLength, applyValue, parentStudioId = '', parentBlockContext = null, routeOverride = null) => {
    if ((!activeGraph && !applyValue) || !activeProjectId || (!applyValue && (!node?.id || !fieldKey))) return;
    if (node?.id) studioFocusReturnRef.current = { graphId: activeGraph.id, nodeId: node.id };
    const graphId = activeGraph?.id || null;
    const previewNode = node || activeNodes.find((item) => item.id === embedStudio?.nodeId);
    const previewGraph = { nodes: activeNodes, connections: activeConnections };
    const collabId = `text:${activeProjectId}:${graphId || 'workspace'}:${parentStudioId || `${node?.id || 'inline'}:${fieldKey || label}`}`;
    const initialText = String(value ?? '');
    const route = routeOverride || (parentBlockContext && embedStudio ? {
      kind: 'embed-text', nodeId: embedStudio.nodeId || '', mode: embedStudio.mode,
      assetId: embedStudio.mode === 'asset' ? embedStudio.id : '',
      tab: embedStudio.route?.tab,
      blockId: parentBlockContext.blockId, blockKey: parentBlockContext.blockKey, blockCollection: parentBlockContext.blockCollection,
      label: String(label || ''), maxLength: Number(maxLength) || 0
    } : parentBlockContext && node?.id ? {
      kind: 'node-embed-text', nodeId: node.id, blockId: parentBlockContext.blockId,
      blockKey: parentBlockContext.blockKey, label: String(label || ''), maxLength: Number(maxLength) || 0
    } : node?.id ? {
      kind: 'text-node', nodeId: node.id, fieldKey, label: String(label || ''), maxLength: Number(maxLength) || 0
    } : null);
    textCollaborationRef.current.set(collabId, { baseText: initialText, localText: initialText, caret: 0 });
    setDiscordTextStudio({
      projectId: activeProjectId,
      graphId,
      collabId,
      route,
      readOnly: Boolean(routeOverride?.readOnly || route?.readOnly),
      nodeId: node?.id || null,
      fieldKey,
      label,
      value: initialText,
      localDraft: initialText,
      maxLength,
      templateValuePaths: getTemplateValuePaths(activeGraph, node, availableVariables),
      templatePreviewValues: getTemplatePreviewInputs(previewGraph, previewNode, availableVariables),
      templateSuggestions: getTemplateSocketSuggestions(activeGraph, node).filter((item) => !availableVariables.some((variable) => variable.name?.toLowerCase() === item.name.toLowerCase())),
      applyValue,
      parentBlockContext
    });
  }, [activeGraph, activeConnections, activeNodes, activeProjectId, availableVariables, embedStudio]);

  const openVariableTextEditor = useCallback((variable, scope, isReadOnly = false) => {
    const targetGraphId = activeTabId;
    setVariableScope(scope === 'graph' ? 'graph' : 'project');
    const structured = variable.type === 'array' || variable.type === 'object';
    const initialValue = structured ? JSON.stringify(variable.initialValue ?? (variable.type === 'array' ? [] : {}), null, 2) : String(variable.initialValue ?? '');
    const applyValue = (text) => {
      if (isReadOnly) return true;
      let initialValue = text;
      if (structured) {
        try {
          initialValue = JSON.parse(text);
          if (variable.type === 'array' ? !Array.isArray(initialValue) : !initialValue || typeof initialValue !== 'object' || Array.isArray(initialValue)) throw new Error('The JSON value has the wrong shape.');
          if (JSON.stringify(initialValue).length > 10000) throw new Error('Variable values are limited to 10,000 characters.');
        } catch (error) {
          arcEvents.emit('toast:notify', { title: 'Variable not updated', message: error.message === 'The JSON value has the wrong shape.' || error.message.startsWith('Variable values') ? error.message : 'Enter valid JSON before applying this value.', type: 'error' });
          return false;
        }
      } else initialValue = String(text).slice(0, 10000);
      if (scope === 'graph' && targetGraphId !== activeTabId) return false;
      const source = scope === 'project' ? projectVariables : (tabs.find((tab) => tab.id === targetGraphId)?.variables || []);
      const next = source.map((item) => item.id === variable.id ? { ...item, initialValue } : item);
      if (scope === 'project') handleProjectVariablesChange(next);
      else {
        const currentId = activeTabId;
        if (currentId !== targetGraphId) return false;
        handleVariablesChange(next);
      }
      return true;
    };
    openDiscordTextStudio(null, null, `${variable.name}${structured ? ' · JSON' : ''}`, initialValue, 12000, applyValue, '', null, {
      kind: 'text-variable', scope, variableId: variable.id, label: `${variable.name}${structured ? ' · JSON' : ''}`, maxLength: 12000, readOnly: isReadOnly
    });
  }, [activeTabId, handleProjectVariablesChange, handleVariablesChange, openDiscordTextStudio, projectVariables, tabs]);

  const openPermissionStudio = useCallback((node, routeMode = '') => {
    if (!node?.id || !activeGraph || !activeProjectId) return;
    studioFocusReturnRef.current = { graphId: activeGraph.id, nodeId: node.id };
    const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
    const mode = routeMode || (node.type === 'data_permission_overwrites' ? 'overwrites' : node.type === 'event_slash_command' ? 'command' : 'role');
    setPermissionStudio({
      projectId: activeProjectId,
      graphId: activeGraph.id,
      nodeId: node.id,
      route: { kind: 'permission', nodeId: node.id, mode, label: node.label || definition?.label || node.type },
      mode,
      nodeName: node.label || definition?.label || node.type,
      data: mode === 'command'
        ? { ...structuredClone(node.data || {}), permissions: String(node.data?.defaultMemberPermissions ?? '') }
        : structuredClone(node.data || {}),
      connectedTargetIds: activeConnections.filter((wire) => wire.targetNodeId === node.id && /^target_id_\d+$/.test(wire.targetPinId)).map((wire) => wire.targetPinId),
      permissionsConnected: activeConnections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'permissions')
    });
  }, [activeGraph, activeConnections, activeProjectId]);

  const applyPermissionStudio = useCallback((data) => {
    if (!permissionStudio) return;
    const graph = tabs.find((tab) => tab.id === permissionStudio.graphId);
    if (!graph || permissionStudio.projectId !== activeProjectId) { setPermissionStudio(null); return; }
    const appliedData = permissionStudio.mode === 'command'
      ? { defaultMemberPermissions: data.permissions }
      : data;
    const nextNodes = (graph.nodes || []).map((node) => node.id === permissionStudio.nodeId ? { ...node, data: { ...node.data, ...appliedData } } : node);
    recordHistory(graph.id, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    if (activeTabId === graph.id) setActiveNodes(nextNodes);
    setPermissionStudio(null);
  }, [activeProjectId, activeTabId, permissionStudio, recordHistory, tabs]);

  const openSlashCommandStudio = useCallback((node) => {
    if (!node?.id || node.type !== 'event_slash_command' || !activeGraph || !activeProjectId) return;
    studioFocusReturnRef.current = { graphId: activeGraph.id, nodeId: node.id };
    const collabId = `arguments:${activeProjectId}:${activeGraph.id}:${node.id}`;
    const options = addSlashOptionEditorIds(structuredClone(Array.isArray(node.data?.options) ? node.data.options : []), node.id);
    slashCommandBaseRef.current.set(collabId, options);
    setSlashCommandStudio({
      projectId: activeProjectId,
      graphId: activeGraph.id,
      nodeId: node.id,
      route: { kind: 'arguments', nodeId: node.id },
      collabId,
      commandName: String(node.data?.commandName || ''),
      options,
      sharedDraft: options
    });
  }, [activeGraph, activeProjectId]);

  const updateSlashCommandStudioDraft = useCallback((options, isStructural = false) => {
    const current = slashCommandStudioRef.current;
    if (!current) return;
    recordSlashCommandStudioHistory(current, isStructural);
    sendCollaborationAction({ kind: 'studio-draft', studioId: current.collabId, studioType: 'arguments', draft: { options } });
    setSlashCommandStudio((prev) => prev?.collabId === current.collabId ? { ...prev, options, sharedDraft: options } : prev);
  }, [sendCollaborationAction, setSlashCommandStudio]);

  const applySlashCommandStudio = useCallback((options) => {
    if (!slashCommandStudio) return;
    const graph = tabs.find((tab) => tab.id === slashCommandStudio.graphId);
    if (!graph || slashCommandStudio.projectId !== activeProjectId) { setSlashCommandStudio(null); return; }
    const nextNodes = (graph.nodes || []).map((node) => node.id === slashCommandStudio.nodeId ? { ...node, data: { ...node.data, options } } : node);
    recordHistory(graph.id, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    if (activeTabId === graph.id) setActiveNodes(nextNodes);
    setSlashCommandStudio(null);
  }, [activeProjectId, activeTabId, recordHistory, slashCommandStudio, tabs]);

  const openModalStudioForNode = useCallback((node) => {
    if (!node?.id || !activeGraph || !activeProjectId) return;
    studioFocusReturnRef.current = { graphId: activeGraph.id, nodeId: node.id };
    setModalStudio({
      projectId: activeProjectId,
      graphId: activeGraph.id,
      nodeId: node.id,
      route: { kind: 'popup-modal', nodeId: node.id },
      nodeName: node.label || BuiltInNodeDefinitions.find((item) => item.type === node.type)?.label || 'Show Popup Modal',
      modal: structuredClone(node.data?.modal || createDefaultModal())
    });
  }, [activeGraph, activeProjectId]);

  const updateModalStudioDraft = useCallback((modal) => {
    setModalStudio((current) => current ? { ...current, modal } : current);
  }, []);

  const applyModalStudio = useCallback((modal) => {
    if (!modalStudio) return;
    const graph = tabs.find((tab) => tab.id === modalStudio.graphId);
    if (!graph || modalStudio.projectId !== activeProjectId) { setModalStudio(null); return; }
    const nextNodes = (graph.nodes || []).map((node) => node.id === modalStudio.nodeId
      ? { ...node, data: { ...node.data, modal } }
      : node);
    recordHistory(graph.id, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    if (activeTabId === graph.id) setActiveNodes(nextNodes);
    setModalStudio(null);
  }, [activeProjectId, activeTabId, modalStudio, recordHistory, tabs]);

  const updateEmbedStudioBlockValue = useCallback((blockId, fieldKey, value, blockCollection = 'blocks') => {
    const current = embedStudioRef.current;
    if (!current) return;
    recordEmbedStudioHistory(current);
    const patchNodes = (nodes) => (nodes || []).map((block) => {
      if (block.id === blockId) {
        const path = String(fieldKey || '').split('.');
        const updated = { ...block };
        let target = updated;
        for (const key of path.slice(0, -1)) { target[key] = Array.isArray(target[key]) ? [...target[key]] : { ...(target[key] || {}) }; target = target[key]; }
        target[path.at(-1)] = value;
        return updated;
      }
      return Array.isArray(block.children) ? { ...block, children: patchNodes(block.children) } : block;
    });
    const collection = blockCollection === 'componentsV2Layout' ? 'componentsV2Layout' : 'blocks';
    const next = { ...current, [collection]: patchNodes(current[collection] || []), isDirty: true };
    setEmbedStudio(next);
    sendCollaborationAction({ kind: 'studio-draft', studioId: current.collabId, studioType: 'embed', draft: collaborativeEmbedDraft(next) });
  }, [sendCollaborationAction, setEmbedStudio]);

  const applyDiscordTextStudio = useCallback((value) => {
    if (!discordTextStudio) return false;
    if (discordTextStudio.projectId !== activeProjectId) { setDiscordTextStudio(null); return false; }
    const nextValue = discordTextStudio.maxLength ? String(value).slice(0, discordTextStudio.maxLength) : String(value);
    if (typeof discordTextStudio.applyValue === 'function') {
      if (discordTextStudio.applyValue(nextValue) === false) return false;
      setDiscordTextStudio(null);
      return true;
    }
    const graph = tabs.find((tab) => tab.id === discordTextStudio.graphId);
    if (!graph) { setDiscordTextStudio(null); return false; }
    if (discordTextStudio.parentBlockContext) {
      updateEmbedStudioBlockValue(discordTextStudio.parentBlockContext.blockId, discordTextStudio.parentBlockContext.blockKey, nextValue);
      setDiscordTextStudio(null);
      return true;
    }
    const nextNodes = (graph.nodes || []).map((node) => node.id === discordTextStudio.nodeId
      ? { ...node, data: { ...node.data, [discordTextStudio.fieldKey]: nextValue } }
      : node);
    recordHistory(graph.id, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    if (activeTabId === graph.id) setActiveNodes(nextNodes);
    setDiscordTextStudio(null);
    return true;
  }, [activeProjectId, activeTabId, discordTextStudio, recordHistory, tabs, updateEmbedStudioBlockValue]);

  const openEmbedStudioForNode = useCallback((node, routeOverride = null) => {
    if (node?.id && activeTabId) studioFocusReturnRef.current = { graphId: activeTabId, nodeId: node.id };
    const isComponentsBuilderNode = node.type === 'build_components';
    const isMessageComponentsNode = isComponentsBuilderNode || ['action_send_message', 'action_reply_interaction', 'action_edit_message', 'action_edit_components', 'action_edit_interaction_reply'].includes(node.type);

    const embedWire = activeConnections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed');
    const embedSourceNode = embedWire ? activeNodes.find((n) => n.id === embedWire.sourceNodeId) : null;
    let initialBlocks = embedSourceNode?.data?.blocks
      ? structuredClone(getEmbedBlocks(embedSourceNode.data))
      : node.data?.blocks
        ? structuredClone(getEmbedBlocks(node.data))
        : [];

    const wiredFields = {};
    if (node.type === 'build_embed') {
      if (!Array.isArray(node.data?.blocks)) {
        const legacyWires = activeConnections.filter((item) => item.targetNodeId === node.id);
        let migratedBlocks = [...initialBlocks];
        for (const wire of legacyWires) {
          const legacyField = LEGACY_EMBED_PIN_FIELDS[wire.targetPinId];
          if (legacyField && !migratedBlocks.some((block) => block.type === legacyField[0])) migratedBlocks.push(createEmbedBlock(legacyField[0]));
          if (wire.targetPinId === 'timestamp') {
            const timestamp = migratedBlocks.find((block) => block.type === 'timestamp');
            if (timestamp) timestamp.now = false;
            else migratedBlocks.push({ ...createEmbedBlock('timestamp'), now: false });
          }
          const legacyFieldPin = /^field_(.+)_(name|value)$/.exec(wire.targetPinId);
          if (legacyFieldPin && !migratedBlocks.some((block) => block.id === legacyFieldPin[1])) migratedBlocks.push({ id: legacyFieldPin[1], type: 'field', name: '', value: '', inline: false });
        }
        initialBlocks = migratedBlocks;
      }
      const blockPins = embedBlockPins(initialBlocks, availableVariables);
      const sourcePinLabel = (wire) => {
        const sourceNode = activeNodes.find((item) => item.id === wire.sourceNodeId);
        if (!sourceNode) return wire.sourcePinId;
        if (sourceNode.type === 'variable_get') return availableVariables.find((variable) => variable.id === sourceNode.data?.variableId)?.name || 'Value';
        if (sourceNode.type === 'function_input') return sourceNode.data?.name || 'Value';
        const sourceDefinition = BuiltInNodeDefinitions.find((item) => item.type === sourceNode.type);
        const dynamicPins = sourceNode.type === 'build_embed' ? embedBlockPins(getEmbedBlocks(sourceNode.data || {}), availableVariables) : [];
        return [...(sourceDefinition?.outputs || []), ...dynamicPins].find((pin) => pin.id === wire.sourcePinId)?.label || wire.sourcePinId;
      };
      const makeToken = (label) => {
        const words = String(label || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').match(/[A-Za-z0-9]+/g) || [];
        return words.map((word, index) => index ? `${word[0].toUpperCase()}${word.slice(1)}` : `${word[0].toLowerCase()}${word.slice(1)}`).join('') || 'value';
      };
      for (const wire of activeConnections.filter((item) => item.targetNodeId === node.id)) {
        let targetPin = blockPins.find((pin) => pin.id === wire.targetPinId);
        if (!targetPin && LEGACY_EMBED_PIN_FIELDS[wire.targetPinId]) {
          const [type, key] = LEGACY_EMBED_PIN_FIELDS[wire.targetPinId];
          const block = initialBlocks.find((item) => item.type === type);
          if (block) targetPin = blockPins.find((pin) => pin.id === `block_${block.id}_${key}`);
        }
        if (!targetPin) {
          const legacyField = /^field_(.+)_(name|value)$/.exec(wire.targetPinId);
          if (legacyField) targetPin = blockPins.find((pin) => pin.id === `block_${legacyField[1]}_${legacyField[2]}`);
        }
        if (!targetPin) continue;
        const label = sourcePinLabel(wire);
      wiredFields[targetPin.id] = { label, source: `${activeNodes.find((item) => item.id === wire.sourceNodeId)?.label || BuiltInNodeDefinitions.find((item) => item.type === activeNodes.find((entry) => entry.id === wire.sourceNodeId)?.type)?.label || 'Node'} · ${label}`, token: `{{${makeToken(label)}}}` };
      }
    }

    const componentsWire = activeConnections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'components');
    const compSourceNode = componentsWire ? activeNodes.find((n) => n.id === componentsWire.sourceNodeId) : null;
    const initialComponents = compSourceNode?.data?.components?.length
      ? structuredClone(compSourceNode.data.components)
      : Array.isArray(node.data?.components)
        ? structuredClone(node.data.components)
        : [];
    const initialComponentsV2Layout = structuredClone(
      (isComponentsBuilderNode ? node.data?.componentsV2 : compSourceNode?.data?.componentsV2) || node.data?.componentsV2Layout || []
    );

    const contentWire = activeConnections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'content');
    const contentSourceNode = contentWire ? activeNodes.find((n) => n.id === contentWire.sourceNodeId) : null;
    const sourceDescription = (wire, sourceNode) => {
      if (!wire) return '';
      const definition = BuiltInNodeDefinitions.find((item) => item.type === sourceNode?.type);
      const pin = [...(definition?.outputs || [])].find((item) => item.id === wire.sourcePinId);
      return `${sourceNode?.label || definition?.label || 'Node'} · ${pin?.label || wire.sourcePinId}`;
    };
    let initialContent = String(node.data?.content || '');
    if (contentWire && contentSourceNode) {
      const sourceDefinition = BuiltInNodeDefinitions.find((item) => item.type === contentSourceNode.type);
      const outputLabel = contentSourceNode.type === 'variable_get'
        ? availableVariables.find((item) => item.id === contentSourceNode.data?.variableId)?.name || 'value'
        : contentSourceNode.type === 'function_input'
          ? contentSourceNode.data?.name || 'value'
          : sourceDefinition?.outputs?.find((pin) => pin.id === contentWire.sourcePinId)?.label || contentWire.sourcePinId;
      const token = String(outputLabel).replace(/([a-z0-9])([A-Z])/g, '$1 $2').match(/[A-Za-z0-9]+/g)?.map((word, index) => index ? `${word[0].toUpperCase()}${word.slice(1)}` : `${word[0].toLowerCase()}${word.slice(1)}`).join('') || 'value';
      initialContent = `{{${token}}}`;
      if (contentSourceNode.type === 'value_text') {
        initialContent = String(contentSourceNode.data?.value ?? '');
      } else if (contentSourceNode.type === 'format_text') {
        initialContent = String(contentSourceNode.data?.template ?? '');
      } else if (contentSourceNode.type === 'variable_get') {
        const v = availableVariables.find((item) => item.id === contentSourceNode.data?.variableId);
        if (v?.initialValue !== undefined) initialContent = String(v.initialValue);
      } else if (contentSourceNode.data?.value !== undefined) {
        initialContent = String(contentSourceNode.data.value);
      } else if (contentSourceNode.data?.template !== undefined) {
        initialContent = String(contentSourceNode.data.template);
      } else if (contentSourceNode.data?.content !== undefined) {
        initialContent = String(contentSourceNode.data.content);
      }
    }

    const studio = {
      graphId: activeTabId,
      projectId: activeProjectId,
      collabId: `embed:${activeProjectId}:${activeTabId}:node:${node.id}`,
      mode: isMessageComponentsNode ? 'components-node' : 'node',
      route: routeOverride || { kind: isMessageComponentsNode ? 'components' : 'embed', nodeId: node.id, mode: isMessageComponentsNode ? 'components-node' : 'node', tab: isMessageComponentsNode ? 'components' : 'embed' },
      nodeId: node.id,
      connectedEmbedNodeId: embedSourceNode?.id || null,
      connectedComponentsNodeId: compSourceNode?.id || null,
      isEmbedWired: Boolean(embedWire),
      isComponentsWired: Boolean(componentsWire),
      isComponentsBuilderNode,
      componentsV2Layout: initialComponentsV2Layout,
      componentsV2Enabled: isComponentsBuilderNode || compSourceNode?.type === 'build_components' || Boolean(node.data?.componentsV2Enabled),
      canEnableComponentsV2: !isComponentsBuilderNode && !node.data?.componentsV2Enabled && !contentWire && !embedWire && !componentsWire && !String(node.data?.content || '').trim() && initialBlocks.length === 0,
      componentsV2DisabledReason: contentWire || String(node.data?.content || '').trim() ? 'Clear the message content field and disconnect its wire first.' : embedWire || initialBlocks.length ? 'Remove the embed content and disconnect its wire first.' : componentsWire ? 'Disconnect the existing Components input first.' : '',
      isContentWired: Boolean(contentWire),
      embedSourceLabel: sourceDescription(embedWire, embedSourceNode),
      componentsSourceLabel: sourceDescription(componentsWire, compSourceNode),
      contentSourceLabel: sourceDescription(contentWire, contentSourceNode),
      id: null,
      name: node.data?.embedName || embedSourceNode?.data?.embedName || 'Untitled embed',
      content: initialContent,
      blocks: isMessageComponentsNode || node.type === 'build_embed' ? initialBlocks : structuredClone(getEmbedBlocks(node.data || {})),
      wiredFields,
      components: initialComponents,
      attachments: structuredClone(node.data?.attachments || embedSourceNode?.data?.attachments || []),
      isDirty: false
    };
    collaborativeEmbedBaseRef.current.set(studio.collabId, collaborativeEmbedDraft(studio));
    setEmbedStudio(studio);
  }, [activeConnections, activeNodes, activeProjectId, activeTabId, availableVariables]);

  const updateEmbedStudioDraft = useCallback((patchOrUpdater) => {
    const current = embedStudioRef.current;
    if (!current) return;
    const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(current) : patchOrUpdater;
    if (!patch || typeof patch !== 'object') return;
    recordEmbedStudioHistory(current);
    const next = { ...current, ...patch, isDirty: true };
    setEmbedStudio(next);
    sendCollaborationAction({
      kind: 'studio-draft', studioId: current.collabId, studioType: 'embed',
      draft: collaborativeEmbedDraft(next)
    });
  }, [sendCollaborationAction, setEmbedStudio]);

  const openEmbedAsset = useCallback((asset, routeOverride = null) => {
    const isComponentsV2Asset = asset.kind === 'components-v2';
    const studio = { graphId: activeTabId, projectId: activeProjectId, collabId: `embed:${activeProjectId}:${activeTabId}:asset:${asset.id}`, mode: 'asset', route: routeOverride || { kind: isComponentsV2Asset ? 'components' : 'embed', mode: 'asset', assetId: asset.id, tab: isComponentsV2Asset ? 'components' : 'embed' }, id: asset.id, kind: asset.kind || 'embed', name: asset.name || 'Untitled embed', blocks: structuredClone(asset.blocks || []), components: structuredClone(asset.components || []), componentsV2Layout: structuredClone(asset.componentsV2Layout || []), componentsV2Enabled: isComponentsV2Asset, attachments: structuredClone(asset.attachments || []), isDirty: false };
    collaborativeEmbedBaseRef.current.set(studio.collabId, collaborativeEmbedDraft(studio));
    setEmbedStudio(studio);
  }, [activeProjectId, activeTabId]);

  const createEmbedAsset = useCallback((routeOverride = null) => {
    const studio = { graphId: activeTabId, projectId: activeProjectId, collabId: `embed:${activeProjectId}:${activeTabId}:new`, mode: 'new', route: routeOverride || { kind: 'embed', mode: 'new', tab: 'embed' }, id: null, nodeId: null, name: 'Untitled embed', blocks: [], components: [], attachments: [], isDirty: false };
    collaborativeEmbedBaseRef.current.set(studio.collabId, collaborativeEmbedDraft(studio));
    setEmbedStudio(studio);
  }, [activeProjectId, activeTabId]);

  const createComponentsV2Asset = useCallback(() => {
    const studio = {
      graphId: activeTabId,
      projectId: activeProjectId,
      collabId: `embed:${activeProjectId}:${activeTabId}:new:components-v2`,
      mode: 'new',
      route: { kind: 'components', mode: 'new', tab: 'components' },
      id: null,
      nodeId: null,
      kind: 'components-v2',
      name: 'Untitled Components V2',
      blocks: [],
      components: [],
      componentsV2Layout: [],
      componentsV2Enabled: true,
      attachments: [],
      isDirty: false
    };
    collaborativeEmbedBaseRef.current.set(studio.collabId, collaborativeEmbedDraft(studio));
    setEmbedStudio(studio);
  }, [activeProjectId, activeTabId]);

  const persistEmbedAsset = useCallback(async (studio) => {
    if (!authToken) throw new Error('Sign in before saving an embed to this workspace.');
    const name = String(studio?.name || '').trim() || 'Untitled embed';
    const id = studio?.id || `embed_asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const asset = { id, name, blocks: structuredClone(studio?.blocks || []), components: structuredClone(studio?.components || []), attachments: structuredClone(studio?.attachments || []), updatedAt: new Date().toISOString() };
    const response = await fetch(apiUrl('/api/embeds'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify(asset) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save this embed.');
    setEmbedAssets(data.embeds || [data.embed, ...embedAssets.filter((item) => item.id !== data.embed?.id)]);
    return data.embed;
  }, [authToken, embedAssets]);

  const persistComponentsV2Asset = useCallback(async (studio) => {
    if (!authToken) throw new Error('Sign in before saving Components V2 to this workspace.');
    const name = String(studio?.name || '').trim() || 'Untitled Components V2';
    const id = studio?.id || `components_v2_asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const asset = { id, name, kind: 'components-v2', blocks: [], components: [], componentsV2Layout: structuredClone(studio?.componentsV2Layout || []), attachments: structuredClone(studio?.attachments || []), updatedAt: new Date().toISOString() };
    const response = await fetch(apiUrl('/api/embeds'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify(asset) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save Components V2 to the library.');
    setEmbedAssets(data.embeds || [data.embed, ...embedAssets.filter((item) => item.id !== data.embed?.id)]);
    return data.embed;
  }, [authToken, embedAssets]);

  const handleSaveEmbedStudio = useCallback(async () => {
    if (!embedStudio) return;
    if (['node', 'components-node'].includes(embedStudio.mode)) {
      const nextNodes = activeNodes.map((node) => {
        if (node.id === embedStudio.nodeId) {
          const isComponentsBuilderNode = node.type === 'build_components';
          return {
            ...node,
            data: {
              ...node.data,
              ...(embedStudio.attachments ? { attachments: structuredClone(embedStudio.attachments) } : {}),
              ...(isComponentsBuilderNode ? { componentsV2: structuredClone(embedStudio.componentsV2Layout || []) } : {}),
              ...(!isComponentsBuilderNode && embedStudio.componentsV2Enabled ? { componentsV2Enabled: true, componentsV2Layout: structuredClone(embedStudio.componentsV2Layout || []) } : {}),
              ...(embedStudio.mode === 'node' ? { blocks: structuredClone(embedStudio.blocks), embedName: embedStudio.name.trim() || 'Untitled embed' } : {}),
              ...(!embedStudio.isContentWired && ['action_send_message', 'action_reply_interaction', 'action_edit_message', 'action_edit_interaction_reply'].includes(node.type) ? { content: String(embedStudio.content || '') } : {}),
              ...(!isComponentsBuilderNode ? { components: structuredClone(embedStudio.components || []) } : {})
            }
          };
        }
        if (embedStudio.connectedEmbedNodeId && node.id === embedStudio.connectedEmbedNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              blocks: structuredClone(embedStudio.blocks),
              ...(embedStudio.attachments ? { attachments: structuredClone(embedStudio.attachments) } : {})
            }
          };
        }
        if (embedStudio.connectedComponentsNodeId && node.id === embedStudio.connectedComponentsNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...(node.type === 'build_components' ? { componentsV2: structuredClone(embedStudio.componentsV2Layout || []) } : { components: structuredClone(embedStudio.components || []) })
            }
          };
        }
        return node;
      });
      const embedNode = activeNodes.find((node) => node.id === embedStudio.nodeId);
      if (embedNode?.type === 'build_embed' && !Array.isArray(embedNode.data?.blocks)) {
        const pinRemap = new Map();
        for (const [legacyPin, [type, key]] of Object.entries(LEGACY_EMBED_PIN_FIELDS)) {
          const block = embedStudio.blocks.find((item) => item.type === type);
          if (block) pinRemap.set(legacyPin, `block_${block.id}_${key}`);
        }
        for (const block of embedStudio.blocks) {
          if (block.type !== 'field') continue;
          pinRemap.set(`field_${block.id}_name`, `block_${block.id}_name`);
          pinRemap.set(`field_${block.id}_value`, `block_${block.id}_value`);
        }
        const nextConnections = activeConnections.map((wire) => wire.targetNodeId === embedNode.id && pinRemap.has(wire.targetPinId)
          ? { ...wire, targetPinId: pinRemap.get(wire.targetPinId) }
          : wire);
        if (nextConnections.some((wire, index) => wire !== activeConnections[index])) handleConnectionsChange(nextConnections);
      }
      handleNodesChange(nextNodes);
    } else {
      try {
        if (embedStudio.kind === 'components-v2') await persistComponentsV2Asset(embedStudio);
        else await persistEmbedAsset(embedStudio);
      } catch (error) { arcEvents.emit('toast:notify', { title: embedStudio.kind === 'components-v2' ? 'Components V2 not saved' : 'Embed not saved', message: error.message, type: 'error' }); return; }
    }
    setEmbedStudio(null);
  }, [activeConnections, activeNodes, embedStudio, handleConnectionsChange, handleNodesChange, persistComponentsV2Asset, persistEmbedAsset]);

  const handleSaveEmbedAsAsset = useCallback(async () => {
    if (!embedStudio) return;
    try {
      const asset = await persistEmbedAsset({ ...embedStudio, id: null });
      arcEvents.emit('toast:notify', { title: 'Embed saved', message: `${asset.name} added to Embeds.`, type: 'success' });
      if (embedStudio.mode === 'new') setEmbedStudio(null);
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Embed not saved', message: error.message, type: 'error' }); }
  }, [embedStudio, persistEmbedAsset]);

  const handleSaveComponentsV2AsAsset = useCallback(async () => {
    if (!embedStudio?.componentsV2Enabled) return;
    const proposedName = window.prompt('Name this Components V2 layout for the library:', String(embedStudio.name || 'Untitled Components V2'));
    if (proposedName === null) return;
    const name = proposedName.trim();
    if (!name) {
      arcEvents.emit('toast:notify', { title: 'Components V2 not saved', message: 'Enter a name before saving this layout to the library.', type: 'warning' });
      return;
    }
    try {
      const asset = await persistComponentsV2Asset({ ...embedStudio, id: null, name });
      arcEvents.emit('toast:notify', { title: 'Components V2 saved', message: `${asset.name} added to Components V2 in the library.`, type: 'success' });
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Components V2 not saved', message: error.message, type: 'error' }); }
  }, [embedStudio, persistComponentsV2Asset]);

  const handleSaveEmbedShortcut = useCallback(async () => {
    const studio = embedStudioRef.current;
    if (!studio) return false;
    if (studio.mode === 'asset' && studio.id) {
      try {
        const isComponentsV2Asset = studio.kind === 'components-v2';
        const asset = isComponentsV2Asset ? await persistComponentsV2Asset(studio) : await persistEmbedAsset(studio);
        setEmbedStudio((current) => current?.collabId === studio.collabId ? { ...current, ...asset, mode: 'asset', isDirty: false } : current);
        arcEvents.emit('toast:notify', { title: isComponentsV2Asset ? 'Components V2 saved' : 'Embed saved', message: `${asset.name} updated in the library.`, type: 'success' });
        return true;
      } catch (error) {
        arcEvents.emit('toast:notify', { title: studio.kind === 'components-v2' ? 'Components V2 not saved' : 'Embed not saved', message: error.message, type: 'error' });
        return false;
      }
    }
    const proposedName = window.prompt('Name this embed for the library:', String(studio.name || 'Untitled embed'));
    if (proposedName === null) return false;
    const name = proposedName.trim();
    if (!name) {
      arcEvents.emit('toast:notify', { title: 'Embed not saved', message: 'Enter a name before saving this embed to the library.', type: 'warning' });
      return false;
    }
    if (!window.confirm(`Save “${name}” to the Embed Library?`)) return false;
    let asset;
    try { asset = await persistEmbedAsset({ ...studio, id: null, name }); }
    catch (error) {
      arcEvents.emit('toast:notify', { title: 'Embed not saved', message: error.message, type: 'error' });
      return false;
    }
    arcEvents.emit('toast:notify', { title: 'Embed saved', message: `${asset.name} added to the library.`, type: 'success' });
    if (['node', 'components-node'].includes(studio.mode)) {
      await handleSaveEmbedStudio();
      window.setTimeout(() => {
        const graph = tabsRef.current.find((tab) => tab.id === studio.graphId);
        if (graph?.isDirty) persistGraph(graph);
      }, 0);
    } else {
      setEmbedStudio((current) => current?.collabId === studio.collabId ? { ...current, ...asset, mode: 'asset', isDirty: false } : current);
    }
    return true;
  }, [handleSaveEmbedStudio, persistComponentsV2Asset, persistEmbedAsset, persistGraph]);
  saveEmbedShortcutRef.current = handleSaveEmbedShortcut;

  const handleSaveTextStudio = useCallback(() => {
    const studio = discordTextStudio;
    if (!studio) return false;
    const text = String(studio.sharedDraft ?? studio.localDraft ?? studio.value ?? '');
    if (applyDiscordTextStudio(text) === false) return false;
    if (studio.parentBlockContext) {
      window.setTimeout(() => { saveEmbedShortcutRef.current?.(); }, 0);
      return true;
    }
    window.setTimeout(() => {
      const graph = tabsRef.current.find((tab) => tab.id === studio.graphId);
      if (graph?.isDirty) persistGraph(graph);
    }, 0);
    return true;
  }, [applyDiscordTextStudio, discordTextStudio, handleSaveEmbedShortcut, persistGraph]);

  const handleDeleteEmbedAsset = useCallback(async (asset) => {
    if (!authToken) return;
    try {
      const response = await fetch(apiUrl(`/api/embeds/${encodeURIComponent(asset.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete this embed.');
      setEmbedAssets(data.embeds || []);
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Embed not deleted', message: error.message, type: 'error' }); }
  }, [authToken]);

  const handleStartBot = useCallback(async (confirmed = false) => {
    if (!authToken) return;
    if (!networkOnline) {
      arcEvents.emit('toast:notify', { title: 'Gateway unavailable', message: 'Reconnect to the internet before connecting to Discord. You can continue testing with Simulation.', type: 'warning' });
      return;
    }
    triggerLoadingBar();
    try {
      const runtimeGraphs = new Map(savedGraphs.map((graph) => [graph.id, graph]));
      for (const graph of tabs) runtimeGraphs.set(graph.id, graph);
      const failedGraphs = [...runtimeGraphs.values()].map((graph) => ({ graph, report: validateGraph(graph, runtimeGraphs, botProfile?.intentSummary, projectVariables) })).filter(({ report }) => report.errors.length);
      if (failedGraphs.length) {
        setValidationResult({
          graphName: 'Bot workspace',
          errors: failedGraphs.flatMap(({ graph, report }) => report.errors.map((issue) => `${graph.name || graph.id}: ${issue}`)),
          warnings: [],
          issueItems: failedGraphs.flatMap(({ graph, report }) => report.errors.map((message) => ({
            kind: 'error',
            message: `${graph.name || graph.id}: ${message}`,
            graphId: graph.id,
            nodeId: report.errorNodeIds?.[message]
          })))
        });
        arcEvents.emit('toast:notify', { title: 'Bot not started', message: 'Fix graph issues before connecting.', type: 'warning' });
        return;
      }
      let currentIntents = botProfile?.intentSummary || [];
      try {
        const intentResponse = await fetch(apiUrl('/api/bot/intents?refresh=1'), { headers: { 'x-arc-token': authToken } });
        const intentData = await intentResponse.json();
        if (intentResponse.ok && Array.isArray(intentData.intents)) {
          currentIntents = intentData.intents;
          setBotProfile((profile) => profile ? { ...profile, intentSummary: intentData.intents } : profile);
        }
      } catch {}
      const unavailablePrivileged = currentIntents.filter((intent) => intent.required && intent.privileged && intent.portalEnabled === false);
      if (unavailablePrivileged.length && confirmed !== true) {
        setGatewayIntentConfirm(unavailablePrivileged);
        return;
      }
      const newlySaved = [];
      for (const graph of tabs) {
        if (!graph.isDirty && savedGraphs.some((saved) => saved.id === graph.id)) continue;
        newlySaved.push(await saveGraphWithProgress(graph));
      }
      if (newlySaved.length) {
        const byId = new Map(newlySaved.map((graph) => [graph.id, graph]));
        setSavedGraphs((previous) => [...byId.values(), ...previous.filter((graph) => !byId.has(graph.id))]);
        setTabs((previous) => previous.map((graph) => {
          const saved = byId.get(graph.id);
          return saved && sameGraphContent(graph, saved) ? { ...saved, isDirty: false } : graph;
        }));
      }
      botStartPendingRef.current = true;
      arcEvents.emit('toast:notify', { title: 'Bot starting', message: `${runtimeGraphs.size} graph${runtimeGraphs.size === 1 ? '' : 's'} ready`, type: 'info' });
      const res = await fetch(apiUrl('/api/bot/start'), { method: 'POST', headers: { 'x-arc-token': authToken } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not connect the gateway.');
    } catch (error) {
      botStartPendingRef.current = false;
      arcEvents.emit('toast:notify', { title: 'Gateway error', message: error.message, type: 'error' });
    }
  }, [authToken, networkOnline, savedGraphs, saveGraphWithProgress, tabs, triggerLoadingBar, botProfile?.intentSummary]);

  const handleStopBot = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl('/api/bot/stop'), { method: 'POST', headers: { 'x-arc-token': authToken } });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not stop the gateway.');
      }
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Gateway error', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleIntentSummaryChange = useCallback((intents) => {
    if (!Array.isArray(intents)) return;
    setBotProfile((profile) => profile ? { ...profile, intentSummary: intents } : profile);
  }, []);

  const handleClearLogs = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl('/api/logs'), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      if (!res.ok) throw new Error('Could not clear console output.');
      setLogs([]);
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Console error', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleLogout = () => {
    if (authToken) {
      fetch(apiUrl('/api/auth/logout'), { method: 'POST', headers: { 'x-arc-token': authToken } }).catch(() => {});
    }
    safeStorageRemove('arc_token');
    if (desktopMode && workspaceMode === 'local') {
      removeLocalDesktopSessionToken();
      localSessionRef.current = null;
    }
    setAuthToken('');
    setCurrentUser(null);
    setTabs([]);
    setActiveTabId(null);
    setNeedsProjectOnboarding(false);
    reconnectGraphBaseRef.current.clear();
  };

  const forceSignOut = useCallback(() => {
    safeStorageRemove('arc_token');
    if (desktopMode && workspaceMode === 'local') {
      removeLocalDesktopSessionToken();
      localSessionRef.current = null;
    }
    setAuthToken('');
    setCurrentUser(null);
    setTabs([]);
    setActiveTabId(null);
    setActiveNodes([]);
    setActiveConnections([]);
    setNeedsProjectOnboarding(false);
    graphsHydratedRef.current = false;
    reconnectGraphBaseRef.current.clear();
  }, [desktopMode, workspaceMode]);
  forceSignOutRef.current = forceSignOut;

  const handleAuthComplete = async (token, user, persistSession = true) => {
    if (desktopMode && !persistSession) safeStorageRemove('arc_token');
    else safeStorageSet('arc_token', token);
    if (desktopMode && workspaceMode === 'local') {
      if (persistSession) {
        writeLocalDesktopSessionToken(token);
        localSessionRef.current = { token, user };
        try {
          const invoke = window.__TAURI_INTERNALS__?.invoke;
          if (typeof invoke === 'function') await invoke('save_local_session_token', { token });
        } catch (error) {
          arcEvents.emit('toast:notify', { title: 'Session storage unavailable', message: error.message || 'ARC will keep this session in app storage only.', type: 'warning' });
        }
      } else {
        removeLocalDesktopSessionToken();
        localSessionRef.current = { token, user };
      }
    }
    let shouldCreateProject = false;
    try {
      const response = await fetch(apiUrl('/api/projects'), { headers: { 'x-arc-token': token } });
      const data = await response.json();
      if (response.ok) {
        const nextProjects = Array.isArray(data.projects) ? data.projects : [];
        setProjects(nextProjects);
        setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? 10 : data.maxProjects);
        setActiveProjectId(data.activeProjectId || '');
        shouldCreateProject = nextProjects.length === 0 || nextProjects.some((project) => project.id === data.activeProjectId && project.pendingStarterChoice);
      }
    } catch {}
    try {
      const response = await fetch(apiUrl('/api/projects/templates'), { headers: { 'x-arc-token': token } });
      const data = await response.json();
      if (response.ok && Array.isArray(data.templates)) setProjectStarters(data.templates);
    } catch {}
    setNeedsProjectOnboarding(shouldCreateProject);
    setAuthToken(token);
    setCurrentUser(user);
    setNeedsSetup(false);
  };

  const handleCreateProject = async (event) => {
    event?.preventDefault?.();
    const name = newProjectName.trim();
    if (projectBusy) return;
    if (!name) {
      setProjectNameInvalid(true);
      setProjectNameShakeKey((key) => key + 1);
      setProjectError('');
      window.requestAnimationFrame(() => document.getElementById('new-project-name')?.focus());
      return;
    }
    setProjectNameInvalid(false);
    setProjectBusy(true);
    setProjectError('');
    try {
      const response = await fetch(apiUrl('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create project.');
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      setNewProjectName('');
    } catch (error) { setProjectError(error.message); }
    finally { setProjectBusy(false); }
  };

  const handleCreateProjectFromTemplate = async () => {
    if (projectBusy || !newProjectName.trim()) return;
    setProjectBusy(true);
    setProjectError('');
    try {
      const response = await fetch(apiUrl('/api/projects'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ name: newProjectName.trim(), templateId: newProjectTemplate }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create the project.');
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      const project = data.project;
      setProjectTemplateDialog(false);
      setNewProjectName('');
      if (project?.id) await handleActivateProject(project.id, true);
    } catch (error) { setProjectError(error.message); }
    finally { setProjectBusy(false); }
  };

  const handleExportProject = async (project) => {
    if (!project || projectBusy) return;
    setProjectBusy(true);
    try {
      if (project.id === activeProjectId) await ensureWorkspaceGraphsSaved();
      let response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/export`), { headers: { 'x-arc-token': authToken } });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not export the project.'); }
      let bundle = await response.json();
      let includeSecrets = false;
      if (bundle.sensitiveData?.omittedFields > 0 && window.confirm(`This project contains ${bundle.sensitiveData.omittedFields} sensitive field(s). Eligible secrets are omitted by default. Include them in the exported file?\n\nDiscord bot tokens are always removed from .arcproject files.`)) {
        includeSecrets = true;
        response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/export?includeSecrets=1`), { headers: { 'x-arc-token': authToken } });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not export the project.'); }
        bundle = await response.json();
      }
      const filename = `${String(project.name || 'project').replace(/[\\/:*?"<>|]/g, '_')}.arcproject`;
      if (window.confirm('Encrypt this project file with a password?')) {
        const password = window.prompt('Choose an export password with at least 12 characters. You will need it to import this file.');
        if (password === null) return;
        if (password.length < 12 || password.length > 1024) throw new Error('Use an export password between 12 and 1,024 characters.');
        const confirmation = window.prompt('Enter the export password again to confirm it.');
        if (confirmation === null) return;
        if (password !== confirmation) throw new Error('The export passwords do not match.');
        response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/export/encrypted`), {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
          body: JSON.stringify({ password, includeSecrets })
        });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not encrypt the project export.'); }
        bundle = await response.json();
      }
      const contents = JSON.stringify(bundle, null, 2);
      if (desktopMode) {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') throw new Error('ARC Studio could not save the project file.');
        const receipt = await invoke('save_project_export', { filename, contents });
        const revealed = receipt?.revealed === true;
        arcEvents.emit('toast:notify', {
          title: 'Project exported',
          message: `${revealed ? `Saved ${filename} to Downloads and opened its location.` : `Saved ${filename} to Downloads.`}${bundle.format === 'arc-project-encrypted' ? ' Password protected.' : ''}`,
          type: 'success'
        });
        if (typeof receipt?.path === 'string') console.info(`ARC Studio project export saved to ${receipt.path}`);
      } else {
        const blob = new Blob([contents], { type: 'application/vnd.arc-studio.project+json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        arcEvents.emit('toast:notify', { title: 'Project exported', message: `${filename} was downloaded.${bundle.format === 'arc-project-encrypted' ? ' Password protected.' : ''}`, type: 'success' });
      }
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Project export failed', message: error.message || 'Could not export the project.', type: 'error' }); }
    finally { setProjectBusy(false); }
  };

  const handleImportProject = async () => {
    if (!projectImportFile || !projectImportTrusted || projectBusy || projectImportSharingWarning && !projectImportSharingApproved || projectImportCompatibility?.code === 'PROJECT_OLD_VERSION_CONFIRMATION_REQUIRED' && !projectImportOldVersionApproved) return;
    setProjectBusy(true);
    setProjectImportError('');
    try {
      const bundle = JSON.parse(await projectImportFile.text());
      const response = await fetch(apiUrl('/api/projects/import'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ bundle, trusted: true, allowOldVersion: projectImportOldVersionApproved, password: projectImportPassword, confirmCollaborativeText: projectImportSharingApproved })
      });
      const data = await response.json();
      if (response.status === 409 && data.code === 'IMPORT_SHARED_CONTENT_CONFIRMATION_REQUIRED') {
        setProjectImportSharingWarning({ workspaceName: String(data.workspaceName || externalWorkspaceName).trim() || externalWorkspaceName });
        setProjectImportSharingApproved(false);
        return;
      }
      if (response.status === 409 && ['PROJECT_OLD_VERSION_CONFIRMATION_REQUIRED', 'PROJECT_REQUIRES_NEWER_ARC'].includes(data.code)) {
        setProjectImportCompatibility(data);
        setProjectImportOldVersionApproved(false);
        setProjectImportError('');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Could not import the project.');
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      const imported = data.project;
      projectImportPathRef.current = null;
      setProjectImportFile(null);
      setProjectImportTrusted(false);
      setProjectImportPassword('');
      setProjectImportSharingWarning(null);
      setProjectImportSharingApproved(false);
      setProjectImportCompatibility(null);
      setProjectImportOldVersionApproved(false);
      arcEvents.emit('toast:notify', data.integrityWarning
        ? { title: 'Project imported with a warning', message: 'This older file has no integrity record and could not be checked.', type: 'warning', duration: 7000 }
        : { title: 'Project imported', message: imported?.name || 'Project added to your workspace', type: 'success' });
    } catch (error) {
      setProjectImportError(error.message);
      if (/integrity|corrupt/i.test(error.message || '')) arcEvents.emit('toast:notify', { title: 'Project file may be corrupted', message: error.message, type: 'warning', duration: 7000 });
    }
    finally { setProjectBusy(false); }
  };

  const cancelProjectImport = () => {
    const canceledPath = projectImportFile?.path;
    projectImportPathRef.current = null;
    if (canceledPath) {
      setOpenedProjectFiles((current) => current.filter((path) => path !== canceledPath));
      const queue = window.__ARC_STUDIO_OPEN_FILES__;
      if (Array.isArray(queue)) window.__ARC_STUDIO_OPEN_FILES__ = queue.filter((path) => path !== canceledPath);
    }
    setProjectImportFile(null);
    setProjectImportTrusted(false);
    setProjectImportPassword('');
    setProjectImportSharingWarning(null);
    setProjectImportSharingApproved(false);
    setProjectImportError('');
    setProjectImportCompatibility(null);
    setProjectImportOldVersionApproved(false);
  };

  useEffect(() => {
    if (!desktopMode) return undefined;
    const openFilePicker = (accept, onFile) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.hidden = true;
      document.body.append(input);
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) onFile(file);
        input.remove();
      }, { once: true });
      window.addEventListener('focus', () => window.setTimeout(() => input.remove(), 0), { once: true });
      input.click();
    };
    const onMenuAction = (event) => {
      switch (event.detail) {
        case 'file.new-graph': handleAddTab(); break;
        case 'file.new-blank-graph': handleAddBlankGraph(); break;
        case 'file.open-graph': openFilePicker('.arcgraph,application/vnd.arc-studio.graph+json', (file) => handleImportGraph(file)); break;
        case 'file.open-project': openFilePicker('.arcproject,.arcproject.json,application/json', (file) => {
          setProjectImportFile(file);
          setProjectImportTrusted(false);
          setProjectImportError('');
          setProjectImportCompatibility(null);
          setProjectImportOldVersionApproved(false);
        }); break;
        case 'file.save-graph': handleSaveGraph(); break;
        case 'file.export-graph': handleExportGraph(); break;
        case 'file.export-project': {
          const project = projects.find((item) => item.id === activeProjectId);
          if (project) handleExportProject(project);
          break;
        }
        case 'edit.undo': handleUndo(); break;
        case 'edit.redo': handleRedo(); break;
        case 'view.library': {
          const shouldOpen = !isLibraryOpen;
          setIsLibraryOpen(shouldOpen);
          if (shouldOpen) { setIsProjectsOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); }
          break;
        }
        case 'view.console': setConsoleOpenRequest((request) => request + 1); break;
        case 'view.settings': setIsSettingsOpen(true); break;
        case 'help.shortcuts': setIsShortcutsOpen(true); break;
        default: break;
      }
    };
    window.addEventListener('arc:desktop-menu-action', onMenuAction);
    return () => window.removeEventListener('arc:desktop-menu-action', onMenuAction);
  }, [activeProjectId, desktopMode, handleAddBlankGraph, handleAddTab, handleExportGraph, handleExportProject, handleImportGraph, handleRedo, handleSaveGraph, handleUndo, isLibraryOpen, projects]);

  const handleSetProjectLimit = async (value) => {
    if (localDesktopWorkspace) return;
    try {
      const response = await fetch(apiUrl('/api/projects/settings'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ maxProjects: value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the project limit.');
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects ?? null);
    } catch (error) { setProjectError(error.message); }
  };

  const handleSetIdleDisconnectMinutes = async (value) => {
    if (localDesktopWorkspace) return;
    try {
      const response = await fetch(apiUrl('/api/projects/idle-disconnect'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ idleDisconnectMinutes: Number(value) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the idle timeout.');
      setProjects((current) => current.map((project) => project.id === data.projectId ? { ...project, idleDisconnectMinutes: data.idleDisconnectMinutes } : project));
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Idle timeout not changed', message: error.message, type: 'error' }); }
  };

  const handleActivateProject = async (projectId, allowWhileBusy = false) => {
    if (!projectId || projectId === activeProjectId || projectBusy && !allowWhileBusy) return;
    setProjectBusy(true);
    setProjectError('');
    try {
      await ensureWorkspaceGraphsSaved();
      const activationUrl = apiUrl(`/api/projects/${encodeURIComponent(projectId)}/activate`);
      const activationOptions = { method: 'POST', headers: { 'x-arc-token': authToken } };
      let response;
      try {
        response = await fetch(activationUrl, activationOptions);
      } catch (firstError) {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        try { response = await fetch(activationUrl, activationOptions); }
        catch { throw new Error('The workspace could not be reached while switching projects. Try again.'); }
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not open project.');
      const projectGraphs = (data.graphs || []).map(migrateFunctionGraphEntry);
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      setNeedsProjectOnboarding(!(data.projects || []).length);
      setActiveProjectId(data.activeProjectId || projectId);
      setSavedGraphs(projectGraphs);
      setGraphTemplates(data.graphLibrary?.templates || []);
      setGraphSnapshots(data.graphLibrary?.snapshots || []);
      setDefaultGraphId(data.graphLibrary?.defaultGraphId ?? '');
      setEmbedAssets(data.embeds || []);
      setBotProfile(data.botProfile || null);
      setBotStatus(data.botStatus || 'DISCONNECTED');
      setBotMetrics(data.botMetrics || { latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
      setLogs(data.logs || []);
      setTabs([]);
      setActiveTabId(null);
      setActiveNodes([]);
      setActiveConnections([]);
      setLogs([]);
      setIsProjectsOpen(false);
      graphsHydratedRef.current = true;
      if (localDesktopWorkspace) {
        const storedIds = safeStorageGet(`arc_project_${projectId}_arc_open_graph_ids`, null);
        let openIds = [];
        try { openIds = storedIds ? JSON.parse(storedIds) : []; } catch {}
        const graphById = new Map(projectGraphs.map((graph) => [graph.id, graph]));
        const opened = (Array.isArray(openIds) ? openIds.map((id) => graphById.get(id)).filter(Boolean) : []).slice(0, MAX_OPEN_GRAPH_TABS);
        setTabs(opened);
        const preferred = safeStorageGet(`arc_project_${projectId}_arc_active_graph_id`, '');
        setActiveTabId(opened.some((graph) => graph.id === preferred) ? preferred : opened[0]?.id || null);
      } else {
        projectTabStartupPendingRef.current = true;
        projectTabSafeRestorePendingRef.current = true;
        projectTabSafeRestoreProjectRef.current = projectId;
        projectTabStartupBaselineRef.current = new Set();
      }
      setWorkspaceRevision((revision) => revision + 1);
      historyRef.current.clear();
      return true;
    } catch (error) { setProjectError(error.message); return false; }
    finally { setProjectBusy(false); }
  };

  useEffect(() => {
    if (desktopMode || browserRouteHandledRef.current || !isReady || !authToken || projects.length === 0 || !graphsHydratedRef.current) return;
    const route = initialBrowserRouteRef.current;
    if (!route) return;
    if (route.projectId && !projects.some((project) => project.id === route.projectId)) {
      browserRouteHandledRef.current = true;
      browserInitialRouteSettledRef.current = true;
      browserStudioRestorePendingRef.current = false;
      arcEvents.emit('toast:notify', { title: 'Project unavailable', message: 'This project is not available in the current workspace.', type: 'warning' });
      return;
    }
    if (route.projectId && route.projectId !== activeProjectId) {
      if (browserProjectSwitchRef.current) return;
      browserProjectSwitchRef.current = true;
      void handleActivateProject(route.projectId, true).finally(() => { browserProjectSwitchRef.current = false; });
      return;
    }
    if (browserProjectSwitchRef.current) return;
    if (route.projectId && activeProjectId !== route.projectId) return;
    if (route.emptyWorkspace && !route.graphId) {
      setTabs([]);
      setActiveTabId(null);
      setActiveNodes([]);
      setActiveConnections([]);
    }
    if (route.graphId) {
      const graph = savedGraphs.find((item) => item.id === route.graphId);
      if (!graph) {
        browserRouteHandledRef.current = true;
        browserInitialRouteSettledRef.current = true;
        browserStudioRestorePendingRef.current = false;
        arcEvents.emit('toast:notify', { title: 'Graph unavailable', message: 'This graph is not available in the selected project.', type: 'warning' });
        return;
      }
      handleOpenGraph(graph);
      if (route.nodeId) setNodeFocusRequest({ graphId: graph.id, nodeId: route.nodeId, requestId: `url-${Date.now()}` });
    }
    const panel = route.panel;
    setIsLibraryOpen(panel === 'library');
    setIsVariablesOpen(panel === 'variables');
    setIsPluginStoreOpen(panel === 'plugins');
    setIsBotSidebarOpen(panel === 'bot');
    setIsProjectsOpen(panel === 'projects');
    if (route.variableScope === 'project' || route.variableScope === 'graph') setVariableScope(route.variableScope);
    if (['graphs', 'nodes', 'data', 'assets'].includes(route.librarySection)) setLibrarySection(route.librarySection);
    browserRouteHandledRef.current = true;
  }, [activeProjectId, authToken, desktopMode, handleOpenGraph, isReady, projects, savedGraphs, socketReadyRevision]);

  useEffect(() => {
    if (desktopMode || !browserRouteHandledRef.current || !browserStudioRestorePendingRef.current || !authToken || !activeProjectId) return;
    const route = initialBrowserRouteRef.current;
    const studioRoute = route?.studio;
    if (!studioRoute?.kind) {
      browserStudioRestorePendingRef.current = false;
      return;
    }
    if (route.projectId && route.projectId !== activeProjectId) return;
    if (route.graphId && (activeTabId !== route.graphId || !activeGraph)) return;
    if (route.graphId && activeGraph && (
      activeNodes.length !== (activeGraph.nodes || []).length
      || activeNodes.some((item, index) => item !== activeGraph.nodes[index])
      || activeConnections.length !== (activeGraph.connections || []).length
      || activeConnections.some((item, index) => item !== activeGraph.connections[index])
    )) return;
    if (!route.graphId && route.emptyWorkspace && activeTabId) return;

    const matchesStudioRoute = (candidate) => {
      if (!candidate || candidate.kind !== studioRoute.kind) return false;
      for (const key of ['nodeId', 'fieldKey', 'scope', 'variableId', 'mode', 'assetId', 'blockId', 'blockKey', 'blockCollection', 'tab']) {
        if (studioRoute[key] && candidate[key] !== studioRoute[key]) return false;
      }
      return true;
    };
    const alreadyRestored = [discordTextStudio, embedStudio, permissionStudio, slashCommandStudio, modalStudio]
      .some((studio) => studio?.projectId === activeProjectId && studio.graphId === (route.graphId || null) && matchesStudioRoute(studio.route));
    if (alreadyRestored) {
      browserStudioRestorePendingRef.current = false;
      return;
    }

    const finishRestore = (message) => {
      if (message) {
        browserStudioRestorePendingRef.current = false;
        arcEvents.emit('toast:notify', { title: 'Studio could not be reopened', message, type: 'warning' });
      }
    };
    const findNode = () => activeGraph?.nodes?.find((node) => node.id === studioRoute.nodeId);
    const node = findNode();

    if (studioRoute.kind === 'text-variable') {
      const variables = studioRoute.scope === 'project' ? projectVariables : (activeGraph?.variables || []);
      const variable = variables.find((item) => item.id === studioRoute.variableId);
      if (!variable) { finishRestore('The selected variable is no longer available.'); return; }
      openVariableTextEditor(variable, studioRoute.scope === 'project' ? 'project' : 'graph');
      finishRestore();
      return;
    }
    if (studioRoute.kind === 'text-node') {
      if (!node || !studioRoute.fieldKey) { finishRestore('The selected text field is no longer available.'); return; }
      openDiscordTextStudio(node, studioRoute.fieldKey, studioRoute.label || studioRoute.fieldKey, node.data?.[studioRoute.fieldKey] ?? '', studioRoute.maxLength || undefined, undefined, '', null, studioRoute);
      finishRestore();
      return;
    }
    if (studioRoute.kind === 'node-embed-text') {
      const block = node?.data?.blocks?.find((item) => item.id === studioRoute.blockId);
      if (!node || !block || !studioRoute.blockKey) { finishRestore('The selected embed text field is no longer available.'); return; }
      const applyValue = (value) => {
        const blocks = (node.data?.blocks || []).map((item) => item.id === studioRoute.blockId ? { ...item, [studioRoute.blockKey]: value } : item);
        handleNodesChange(activeNodes.map((item) => item.id === node.id ? { ...item, data: { ...item.data, blocks } } : item));
        return true;
      };
      openDiscordTextStudio(node, null, studioRoute.label || studioRoute.blockKey, block[studioRoute.blockKey] ?? '', studioRoute.maxLength || undefined, applyValue, '', { blockId: studioRoute.blockId, blockKey: studioRoute.blockKey }, studioRoute);
      finishRestore();
      return;
    }
    if (['embed', 'components', 'permission', 'arguments', 'popup-modal'].includes(studioRoute.kind)) {
      if (studioRoute.mode === 'asset') {
        const asset = embedAssets.find((item) => item.id === studioRoute.assetId);
        if (!asset) { finishRestore('The selected embed asset is no longer available.'); return; }
        openEmbedAsset(asset, studioRoute);
      } else if (studioRoute.mode === 'new') {
        createEmbedAsset(studioRoute);
      } else {
        if (!node) { finishRestore('The selected node is no longer available.'); return; }
        if (studioRoute.kind === 'embed' || studioRoute.kind === 'components') openEmbedStudioForNode(node, studioRoute);
        else if (studioRoute.kind === 'permission') openPermissionStudio({ ...node, label: studioRoute.label || node.label }, studioRoute.mode);
        else if (studioRoute.kind === 'arguments') openSlashCommandStudio(node);
        else openModalStudioForNode(node);
      }
      finishRestore();
      return;
    }
    if (studioRoute.kind === 'embed-text') {
      const parentMode = studioRoute.mode || 'node';
      const parentMatches = embedStudio?.projectId === activeProjectId
        && embedStudio.mode === parentMode
        && (!studioRoute.tab || embedStudio.route?.tab === studioRoute.tab)
        && (parentMode === 'asset' ? embedStudio.id === studioRoute.assetId : parentMode === 'new' || embedStudio.nodeId === studioRoute.nodeId);
      if (!parentMatches) {
        if (parentMode === 'asset') {
          const asset = embedAssets.find((item) => item.id === studioRoute.assetId);
          if (!asset) { finishRestore('The selected embed asset is no longer available.'); return; }
          openEmbedAsset(asset, { kind: 'embed', mode: 'asset', assetId: asset.id, tab: studioRoute.tab || 'embed' });
        } else if (parentMode === 'new') createEmbedAsset({ kind: 'embed', mode: 'new', tab: studioRoute.tab || 'embed' });
        else if (node) openEmbedStudioForNode(node, { kind: parentMode === 'components-node' ? 'components' : 'embed', nodeId: node.id, mode: parentMode, tab: studioRoute.tab || 'embed' });
        else { finishRestore('The selected embed node is no longer available.'); return; }
        return;
      }
      const isComponentsV2Text = studioRoute.blockCollection === 'componentsV2Layout';
      let block = null;
      const findBlock = (nodes) => {
        for (const item of nodes || []) {
          if (item.id === studioRoute.blockId) { block = item; return true; }
          if (findBlock(item.children)) return true;
        }
        return false;
      };
      findBlock(isComponentsV2Text ? embedStudio.componentsV2Layout : embedStudio.blocks);
      if (!block || !studioRoute.blockKey) { finishRestore('The selected embed text field is no longer available.'); return; }
      const value = String(studioRoute.blockKey).split('.').reduce((current, key) => current?.[key], block) ?? '';
      openDiscordTextStudio(null, null, studioRoute.label || studioRoute.blockKey, value, studioRoute.maxLength || undefined,
        (next) => updateEmbedStudioBlockValue(studioRoute.blockId, studioRoute.blockKey, next, studioRoute.blockCollection),
        embedStudio.collabId, { blockId: studioRoute.blockId, blockKey: studioRoute.blockKey, blockCollection: studioRoute.blockCollection }, studioRoute);
      finishRestore();
      return;
    }
    finishRestore('This studio link is not recognized.');
  }, [activeConnections, activeGraph, activeNodes, activeProjectId, activeTabId, authToken, createEmbedAsset, desktopMode, discordTextStudio, embedAssets, embedStudio, modalStudio, openDiscordTextStudio, openEmbedAsset, openEmbedStudioForNode, openModalStudioForNode, openPermissionStudio, openSlashCommandStudio, openVariableTextEditor, permissionStudio, projectVariables, slashCommandStudio, updateEmbedStudioBlockValue]);

  useEffect(() => {
    if (desktopMode || !browserRouteHandledRef.current || browserStudioRestorePendingRef.current || !authToken || !activeProjectId) return;
    if (!browserInitialRouteSettledRef.current) {
      const initialRoute = initialBrowserRouteRef.current;
      if (initialRoute?.projectId && initialRoute.projectId !== activeProjectId) return;
      if (initialRoute?.graphId && (activeTabId !== initialRoute.graphId || !activeGraph)) return;
      if (!initialRoute?.graphId && initialRoute?.emptyWorkspace && activeTabId) return;
      browserInitialRouteSettledRef.current = true;
    }
    const graphId = activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : '';
    const segments = ['/projects', encodeURIComponent(projectIdToRouteSegment(activeProjectId))];
    if (graphId) segments.push('graphs', encodeURIComponent(graphIdToRouteSegment(graphId)));
    const url = new URL(window.location.href);
    url.pathname = segments.join('/');
    url.search = '';
    const selectedNode = graphId ? selectedCanvasNodeId : '';
    if (selectedNode) url.searchParams.set('node', selectedNode);
    if (!graphId) url.searchParams.set('empty', '1');
    const panel = isLibraryOpen ? 'library' : isVariablesOpen ? 'variables' : isPluginStoreOpen ? 'plugins' : isBotSidebarOpen ? 'bot' : isProjectsOpen ? 'projects' : '';
    if (panel) url.searchParams.set('panel', panel);
    if (panel === 'library') url.searchParams.set('library', librarySection);
    if (panel === 'variables') url.searchParams.set('variableScope', variableScope);
    const studioRoute = discordTextStudioOpenForActiveGraph ? discordTextStudio.route
      : embedStudioOpenForActiveGraph ? embedStudio.route
        : permissionStudioOpenForActiveGraph ? permissionStudio.route
          : slashCommandStudioOpenForActiveGraph ? slashCommandStudio.route
            : modalStudioOpenForActiveGraph ? modalStudio.route : null;
    writeStudioRouteParams(url.searchParams, studioRoute);
    if (url.pathname !== window.location.pathname || url.search !== window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [activeProjectId, activeTabId, desktopMode, discordTextStudio, discordTextStudioOpenForActiveGraph, embedStudio, embedStudioOpenForActiveGraph, isBotSidebarOpen, isLibraryOpen, isPluginStoreOpen, isProjectsOpen, isVariablesOpen, librarySection, modalStudio, modalStudioOpenForActiveGraph, permissionStudio, permissionStudioOpenForActiveGraph, selectedCanvasNodeId, slashCommandStudio, slashCommandStudioOpenForActiveGraph, tabs, variableScope, authToken]);

  useEffect(() => {
    const startupProjectId = window.__ARC_STUDIO_CONFIG__?.startupProjectId;
    if (!desktopMode || !startupProjectId || !isReady || !authToken || startupProjectHandledRef.current || !projects.length) return;
    if (!projects.some((project) => project.id === startupProjectId)) {
      startupProjectHandledRef.current = true;
      arcEvents.emit('toast:notify', { title: 'Could not open project', message: 'This project is no longer in the workspace.', type: 'error' });
      return;
    }
    startupProjectHandledRef.current = true;
    if (startupProjectId !== activeProjectId) void handleActivateProject(startupProjectId);
  }, [activeProjectId, authToken, desktopMode, isReady, projects]);

  const handleOpenProjectInNewWindow = async (project) => {
    if (!desktopMode || !localDesktopWorkspace || !project) return;
    try {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') throw new Error('Desktop window controls are unavailable.');
      await invoke('open_project_window', { projectId: project.id });
      arcEvents.emit('toast:notify', { title: 'Project window opened', message: project.name, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Could not open project window', message: error.message, type: 'error' });
    }
  };

  const openProjectMenu = (event, project, anchor = null) => {
    event.preventDefault?.();
    event.stopPropagation();
    const root = document.querySelector('.app-root');
    const bounds = root?.getBoundingClientRect();
    const scale = getArcUiScale();
    const rootWidth = root?.offsetWidth || window.innerWidth / scale;
    const rootHeight = root?.offsetHeight || window.innerHeight / scale;
    const clientX = anchor?.x ?? event.clientX;
    const clientY = anchor?.y ?? event.clientY;
    const x = (clientX - (bounds?.left || 0)) / scale;
    const y = (clientY - (bounds?.top || 0)) / scale;
    const menuWidth = 190;
    const menuHeight = project ? (desktopMode && localDesktopWorkspace ? 156 : 116) : 44;
    setProjectMenu({ project, kind: project ? 'project' : 'create', x: Math.max(8, Math.min(x, rootWidth - menuWidth - 8)), y: Math.max(8, Math.min(y, rootHeight - menuHeight - 8)) });
  };

  const handleDeleteProject = async () => {
    if (!projectDelete || projectBusy) return;
    setProjectBusy(true);
    setProjectDeleteError('');
    try {
      if (projectDelete.id === activeProjectId) await ensureWorkspaceGraphsSaved();
      const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectDelete.id)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ confirmName: projectDeleteName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete the project.');
      setProjects((data.projects || []).filter((project) => project.id !== data.deletedProjectId));
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      safeStorageRemove(`arc_project_${projectDelete.id}_arc_open_graph_ids`);
      safeStorageRemove(`arc_project_${projectDelete.id}_arc_active_graph_id`);
      if (projectDelete.id === activeProjectId) {
        setActiveProjectId(data.activeProjectId || '');
        setNeedsProjectOnboarding(!(data.projects || []).length);
        setSavedGraphs((data.graphs || []).map(migrateFunctionGraphEntry));
        setGraphTemplates(data.graphLibrary?.templates || []);
        setGraphSnapshots(data.graphLibrary?.snapshots || []);
        setDefaultGraphId(data.graphLibrary?.defaultGraphId ?? '');
        setEmbedAssets(data.embeds || []);
        setBotProfile(data.botProfile || null);
        setBotStatus('DISCONNECTED');
        setBotMetrics({ latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
        setTabs([]);
        setActiveTabId(null);
        setActiveNodes([]);
        setActiveConnections([]);
        setLogs([]);
        graphsHydratedRef.current = true;
        historyRef.current.clear();
        setWorkspaceRevision((revision) => revision + 1);
      }
      setProjectDelete(null);
      setProjectDeleteName('');
    } catch (error) { setProjectDeleteError(error.message); }
    finally { setProjectBusy(false); }
  };

  const attemptDeleteProject = () => {
    if (!projectDelete || projectBusy) return;
    if (projectDeleteName.trim() !== projectDelete.name) {
      setProjectDeletePromptError('Enter the exact project name to confirm.');
      setProjectDeleteFieldShake(false);
      if (projectDeleteFeedbackTimerRef.current) clearTimeout(projectDeleteFeedbackTimerRef.current);
      if (projectDeleteShakeTimerRef.current) clearTimeout(projectDeleteShakeTimerRef.current);
      projectDeleteInputRef.current?.focus();
      requestAnimationFrame(() => setProjectDeleteFieldShake(true));
      projectDeleteShakeTimerRef.current = setTimeout(() => setProjectDeleteFieldShake(false), 1000);
      projectDeleteFeedbackTimerRef.current = setTimeout(() => setProjectDeletePromptError(''), 1600);
      return;
    }
    setProjectDeletePromptError('');
    handleDeleteProject();
  };

  useEffect(() => {
    if (!projectMenu) return undefined;
    const dismiss = () => setProjectMenu(null);
    const keydown = (event) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', keydown);
    const removePageBlurListener = onPageBlur(dismiss);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', keydown);
      removePageBlurListener();
    };
  }, [projectMenu]);

  const handleCreateFirstProject = async (name, templateId = 'blank') => {
    const response = await fetch(apiUrl('/api/projects/initialize'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
      body: JSON.stringify({ name, templateId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not create the project.');
    const projectId = data.project?.id;
    if (!projectId) throw new Error('The workspace did not return the new project.');
    setProjects(data.projects || []);
    setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
    setActiveProjectId(data.activeProjectId || projectId);
    const initialGraphs = (data.graphs || []).map(migrateFunctionGraphEntry);
    setSavedGraphs(initialGraphs);
    setGraphTemplates(data.graphLibrary?.templates || []);
    setGraphSnapshots(data.graphLibrary?.snapshots || []);
    setDefaultGraphId(data.graphLibrary?.defaultGraphId ?? '');
    setEmbedAssets(data.embeds || []);
    setBotProfile(data.botProfile || null);
    const initialTabs = initialGraphs;
    setTabs(initialTabs);
    setActiveTabId(initialTabs[0]?.id || null);
    setNeedsProjectOnboarding(false);
    graphsHydratedRef.current = true;
    historyRef.current.clear();
    setWorkspaceRevision((revision) => revision + 1);
  };

  const activateWorkspace = (mode, url = '') => {
    try {
      localStorage.setItem('arc_workspace_mode', mode);
      if (mode === 'remote') localStorage.setItem('arc_remote_workspace_url', url);
    } catch {}
    deletedGraphsRef.current.clear();
    reconnectGraphBaseRef.current.clear();
    collaborationPresenceRef.current = { projectId: '', graphId: '' };
    pendingCollaborationActionRef.current.clear();
    latestRemoteCollaborationRevisionRef.current.clear();
    localCanvasMotionRoomRef.current = '';
    collaborationMotionSendIntervalRef.current = 16;
    liveGraphReadyRef.current.clear();
    liveGraphBaseRef.current.clear();
    liveGraphRevisionRef.current.clear();
    lastLiveGraphSentRef.current.clear();
    pendingLiveGraphRef.current.clear();
    remoteProjectTabGraphsRef.current.clear();
    unsharedProjectTabIdsRef.current.clear();
    remoteTabCloseNoticeRef.current.clear();
    initialGraphStatesRef.current.clear();
    projectTabSyncRef.current = { projectId: '', socketRevision: -1, graphIds: [] };
    projectTabStartupBaselineRef.current = new Set();
    projectTabStartupPendingRef.current = !(desktopMode && mode === 'local');
    projectTabSafeRestorePendingRef.current = !(desktopMode && mode === 'local');
    projectTabSafeRestoreProjectRef.current = '';
    for (const timer of liveGraphSendTimersRef.current.values()) window.clearTimeout(timer);
    liveGraphSendTimersRef.current.clear();
    window.clearTimeout(collaborationActionTimerRef.current);
    collaborationActionTimerRef.current = null;
    setWorkspaceMode(mode);
    setFailedWorkspaceNodeTypes(new Set());
    nodeRegistryRevisionRef.current = '';
    installedPluginsRef.current = [];
    setInstalledPlugins([]);
    registerPluginNodeDefinitions([]);
    setPluginDefinitionsRevision((revision) => revision + 1);
    setTransientCanvasMotionSupported(false);
    setSupportedWorkspaceNodeTypes(null);
    setWorkspaceCompatibilityNotice('');
    setWorkspaceSwitchOpen(false);
    if (mode === 'remote') setRemoteWorkspaceUrl(url);
    if (mode === 'remote') {
      safeStorageRemove('arc_token');
      setAuthToken('');
    }
    setWorkspaceError('');
    setCurrentUser(null);
    setAuthToken(mode === 'local' && desktopMode
      ? readLocalDesktopSessionToken() || safeStorageGet('arc_token')
      : safeStorageGet('arc_token'));
    setNeedsSetup(false);
    setIsReady(false);
    setTabs([]);
    setSavedGraphs([]);
    setEmbedAssets([]);
    setActiveTabId(null);
    setActiveNodes([]);
    setActiveConnections([]);
    setGraphTemplates([]);
    setGraphSnapshots([]);
    graphsHydratedRef.current = false;
    historyRef.current.clear();
    setWorkspaceRevision((revision) => revision + 1);
  };

  const handleConnectWorkspace = async (value) => {
    if (!networkOnline) throw new Error('External workspaces are unavailable offline.');
    const url = normalizeWorkspaceUrl(value);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${url}/api/system/status`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Workspace responded with HTTP ${response.status}.`);
      let status;
      try { status = await response.json(); }
      catch { throw new Error('This server did not return a valid ARC Studio response.'); }
      if (typeof status.isSetupCompleted !== 'boolean') throw new Error('This server is not an ARC Studio workspace.');
      const requiredClientVersion = String(status.minimumClientVersion || status.version || '').trim();
      const minimumVersionOrder = compareArcVersions(studioPackage.version, requiredClientVersion);
      if (minimumVersionOrder === null || minimumVersionOrder < 0) throw new Error(`Update ARC Studio to ${requiredClientVersion || 'the required version'} or newer before connecting.`);
      const registryCompatibility = getNodeRegistryCompatibility({
        nodeRegistryProtocolVersion: status.nodeRegistryProtocolVersion,
        nodeRegistryFeatures: SUPPORTED_NODE_REGISTRY_FEATURES
      }, status.nodeRegistryRequiredFeatures);
      if (!registryCompatibility.compatible) {
        const unsupported = registryCompatibility.unsupportedFeatures.length ? ` Unsupported features: ${registryCompatibility.unsupportedFeatures.join(', ')}.` : '';
        throw new Error(`This workspace requires node registry protocol ${status.nodeRegistryProtocolVersion ?? 'unknown'}, which this client cannot use.${unsupported} Update ARC Studio before connecting.`);
      }
      setMinimumRequiredClientVersion(requiredClientVersion);
      let compatibilityNotice = '';
      let supportedNodeTypes = null;
      if (desktopMode) {
        setWorkspaceNodeDefinitions(null);
        setFailedWorkspaceNodeTypes(new Set());
        nodeRegistryRevisionRef.current = '';
        setPluginDefinitionsRevision((revision) => revision + 1);
        const serverVersion = String(status.version || '').trim();
        const versionOrder = compareArcVersions(serverVersion, studioPackage.version);
        let serverNodeTypes = Array.isArray(status.supportedNodeTypes) ? status.supportedNodeTypes : null;
        if (Array.isArray(serverNodeTypes) && serverNodeTypes.length && serverNodeTypes.every((type) => typeof type === 'string')) {
          supportedNodeTypes = new Set(serverNodeTypes);
        }
        if (versionOrder < 0) compatibilityNotice = `Connected to older workspace version ${serverVersion}. Node behavior runs on the workspace server.`;
        else if (versionOrder > 0) compatibilityNotice = `Connected to newer workspace version ${serverVersion}. The server provides node schemas and runtime behavior.`;
      }
      const name = (typeof status.workspaceName === 'string' && status.workspaceName.trim() ? status.workspaceName.trim() : new URL(url).host).slice(0, 35);
      setRemoteWorkspaceName(name);
      try { localStorage.setItem('arc_remote_workspace_name', name); } catch {}
      activateWorkspace('remote', url);
      setTransientCanvasMotionSupported(status.collaborationFeatures?.transientCanvasMotion === true);
      setSupportedWorkspaceNodeTypes(supportedNodeTypes);
      setWorkspaceCompatibilityNotice(compatibilityNotice);
      return { notice: compatibilityNotice };
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The workspace did not respond in time.');
      if (error instanceof TypeError) throw new Error('Could not reach this workspace. Check the URL, network, and server CORS settings.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
      controller.abort();
    }
  };

  const handleSelectWorkspace = (mode) => {
    if (mode === 'local' && workspaceMode !== 'local') activateWorkspace('local');
  };

  const handleRetryWorkspace = () => {
    setWorkspaceError('');
    setIsReady(false);
    setWorkspaceRevision((revision) => revision + 1);
  };

  const handleSwitchWorkspace = async () => {
    if (workspaceMode === 'local' && authToken && currentUser) {
      localSessionRef.current = { token: authToken, user: currentUser };
      try {
        if (localStorage.getItem('arc_local_keep_signed_in') !== 'false') writeLocalDesktopSessionToken(authToken);
        else removeLocalDesktopSessionToken();
      } catch { writeLocalDesktopSessionToken(authToken); }
    } else if (workspaceMode === 'remote' && authToken) {
      try { await fetch(apiUrl('/api/auth/logout'), { method: 'POST', headers: { 'x-arc-token': authToken } }); } catch {}
      safeStorageRemove('arc_token');
      setAuthToken('');
      setCurrentUser(null);
    }
    setWorkspaceSwitchOpen(true);
  };

  const handleBackToLocalEditor = async () => {
    const session = localSessionRef.current;
    if (!session?.token) return;
    try { localStorage.setItem('arc_workspace_mode', 'local'); } catch {}
    setWorkspaceMode('local');
    setWorkspaceError('');
    try {
      const response = await fetch(apiUrl('/api/auth/me'), { headers: { 'x-arc-token': session.token } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) throw new Error('The saved Local Workspace session has expired. Sign in again.');
      localSessionRef.current = { token: session.token, user: data.user };
      safeStorageSet('arc_token', session.token);
      setAuthToken(session.token);
      setCurrentUser(data.user);
      setWorkspaceError('');
      setWorkspaceSwitchOpen(false);
      setIsReady(false);
      setWorkspaceRevision((revision) => revision + 1);
    } catch {
      localSessionRef.current = null;
      removeLocalDesktopSessionToken();
      safeStorageRemove('arc_token');
      setAuthToken('');
      setCurrentUser(null);
      setWorkspaceError('');
      setWorkspaceSwitchOpen(false);
    }
  };

  const handleResetLocalData = async (password) => {
    if (!desktopMode || workspaceMode !== 'local') throw new Error('Reset is available for the desktop Local Workspace only.');
    if (currentUser?.isPrimaryAdmin !== true) throw new Error('Only the Local Workspace owner can delete its data.');
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') throw new Error('The desktop reset service is unavailable.');
    let serverPort = null;
    try {
      const configuredApiUrl = window.__ARC_STUDIO_CONFIG__?.apiBaseUrl || '';
      const serverUrl = new URL(configuredApiUrl || (import.meta.env.DEV ? window.location.origin : ''));
      if (serverUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(serverUrl.hostname)) {
        serverPort = Number(serverUrl.port) || 80;
      }
    } catch { /* Rust */ }
    await invoke('reset_local_data', { username: currentUser?.username || '', password, serverPort });
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('arc_remote_') || key.startsWith('arc_trusted_') || key.includes('::workspace:')) continue;
        localStorage.removeItem(key);
      }
      localStorage.setItem('arc_workspace_mode', 'local');
      sessionStorage.clear();
    } catch {}
  };

  const adjustUiScale = (step) => {
    setSettings((current) => {
      const currentScale = Number(current.uiScale) || 100;
      const nextScale = String(Math.min(140, Math.max(80, currentScale + step)));
      const next = { ...current, uiScale: nextScale };
      safeStorageSet('arc_editor_settings', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!authToken || remoteWorkspaceBlocked || settings.autoSnapshots === false) return undefined;
    const intervalMinutes = Math.max(10, Math.min(1440, Number(settings.snapshotIntervalMinutes) || 30));
    const retentionHours = settings.snapshotRetentionHours === 0 || settings.snapshotRetentionHours === '0'
      ? 0
      : Math.max(12, Math.min(8760, Number(settings.snapshotRetentionHours) || 12));
    const timer = window.setInterval(async () => {
      if (autoSnapshotInFlightRef.current) return;
      const graphs = tabsRef.current.filter((graph) => graph?.id && !graph.localRecoveryOnly && Array.isArray(graph.nodes) && Array.isArray(graph.connections));
      if (!graphs.length) return;
      autoSnapshotInFlightRef.current = true;
      try {
        for (const graph of graphs) {
          const response = await fetch(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}/snapshots`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
            body: JSON.stringify({ graph, name: 'Automatic checkpoint', automatic: true, retentionHours })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not save an automatic graph snapshot.');
          if (Array.isArray(data.snapshots)) setGraphSnapshots(data.snapshots);
        }
      } catch (error) {
        arcEvents.emit('toast:notify', { title: 'Automatic snapshot failed', message: error.message, type: 'error' });
      } finally {
        autoSnapshotInFlightRef.current = false;
      }
    }, intervalMinutes * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [authToken, remoteWorkspaceBlocked, settings.autoSnapshots, settings.snapshotIntervalMinutes, settings.snapshotRetentionHours]);

  useEffect(() => {
    if (remoteWorkspaceBlocked) return undefined;
    const onKeyDown = (event) => {
      const target = event.target;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const configuredShortcuts = desktopMode ? settings.shortcuts || {} : {};
      const shortcuts = { ...DEFAULT_SHORTCUTS, redo: getDefaultShortcut('redo', shortcutPlatform), ...configuredShortcuts };
      if (!configuredShortcuts.redo || configuredShortcuts.redo === DEFAULT_SHORTCUTS.redo) shortcuts.redo = getDefaultShortcut('redo', shortcutPlatform);
      if (shortcutMatches(event, shortcuts.closeTab)) {
        event.preventDefault();
        event.stopPropagation();
        const dialogIsOpen = Boolean(closeGraphDialog) || (target instanceof HTMLElement && target.closest('[role="dialog"]'));
        if (!dialogIsOpen && activeTabId) handleCloseTab(activeTabId);
        return;
      }
      if (shortcutMatches(event, shortcuts.connectGateway)) {
        event.preventDefault();
        event.stopPropagation();
        if (!(target instanceof HTMLElement && target.closest('[role="dialog"]'))) {
          if (botStatus !== 'CONNECTING' && !botStartPendingRef.current) {
            if (botStatus === 'ONLINE') handleStopBot();
            else handleStartBot();
          }
        }
        return;
      }
      if (command && !event.altKey && key === 's') {
        event.preventDefault();
        event.stopPropagation();
        if (shortcutMatches(event, shortcuts.saveGraph)) {
          if (discordTextStudioOpenForActiveGraph) {
            handleSaveTextStudio();
          } else if (embedStudioOpenForActiveGraph) {
            handleSaveEmbedShortcut();
          } else {
            handleSaveGraph();
          }
        }
        return;
      }
      if (target instanceof HTMLElement && target.closest('[role="dialog"]')) return;
      if (command && !event.altKey && key === 'f') {
        const sidebarOpen = isLibraryOpen || isProjectsOpen || isPluginStoreOpen || isBotSidebarOpen || isVariablesOpen;
        if (sidebarOpen) {
          event.preventDefault();
          event.stopPropagation();
          window.dispatchEvent(new Event('arc:canvas-find-close'));
          const searchInput = document.querySelector('.graph-library-search input, aside[aria-label="Projects"] .project-sidebar-search input, aside[aria-label="Plugin store"] .plugin-store-search input, aside[aria-label="Bot"] input[placeholder*="search" i], aside[aria-label="Variables"] input[placeholder*="search" i], aside input[placeholder^="Filter " i]');
          if (searchInput instanceof HTMLInputElement && !searchInput.disabled) {
            searchInput.focus();
            searchInput.select();
          }
          return;
        }
      }
      if (command && !event.altKey && key === 'g'
        && (isLibraryOpen || isProjectsOpen || isPluginStoreOpen || isBotSidebarOpen || isVariablesOpen)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (shortcutMatches(event, shortcuts.switchTabNext) && tabs.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
        const nextTabId = tabs[(currentIndex + 1) % tabs.length].id;
        setActiveTabId(nextTabId);
        rememberUserGraph(nextTabId);
        return;
      }
      if (shortcutMatches(event, shortcuts.switchTabPrevious) && tabs.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
        const nextTabId = tabs[(currentIndex - 1 + tabs.length) % tabs.length].id;
        setActiveTabId(nextTabId);
        rememberUserGraph(nextTabId);
        return;
      }
      const isTextEditingTarget = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (!isTextEditingTarget && shortcutMatches(event, shortcuts.exportBot)) {
        event.preventDefault();
        event.stopPropagation();
        handleExportBot();
        return;
      }
      if (!desktopMode && command && !event.altKey && key === 'r') {
        event.preventDefault();
        event.stopPropagation();
        const hasUnsavedGraphs = tabs.some((graph) => graph.isDirty || !savedGraphs.some((saved) => saved.id === graph.id));
        const hasUnsavedEmbed = Boolean(embedStudio && (embedStudio.mode === 'new' || embedStudio.isDirty));
        if (hasUnsavedGraphs || hasUnsavedEmbed) setReloadConfirm(true);
        else window.location.reload();
        return;
      }
      if (shortcutMatches(event, shortcuts.newGraph) || shortcutMatches(event, shortcuts.newBlankGraph)) {
        event.preventDefault();
        event.stopPropagation();
        if (shortcutMatches(event, shortcuts.newBlankGraph)) handleAddBlankGraph();
        else handleAddTab();
        return;
      }
      const renameShortcut = !isTextEditingTarget && !isLocked && selectedCanvasNodeCount === 1 && selectedCanvasNodeId
        && shortcutMatches(event, shortcuts.renameNode);
      if (renameShortcut) {
        const selectedNode = activeNodes.find((node) => node.id === selectedCanvasNodeId);
        if (selectedNode) {
          event.preventDefault();
          event.stopPropagation();
          openNodeRename(selectedNode);
          return;
        }
      }
      if (shortcutMatches(event, shortcuts.reloadStudio)) {
        event.preventDefault();
        event.stopPropagation();
        const hasUnsavedGraphs = tabs.some((graph) => graph.isDirty || !savedGraphs.some((saved) => saved.id === graph.id));
        const hasUnsavedEmbed = Boolean(embedStudio && (embedStudio.mode === 'new' || embedStudio.isDirty));
        if (hasUnsavedGraphs || hasUnsavedEmbed) setReloadConfirm(true);
        else window.location.reload();
        return;
      }
      if (shortcutMatches(event, shortcuts.toggleConsole)) {
        event.preventDefault();
        event.stopPropagation();
        setConsoleOpenRequest((request) => request + 1);
        return;
      }
      if (shortcutMatches(event, shortcuts.openSearch)) {
        event.preventDefault();
        setIsPaletteOpen(false);
        setIsCommandPaletteOpen(true);
        return;
      }
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || Boolean(target.closest('.arc-dropdown'))
      );
      if (command && !event.altKey && (key === '+' || key === '=' || key === 'add')) {
        event.preventDefault();
        adjustUiScale(10);
        return;
      }
      if (command && !event.altKey && (key === '-' || key === '_' || key === 'subtract')) {
        event.preventDefault();
        adjustUiScale(-10);
        return;
      }
      if (isEditing) {
        return;
      }
      if (shortcutMatches(event, shortcuts.addNode)) {
        event.preventDefault();
        openPaletteAt();
      } else if (localDesktopWorkspace && shortcutMatches(event, shortcuts.arrangeNodes)) {
        event.preventDefault();
        handleAutoLayout();
      } else if (shortcutMatches(event, shortcuts.toggleLibrary)) {
        event.preventDefault();
        const shouldOpen = !isLibraryOpen;
        setIsLibraryOpen(shouldOpen);
        if (shouldOpen) { setIsProjectsOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); }
      } else if (shortcutMatches(event, shortcuts.undo)) {
        event.preventDefault();
        handleUndo();
      } else if (shortcutMatches(event, shortcuts.redo)) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeNodes, activeTabId, botStatus, closeGraphDialog, desktopMode, discordTextStudioOpenForActiveGraph, embedStudio, embedStudioOpenForActiveGraph, handleAddBlankGraph, handleAddTab, handleAutoLayout, handleCloseTab, handleExportBot, handleSaveEmbedShortcut, handleSaveGraph, handleSaveTextStudio, handleRedo, handleStartBot, handleStopBot, handleUndo, isBotSidebarOpen, isLibraryOpen, isPluginStoreOpen, isProjectsOpen, isVariablesOpen, isLocked, localDesktopWorkspace, openNodeRename, openPaletteAt, rememberUserGraph, remoteWorkspaceBlocked, savedGraphs, selectedCanvasNodeCount, selectedCanvasNodeId, settings.shortcuts, shortcutPlatform, tabs]);

  const handleToggleLock = () => {
    setIsLocked((locked) => {
      const next = !locked;
      safeStorageSet('arc_ui_locked', String(next));
      return next;
    });
  };

  const handleUpdateSettings = (next) => {
    const { updateChannel: _legacyUpdateChannel, ...persistedSettings } = next;
    setSettings(persistedSettings);
    safeStorageSet('arc_editor_settings', JSON.stringify(persistedSettings));
  };

  const handleOpenStudioUpdate = useCallback((url) => {
    if (downloadedUpdateReady?.version) {
      setInstallUpdateConfirmOpen(true);
      return;
    }
    if (appUpdate?.native) {
      setUpdateInstallPromptOpen(true);
      return;
    }
    if (!/^https:\/\/github\.com\/relentiousdragon\/arc-studio\/releases\//.test(String(url || ''))) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (desktopMode && typeof invoke === 'function') invoke('open_external_url', { url }).catch(() => {});
    else window.open(url, '_blank', 'noopener,noreferrer');
  }, [appUpdate, desktopMode, downloadedUpdateReady?.version]);

  const handleInstallStudioUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || updateInstalling) return;
    setUpdateInstalling(true);
    setUpdateNotice(null);
    setUpdateInstallPromptOpen(false);
    const updateVersion = update.version;
    let unlistenProgress;
    const publishProgress = (message, progress = null) => arcEvents.emit('toast:notify', {
      id: 'arc-studio-update-progress',
      title: 'Updating ARC Studio',
      message,
      type: 'info',
      loading: progress === null,
      progress,
      persistent: true,
      dismissible: false
    });
    try {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function' || !Number.isInteger(update.rid)) throw new Error('The selected update is no longer available. Check for updates again.');
      unlistenProgress = await listenTauriEvent('arc-studio-update-download-progress', (event) => {
        const payload = event.payload || {};
        const progress = Number.isInteger(payload.percent) ? Math.max(0, Math.min(99, payload.percent)) : null;
        const downloaded = Number(payload.downloadedBytes) || 0;
        const total = Number(payload.totalBytes);
        const formatBytes = (value) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${Math.max(0, Math.round(value / 1024))} KB`;
        const message = progress === null
          ? `Downloading update · ${formatBytes(downloaded)}${Number.isFinite(total) && total > 0 ? ` of ${formatBytes(total)}` : ''}`
          : `Downloading update · ${progress}%`;
        publishProgress(message, progress);
      });
      publishProgress(`Downloading version ${updateVersion}…`);
      await invoke('install_channel_update', { rid: update.rid, channel: desktopReleaseChannel });
      updateRef.current = null;
      setAppUpdate(null);
      setDownloadedUpdateReady({ version: updateVersion });
      await update.close().catch(() => {});
      arcEvents.emit('toast:notify', {
        id: 'arc-studio-update-progress',
        title: 'ARC Studio update ready',
        message: `Version ${updateVersion} is downloaded and verified. Choose Install in the top bar when you’re ready to restart ARC Studio.`,
        type: 'success',
        progress: 100,
        persistent: true,
        dismissible: true
      });
    } catch (error) {
      const message = typeof error === 'string' ? error.trim() : typeof error?.message === 'string' ? error.message.trim() : '';
      arcEvents.emit('toast:notify', { id: 'arc-studio-update-progress', title: 'Update failed', message: message || 'ARC Studio could not download and verify the update.', type: 'error', duration: 10000, dismissible: true });
    } finally {
      unlistenProgress?.();
      setUpdateInstalling(false);
    }
  }, [desktopReleaseChannel, updateInstalling]);

  useEffect(() => {
    if (!desktopMode || desktopReleaseChannel !== 'stable' || settings.autoUpdateChecks === false || !networkOnline || updateInstalling || downloadedUpdateReady?.version || !appUpdate?.native || !appUpdate.version) return;
    if (stableAutoDownloadVersionRef.current === appUpdate.version) return;
    stableAutoDownloadVersionRef.current = appUpdate.version;
    void handleInstallStudioUpdate();
  }, [appUpdate?.native, appUpdate?.version, desktopMode, desktopReleaseChannel, downloadedUpdateReady?.version, handleInstallStudioUpdate, networkOnline, settings.autoUpdateChecks, updateInstalling]);

  const handleInstallStagedUpdate = useCallback(async () => {
    if (!downloadedUpdateReady?.version || updateInstalling) return;
    setUpdateInstalling(true);
    setInstallUpdateConfirmOpen(false);
    arcEvents.emit('toast:notify', {
      id: 'arc-studio-update-progress',
      title: 'Installing ARC Studio update',
      message: `Preparing version ${downloadedUpdateReady.version}…`,
      type: 'info',
      loading: true,
      persistent: true,
      dismissible: false
    });
    try {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') throw new Error('The desktop update installer is unavailable. Restart ARC Studio and check for updates again.');
      const installed = await invoke('install_staged_update', { channel: desktopReleaseChannel });
      if (installed !== true) {
        setDownloadedUpdateReady(null);
        arcEvents.emit('toast:notify', { id: 'arc-studio-update-progress', title: 'Update no longer available', message: 'Check for updates again to download the latest version.', type: 'error', duration: 10000, dismissible: true });
      }
    } catch (error) {
      const message = typeof error === 'string' ? error.trim() : typeof error?.message === 'string' ? error.message.trim() : '';
      if (message.startsWith('ARC_UPDATE_LOCATION_PERMISSION_REQUIRED:')) {
        setUpdatePermissionHelpOpen(true);
        arcEvents.emit('toast:notify', { id: 'arc-studio-update-progress', title: 'Update needs folder access', message: 'macOS did not allow ARC Studio to replace the app in its current location.', type: 'error', duration: 10000, dismissible: true });
        return;
      }
      const accessHelp = /permission denied|operation not permitted|access denied/i.test(message)
        ? ' Move ARC Studio.app out of Documents and the source repository, place it in ~/Applications or /Applications, then try again.'
        : '';
      arcEvents.emit('toast:notify', { id: 'arc-studio-update-progress', title: 'Update installation failed', message: `${message || 'ARC Studio could not install the staged update. Check the app location and try again.'}${accessHelp}`, type: 'error', duration: 15000, dismissible: true });
    } finally {
      setUpdateInstalling(false);
    }
  }, [desktopReleaseChannel, downloadedUpdateReady?.version, updateInstalling]);

  useEffect(() => {
    if (!autoInstallStagedUpdateOnLaunchRef.current || !downloadedUpdateReady?.version || updateInstalling) return;
    autoInstallStagedUpdateOnLaunchRef.current = false;
    void handleInstallStagedUpdate();
  }, [downloadedUpdateReady?.version, handleInstallStagedUpdate, updateInstalling]);

  const handleSidebarResize = (sidebarId, width) => {
    const next = { ...sidebarWidths, [sidebarId]: Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(width))) };
    setSidebarWidths(next);
    safeStorageSet('arc_sidebar_widths', JSON.stringify(next));
  };

  const handlePluginsChanged = async () => {
    const pluginsResponse = await fetch(apiUrl('/api/plugins/installed'), { headers: { 'x-arc-token': authToken } });
    if (!pluginsResponse.ok) throw new Error(`Could not refresh installed plugins. Workspace returned HTTP ${pluginsResponse.status}.`);
    const pluginsData = await pluginsResponse.json();
    const installed = Array.isArray(pluginsData.plugins) ? pluginsData.plugins : [];
    const registryResponse = await fetch(apiUrl('/api/nodes/registry'), {
      headers: { 'x-arc-token': authToken },
      cache: 'no-cache'
    });
    if (registryResponse.ok) {
      const registry = await registryResponse.json();
      const definitions = getNodeRegistryDefinitions(registry);
      if (definitions) {
        setWorkspaceNodeDefinitions(definitions, registry.categories);
        setFailedWorkspaceNodeTypes(new Set(Array.isArray(registry.failedNodeTypes) ? registry.failedNodeTypes : []));
        setSupportedWorkspaceNodeTypes(new Set(definitions.map((definition) => definition.type)));
        nodeRegistryRevisionRef.current = registry.registryRevision;
        registerPluginNodeDefinitions(installed);
      }
      else {
        setWorkspaceNodeDefinitions(null);
        setFailedWorkspaceNodeTypes(new Set());
        nodeRegistryRevisionRef.current = '';
        registerPluginNodeDefinitions(installed);
      }
    } else if (registryResponse.status === 404) {
      setWorkspaceNodeDefinitions(null);
      setFailedWorkspaceNodeTypes(new Set());
      nodeRegistryRevisionRef.current = '';
      registerPluginNodeDefinitions(installed);
    } else {
      throw new Error(`Could not refresh workspace node schemas after the plugin change. Workspace returned HTTP ${registryResponse.status}.`);
    }
    installedPluginsRef.current = installed;
    registerPluginNodeDefinitions(installed);
    setInstalledPlugins(installed);
    setPluginDefinitionsRevision((revision) => revision + 1);
    const response = await fetch(apiUrl('/api/graphs'), { headers: { 'x-arc-token': authToken } });
    const data = await response.json();
    if (response.ok) {
      const graphs = (Array.isArray(data.graphs) ? data.graphs : []).map(migrateFunctionGraphEntry);
      const graphById = new Map(graphs.map((graph) => [graph.id, graph]));
      setSavedGraphs(graphs);
      setTabs((previous) => previous.map((tab) => {
        if (!tab.pluginId) return tab;
        const updated = graphById.get(tab.id);
        return updated ? { ...updated, isDirty: false } : tab;
      }));
    }
  };

  if (!isReady) {
    return <main className="boot-screen" data-theme={theme} data-release-channel={currentUpdateChannel}><div className="boot-mark"><img src="/arc.png" alt="ARC" /></div></main>;
  }

  if (workspaceSwitchOpen || needsSetup || needsProjectOnboarding || !authToken || !currentUser) {
    return (
      <div className={`app-root ${macOSDesktop ? 'is-macos' : ''}`} data-theme={theme} data-release-channel={currentUpdateChannel} data-ui-scale={uiScale} data-font-scale={fontScale} data-compact-context={settings.compactContextMenus ? 'true' : undefined} data-reduce-motion={settings.reduceMotion ? 'true' : undefined} onContextMenu={(event) => { if (desktopMode) event.preventDefault(); }} style={{ '--arc-ui-scale': Number(uiScale) / 100, '--arc-font-scale': Number(fontScale) / 100 }}>
        <Suspense fallback={<LazyFeatureLoading label="Loading ARC Studio…" kind="page" isDesktop={desktopMode} />}><SplashScreen
          studioVersion={studioVersion}
          releaseChannel={currentUpdateChannel}
          needsSetup={needsSetup}
          localAccountUsername={desktopMode && workspaceMode === 'local' ? localAccountUsername : ''}
          needsProjectOnboarding={needsProjectOnboarding}
          projectStarters={projectStarters.map((starter) => ({ ...starter, Icon: PROJECT_STARTER_ICONS[starter.id] || PackageOpen }))}
          theme={theme}
          workspaceMode={workspaceMode}
          remoteWorkspaceUrl={remoteWorkspaceUrl}
          workspaceName={desktopMode ? workspaceMode === 'remote' ? remoteWorkspaceName : 'Local Workspace' : remoteWorkspaceName}
          localSessionAvailable={desktopMode && (workspaceSwitchOpen || workspaceMode === 'remote') && Boolean(localSessionRef.current?.token)}
          onBackToEditor={handleBackToLocalEditor}
          networkOnline={networkOnline}
          workspaceError={workspaceError}
          workspaceCompatibilityNotice={workspaceCompatibilityNotice}
          onSelectWorkspace={handleSelectWorkspace}
          onConnectWorkspace={handleConnectWorkspace}
          onRetryWorkspace={handleRetryWorkspace}
          onCreateFirstProject={handleCreateFirstProject}
          onLocalSetupRequired={() => {
            setNeedsSetup(true);
            setAuthToken('');
            setCurrentUser(null);
            safeStorageRemove('arc_token');
            if (desktopMode && workspaceMode === 'local') {
              removeLocalDesktopSessionToken();
              localSessionRef.current = null;
            }
          }}
          onToggleTheme={toggleTheme}
          canResetPrimaryAdminWithMasterKey={canResetPrimaryAdminWithMasterKey}
          onAuthComplete={async (...args) => { setWorkspaceSwitchOpen(false); return handleAuthComplete(...args); }} /></Suspense>
        <ToastContainer />
        <TooltipLayer />
        <SelectionContextMenu />
      </div>
    );
  }

  return (
    <div className={`app-root ${macOSDesktop ? 'is-macos' : ''}`} data-theme={theme} data-release-channel={currentUpdateChannel} data-ui-scale={uiScale} data-font-scale={fontScale} data-compact-context={settings.compactContextMenus ? 'true' : undefined} data-reduce-motion={settings.reduceMotion ? 'true' : undefined} onContextMenu={(event) => { if (desktopMode) event.preventDefault(); }} style={{ '--arc-ui-scale': Number(uiScale) / 100, '--arc-font-scale': Number(fontScale) / 100 }}>
      <div className="app-client-surface">
      <TopBar
        tabs={tabs}
        projectCollaborators={projectCollaboration.projectId === activeProjectId ? projectCollaboration.users : []}
        graphTabStatuses={graphTabStatuses}
        saveFeedbackGraphId={saveFeedback?.graphId}
        hideGraphSave={embedStudioOpenForActiveGraph || discordTextStudioOpenForActiveGraph || permissionStudioOpenForActiveGraph || slashCommandStudioOpenForActiveGraph || modalStudioOpenForActiveGraph}
        activeTabId={activeTabId}
        botStatus={botStatus}
        networkOnline={networkOnline}
        botProfile={botProfile}
        currentUser={currentUser}
        localWorkspace={localDesktopWorkspace}
        isLocked={isLocked || !canWriteGraphs}
        onToggleLock={canWriteGraphs ? handleToggleLock : undefined}
        onSelectTab={(graphId) => { setFollowCollaboratorRequest(null); setActiveTabId(graphId); rememberUserGraph(graphId); }}
        onFollowCollaborator={followCollaborator}
        onAddTab={handleAddTab}
        onAddBlankGraph={handleAddBlankGraph}
        onAddFunctionGraph={handleAddFunctionGraph}
        onNewEmbed={createEmbedAsset}
        graphTemplates={graphTemplates}
        desktopMode={desktopMode}
        shortcutPlatform={shortcutPlatform}
        workspaceLabel={workspaceLabel}
        uploadProgress={graphUploadProgress}
        onUseTemplate={(template) => handleAddTab(template)}
        onCloseTab={handleCloseTab}
        onRenameGraph={handleRenameGraph}
        onDuplicateGraph={handleDuplicateGraph}
        onSetDefault={handleSetDefaultGraph}
        defaultGraphId={defaultGraphId}
        onSaveGraph={handleSaveGraph}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyAvailability.canUndo}
        canRedo={historyAvailability.canRedo}
        onValidate={handleValidateGraph}
        validationStatus={validationStatus}
        validationErrors={graphValidation.errors.length}
        validationWarnings={graphValidation.warnings.length}
        onOpenSettings={() => setIsSettingsOpen(true)}
        serverUpdateAvailable={Boolean(serverUpdate)}
        onOpenBotSettings={() => setIsBotSettingsOpen(true)}
        onOpenUsers={() => setIsUserMgmtOpen(true)}
        onLogout={handleLogout}
        onSwitchWorkspace={handleSwitchWorkspace}
        appUpdate={appUpdate}
        downloadedUpdateReady={downloadedUpdateReady}
        updateInstalling={updateInstalling}
        onOpenStudioUpdate={handleOpenStudioUpdate}
        onStartBot={handleStartBot}
        onStopBot={handleStopBot}
        onEnsureGraphsSaved={ensureWorkspaceGraphsSaved}
      />

      <div className="editor-workspace">
        <aside className="workspace-rail" aria-label="Workspace tools">
          <button className={`rail-button rail-button-primary ${isProjectsOpen ? 'is-selected' : ''}`} onClick={() => { setProjectError(''); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); setIsProjectsOpen((open) => !open); }} title={`${projects.find((project) => project.id === activeProjectId)?.name || 'Projects'} · switch project`} aria-label="Projects"><Plus size={18} /></button>
          <div className="rail-divider" />
          <button className={`rail-button ${isBotSidebarOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsVariablesOpen(false); setIsBotSidebarOpen((open) => !open); }} title="App settings and profile" aria-label="App settings and profile"><Bot size={17} /></button>
          <button className={`rail-button ${isVariablesOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen((open) => !open); }} title="Graph variables" aria-label="Graph variables"><Database size={17} /></button>
          <button className={`rail-button ${isLibraryOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); setIsLibraryOpen((open) => !open); }} title="Graph library (Shift + L)" aria-label="Graph library"><FolderTree size={17} /></button>
          <button className={`rail-button ${isPluginStoreOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); setIsPluginStoreOpen((open) => !open); }} title="Plugin store" aria-label="Plugin store"><PackageOpen size={17} /></button>
          <button className="rail-button" onClick={() => setIsSettingsOpen(true)} title="Canvas settings" aria-label="Canvas settings"><SlidersHorizontal size={17} /></button>
          {localDesktopWorkspace && <button className="rail-button" onClick={handleAutoLayout} title="Arrange nodes" aria-label="Arrange nodes"><LayoutGrid size={17} /></button>}
          <button className="rail-button" onClick={handleExportGraph} disabled={!activeGraph} title={activeGraph ? 'Export graph' : 'Open a graph to export it'} aria-label="Export graph"><Braces size={17} /></button>
          <div className="rail-spacer" />
          {!desktopMode && currentUser?.role === 'admin' && <button className="rail-button" onClick={() => setIsUserMgmtOpen(true)} title="Team access" aria-label="Team access"><Users size={17} /></button>}
          <button className="rail-button" onClick={() => setIsShortcutsOpen(true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts"><CircleHelp size={17} /></button>
        </aside>

        <main
          className="canvas-workspace"
          style={{
            '--arc-active-sidebar-width': `${
              isLibraryOpen
                ? (sidebarWidths.library || DEFAULT_SIDEBAR_WIDTHS.library)
                : isProjectsOpen
                  ? (sidebarWidths.projects || DEFAULT_SIDEBAR_WIDTHS.projects)
                  : isVariablesOpen
                    ? (sidebarWidths.variables || DEFAULT_SIDEBAR_WIDTHS.variables)
                    : isBotSidebarOpen
                      ? (sidebarWidths.bot || DEFAULT_SIDEBAR_WIDTHS.bot)
                      : isPluginStoreOpen
                        ? (sidebarWidths.plugins || DEFAULT_SIDEBAR_WIDTHS.plugins)
                        : 0
            }px`
          }}
          aria-label="Graph editor"
        >
          <Suspense fallback={<LazyFeatureLoading label="Opening editor…" kind="editor" isDesktop={desktopMode} />}>
          {embedStudioOpenForActiveGraph && <EmbedStudioView
            key={`${embedStudio.graphId}:${embedStudio.nodeId || embedStudio.id || 'new'}`}
            name={embedStudio.name}
            content={embedStudio.content || ''}
            blocks={embedStudio.blocks}
            wiredFields={embedStudio.wiredFields || {}}
            hasParentNode={Boolean(embedStudio.nodeId)}
            components={embedStudio.components || []}
            componentsV2Layout={embedStudio.componentsV2Layout || []}
            componentsV2Enabled={Boolean(embedStudio.componentsV2Enabled)}
            canEnableComponentsV2={Boolean(embedStudio.canEnableComponentsV2)}
            componentsV2DisabledReason={embedStudio.componentsV2DisabledReason || ''}
            isComponentsBuilderNode={Boolean(embedStudio.isComponentsBuilderNode)}
            componentsOnly={embedStudio.mode === 'components-node'}
            assetNameEditable={embedStudio.mode === 'asset' && embedStudio.kind === 'components-v2'}
            initialTab={embedStudio.route?.tab}
            isEmbedWired={Boolean(embedStudio.isEmbedWired)}
            isComponentsWired={Boolean(embedStudio.isComponentsWired)}
            isContentWired={Boolean(embedStudio.isContentWired)}
            contentSourceLabel={embedStudio.contentSourceLabel}
            embedSourceLabel={embedStudio.embedSourceLabel}
            componentsSourceLabel={embedStudio.componentsSourceLabel}
            appEmojis={appEmojis}
            graphVariables={availableVariables}
            templateValuePaths={embedTemplateValuePaths}
            templatePreviewValues={getTemplatePreviewInputs({ nodes: activeNodes, connections: activeConnections }, activeNodes.find((item) => item.id === embedStudio.nodeId), availableVariables)}
            templateSuggestions={embedTemplateSuggestions}
            botProfile={botProfile}
            botStatus={botStatus}
            theme={theme}
            collaborators={studioCollaborators}
            onNameChange={(name) => updateEmbedStudioDraft({ name })}
            onBlocksChange={(blocksOrUpdater) => updateEmbedStudioDraft(typeof blocksOrUpdater === 'function' ? (current) => ({ blocks: blocksOrUpdater(current.blocks || []) }) : { blocks: blocksOrUpdater })}
            attachments={embedStudio.attachments || []}
            onAttachmentsChange={(attachments) => updateEmbedStudioDraft({ attachments })}
            onOpenTextStudio={(label, value, maxLength, applyValue, parentBlockContext) => openDiscordTextStudio(null, null, label, value, maxLength, applyValue, embedStudio.collabId, parentBlockContext)}
            onActiveTabChange={(tab) => setEmbedStudio((current) => current ? { ...current, route: { ...current.route, tab } } : current)}
            onContentChange={(content) => updateEmbedStudioDraft({ content })}
            onComponentsChange={(componentsOrUpdater) => updateEmbedStudioDraft(typeof componentsOrUpdater === 'function' ? (current) => ({ components: componentsOrUpdater(current.components || []) }) : { components: componentsOrUpdater })}
            onComponentsV2LayoutChange={(layoutOrUpdater) => updateEmbedStudioDraft(typeof layoutOrUpdater === 'function' ? (current) => ({ componentsV2Layout: layoutOrUpdater(current.componentsV2Layout || []) }) : { componentsV2Layout: layoutOrUpdater })}
            onEnableComponentsV2={() => updateEmbedStudioDraft({ componentsV2Enabled: true })}
            onSave={handleSaveEmbedStudio}
            onSaveAs={handleSaveEmbedAsAsset}
            onSaveComponentsV2As={handleSaveComponentsV2AsAsset}
            onClose={() => setEmbedStudio(null)}
            saveLabel={['node', 'components-node'].includes(embedStudio.mode) ? 'Apply to node' : embedStudio.kind === 'components-v2' ? 'Save Components' : 'Save embed'}
            saveAsLabel={embedStudio.componentsV2Enabled ? 'Save Components to Library' : 'Save to library'}
            showSave={embedStudio.mode !== 'new'}
          />}

          {discordTextStudioOpenForActiveGraph && <TextStudioView
            key={discordTextStudio.collabId}
            label={discordTextStudio.label}
            value={discordTextStudio.value}
            readOnly={Boolean(discordTextStudio.readOnly)}
            sharedDraft={discordTextStudio.sharedDraft}
            maxLength={discordTextStudio.maxLength}
            appEmojis={appEmojis}
            graphVariables={availableVariables}
            templatePreviewValues={getTemplatePreviewInputs({ nodes: activeNodes, connections: activeConnections }, activeNodes.find((item) => item.id === (discordTextStudio.nodeId || embedStudio?.nodeId)), availableVariables)}
            templateValuePaths={discordTextStudio.templateValuePaths || []}
            templateSuggestions={discordTextStudio.templateSuggestions || []}
            collaborators={studioCollaborators}
            remoteCursors={textStudioCursors}
            onDraftChange={(draft, caret) => {
              const collabId = discordTextStudio.collabId;
              const previous = textCollaborationRef.current.get(collabId) || { baseText: String(discordTextStudio.value || ''), localText: '', caret: 0 };
              textCollaborationRef.current.set(collabId, { ...previous, localText: String(draft), caret: Number(caret) || 0 });
              setDiscordTextStudio((current) => current?.collabId === collabId ? { ...current, localDraft: String(draft) } : current);
              sendCollaborationAction({ kind: 'studio-draft', studioId: collabId, studioType: 'text', draft: { text: draft, caret } });
            }}
            onCursorChange={(caret) => sendCollaborationAction({ kind: 'studio-cursor', studioId: discordTextStudio.collabId, caret })}
            onApply={applyDiscordTextStudio}
            onClose={() => setDiscordTextStudio(null)}
          />}

          {permissionStudioOpenForActiveGraph && <PermissionStudioView
            key={`${permissionStudio.graphId}:${permissionStudio.nodeId}`}
            mode={permissionStudio.mode}
            nodeName={permissionStudio.nodeName}
            data={permissionStudio.data}
            connectedTargetIds={permissionStudio.connectedTargetIds}
            permissionsConnected={permissionStudio.permissionsConnected}
            variables={availableVariables}
            onApply={applyPermissionStudio}
            onClose={() => setPermissionStudio(null)}
          />}

          {slashCommandStudioOpenForActiveGraph && <SlashCommandStudioView
            key={slashCommandStudio.collabId}
            commandName={slashCommandStudio.commandName}
            options={slashCommandStudio.options}
            collaborators={studioCollaborators}
            canUndo={historyAvailability.canUndo}
            canRedo={historyAvailability.canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onDraftChange={updateSlashCommandStudioDraft}
            onApply={applySlashCommandStudio}
            onClose={() => setSlashCommandStudio(null)}
          />}

          {modalStudioOpenForActiveGraph && <PopupModalStudioView
            key={`${modalStudio.projectId}:${modalStudio.graphId}:${modalStudio.nodeId}`}
            graphName={activeGraph?.name || 'Untitled graph'}
            nodeName={modalStudio.nodeName}
            theme={theme}
            modal={modalStudio.modal}
            onDraftChange={updateModalStudioDraft}
            onApply={applyModalStudio}
            onClose={() => setModalStudio(null)}
          />}
          </Suspense>

          {!embedStudioOpenForActiveGraph && !discordTextStudioOpenForActiveGraph && !permissionStudioOpenForActiveGraph && !slashCommandStudioOpenForActiveGraph && !modalStudioOpenForActiveGraph && <>
          <div className="canvas-connection-guard" inert={remoteWorkspaceBlocked}>
          <NodeCanvas
            graphId={activeTabId}
            projectId={activeProjectId}
            focusRequest={nodeFocusRequest}
            followRequest={followCollaboratorRequest}
            onFollowComplete={completeFollowCollaborator}
            nodes={activeNodes}
            connections={activeConnections}
            authToken={authToken}
            graphName={activeGraph?.name || 'Untitled graph'}
            onSelectedNodeChange={handleCanvasNodeSelect}
            onSelectedNodeCountChange={setSelectedCanvasNodeCount}
            activePulseNodeIds={activePulseGraphId === activeTabId ? activePulseNodeIds : []}
            debugStep={activeDebugStep}
            onDebugAction={(action) => { if (action === 'continue') { setActiveDebugStep(null); setActivePulseNodeIds([]); } arcEvents.emit('simulation:debug-action-request', action); }}
            graphVariables={availableVariables}
            functionGraphs={functionGraphs}
            callableGraphs={callableGraphs}
            appEmojis={appEmojis}
            nodeDefinitions={availableNodeDefinitions}
            nodeDefinitionsReady={supportedWorkspaceNodeTypes !== null || failedWorkspaceNodeTypes.size > 0}
            settings={settings}
            isLocked={isLocked || !canWriteGraphs}
            canvasLocked={isLocked}
            canWriteGraphs={canWriteGraphs}
            desktopMode={desktopMode}
            shortcutPlatform={shortcutPlatform}
            onNodesChange={handleNodesChange}
            tagGroups={activeGraph?.tagGroups || []}
            notes={activeGraph?.notes || []}
            arrows={activeGraph?.arrows || []}
            transientArrows={transientCanvasArrows.filter((arrow) => arrow.projectId === activeProjectId && arrow.graphId === activeTabId)}
            currentUser={currentUser}
            projectOwnerId={projects.find((project) => project.id === activeProjectId)?.ownerId || ''}
            onNotesChange={handleGraphNotesChange}
            onArrowsChange={handleGraphArrowsChange}
            onCanvasArrowAction={sendCanvasArrowAction}
            noteEditLocks={noteEditLockState.roomKey === `${activeProjectId}:${activeTabId}` ? noteEditLockState.locks : {}}
            collaborationOnline={Boolean(authToken)}
            collaborationReady={collaborationSocketStatus === 'connected' && liveGraphReadyRef.current.has(`${activeProjectId}:${activeTabId}`)}
            collaborationMotionSupported={transientCanvasMotionSupported}
            collaborationClientId={collaborationClientIdRef.current}
            onRequestNoteEditLock={requestNoteEditLock}
            onReleaseNoteEditLock={releaseNoteEditLock}
            onTagGroupsChange={handleTagGroupsChange}
            onRequestCreateTagGroup={(nodeIds, noteIds) => openTagGroupDialog(nodeIds, null, noteIds)}
            onRequestEditTagGroup={(group) => openTagGroupDialog(null, group)}
            onRenameNode={openNodeRename}
            onConnectionsChange={handleConnectionsChange}
            onOpenPalette={openPaletteAt}
            onViewportCenterChange={(position) => { viewportCenterRef.current = position; }}
            onOpenLibrary={() => { setIsProjectsOpen(false); setIsPluginStoreOpen(false); setIsLibraryOpen(true); }}
            onOpenVariables={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(true); }}
            onHistoryGroupStart={handleHistoryGroupStart}
            onHistoryGroupEnd={handleHistoryGroupEnd}
            onNodeDrop={handleDropNode}
            onSaveNodePrefab={handleRequestSaveNodePrefab}
            onOpenEmbedStudio={openEmbedStudioForNode}
            onOpenTextStudio={openDiscordTextStudio}
            onOpenPermissionStudio={openPermissionStudio}
            onOpenSlashCommandStudio={openSlashCommandStudio}
            onOpenModalStudio={openModalStudioForNode}
            onOpenFunctionGraph={handleOpenGraph}
            remoteActions={remoteCollaborationActions}
            onCollaborationAction={sendCollaborationAction}
            graphChatEnabled={!localDesktopWorkspace && Boolean(activeGraph) && !activeGraphIsLocalRecovery}
            graphChatBubbles={graphChatBubbles}
            onSendGraphChat={sendGraphChatMessage}
            onMoveGraphChatBubble={moveGraphChatBubble}
          />
          </div>
          <div className={`canvas-context-label ${!activeGraph ? 'is-no-graph' : graphValidation.errors.length ? 'has-validation-errors' : graphValidation.warnings.length ? 'has-validation-warnings' : 'is-validation-ready'}`}>
            {activeGraph ? <><span className="context-dot" />
              {activeNodes.length} nodes <span className="context-separator">·</span> {activeConnections.length} connections
              <span className="context-separator">·</span> {graphValidation.errors.length || graphValidation.warnings.length
                ? <button type="button" className="canvas-context-validation" onClick={handleValidateGraph} aria-label={`Open graph review with ${graphValidation.errors.length ? `${graphValidation.errors.length} issues` : `${graphValidation.warnings.length} warnings`}`}>{graphValidation.errors.length ? `${graphValidation.errors.length} issues` : 'Review'}</button>
                : 'Ready'}</>
              : 'Open a graph to run checks.'}
            {(!desktopMode || !localDesktopWorkspace) && collaborationSocketStatus !== 'connected' && <span className={`collaboration-connection is-reconnecting ${collaborationSocketStatus === 'blocked' ? 'is-blocked' : ''}`} role="status" aria-live="polite">{collaborationSocketStatus === 'incompatible' ? `Update ARC Studio to ${minimumRequiredClientVersion} or newer to connect.` : collaborationSocketStatus === 'blocked' ? 'This client is not allowed by the workspace owner.' : collaborationSocketStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</span>}
            {activeGraph && (!desktopMode || !localDesktopWorkspace) && collaborationSocketStatus === 'connected' && collaborationConnectionFlaky && <span className="collaboration-connection is-flaky" role="status" aria-live="polite">Flaky connection</span>}
            {activeGraph && collaborators.length > 0 && <span className="canvas-collaborators" title={collaborators.slice(0, 8).map((person) => person.username).concat(collaborators.length > 8 ? [`…and ${collaborators.length - 8} more`] : []).join('\n')}><span className="context-separator">·</span> {collaborators.slice(0, 2).map((person) => person.username).join(', ')}{collaborators.length > 2 ? ` …and ${collaborators.length - 2} more` : ''}</span>}
          </div>
          {isLocked && <div className="canvas-lock-state"><LockKeyhole size={13} /> Locked</div>}
          </>}

          {isLibraryOpen && <Suspense fallback={<LazyFeatureLoading label="Opening Library…" kind="sidebar" isDesktop={desktopMode} width={sidebarWidths.library} />}><GraphLibraryPanel definitions={availableNodeDefinitions} newNodesUserKey={newNodesUserKey} graphActivity={projectCollaboration.projectId === activeProjectId ? projectCollaboration.graphActivity || [] : []} sidebarWidth={sidebarWidths.library} onSidebarResize={(width) => handleSidebarResize('library', width)} activeSection={librarySection} onActiveSectionChange={setLibrarySection} usageScope={activeProjectId} desktopMode={desktopMode} canImportGraph={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} onImportGraph={handleImportGraph} graphs={savedGraphs} templates={graphTemplates} snapshots={graphSnapshots} nodePrefabs={nodePrefabs} embedAssets={embedAssets} graphVariables={availableVariables} defaultGraphId={defaultGraphId} activeGraph={activeGraph} openGraphIds={tabs.map((tab) => tab.id)} activeTabId={activeTabId} onClose={() => setIsLibraryOpen(false)} onOpenGraph={handleOpenGraph} onUseTemplate={(template) => handleAddTab(template)} onCreateFunction={handleAddFunctionGraph} onDeleteGraph={handleDeleteSavedGraph} onDeleteGraphs={handleDeleteSavedGraphs} onDuplicateGraph={handleDuplicateGraph} onRenameGraph={handleRenameGraph} onSaveTemplate={handleSaveGraphTemplate} onDeleteTemplate={handleDeleteGraphTemplate} onSetDefault={handleSetDefaultGraph} onExportBot={handleExportBot} exportInProgress={exportInProgress} onAddNode={handlePlaceNode} onAddPrefab={(prefab) => handleDropNode({ type: 'prefab', prefabId: prefab.id })} onDeletePrefab={handleDeleteNodePrefab} onCreateEmbed={createEmbedAsset} onCreateComponentsV2={createComponentsV2Asset} onOpenEmbed={openEmbedAsset} onDeleteEmbed={handleDeleteEmbedAsset} onManageVariables={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(true); }} onCreateSnapshot={async (graph, name) => {
            await ensureWorkspaceGraphsSaved();
            const response = await fetch(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}/snapshots`), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ graph, name }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not create graph snapshot.');
            setGraphSnapshots(data.snapshots || []);
            arcEvents.emit('toast:notify', { title: 'Snapshot saved', message: data.snapshot.name, type: 'success' });
          }} onDeleteSnapshot={async (snapshot) => {
            const response = await fetch(apiUrl(`/api/graphs/snapshots/${encodeURIComponent(snapshot.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not delete snapshot.');
            setGraphSnapshots(data.snapshots || []);
          }} onRestoreSnapshot={(snapshot) => {
            const restored = { ...structuredClone(snapshot.graph), id: activeGraph.id, name: activeGraph.name, isDirty: true };
            recordHistory(activeGraph.id);
            setActiveNodes(restored.nodes || []);
            setActiveConnections(restored.connections || []);
            setTabs((previous) => previous.map((tab) => tab.id === activeGraph.id ? restored : tab));
            arcEvents.emit('toast:notify', { title: 'Snapshot restored', message: `${snapshot.name} · save to keep these changes`, type: 'success' });
          }} /></Suspense>}
          {isProjectsOpen && <aside className="project-sidebar" aria-label="Projects" style={{ '--arc-sidebar-width': `${sidebarWidths.projects}px` }}>
            <SidebarResizeHandle width={sidebarWidths.projects} defaultWidth={DEFAULT_SIDEBAR_WIDTHS.projects} onResize={(width) => handleSidebarResize('projects', width)} />
            <header className="graph-library-header">
              <span><FolderTree size={14} />Projects <small>{projects.length}</small></span>
              <button className="icon-button compact" type="button" aria-label="Close projects" onClick={() => { if (!projectBusy) setIsProjectsOpen(false); }} disabled={projectBusy}><X size={14} /></button>
            </header>
            <p className="project-sidebar-description">Switch between bot projects or create a new one. {!localDesktopWorkspace && (maxProjects === null ? 'No project limit.' : `${projects.length} of ${maxProjects} projects.`)}</p>
            {projects.length > 10 && <label className="project-sidebar-search"><Search size={14} /><input type="search" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" aria-label="Search projects" /></label>}
            <div className={`project-switcher-list ${projects.length ? '' : 'is-empty'}`}>
              {filteredProjects.map((project) => <div key={project.id} className={`project-switcher-row ${project.id === activeProjectId ? 'is-active' : ''}`} onContextMenu={(event) => openProjectMenu(event, project)}>
                <button
                  type="button"
                  className="project-switcher-item"
                  title={projectUsers[project.id]?.length ? `Online: ${projectUsers[project.id].map((user) => user.username).join(', ')}` : projectLastSeen[project.id]?.username ? `Last here: ${projectLastSeen[project.id].username} · ${formatCompactLastSeen(projectLastSeen[project.id].updatedAt)}` : 'No recent activity'}
                  onClick={() => handleActivateProject(project.id)}
                  disabled={projectBusy || project.id === activeProjectId}
                  aria-current={project.id === activeProjectId ? 'page' : undefined}
                >
                  <span className="project-switcher-copy"><strong>{project.name}</strong>{projectUsers[project.id]?.length > 0 && <small className="project-online-users">Online · {projectUsers[project.id].map((user) => user.username).join(', ')}</small>}{projectLastSeen[project.id]?.username && <small className="project-last-seen">Last here · {projectLastSeen[project.id].username} · {formatCompactLastSeen(projectLastSeen[project.id].updatedAt)}</small>}{!projectUsers[project.id]?.length && !projectLastSeen[project.id]?.username && <small className="project-last-seen">No recent activity</small>}</span>
                  {project.id === activeProjectId && <span className="project-active-mark">Current</span>}
                </button>
                <button type="button" className="project-more-button" aria-label={`More actions for ${project.name}`} title="Project options" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  openProjectMenu(event, project, { x: rect.right, y: rect.bottom });
                }}><MoreHorizontal size={15} /></button>
              </div>)}
              {!projects.length && <div className="project-switcher-empty">
                <FolderTree size={19} aria-hidden="true" />
                <strong>No projects yet</strong>
                <span>Create a project below to start building a bot.</span>
              </div>}
              {projects.length > 0 && !filteredProjects.length && <div className="project-switcher-empty">
                <Search size={19} aria-hidden="true" />
                <strong>No projects found</strong>
                <span>Try a different search.</span>
              </div>}
            </div>
            <form className="project-create-form" onSubmit={handleCreateProject}>
              <TextInput key={projectNameShakeKey} id="new-project-name" label="New project" placeholder="e.g. Moderation bot" value={newProjectName} maxLength={64} error={projectNameInvalid ? 'Enter a project name.' : undefined} wrapperClassName={projectNameInvalid ? 'project-name-invalid-shake' : ''} onChange={(event) => { setNewProjectName(event.target.value); setProjectNameInvalid(false); setProjectError(''); }} />
              {projectError && <p className="field-error">{projectError}</p>}
              <Button type="submit" icon={Plus} onContextMenu={(event) => openProjectMenu(event, null)} disabled={projectBusy || maxProjects !== null && projects.length >= maxProjects} loading={projectBusy}>Create project</Button>
              <button className="project-import-button" type="button" disabled={projectBusy || maxProjects !== null && projects.length >= maxProjects} onClick={() => { document.getElementById('project-import-file')?.click(); }}><FileUp size={14} />Import project file</button>
              <input id="project-import-file" type="file" accept=".arcproject,.arcproject.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) { setProjectImportFile(file); setProjectImportTrusted(false); setProjectImportError(''); setProjectImportSharingWarning(null); setProjectImportSharingApproved(false); setProjectImportCompatibility(null); setProjectImportOldVersionApproved(false); } event.target.value = ''; }} />
              {!localDesktopWorkspace && currentUser?.role === 'admin' && <label className="project-limit-control"><span>Project limit</span><div><input aria-label="Maximum projects" type="number" min="1" step="1" value={maxProjects ?? ''} placeholder="Unlimited" onChange={(event) => { const next = event.target.value; if (next === '') setMaxProjects(null); else if (/^\d+$/.test(next)) setMaxProjects(Number(next)); }} onBlur={(event) => handleSetProjectLimit(event.target.value === '' ? 'unlimited' : Number(event.target.value))} /><button type="button" onClick={() => handleSetProjectLimit('unlimited')}>Unlimited</button></div></label>}
            </form>
          </aside>}
          {projectMenu && <div className="project-context-menu" role="menu" style={{ left: projectMenu.x, top: projectMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
            {projectMenu.kind === 'create' ? <button type="button" role="menuitem" className="project-context-export" disabled={projectBusy || maxProjects !== null && projects.length >= maxProjects} onClick={() => { setProjectMenu(null); setNewProjectTemplate('ticket'); setNewProjectName('Ticket Bot'); setProjectNameManuallyEdited(false); setProjectError(''); setProjectTemplateDialog(true); }}><FileCode2 size={14} />Create from template</button> : <>
            <button type="button" role="menuitem" className="project-context-export" disabled={projectBusy} onClick={() => { const project = projectMenu.project; setProjectMenu(null); handleExportProject(project); }}><Download size={14} />Export project</button>
            <button type="button" role="menuitem" className="project-context-export" disabled={exportInProgress} onClick={() => {
              const projectId = projectMenu.project.id;
              setProjectMenu(null);
              handleExportBot(projectId);
            }}><Download size={14} />Export bot</button>
            {desktopMode && localDesktopWorkspace && <button type="button" role="menuitem" className="project-context-export" disabled={projectBusy} onClick={() => { const project = projectMenu.project; setProjectMenu(null); void handleOpenProjectInNewWindow(project); }}><AppWindow size={14} />Open in new window</button>}
            <button type="button" role="menuitem" className="project-context-delete" disabled={projects.length <= 1 || projectBusy} onClick={() => {
              setProjectDelete(projectMenu.project);
              setProjectDeletePromptError('');
              setProjectDeleteError('');
              setProjectDeleteFieldShake(false);
              setProjectDeleteName('');
              setProjectDeleteError('');
              setProjectMenu(null);
            }}><Trash2 size={14} />Delete project</button>
            </>}
          </div>}
          <LazyMountedFeature Component={BotSettingsModal} isOpen={isBotSidebarOpen} loadingLabel="Opening app settings…" loadingKind="sidebar" isDesktop={desktopMode} presentation="sidebar" sidebarWidth={sidebarWidths.bot} onSidebarResize={(width) => handleSidebarResize('bot', width)} onClose={() => setIsBotSidebarOpen(false)} onViewCommands={() => setCommandBrowserRequest((request) => request + 1)} authToken={authToken} profile={botProfile} onProfileChange={setBotProfile} />
          <LazyMountedFeature Component={PluginStoreModal} isOpen={isPluginStoreOpen} loadingLabel="Opening Plugin Store…" loadingKind="sidebar" isDesktop={desktopMode} sidebarWidth={sidebarWidths.plugins} onSidebarResize={(width) => handleSidebarResize('plugins', width)} onClose={() => setIsPluginStoreOpen(false)} authToken={authToken} canInstall={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} canManageSource={currentUser?.permissions?.includes('*')} onInstalled={handlePluginsChanged} />
          <LazyMountedFeature Component={GraphVariablesModal} isOpen={isVariablesOpen} loadingLabel="Opening variables…" loadingKind="sidebar" isDesktop={desktopMode} presentation="sidebar" sidebarWidth={sidebarWidths.variables} activeScope={variableScope} onScopeChange={setVariableScope} onSidebarResize={(width) => handleSidebarResize('variables', width)} onClose={() => setIsVariablesOpen(false)} variables={graphVariables} projectVariables={projectVariables} canEdit={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} canEditGraph={Boolean(activeGraph && (currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write')))} canEditProject={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} onChange={handleVariablesChange} onProjectChange={handleProjectVariablesChange} onOpenTextEditor={openVariableTextEditor} onRestoreSystemVariable={handleRestoreSystemVariable} isSaving={savingProjectVariables || savingGraphIds.includes(activeTabId)} />
        </main>
      </div>

      <ControlDock
        logs={logs}
        botStatus={botStatus}
        discordAuthWarning={discordAuthWarning}
        networkOnline={networkOnline}
        botMetrics={botMetrics}
        botProfile={botProfile}
        cachedAppEmojis={appEmojis}
        onEmojisChange={handleAppEmojisChange}
        activeTabId={activeTabId}
        activeProjectId={activeProjectId}
        graphs={[...graphLookup.values()]}
        emojiCacheScope={`${workspaceMode}:${activeProjectId}:${workspaceRevision}`}
        graphLookup={graphLookup}
        graphValidationReports={[...graphLookup.values()].map((graph) => ({ graph, report: validateGraph(graph, graphLookup, botProfile?.intentSummary, projectVariables) }))}
        graphNodes={activeNodes}
        nodeDefinitions={availableNodeDefinitions}
        authToken={authToken}
        isLocked={isLocked}
        canControlBot={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('bot:control'))}
        consoleOpenRequest={consoleOpenRequest}
        gatewayStartedRequest={gatewayStartedRequest}
        commandBrowserRequest={commandBrowserRequest}
        onClearLogs={handleClearLogs}
        onStartBot={handleStartBot}
        onStopBot={handleStopBot}
        onIntentSummaryChange={handleIntentSummaryChange}
        onOpenGraph={handleOpenGraph}
        onTraceLog={traceGraphNode}
        onTraceIssue={traceGraphNode}
      />

      <LazyMountedFeature Component={NodePalette} isOpen={isPaletteOpen} loadingLabel="Opening node palette…" isDesktop={desktopMode} newNodesUserKey={newNodesUserKey} onClose={() => { setIsPaletteOpen(false); setPaletteNodePosition(null); }} onSelectNode={handlePlaceNode} pluginDefinitionsRevision={pluginDefinitionsRevision} definitions={availableNodeDefinitions} />
      <LazyMountedFeature Component={CommandPalette} isOpen={isCommandPaletteOpen} loadingLabel="Opening search…" isDesktop={desktopMode}
        graphs={[...graphLookup.values()]}
        definitions={availableNodeDefinitions}
        plugins={installedPlugins}
        onClose={() => setIsCommandPaletteOpen(false)}
        onAddNode={handlePlaceNode}
        onOpenGraph={handleOpenGraph}
        onOpenPlugin={() => { setIsCommandPaletteOpen(false); setIsLibraryOpen(false); setIsProjectsOpen(false); setIsPluginStoreOpen(true); }}
        onGoToNode={traceGraphNode}
      />
      <EmojiPickerOverlay appEmojis={appEmojis} shortcut={(desktopMode ? settings.shortcuts?.emojiPicker : null) || DEFAULT_SHORTCUTS.emojiPicker} desktopMode={desktopMode} />
      <LazyMountedFeature Component={EditorSettingsModal} isOpen={isSettingsOpen} loadingLabel="Opening settings…" isDesktop={desktopMode}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        appUpdate={appUpdate}
        serverUpdate={serverUpdate}
        downloadedUpdateReady={downloadedUpdateReady}
        updateInstalling={updateInstalling}
        releaseChannel={currentUpdateChannel}
        networkOnline={networkOnline}
        onOpenStudioUpdate={handleOpenStudioUpdate}
        onAutoLayout={handleAutoLayout}
        onExportGraph={handleExportGraph}
        onResetLocalData={handleResetLocalData}
        desktopMode={desktopMode}
        localWorkspace={workspaceMode === 'local'}
        externalWorkspace={!desktopMode || workspaceMode === 'remote'}
        canManageClientAccess={currentUser?.isPrimaryAdmin === true}
        canResetLocalWorkspace={desktopMode && workspaceMode === 'local' && currentUser?.isPrimaryAdmin === true}
        platform={shortcutPlatform}
        themeChoice={hasThemeChoice ? theme : 'system'}
        onThemeChange={handleThemeChange}
        authToken={authToken}
        activeProjectId={activeProjectId}
        canManageLogRetention={currentUser?.permissions?.includes('*')}
        canManageActivityWebhook={currentUser?.isPrimaryAdmin === true}
        idleDisconnectMinutes={projects.find((project) => project.id === activeProjectId)?.idleDisconnectMinutes ?? 15}
        canManageIdleDisconnect={Boolean(currentUser?.permissions?.includes('*') || projects.find((project) => project.id === activeProjectId)?.ownerId === currentUser?.id)}
        onSetIdleDisconnectMinutes={handleSetIdleDisconnectMinutes}
      />
      <Modal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} title="Keyboard shortcuts" subtitle="ARC Studio editor" icon={CircleHelp}>
        <div className="keyboard-shortcut-list">
          {[
            ['New graph', formatShortcut((desktopMode ? settings.shortcuts?.newGraph : null) || DEFAULT_SHORTCUTS.newGraph, shortcutPlatform)],
            ['New blank graph', formatShortcut((desktopMode ? settings.shortcuts?.newBlankGraph : null) || DEFAULT_SHORTCUTS.newBlankGraph, shortcutPlatform)],
            ['Next / previous graph tab', `${formatShortcut((desktopMode ? settings.shortcuts?.switchTabNext : null) || DEFAULT_SHORTCUTS.switchTabNext, shortcutPlatform)} / ${formatShortcut((desktopMode ? settings.shortcuts?.switchTabPrevious : null) || DEFAULT_SHORTCUTS.switchTabPrevious, shortcutPlatform)}`],
            ['Close active graph tab', formatShortcut((desktopMode ? settings.shortcuts?.closeTab : null) || DEFAULT_SHORTCUTS.closeTab, shortcutPlatform)],
            ['Add node', formatShortcut((desktopMode ? settings.shortcuts?.addNode : null) || DEFAULT_SHORTCUTS.addNode, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Add note', formatShortcut((desktopMode ? settings.shortcuts?.addNote : null) || DEFAULT_SHORTCUTS.addNote, shortcutPlatform)],
            ['Find in sidebar or canvas', shortcutModifier === '⌘' ? '⌘F' : 'Ctrl+F'],
            ['Next / previous find result', shortcutModifier === '⌘' ? '⌘G / ⌘⇧G' : 'Ctrl+G / Ctrl+Shift+G'],
            ['Draw arrow', `${shortcutPlatform === 'macos' ? '⌥ Option' : 'Alt'} + Shift + drag`],
            ...(localDesktopWorkspace ? [['Arrange nodes', formatShortcut(settings.shortcuts?.arrangeNodes || DEFAULT_SHORTCUTS.arrangeNodes, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')]] : []),
            ['Move nodes between colored sections', `${shortcutPlatform === 'macos' ? '⌥ Option' : 'Alt'} + drag`],
            ['Toggle Library', formatShortcut((desktopMode ? settings.shortcuts?.toggleLibrary : null) || DEFAULT_SHORTCUTS.toggleLibrary, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Open node search', formatShortcut((desktopMode ? settings.shortcuts?.openSearch : null) || DEFAULT_SHORTCUTS.openSearch, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Open emoji picker in a text field', formatShortcut((desktopMode ? settings.shortcuts?.emojiPicker : null) || DEFAULT_SHORTCUTS.emojiPicker, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Export bot', formatShortcut((desktopMode ? settings.shortcuts?.exportBot : null) || DEFAULT_SHORTCUTS.exportBot, shortcutPlatform)],
            ['Toggle server console', formatShortcut((desktopMode ? settings.shortcuts?.toggleConsole : null) || DEFAULT_SHORTCUTS.toggleConsole, shortcutPlatform)],
            ['Connect / disconnect gateway', formatShortcut((desktopMode ? settings.shortcuts?.connectGateway : null) || DEFAULT_SHORTCUTS.connectGateway, shortcutPlatform)],
            ['Rename selected node', formatShortcut((desktopMode ? settings.shortcuts?.renameNode : null) || DEFAULT_SHORTCUTS.renameNode, shortcutPlatform)],
            ['Reload ARC Studio', formatShortcut((desktopMode ? settings.shortcuts?.reloadStudio : null) || DEFAULT_SHORTCUTS.reloadStudio, shortcutPlatform)],
            ['Save graph', formatShortcut((desktopMode ? settings.shortcuts?.saveGraph : null) || DEFAULT_SHORTCUTS.saveGraph, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Undo', formatShortcut((desktopMode ? settings.shortcuts?.undo : null) || DEFAULT_SHORTCUTS.undo, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Redo', formatShortcut((desktopMode && settings.shortcuts?.redo && settings.shortcuts.redo !== DEFAULT_SHORTCUTS.redo ? settings.shortcuts.redo : getDefaultShortcut('redo', shortcutPlatform)), shortcutPlatform)],
            ['Copy / paste selected node', `${shortcutModifier} + C / V`],
            ['Increase / decrease UI scale', `${shortcutModifier} + + / −`],
            ['Pan canvas', 'Space + drag']
          ].map(([label, keys]) => <div className="keyboard-shortcut-row" key={label}><span>{label}</span><span className="keyboard-shortcut-keys" aria-label={keys}>{getShortcutDisplayTokens(keys).map((key, index, tokens) => {
            const isSeparator = key === '/' || (key === '+' && tokens[index - 1] !== '+');
            if (isSeparator) return <span className="keyboard-shortcut-separator" key={`${key}-${index}`} aria-hidden="true">{key}</span>;
            const isModifier = ['⌘', '⇧', '⌥', 'Ctrl', 'Shift', 'Alt'].includes(key);
            const isSymbol = ['⌘', '⇧', '⌥'].includes(key);
            return <kbd className={`${isModifier ? 'is-modifier ' : ''}${isSymbol ? 'is-symbol' : ''}`.trim()} key={`${key}-${index}`} aria-hidden="true">{key}</kbd>;
          })}</span></div>)}
        </div>
      </Modal>
      <LazyMountedFeature Component={BotSettingsModal} isOpen={isBotSettingsOpen} loadingLabel="Opening app settings…" isDesktop={desktopMode} onClose={() => setIsBotSettingsOpen(false)} authToken={authToken} profile={botProfile} onProfileChange={setBotProfile} />
      <Modal
        isOpen={Boolean(exportReview)}
        onClose={() => setExportReview(null)}
        title="Export Bot"
        subtitle={`${exportReview?.issues.length || 0} finding${exportReview?.issues.length === 1 ? '' : 's'} · review the package and runtime requirements before building.`}
        icon={PackageOpen}
        maxWidth="max-w-2xl"
        footer={<><Button variant="secondary" onClick={() => setExportReview(null)}>Cancel</Button><Button disabled={exportInProgress || exportReview?.issues.some((issue) => issue.kind === 'error')} onClick={() => { const review = exportReview; setExportReview(null); if (review) handleExportBot(review.projectId, true, { includeCryptoSecret: review.includeCryptoSecret, includeBotToken: review.includeBotToken }); }}>Build bot ZIP</Button></>}
      >
        {exportReview?.summary && <div className="export-preflight-summary">
          <div className="export-preflight-stats"><span><strong>{exportReview.summary.graphCount}</strong> graphs</span><span><strong>{exportReview.summary.nodeCount}</strong> nodes</span><span><strong>{exportReview.summary.variableCount}</strong> variables</span></div>
          <div className="export-preflight-disclosures">
            <ExportReviewDisclosure title="Included in the archive" summary={`${exportReview.summary.included.length} files and folders`} expanded={Boolean(exportReviewSections.included)} onToggle={() => setExportReviewSections((current) => ({ ...current, included: !current.included }))}>
              {exportReview.summary.included.map((item) => <span key={item}>{item}</span>)}
            </ExportReviewDisclosure>
            {exportReview.summary.graphNames.length > 0 && <ExportReviewDisclosure title="Graphs" summary={`${exportReview.summary.graphNames.length} included`} expanded={Boolean(exportReviewSections.graphs)} onToggle={() => setExportReviewSections((current) => ({ ...current, graphs: !current.graphs }))}>
              <span>{exportReview.summary.graphNames.join(' · ')}</span>
            </ExportReviewDisclosure>}
            <ExportReviewDisclosure title="Gateway intents and permissions" summary={`${exportReview.summary.requiredIntents.length || 1} intents · ${exportReview.summary.requiredPermissions.length} permissions`} expanded={Boolean(exportReviewSections.requirements)} onToggle={() => setExportReviewSections((current) => ({ ...current, requirements: !current.requirements }))}>
              <div className="export-preflight-columns">
                <div className="export-preflight-section"><strong>Gateway intents</strong><span>{exportReview.summary.requiredIntents.length ? exportReview.summary.requiredIntents.join(', ') : 'Guilds (required)'}</span></div>
                <div className="export-preflight-section"><strong>Permissions used by nodes</strong><span>{exportReview.summary.requiredPermissions.length ? exportReview.summary.requiredPermissions.join(', ') : 'No additional permissions inferred'}</span><span>Inferred from node types; verify the bot role has these in each server.</span></div>
              </div>
            </ExportReviewDisclosure>
            <ExportReviewDisclosure title="Runtime and configuration" summary={exportReview.summary.runtime} expanded={Boolean(exportReviewSections.runtime)} onToggle={() => setExportReviewSections((current) => ({ ...current, runtime: !current.runtime }))}>
              {exportReview.summary.configuration.map((item) => <span key={item}>{item}</span>)}
            </ExportReviewDisclosure>
          </div>
          <div className="export-secret-options">
            {exportReview.summary.usesCryptoNodes && <label className="export-secret-option">
              <input type="checkbox" checked={Boolean(exportReview.includeCryptoSecret)} onChange={(event) => setExportReview((current) => current ? { ...current, includeCryptoSecret: event.target.checked } : current)} />
              <span><strong>Include generated crypto secret in .env</strong><small>{exportReview.includeCryptoSecret ? 'Used by AES nodes with no passphrase. Keep it private and reuse it when replacing an export that has stored ciphertext.' : 'Without a saved secret, ciphertext made with the default key cannot be decrypted after the bot restarts.'}</small></span>
            </label>}
            {exportReview.summary.showBotTokenOption && <label className={`export-secret-option${exportReview.summary.hasBotToken && exportReview.summary.isActiveProject ? '' : ' is-disabled'}`}>
              <input
                type="checkbox"
                checked={Boolean(exportReview.includeBotToken)}
                disabled={!exportReview.summary.canIncludeBotToken || !exportReview.summary.hasBotToken || !exportReview.summary.isActiveProject}
                onChange={(event) => setExportReview((current) => current ? { ...current, includeBotToken: event.target.checked } : current)}
              />
              <span><strong>Include bot token in .env</strong><small>{!exportReview.summary.isActiveProject ? 'Switch to this project before including its bot token.' : !exportReview.summary.hasBotToken ? 'No bot token is configured for this project.' : 'Off by default. Anyone with this ZIP can use the token.'}</small></span>
            </label>}
          </div>
          {exportReview.summary.unsupportedNodeCount > 0 && <div className="export-preflight-runtime-warning" role="alert">{exportReview.summary.unsupportedNodeCount} node type{exportReview.summary.unsupportedNodeCount === 1 ? ' is' : 's are'} not supported by the bundled runtime.</div>}
        </div>}
        <div className="validation-list">
          {exportReview?.issues.map((issue, index) => {
            const content = <><AlertCircle size={14} /><span>{issue.graphName && <strong>{issue.graphName}: </strong>}{issue.message}</span></>;
            return issue.nodeId
              ? <button key={`${issue.kind}-${issue.graphName}-${index}`} type="button" className={`validation-item is-${issue.kind} is-clickable`} title="Open graph and highlight node" onClick={() => { setExportReview(null); traceGraphNode(issue.graphId, issue.nodeId); }}>{content}</button>
              : <div key={`${issue.kind}-${issue.graphName}-${index}`} className={`validation-item is-${issue.kind}`}>{content}</div>;
          })}
        </div>
      </Modal>
      <LazyMountedFeature Component={GraphValidationModal} isOpen={Boolean(validationResult)} loadingLabel="Opening validation results…" isDesktop={desktopMode} onClose={() => setValidationResult(null)} graphName={validationResult?.graphName || activeGraph?.name} result={validationResult} onTraceIssue={traceGraphNode} />
      <Modal
        isOpen={gatewayIntentConfirm.length > 0}
        onClose={() => setGatewayIntentConfirm([])}
        title="Connect with limited gateway access?"
        subtitle="Discord currently reports these privileged intents as disabled."
        icon={AlertCircle}
        footer={<><Button variant="secondary" onClick={() => setGatewayIntentConfirm([])}>Cancel</Button><Button onClick={() => { setGatewayIntentConfirm([]); handleStartBot(true); }}>Connect anyway</Button></>}
      >
        <p className="close-graph-copy">ARC Studio can still connect the gateway, but graphs that need {gatewayIntentConfirm.map((intent) => intent.label).join(' and ')} may not receive the required events or data. Enable them in the Discord Developer Portal for full functionality.</p>
      </Modal>
      <Modal
        isOpen={Boolean(nameDialog)}
        onClose={() => { setNameDialog(null); setNameDialogError(''); }}
        onConfirm={handleNameDialogSubmit}
        title={nameDialog?.mode === 'save' || nameDialog?.mode === 'save-close' ? 'Save graph' : 'Rename graph'}
        subtitle={nameDialog?.mode === 'save' || nameDialog?.mode === 'save-close' ? 'Choose a name for this graph.' : 'Update the graph name.'}
        icon={FileCode2}
        footer={<><Button variant="secondary" onClick={() => { setNameDialog(null); setNameDialogError(''); }}>Cancel</Button><Button onClick={handleNameDialogSubmit}>{nameDialog?.mode === 'save' || nameDialog?.mode === 'save-close' ? 'Save graph' : 'Rename graph'}</Button></>}
      >
        <form onSubmit={handleNameDialogSubmit}>
          <TextInput label="Graph name" placeholder="Untitled graph" value={nameDialog?.value || ''} maxLength={80} autoFocus error={nameDialogError} onChange={(event) => { setNameDialog((current) => current ? { ...current, value: event.target.value } : current); setNameDialogError(''); }} />
          <button type="submit" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>
      <Modal
        isOpen={Boolean(closeGraphDialog)}
        onClose={() => setCloseGraphDialog(null)}
        title="Save changes?"
        subtitle={`“${closeGraphDialog?.name || 'Untitled graph'}” has unsaved changes.`}
        icon={Save}
        footer={<><Button variant="secondary" onClick={() => setCloseGraphDialog(null)}>Cancel</Button><Button variant="danger" onClick={handleDiscardAndCloseGraph}>Discard</Button><Button icon={Save} onClick={handleSaveAndCloseGraph}>Save and close</Button></>}
      >
        <p className="close-graph-copy">Save this graph to your Library before closing?</p>
      </Modal>
      <Modal isOpen={Boolean(nodePrefabDialog)} onClose={() => setNodePrefabDialog(null)} title="Save node prefab" subtitle="Add this configured node to Saved nodes." icon={FileCode2} footer={<><Button variant="secondary" onClick={() => setNodePrefabDialog(null)}>Cancel</Button><Button onClick={handleSaveNodePrefab}>Save node</Button></>}>
        <form onSubmit={handleSaveNodePrefab}><TextInput label="Node name" placeholder="My node" value={nodePrefabDialog?.name || ''} maxLength={80} autoFocus error={nodePrefabError} onChange={(event) => { setNodePrefabDialog((current) => current ? { ...current, name: event.target.value } : current); setNodePrefabError(''); }} /></form>
      </Modal>
      <Modal isOpen={Boolean(nodeRenameDialog)} onClose={() => setNodeRenameDialog(null)} title="Rename node" subtitle="This name is saved with this graph." icon={FileCode2} footer={<><Button variant="secondary" onClick={() => setNodeRenameDialog(null)}>Cancel</Button><Button onClick={saveNodeRename}>Rename</Button></>}>
        <form onSubmit={saveNodeRename}><TextInput label="Node name" placeholder={nodeRenameDialog?.fallback || 'Node'} value={nodeRenameValue} maxLength={64} autoFocus onChange={(event) => setNodeRenameValue(event.target.value)} /></form>
      </Modal>
      <Modal isOpen={Boolean(tagGroupDialog)} onClose={() => setTagGroupDialog(null)} title={tagGroupDialog?.id ? 'Edit canvas section' : 'Create canvas section'} subtitle="Group related nodes with a colored frame." icon={FolderTree} footer={<><Button variant="secondary" onClick={() => setTagGroupDialog(null)}>Cancel</Button><Button onClick={saveTagGroup}>{tagGroupDialog?.id ? 'Save section' : 'Create section'}</Button></>}>
        <form className="canvas-tag-group-form" onSubmit={saveTagGroup}>
          <TextInput label="Section name" placeholder="e.g. Ticket creation" value={tagGroupName} maxLength={48} autoFocus error={tagGroupError} onChange={(event) => { setTagGroupName(event.target.value); setTagGroupError(''); }} />
          <span className="field-label">Color</span>
          <div className="canvas-tag-group-colors">{TAG_GROUP_COLORS.map((color) => <button key={color.id} type="button" className={`canvas-tag-group-color${tagGroupColor === color.value ? ' is-selected' : ''}`} style={{ '--tag-group-color': color.value }} aria-label={`${color.label} section color`} aria-pressed={tagGroupColor === color.value} onClick={() => setTagGroupColor(color.value)} />)}</div>
          {(activeGraph?.notes || []).length > 0 && <><span className="field-label">Notes in section</span>{activeGraph.notes.length > 12 && <TextInput label="Search notes" placeholder="Filter by note text" value={tagGroupSearch} onChange={(event) => setTagGroupSearch(event.target.value)} />}<div className="canvas-tag-group-members">{activeGraph.notes.filter((note) => !tagGroupSearch.trim() || `${note.text || ''} ${note.createdBy || ''}`.toLowerCase().includes(tagGroupSearch.trim().toLowerCase())).map((note, index) => <label key={note.id}><input type="checkbox" checked={tagGroupNoteIds.includes(note.id)} onChange={(event) => setTagGroupNoteIds((current) => event.target.checked ? [...current, note.id] : current.filter((id) => id !== note.id))} /><span>{String(note.text || `Note ${index + 1}`).split('\n')[0].slice(0, 48)}</span><small>{note.createdBy || 'Unknown'}</small></label>)}</div></>}
        </form>
      </Modal>
      <Modal
        isOpen={Boolean(projectDelete)}
        onClose={() => { if (!projectBusy) { setProjectDelete(null); setProjectDeleteName(''); setProjectDeleteError(''); setProjectDeletePromptError(''); setProjectDeleteFieldShake(false); } }}
        onConfirm={attemptDeleteProject}
        title="Delete project?"
        subtitle="This permanently removes the project and its saved data."
        icon={Trash2}
        footer={<><Button variant="secondary" disabled={projectBusy} onClick={() => { setProjectDelete(null); setProjectDeleteName(''); setProjectDeleteError(''); setProjectDeletePromptError(''); }}>Cancel</Button><Button variant="danger" loading={projectBusy} disabled={projectBusy || projectDeleteName.trim() !== projectDelete?.name} onClick={handleDeleteProject}>Delete project</Button></>}
      >
        <p className="project-delete-copy">Type <strong>{projectDelete?.name}</strong> to confirm.</p>
        <TextInput inputRef={projectDeleteInputRef} label="Project name" placeholder={projectDelete?.name || ''} value={projectDeleteName} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus error={projectDeleteError} wrapperClassName={projectDeleteFieldShake ? 'field-shake project-delete-entry-flash' : ''} onChange={(event) => { setProjectDeleteName(event.target.value); setProjectDeleteError(''); setProjectDeletePromptError(''); }} />
        {projectDeletePromptError && <p className="field-error" role="alert">{projectDeletePromptError}</p>}
      </Modal>
      <Modal
        isOpen={Boolean(projectImportFile)}
        onClose={() => { if (!projectBusy) cancelProjectImport(); }}
        title="Import project file?"
        subtitle={projectImportFile?.name || ''}
        icon={ShieldCheck}
        footer={<><Button variant="secondary" disabled={projectBusy} onClick={cancelProjectImport}>Cancel</Button><Button icon={FileUp} loading={projectBusy} disabled={!projectImportTrusted || projectBusy || projectImportSharingWarning && !projectImportSharingApproved || projectImportEncrypted && projectImportPassword.length < 12 || projectImportCompatibility?.code === 'PROJECT_REQUIRES_NEWER_ARC' || projectImportCompatibility?.code === 'PROJECT_OLD_VERSION_CONFIRMATION_REQUIRED' && !projectImportOldVersionApproved} onClick={handleImportProject}>{projectImportCompatibility?.code === 'PROJECT_REQUIRES_NEWER_ARC' ? 'Newer ARC Studio required' : projectImportCompatibility?.code === 'PROJECT_OLD_VERSION_CONFIRMATION_REQUIRED' ? 'Import older project' : projectImportSharingWarning && projectImportSharingApproved ? 'Import project' : 'Trust and import'}</Button></>}
      >
        <div className="project-import-warning">
          <strong>Only import a project from someone you trust.</strong>
          <p>Project files contain graphs, settings, and assets. Importing adds the project to this workspace and marks it trusted here.</p>
          {projectImportSharingWarning && <div className="project-import-compatibility-warning" role="alert">
            <strong>Workspace members may access imported text</strong>
            <p>This project contains text or request fields. Importing it into “{projectImportSharingWarning.workspaceName}” makes that content visible to members with graph read permission and editable by members with graph write permission.</p>
            <label><input type="checkbox" checked={projectImportSharingApproved} onChange={(event) => setProjectImportSharingApproved(event.target.checked)} /><span>I understand who can access this content.</span></label>
          </div>}
          {projectImportEncrypted && <label className="project-import-password"><span>Export password</span><input type="password" autoComplete="current-password" value={projectImportPassword} onChange={(event) => setProjectImportPassword(event.target.value)} placeholder="Enter the password used to encrypt this file" /></label>}
          <label><input type="checkbox" checked={projectImportTrusted} onChange={(event) => setProjectImportTrusted(event.target.checked)} /><span>I trust the source of this project file.</span></label>
          {projectImportCompatibility?.code === 'PROJECT_OLD_VERSION_CONFIRMATION_REQUIRED' && <div className="project-import-compatibility-warning" role="alert"><strong>Older project version</strong><p>{projectImportCompatibility.unknownProjectVersion ? 'This file does not record an ARC Studio version.' : `Created with ARC Studio ${projectImportCompatibility.projectVersion}; this is at least 10 releases older than ${projectImportCompatibility.currentVersion}.`} Its graphs or settings may behave differently. Review it before using it.</p><label><input type="checkbox" checked={projectImportOldVersionApproved} onChange={(event) => setProjectImportOldVersionApproved(event.target.checked)} /><span>I understand and want to import this older project.</span></label></div>}
          {projectImportCompatibility?.code === 'PROJECT_REQUIRES_NEWER_ARC' && <div className="project-import-compatibility-warning" role="alert"><strong>Update ARC Studio to import this project</strong><p>Created with ARC Studio {projectImportCompatibility.projectVersion}. This workspace runs {projectImportCompatibility.currentVersion || 'an older version'}; open it with ARC Studio {projectImportCompatibility.projectVersion} or newer.</p></div>}
          {projectImportError && <p className="field-error" role="alert">{projectImportError}</p>}
        </div>
      </Modal>
      <Modal isOpen={projectTemplateDialog} onClose={() => { if (!projectBusy) { setProjectTemplateDialog(false); setProjectError(''); } }} title="Create from template" subtitle="Pick a starter project and give it a name." footer={<><Button variant="secondary" disabled={projectBusy} onClick={() => setProjectTemplateDialog(false)}>Cancel</Button><Button icon={Plus} loading={projectBusy} disabled={!newProjectName.trim() || projectBusy} onClick={handleCreateProjectFromTemplate}>Create project</Button></>}>
        <div className="project-template-dialog-form">
          <TextInput label="Project name" placeholder="e.g. Community bot" value={newProjectName} maxLength={64} autoFocus onChange={(event) => { setNewProjectName(event.target.value); setProjectNameManuallyEdited(true); setProjectNameInvalid(false); setProjectError(''); }} />
          <span className="field-label">Choose a starting point</span>
          <div className="splash-project-templates project-template-cards">
            {projectStarters.map((starter) => { const Icon = PROJECT_STARTER_ICONS[starter.id] || PackageOpen; return <button key={starter.id} type="button" className={`splash-project-template ${newProjectTemplate === starter.id ? 'is-selected' : ''}`} aria-pressed={newProjectTemplate === starter.id} onClick={() => { setNewProjectTemplate(starter.id); if (!projectNameManuallyEdited) setNewProjectName(starter.name); }}><Icon size={16} /><span><strong>{starter.name}</strong><small>{starter.description}</small></span></button>; })}
          </div>
          {projectError && <p className="field-error" role="alert">{projectError}</p>}
        </div>
      </Modal>
      <Modal
        isOpen={Boolean(updateNotice)}
        onClose={() => setUpdateNotice(null)}
        title={updateNotice?.title || `ARC Studio ${updateNotice?.version || ''}`}
        subtitle="Update available · release notes"
        icon={Sparkles}
        maxWidth="max-w-2xl"
        footer={<>
          <a className="studio-button studio-button-secondary" href={updateNotice?.url} target="_blank" rel="noreferrer">View release</a>
          {updateNotice?.kind === 'install'
            ? <><Button variant="secondary" disabled={updateInstalling} onClick={() => setUpdateNotice(null)}>Later</Button><Button icon={Download} loading={updateInstalling} disabled={updateInstalling} onClick={handleInstallStudioUpdate}>Download update</Button></>
            : <Button onClick={() => setUpdateNotice(null)}>Got it</Button>}
        </>}
      >
        <ReleaseNotes>{updateNotice?.notes}</ReleaseNotes>
      </Modal>
      <Modal
        isOpen={updateInstallPromptOpen}
        onClose={() => !updateInstalling && setUpdateInstallPromptOpen(false)}
        title={`Update ARC Studio to ${appUpdate?.version || 'the latest version'}?`}
        subtitle={`Signed ${desktopReleaseChannel} update · download it, then install when you’re ready.`}
        icon={Download}
        footer={<><Button variant="secondary" disabled={updateInstalling} onClick={() => setUpdateInstallPromptOpen(false)}>Later</Button><Button icon={Download} loading={updateInstalling} disabled={updateInstalling} onClick={handleInstallStudioUpdate}>Download update</Button></>}
      >
        <p className="close-graph-copy">Your graphs and settings are saved in your workspace. Download and verify the update now, then install it from the top bar when you’re ready to restart ARC Studio.</p>
        {appUpdate?.notes && <ReleaseNotes>{appUpdate.notes}</ReleaseNotes>}
      </Modal>
      <Modal
        isOpen={installUpdateConfirmOpen}
        onClose={() => !updateInstalling && setInstallUpdateConfirmOpen(false)}
        title={`Install ARC Studio ${downloadedUpdateReady?.version || 'update'}?`}
        subtitle="ARC Studio will restart to finish installing."
        icon={Download}
        footer={<><Button variant="secondary" disabled={updateInstalling} onClick={() => setInstallUpdateConfirmOpen(false)}>Cancel</Button><Button icon={Download} loading={updateInstalling} disabled={updateInstalling} onClick={handleInstallStagedUpdate}>Install and restart</Button></>}
      >
        <p className="close-graph-copy">Any unsaved changes in the editor will be lost when ARC Studio closes. Save your open graphs before installing.</p>
      </Modal>
      <Modal
        isOpen={updatePermissionHelpOpen}
        onClose={() => setUpdatePermissionHelpOpen(false)}
        title="ARC Studio needs folder access"
        subtitle="The update could not replace the app in its current location."
        icon={AlertCircle}
        footer={<><Button variant="secondary" onClick={() => setUpdatePermissionHelpOpen(false)}>OK</Button><Button icon={SlidersHorizontal} onClick={() => {
          const invoke = window.__TAURI_INTERNALS__?.invoke;
          invoke?.('open_macos_files_folders_settings').catch((error) => arcEvents.emit('toast:notify', { title: 'Could not open System Settings', message: String(error?.message || error), type: 'error', duration: 8000 }));
          setUpdatePermissionHelpOpen(false);
        }}>Open System Settings</Button></>}
      >
        <p className="close-graph-copy">Allow ARC Studio to access its current folder in System Settings under Privacy &amp; Security, then try the update again. If ARC Studio is in a system owned Applications folder, move it to your user Applications folder or approve the macOS administrator prompt.</p>
      </Modal>
      <Modal
        isOpen={Boolean(releaseNotesNotice) && !updateNotice && !appUpdate && !downloadedUpdateReady && !updateInstallPromptOpen}
        onClose={dismissReleaseNotes}
        title={releaseNotesNotice?.title || `What’s new in ARC Studio ${studioVersion}`}
        subtitle="Release notes"
        icon={Sparkles}
        maxWidth="max-w-2xl"
        footer={<><a className="studio-button studio-button-secondary" href={releaseNotesNotice?.url} target="_blank" rel="noreferrer">View release</a><Button onClick={dismissReleaseNotes}>Got it</Button></>}
      >
        <ReleaseNotes>{releaseNotesNotice?.notes}</ReleaseNotes>
      </Modal>
      <LazyMountedFeature Component={UserManagementModal} isOpen={!desktopMode && isUserMgmtOpen} loadingLabel="Opening Team access…" isDesktop={desktopMode} onClose={() => setIsUserMgmtOpen(false)} authToken={authToken} currentUsername={currentUser?.username} currentUserId={currentUser?.id} onCurrentUserChange={setCurrentUser} />
      </div>
      <ToastContainer />
      <TooltipLayer />
      <SelectionContextMenu />
    </div>
  );
}

function snapshotGraph(graph, { includeSecretDrafts = false } = {}) {
  const savedData = { ...graph };
  delete savedData.isDirty;
  delete savedData.localRecoveryOnly;
  if (!includeSecretDrafts && Array.isArray(savedData.variables)) {
    savedData.variables = savedData.variables.map((variable) => {
      if (!variable?.secret) return variable;
      const safe = { ...variable, initialValue: '••••••' };
      delete safe.secretValue;
      return safe;
    });
  }
  return JSON.parse(JSON.stringify(savedData));
}

function mergeGraphState(base, local, remote) {
  const merged = mergeCollaborativeValue(base, local, remote);
  return { ...merged, id: remote.id, isDirty: Boolean(local?.isDirty) };
}

function scrubStoredSecretDrafts(graph, authoritativeGraph) {
  if (!graph || !Array.isArray(graph.variables) || !Array.isArray(authoritativeGraph?.variables)) return graph;
  const storedSecretIds = new Set(authoritativeGraph.variables.filter((variable) => variable?.secret && variable?.secretStored).map((variable) => variable.id));
  if (!storedSecretIds.size) return graph;
  let changed = false;
  const variables = graph.variables.map((variable) => {
    if (!storedSecretIds.has(variable?.id)) return variable;
    if (variable.initialValue === '••••••' && variable.secretStored && !Object.hasOwn(variable, 'secretValue')) return variable;
    changed = true;
    const safe = { ...variable, secret: true, secretStored: true, initialValue: '••••••' };
    delete safe.secretValue;
    return safe;
  });
  return changed ? { ...graph, variables } : graph;
}

function scrubRejectedSecretDrafts(graph) {
  if (!graph || !Array.isArray(graph.variables)) return graph;
  let changed = false;
  const variables = graph.variables.map((variable) => {
    if (!variable?.secret) return variable;
    changed = true;
    const safe = { ...variable, initialValue: '••••••' };
    delete safe.secretValue;
    return safe;
  });
  return changed ? { ...graph, variables } : graph;
}

function mergeCollaborativeValue(base, local, remote) {
  if (collaborationValuesEqual(local, base)) return cloneCollaborationValue(remote);
  if (collaborationValuesEqual(remote, base) || collaborationValuesEqual(local, remote)) return cloneCollaborationValue(local);
  if (isPlainCollaborationObject(base) && isPlainCollaborationObject(local) && isPlainCollaborationObject(remote)) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const value = mergeCollaborativeValue(base[key], local[key], remote[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if ([base, local, remote].every((value) => Array.isArray(value) && value.every((item) => item && typeof item === 'object' && item.id != null))) {
    const baseById = new Map(base.map((item) => [item.id, item]));
    const localById = new Map(local.map((item) => [item.id, item]));
    const remoteById = new Map(remote.map((item) => [item.id, item]));
    const order = [...remote.map((item) => item.id), ...local.map((item) => item.id)].filter((id, index, ids) => ids.indexOf(id) === index);
    const result = [];
    for (const id of order) {
      const value = mergeCollaborativeValue(baseById.get(id), localById.get(id), remoteById.get(id));
      if (value !== undefined) result.push(value);
    }
    return result;
  }
  if ([base, local, remote].every((value) => Array.isArray(value) && value.length === base.length)) {
    return base.map((item, index) => mergeCollaborativeValue(item, local[index], remote[index]));
  }
  return cloneCollaborationValue(remote);
}

function collaborationValuesEqual(left, right) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

function cloneCollaborationValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainCollaborationObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sameGraphContent(left, right) {
  if (!left || !right) return false;
  const serialize = (graph) => JSON.stringify({
    name: graph.name,
    variables: graph.variables || [],
    nodes: graph.nodes || [],
    connections: graph.connections || [],
    tagGroups: graph.tagGroups || [],
    notes: graph.notes || [],
    arrows: (graph.arrows || []).filter((arrow) => arrow.locked)
  });
  return serialize(left) === serialize(right);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function semanticStringPin(pinId, pin = null) {
  const declared = String(pin?.semanticType || '').toLowerCase();
  if (declared) {
    const declaredId = declared.endsWith('_id') ? declared.slice(0, -3) : declared;
    const labels = {
      channel: ['channel-id', 'a channel ID'], parent: ['channel-id', 'a channel ID'], thread: ['channel-id', 'a thread ID'],
      guild: ['guild-id', 'a server ID'], server: ['guild-id', 'a server ID'], user: ['user-id', 'a user ID'],
      author: ['user-id', 'a user ID'], member: ['user-id', 'a user ID'], role: ['role-id', 'a role ID'],
      message: ['message-id', 'a message ID'], interaction: ['interaction-id', 'an interaction ID'],
      application: ['application-id', 'an application ID'], interaction_token: ['interaction-token', 'an interaction token'],
      component_custom: ['component-custom-id', 'a component Custom ID']
    };
    const match = labels[declaredId] || labels[declared];
    if (match) return { key: match[0], label: match[1], explicit: true };
  }
  const id = String(pinId || '').toLowerCase();
  if (id === 'custom_id' || id === 'component_id') return { key: 'component-custom-id', label: 'a component Custom ID', explicit: false };
  if (['channel_id', 'parent_id', 'thread_id'].includes(id)) return { key: 'channel-id', label: 'a channel ID', explicit: false };
  if (['guild_id', 'server_id'].includes(id)) return { key: 'guild-id', label: 'a server ID', explicit: false };
  if (['user_id', 'author_id', 'member_id', 'reply_author_id'].includes(id)) return { key: 'user-id', label: 'a user ID', explicit: false };
  if (id === 'role_id') return { key: 'role-id', label: 'a role ID', explicit: false };
  if (id === 'message_id' || id === 'referenced_message_id') return { key: 'message-id', label: 'a message ID', explicit: false };
  if (id === 'interaction_id') return { key: 'interaction-id', label: 'an interaction ID', explicit: false };
  if (id === 'interaction_token') return { key: 'interaction-token', label: 'an interaction token', explicit: false };
  if (id === 'application_id') return { key: 'application-id', label: 'an application ID', explicit: false };
  return null;
}

function validateGraph(graph, graphLookup = null, intentSummary = null, projectVariables = []) {
  const errors = [];
  const warnings = [];
  if (!graph) return { errors, warnings };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.filter((node) => node && typeof node === 'object') : [];
  const connections = Array.isArray(graph.connections) ? graph.connections.filter((connection) => connection && typeof connection === 'object') : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const isFunction = graph.graphType === 'function' || nodes.some((node) => node.type === 'function_input' || node.type === 'function_return');
  const functionInputs = nodes.filter((node) => node.type === 'function_input');
  const functionArguments = getFunctionGraphArguments(graph);
  const declaredGraphVariables = Array.isArray(graph.variables) ? graph.variables : [];
  const nodeCreatedVariables = nodes.filter((node) => node.type === 'variable_create').flatMap((node) => {
    const name = String(node.data?.name || '').trim();
    if (!/^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name)) return [];
    const type = ['string', 'number', 'boolean', 'array', 'object'].includes(node.data?.valueType) ? node.data.valueType : 'string';
    return [{ id: `nodevar_${node.id}`, name, type, initialValue: node.data?.value ?? (type === 'number' ? 0 : type === 'boolean' ? false : type === 'array' ? [] : type === 'object' ? {} : ''), persist: node.data?.persist !== false, nodeOwned: true, sourceNodeId: node.id }];
  });
  const graphVariables = [...declaredGraphVariables, ...nodeCreatedVariables.filter((variable) => !declaredGraphVariables.some((item) => item.id === variable.id))];
  graphVariables.push(...slashAttachmentVariables(nodes, graphVariables));
  const variableById = new Map([...graphVariables, ...projectVariables].map((variable) => [variable.id, variable]));
  const variableNames = new Map();
  for (const variable of graphVariables) {
    const name = String(variable?.name || '');
    if (!/^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name)) errors.push(`Variable “${name || 'unnamed'}” must start and end with a letter or number, with letters, numbers, hyphens, or underscores inside.`);
    const normalizedName = name.toLowerCase();
    if (normalizedName && variableNames.has(normalizedName)) errors.push(`Variable name “${name}” is used more than once.`);
    else if (normalizedName) variableNames.set(normalizedName, variable.id);
  }
  const initialVariableValue = (variable) => variable?.initialValue ?? (variable?.valueType === 'number' || variable?.type === 'number' ? 0 : variable?.valueType === 'boolean' || variable?.type === 'boolean' ? false : variable?.type === 'array' ? [] : variable?.type === 'object' ? {} : '');
  const findInputWire = (nodeId, pinId) => connections.find((wire) => wire.targetNodeId === nodeId && wire.targetPinId === pinId);
  const findUpstreamDeferNode = (targetNodeId) => {
    const pending = [targetNodeId];
    const visited = new Set();
    while (pending.length) {
      const currentId = pending.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      for (const wire of connections) {
        if (wire.targetNodeId !== currentId || wire.targetPinId !== 'exec' || wire.sourcePinId !== 'exec') continue;
        const source = nodeById.get(wire.sourceNodeId);
        if (['action_defer_reply', 'action_defer_update'].includes(source?.type)) return source;
        if (source) pending.push(source.id);
      }
    }
    return null;
  };
  const hasUpstreamDefer = (targetNodeId) => Boolean(findUpstreamDeferNode(targetNodeId));
  const resolveKnownStringOutput = (nodeId, pinId, seen = new Set()) => {
    const source = nodeById.get(nodeId);
    const key = `${nodeId}:${pinId}`;
    if (!source || seen.has(key)) return undefined;
    const nextSeen = new Set(seen).add(key);
    if (source.type === 'variable_get' && pinId === 'value') return initialVariableValue(variableById.get(source.data?.variableId));
    if (source.type === 'variable_create' && pinId === 'value') return initialVariableValue(variableById.get(`nodevar_${source.id}`));
    if (source.type === 'function_input') {
      const argument = getFunctionInputArguments(source).find((item) => item.legacy ? pinId === 'value' : functionArgumentPinId(item) === pinId);
      if (argument) return argument.defaultValue ?? '';
    }
    if (['value_text', 'value_number', 'value_boolean'].includes(source.type) && pinId === 'value') {
      const fallback = source.data?.value ?? (source.type === 'value_text' ? 'Hello World' : source.type === 'value_boolean');
      const wire = findInputWire(source.id, 'value');
      return wire ? resolveKnownStringOutput(wire.sourceNodeId, wire.sourcePinId, nextSeen) : fallback;
    }
    if (source.type === 'format_text' && pinId === 'text') {
      return renderTextTemplate(source.data?.template, (name) => {
        const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase()) || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
        if (variable) return initialVariableValue(variable);
        const slotWire = findInputWire(source.id, `slot_${name}`);
        const linked = slotWire ? resolveKnownStringOutput(slotWire.sourceNodeId, slotWire.sourcePinId, nextSeen) : undefined;
        if (linked !== undefined) return linked;
        return undefined;
      }, []);
    }
    return undefined;
  };
  const resolveKnownStringInput = (target, pinId, fallback = '') => {
    const wire = findInputWire(target.id, pinId);
    if (!wire) return String(fallback ?? '');
    const value = resolveKnownStringOutput(wire.sourceNodeId, wire.sourcePinId);
    return value === undefined ? undefined : String(value ?? '');
  };
  const validateComponentsV2Layout = (layout, label) => {
    const issues = [];
    let componentCount = 0;
    let textLength = 0;
    const visit = (items, parent = 'message') => {
      for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
        componentCount += 1;
        const location = `${parent} block ${index + 1}`;
        if (item?.type === 'text_display') {
          const text = String(item.content || '');
          textLength += text.length;
          if (!text.trim()) issues.push(`${location} needs text.`);
          if (text.length > 4000) issues.push(`${location} exceeds 4,000 characters.`);
        } else if (item?.type === 'section') {
          const texts = Array.isArray(item.texts) ? item.texts : [];
          componentCount += texts.length + (item.accessory ? 1 : 0);
          textLength += texts.reduce((total, text) => total + String(text || '').length, 0);
          if (texts.length < 1 || texts.length > 3 || texts.some((text) => !String(text || '').trim())) issues.push(`${location} needs 1 to 3 nonempty text blocks.`);
          if (!['button', 'thumbnail'].includes(item.accessory?.type)) issues.push(`${location} needs a button or thumbnail accessory.`);
          if (item.accessory?.type === 'thumbnail' && !String(item.accessory.url || '').trim()) issues.push(`${location} thumbnail needs an image URL.`);
          if (item.accessory?.type === 'thumbnail' && String(item.accessory.description || '').length > 1024) issues.push(`${location} thumbnail alt text exceeds 1,024 characters.`);
          if (item.accessory?.type === 'thumbnail' && String(item.accessory.url || '').length > 2048) issues.push(`${location} thumbnail URL exceeds 2,048 characters.`);
          if (item.accessory?.type === 'button' && item.accessory.style === 'link' && !/^https?:\/\//i.test(String(item.accessory.url || ''))) issues.push(`${location} link button needs an HTTP or HTTPS URL.`);
          if (item.accessory?.type === 'button' && item.accessory.style !== 'link' && !String(item.accessory.customId || '').trim()) issues.push(`${location} button needs a custom ID.`);
          if (item.accessory?.type === 'button' && String(item.accessory.label || '').length > 80) issues.push(`${location} button label exceeds 80 characters.`);
        } else if (item?.type === 'media_gallery') {
          if (!Array.isArray(item.items) || item.items.length < 1 || item.items.length > 10 || item.items.some((media) => !String(media.url || '').trim())) issues.push(`${location} needs 1 to 10 media URLs.`);
          if ((item.items || []).some((media) => String(media.description || '').length > 1024)) issues.push(`${location} media descriptions must be 1,024 characters or fewer.`);
          if ((item.items || []).some((media) => String(media.url || '').length > 2048)) issues.push(`${location} media URLs must be 2,048 characters or fewer.`);
        } else if (item?.type === 'file') {
          if (!/^attachment:\/\/[^\s?#]{1,100}$/i.test(String(item.url || ''))) issues.push(`${location} needs an attachment URL.`);
          if (String(item.url || '').length > 2048) issues.push(`${location} attachment URL exceeds 2,048 characters.`);
        } else if (item?.type === 'action_row') {
          const controls = Array.isArray(item.components) ? item.components : [];
          componentCount += controls.length;
          const hasSelect = controls.some((control) => ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(control.type));
          if (!controls.length || controls.length > 5 || hasSelect && controls.length !== 1) issues.push(`${location} must contain up to 5 buttons or one select menu.`);
          if (controls.some((control) => ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(control.type) ? !String(control.customId || '').trim() : !String(control.label || '').trim() || (control.style === 'link' ? !/^https?:\/\//i.test(String(control.url || '')) : !String(control.customId || '').trim()))) issues.push(`${location} controls need valid labels, custom IDs, or link URLs.`);
        } else if (item?.type === 'container') {
          if (!Array.isArray(item.children) || !item.children.length || item.children.length > 10) issues.push(`${location} needs 1 to 10 child blocks.`);
          visit(item.children, location);
        } else if (item?.type !== 'separator') issues.push(`${location} has an unsupported block type.`);
      }
    };
    if (!Array.isArray(layout) || !layout.length) issues.push('Add at least one Components V2 block.');
    visit(layout);
    if (componentCount > 40) issues.push('Components V2 messages support up to 40 components.');
    if (textLength > 4000) issues.push('Text Display content across the message exceeds 4,000 characters.');
    for (const issue of [...new Set(issues)]) errors.push(`${label}: ${issue}`);
  };
  const definitions = new Map(BuiltInNodeDefinitions.map((definition) => [definition.type, definition]));
  const isEventTrigger = (node) => String(node?.type || '').startsWith('event_') || Boolean(definitions.get(node?.type)?.gatewayEvent);
  const execEdges = connections.filter((wire) => {
    const source = nodeById.get(wire.sourceNodeId);
    const target = nodeById.get(wire.targetNodeId);
    return source && target
      && graphPin(source, 'outputs', wire.sourcePinId, variableById, graphLookup, connections)?.type === 'exec'
      && graphPin(target, 'inputs', wire.targetPinId, variableById, graphLookup, connections)?.type === 'exec';
  });
  const execTargets = new Map();
  for (const wire of execEdges) {
    if (!execTargets.has(wire.sourceNodeId)) execTargets.set(wire.sourceNodeId, []);
    execTargets.get(wire.sourceNodeId).push(wire.targetNodeId);
  }
  const walkExec = (startIds, visit = () => {}) => {
    const pending = [...startIds];
    const visited = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      visit(id);
      pending.push(...(execTargets.get(id) || []));
    }
    return visited;
  };
  if (!isFunction) {
    const eventNodes = nodes.filter((node) => String(node.type).startsWith('event_'));
    const reachableFromEvents = walkExec(eventNodes.map((node) => node.id));
    for (const node of nodes) {
      const definition = definitions.get(node.type);
      if (definition?.inputs?.some((pin) => pin.type === 'exec') && !isEventTrigger(node) && !reachableFromEvents.has(node.id)) {
        warnings.push(`${node.label || definition.label || node.type}: unreachable from every event node.`);
      }
    }

    for (const node of nodes.filter((item) => item.type === 'repeat_while')) {
      const conditionConnected = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'condition');
      if (!conditionConnected && node.data?.condition !== false) warnings.push(`${node.label || 'Repeat While'}: the condition is always true, so this loop has no clear exit.`);
    }

    let sccIndex = 0;
    const sccStack = [];
    const sccIndices = new Map();
    const sccLowLinks = new Map();
    const sccOnStack = new Set();
    const inspectExecScc = (id) => {
      sccIndices.set(id, sccIndex);
      sccLowLinks.set(id, sccIndex++);
      sccStack.push(id);
      sccOnStack.add(id);
      for (const next of execTargets.get(id) || []) {
        if (!sccIndices.has(next)) {
          inspectExecScc(next);
          sccLowLinks.set(id, Math.min(sccLowLinks.get(id), sccLowLinks.get(next)));
        } else if (sccOnStack.has(next)) sccLowLinks.set(id, Math.min(sccLowLinks.get(id), sccIndices.get(next)));
      }
      if (sccLowLinks.get(id) !== sccIndices.get(id)) return;
      const component = new Set();
      let member;
      do {
        member = sccStack.pop();
        sccOnStack.delete(member);
        component.add(member);
      } while (member !== id);
      const cyclic = component.size > 1 || (execTargets.get(id) || []).includes(id);
      if (!cyclic) return;
      const hasExit = [...component].some((nodeId) => {
        const node = nodeById.get(nodeId);
        if (['repeat_while', 'loop_count'].includes(node?.type)) return true;
        const outputIds = node?.type === 'branch_if' ? ['true_exec', 'false_exec']
          : node?.type === 'wait_until_condition' ? ['ready_exec', 'timeout_exec'] : [];
        if (!outputIds.length) return false;
        const wires = connections.filter((wire) => wire.sourceNodeId === nodeId && outputIds.includes(wire.sourcePinId));
        return wires.some((wire) => component.has(wire.targetNodeId))
          && (wires.some((wire) => !component.has(wire.targetNodeId)) || wires.length < outputIds.length);
      });
      if (!hasExit) {
        const node = nodeById.get(id);
        warnings.push(`${node?.label || definitions.get(node?.type)?.label || 'Execution graph'}: this execution cycle has no clear exit branch; the runtime safety limit will stop it.`);
      }
    };
    for (const node of nodes) if (!sccIndices.has(node.id)) inspectExecScc(node.id);

    const ackTypes = new Set(['action_defer_reply', 'action_defer_update', 'action_reply_interaction']);
    const ackNodes = nodes.filter((node) => ackTypes.has(node.type));
    for (const source of ackNodes) {
      const reachable = walkExec(execTargets.get(source.id) || []);
      for (const target of ackNodes) {
        if (source.id === target.id || !reachable.has(target.id)) continue;
        if (['action_defer_reply', 'action_defer_update'].includes(source.type) && target.type === 'action_reply_interaction') continue;
        warnings.push(`${target.label || definitions.get(target.type)?.label || 'Interaction action'}: may acknowledge the same interaction more than once along one execution path.`);
      }
    }

    const reachableJoins = (startNodeId) => [...walkExec([startNodeId])].filter((id) => nodeById.get(id)?.type === 'parallel_join');
    for (const node of nodes.filter((item) => item.type === 'parallel')) {
      const branchReachability = ['branch_a_exec', 'branch_b_exec'].map((pinId) => {
        const branchWire = connections.find((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId);
        return branchWire ? reachableJoins(branchWire.targetNodeId) : [];
      });
      if (branchReachability.every((joins) => joins.length) && !branchReachability[0].some((joinId) => branchReachability[1].includes(joinId))) {
        warnings.push(`${node.label || 'Parallel'}: its two branches do not reach a common Join node.`);
      } else if (branchReachability.some((joins) => !joins.length) && ['branch_a_exec', 'branch_b_exec'].every((pinId) => connections.some((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId))) {
        warnings.push(`${node.label || 'Parallel'}: at least one branch cannot reach a Join node.`);
      }
      const branchAcknowledgements = ['branch_a_exec', 'branch_b_exec'].map((pinId) => {
        const branchWire = connections.find((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId);
        return branchWire ? [...walkExec([branchWire.targetNodeId])].filter((id) => ackTypes.has(nodeById.get(id)?.type)) : [];
      });
      if (branchAcknowledgements.every((acknowledgements) => acknowledgements.length)) {
        warnings.push(`${node.label || 'Parallel'}: both concurrent branches may acknowledge the same interaction. Acknowledge once, then edit the deferred response after Join.`);
      }
    }
  } else {
    const entryNode = functionInputs[0];
    const reachableFromEntry = entryNode ? walkExec([entryNode.id]) : new Set();
    for (const node of nodes) {
      if (String(node.type).startsWith('action_') && !reachableFromEntry.has(node.id)) {
        warnings.push(`${node.label || definitions.get(node.type)?.label || node.type}: unreachable from the Function Input execution entry.`);
      }
    }
  }
  if (nodeIds.size !== nodes.length) errors.push('Node IDs must be unique.');
  const hasActionNode = nodes.some((node) => String(node.type).startsWith('action_'));
  if (isFunction && !functionInputs.length) errors.push('Add one Function Input node to provide this function’s entry point.');
  if (isFunction && functionInputs.length > 1) errors.push('A function graph can have only one Function Input node. Add arguments to that node instead.');
  const hasFunctionEffect = nodes.some((node) => String(node.type).startsWith('action_'))
    || nodes.some((node) => node.type === 'function_call' && functionGraphHasEffects(graphLookup?.get(node.data?.graphId), graphLookup));
  if (isFunction && !nodes.some((node) => node.type === 'function_return') && !hasFunctionEffect) errors.push('Add a Return Value node or a Discord action to give this function a result or an effect.');
  if (isFunction) {
    const inputNames = new Set();
    const inputIds = new Set();
    for (const parameter of functionArguments) {
      const name = String(parameter.name || '').trim();
      if (!name) errors.push(`${parameter.label || 'Function Input'}: give this input a name.`);
      else if (inputNames.has(name.toLowerCase())) errors.push(`Function input “${name}” is duplicated. Input names must be unique.`);
      inputNames.add(name.toLowerCase());
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(parameter.paramId) || inputIds.has(parameter.paramId)) errors.push(`Function input “${name || 'Input'}” has an invalid or duplicate argument ID.`);
      inputIds.add(parameter.paramId);
      if (!FUNCTION_ARGUMENT_VALUE_TYPES.includes(parameter.valueType)) errors.push(`Function input “${name || 'Input'}” has an unsupported value type.`);
    }
  }
  if (isFunction && nodes.some(isEventTrigger)) errors.push('Function graphs cannot contain event trigger nodes.');
    if (graphLookup && hasFunctionCycle(graph, graphLookup)) errors.push('Graphs cannot call themselves, directly or indirectly.');
  const hasEventNode = nodes.some(isEventTrigger);
  if (!isFunction && !hasEventNode && hasActionNode) warnings.push('This graph has Discord actions but no event node to run them.');
  if (!isFunction && hasEventNode && !hasActionNode) warnings.push('This graph has no action nodes.');
  const privilegedEventIntents = new Set(nodes.flatMap((node) => definitions.get(node.type)?.gatewayIntents || []).filter((intent) => ['GUILD_MEMBERS', 'GUILD_PRESENCES', 'MESSAGE_CONTENT'].includes(intent)));
  const disabledPrivilegedIntents = [...privilegedEventIntents].filter((intent) => intentSummary?.some((item) => item.key === intent && item.portalEnabled === false));
  if (disabledPrivilegedIntents.length) warnings.push(`Enable ${disabledPrivilegedIntents.map((intent) => ({ GUILD_MEMBERS: 'Server Members', GUILD_PRESENCES: 'Presence', MESSAGE_CONTENT: 'Message Content' })[intent]).join(' and ')} intent${disabledPrivilegedIntents.length > 1 ? 's' : ''} in the Discord Developer Portal, then reconnect the gateway.`);

  const hasConfiguredEmbed = (node) => {
    const blocks = Array.isArray(node.data?.blocks) ? node.data.blocks : null;
    const hasValue = (block, key) => Boolean(String(block?.[key] ?? '').trim())
      || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === `block_${block?.id}_${key}`);
    if (blocks) return blocks.some((block) => {
      if (block?.type === 'title' || block?.type === 'description') return hasValue(block, 'value');
      if (block?.type === 'field') return hasValue(block, 'name') && hasValue(block, 'value');
      if (block?.type === 'image' || block?.type === 'thumbnail') return hasValue(block, 'url');
      if (block?.type === 'author') return hasValue(block, 'name');
      if (block?.type === 'footer') return hasValue(block, 'text');
      return false;
    });
    return Boolean(node.data?.title || node.data?.description || node.data?.image_url || node.data?.thumbnail_url
      || node.data?.author_name || node.data?.footer_text
      || (Array.isArray(node.data?.fields) && node.data.fields.some((field) => field?.name && field?.value)));
  };

  const slashCommandNames = new Set();
  for (const node of nodes) {
    if (!definitions.has(node.type)) errors.push(`${node.label || node.type}: node type is unavailable.`);
    if (node.type === 'parallel') {
      for (const pinId of ['branch_a_exec', 'branch_b_exec']) {
        const count = connections.filter((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId).length;
        if (count !== 1) errors.push(`${node.label || 'Parallel'}: connect exactly one execution wire to ${pinId === 'branch_a_exec' ? 'Branch A' : 'Branch B'}.`);
      }
    }
    if (node.type === 'parallel_join') {
      const incoming = connections.filter((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'exec');
      const count = incoming.length;
      if (count < 2) errors.push(`${node.label || 'Join'}: connect both parallel branches to this node.`);
      else if (incoming.some((wire) => nodeById.get(wire.sourceNodeId)?.type === 'branch_if')) errors.push(`${node.label || 'Join'}: Join is only for Parallel branches. Connect If/Else paths directly to the same action node instead.`);
    }
    if (node.type === 'event_slash_command') {
      const name = String(node.data?.commandName ?? '');
      const description = String(node.data?.description ?? '').trim();
      if (!/^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u.test(name)) errors.push(`${node.label || 'Slash Command'}: use a valid 1–32 character Discord command name without /.`);
      else if (name !== name.toLowerCase()) errors.push(`${node.label || 'Slash Command'}: Discord command names must be lowercase.`);
      if (!description || Array.from(description).length > 100) errors.push(`${node.label || 'Slash Command'}: description must be 1–100 characters.`);
      const normalizedName = name.toLowerCase();
      const duplicateInGraph = name && slashCommandNames.has(normalizedName);
      const conflictingGraph = graphLookup && Array.from(graphLookup.values()).find((candidate) => candidate.id !== graph.id
        && (candidate.nodes || []).some((item) => item.type === 'event_slash_command' && String(item.data?.commandName || '').toLowerCase() === normalizedName));
      if (name && (duplicateInGraph || conflictingGraph)) errors.push(`Slash command /${name} is defined more than once. Names must be unique.`);
      if (name) slashCommandNames.add(normalizedName);
      for (const issue of validateSlashCommandOptions(node.data?.options || [], normalizedName)) errors.push(`${node.label || 'Slash Command'}: ${issue}`);
      for (const { option, path } of flattenSlashParameters(node.data?.options)) {
        if (option.autocomplete && option.dynamicAutocomplete && (!nodes.some((item) => item.type === 'event_slash_autocomplete') || !nodes.some((item) => item.type === 'action_respond_autocomplete'))) {
          warnings.push(`/${normalizedName} · ${path.join(' / ')}: add On Command Autocomplete and Respond to Autocomplete to provide graph-generated suggestions.`);
        }
      }
    }
    if (node.type === 'action_respond_autocomplete') {
      const hasChoices = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'choices')
        || Array.isArray(node.data?.choices) && node.data.choices.length > 0;
      if (!hasChoices) warnings.push(`${node.label || 'Respond to Autocomplete'}: connect an array of suggestion objects with name and value fields.`);
    }
    if (['variable_get', 'variable_set'].includes(node.type) && !variableById.has(node.data?.variableId)
      && !connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'variable')) errors.push(`${node.label || node.type}: select a graph variable or connect a Variable socket.`);
    if (node.type === 'variable_set' && variableById.get(node.data?.variableId)?.readOnly) errors.push(`${node.label || 'Set Variable'}: attachment variables are read only.`);
    if (node.type === 'variable_create' && !String(node.data?.name || '').trim()) errors.push(`${node.label || 'Create Variable'}: enter a variable name.`);
    if (node.type === 'function_call') {
      const called = graphLookup?.get(node.data?.graphId);
      if (!called) errors.push(`${node.label || 'Call Graph'}: select a saved graph.`);
      else {
        if (!called.nodes?.some((item) => item.type === 'function_return') && !functionGraphHasEffects(called, graphLookup)) warnings.push(`${node.label || 'Call Graph'}: the target graph has no Return Value, so this node produces no result.`);
        for (const parameter of getFunctionGraphArguments(called).filter((item) => item.optional === false)) {
          const connected = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === functionArgumentPinId(parameter));
          if (!connected) errors.push(`${node.label || 'Call Graph'}: connect the required “${parameter.name || 'Input'}” input.`);
        }
      }
    }
    if (['math_divide', 'math_modulo'].includes(node.type) && !connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'b') && Number(node.data?.b ?? 0) === 0) {
      warnings.push(`${node.label || 'Math node'}: B is zero, so the result will be 0 until a non-zero value is connected.`);
    }
    if (['action_send_message', 'action_edit_message', 'action_edit_components'].includes(node.type)) {
      const isEdit = ['action_edit_message', 'action_edit_components'].includes(node.type);
      const componentsOnly = node.type === 'action_edit_components';
      const label = node.label || (isEdit ? 'Edit Message' : 'Send Message');
      const hasChannel = Boolean(String(node.data?.channel_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'channel_id');
      const hasThread = !isEdit && (Boolean(String(node.data?.thread_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'thread_id'));
      const hasMessageId = Boolean(String(node.data?.message_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'message_id');
      const hasContent = Boolean(String(node.data?.content ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'content');
      const hasEmbed = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed') || hasConfiguredEmbed(node);
      const componentsWire = findInputWire(node.id, 'components');
      const componentsSource = componentsWire && nodeById.get(componentsWire.sourceNodeId);
      const componentsV2 = Boolean(node.data?.componentsV2Enabled || componentsSource?.type === 'build_components');
      const hasComponents = (Array.isArray(node.data?.components) && node.data.components.some((row) => row.components?.length)) || componentsWire || componentsV2 && Array.isArray(node.data?.componentsV2Layout) && node.data.componentsV2Layout.length > 0;
      if (!hasChannel && !hasThread) errors.push(`${label}: connect a channel ID or thread ID.`);
      if (isEdit && !hasMessageId) errors.push(`${label}: connect a message ID.`);
      if (!hasContent && !hasEmbed && !hasComponents && !isEdit) errors.push(`${label}: add message content, an embed, or components.`);
      if (componentsOnly && !hasComponents) errors.push(`${label}: add components or connect a Components Builder.`);
      if (componentsV2) {
        if (hasContent || hasEmbed) errors.push(`${label}: Components V2 cannot be combined with message content or embeds.`);
        if (node.data?.componentsV2Enabled) validateComponentsV2Layout(node.data?.componentsV2Layout, label);
      }
      const content = resolveKnownStringInput(node, 'content', node.data?.content || '');
      if (content !== undefined && content.length > 2000) errors.push(`${label}: content exceeds 2,000 characters after text variables are applied.`);
    }
    if (['action_create_thread', 'action_start_thread_from_message'].includes(node.type)) {
      const label = node.label || definitions.get(node.type)?.label || 'Create Thread';
      const hasInput = (id) => Boolean(String(node.data?.[id] ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === id);
      if (!hasInput('channel_id')) errors.push(`${label}: connect a parent channel ID.`);
      if (!hasInput('name')) errors.push(`${label}: enter a thread name.`);
      if (node.type === 'action_start_thread_from_message' && !hasInput('message_id')) errors.push(`${label}: connect a message ID.`);
      if (node.type === 'action_create_thread' && !['public', 'private'].includes(String(node.data?.thread_type || 'public').toLowerCase())
        && !connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'thread_type')) errors.push(`${label}: choose public or private thread type.`);
    }
    if (['action_reply_interaction', 'action_defer_reply', 'action_defer_update'].includes(node.type)) {
      const label = node.label || definitions.get(node.type)?.label || 'Interaction Action';
      const hasToken = Boolean(String(node.data?.interaction_token ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'interaction_token');
      if (!hasToken) errors.push(`${label}: connect an interaction token.`);
      if (['action_defer_reply', 'action_defer_update'].includes(node.type)) {
        const hasInteractionId = Boolean(String(node.data?.interaction_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'interaction_id');
        if (!hasInteractionId) warnings.push(`${label}: connect an Interaction ID. Discord needs it to acknowledge the interaction.`);
      }
    }
    if (node.type === 'action_reply_interaction') {
      const label = node.label || definitions.get(node.type)?.label || 'Reply to Interaction';
      const hasInteractionId = Boolean(String(node.data?.interaction_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'interaction_id');
      if (!hasInteractionId && !hasUpstreamDefer(node.id)) warnings.push(`${label}: connect an Interaction ID.`);
      const upstreamDeferNode = findUpstreamDeferNode(node.id);
      if (upstreamDeferNode && upstreamDeferNode.type === 'action_defer_reply') {
        const upstreamEphemeralWire = connections.find((wire) => wire.targetNodeId === upstreamDeferNode.id && wire.targetPinId === 'ephemeral');
        const upstreamSourceNode = upstreamEphemeralWire && nodeById.get(upstreamEphemeralWire.sourceNodeId);
        const upstreamEphemeral = upstreamEphemeralWire
          ? Boolean(upstreamSourceNode?.type === 'value_boolean' ? upstreamSourceNode.data?.value : true)
          : Boolean(upstreamDeferNode.data?.ephemeral);
        const downstreamEphemeralWire = connections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'ephemeral');
        const downstreamSourceNode = downstreamEphemeralWire && nodeById.get(downstreamEphemeralWire.sourceNodeId);
        const downstreamEphemeral = downstreamEphemeralWire
          ? Boolean(downstreamSourceNode?.type === 'value_boolean' ? downstreamSourceNode.data?.value : true)
          : Boolean(node.data?.ephemeral);
        if (downstreamEphemeralWire || node.data?.ephemeral !== undefined) {
          if (upstreamEphemeral !== downstreamEphemeral) {
            warnings.push(`${label}: this interaction was deferred as ${upstreamEphemeral ? 'ephemeral' : 'public'}. Once an interaction is acknowledged, its visibility cannot be switched between ephemeral and public.`);
          }
        }
      }
      const hasContent = Boolean(String(node.data?.content ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'content');
      const hasEmbed = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed') || hasConfiguredEmbed(node);
      const componentsWire = findInputWire(node.id, 'components');
      const componentsSource = componentsWire && nodeById.get(componentsWire.sourceNodeId);
      const componentsV2 = Boolean(node.data?.componentsV2Enabled || componentsSource?.type === 'build_components');
      const hasComponents = (Array.isArray(node.data?.components) && node.data.components.some((row) => row.components?.length)) || componentsWire || componentsV2 && Array.isArray(node.data?.componentsV2Layout) && node.data.componentsV2Layout.length > 0;
      if (!hasContent && !hasEmbed && !hasComponents) errors.push(`${label}: add reply content, an embed, or components.`);
      if (componentsV2) {
        if (hasContent || hasEmbed) errors.push(`${label}: Components V2 cannot be combined with message content or embeds.`);
        if (node.data?.componentsV2Enabled) validateComponentsV2Layout(node.data?.componentsV2Layout, label);
      }
      const content = resolveKnownStringInput(node, 'content', node.data?.content || '');
      if (content !== undefined && content.length > 2000) errors.push(`${label}: content exceeds 2,000 characters after text variables are applied.`);
    }
    if (node.type === 'action_edit_interaction_reply') {
      const label = node.label || definitions.get(node.type)?.label || 'Edit Interaction Reply';
      const componentsWire = findInputWire(node.id, 'components');
      const componentsSource = componentsWire && nodeById.get(componentsWire.sourceNodeId);
      const componentsV2 = Boolean(node.data?.componentsV2Enabled || componentsSource?.type === 'build_components');
      const hasContent = Boolean(String(node.data?.content ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'content');
      const hasEmbed = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed') || hasConfiguredEmbed(node);
      if (componentsV2 && (hasContent || hasEmbed)) errors.push(`${label}: Components V2 cannot be combined with message content or embeds.`);
      if (componentsV2 && node.data?.componentsV2Enabled) validateComponentsV2Layout(node.data?.componentsV2Layout, label);
    }
    if ((String(node.type).startsWith('action_') || node.type === 'variable_set') && !connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'exec')) {
      warnings.push(`${node.label || node.type}: no execution input is connected.`);
    }
    if (node.type === 'build_embed') {
      const embedBlocks = Array.isArray(node.data?.blocks) ? node.data.blocks : null;
      const fields = embedBlocks ? embedBlocks.filter((block) => block.type === 'field') : Array.isArray(node.data?.fields) ? node.data.fields : [];
      if (fields.length > 25) errors.push(`${node.label || 'Create Embed'}: embeds support up to 25 fields.`);
      const label = node.label || 'Create Embed';
      let total = 0;
      let totalIsKnown = true;
      const checkText = (pinId, fallback, limit, fieldLabel) => {
        const value = resolveKnownStringInput(node, pinId, fallback);
        if (value === undefined) {
          totalIsKnown = false;
          return;
        }
        total += value.length;
        if (value.length > limit) errors.push(`${label}: ${fieldLabel} exceeds ${limit.toLocaleString()} characters after text variables are applied.`);
      };
      if (embedBlocks) {
        for (const [index, block] of embedBlocks.entries()) {
          if (block.type === 'title') checkText(`block_${block.id}_value`, block.value, 256, 'title');
          else if (block.type === 'description') checkText(`block_${block.id}_value`, block.value, 4096, 'description');
          else if (block.type === 'author') checkText(`block_${block.id}_name`, block.name, 256, 'author name');
          else if (block.type === 'footer') checkText(`block_${block.id}_text`, block.text, 2048, 'footer');
          else if (block.type === 'field') {
            const fieldIndex = fields.indexOf(block) + 1 || index + 1;
            checkText(`block_${block.id}_name`, block.name, 256, `field ${fieldIndex} name`);
            checkText(`block_${block.id}_value`, block.value, 1024, `field ${fieldIndex} value`);
          }
        }
      } else {
        checkText('title', node.data?.title, 256, 'title');
        checkText('description', node.data?.description, 4096, 'description');
        checkText('author_name', node.data?.author_name, 256, 'author name');
        checkText('footer_text', node.data?.footer_text, 2048, 'footer');
        fields.forEach((field, index) => {
          checkText(`field_${field.id}_name`, field.name, 256, `field ${index + 1} name`);
          checkText(`field_${field.id}_value`, field.value, 1024, `field ${index + 1} value`);
        });
      }
      if (totalIsKnown && total > 6000) errors.push(`${label}: combined text exceeds 6,000 characters after text variables are applied.`);
    }
    if (node.type === 'build_components') validateComponentsV2Layout(node.data?.componentsV2, node.label || 'Component Builder');
  }
  for (const wire of connections) {
    const source = nodeById.get(wire.sourceNodeId);
    const target = nodeById.get(wire.targetNodeId);
    if (!source || !target) {
      errors.push('A connection points to a missing node.');
      continue;
    }
    const sourcePin = graphPin(source, 'outputs', wire.sourcePinId, variableById, graphLookup, connections);
    const targetPin = graphPin(target, 'inputs', wire.targetPinId, variableById, graphLookup, connections);
    if (!sourcePin || !targetPin) {
      const labelFor = (node) => node.label || definitions.get(node.type)?.label || node.type;
      const missing = [
        !sourcePin && `output “${wire.sourcePinId}” on ${labelFor(source)}`,
        !targetPin && `input “${wire.targetPinId}” on ${labelFor(target)}`
      ].filter(Boolean);
      errors.push(`A connection uses a missing node pin: ${missing.join(' → ')}.`);
    }
    else if (sourcePin.type !== targetPin.type && sourcePin.type !== 'any' && targetPin.type !== 'any' && sourcePin.type !== 'arg' && targetPin.type !== 'arg') errors.push('A connection joins incompatible pin types.');
    else if (sourcePin.type === 'string' && targetPin.type === 'string') {
      const sourceMeaning = semanticStringPin(wire.sourcePinId, sourcePin);
      const targetMeaning = semanticStringPin(wire.targetPinId, targetPin);
      if (sourceMeaning && targetMeaning && sourceMeaning.key !== targetMeaning.key) {
        const targetLabel = target.label || definitions.get(target.type)?.label || target.type;
        const sourceLabel = source.label || definitions.get(source.type)?.label || source.type;
        const message = `${targetLabel}: ${sourceMeaning.label[0].toUpperCase()}${sourceMeaning.label.slice(1)} from ${sourceLabel} cannot connect to a socket expecting ${targetMeaning.label}.`;
        if (sourceMeaning.explicit && targetMeaning.explicit) errors.push(message);
        else warnings.push(`${message} Check that this connection is intentional.`);
      }
    }
    if (targetPin?.semanticType && ['application_id', 'channel_id', 'guild_id', 'interaction_id', 'interaction_token', 'message_id', 'role_id', 'thread_id', 'user_id'].includes(targetPin.semanticType)) {
      const knownValue = resolveKnownStringOutput(source.id, wire.sourcePinId);
      if (knownValue !== undefined && String(knownValue ?? '').trim()) {
        try {
          validateDiscordSemanticValue(knownValue, targetPin.semanticType, targetPin.semanticType.replaceAll('_', ' '));
        } catch (error) {
          const targetLabel = target.label || definitions.get(target.type)?.label || target.type;
          errors.push(`${targetLabel}: ${error.message}`);
        }
      }
    }
  }
  const variables = Array.isArray(graph.variables) ? graph.variables : [];
  const names = new Set();
  for (const variable of variables) {
    const normalized = String(variable.name || '').trim().toLowerCase();
    if (!normalized) errors.push('Every graph variable needs a name.');
    else if (names.has(normalized)) errors.push(`Variable name “${variable.name}” is used more than once.`);
    names.add(normalized);
  }
  const locateNodeId = (message) => {
    const labeledNode = nodes.find((node) => message.startsWith(`${node.label || definitions.get(node.type)?.label || node.type}:`));
    if (labeledNode) return labeledNode.id;
    const duplicateCommand = message.match(/^Slash command \/(.+?) is defined more than once/);
    if (duplicateCommand) return nodes.find((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === duplicateCommand[1].toLowerCase())?.id;
    if (message === 'Node IDs must be unique.') {
      const seen = new Set();
      for (const node of nodes) {
        if (seen.has(node.id)) return node.id;
        seen.add(node.id);
      }
      return undefined;
    }
    if (message.startsWith('A connection')) {
      const invalidWire = connections.find((wire) => {
        const source = nodeById.get(wire.sourceNodeId);
        const target = nodeById.get(wire.targetNodeId);
        if (!source || !target) return message.includes('missing node');
        const sourcePin = graphPin(source, 'outputs', wire.sourcePinId, variableById, graphLookup, connections);
        const targetPin = graphPin(target, 'inputs', wire.targetPinId, variableById, graphLookup, connections);
        if (!sourcePin || !targetPin) return message.includes('missing node pin');
        return message.includes('incompatible pin types') && sourcePin.type !== targetPin.type && sourcePin.type !== 'any' && targetPin.type !== 'any' && sourcePin.type !== 'arg' && targetPin.type !== 'arg';
      });
      return nodeById.get(invalidWire?.targetNodeId)?.id || nodeById.get(invalidWire?.sourceNodeId)?.id;
    }
    const variableName = message.match(/^Variable name “(.*)” is used more than once\.$/)?.[1];
    const missingVariableName = message === 'Every graph variable needs a name.';
    if (variableName !== undefined || missingVariableName) {
      const variable = graphVariables.find((item) => missingVariableName ? !String(item.name || '').trim() : item.name === variableName);
      return nodes.find((node) => ['variable_get', 'variable_set'].includes(node.type) && node.data?.variableId === variable?.id)
        ?.id || nodes.find((node) => node.type === 'variable_create' && `nodevar_${node.id}` === variable?.id)?.id;
    }
    if (message === 'Graphs cannot call themselves, directly or indirectly.') return nodes.find((node) => node.type === 'function_call' && node.data?.graphId === graph.id)?.id;
    return undefined;
  };
  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set(warnings)];
  const errorNodeIds = Object.fromEntries(uniqueErrors.map((message) => [message, locateNodeId(message)]).filter(([, nodeId]) => nodeId));
  const warningNodeIds = Object.fromEntries(uniqueWarnings.map((message) => [message, locateNodeId(message)]).filter(([, nodeId]) => nodeId));
  return { errors: uniqueErrors, warnings: uniqueWarnings, errorNodeIds, warningNodeIds };
}

function isPureFunctionNode(type) {
  return !String(type).startsWith('event_');
}

function functionGraphHasEffects(graph, graphLookup, visited = new Set()) {
  if (!graph || visited.has(graph.id)) return false;
  visited.add(graph.id);
  for (const node of graph.nodes || []) {
    if (String(node.type).startsWith('action_')) return true;
    if (node.type === 'function_call' && functionGraphHasEffects(graphLookup?.get(node.data?.graphId), graphLookup, visited)) return true;
  }
  return false;
}

function hasFunctionCycle(graph, graphLookup, active = new Set(), visited = new Set()) {
  if (active.has(graph.id)) return true;
  if (visited.has(graph.id)) return false;
  active.add(graph.id);
  for (const node of graph.nodes || []) {
    if (node.type !== 'function_call') continue;
    const target = graphLookup.get(node.data?.graphId);
    if (target && hasFunctionCycle(target, graphLookup, active, visited)) return true;
  }
  active.delete(graph.id);
  visited.add(graph.id);
  return false;
}

function graphPin(node, direction, pinId, variables, graphLookup = null, connections = []) {
  const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
  if (!definition) return null;
  const dynamicPins = resolveDynamicNodePins(definition, node, connections);
  const resolvedDynamicPin = dynamicPins?.[direction]?.find((pin) => pin.id === pinId);
  if (resolvedDynamicPin) return resolvedDynamicPin;
  if (node.type === 'event_slash_command' && direction === 'outputs' && pinId.startsWith('option_')) {
    const option = flattenSlashParameters(node.data?.options).find((item) => item.pinId === pinId)?.option;
    if (option) return { id: pinId, type: ({ 4: 'number', 10: 'number', 5: 'boolean', 11: 'object' })[Number(option.type)] || 'string' };
  }
  const variablePinType = (variable) => ['array', 'object', 'attachment'].includes(variable?.type) ? 'object' : variable?.type || 'string';
  const resolveReferencedVariable = (target, seen = new Set()) => {
    if (!target || seen.has(target.id)) return null;
    const nextSeen = new Set(seen).add(target.id);
    const wire = connections.find((item) => item.targetNodeId === target.id && item.targetPinId === 'variable');
    if (wire) {
      const source = [...variables.values()].find((item) => item.sourceNodeId === wire.sourceNodeId);
      if (source) return source;
      const sourceNode = graphLookup?.get(wire.sourceNodeId);
      if (sourceNode?.type === 'variable_create') return variables.get(`nodevar_${sourceNode.id}`) || null;
      if (sourceNode && ['variable_get', 'variable_set'].includes(sourceNode.type)) return resolveReferencedVariable(sourceNode, nextSeen) || variables.get(sourceNode.data?.variableId) || null;
    }
    return variables.get(target.data?.variableId) || null;
  };
  if (node.type === 'variable_get' && direction === 'outputs') {
    if (pinId === 'variable') return { id: 'variable', type: 'variable' };
    const variable = resolveReferencedVariable(node);
    return variable && pinId === 'value' ? { id: 'value', type: variablePinType(variable) } : null;
  }
  if (node.type === 'variable_set' && direction === 'inputs') {
    if (pinId === 'variable') return { id: 'variable', type: 'variable' };
    const variable = resolveReferencedVariable(node);
    if (pinId === 'value' && variable) return { id: 'value', type: variablePinType(variable) };
  }
  if (node.type === 'variable_set' && direction === 'outputs' && pinId === 'variable') return { id: 'variable', type: 'variable' };
  if (node.type === 'variable_create') {
    if (direction === 'inputs' && pinId === 'value') return { id: 'value', type: 'arg' };
    if (direction === 'outputs' && pinId === 'variable') return { id: 'variable', type: 'variable' };
    const variable = variables.get(`nodevar_${node.id}`);
    if (direction === 'outputs' && pinId === 'value') return { id: 'value', type: variable ? variablePinType(variable) : 'arg' };
  }
  if (node.type === 'function_input' && direction === 'outputs') {
    const argument = getFunctionInputArguments(node).find((item) => item.legacy ? pinId === 'value' : functionArgumentPinId(item) === pinId);
    if (argument) return { id: pinId, type: functionInputPinType(argument), semanticType: argument.valueType.endsWith('_id') || argument.valueType === 'interaction_token' ? argument.valueType : undefined };
  }
  if (node.type === 'function_return' && direction === 'inputs' && pinId === 'value') return { id: 'value', type: node.data?.valueType || 'number' };
  if (node.type === 'function_call') {
    const called = graphLookup?.get(node.data?.graphId);
    if (direction === 'inputs') {
      const parameter = getFunctionGraphArguments(called).find((item) => functionArgumentPinId(item) === pinId);
      if (parameter) return { id: pinId, type: functionInputPinType(parameter), semanticType: parameter.valueType.endsWith('_id') || parameter.valueType === 'interaction_token' ? parameter.valueType : undefined };
    } else if (direction === 'outputs' && pinId === 'result') {
      const returned = called?.nodes?.find((item) => item.type === 'function_return');
      return returned ? { id: 'result', type: returned.data?.valueType || 'number' } : null;
    }
  }
  if (direction === 'inputs') {
    const execPin = definition.inputs?.find((pin) => pin.type === 'exec');
    if (execPin) {
      if (pinId === execPin.id) return execPin;
      const match = /^(.+?)_(\d+)$/.exec(pinId);
      if (match?.[1] === execPin.id && Number(match[2]) >= 2) {
        const highestConnectedExec = connections.reduce((highest, wire) => {
          if (wire.targetNodeId !== node.id) return highest;
          if (wire.targetPinId === execPin.id) return Math.max(highest, 1);
          const connectedMatch = /^(.+?)_(\d+)$/.exec(wire.targetPinId);
          return connectedMatch?.[1] === execPin.id ? Math.max(highest, Number(connectedMatch[2])) : highest;
        }, 0);
        const dynamicExecCount = Math.min(16, Math.max(1, highestConnectedExec + 1));
        if (Number(match[2]) <= dynamicExecCount) return { ...execPin, id: pinId, label: `Exec ${match[2]}` };
      }
    }
  }
  let pins = definition[direction] || [];
  if (direction === 'inputs') pins = [...pins, ...getNodeTemplateInputPins(node, pins, [...variables.values()], connections)];
  if (node.type === 'format_text' && direction === 'inputs') {
    const slots = getTextTemplateSlots(node.data?.template).flatMap((name) => {
      if ([...variables.values()].some((variable) => variable.name?.toLowerCase() === name.toLowerCase())) return [];
      const argument = /^arg(\d+)$/i.exec(name);
      return argument ? [{ id: `arg_${argument[1]}`, type: 'arg' }] : [{ id: `slot_${name}`, type: 'arg' }];
    });
    pins = slots;
  }
  if (node.type === 'build_embed' && direction === 'inputs') {
    if (Array.isArray(node.data?.blocks)) {
      const pins = embedBlockPins(getEmbedBlocks(node.data), [...variables.values()]);
      return [...pins, ...getNodeArgumentPins(node, pins, connections)].find((pin) => pin.id === pinId) || null;
    }
    const fields = Array.isArray(node.data?.fields) ? node.data.fields : [];
    pins = [...pins, ...fields.flatMap((field) => [{ id: `field_${field.id}_name`, type: 'string' }, { id: `field_${field.id}_value`, type: 'string' }])];
  }
  if (direction === 'inputs') pins = [...pins, ...getNodeArgumentPins(node, pins, connections)];
  return pins.find((pin) => pin.id === pinId) || null;
}
