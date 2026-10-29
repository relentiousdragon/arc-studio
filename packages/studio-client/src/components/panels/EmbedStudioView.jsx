import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, MessageSquare, Layers, Save, Bot, Moon, Sun, Upload, X, Plus, ZoomIn } from 'lucide-react';
import { createEmbedBlock, EmbedNodeBuilder, getEmbedBlocks } from '../nodes/EmbedNodeBuilder.jsx';
import { CharacterLimit } from '../ui/Inputs.jsx';
import { createComponentRow, createMessageButton, createStringSelect, MessageComponentsBuilder, renderComponentEmoji, toDiscordComponents } from './MessageComponentsBuilder.jsx';
import { ComponentsV2Builder, createComponentsV2Block } from './ComponentsV2Builder.jsx';
import { TemplateSyntaxHelp } from '../ui/TemplateSyntaxHelp.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { CustomEmoji } from '../ui/CustomEmoji.jsx';
import { useStudioEscape } from './useStudioEscape.js';
import { onPageBlur } from '../../core/pageFocus.js';

const EMPTY_ATTACHMENTS = [];
const STUDIO_DIVIDER_WIDTH = 6;
const STUDIO_MIN_EDITOR_WIDTH = 300;
const STUDIO_MIN_PREVIEW_WIDTH = 320;
const STUDIO_SPLIT_SNAP_POINTS = [30, 50, 70];
const STUDIO_SPLIT_SNAP_DISTANCE_PX = 14;
const V2_CONTAINER_CHILD_TYPES = new Set(['action_row', 'section', 'text_display', 'media_gallery', 'file', 'separator']);

function findV2Block(nodes, targetId) {
  for (const block of nodes || []) {
    if (block.id === targetId) return block;
    const nested = findV2Block(block.children, targetId);
    if (nested) return nested;
  }
  return null;
}

function containsV2Block(block, targetId) {
  if (!block) return false;
  if (block.id === targetId) return true;
  return (block.children || []).some((child) => containsV2Block(child, targetId));
}

function extractV2Block(nodes, targetId) {
  let extracted = null;
  const remaining = [];
  for (const block of nodes || []) {
    if (block.id === targetId) {
      extracted = block;
      continue;
    }
    if (Array.isArray(block.children)) {
      const result = extractV2Block(block.children, targetId);
      if (result.block) extracted = result.block;
      remaining.push(result.block ? { ...block, children: result.nodes } : block);
    } else remaining.push(block);
  }
  return { nodes: remaining, block: extracted };
}

function getV2ContainerId(nodes, targetId, parentId = null) {
  for (const block of nodes || []) {
    if (block.id === targetId) return parentId;
    const nestedParent = getV2ContainerId(block.children, targetId, block.id);
    if (nestedParent !== null) return nestedParent;
  }
  return null;
}

function insertV2Block(nodes, parentId, block, markerId = null, placement = 'end') {
  if (!parentId) {
    const markerIndex = markerId ? nodes.findIndex((item) => item.id === markerId) : -1;
    const index = markerIndex < 0 ? nodes.length : markerIndex + (placement === 'after' ? 1 : 0);
    return [...nodes.slice(0, index), block, ...nodes.slice(index)];
  }
  return nodes.map((item) => {
    if (item.id === parentId) {
      const children = Array.isArray(item.children) ? item.children : [];
      const markerIndex = markerId ? children.findIndex((child) => child.id === markerId) : -1;
      const index = markerIndex < 0 ? children.length : markerIndex + (placement === 'after' ? 1 : 0);
      return { ...item, children: [...children.slice(0, index), block, ...children.slice(index)] };
    }
    return Array.isArray(item.children) ? { ...item, children: insertV2Block(item.children, parentId, block, markerId, placement) } : item;
  });
}

function moveV2Block(nodes, blockId, marker) {
  if (marker?.id === blockId) return nodes;
  const source = findV2Block(nodes, blockId);
  if (!source) return nodes;
  const destinationParentId = marker?.placement === 'inside' ? marker.id : marker?.containerId ?? (marker?.id ? getV2ContainerId(nodes, marker.id) : null);
  if (destinationParentId && (!V2_CONTAINER_CHILD_TYPES.has(source.type) || containsV2Block(source, destinationParentId))) return nodes;
  const { nodes: remaining, block } = extractV2Block(nodes, blockId);
  if (!block) return nodes;
  const destination = destinationParentId ? findV2Block(remaining, destinationParentId)?.children : remaining;
  if (!Array.isArray(destination)) return nodes;
  const maxItems = destinationParentId ? 10 : 40;
  if (destination.length >= maxItems) return nodes;
  const markerId = marker?.placement === 'inside' ? null : marker?.id || null;
  const placement = marker?.placement === 'inside' ? 'end' : marker?.placement || 'end';
  return insertV2Block(remaining, destinationParentId, block, markerId, placement);
}
//
function PreviewImage({ src, className, alt, placeholderText = 'Image unavailable', onClick, onContextMenu, onLoad, onError, title, style, blockId, dragScope = 'embed', onDragStart, onDragEnd }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const dragProps = blockId ? { draggable: true, 'data-preview-block-id': blockId, 'data-preview-scope': dragScope, onDragStart, onDragEnd } : {};
  if (!src || failed) return <div {...dragProps} className={`${className} is-placeholder`} style={style} role="img" aria-label={alt} title={title} onClick={onClick} onContextMenu={onContextMenu}><ImageIcon size={18} aria-hidden="true" /><span>{placeholderText}</span></div>;
  return <img {...dragProps} className={className} style={style} src={src} alt={alt} referrerPolicy="no-referrer" onLoad={onLoad} onError={(event) => { onError?.(event); setFailed(true); }} onClick={onClick} onContextMenu={onContextMenu} title={title} />;
}

function updateGalleryCropState(button) {
  const image = button?.querySelector('.discord-v2-gallery-image');
  if (!image || !image.naturalWidth || !image.naturalHeight || !image.clientWidth || !image.clientHeight) {
    if (button) {
      button.dataset.galleryCropped = 'false';
      button.dataset.galleryImageAvailable = 'false';
    }
    return false;
  }
  button.dataset.galleryImageAvailable = 'true';
  const singleImageGallery = button.closest('.discord-v2-gallery.is-count-1');
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const displayRatio = image.clientWidth / image.clientHeight;
  const cropped = !singleImageGallery && Math.abs(Math.log(sourceRatio / displayRatio)) > 0.025;
  button.dataset.galleryCropped = cropped ? 'true' : 'false';
  return cropped;
}

