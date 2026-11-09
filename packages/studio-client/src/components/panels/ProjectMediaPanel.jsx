import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, CodeXml, Download, File, FileArchive, FileCode2, FileImage, FileJson, FileSpreadsheet, FileTerminal, FileText, FileVideo, FileCog, List, Search, Trash2, Upload } from 'lucide-react';
import { MediaPreviewModal } from '../ui/MediaPreviewModal.jsx';
import { getMediaFileIconType, isTextMedia, mediaKind, useMediaView } from '../ui/mediaTypes.js';
//
function formatBytes(value = 0) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(asset) {
  const kind = mediaKind(asset);
  if (kind === 'image') return FileImage;
  if (kind === 'video') return FileVideo;
  if (kind === 'audio') return AudioLines;
  return ({
    archive: FileArchive,
    code: FileCode2,
    config: FileCog,
    json: FileJson,
    markup: CodeXml,
    spreadsheet: FileSpreadsheet,
    terminal: FileTerminal,
    text: FileText,
    file: File
  })[getMediaFileIconType(asset)] || File;
}

function MediaFileIcon({ asset, Icon }) {
  if (getMediaFileIconType(asset) === 'arc') return <img className="project-media-arc-icon" src="/arc.png" alt="" />;
  return <Icon size={30} aria-hidden="true" />;
}

