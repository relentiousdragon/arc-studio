import React, { useId, useMemo, useState } from 'react';
import { AudioLines, File, FileVideo, Image, List, Search, X } from 'lucide-react';
import { DiscordTextField } from './DiscordTextField.jsx';
import { createPortal } from 'react-dom';
import { isSafeImageMedia, mediaKind, useMediaView } from './mediaTypes.js';

const COMPLETE_FILE_EXTENSION = /\.[a-z]{1,5}$/i;
const MAX_INLINE_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024;

function AttachmentSuggestionIcon({ file, imageOnly }) {
  const data = String(file?.data || '');
  const withinPreviewLimit = Number(file?.size || 0) <= MAX_INLINE_IMAGE_PREVIEW_BYTES && data.length <= MAX_INLINE_IMAGE_PREVIEW_BYTES * 1.4;
  const kind = mediaKind(file);
  const preview = imageOnly && isSafeImageMedia(file)
    ? file?.previewUrl || (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(String(file?.preview || '')) ? file.preview
      : withinPreviewLimit && /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(data) ? data
        : '')
    : '';
  const [failed, setFailed] = useState(false);
  React.useEffect(() => setFailed(false), [preview, file?.filename]);
  if (preview && !failed) return <img className="attachment-url-suggestion-preview" src={preview} alt="" aria-hidden="true" onError={() => setFailed(true)} />;
  if (kind === 'image') return <Image size={16} />;
  if (kind === 'video') return <FileVideo size={16} />;
  if (kind === 'audio') return <AudioLines size={16} />;
  return <File size={16} />;
}

