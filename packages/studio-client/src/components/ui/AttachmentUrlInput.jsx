import React, { useId, useMemo, useState } from 'react';
import { File, Image } from 'lucide-react';
import { DiscordTextField } from './DiscordTextField.jsx';

const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const COMPLETE_FILE_EXTENSION = /\.[a-z]{1,5}$/i;
const MAX_INLINE_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024;
//
function isImageAttachment(file) {
  return String(file?.contentType || file?.type || '').toLowerCase().startsWith('image/') || IMAGE_EXTENSIONS.test(String(file?.filename || file?.name || ''));
}

function AttachmentSuggestionIcon({ file, imageOnly }) {
  const data = String(file?.data || '');
  const withinPreviewLimit = Number(file?.size || 0) <= MAX_INLINE_IMAGE_PREVIEW_BYTES && data.length <= MAX_INLINE_IMAGE_PREVIEW_BYTES * 1.4;
  const preview = imageOnly && isImageAttachment(file) && withinPreviewLimit && /^data:image\//i.test(data) ? data : '';
  const [failed, setFailed] = useState(false);
  React.useEffect(() => setFailed(false), [preview, file?.filename]);
  if (preview && !failed) return <img className="attachment-url-suggestion-preview" src={preview} alt="" aria-hidden="true" onError={() => setFailed(true)} />;
  return imageOnly && isImageAttachment(file) ? <Image size={16} /> : <File size={16} />;
}

export function AttachmentUrlInput({ value = '', onChange, attachments = [], imageOnly = false, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const rawValue = String(value || '').trim();
  const attachmentMatch = /^attachment:\/\/(.*)$/i.exec(rawValue);
  const query = attachmentMatch?.[1] ?? rawValue;
  const normalizedQuery = query.toLowerCase();
  const hasOtherScheme = !attachmentMatch && /^[a-z][a-z\d+.-]*:/i.test(rawValue);
  const isTypingCommonScheme = /^(?:htt|https?|htp|ftps?|data|blob)$/i.test(rawValue);
  const matches = useMemo(() => attachments
    .filter((file) => String(file?.filename || '').toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      const aName = String(a?.filename || '').toLowerCase();
      const bName = String(b?.filename || '').toLowerCase();
      const aPrefix = normalizedQuery && aName.startsWith(normalizedQuery) ? 0 : 1;
      const bPrefix = normalizedQuery && bName.startsWith(normalizedQuery) ? 0 : 1;
      return aPrefix - bPrefix || aName.localeCompare(bName);
    })
    .slice(0, 5), [attachments, normalizedQuery]);
  const currentFilename = /^attachment:\/\/(.+)$/i.exec(rawValue)?.[1]?.toLowerCase();
  const selectedUnsupported = imageOnly && currentFilename && attachments.some((file) => String(file?.filename || '').toLowerCase() === currentFilename && !isImageAttachment(file));
  const selectableMatches = matches.filter((file) => !imageOnly || isImageAttachment(file));
  const activeFile = selectableMatches.length ? selectableMatches[Math.min(activeIndex, selectableMatches.length - 1)] : null;
  const showSuggestions = focused && !hasOtherScheme && !isTypingCommonScheme && !COMPLETE_FILE_EXTENSION.test(query) && attachments.length > 0;

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

  const choose = (file) => {
    onChange?.(`attachment://${file.filename}`);
    setFocused(false);
  };

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
        const unsupported = imageOnly && !isImageAttachment(file);
        const selectableIndex = selectableMatches.findIndex((item) => item.filename === file.filename);
        const active = !unsupported && selectableIndex === activeIndex;
        return unsupported
          ? <div className="is-disabled" key={file.filename} aria-disabled="true"><File size={13} /><span>{file.filename}</span><small>Not an image</small></div>
          : <button type="button" id={`${listboxId}_${file.filename}`} role="option" aria-selected={active} className={active ? 'is-active' : ''} key={file.filename} onPointerEnter={() => setActiveIndex(selectableIndex)} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(file)}>
            <AttachmentSuggestionIcon file={file} imageOnly={imageOnly} /><span>{file.filename}</span><small>{imageOnly ? 'Image' : 'File'}</small>
          </button>;
      })}
      {!matches.length && <span className="attachment-url-empty">No matching attachments</span>}
    </div>}
    {selectedUnsupported && <small className="attachment-url-error">This attachment is not an image. Choose an image file.</small>}
  </div>;
}