function PreviewRemoveButton({ label, disabled = false, disabledTitle = 'Disconnect this block’s wires before removing it', onClick, warning, onWarningClick }) {
  const removeButton = <button type="button" className="studio-preview-remove-button" aria-label={`Remove ${label}`} title={disabled ? disabledTitle : `Remove ${label}`} disabled={disabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick?.(); }}><X size={13} /></button>;
  if (!warning) return removeButton;
  const message = typeof warning === 'string' ? warning : warning.message;
  return <span className="studio-preview-block-controls has-warning">
    <button type="button" className="studio-preview-warning-button" aria-label={`Go to warning: ${message}`} title={`Go to warning: ${message}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onWarningClick?.(); }}><AlertTriangle size={13} /></button>
    {removeButton}
  </span>;
}

export function renderDiscordFormattedText(text) {
  if (!text) return null;
  const str = String(text);
  const templateLiterals = [];
  const templateMarker = /\uE000(\d+)\uE001/g;
  const renderPlainText = (value) => {
    const nodes = [];
    let cursor = 0;
    let marker;
    templateMarker.lastIndex = 0;
    while ((marker = templateMarker.exec(value)) !== null) {
      if (marker.index > cursor) nodes.push(value.slice(cursor, marker.index));
      nodes.push(templateLiterals[Number(marker[1])] ?? marker[0]);
      cursor = templateMarker.lastIndex;
    }
    if (cursor < value.length) nodes.push(value.slice(cursor));
    return nodes;
  };
  const renderMarkdown = (value, key = 'md') => {
    value = value.replace(/(?<!\\)\{\{\s*[^{}]+?\s*\}\}/g, (literal) => {
      const index = templateLiterals.push(literal) - 1;
      return `\uE000${index}\uE001`;
    });
    const tokenPattern = /(\*\*\*[^*\n]+\*\*\*|___[^_\n]+___|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\|\|[^|\n]+\|\||`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*(?!\s)[^*\n]+\*(?!\*)|_(?!\s)[^_\n]+_(?!_))/g;
    const nodes = [];
    let cursor = 0;
    let token;
    while ((token = tokenPattern.exec(value)) !== null) {
      if (token.index > cursor) nodes.push(...renderPlainText(value.slice(cursor, token.index)));
      const raw = token[0];
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(raw);
      if (link) {
        if (value[token.index - 1] === '!') {
          nodes.push(raw);
          cursor = tokenPattern.lastIndex;
          continue;
        }
        let href = '';
        try { const parsed = new URL(link[2]); if (['http:', 'https:'].includes(parsed.protocol)) href = parsed.href; } catch { /* Leave malformed links as text. */ }
        nodes.push(href ? <a key={`${key}_${token.index}`} href={href} target="_blank" rel="noreferrer">{link[1]}</a> : raw);
        cursor = tokenPattern.lastIndex;
        continue;
      }
      const isBoldItalic = raw.startsWith('***') || raw.startsWith('___');
      const inner = isBoldItalic ? raw.slice(3, -3) : raw.startsWith('**') || raw.startsWith('__') || raw.startsWith('~~') || raw.startsWith('||') ? raw.slice(2, -2) : raw.slice(1, -1);
      const child = isBoldItalic ? <strong key={`${key}_${token.index}`}><em>{renderMarkdown(inner, `${key}_${token.index}`)}</em></strong>
        : raw.startsWith('**') ? <strong key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</strong>
        : raw.startsWith('__') ? <u key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</u>
          : raw.startsWith('~~') ? <s key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</s>
            : raw.startsWith('||') ? <span className="discord-spoiler" key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</span>
              : raw.startsWith('`') ? <code key={`${key}_${token.index}`}>{inner}</code>
                : raw.startsWith('*') ? <em key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</em>
                  : <em key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</em>;
      nodes.push(child);
      cursor = tokenPattern.lastIndex;
    }
    if (cursor < value.length) nodes.push(...renderPlainText(value.slice(cursor)));
    return nodes;
  };
  const renderLines = (value, key = 'line') => value.split('\n').map((line, index) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const subtext = /^-#\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    const content = heading?.[2] || subtext?.[1] || quote?.[1] || line;
    const formatted = renderMarkdown(content, `${key}_${index}`);
    if (heading) return <React.Fragment key={`${key}_${index}`}><strong className={`discord-markdown-heading level-${heading[1].length}`}>{formatted}</strong>{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
    if (subtext) return <React.Fragment key={`${key}_${index}`}><small className="discord-markdown-subtext">{formatted}</small>{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
    if (quote) return <React.Fragment key={`${key}_${index}`}><span className="discord-markdown-quote">{formatted}</span>{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
    return <React.Fragment key={`${key}_${index}`}>{formatted}{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
  });
  const customEmojiRegex = /<(a?):([a-zA-Z0-9_]+):([0-9]+)>/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = customEmojiRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderLines(str.slice(lastIndex, match.index), `text_${match.index}`));
    }
    const isAnimated = match[1] === 'a';
    const name = match[2];
    const id = match[3];
    const ext = isAnimated ? 'gif' : 'webp';
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;

    parts.push(<CustomEmoji key={`emoji_${id}_${match.index}`} className="discord-custom-emoji" src={url} alt={`:${name}:`} />);
    lastIndex = customEmojiRegex.lastIndex;
  }

  if (lastIndex < str.length) {
    parts.push(...renderLines(str.slice(lastIndex), 'text_tail'));
  }

  return parts;
}
//
export function EmbedStudioView({
  name,
  content = '',
  blocks = [],
  wiredFields = {},
  hasParentNode = false,
  attachments = EMPTY_ATTACHMENTS,
  components = [],
  componentsV2Layout = [],
  componentsV2Enabled = false,
  canEnableComponentsV2 = false,
  componentsV2DisabledReason = '',
  isComponentsBuilderNode = false,
  componentsOnly = false,
  assetNameEditable = false,
  initialTab = '',
  isContentWired = false,
  isEmbedWired = false,
  isComponentsWired = false,
  contentSourceLabel = '',
  embedSourceLabel = '',
  componentsSourceLabel = '',
  appEmojis = [],
  graphVariables = [],
  templateValuePaths = [],
  templatePreviewValues = {},
  templateSuggestions = [],
  botProfile = null,
  botStatus = 'DISCONNECTED',
  theme = 'dark',
  collaborators = [],
  onNameChange,
  onContentChange,
  onBlocksChange,
  onAttachmentsChange,
  onOpenTextStudio,
  onActiveTabChange,
  onComponentsChange,
  onComponentsV2LayoutChange,
  onEnableComponentsV2,
  onSave,
  onSaveAs,
  onSaveComponentsV2As,
  onClose,
  saveLabel = 'Save embed',
  saveAsLabel = 'Save to library',
  showSaveAs = true,
  showSave = true
}) {
  const previewMessageTime = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const [activeTab, setActiveTab] = useState(initialTab || (componentsOnly ? 'components' : 'embed'));
  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const [focusedEmbedBlockId, setFocusedEmbedBlockId] = useState(null);
  const [focusedV2BlockId, setFocusedV2BlockId] = useState(null);
  const [focusedV2ItemId, setFocusedV2ItemId] = useState(null);
  const [focusedV2SectionItem, setFocusedV2SectionItem] = useState(null);
  const [focusedComponentRowId, setFocusedComponentRowId] = useState(null);
  const [editorPanePercent, setEditorPanePercent] = useState(() => {
    const saved = Number(localStorage.getItem('arc_message_studio_split'));
    return Number.isFinite(saved) && saved >= 25 && saved <= 75 ? saved : 50;
  });
  const [expandedSelectMenuId, setExpandedSelectMenuId] = useState(null);
  const [selectedMenuValues, setSelectedMenuValues] = useState({});
  const [previewTheme, setPreviewTheme] = useState(() => (theme === 'light' ? 'light' : 'dark'));
  const [attachedFiles, setAttachedFiles] = useState(attachments);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [attachmentStatuses, setAttachmentStatuses] = useState([]);
  const [attachmentStatusesExpanded, setAttachmentStatusesExpanded] = useState(false);
  const [thumbnailContextMenu, setThumbnailContextMenu] = useState(null);
  const [v2ContainerContextMenu, setV2ContainerContextMenu] = useState(null);
  const [galleryViewer, setGalleryViewer] = useState(null);
  const [galleryClosing, setGalleryClosing] = useState(false);
  const [galleryZoom, setGalleryZoom] = useState(null);
  const [galleryShiftHeld, setGalleryShiftHeld] = useState(false);
  const [revealedGallerySpoilers, setRevealedGallerySpoilers] = useState(() => new Set());
  const [revealedContainerSpoilers, setRevealedContainerSpoilers] = useState(() => new Set());
  const [previewDropTarget, setPreviewDropTarget] = useState(null);
  const [studioBodyWidth, setStudioBodyWidth] = useState(0);
  const previewDragRef = useRef(null);
  const studioBodyRef = useRef(null);
  const resizingStudioRef = useRef(false);
  const activeStudioSnapRef = useRef(null);
  const v2ContainerContextMenuRef = useRef(null);
  const attachmentStatusCollapseTimerRef = useRef(null);
  const galleryCloseTimerRef = useRef(null);
  const completedFirstAttachmentBatchRef = useRef(false);
  useEffect(() => {
    const gallerySpoilerKeys = new Set();
    const containerSpoilerIds = new Set();
    const visitSpoilers = (blocks) => {
      for (const block of blocks || []) {
        if (block.type === 'container' && block.spoiler) containerSpoilerIds.add(block.id);
        if (block.type === 'media_gallery') {
          (block.items || []).forEach((item, index) => {
            if (item.spoiler) gallerySpoilerKeys.add(`${block.id}:${index}:${item.url || ''}`);
          });
        }
        visitSpoilers(block.children);
      }
    };
    visitSpoilers(componentsV2Layout);
    const retainCurrent = (current, allowed) => {
      const next = new Set([...current].filter((key) => allowed.has(key)));
      return next.size === current.size ? current : next;
    };
    setRevealedGallerySpoilers((current) => retainCurrent(current, gallerySpoilerKeys));
    setRevealedContainerSpoilers((current) => retainCurrent(current, containerSpoilerIds));
  }, [componentsV2Layout]);
  const openGalleryViewer = useCallback((blockId, index) => {
    window.clearTimeout(galleryCloseTimerRef.current);
    setGalleryClosing(false);
    setGalleryViewer({ blockId, index });
  }, []);
  const closeGalleryViewer = useCallback(() => {
    if (!galleryViewer || galleryClosing) return;
    setGalleryClosing(true);
    window.clearTimeout(galleryCloseTimerRef.current);
    galleryCloseTimerRef.current = window.setTimeout(() => {
      setGalleryViewer(null);
      setGalleryClosing(false);
    }, 180);
  }, [galleryClosing, galleryViewer]);
  useEffect(() => {
    const body = studioBodyRef.current;
    if (!body) return undefined;
    const updateWidth = () => setStudioBodyWidth(body.getBoundingClientRect().width);
    updateWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);
  const availableStudioWidth = Math.max(0, studioBodyWidth - STUDIO_DIVIDER_WIDTH);
  const studioMinimumScale = studioBodyWidth > 0 ? Math.min(1, availableStudioWidth / (STUDIO_MIN_EDITOR_WIDTH + STUDIO_MIN_PREVIEW_WIDTH)) : 1;
  const studioEditorMinimumWidth = STUDIO_MIN_EDITOR_WIDTH * studioMinimumScale;
  const studioPreviewMinimumWidth = STUDIO_MIN_PREVIEW_WIDTH * studioMinimumScale;
  const studioEditorPercentRange = studioBodyWidth > 0 ? {
    min: studioEditorMinimumWidth / studioBodyWidth * 100,
    max: Math.max(studioEditorMinimumWidth / studioBodyWidth * 100, (studioBodyWidth - STUDIO_DIVIDER_WIDTH - studioPreviewMinimumWidth) / studioBodyWidth * 100)
  } : { min: 25, max: 75 };
  const visibleEditorPanePercent = Math.max(studioEditorPercentRange.min, Math.min(studioEditorPercentRange.max, editorPanePercent));
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const selectTab = (tab) => { setActiveTab(tab); onActiveTabChange?.(tab); };
  const previewDragData = (event) => {
    try { return JSON.parse(event.dataTransfer.getData('application/x-arc-studio-preview') || event.dataTransfer.getData('application/x-arc-studio-palette') || 'null'); }
    catch { return null; }
  };
  useEffect(() => {
    const onDragStart = (event) => {
      try {
        previewDragRef.current = JSON.parse(event.dataTransfer.getData('application/x-arc-studio-preview') || event.dataTransfer.getData('application/x-arc-studio-palette') || 'null');
      } catch { previewDragRef.current = null; }
    };
    const onDragEnd = () => { previewDragRef.current = null; };
    window.addEventListener('dragstart', onDragStart);
    window.addEventListener('dragend', onDragEnd);
    return () => {
      window.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('dragend', onDragEnd);
    };
  }, []);
  const previewDropPosition = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-preview-block-id]') : null;
    const container = event.target instanceof Element ? event.target.closest('[data-preview-container-id]') : null;
    if (!target) return { id: null, scope: previewDragRef.current?.scope || '', containerId: container?.dataset.previewContainerId || null, placement: 'end' };
    if (container && target.dataset.previewBlockId === container.dataset.previewContainerId) {
      return { id: container.dataset.previewContainerId, scope: target.dataset.previewScope || '', containerId: container.dataset.previewContainerId, placement: 'inside' };
    }
    const bounds = target.getBoundingClientRect();
    return { id: target.dataset.previewBlockId, scope: target.dataset.previewScope || '', containerId: container?.dataset.previewContainerId || null, placement: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' };
  };
  const getPreviewDropTarget = (event) => {
    const marker = previewDropPosition(event);
    const payload = previewDragRef.current || previewDragData(event);
    const sourceBlock = payload?.kind === 'move' && payload.scope === 'components-v2' ? findV2Block(componentsV2Layout, payload.id) : null;
    const movingContainerIntoContainer = (payload?.type === 'container' || sourceBlock?.type === 'container')
      && (marker.placement === 'inside' || marker.containerId);
    if (payload?.scope === 'components-v2' && movingContainerIntoContainer) return { ...marker, id: null, containerId: null, placement: 'end', disabled: true };
    if (payload?.kind === 'palette' && payload.scope === 'components' && ['button', 'select'].includes(payload.type) && marker.scope === 'components') {
      const row = components.find((item) => item.id === marker.id);
      const hasSelect = row?.components?.some((item) => ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(item.type));
      const canAdd = payload.type === 'button'
        ? row && !hasSelect && row.components.length < 5
        : row && row.components.length === 0;
      return { ...marker, placement: canAdd ? 'inside' : marker.placement, hint: canAdd ? `Add to Action row ${components.indexOf(row) + 1}` : 'Create a new Action row here' };
    }
    return marker;
  };
  const handlePreviewDragOver = (event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    const isPreviewDrag = types.includes('application/x-arc-studio-preview');
    const isPaletteDrag = types.includes('application/x-arc-studio-palette');
    if (!isPreviewDrag && !isPaletteDrag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isPreviewDrag ? 'move' : 'copy';
    let marker = getPreviewDropTarget(event);
    if (previewDragRef.current?.scope && marker.scope !== previewDragRef.current.scope) {
      marker = { id: null, scope: previewDragRef.current.scope, placement: 'end' };
    }
    if (marker.disabled) event.dataTransfer.dropEffect = 'none';
    setPreviewDropTarget((current) => current?.id === marker.id && current?.scope === marker.scope && current?.placement === marker.placement ? current : marker);
  };
  const startPreviewMove = (event, scope, id) => {
    event.stopPropagation();
    event.currentTarget.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    const payload = { kind: 'move', scope, id };
    previewDragRef.current = payload;
    event.dataTransfer.setData('application/x-arc-studio-preview', JSON.stringify(payload));
  };
  const endPreviewMove = (event) => {
    event.stopPropagation();
    event.currentTarget.classList.remove('is-dragging');
    previewDragRef.current = null;
    setPreviewDropTarget(null);
  };
  const movePreviewItem = (list, id, marker) => {
    const from = list.findIndex((item) => item.id === id);
    if (from < 0) return list;
    let to = marker?.id ? list.findIndex((entry) => entry.id === marker.id) : list.length;
    if (to < 0) to = list.length;
    if (marker?.id && marker.placement === 'after') to += 1;
    if (from < to) to -= 1;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
    return next;
  };
  const insertPreviewItem = (list, item, marker) => {
    const markerIndex = marker?.id ? list.findIndex((entry) => entry.id === marker.id) : -1;
    const index = markerIndex < 0 ? list.length : markerIndex + (marker.placement === 'after' ? 1 : 0);
    return [...list.slice(0, index), item, ...list.slice(index)];
  };
  const handlePreviewDrop = (event) => {
    const payload = previewDragData(event);
    if (!payload) return;
    event.preventDefault();
    const marker = getPreviewDropTarget(event);
    if (marker.disabled) {
      event.dataTransfer.dropEffect = 'none';
      setPreviewDropTarget(null);
      return;
    }
    const listScope = payload.scope;
    const targetMarker = marker?.scope === listScope ? marker : { ...marker, id: null, placement: 'end' };
    if (payload.kind === 'move') {
      if (payload.scope === 'components-v2') onComponentsV2LayoutChange?.((current) => moveV2Block(current, payload.id, targetMarker));
      else if (payload.scope === 'components') onComponentsChange?.((current) => movePreviewItem(current, payload.id, targetMarker));
      else onBlocksChange?.((current) => movePreviewItem(current, payload.id, targetMarker));
    } else if (payload.kind === 'palette' && payload.scope === 'components-v2') {
      const block = createComponentsV2Block(payload.type);
      const containerId = targetMarker.placement === 'inside' ? targetMarker.id : targetMarker.containerId;
      if (block) onComponentsV2LayoutChange?.((current) => {
        if (containerId) {
          const containerBlock = findV2Block(current, containerId);
          if (!V2_CONTAINER_CHILD_TYPES.has(block.type) || !containerBlock || containerBlock.type !== 'container' || (containerBlock.children || []).length >= 10) return current;
          return insertV2Block(current, containerId, block, targetMarker.placement === 'inside' ? null : targetMarker.id, targetMarker.placement);
        }
        return current.length < 40 ? insertPreviewItem(current, block, targetMarker) : current;
      });
      if (block && containerId) {
        setFocusedV2SectionItem(null);
        focusV2Block(containerId);
        setFocusedV2ItemId(block.id);
      } else if (block) {
        setFocusedV2SectionItem(null);
        setFocusedV2BlockId(block.id);
        setFocusedV2ItemId(block.id);
      }
    } else if (payload.kind === 'palette' && payload.scope === 'components') {
      if (payload.type === 'row') {
        const row = createComponentRow();
        onComponentsChange?.((current) => current.length < 5 ? insertPreviewItem(current, row, targetMarker) : current);
        if (components.length < 5) focusComponentRow(row.id);
      } else {
        const targetRow = targetMarker.id ? components.find((row) => row.id === targetMarker.id) : null;
        const targetIsSelect = targetRow?.components?.some((item) => ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(item.type));
        const canAddToTarget = payload.type === 'button'
          ? targetRow && !targetIsSelect && targetRow.components.length < 5
          : targetRow && targetRow.components.length === 0;
        const component = payload.type === 'button'
          ? createMessageButton('primary', `Button ${(canAddToTarget ? targetRow.components.length : 0) + 1}`)
          : createStringSelect();

        if (canAddToTarget) {
          onComponentsChange?.((current) => current.map((row) => row.id === targetRow.id
            ? { ...row, components: [...row.components, component] }
            : row));
          focusComponentRow(targetRow.id, component.id);
        } else {
          const row = createComponentRow();
          row.components = [component];
          onComponentsChange?.((current) => current.length < 5 ? insertPreviewItem(current, row, targetMarker) : current);
          if (components.length < 5) focusComponentRow(row.id, component.id);
        }
      }
    } else if (payload.kind === 'palette' && payload.scope === 'embed') {
      const block = createEmbedBlock(payload.type);
      onBlocksChange?.((current) => {
        const isRepeated = payload.type !== 'field' && current.some((item) => item.type === payload.type);
        const isFull = payload.type === 'field' && current.filter((item) => item.type === 'field').length >= 25;
        if (isRepeated || isFull || (payload.type === 'timestamp' && !current.some((item) => item.type === 'footer'))) return current;
        return insertPreviewItem(current, block, targetMarker);
      });
    }
    setPreviewDropTarget(null);
  };
  const previewBlockClass = (id, scope = '') => {
    const isSelected = scope === 'embed'
      ? activeTab === 'embed' && focusedEmbedBlockId === id
      : scope === 'components-v2'
        ? activeTab === 'components' && componentsV2Enabled && !((focusedV2SectionItem?.blockId === id)) && (focusedV2ItemId || focusedV2BlockId) === id
        : scope === 'components'
          ? activeTab === 'components' && !componentsV2Enabled && focusedComponentRowId === id
          : false;
    return `studio-preview-block${isSelected ? ' is-selected' : ''}${previewDropTarget?.id === id ? ` is-drop-${previewDropTarget.placement}` : ''}`;
  };
  const openButtonEditor = (target, button) => {
    if (target.scope === 'components-v2-accessory') {
      focusV2Block(target.blockId, { kind: 'accessory' });
      setSelectedComponentId(button?.id || null);
      return;
    }
    if (target.scope === 'components-v2') {
      focusV2Block(target.blockId);
      setSelectedComponentId(button.id);
      return;
    }
    focusComponentRow(target.rowId, button.id);
  };
  const openV2TextEditor = (blockId, textIndex = 0) => focusV2Block(blockId, { kind: 'text', index: textIndex });
  const initialDraftRef = React.useRef(JSON.stringify({ name, content, blocks, components, componentsV2Layout, componentsV2Enabled, attachments }));
  const closeStudio = () => {
    const currentDraft = JSON.stringify({ name, content, blocks, components, componentsV2Layout, componentsV2Enabled, attachments: attachedFiles });
    if (currentDraft !== initialDraftRef.current) { setDiscardPromptOpen(true); return; }
    onClose?.();
  };
  useStudioEscape(closeStudio);

  useEffect(() => {
    setPreviewTheme(theme === 'light' ? 'light' : 'dark');
  }, [theme]);

  useEffect(() => {
    if (initialTab === 'embed' || initialTab === 'components') setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setAttachedFiles((current) => (attachments || []).map((file) => {
      const local = current.find((item) => String(item.filename || '').toLowerCase() === String(file.filename || '').toLowerCase());
      return { ...file, ...(file?.data ? {} : local?.data ? { data: local.data } : {}) };
    }));
  }, [attachments]);

  useEffect(() => {
    if (!thumbnailContextMenu) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && event.target instanceof Element && event.target.closest('.embed-thumbnail-context-menu')) return;
      setThumbnailContextMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    const removePageBlurListener = onPageBlur(() => setThumbnailContextMenu(null));
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      removePageBlurListener();
    };
  }, [thumbnailContextMenu]);

  useEffect(() => {
    if (!v2ContainerContextMenu) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && event.target instanceof Node && v2ContainerContextMenuRef.current?.contains(event.target)) return;
      setV2ContainerContextMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    const removePageBlurListener = onPageBlur(() => setV2ContainerContextMenu(null));
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      removePageBlurListener();
    };
  }, [v2ContainerContextMenu]);

  useEffect(() => {
    if (!galleryViewer) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeGalleryViewer();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const gallery = findV2Block(componentsV2Layout, galleryViewer.blockId);
        const itemCount = gallery?.items?.length || 0;
        if (!itemCount) return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        setGalleryViewer((current) => current ? { ...current, index: (current.index + delta + itemCount) % itemCount } : current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeGalleryViewer, galleryViewer, componentsV2Layout]);

  useEffect(() => { setGalleryZoom(null); }, [galleryViewer?.blockId, galleryViewer?.index]);

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Shift') setGalleryShiftHeld(true); };
    const handleKeyUp = (event) => { if (event.key === 'Shift') setGalleryShiftHeld(false); };
    const clearShift = () => setGalleryShiftHeld(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearShift);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearShift);
    };
  }, []);

  useEffect(() => () => {
    window.clearTimeout(attachmentStatusCollapseTimerRef.current);
    window.clearTimeout(galleryCloseTimerRef.current);
  }, []);

  const toggleGalleryZoom = (event) => {
    if (galleryZoom?.blockId === galleryViewer?.blockId && galleryZoom?.index === galleryViewer?.index) {
      setGalleryZoom(null);
      return;
    }
    const image = event.currentTarget.querySelector('.discord-gallery-lightbox-image');
    const bounds = image?.getBoundingClientRect();
    const originX = bounds?.width ? Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)) : 50;
    const originY = bounds?.height ? Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)) : 50;
    setGalleryZoom({ blockId: galleryViewer.blockId, index: galleryViewer.index, originX, originY });
  };

  const handleGalleryZoomKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (galleryZoom?.blockId === galleryViewer?.blockId && galleryZoom?.index === galleryViewer?.index) setGalleryZoom(null);
    else setGalleryZoom({ blockId: galleryViewer.blockId, index: galleryViewer.index, originX: 50, originY: 50 });
  };

  const isBotConnected = botStatus === 'ONLINE' || Boolean(botProfile?.username);
  const botDisplayName = isBotConnected
    ? (botProfile?.application?.name || botProfile?.username || 'Bot')
    : 'Arc Studio';
  const botAvatarUrl = isBotConnected && botProfile?.id && botProfile?.avatar
    ? `https://cdn.discordapp.com/avatars/${botProfile.id}/${botProfile.avatar}.png?size=128`
    : '/arc.png';

  const items = getEmbedBlocks({ blocks });
  useEffect(() => {
    if (focusedEmbedBlockId && !items.some((block) => block.id === focusedEmbedBlockId)) setFocusedEmbedBlockId(null);
  }, [items, focusedEmbedBlockId]);
  useEffect(() => {
    if (focusedComponentRowId && !components.some((row) => row.id === focusedComponentRowId)) setFocusedComponentRowId(null);
  }, [components, focusedComponentRowId]);
  useEffect(() => {
    if (focusedV2BlockId && !componentsV2Layout.some((block) => block.id === focusedV2BlockId)) setFocusedV2BlockId(null);
  }, [componentsV2Layout, focusedV2BlockId]);
  useEffect(() => {
    if (focusedV2ItemId && !findV2Block(componentsV2Layout, focusedV2ItemId)) setFocusedV2ItemId(null);
  }, [componentsV2Layout, focusedV2ItemId]);
  useEffect(() => {
    if (!focusedV2SectionItem) return;
    const block = findV2Block(componentsV2Layout, focusedV2SectionItem.blockId);
    if (!block || block.type !== 'section') {
      setFocusedV2SectionItem(null);
      return;
    }
    const textCount = Array.isArray(block.texts) ? block.texts.length : 0;
    if (focusedV2SectionItem.kind === 'text' && textCount && focusedV2SectionItem.index >= textCount) {
      setFocusedV2SectionItem({ ...focusedV2SectionItem, index: textCount - 1 });
    }
  }, [componentsV2Layout, focusedV2SectionItem]);
  const wireFor = (block, key) => wiredFields?.[`block_${block?.id}_${key}`] || null;
  const previewItems = items.map((block) => {
    const preview = { ...block };
    const keys = block.type === 'title' || block.type === 'description' || block.type === 'color' || block.type === 'timestamp' ? ['value']
      : block.type === 'field' ? ['name', 'value']
        : block.type === 'author' ? ['name', 'url', 'icon']
          : block.type === 'footer' ? ['text', 'icon']
            : ['image', 'thumbnail', 'url'].includes(block.type) ? ['url'] : [];
    for (const key of keys) {
      const wire = wireFor(block, key);
      if (wire) preview[key] = wire.token;
    }
    if (block.type === 'timestamp' && wireFor(block, 'value')) preview.now = false;
    return preview;
  });
  const title = previewItems.find((block) => block.type === 'title')?.value;
  const description = previewItems.find((block) => block.type === 'description')?.value;
  const author = previewItems.find((block) => block.type === 'author');
  const footer = previewItems.find((block) => block.type === 'footer');
  const timestampBlock = footer ? previewItems.find((block) => block.type === 'timestamp') : null;
  const timestampWire = timestampBlock && wireFor(timestampBlock, 'value');
  const timestamp = timestampWire ? '' : timestampBlock?.now ? new Date().toISOString() : timestampBlock?.value;
  const timestampLabel = timestampWire?.token || (timestamp && !Number.isNaN(new Date(timestamp).getTime())
    ? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : '');
  const imageBlock = previewItems.find((block) => block.type === 'image');
  const thumbnailBlock = previewItems.find((block) => block.type === 'thumbnail');
  const imageWire = imageBlock && wireFor(imageBlock, 'url');
  const thumbnailWire = thumbnailBlock && wireFor(thumbnailBlock, 'url');
  const image = imageWire ? '' : imageBlock?.url;
  const thumbnail = thumbnailWire ? '' : thumbnailBlock?.url;
  const colorBlock = previewItems.find((block) => block.type === 'color');
  const colorWire = colorBlock && wireFor(colorBlock, 'value');
  const color = colorWire ? (items.find((block) => block.type === 'color')?.value || '#5865F2') : colorBlock ? (colorBlock.value || '') : '#5865F2';
  const fields = previewItems.filter((block) => block.type === 'field' && (block.name || block.value));
  
  const textCount = items.reduce((total, block) => {
    if (block.type === 'title' || block.type === 'description') return total + String(block.value || '').length;
    if (block.type === 'field') return total + String(block.name || '').length + String(block.value || '').length;
    if (block.type === 'author') return total + String(block.name || '').length;
    if (block.type === 'footer') return total + String(block.text || '').length;
    return total;
  }, 0);

  const validation = {};
  const setError = (block, key, message) => {
    validation[block.id] = { ...validation[block.id], [key]: message };
  };

  const validUrl = (value, allowAttachment = false) => {
    const normalized = String(value || '').trim();
    if (!normalized) return true;
    const withoutTemplates = normalized.replace(/\{\{[^{}]+\}\}/g, '');
    if (withoutTemplates !== normalized && !/[{}]/.test(withoutTemplates)) return true;
    if (allowAttachment && /^attachment:\/\/[^?#\r\n]{1,100}$/.test(normalized)) return true;
    try {
      return ['http:', 'https:'].includes(new URL(normalized).protocol);
    } catch {
      return false;
    }
  };

  for (const block of items) {
    if (block.type === 'field' && (block.name || block.value)) {
      if (!block.name) setError(block, 'name', 'Field name is required.');
      if (!block.value) setError(block, 'value', 'Field value is required.');
    }
    for (const key of ['url', 'icon']) {
      if (block[key] && ['url', 'image', 'thumbnail', 'author', 'footer'].includes(block.type) && !validUrl(block[key], ['image', 'thumbnail'].includes(block.type))) {
        setError(block, key, 'Enter an HTTP or HTTPS URL. For attached images, use attachment://filename.');
      }
    }
  }

  const componentErrors = [];
  const selectTypes = new Set(['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select']);
  const customIds = new Set();

  if (components.length > 5) componentErrors.push('Discord messages support up to 5 action rows.');

  components.slice(0, 5).forEach((row, rowIndex) => {
    const rowItems = Array.isArray(row.components) ? row.components : [];
    if (!rowItems.length) componentErrors.push(`Action row ${rowIndex + 1} needs a button or select menu.`);
    if (rowItems.length > 5) componentErrors.push(`Action row ${rowIndex + 1} supports up to 5 components.`);
    const select = rowItems.find((item) => selectTypes.has(item.type));
    if (select && (rowItems.length !== 1 || (rowItems.length && rowItems[0] !== select))) {
      componentErrors.push(`Action row ${rowIndex + 1}: a select menu must be the only component in its row.`);
    }

    rowItems.forEach((component, componentIndex) => {
      const label = `Row ${rowIndex + 1}, component ${componentIndex + 1}`;
      if (selectTypes.has(component.type)) {
        if (!String(component.customId || '').trim()) componentErrors.push(`${label}: enter a custom ID for the select menu.`);
        if (component.type === 'string_select') {
          if (!component.options?.length || component.options.length > 25) componentErrors.push(`${label}: add between 1 and 25 options.`);
          if (component.options?.some((option) => !String(option.label || '').trim() || !String(option.value || '').trim())) {
            componentErrors.push(`${label}: every option needs a label and value.`);
          }
          if (new Set((component.options || []).map((option) => option.value)).size !== (component.options || []).length) {
            componentErrors.push(`${label}: option values must be unique.`);
          }
          if ((component.options || []).length && Number(component.maxValues) > component.options.length) {
            componentErrors.push(`${label}: maximum selections cannot exceed the number of options.`);
          }
        }
        if (Number(component.minValues) > Number(component.maxValues)) {
          componentErrors.push(`${label}: minimum selections cannot exceed maximum selections.`);
        }
        const customId = String(component.customId || '').trim();
        if (customId && customIds.has(customId)) componentErrors.push(`${label}: custom IDs must be unique in the message.`);
        if (customId) customIds.add(customId);
      } else if (component.style === 'link') {
        if (!String(component.label || '').trim()) componentErrors.push(`${label}: enter a button label.`);
        if (!String(component.url || '').trim() || !validUrl(component.url)) componentErrors.push(`${label}: enter a valid HTTP or HTTPS URL.`);
      } else {
        if (!String(component.label || '').trim()) componentErrors.push(`${label}: enter a button label.`);
        const customId = String(component.customId || '').trim();
        if (!customId) componentErrors.push(`${label}: enter a custom ID for the button.`);
        if (customId && customIds.has(customId)) componentErrors.push(`${label}: custom IDs must be unique in the message.`);
        if (customId) customIds.add(customId);
      }
    });
  });

  const v2ComponentErrors = [];
  const v2ComponentIssues = [];
  const v2GlobalComponentErrors = [];
  const addV2Issue = (block, message, target = 'block', index = null) => {
    v2ComponentErrors.push(message);
    if (block?.id) v2ComponentIssues.push({ blockId: block.id, target, index, message });
    else v2GlobalComponentErrors.push(message);
  };
  const addV2GlobalError = (message) => {
    v2ComponentErrors.push(message);
    v2GlobalComponentErrors.push(message);
  };
  let v2ComponentCount = 0;
  let v2TextLength = 0;
  const validateV2 = (layout, location = 'Message') => {
    for (const [index, block] of (Array.isArray(layout) ? layout : []).entries()) {
      v2ComponentCount += 1;
      const blockTypeLabel = ({
        text_display: 'Text Display',
        section: 'Section',
        separator: 'Separator',
        media_gallery: 'Media Gallery',
        file: 'File',
        action_row: 'Action Row',
        container: 'Container'
      })[block.type] || 'Block';
      const label = location === 'Message'
        ? `${blockTypeLabel} ${index + 1}`
        : `${location} > ${blockTypeLabel} ${index + 1}`;
      if (block.type === 'text_display') {
        const text = String(block.content || '');
        v2TextLength += text.length;
        if (!text.trim()) addV2Issue(block, `${label} needs text.`);
        if (text.length > 4000) addV2Issue(block, `${label} exceeds 4,000 characters.`);
      }
      if (block.type === 'section') {
        v2ComponentCount += (block.texts || []).length + (block.accessory ? 1 : 0);
        for (const text of block.texts || []) v2TextLength += String(text || '').length;
        const sectionTexts = Array.isArray(block.texts) ? block.texts : [];
        const firstEmptyTextIndex = sectionTexts.findIndex((text) => !String(text || '').trim());
        if (sectionTexts.length < 1 || sectionTexts.length > 3 || firstEmptyTextIndex >= 0) {
          const invalidTextIndex = firstEmptyTextIndex >= 0 ? firstEmptyTextIndex : sectionTexts.length > 3 ? 3 : 0;
          addV2Issue(block, `${label} needs 1 to 3 nonempty text blocks.`, 'text', invalidTextIndex);
        }
        if (!['button', 'thumbnail'].includes(block.accessory?.type)) addV2Issue(block, `${label} needs a button or thumbnail accessory.`, 'accessory');
        if (block.accessory?.type === 'button' && block.accessory.style !== 'link' && !String(block.accessory.customId || '').trim()) addV2Issue(block, `${label} button needs a custom ID.`, 'accessory');
        if (block.accessory?.type === 'button' && block.accessory.style === 'link' && !validUrl(block.accessory.url)) addV2Issue(block, `${label} link button needs a valid URL.`, 'accessory');
        if (block.accessory?.type === 'thumbnail' && !String(block.accessory.url || '').trim()) addV2Issue(block, `${label} thumbnail needs an image URL.`, 'accessory');
      }
      if (block.type === 'media_gallery') {
        if (!block.items?.length || block.items.length > 10) addV2Issue(block, `${label} needs 1 to 10 media URLs.`);
        (block.items || []).forEach((item, itemIndex) => {
          if (!String(item.url || '').trim()) addV2Issue(block, `${label}, item ${itemIndex + 1}, needs a media URL.`, 'media', itemIndex);
        });
      }
      if (block.type === 'file' && !/^attachment:\/\/[^\s?#]{1,100}$/i.test(String(block.url || ''))) addV2Issue(block, `${label} needs an attachment:// file URL.`);
      if (block.type === 'action_row') {
        v2ComponentCount += (block.components || []).length;
        if (!block.components?.length || block.components.length > 5) addV2Issue(block, `${label} needs up to 5 controls.`);
        if (block.components.some((item) => ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(item.type) ? !String(item.customId || '').trim() : !String(item.label || '').trim() || (item.style === 'link' ? !validUrl(item.url) : !String(item.customId || '').trim()))) addV2Issue(block, `${label} controls need valid labels, custom IDs, or link URLs.`);
      }
      if (block.type === 'container' && block.children?.length > 10) addV2Issue(block, `${label} supports up to 10 child blocks.`);
      if (block.type === 'container') validateV2(block.children, label);
    }
  };
  if (componentsV2Enabled) {
    if (String(content || '').trim() || blocks.length || isContentWired || isEmbedWired) addV2GlobalError('Components V2 cannot include message content or embeds. Clear those values and wires first.');
    if (!componentsV2Layout.length) addV2GlobalError('Add at least one Components V2 block.');
    validateV2(componentsV2Layout);
    if (v2ComponentCount > 40) addV2GlobalError('A Components V2 message supports up to 40 components.');
    if (v2TextLength > 4000) addV2GlobalError('Text Display content across the message exceeds 4,000 characters.');
  }
  const selectedV2BlockId = focusedV2ItemId || focusedV2BlockId;
  const selectedV2Block = selectedV2BlockId ? findV2Block(componentsV2Layout, selectedV2BlockId) : null;
  const selectedV2BlockIds = new Set();
  const collectV2BlockIds = (block) => {
    if (!block?.id || selectedV2BlockIds.has(block.id)) return;
    selectedV2BlockIds.add(block.id);
    (block.children || []).forEach(collectV2BlockIds);
  };
  if (selectedV2Block) collectV2BlockIds(selectedV2Block);
  const visibleV2ComponentIssues = selectedV2BlockId
    ? v2ComponentIssues.filter((issue) => selectedV2BlockIds.has(issue.blockId))
    : v2ComponentIssues;
  const visibleV2GlobalErrors = selectedV2BlockId ? [] : v2GlobalComponentErrors;
  const hasValidationErrors = (!componentsV2Enabled && (textCount > 6000 || Object.keys(validation).length > 0 || componentErrors.length > 0)) || v2ComponentErrors.length > 0;
  const saveDisabledTitle = hasValidationErrors ? 'Fix the highlighted issues before saving.' : undefined;

  const safePreviewUrl = (value) => {
    const normalized = String(value || '').trim();
    if (!validUrl(normalized)) return '';
    try { return new URL(normalized).href; } catch { return ''; }
  };
  const attachmentName = (value) => /^attachment:\/\/(.+)$/.exec(String(value || ''))?.[1] || '';
  const thumbnailUrl = safePreviewUrl(thumbnail);
  const resolvePreviewImageSource = (value) => {
    const filename = attachmentName(value);
    if (filename) return attachedFiles.find((file) => String(file.filename || '').toLowerCase() === filename.toLowerCase())?.data || '';
    return safePreviewUrl(value);
  };
  const attachedImage = attachmentName(image);
  const attachedThumbnail = attachmentName(thumbnail);
  const titleUrlBlock = previewItems.find((block) => block.type === 'url');
  const titleUrlWire = titleUrlBlock && wireFor(titleUrlBlock, 'url');
  const titleLink = safePreviewUrl(titleUrlBlock?.url);
  const authorLink = safePreviewUrl(author?.url);
  const authorUrlWire = author && wireFor(author, 'url');
  const authorIconWire = author && wireFor(author, 'icon');
  const footerIconWire = footer && wireFor(footer, 'icon');

  const hasEmbedContent = Boolean(
    title || description || fields.length || author?.name || footer?.text || timestampLabel || thumbnailBlock ||
    safePreviewUrl(image) || safePreviewUrl(thumbnail) || attachedImage || attachedThumbnail || Object.keys(wiredFields || {}).length > 0
  );

  const focusEditorBlock = (blockOrType) => {
    selectTab('embed');
    setFocusedComponentRowId(null);
    setFocusedV2BlockId(null);
    setFocusedV2ItemId(null);
    setFocusedV2SectionItem(null);
    const block = typeof blockOrType === 'string' ? previewItems.find((item) => item.type === blockOrType) : blockOrType;
    setFocusedEmbedBlockId(block?.id || null);
    setTimeout(() => {
      const el = typeof blockOrType === 'string'
        ? document.querySelector(`.embed-subnode[data-embed-block-type="${blockOrType}"]`)
        : document.getElementById(`embed_block_${blockOrType?.id}`);
      if (el?.classList.contains('is-collapsed')) el.querySelector('.embed-subnode-header')?.click();
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const openEmbedTextEditor = (block, key, label, maxLength) => {
    focusEditorBlock(block);
    if (wireFor(block, key)) return;
  };

  const focusComponent = (componentId) => {
    selectTab('components');
    setFocusedEmbedBlockId(null);
    setFocusedV2BlockId(null);
    setFocusedV2ItemId(null);
    setFocusedV2SectionItem(null);
    setSelectedComponentId(componentId);
    const row = components.find((item) => item.components?.some((component) => component.id === componentId));
    setFocusedComponentRowId(row?.id || null);
  };

  const focusV2Block = (blockId, sectionItem = null) => {
    const findTopLevel = (nodes, targetId, parent = null) => {
      for (const block of nodes || []) {
        if (block.id === targetId) return parent || block;
        const nested = findTopLevel(block.children, targetId, parent || block);
        if (nested) return nested;
      }
      return null;
    };
    const topLevelBlock = findTopLevel(componentsV2Layout, blockId);
    if (!topLevelBlock) return;
    selectTab('components');
    setFocusedEmbedBlockId(null);
    setFocusedComponentRowId(null);
    setSelectedComponentId(null);
    setFocusedV2BlockId(topLevelBlock.id);
    setFocusedV2ItemId(blockId);
    setFocusedV2SectionItem(sectionItem ? { blockId, ...sectionItem } : null);
    setTimeout(() => window.dispatchEvent(new CustomEvent('arc-components-select-block', { detail: { id: blockId } })), 40);
  };

  const openV2ContainerContextMenu = (event, blockId) => {
    if (event.target instanceof Element && event.target.closest('.studio-preview-nested-block')) return;
    event.preventDefault();
    event.stopPropagation();
    setV2ContainerContextMenu({ x: event.clientX, y: event.clientY, blockId });
  };

  const isV2SectionItemSelected = (blockId, kind, index = null) => focusedV2SectionItem?.blockId === blockId
    && focusedV2SectionItem.kind === kind
    && (kind !== 'text' || focusedV2SectionItem.index === index);
  const getV2Issue = (blockId, target = 'block', index = null) => v2ComponentIssues.find((issue) => issue.blockId === blockId && issue.target === target && (index === null || issue.index === index))
    || (target === 'block' ? v2ComponentIssues.find((issue) => issue.blockId === blockId) : null)
    || null;
  const focusV2Issue = (issue) => {
    if (!issue) return;
    const sectionItem = issue.target === 'accessory' ? { kind: 'accessory' }
      : issue.target === 'text' ? { kind: 'text', index: issue.index ?? 0 }
        : issue.target === 'media' ? { kind: 'media', index: issue.index ?? 0 }
        : null;
    focusV2Block(issue.blockId, sectionItem);
    const targetId = issue.target === 'block' ? issue.blockId : `${issue.blockId}:${issue.target}${issue.index === null ? '' : `:${issue.index}`}`;
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('arc-components-focus-issue', { detail: { targetId } }));
      const target = [...(studioBodyRef.current?.querySelectorAll('[data-preview-validation-target]') || [])]
        .find((element) => element.dataset.previewValidationTarget === targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 100);
  };

  const focusComponentRow = (rowId, componentId = null) => {
    selectTab('components');
    setFocusedEmbedBlockId(null);
    setFocusedV2BlockId(null);
    setFocusedV2ItemId(null);
    setFocusedV2SectionItem(null);
    setFocusedComponentRowId(rowId);
    setSelectedComponentId(componentId);
  };
  const addButtonToRow = (rowId) => {
    const row = components.find((item) => item.id === rowId);
    const button = createMessageButton('primary', `Button ${(row?.components?.length || 0) + 1}`);
    onComponentsChange?.((current) => current.map((row) => row.id === rowId && row.components.length < 5
      ? { ...row, components: [...row.components, button] }
      : row));
    focusComponentRow(rowId, button.id);
  };
  const addV2ButtonToRow = (blockId) => {
    const row = findV2Block(componentsV2Layout, blockId);
    const button = createMessageButton('primary', `Button ${(row?.components?.length || 0) + 1}`);
    const appendToRow = (current) => (current || []).map((block) => {
      if (block.id === blockId && block.type === 'action_row' && (block.components || []).length < 5) {
        return { ...block, components: [...(block.components || []), button] };
      }
      return Array.isArray(block.children) ? { ...block, children: appendToRow(block.children) } : block;
    });
    onComponentsV2LayoutChange?.(appendToRow);
    focusV2Block(blockId);
    setSelectedComponentId(button.id);
  };
  const clearPreviewSelection = () => {
    setFocusedEmbedBlockId(null);
    setFocusedV2BlockId(null);
    setFocusedV2ItemId(null);
    setFocusedV2SectionItem(null);
    setFocusedComponentRowId(null);
    setSelectedComponentId(null);
  };
  const embedBlockHasWires = (blockId) => Object.keys(wiredFields || {}).some((pinId) => pinId.startsWith(`block_${blockId}_`));
  const removePreviewBlock = (scope, blockId) => {
    if (!blockId) return;
    if (scope === 'embed') {
      if (embedBlockHasWires(blockId)) return;
      onBlocksChange?.((current) => {
        const currentBlocks = Array.isArray(current) ? current : [];
        const removed = currentBlocks.find((block) => block.id === blockId);
        return currentBlocks.filter((block) => block.id !== blockId && !(removed?.type === 'footer' && block.type === 'timestamp'));
      });
    } else if (scope === 'components-v2') {
      const removeNested = (current) => (current || []).filter((block) => block.id !== blockId).map((block) => Array.isArray(block.children) ? { ...block, children: removeNested(block.children) } : block);
      onComponentsV2LayoutChange?.(removeNested);
    } else if (scope === 'components') {
      onComponentsChange?.((current) => current.filter((row) => row.id !== blockId));
    }
    clearPreviewSelection();
  };
  const removePreviewComponent = (scope, parentId, componentId, componentIndex = -1) => {
    if (!parentId || (scope !== 'components-v2-accessory' && !componentId && componentIndex < 0)) return;
    if (scope === 'components') {
      onComponentsChange?.((current) => current.map((row) => row.id === parentId
        ? { ...row, components: (row.components || []).filter((component, index) => componentId ? component.id !== componentId : index !== componentIndex) }
        : row));
      focusComponentRow(parentId);
    } else if (scope === 'components-v2') {
      const removeFromBlocks = (current) => (current || []).map((block) => {
        if (block.id === parentId && block.type === 'action_row') {
          return { ...block, components: (block.components || []).filter((component, index) => componentId ? component.id !== componentId : index !== componentIndex) };
        }
        return Array.isArray(block.children) ? { ...block, children: removeFromBlocks(block.children) } : block;
      });
      onComponentsV2LayoutChange?.(removeFromBlocks);
      focusV2Block(parentId);
    } else if (scope === 'components-v2-accessory') {
      const clearAccessory = (current) => (current || []).map((block) => {
        if (block.id === parentId && block.type === 'section') return { ...block, accessory: null };
        return Array.isArray(block.children) ? { ...block, children: clearAccessory(block.children) } : block;
      });
      onComponentsV2LayoutChange?.(clearAccessory);
      focusV2Block(parentId);
    }
  };
  const removeV2SectionText = (blockId, textIndex) => {
    const removeText = (current) => (current || []).map((block) => {
      if (block.id === blockId && block.type === 'section') return { ...block, texts: (block.texts || []).filter((_, index) => index !== textIndex) };
      return Array.isArray(block.children) ? { ...block, children: removeText(block.children) } : block;
    });
    onComponentsV2LayoutChange?.(removeText);
  };

  const studioSplitRange = () => {
    const bounds = studioBodyRef.current?.getBoundingClientRect();
    if (!bounds?.width) return null;
    const availableWidth = Math.max(0, bounds.width - STUDIO_DIVIDER_WIDTH);
    const minimumScale = Math.min(1, availableWidth / (STUDIO_MIN_EDITOR_WIDTH + STUDIO_MIN_PREVIEW_WIDTH));
    const minimumEditorWidth = STUDIO_MIN_EDITOR_WIDTH * minimumScale;
    const minimumPreviewWidth = STUDIO_MIN_PREVIEW_WIDTH * minimumScale;
    return {
      bounds,
      min: minimumEditorWidth / bounds.width * 100,
      max: Math.max(minimumEditorWidth / bounds.width * 100, (bounds.width - STUDIO_DIVIDER_WIDTH - minimumPreviewWidth) / bounds.width * 100)
    };
  };
  const splitPercentAt = (clientX) => {
    const range = studioSplitRange();
    if (!range) return null;
    return Math.max(range.min, Math.min(range.max, ((clientX - range.bounds.left) / range.bounds.width) * 100));
  };
  const saveStudioSplit = (percent) => {
    setEditorPanePercent(percent);
    localStorage.setItem('arc_message_studio_split', String(percent));
  };
  const getStudioSplitSnap = (clientX) => {
    const range = studioSplitRange();
    const raw = splitPercentAt(clientX);
    if (raw === null || !range) return null;
    const snaps = [...STUDIO_SPLIT_SNAP_POINTS, range.min, range.max]
      .filter((point) => point >= range.min && point <= range.max);
    const activeSnap = activeStudioSnapRef.current;
    if (activeSnap !== null && snaps.includes(activeSnap)) {
      const distance = Math.abs(activeSnap - raw) * range.bounds.width / 100;
      if (distance <= STUDIO_SPLIT_SNAP_DISTANCE_PX * 1.5) return activeSnap;
    }
    const nearest = snaps.reduce((best, point) => (
      Math.abs(point - raw) < Math.abs(best - raw) ? point : best
    ), snaps[0] ?? raw);
    return Math.abs(nearest - raw) * range.bounds.width / 100 <= STUDIO_SPLIT_SNAP_DISTANCE_PX
      ? nearest
      : null;
  };
  const updateStudioSplit = (clientX) => {
    const next = splitPercentAt(clientX);
    if (next === null) return;
    const snap = getStudioSplitSnap(clientX);
    activeStudioSnapRef.current = snap;
    setEditorPanePercent(snap ?? next);
  };
  const snapStudioSplit = (clientX) => {
    const raw = splitPercentAt(clientX);
    const range = studioSplitRange();
    if (raw === null || !range) return;
    const snaps = [...STUDIO_SPLIT_SNAP_POINTS, range.min, range.max]
      .filter((point) => point >= range.min && point <= range.max);
    const snapped = snaps.reduce((nearest, point) => Math.abs(point - raw) < Math.abs(nearest - raw) ? point : nearest, snaps[0] ?? raw);
    saveStudioSplit(snapped);
  };
  const updateStudioSplitFromKeyboard = (direction) => {
    const range = studioSplitRange();
    if (!range) return;
    const snaps = [...STUDIO_SPLIT_SNAP_POINTS, range.min, range.max]
      .filter((point) => point >= range.min && point <= range.max)
      .sort((a, b) => a - b);
    const next = direction > 0
      ? snaps.find((point) => point > editorPanePercent + 0.5) ?? range.max
      : [...snaps].reverse().find((point) => point < editorPanePercent - 0.5) ?? range.min;
    saveStudioSplit(next);
  };
  const onStudioDividerPointerDown = (event) => {
    if (window.matchMedia('(max-width: 720px)').matches) return;
    event.preventDefault();
    resizingStudioRef.current = true;
    activeStudioSnapRef.current = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateStudioSplit(event.clientX);
  };
  const onStudioDividerPointerMove = (event) => {
    if (resizingStudioRef.current) updateStudioSplit(event.clientX);
  };
  const stopStudioResize = (event) => {
    if (!resizingStudioRef.current) return;
    resizingStudioRef.current = false;
    activeStudioSnapRef.current = null;
    snapStudioSplit(event.clientX);
  };

  const v2EmptyBlock = (message, hint = 'Select this block to edit it') => <div className="discord-v2-empty-block is-interactive"><span>{message}</span><small>{hint}</small></div>;
  const renderV2Block = (block, key) => {
    if (block.type === 'text_display') return String(block.content || '').trim()
      ? <div className="discord-v2-text is-interactive" key={key} title="Click to edit text" onClick={() => openV2TextEditor(block.id)}>{renderDiscordFormattedText(block.content)}</div>
      : v2EmptyBlock('Empty text block');
    if (block.type === 'separator') return <div className={`discord-v2-separator is-interactive spacing-${block.spacing === 2 ? 'large' : 'small'}`} key={key} title="Click to select separator"><span /></div>;
    if (block.type === 'section') return <div className="discord-v2-section" key={key}>
      <div className="discord-v2-section-copy">
        {(block.texts?.length ? block.texts : ['']).map((text, index) => {
          const issue = getV2Issue(block.id, 'text', index);
          return <div className={`discord-v2-section-item ${isV2SectionItemSelected(block.id, 'text', index) ? 'is-selected' : ''}`} data-preview-validation-target={`${block.id}:text:${index}`} key={`${key}_text_${index}`} title="Click to edit this section text" onClick={(event) => { event.stopPropagation(); openV2TextEditor(block.id, index); }}>{String(text || '').trim() ? <div className="discord-v2-text is-interactive">{renderDiscordFormattedText(text)}</div> : v2EmptyBlock(`Empty text ${index + 1}`)}{issue && <PreviewRemoveButton label={`section text ${index + 1}`} warning={issue} disabled={(block.texts || []).length <= 1} disabledTitle="A section must keep at least one text block" onWarningClick={() => focusV2Issue(issue)} onClick={() => removeV2SectionText(block.id, index)} />}</div>;
        })}
      </div>
      <div className={`discord-v2-accessory discord-v2-section-item ${isV2SectionItemSelected(block.id, 'accessory') && block.accessory?.type !== 'button' ? 'is-selected' : ''}`} data-preview-validation-target={`${block.id}:accessory`} onClick={(event) => { event.stopPropagation(); focusV2Block(block.id, { kind: 'accessory' }); }}>
        {block.accessory?.type === 'thumbnail' ? <><PreviewImage src={resolvePreviewImageSource(block.accessory.url)} className="discord-v2-thumbnail is-interactive" alt={block.accessory.description || 'Section thumbnail'} placeholderText="Thumbnail unavailable" title="Click to edit section accessory" /><PreviewRemoveButton label="section thumbnail" warning={getV2Issue(block.id, 'accessory')} onWarningClick={() => focusV2Issue(getV2Issue(block.id, 'accessory'))} onClick={() => removePreviewComponent('components-v2-accessory', block.id)} /></>
          : block.accessory?.type === 'button' ? <div className={`discord-preview-component-wrap ${selectedComponentId === block.accessory.id || isV2SectionItemSelected(block.id, 'accessory') ? 'is-selected' : ''}`}><button type="button" className={`discord-message-btn is-style-${block.accessory?.style || 'primary'}`} onClick={(event) => { event.stopPropagation(); openButtonEditor({ scope: 'components-v2-accessory', blockId: block.id }, block.accessory); }} onContextMenu={(event) => { event.preventDefault(); openButtonEditor({ scope: 'components-v2-accessory', blockId: block.id }, block.accessory); }}>{renderDiscordFormattedText(block.accessory?.label || 'Button')}</button><PreviewRemoveButton label="section button" warning={getV2Issue(block.id, 'accessory')} onWarningClick={() => focusV2Issue(getV2Issue(block.id, 'accessory'))} onClick={() => removePreviewComponent('components-v2-accessory', block.id)} /></div>
            : <>{v2EmptyBlock('Missing section accessory', 'Select to add a button or thumbnail')}{getV2Issue(block.id, 'accessory') && <PreviewRemoveButton label="section accessory" warning={getV2Issue(block.id, 'accessory')} disabled disabledTitle="There is no accessory to remove" onWarningClick={() => focusV2Issue(getV2Issue(block.id, 'accessory'))} onClick={() => removePreviewComponent('components-v2-accessory', block.id)} />}</>}
      </div>
    </div>;
    if (block.type === 'media_gallery') return (block.items || []).length
      ? <div className={`discord-v2-gallery is-count-${Math.min(block.items.length, 5)}${block.items.length > 5 ? ' has-overflow' : ''}`} key={key}>{block.items.slice(0, 5).map((item, index) => {
        const spoilerKey = `${block.id}:${index}:${item.url || ''}`;
        const spoilerRevealed = revealedGallerySpoilers.has(spoilerKey);
        const isOverflowTile = block.items.length > 5 && index === 4;
        const overflowCount = block.items.length - 5;
        return <figure className="discord-v2-gallery-item" data-preview-validation-target={`${block.id}:media:${index}`} key={`${key}_media_${index}`}><button type="button" className={`discord-v2-gallery-open${item.spoiler ? ' is-spoiler' : ''}${spoilerRevealed ? ' is-revealed' : ''}${isOverflowTile ? ' has-overflow' : ''}`} data-gallery-cropped="false" data-gallery-image-available="false" aria-label={isOverflowTile ? `Show ${overflowCount} more images` : item.spoiler && !spoilerRevealed ? `Reveal spoiler image ${index + 1}` : `Edit gallery image ${index + 1} of ${block.items.length}`} onMouseEnter={(event) => updateGalleryCropState(event.currentTarget)} onClick={(event) => {
          const cropped = updateGalleryCropState(event.currentTarget);
          focusV2Block(block.id, { kind: 'media', index });
          if (event.shiftKey || galleryShiftHeld) return;
          if (item.spoiler && !spoilerRevealed) {
            setRevealedGallerySpoilers((current) => new Set(current).add(spoilerKey));
            return;
          }
          if (isOverflowTile) {
            openGalleryViewer(block.id, index);
            return;
          }
          if (event.currentTarget.dataset.galleryImageAvailable !== 'true') return;
          if (item.spoiler || cropped) openGalleryViewer(block.id, index);
        }}><PreviewImage src={resolvePreviewImageSource(item.url)} className={`discord-v2-gallery-image${item.spoiler && !spoilerRevealed ? ' is-spoiler-hidden' : ''}`} alt={item.description || `Gallery image ${index + 1}`} placeholderText="Image unavailable" title={item.spoiler && !spoilerRevealed ? 'Click to reveal spoiler' : 'Edit gallery image'} onLoad={(event) => { const image = event.currentTarget; const button = image.closest('.discord-v2-gallery-open'); if (button) button.dataset.galleryImageAvailable = 'true'; requestAnimationFrame(() => updateGalleryCropState(button)); }} onError={(event) => { const button = event.currentTarget.closest('.discord-v2-gallery-open'); if (button) { button.dataset.galleryImageAvailable = 'false'; button.dataset.galleryCropped = 'false'; } }} /><span className="discord-v2-gallery-zoom" aria-hidden="true"><ZoomIn size={18} /></span>{item.spoiler && !spoilerRevealed && <span className="discord-v2-gallery-spoiler-cover" aria-hidden="true">SPOILER</span>}{isOverflowTile && <span className="discord-v2-gallery-overflow-count" aria-hidden="true">+{overflowCount}</span>}</button>{item.description && <figcaption>{item.description}</figcaption>}</figure>;
      })}</div>
      : v2EmptyBlock('Empty media gallery');
    if (block.type === 'file') return <div className="discord-v2-file is-interactive" key={key} onClick={() => focusV2Block(block.id)} title="Click to edit attachment"><Upload size={15} /><span>{String(block.url || '').replace(/^attachment:\/\//i, '') || 'File attachment'}</span></div>;
    if (block.type === 'container') {
      const spoilerRevealed = revealedContainerSpoilers.has(block.id);
      return <div className={`discord-v2-container${block.spoiler && !spoilerRevealed ? ' is-spoiler-hidden' : ''}${block.spoiler && spoilerRevealed ? ' is-spoiler-revealed' : ''}`} data-preview-container-id={block.id} style={{ '--discord-v2-accent': block.accentColor || '#5865F2' }} key={key} onClick={(event) => {
        if (!block.spoiler || event.shiftKey) return;
        event.stopPropagation();
        if (!spoilerRevealed) setRevealedContainerSpoilers((current) => new Set(current).add(block.id));
        else focusV2Block(block.id);
      }} onContextMenu={(event) => openV2ContainerContextMenu(event, block.id)}><PreviewRemoveButton label="container" onClick={() => removePreviewBlock('components-v2', block.id)} />{(block.children || []).length ? block.children.map((child, index) => {
      const issue = getV2Issue(child.id);
      return <div className={`studio-preview-nested-block ${previewBlockClass(child.id, 'components-v2')}`} key={child.id || `${key}_${index}`} data-preview-block-id={child.id} data-preview-validation-target={child.id} data-preview-scope="components-v2" data-preview-parent-container-id={block.id} draggable onClick={(event) => { event.stopPropagation(); focusV2Block(child.id); }} onDragStart={(event) => startPreviewMove(event, 'components-v2', child.id)} onDragEnd={endPreviewMove}>{renderV2Block(child, `${key}_${index}`)}<PreviewRemoveButton label={child.type.replaceAll('_', ' ')} warning={issue} onWarningClick={() => focusV2Issue(issue)} onClick={() => removePreviewBlock('components-v2', child.id)} /></div>;
      }) : v2EmptyBlock('Empty container', 'Drag an eligible block here to add it')}</div>;
    }
    if (block.type === 'action_row') return <div className={`discord-action-row ${previewDropTarget?.id === block.id && previewDropTarget?.placement === 'inside' ? 'is-drop-target' : ''}`} key={key}>
      {(block.components || []).map((button, index) => <div className={`discord-preview-component-wrap ${selectedComponentId === button.id ? 'is-selected' : ''}`} key={button.id || `${key}_${index}`}>
        <button type="button" className={`discord-message-btn is-style-${button.style || 'primary'}`} onClick={(event) => { event.stopPropagation(); openButtonEditor({ scope: 'components-v2', blockId: block.id, buttonId: button.id }, button); }} onContextMenu={(event) => { event.preventDefault(); openButtonEditor({ scope: 'components-v2', blockId: block.id, buttonId: button.id }, button); }}>{button.emoji && <span className="discord-btn-emoji">{renderComponentEmoji(button.emoji, appEmojis)}</span>}{renderDiscordFormattedText(button.label || 'Button')}</button>
        <PreviewRemoveButton label="button" onClick={() => removePreviewComponent('components-v2', block.id, button.id, index)} />
      </div>)}
      {(block.components || []).length < 5 && <button type="button" className="discord-preview-add-button" onClick={(event) => { event.stopPropagation(); addV2ButtonToRow(block.id); }}><Plus size={13} /> Button</button>}
      {!(block.components || []).length && <span className="discord-preview-row-hint">Empty action row</span>}
      {previewDropTarget?.id === block.id && previewDropTarget?.hint && <span className="discord-preview-drop-hint">{previewDropTarget.hint}</span>}
    </div>;
    return null;
  };

  const addImageAttachments = async (fileList) => {
    const selectedFiles = Array.from(fileList || []);
    if (!selectedFiles.length || uploadingImage) return;
    window.clearTimeout(attachmentStatusCollapseTimerRef.current);
    attachmentStatusCollapseTimerRef.current = null;
    const isFirstBatch = !completedFirstAttachmentBatchRef.current;
    const initialBatchCollapseAt = isFirstBatch ? Date.now() + 10000 : null;
    setUploadingImage(true);
    setAttachmentStatusesExpanded(true);
    setAttachmentStatuses(selectedFiles.map((file, index) => ({ id: `${Date.now()}_${index}`, name: file.name, state: 'queued', progress: 0, message: 'Waiting' })));
    let currentAttachments = attachedFiles;
    let currentBlocks = blocks;
    let currentBytes = currentAttachments.reduce((total, item) => total + (Number(item.size) || (String(item.data || '').startsWith('data:') ? Math.floor(String(item.data).length * 0.75) : 0)), 0);
    let currentCount = currentAttachments.length;

    const updateStatus = (index, patch) => setAttachmentStatuses((statuses) => statuses.map((status, i) => i === index ? { ...status, ...patch } : status));
    const readFile = (file, index) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        if (event.lengthComputable) updateStatus(index, { state: 'reading', progress: Math.min(99, Math.round(event.loaded / event.total * 100)), message: 'Reading file' });
      };
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read this file.'));
      reader.onabort = () => reject(new Error('File reading was cancelled.'));
      reader.readAsDataURL(file);
    });

    try {
      for (const [index, file] of selectedFiles.entries()) {
        const filename = file.name.replace(/[\\/\0-\x1f]/g, '_').slice(0, 100) || 'attachment.bin';
        const existingIndex = currentAttachments.findIndex((item) => String(item.filename || '').toLowerCase() === filename.toLowerCase());
        const maxFileBytes = componentsV2Enabled ? 24 * 1024 * 1024 : 8 * 1024 * 1024;
        if (!componentsV2Enabled && !file.type.startsWith('image/')) { updateStatus(index, { state: 'error', message: 'Choose an image file.' }); continue; }
        if (file.size > maxFileBytes) { updateStatus(index, { state: 'error', message: componentsV2Enabled ? 'File exceeds 24 MB.' : 'Image exceeds 8 MB.' }); continue; }
        if (existingIndex < 0 && currentCount >= 10) { updateStatus(index, { state: 'error', message: 'A message can have up to 10 files.' }); continue; }
        const replacedSize = existingIndex >= 0 ? (Number(currentAttachments[existingIndex].size) || (String(currentAttachments[existingIndex].data || '').startsWith('data:') ? Math.floor(String(currentAttachments[existingIndex].data).length * 0.75) : 0)) : 0;
        if (currentBytes - replacedSize + file.size > 24 * 1024 * 1024) { updateStatus(index, { state: 'error', message: 'Attachments must total 24 MB or less.' }); continue; }

        updateStatus(index, { state: 'reading', progress: 0, message: 'Reading file' });
        try {
          const data = await readFile(file, index);
          const attachment = { filename, contentType: file.type, size: file.size, data, description: '' };
          currentAttachments = [...currentAttachments.filter((item) => String(item.filename || '').toLowerCase() !== filename.toLowerCase()), attachment];
          currentBytes = currentBytes - replacedSize + file.size;
          if (existingIndex < 0) currentCount += 1;
          setAttachedFiles(currentAttachments);
          onAttachmentsChange?.(currentAttachments);
          if (!componentsV2Enabled) {
            if (!currentBlocks.some((block) => block.type === 'image' && String(block.url || '').toLowerCase() === `attachment://${filename}`.toLowerCase())) {
              currentBlocks = [...currentBlocks, { id: `image_${Date.now()}_${index}`, type: 'image', url: `attachment://${filename}` }];
              onBlocksChange?.(currentBlocks);
            }
          }
          updateStatus(index, { state: 'success', progress: 100, message: 'Added to message' });
        } catch (error) {
          updateStatus(index, { state: 'error', message: error.message || 'Could not read this file.' });
        }
      }
    } finally {
      setUploadingImage(false);
      completedFirstAttachmentBatchRef.current = true;
      if (isFirstBatch) {
        attachmentStatusCollapseTimerRef.current = window.setTimeout(() => setAttachmentStatusesExpanded(false), Math.max(0, initialBatchCollapseAt - Date.now()));
      } else {
        setAttachmentStatusesExpanded(false);
      }
    }
  };

  return (
    <>
    <section className="embed-studio" aria-label={componentsV2Enabled || isComponentsBuilderNode ? 'Component Studio' : 'Embed Studio'}>
      <header className="embed-studio-header">
        <button className="embed-studio-back" onClick={closeStudio} title="Return to node graph">
          <ArrowLeft size={15} />
          <span>Back to graph</span>
        </button>

        <div className="embed-studio-title">
          <span>{componentsOnly ? (isComponentsBuilderNode ? 'Component Studio' : 'Message Components') : componentsV2Enabled ? 'Component Studio' : 'Embed Studio'}</span>
          {!componentsOnly && (!componentsV2Enabled || assetNameEditable) && (
            <>
              <i>/</i>
              <CharacterLimit className="is-inline" value={name} maxLength={64}>
                <input
                  value={name}
                  onChange={(event) => onNameChange?.(event.target.value)}
                  maxLength={64}
                  aria-label="Embed name"
                  placeholder="Untitled embed"
                />
              </CharacterLimit>
            </>
          )}
        </div>

        {collaborators.length > 0 && <div className="studio-collaborators" title={collaborators.map((peer) => peer.username).join(', ')} aria-label={`Editing with ${collaborators.map((peer) => peer.username).join(', ')}`}>
          {collaborators.slice(0, 5).map((peer) => <span key={peer.userId} style={{ '--collaborator-color': peer.color }}>{peer.username.slice(0, 1).toUpperCase()}</span>)}
        </div>}

        <div className="embed-studio-actions">
          {showSaveAs && (!componentsOnly || componentsV2Enabled) && (
            <button
              className={`embed-studio-secondary ${!showSave ? 'is-primary' : ''}`}
              onClick={componentsV2Enabled ? onSaveComponentsV2As : onSaveAs}
              disabled={hasValidationErrors}
              title={saveDisabledTitle}
            >
              <Save size={14} />
              <span>{saveAsLabel}</span>
            </button>
          )}
          {showSave && (
            <button
              className="embed-studio-save"
              onClick={onSave}
              disabled={hasValidationErrors}
              title={saveDisabledTitle}
            >
              <Check size={15} />
              <span>{saveLabel}</span>
            </button>
          )}
        </div>
      </header>

      <div className="embed-studio-body" ref={studioBodyRef} style={{ '--studio-editor-percent': `${visibleEditorPanePercent}%`, '--studio-editor-min-width': `${studioEditorMinimumWidth}px`, '--studio-preview-min-width': `${studioPreviewMinimumWidth}px` }}>
        <div className="embed-studio-editor">
          {(!componentsOnly || blocks.length > 0 || componentsV2Enabled) && (
            <div className="embed-studio-nav-header">
              <div className="embed-studio-tabs" role="tablist" aria-label="Message sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'components'}
                  className={`embed-tab-btn ${activeTab === 'components' ? 'is-active' : ''}`}
                  onClick={() => selectTab('components')}
                >
                  <MessageSquare size={13} />
                  <span>{isComponentsBuilderNode ? 'Component Studio' : 'Components'}</span>
                  <span className="embed-tab-badge">{componentsV2Enabled ? `${componentsV2Layout.length} blocks` : `${components.length} rows`}</span>
                </button>
                {!isComponentsBuilderNode && !componentsV2Enabled && <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'embed'}
                  className={`embed-tab-btn ${activeTab === 'embed' ? 'is-active' : ''}`}
                  onClick={() => selectTab('embed')}
                >
                  <Layers size={13} />
                  <span>Embed Content</span>
                  <span className={`embed-tab-count ${textCount > 6000 ? 'is-over-limit' : ''}`}>
                    {textCount.toLocaleString()} / 6,000
                  </span>
                </button>}
              </div>
              {(!componentsOnly || componentsV2Enabled) && <label className="embed-studio-upload"><Upload size={13} />{uploadingImage ? 'Adding files…' : componentsV2Enabled ? 'Attach files' : 'Choose images'}<input type="file" multiple accept={componentsV2Enabled ? undefined : 'image/*'} disabled={uploadingImage} onChange={(event) => { addImageAttachments(event.target.files); event.target.value = ''; }} /></label>}
            </div>
          )}

          {attachmentStatuses.length > 0 && <section className={`embed-studio-attachment-status ${attachmentStatusesExpanded ? 'is-expanded' : ''}`} aria-label="Attachment upload status">
            <button type="button" className="embed-studio-attachment-status-toggle" aria-expanded={attachmentStatusesExpanded} disabled={uploadingImage} onClick={() => setAttachmentStatusesExpanded((expanded) => !expanded)}>
              <span>{attachmentStatuses.length} {attachmentStatuses.length === 1 ? 'attachment' : 'attachments'}</span>
              <small>{uploadingImage ? `${attachmentStatuses.filter((status) => status.state === 'success' || status.state === 'error').length} of ${attachmentStatuses.length} processed` : 'Upload details'}</small>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
            <div className="embed-studio-attachment-status-list" aria-hidden={!attachmentStatusesExpanded}>
              {attachmentStatuses.map((status) => <div className={`embed-studio-attachment-status-item is-${status.state}`} key={status.id}>
                <div><span title={status.name}>{status.name}</span><small>{status.message}</small></div>
                {status.state === 'reading' || status.state === 'queued'
                  ? <progress max="100" value={status.progress} aria-label={`${status.name} progress`} />
                  : <b>{status.state === 'success' ? 'Added' : 'Failed'}</b>}
              </div>)}
              <small>Files are added to the draft now and uploaded with the graph when you save.</small>
            </div>
          </section>}


          {activeTab === 'components' && isComponentsWired && (
            <div className="embed-wired-notice">
              <Layers size={14} />
              <span>Supplied by {componentsSourceLabel || 'a connected node'}. Edit that source node on the canvas.</span>
            </div>
          )}
          {activeTab === 'components' && isContentWired && (
            <div className="embed-wired-notice">
              <Layers size={14} />
              <span>Message content comes from {contentSourceLabel || 'a connected node'}; edit that source node on the canvas.</span>
            </div>
          )}
          {activeTab === 'embed' && isEmbedWired && (
            <div className="embed-wired-notice">
              <Layers size={14} />
              <span>Supplied by {embedSourceLabel || 'a connected node'}. Edit that source node on the canvas.</span>
            </div>
          )}

          {activeTab === 'components' && !isComponentsBuilderNode && <div className="components-v2-mode-row">
            <label className={`components-v2-toggle ${!componentsV2Enabled && !canEnableComponentsV2 ? 'is-disabled' : ''}`} title={!componentsV2Enabled && !canEnableComponentsV2 ? componentsV2DisabledReason : undefined}>
              <input type="checkbox" checked={componentsV2Enabled} disabled={!componentsV2Enabled && !canEnableComponentsV2} onChange={(event) => { if (event.target.checked) onEnableComponentsV2?.(); }} />
              <span>Use Components V2</span>
            </label>
            {componentsV2Enabled ? <small>Once sent, Discord does not allow this message to switch back to regular content or embeds.</small> : !canEnableComponentsV2 ? <small>{componentsV2DisabledReason}</small> : null}
          </div>}

          <div className="embed-studio-editor-content" style={((activeTab === 'components' && isComponentsWired) || (activeTab === 'embed' && isEmbedWired)) ? { opacity: 0.5, pointerEvents: 'none', userSelect: 'none' } : undefined}>
            {activeTab === 'embed' ? (
              <EmbedNodeBuilder
                mode="studio"
                focusedBlockId={focusedEmbedBlockId}
                focusOnly
                onFocusBlock={setFocusedEmbedBlockId}
                data={{ blocks: items }}
                wiredFields={wiredFields}
                hasParentNode={hasParentNode}
                appEmojis={appEmojis}
                attachments={attachedFiles}
                graphVariables={graphVariables}
                connectedInputIds={new Set(Object.keys(wiredFields))}
                templateValuePaths={templateValuePaths}
                templatePreviewValues={templatePreviewValues}
                templateSuggestions={templateSuggestions}
                onChange={onBlocksChange}
                onOpenTextStudio={onOpenTextStudio}
                validation={validation}
              />
            ) : componentsV2Enabled ? (
              <ComponentsV2Builder value={componentsV2Layout} focusedBlockId={focusedV2BlockId} focusedItemId={focusedV2ItemId} focusedSectionItem={focusedV2SectionItem} focusedComponentId={selectedComponentId} onSelectComponent={setSelectedComponentId} focusOnly onSelectBlock={setFocusedV2BlockId} onChange={onComponentsV2LayoutChange} graphVariables={graphVariables} templateValuePaths={templateValuePaths} templateSuggestions={templateSuggestions} appEmojis={appEmojis} attachments={attachedFiles} />
            ) : (
              <MessageComponentsBuilder
                rows={components}
                messageContent={content}
                onMessageContentChange={onContentChange}
                isContentWired={isContentWired}
                appEmojis={appEmojis}
                graphVariables={graphVariables}
                onChange={onComponentsChange}
                selectedComponentId={selectedComponentId}
                onSelectComponent={setSelectedComponentId}
                focusedRowId={focusedComponentRowId}
                focusOnly
                onFocusRow={focusComponentRow}
              />
            )}
          </div>

          {((activeTab === 'embed' && !focusedEmbedBlockId) || (activeTab === 'components' && !(componentsV2Enabled ? focusedV2BlockId : focusedComponentRowId))) && <div className="studio-selection-hint">Select an item in the preview to edit it.</div>}

          {!componentsV2Enabled && componentErrors.length > 0 && (
            <div className="embed-studio-validation-banner" role="alert">
              <span className="validation-banner-title">Warning:</span>
              <span>{componentErrors[0]}</span>
              {componentErrors.length > 1 && <small> (+{componentErrors.length - 1} more)</small>}
            </div>
          )}
          {(visibleV2ComponentIssues.length > 0 || visibleV2GlobalErrors.length > 0) && <div className="embed-studio-validation-banner is-linked" role="alert">
            <span className="validation-banner-title">Warning:</span>
            <div className="embed-studio-validation-messages">
              {visibleV2ComponentIssues.map((issue, index) => <button type="button" className="embed-studio-validation-link" key={`${issue.blockId}_${issue.target}_${issue.index ?? 'block'}_${index}`} onClick={() => focusV2Issue(issue)}>{issue.message}</button>)}
              {visibleV2GlobalErrors.map((message, index) => <span key={`global_v2_${index}`}>{message}</span>)}
            </div>
          </div>}

          {!componentsV2Enabled && Object.keys(validation).length > 0 && (
            <div className="embed-studio-validation-banner">
              <span>Please review and fix the highlighted fields in your embed blocks.</span>
            </div>
          )}
          {((activeTab === 'embed' && focusedEmbedBlockId) || (activeTab === 'components' && (componentsV2Enabled ? focusedV2BlockId : focusedComponentRowId))) && <div className="embed-studio-help-footer"><TemplateSyntaxHelp /></div>}
        </div>

        <div className="embed-studio-resize-handle" role="separator" aria-label="Resize editor and preview" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(editorPanePercent)} tabIndex={0} title="Drag to resize" onPointerDown={onStudioDividerPointerDown} onPointerMove={onStudioDividerPointerMove} onPointerUp={stopStudioResize} onPointerCancel={stopStudioResize} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); updateStudioSplitFromKeyboard(event.key === 'ArrowRight' ? 1 : -1); } }} />
        <aside className={`embed-studio-preview ${previewTheme === 'light' ? 'is-discord-light' : ''} ${previewDropTarget?.placement === 'end' ? 'is-drop-end' : ''}`} data-gallery-shift-held={galleryShiftHeld ? 'true' : undefined} aria-label="Live Discord Message Preview" onClick={(event) => { if (!event.target.closest('[data-preview-block-id], .is-interactive')) clearPreviewSelection(); }} onDragOver={handlePreviewDragOver} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewDropTarget(null); }} onDrop={handlePreviewDrop}>
          <div className="embed-studio-preview-heading">
            <div className="preview-heading-title">
              <span>PREVIEW</span>
            </div>
            <div className="preview-heading-controls">
              <div className="preview-theme-toggle" role="group" aria-label="Preview theme">
                <button
                  type="button"
                  className={`preview-theme-btn ${previewTheme === 'dark' ? 'is-active' : ''}`}
                  onClick={() => setPreviewTheme('dark')}
                  title="Dark mode preview"
                >
                  <Moon size={11} />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  className={`preview-theme-btn ${previewTheme === 'light' ? 'is-active' : ''}`}
                  onClick={() => setPreviewTheme('light')}
                  title="Light mode preview"
                >
                  <Sun size={11} />
                  <span>Light</span>
                </button>
              </div>
            </div>
          </div>

          <div className="discord-chat-viewport">
            <div className="discord-message">
              {/* Bot Avatar */}
              <div className="discord-avatar" aria-hidden="true">
                <img
                  src={botAvatarUrl}
                  alt={botDisplayName}
                  className="discord-avatar-img"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/arc.png';
                  }}
                />
              </div>

              <div className="discord-message-body">
                <div className="discord-message-header">
                  <span className="discord-username">{botDisplayName}</span>
                  <span className="discord-bot-tag">APP</span>
                  <span className="discord-timestamp">Today at {previewMessageTime}</span>
                </div>

                {componentsV2Enabled && componentsV2Layout.map((block, index) => {
                  const issue = getV2Issue(block.id);
                  return <div key={block.id || `v2_${index}`} className={`${previewBlockClass(block.id, 'components-v2')}${block.type === 'separator' ? ' is-separator-block' : ''}`} data-preview-block-id={block.id} data-preview-validation-target={block.id} data-preview-scope="components-v2" draggable onClick={(event) => { if (event.target.closest('button')) return; focusV2Block(block.id); }} onDragStart={(event) => startPreviewMove(event, 'components-v2', block.id)} onDragEnd={endPreviewMove}>{renderV2Block(block, block.id || `v2_${index}`)}{block.type !== 'container' && <PreviewRemoveButton label={block.type.replaceAll('_', ' ')} warning={issue} onWarningClick={() => focusV2Issue(issue)} onClick={() => removePreviewBlock('components-v2', block.id)} />}</div>;
                })}

                {!componentsV2Enabled && content ? (
                  <div className="discord-message-content">
                    {renderDiscordFormattedText(content)}
                  </div>
                ) : null}

                {!componentsV2Enabled && hasEmbedContent ? (
                  <div
                    className="embed-preview-card"
                    style={{ '--embed-preview-accent': color || 'transparent' }}
                  >
                    {colorWire && <div className="embed-preview-wire-note">Accent color: <code>{colorWire.token}</code></div>}
                    <div className="embed-preview-content">
                      <div className="embed-preview-main">
                        {/* Author */}
                        {(author?.name || authorUrlWire || authorIconWire) && (
                          <div
                            className={`${previewBlockClass(author.id, 'embed')} embed-preview-author is-interactive`}
                            data-preview-block-id={author.id}
                            data-preview-scope="embed"
                            draggable
                            onDragStart={(event) => startPreviewMove(event, 'embed', author.id)}
                            onDragEnd={endPreviewMove}
                            onClick={() => focusEditorBlock(author)}
                            title="Click to edit author"
                          >
                            {!authorIconWire && author.icon && (
                              <PreviewImage src={resolvePreviewImageSource(author.icon)} alt="Author icon" placeholderText="" className="embed-preview-author-icon" />
                            )}
                            {authorLink ? (
                              <a href={authorLink || undefined} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEmbedTextEditor(author, 'name', 'Author Name', 256); }}>
                                {renderDiscordFormattedText(author.name)}
                              </a>
                            ) : (
                              <span onClick={(event) => { event.stopPropagation(); openEmbedTextEditor(author, 'name', 'Author Name', 256); }}>{renderDiscordFormattedText(author.name)}</span>
                            )}
                            {authorIconWire && <code className="embed-preview-wire-label">{authorIconWire.token}</code>}
                            {authorUrlWire && <code className="embed-preview-wire-label">{authorUrlWire.token}</code>}
                            <PreviewRemoveButton label="author block" disabled={embedBlockHasWires(author.id)} onClick={() => removePreviewBlock('embed', author.id)} />
                          </div>
                        )}

                        {title && (
                          <div
                            className={`${previewBlockClass(previewItems.find((block) => block.type === 'title')?.id, 'embed')} embed-preview-title-wrapper is-interactive`}
                            data-preview-block-id={previewItems.find((block) => block.type === 'title')?.id}
                            data-preview-scope="embed"
                            draggable
                            onDragStart={(event) => startPreviewMove(event, 'embed', previewItems.find((block) => block.type === 'title')?.id)}
                            onDragEnd={endPreviewMove}
                            onClick={() => openEmbedTextEditor(previewItems.find((block) => block.type === 'title'), 'value', 'Title Text', 256)}
                            title="Click to edit title"
                          >
                            {titleLink ? (
                              <a className="embed-preview-title" href={titleLink || undefined} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEmbedTextEditor(previewItems.find((block) => block.type === 'title'), 'value', 'Title Text', 256); }}>
                                {renderDiscordFormattedText(title)}
                              </a>
                            ) : (
                              <strong className="embed-preview-title">{renderDiscordFormattedText(title)}</strong>
                            )}
                            <PreviewRemoveButton label="title block" disabled={embedBlockHasWires(previewItems.find((block) => block.type === 'title')?.id)} onClick={() => removePreviewBlock('embed', previewItems.find((block) => block.type === 'title')?.id)} />
                          </div>
                        )}
                        {titleUrlWire && <code className="embed-preview-wire-label is-block">Title URL: {titleUrlWire.token}</code>}

                        {description && (
                          <div
                            className={`${previewBlockClass(previewItems.find((block) => block.type === 'description')?.id, 'embed')} embed-preview-description is-interactive`}
                            data-preview-block-id={previewItems.find((block) => block.type === 'description')?.id}
                            data-preview-scope="embed"
                            draggable
                            onDragStart={(event) => startPreviewMove(event, 'embed', previewItems.find((block) => block.type === 'description')?.id)}
                            onDragEnd={endPreviewMove}
                            onClick={() => openEmbedTextEditor(previewItems.find((block) => block.type === 'description'), 'value', 'Message Description', 4096)}
                            title="Click to edit description"
                          >
                            <p>{renderDiscordFormattedText(description)}</p>
                            <PreviewRemoveButton label="description block" disabled={embedBlockHasWires(previewItems.find((block) => block.type === 'description')?.id)} onClick={() => removePreviewBlock('embed', previewItems.find((block) => block.type === 'description')?.id)} />
                          </div>
                        )}

                        {!!fields.length && (
                          <div className="embed-preview-fields">
                            {fields.map((field) => (
                              <div
                                key={field.id}
                                className={`${previewBlockClass(field.id, 'embed')} embed-preview-field ${field.inline ? 'is-inline' : 'is-full'} is-interactive`}
                                data-preview-block-id={field.id}
                                data-preview-scope="embed"
                                draggable
                                onDragStart={(event) => startPreviewMove(event, 'embed', field.id)}
                                onDragEnd={endPreviewMove}
                                title="Click to edit field"
                              >
                                <b onClick={(event) => { event.stopPropagation(); openEmbedTextEditor(field, 'name', 'Field Name', 256); }}>{renderDiscordFormattedText(field.name || 'Field name')}</b>
                                <span onClick={(event) => { event.stopPropagation(); openEmbedTextEditor(field, 'value', 'Field Value', 1024); }}>{renderDiscordFormattedText(field.value || 'Field value')}</span>
                                <PreviewRemoveButton label="field block" disabled={embedBlockHasWires(field.id)} onClick={() => removePreviewBlock('embed', field.id)} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {thumbnailWire ? <div className="embed-preview-wire-media is-thumbnail">{thumbnailWire.token}</div> : thumbnailBlock ? (
                        <div className={`${previewBlockClass(thumbnailBlock.id, 'embed')} studio-preview-media-block is-thumbnail`} data-preview-block-id={thumbnailBlock.id} data-preview-scope="embed" draggable onDragStart={(event) => startPreviewMove(event, 'embed', thumbnailBlock.id)} onDragEnd={endPreviewMove}>
                          <PreviewImage
                            className="embed-preview-thumbnail is-interactive"
                            src={resolvePreviewImageSource(thumbnail)}
                            alt="Thumbnail preview"
                            placeholderText={thumbnailUrl ? 'Thumbnail unavailable' : 'No thumbnail'}
                            onClick={() => focusEditorBlock(thumbnailBlock)}
                            onContextMenu={thumbnailUrl ? (event) => { event.preventDefault(); event.stopPropagation(); setThumbnailContextMenu({ x: event.clientX, y: event.clientY, url: thumbnailUrl }); } : undefined}
                            title={thumbnailUrl ? 'Click to edit thumbnail · Right-click to open image' : 'Click to edit thumbnail'}
                          />
                          <PreviewRemoveButton label="thumbnail block" disabled={embedBlockHasWires(thumbnailBlock.id)} onClick={() => removePreviewBlock('embed', thumbnailBlock.id)} />
                        </div>
                      ) : null}
                    </div>

                    {imageWire ? <div className="embed-preview-wire-media">{imageWire.token}</div> : imageBlock ? <div className={`${previewBlockClass(imageBlock.id, 'embed')} studio-preview-media-block is-image`} data-preview-block-id={imageBlock.id} data-preview-scope="embed" draggable onDragStart={(event) => startPreviewMove(event, 'embed', imageBlock.id)} onDragEnd={endPreviewMove}>
                      <PreviewImage
                        className="embed-preview-image is-interactive"
                        src={resolvePreviewImageSource(image)}
                        alt="Image preview"
                        placeholderText={safePreviewUrl(image) ? 'Image unavailable' : 'No image'}
                        onClick={() => focusEditorBlock(imageBlock)}
                        title="Click to edit image"
                      />
                      <PreviewRemoveButton label="image block" disabled={embedBlockHasWires(imageBlock.id)} onClick={() => removePreviewBlock('embed', imageBlock.id)} />
                    </div> : null}

                    {(footer?.text || footerIconWire || timestampLabel) && (
                      <div
                        className={`${previewBlockClass(footer?.id, 'embed')} embed-preview-footer is-interactive`}
                        data-preview-block-id={footer?.id}
                        data-preview-scope="embed"
                        draggable={Boolean(footer?.id)}
                        onDragStart={(event) => footer?.id && startPreviewMove(event, 'embed', footer.id)}
                        onDragEnd={endPreviewMove}
                        onClick={() => footer?.id && openEmbedTextEditor(footer, 'text', 'Footer Text', 2048)}
                        title="Click to edit footer"
                      >
                        {!footerIconWire && footer?.icon && (
                          <PreviewImage src={resolvePreviewImageSource(footer.icon)} alt="Footer icon" placeholderText="" className="embed-preview-footer-icon" />
                        )}
                        {footerIconWire && <code className="embed-preview-wire-label">{footerIconWire.token}</code>}
                        {footer?.text && <span onClick={(event) => { event.stopPropagation(); openEmbedTextEditor(footer, 'text', 'Footer Text', 2048); }}>{renderDiscordFormattedText(footer.text)}</span>}
                        {footer?.text && timestampLabel && (
                          <span className="embed-preview-footer-dot">•</span>
                        )}
                        {timestampLabel && (
                          <time dateTime={timestamp && !Number.isNaN(new Date(timestamp).getTime()) ? new Date(timestamp).toISOString() : undefined}>{timestampLabel}</time>
                        )}
                        <PreviewRemoveButton label="footer block" disabled={embedBlockHasWires(footer?.id)} onClick={() => removePreviewBlock('embed', footer?.id)} />
                      </div>
                    )}
                  </div>
                ) : !componentsV2Enabled && !components.length && !content ? (
                  <div className="embed-preview-empty-card">
                    <p>Your message has no content yet.</p>
                    <span>Add embed blocks or interactive buttons from the editor on the left.</span>
                  </div>
                ) : null}

                {!componentsV2Enabled && components.slice(0, 5).map((sourceRow, rowIndex) => {
                  const row = toDiscordComponents([sourceRow], appEmojis)[0] || { components: [] };

                  return (
                    <div className={`discord-action-row ${previewBlockClass(sourceRow?.id, 'components')} ${previewDropTarget?.id === sourceRow?.id && previewDropTarget?.placement === 'inside' ? 'is-drop-target' : ''}`} key={sourceRow?.id || rowIndex} data-preview-block-id={sourceRow?.id} data-preview-scope="components" draggable={Boolean(sourceRow?.id)} onClick={() => sourceRow?.id && focusComponentRow(sourceRow.id)} onDragStart={(event) => sourceRow?.id && startPreviewMove(event, 'components', sourceRow.id)} onDragEnd={endPreviewMove}>
                      {!row.components.length && <div className="discord-preview-empty-action-row">
                        <span>Action row {rowIndex + 1}</span>
                        <button type="button" className="discord-preview-add-button" onClick={(event) => { event.stopPropagation(); addButtonToRow(sourceRow.id); }}>
                          <Plus size={13} /> Button
                        </button>
                      </div>}
                      {row.components.map((component, componentIndex) => {
                        const originalComponent = sourceRow?.components?.[componentIndex];
                        const componentId = originalComponent?.id || `comp_${rowIndex}_${componentIndex}`;

                        if (component.type === 2) {
                          const styleClass = `is-style-${component.style === 5 ? 'link' : component.style === 1 ? 'primary' : component.style === 3 ? 'success' : component.style === 4 ? 'danger' : 'secondary'}`;
                          const isLink = component.style === 5;
                          const buttonEmoji = originalComponent?.emoji || component.emoji;

                          return (
                            <div key={componentId} className={`discord-preview-component-wrap ${selectedComponentId === originalComponent?.id ? 'is-selected' : ''}`}>
                              <button
                                type="button"
                                className={`discord-message-btn ${styleClass} ${component.disabled ? 'is-disabled' : ''}`}
                                onClick={(event) => { event.stopPropagation(); if (originalComponent?.id) openButtonEditor({ scope: 'standard', rowId: sourceRow.id, buttonId: originalComponent.id }, originalComponent); }}
                                onContextMenu={(event) => { event.preventDefault(); if (originalComponent?.id) openButtonEditor({ scope: 'standard', rowId: sourceRow.id, buttonId: originalComponent.id }, originalComponent); }}
                                title={originalComponent?.id ? `Configure button "${component.label || 'Button'}"` : undefined}
                              >
                                {buttonEmoji && (
                                  <span className="discord-btn-emoji">
                                    {renderComponentEmoji(buttonEmoji, appEmojis)}
                                  </span>
                                )}
                                {component.label && <span>{renderDiscordFormattedText(component.label)}</span>}
                                {isLink && <ExternalLink size={13} className="discord-btn-link-icon" />}
                              </button>
                              <PreviewRemoveButton label="button" onClick={() => removePreviewComponent('components', sourceRow.id, originalComponent?.id, componentIndex)} />
                            </div>
                          );
                        }

                        const isExpanded = expandedSelectMenuId === componentId;
                        const selectedVal = selectedMenuValues[componentId];
                        const selectedOption = originalComponent?.options?.find((o) => o.value === selectedVal);

                        return (
                          <div
                            key={componentId}
                            className={`discord-message-select ${isExpanded ? 'is-expanded' : ''}`}
                            onClick={() => setExpandedSelectMenuId((prev) => prev === componentId ? null : componentId)}
                            title={isExpanded ? 'Click to close menu' : 'Click to preview select menu options'}
                          >
                            <div className="discord-select-trigger">
                              <span className="discord-select-placeholder">
                                {selectedOption ? (
                                  <span className="discord-select-selected-val">
                                    {selectedOption.emoji && (
                                      <span className="discord-select-item-emoji">{renderDiscordFormattedText(selectedOption.emoji)}</span>
                                    )}
                                    {renderDiscordFormattedText(selectedOption.label || selectedOption.value)}
                                  </span>
                                ) : (
                                  component.placeholder || 'Select an option…'
                                )}
                              </span>
                              <span className="discord-select-chevron">{isExpanded ? '⌃' : '⌄'}</span>
                            </div>

                            {isExpanded && (
                              <div className="discord-preview-select-popover" onClick={(e) => e.stopPropagation()}>
                                {originalComponent?.options?.length ? (
                                  originalComponent.options.map((opt, optIdx) => {
                                    const isOptSelected = selectedVal === opt.value;
                                    return (
                                      <div
                                        key={optIdx}
                                        className={`discord-preview-select-item ${isOptSelected ? 'is-selected' : ''}`}
                                        onClick={() => {
                                          setSelectedMenuValues((prev) => ({ ...prev, [componentId]: opt.value }));
                                          setExpandedSelectMenuId(null);
                                        }}
                                      >
                                        {opt.emoji && (
                                          <span className="discord-select-item-emoji">{renderDiscordFormattedText(opt.emoji)}</span>
                                        )}
                                        <div className="discord-select-item-text">
                                          <strong className="discord-select-item-label">{renderDiscordFormattedText(opt.label || opt.value)}</strong>
                                          {opt.description && (
                                            <span className="discord-select-item-desc">{renderDiscordFormattedText(opt.description)}</span>
                                          )}
                                        </div>
                                        {isOptSelected && <span className="discord-select-item-check">✓</span>}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="discord-preview-select-empty">
                                    <span>No options configured yet</span>
                                    <button
                                      type="button"
                                      className="discord-preview-add-opt-link"
                                      onClick={() => {
                                        setExpandedSelectMenuId(null);
                                        originalComponent?.id && focusComponent(originalComponent.id);
                                      }}
                                    >
                                      Configure in inspector
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {row.components.length > 0 && row.components.length < 5 && !row.components.some((item) => item.type !== 2) && <button type="button" className="discord-preview-add-button" onClick={(event) => { event.stopPropagation(); addButtonToRow(sourceRow.id); }}><Plus size={13} /> Button</button>}
                      {previewDropTarget?.id === sourceRow?.id && previewDropTarget?.hint && <span className="discord-preview-drop-hint">{previewDropTarget.hint}</span>}
                      <PreviewRemoveButton label="component row" onClick={() => removePreviewBlock('components', sourceRow?.id)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
    <Modal isOpen={discardPromptOpen} onClose={() => setDiscardPromptOpen(false)} title="Discard studio changes?" subtitle="These edits have not been applied to the graph." footer={<><Button variant="secondary" onClick={() => setDiscardPromptOpen(false)}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard changes</Button></>}><p className="close-graph-copy">Your graph stays unchanged until you choose Apply.</p></Modal>
    {thumbnailContextMenu && createPortal(
      <div className="canvas-context-menu embed-thumbnail-context-menu" role="menu" style={{ position: 'fixed', left: thumbnailContextMenu.x, top: thumbnailContextMenu.y, zIndex: 10000 }} onPointerDown={(event) => event.stopPropagation()}>
        <button role="menuitem" onClick={() => { window.open(thumbnailContextMenu.url, '_blank', 'noopener,noreferrer'); setThumbnailContextMenu(null); }}><ExternalLink size={14} /> Open image in browser</button>
      </div>,
      document.body
    )}
    {v2ContainerContextMenu && createPortal(
      <div ref={v2ContainerContextMenuRef} className="canvas-context-menu" role="menu" style={{ position: 'fixed', left: v2ContainerContextMenu.x, top: v2ContainerContextMenu.y, zIndex: 10000 }} onPointerDown={(event) => event.stopPropagation()}>
        <button role="menuitem" onClick={() => { focusV2Block(v2ContainerContextMenu.blockId); setV2ContainerContextMenu(null); }}><Layers size={14} /> Edit container settings</button>
      </div>,
      document.body
    )}
    {galleryViewer && (() => {
      const gallery = findV2Block(componentsV2Layout, galleryViewer.blockId);
      const item = gallery?.items?.[galleryViewer.index];
      if (!item) return null;
      const isZoomed = galleryZoom?.blockId === galleryViewer.blockId && galleryZoom?.index === galleryViewer.index;
      return createPortal(<div className={`discord-gallery-lightbox${galleryClosing ? ' is-closing' : ''}${isZoomed ? ' is-image-zoomed' : ''}`} role="dialog" aria-modal="true" aria-label={`Image ${galleryViewer.index + 1} of ${gallery.items.length}`} onClick={(event) => { if (event.target === event.currentTarget) closeGalleryViewer(); }}>
        <button type="button" className="discord-gallery-lightbox-close" aria-label="Close image viewer" title="Close image viewer" onClick={closeGalleryViewer}><X size={20} /></button>
        {gallery.items.length > 1 && <button type="button" className="discord-gallery-lightbox-nav is-previous" aria-label="Previous image" onClick={() => setGalleryViewer((current) => ({ ...current, index: (current.index - 1 + gallery.items.length) % gallery.items.length }))}><ChevronLeft size={26} /></button>}
        <figure className="discord-gallery-lightbox-content">
          <div className={`discord-gallery-lightbox-image-frame ${galleryZoom?.blockId === galleryViewer.blockId && galleryZoom?.index === galleryViewer.index ? 'is-zoomed' : ''}`} role="button" tabIndex={0} aria-label={galleryZoom?.blockId === galleryViewer.blockId && galleryZoom?.index === galleryViewer.index ? 'Zoom out' : 'Zoom in at pointer'} aria-pressed={galleryZoom?.blockId === galleryViewer.blockId && galleryZoom?.index === galleryViewer.index} title="Click to zoom in or out" onClick={toggleGalleryZoom} onKeyDown={handleGalleryZoomKeyDown}>
            <PreviewImage src={resolvePreviewImageSource(item.url)} className={`discord-gallery-lightbox-image ${galleryZoom?.blockId === galleryViewer.blockId && galleryZoom?.index === galleryViewer.index ? 'is-zoomed' : ''}`} style={{ transformOrigin: `${galleryZoom?.originX ?? 50}% ${galleryZoom?.originY ?? 50}%` }} alt={item.description || `Gallery image ${galleryViewer.index + 1}`} placeholderText="Image unavailable" />
          </div>
          {item.description && <figcaption>{item.description}</figcaption>}
          {gallery.items.length > 1 && <small>{galleryViewer.index + 1} / {gallery.items.length}</small>}
        </figure>
        {gallery.items.length > 1 && <button type="button" className="discord-gallery-lightbox-nav is-next" aria-label="Next image" onClick={() => setGalleryViewer((current) => ({ ...current, index: (current.index + 1) % gallery.items.length }))}><ChevronRight size={26} /></button>}
      </div>, document.body);
    })()}
    </>
  );
}