export function AttachmentUrlInput({ value = '', onChange, attachments = [], mediaAssets = [], botProfile = null, imageOnly = false, allowVideo = false, allowMultiple = false, onSelectMediaAsset, onSelectMediaAssets, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerFilter, setPickerFilter] = useState(imageOnly ? 'image' : 'all');
  const [pickerView, setPickerView] = useMediaView();
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const listboxId = useId();
  const rawValue = String(value || '').trim();
  const attachmentMatch = /^attachment:\/\/(.*)$/i.exec(rawValue);
  const query = attachmentMatch?.[1] ?? rawValue;
  const normalizedQuery = query.toLowerCase();
  const hasOtherScheme = !attachmentMatch && /^[a-z][a-z\d+.-]*:/i.test(rawValue);
  const isTypingCommonScheme = /^(?:htt|https?|htp|ftps?|data|blob)$/i.test(rawValue);
  const botAvatar = useMemo(() => {
    const userId = String(botProfile?.id || botProfile?.application?.id || '');
    if (!/^\d{17,20}$/.test(userId)) return null;
    const avatarHash = String(botProfile?.avatar || botProfile?.application?.icon || '');
    const avatarUrl = avatarHash
      ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${avatarHash.startsWith('a_') ? 'gif' : 'png'}?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${Math.abs(Number(BigInt(userId) >> 22n) % 6)}.png`;
    return { id: 'chezcord-app-avatar', filename: 'chezcord-app-avatar', contentType: avatarHash.startsWith('a_') ? 'image/gif' : 'image/png', previewUrl: avatarUrl, isChezcordAppAvatar: true };
  }, [botProfile?.id, botProfile?.avatar, botProfile?.application?.id, botProfile?.application?.icon]);
  const suggestionFiles = useMemo(() => {
    const unique = new Map();
    for (const file of [...attachments, ...mediaAssets, ...(botAvatar ? [botAvatar] : [])]) {
      const key = String(file?.filename || '').toLowerCase();
      if (key && !unique.has(key)) unique.set(key, file);
    }
    return [...unique.values()];
  }, [attachments, mediaAssets, botAvatar]);
  const supportsField = (file) => !imageOnly || isSafeImageMedia(file) || allowVideo && mediaKind(file) === 'video';
  const matches = useMemo(() => suggestionFiles
    .filter((file) => supportsField(file) && String(file?.filename || '').toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      const aName = String(a?.filename || '').toLowerCase();
      const bName = String(b?.filename || '').toLowerCase();
      const aPrefix = normalizedQuery && aName.startsWith(normalizedQuery) ? 0 : 1;
      const bPrefix = normalizedQuery && bName.startsWith(normalizedQuery) ? 0 : 1;
      return aPrefix - bPrefix || aName.localeCompare(bName);
    })
    .slice(0, 5), [suggestionFiles, normalizedQuery, imageOnly, allowVideo]);
  const currentFilename = /^attachment:\/\/(.+)$/i.exec(rawValue)?.[1]?.toLowerCase();
  const selectedUnsupported = imageOnly && currentFilename && suggestionFiles.some((file) => String(file?.filename || '').toLowerCase() === currentFilename && !supportsField(file));
  const selectableMatches = matches;
  const activeFile = selectableMatches.length ? selectableMatches[Math.min(activeIndex, selectableMatches.length - 1)] : null;
  const showSuggestions = focused && !hasOtherScheme && !isTypingCommonScheme && !COMPLETE_FILE_EXTENSION.test(query) && suggestionFiles.length > 0 && !rawValue.includes('{{');

  React.useEffect(() => { setActiveIndex(0); }, [normalizedQuery, imageOnly]);

  const moveActive = (direction) => {
    if (!selectableMatches.length) return;
    setActiveIndex((current) => (current + direction + selectableMatches.length) % selectableMatches.length);
  };

  const handleKeyDown = (event) => {
    if (!showSuggestions) {
      inputProps.onKeyDown?.(event);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && activeFile) {
      event.preventDefault();
      event.stopPropagation();
      choose(activeFile);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setFocused(false);
    } else inputProps.onKeyDown?.(event);
  };

  const choose = (file, multiPicker = false) => {
    if (allowMultiple && multiPicker) {
      setSelectedAssetIds((current) => current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id]);
      return;
    }
    onChange?.(`attachment://${file.filename}`);
    if (!file.isChezcordAppAvatar) onSelectMediaAsset?.(file);
    setFocused(false);
    setPickerOpen(false);
  };
  const applyMultiple = () => {
    const selected = libraryFiles.filter((file) => selectedAssetIds.includes(file.id));
    if (!selected.length) return;
    onSelectMediaAssets?.(selected);
    selected.forEach((file) => onSelectMediaAsset?.(file));
    setSelectedAssetIds([]);
    setPickerOpen(false);
  };

  const libraryFiles = mediaAssets.filter((file) => {
    if (!supportsField(file)) return false;
    const name = `${file.filename || ''} ${file.contentType || ''}`.toLowerCase();
    if (!name.includes(pickerQuery.trim().toLowerCase())) return false;
    const kind = mediaKind(file);
    if (pickerFilter === 'files') return kind === 'file';
    return pickerFilter === 'all' || kind === pickerFilter;
  });

  return <div className={`attachment-url-autocomplete ${selectedUnsupported ? 'has-unsupported-file' : ''}`}>
    <DiscordTextField
      {...inputProps}
      value={value ?? ''}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showSuggestions}
      aria-controls={showSuggestions ? listboxId : undefined}
      aria-activedescendant={showSuggestions && activeFile ? `${listboxId}_${activeFile.filename}` : undefined}
      aria-invalid={selectedUnsupported ? 'true' : inputProps['aria-invalid']}
      onChange={(event) => { setFocused(true); setActiveIndex(0); onChange?.(event.target.value); }}
      onFocus={(event) => { setFocused(true); inputProps.onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); inputProps.onBlur?.(event); }}
      onKeyDown={handleKeyDown}
    />
    {showSuggestions && <div className="attachment-url-suggestions" id={listboxId} role="listbox" aria-label={imageOnly ? 'Attached images' : 'Attached files'}>
      {matches.map((file) => {
        const selectableIndex = selectableMatches.findIndex((item) => item.filename === file.filename);
        const active = selectableIndex === activeIndex;
        return <button type="button" id={`${listboxId}_${file.filename}`} role="option" aria-selected={active} className={active ? 'is-active' : ''} key={file.filename} onPointerEnter={() => setActiveIndex(selectableIndex)} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(file)}>
          <AttachmentSuggestionIcon file={file} imageOnly={imageOnly} /><span>{file.filename}</span><small>{mediaKind(file)}</small>
        </button>;
      })}
      {!matches.length && <span className="attachment-url-empty">No matching attachments</span>}
    </div>}
    <button type="button" className="attachment-url-browse" onClick={() => { setPickerFilter(imageOnly ? 'image' : 'all'); setSelectedAssetIds([]); setPickerOpen(true); }} aria-label={imageOnly ? 'Choose image from project media' : 'Choose file from project media'} title="Browse project media"><Image size={12} /><span>Browse media</span></button>
    {selectedUnsupported && <small className="attachment-url-error">This attachment is not an image. Choose an image file.</small>}
    {pickerOpen && createPortal(<div className="project-asset-picker-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
      <section className="project-asset-picker" role="dialog" aria-modal="true" aria-label="Choose project media">
        <header><div><strong>Choose project media</strong><small>{imageOnly ? 'Images supported by this field' : 'Files supported by this field'}</small></div><button type="button" onClick={() => setPickerOpen(false)} aria-label="Close media picker"><X size={15} /></button></header>
        <div className="project-asset-picker-tools"><label><Search size={13} /><input autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Search project files" /></label><select aria-label="Filter file types" value={pickerFilter} onChange={(event) => setPickerFilter(event.target.value)}><option value="all">All supported types</option>{supportsField({ contentType: 'image/png' }) && <option value="image">Images</option>}{supportsField({ contentType: 'video/mp4' }) && <option value="video">Videos</option>}{supportsField({ contentType: 'audio/mpeg' }) && <option value="audio">Audio</option>}{!imageOnly && <option value="files">Other files</option>}</select><button type="button" className={pickerView === 'grid' ? 'is-active' : ''} aria-label="Grid view" title="Grid view" onClick={() => setPickerView('grid')}><Image size={13} /></button><button type="button" className={pickerView === 'list' ? 'is-active' : ''} aria-label="List view" title="List view" onClick={() => setPickerView('list')}><List size={13} /></button></div>
        <div className={`project-asset-picker-grid${pickerView === 'list' ? ' is-list' : ''}`}>{libraryFiles.map((file) => { const kind = mediaKind(file); const Icon = kind === 'image' ? Image : kind === 'video' ? FileVideo : kind === 'audio' ? AudioLines : File; return <button type="button" className={`project-asset-picker-card${selectedAssetIds.includes(file.id) ? ' is-selected' : ''}`} key={file.id || file.filename} onClick={() => allowMultiple ? choose(file, true) : choose(file)} title={`${allowMultiple ? 'Select' : 'Use'} ${file.filename}`}><span>{file.preview && (kind === 'image' || kind === 'video') ? <img src={file.preview} alt="" /> : <Icon size={23} />}{allowMultiple && selectedAssetIds.includes(file.id) && <i aria-hidden="true">✓</i>}</span><strong>{file.filename}</strong><small>{file.contentType || 'File'}</small></button>; })}{!libraryFiles.length && <p>No compatible project files found.</p>}</div>
        {allowMultiple && <footer><span>{selectedAssetIds.length} selected</span><button type="button" disabled={!selectedAssetIds.length} onClick={applyMultiple}>Add selected media</button></footer>}
      </section>
    </div>, document.body)}
  </div>;
}
