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
const TEXT_EXTENSIONS = /\.(?:txt|text|md|markdown|json|jsonl|xml|yaml|yml|toml|csv|tsv|log|ini|conf|cfg|js|jsx|mjs|cjs|ts|tsx|css|html|htm|sh|bash|py|rb|rs|go|java|c|h|cpp|hpp|php|sql|svg|rtf)$/i;

function mediaExtension(file) {
  return /\.([a-z0-9]+)$/i.exec(String(file?.filename || file?.name || ''))?.[1]?.toLowerCase() || '';
}

export function getTextLanguage(file) {
  const extension = mediaExtension(file);
  const byExtension = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', php: 'php',
    css: 'css', html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    json: 'json', jsonl: 'jsonl', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    sql: 'sql', sh: 'shell', bash: 'shell', md: 'markdown', markdown: 'markdown',
    csv: 'csv', tsv: 'csv', ini: 'ini', conf: 'ini', cfg: 'ini'
  };
  if (byExtension[extension]) return byExtension[extension];
  const type = mediaType(file).split(';', 1)[0];
  if (/^(?:application|text)\/(?:x-)?javascript$/.test(type)) return 'javascript';
  if (/^(?:application|text)\/typescript$/.test(type)) return 'typescript';
  if (/^(?:application|text)\/(?:x-)?php$/.test(type) || type === 'application/x-httpd-php') return 'php';
  if (/^(?:application|text)\/(?:x-)?python$/.test(type)) return 'python';
  if (type === 'text/css') return 'css';
  if (type === 'text/html') return 'html';
  if (/(?:\+xml|\/xml)$/.test(type) || type === 'image/svg+xml') return 'xml';
  if (/(?:\+json|\/json)$/.test(type)) return 'json';
  if (/ya?ml/.test(type)) return 'yaml';
  if (/toml/.test(type)) return 'toml';
  if (/\/sql$/.test(type)) return 'sql';
  if (/x-(?:shellscript|sh)$/.test(type)) return 'shell';
  if (/markdown/.test(type)) return 'markdown';
  if (/csv|tab-separated/.test(type)) return 'csv';
  return '';
}

export function getMediaFileIconType(file) {
  const name = String(file?.filename || file?.name || '').toLowerCase();
  const type = mediaType(file);
  const extension = mediaExtension(file);
  if (/\.(?:arcproject|arcgraph|arcproject\.json|arcgraph\.json|arc\.json)$/.test(name)) return 'arc';
  if (/zip|compressed|archive/.test(type) || /^(?:zip|7z|rar|tar|gz)$/.test(extension)) return 'archive';
  const language = getTextLanguage(file);
  if (language === 'json' || language === 'jsonl') return 'json';
  if (language === 'html' || language === 'xml') return 'markup';
  if (language === 'javascript' || language === 'typescript' || language === 'css' || ['python', 'ruby', 'rust', 'go', 'java', 'c', 'cpp', 'php', 'sql'].includes(language)) return 'code';
  if (language === 'shell') return 'terminal';
  if (language === 'csv') return 'spreadsheet';
  if (language === 'yaml' || language === 'toml' || language === 'ini') return 'config';
  if (language === 'markdown' || type.startsWith('text/') || ['txt', 'text', 'log', 'rtf'].includes(extension)) return 'text';
  return 'file';
}

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