export function ProjectMediaPanel({ assets = [], canEdit = true, onUpload, onDownload, onDelete, onLoadContent, onOpenText }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useMediaView();
  const [queue, setQueue] = useState([]);
  const [preview, setPreview] = useState(null);
  const [queueLeaving, setQueueLeaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const queueHideTimerRef = useRef(0);
  const queueClearTimerRef = useRef(0);
  const filtered = useMemo(() => assets.filter((asset) => `${asset.filename} ${asset.contentType}`.toLowerCase().includes(query.trim().toLowerCase())), [assets, query]);
  const previewableAssets = useMemo(() => filtered.filter((asset) => ['image', 'video', 'audio'].includes(mediaKind(asset))), [filtered]);
  const allUploadsSucceeded = queue.length > 0 && queue.every((item) => item.state === 'success');

  useEffect(() => {
    if (!allUploadsSucceeded) {
      window.clearTimeout(queueHideTimerRef.current);
      window.clearTimeout(queueClearTimerRef.current);
      setQueueLeaving(false);
      return undefined;
    }
    queueHideTimerRef.current = window.setTimeout(() => {
      setQueueLeaving(true);
      queueClearTimerRef.current = window.setTimeout(() => {
        setQueue([]);
        setQueueLeaving(false);
      }, 240);
    }, 2000);
    return () => {
      window.clearTimeout(queueHideTimerRef.current);
      window.clearTimeout(queueClearTimerRef.current);
    };
  }, [allUploadsSucceeded]);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !onUpload) return;
    const jobs = files.map((file, index) => ({ id: `${Date.now()}_${index}_${Math.random()}`, file, name: file.name, progress: 0, state: 'queued', message: 'Waiting' }));
    setError('');
    setQueueLeaving(false);
    setQueue((current) => [...current, ...jobs]);
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        setQueue((current) => current.map((item) => item.id === job.id ? { ...item, state: 'uploading', message: 'Uploading' } : item));
        try {
          await onUpload(job.file, (progress) => setQueue((current) => current.map((item) => item.id === job.id ? { ...item, progress } : item)));
          setQueue((current) => current.map((item) => item.id === job.id ? { ...item, state: 'success', progress: 100, message: 'Uploaded' } : item));
        } catch (uploadError) {
          setQueue((current) => current.map((item) => item.id === job.id ? { ...item, state: 'error', message: uploadError.message || 'Upload failed' } : item));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  };

  const handleDownload = async (asset) => {
    setError('');
    try { await onDownload?.(asset); }
    catch (downloadError) { setError(downloadError.message || 'Download failed.'); }
  };

  const openPreview = async (asset) => {
    if (!onLoadContent) { setPreview(asset); return; }
    try { setPreview(await onLoadContent(asset)); }
    catch (previewError) { setError(previewError.message || 'Could not open this media file.'); }
  };

  return <section className="project-media-panel" aria-label="Project media assets">
    <header className="project-media-toolbar">
      <label className="project-media-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter files" aria-label="Filter project media" /></label>
      <div className="project-media-actions">
        <button type="button" className={view === 'grid' ? 'is-active' : ''} title="Large thumbnails" aria-label="Large thumbnail view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><FileImage size={14} /></button>
        <button type="button" className={view === 'list' ? 'is-active' : ''} title="List view" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} /></button>
        <button type="button" className="project-media-upload" disabled={!canEdit || !onUpload} onClick={() => inputRef.current?.click()}><Upload size={13} /> Upload</button>
        <input ref={inputRef} hidden type="file" multiple onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }} />
      </div>
    </header>
    {error && <p className="project-media-error" role="alert">{error}</p>}
    {!!queue.length && <div className={`project-media-queue${queueLeaving ? ' is-leaving' : ''}`} aria-live="polite"><strong>Upload queue <span>{queue.filter((item) => ['success', 'error'].includes(item.state)).length} / {queue.length}</span></strong>{queue.map((item) => <div className={`project-media-queue-item is-${item.state}`} key={item.id}><span title={item.name}>{item.name}</span><small>{item.message}</small>{item.state === 'queued' || item.state === 'uploading' ? <progress max="100" value={item.progress} aria-label={`${item.name} upload progress`} /> : <b>{item.state === 'success' ? 'Done' : 'Failed'}</b>}</div>)}<button type="button" onClick={() => setQueue((current) => current.filter((item) => !['success', 'error'].includes(item.state)))} disabled={queue.some((item) => item.state === 'uploading')}>Clear completed</button></div>}
    <div className={`project-media-grid ${view === 'list' ? 'is-list' : ''}`}>
      {filtered.map((asset) => {
        const Icon = iconFor(asset);
        const kind = mediaKind(asset);
        const isPreviewable = kind === 'image' || kind === 'video' || kind === 'audio';
        const isText = isTextMedia(asset);
        return <article className="project-media-card" key={asset.id}>
          <button type="button" className="project-media-open" disabled={!isPreviewable && !(isText && onOpenText)} onClick={() => isText ? void onOpenText?.(asset) : void openPreview(asset)} title={isPreviewable ? `Preview ${asset.filename}` : isText ? `Open ${asset.filename} in Text Studio` : `Use the download button to save ${asset.filename}`} aria-label={isPreviewable ? `Preview ${asset.filename}` : isText ? `Open ${asset.filename} in read only Text Studio` : `${asset.filename}. Use the download button to save this file`}>
            <span className={`project-media-thumbnail${getMediaFileIconType(asset) === 'arc' ? ' is-arc-file' : ''}`}>{asset.preview && (kind === 'image' || kind === 'video') ? <img src={asset.preview} alt="" loading="lazy" /> : <MediaFileIcon asset={asset} Icon={Icon} />}</span>
            <span className="project-media-card-info"><strong title={asset.filename}>{asset.filename}</strong><small>{asset.contentType || 'Unknown type'} · {formatBytes(asset.size)}</small></span>
          </button>
          <div className="project-media-card-actions"><button type="button" onClick={() => void handleDownload(asset)} aria-label={`Download ${asset.filename}`} title="Download"><Download size={13} /></button>{canEdit && <button type="button" onClick={() => onDelete?.(asset)} aria-label={`Delete ${asset.filename}`} title="Delete from project"><Trash2 size={13} /></button>}</div>
        </article>;
      })}
      {!filtered.length && <div className="project-media-empty">{assets.length ? 'No files match this filter.' : 'No project media yet. Upload files to use them across this project.'}</div>}
    </div>
    <MediaPreviewModal asset={preview} assets={previewableAssets} onNavigate={openPreview} onClose={() => setPreview(null)} onDownload={onDownload ? handleDownload : undefined} />
  </section>;
}
