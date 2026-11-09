import { useCallback, useEffect, useState } from 'react';

const MEDIA_VIEW_STORAGE_KEY = 'arc_media_view';
const MEDIA_VIEW_EVENT = 'arc-media-view-change';
//
export function useMediaView() {
  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem(MEDIA_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid'; }
    catch { return 'grid'; }
  });

  useEffect(() => {
    const syncView = (event) => {
      const nextView = event.type === 'storage' ? event.newValue : event.detail;
      setViewState(nextView === 'list' ? 'list' : 'grid');
    };
    window.addEventListener('storage', syncView);
    window.addEventListener(MEDIA_VIEW_EVENT, syncView);
    return () => {
      window.removeEventListener('storage', syncView);
      window.removeEventListener(MEDIA_VIEW_EVENT, syncView);
    };
  }, []);

  const setView = useCallback((nextView) => {
    const value = nextView === 'list' ? 'list' : 'grid';
    setViewState(value);
    try { localStorage.setItem(MEDIA_VIEW_STORAGE_KEY, value); } catch {}
    window.dispatchEvent(new CustomEvent(MEDIA_VIEW_EVENT, { detail: value }));
  }, []);

  return [view, setView];
}

const SAFE_IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|webp)$/i;

function mediaType(file) {
  const declared = String(file?.contentType || file?.type || '').toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  const dataType = /^data:([^;,]+);base64,/i.exec(String(file?.data || ''))?.[1]?.toLowerCase();
  return dataType || declared;
}

export function isSafeImageMedia(file) {
  const type = mediaType(file);
  if (SAFE_IMAGE_TYPES.has(type)) return true;
  if (type && type !== 'application/octet-stream') return false;
  return IMAGE_EXTENSIONS.test(String(file?.filename || file?.name || ''));
}

export function isVideoMedia(file) {
  const type = mediaType(file);
  return type.startsWith('video/') || ((!type || type === 'application/octet-stream') && /\.(?:3gp|avi|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm)$/i.test(String(file?.filename || file?.name || '')));
}

export function isAudioMedia(file) {
  const type = mediaType(file);
  return type.startsWith('audio/') || ((!type || type === 'application/octet-stream') && /\.(?:aac|aiff?|alac|flac|m4a|mid|midi|mp3|oga|ogg|opus|wav|weba|wma)$/i.test(String(file?.filename || file?.name || '')));
}

const TEXT_TYPES = new Set(['application/json', 'application/ld+json', 'application/xml', 'application/yaml', 'application/x-yaml', 'application/toml', 'application/javascript', 'application/x-javascript', 'application/sql', 'application/rtf', 'application/x-sh', 'application/x-httpd-php', 'image/svg+xml']);
const TEXT_EXTENSIONS = /\.(?:txt|text|md|markdown|json|jsonl|xml|yaml|yml|toml|csv|tsv|log|ini|conf|cfg|js|jsx|mjs|cjs|ts|tsx|css|html|htm|sh|bash|py|rb|rs|go|java|c|h|cpp|hpp|sql|svg|rtf)$/i;

export function isTextMedia(file) {
  const type = mediaType(file).split(';', 1)[0];
  return type.startsWith('text/') || TEXT_TYPES.has(type)
    || ((!type || type === 'application/octet-stream') && TEXT_EXTENSIONS.test(String(file?.filename || file?.name || '')));
}

export function mediaKind(file) {
  if (isSafeImageMedia(file)) return 'image';
  if (isVideoMedia(file)) return 'video';
  if (isAudioMedia(file)) return 'audio';
  return 'file';
}
