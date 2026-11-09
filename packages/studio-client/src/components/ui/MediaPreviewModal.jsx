import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AudioLines, ChevronLeft, ChevronRight, Download, LoaderCircle, Maximize2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { mediaKind } from './mediaTypes.js';
//
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function MediaPlayer({ src, filename, kind, onError }) {
  const playerRef = useRef(null);
  const lastAudibleVolumeRef = useRef(1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const isVideo = kind === 'video';

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffering(false);
    setMuted(false);
    setVolume(1);
    lastAudibleVolumeRef.current = 1;
    if (playerRef.current) {
      playerRef.current.muted = false;
      playerRef.current.volume = 1;
    }
  }, [src]);

  const togglePlayback = async () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) {
      try { await player.play(); } catch { onError?.(); }
    } else player.pause();
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (!player.muted) {
      if (player.volume > 0) lastAudibleVolumeRef.current = player.volume;
      player.muted = true;
      setMuted(true);
      setVolume(0);
      return;
    }
    const restoredVolume = lastAudibleVolumeRef.current > 0 ? lastAudibleVolumeRef.current : 1;
    player.volume = restoredVolume;
    player.muted = false;
    setMuted(false);
    setVolume(restoredVolume);
  };

  const changeVolume = (event) => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    if (nextVolume > 0) lastAudibleVolumeRef.current = nextVolume;
    if (playerRef.current) {
      playerRef.current.volume = nextVolume;
      if (nextVolume > 0 && playerRef.current.muted) {
        playerRef.current.muted = false;
        setMuted(false);
      }
    }
  };

  const toggleFullscreen = () => {
    const target = playerRef.current?.closest('.project-media-custom-player');
    if (!target) return;
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFullscreen) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFullscreen) void exitFullscreen.call(document)?.catch?.(() => {});
      return;
    }
    const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
    if (requestFullscreen) void Promise.resolve(requestFullscreen.call(target)).catch(() => {});
  };

  const media = <>
    {isVideo
      ? <video ref={playerRef} className="project-media-viewer-video" src={src} playsInline preload="metadata" aria-label={filename}
        onClick={togglePlayback} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onLoadStart={() => setBuffering(true)} onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onLoadedMetadata={() => setBuffering(false)} onPlaying={() => setBuffering(false)}
        onError={() => { setBuffering(false); onError?.(); }} />
      : <div className="project-media-audio-art"><AudioLines size={38} aria-hidden="true" /><div><strong title={filename}>{filename}</strong><small>Audio file</small></div></div>}
    <div className="project-media-custom-controls">
      <button type="button" className="project-media-control-button" onClick={() => void togglePlayback()} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <span className="project-media-time">{formatTime(currentTime)}</span>
      <input className="project-media-seek" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || currentTime)} aria-label="Seek" onChange={(event) => { const time = Number(event.target.value); if (playerRef.current) playerRef.current.currentTime = time; setCurrentTime(time); }} />
      <span className="project-media-time">{formatTime(duration)}</span>
      <button type="button" className="project-media-control-button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
      <input className="project-media-volume" type="range" min="0" max="1" step="0.01" value={volume} aria-label="Volume" title={`Volume ${Math.round(volume * 100)}%`} onChange={changeVolume} />
      {isVideo && <button type="button" className="project-media-control-button" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen"><Maximize2 size={14} /></button>}
    </div>
    {buffering && <span className="project-media-buffering"><LoaderCircle size={17} /> Buffering</span>}
  </>;

  return <div className={`project-media-custom-player${isVideo ? ' is-video' : ' is-audio'}`}>
    {src && media}
    {isVideo ? null : src ? <audio ref={playerRef} className="project-media-audio-source" src={src} preload="metadata" aria-label={filename}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onDurationChange={(event) => setDuration(event.currentTarget.duration)} onLoadStart={() => setBuffering(true)} onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)}
      onPlaying={() => setBuffering(false)} onError={() => { setBuffering(false); onError?.(); }} /> : <AudioLines size={38} aria-hidden="true" />}
  </div>;
}

export function MediaPreviewModal({ asset, assets = [], onNavigate, onClose, onDownload }) {
  const [zoomed, setZoomed] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [imageLoadState, setImageLoadState] = useState({ src: '', status: 'loading' });
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackSource, setPlaybackSource] = useState('');
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const imageFrameRef = useRef(null);
  const previousFocusRef = useRef(null);
  const previousOverflowRef = useRef('');
  const isOpen = Boolean(asset);
  const assetIndex = assets.findIndex((item) => item.id === asset?.id);
  const canNavigate = assets.length > 1 && assetIndex >= 0;

  useEffect(() => {
    if (!asset) return undefined;
    previousFocusRef.current = document.activeElement;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflowRef.current;
      if (previousFocusRef.current instanceof HTMLElement && previousFocusRef.current.isConnected) previousFocusRef.current.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    setZoomed(false);
    setZoomScale(1);
    setPlaybackError(false);
  }, [asset?.id]);

  const getImageZoomScale = useCallback(() => {
    const image = imageFrameRef.current?.querySelector('img');
    if (!image) return 1;
    const baseWidth = image.clientWidth;
    const baseHeight = image.clientHeight;
    if (!baseWidth || !baseHeight) return 1;
    const availableWidth = Math.max(240, window.innerWidth - (canNavigate ? 176 : 96));
    const availableHeight = Math.max(180, window.innerHeight - 184);
    const naturalScale = Math.max(image.naturalWidth / baseWidth, image.naturalHeight / baseHeight);
    const preferredScale = Math.max(1.7, Math.min(naturalScale || 2.2, 2.8));
    return Math.max(1, Math.min(preferredScale, availableWidth / baseWidth, availableHeight / baseHeight));
  }, [canNavigate]);

  useEffect(() => {
    if (!zoomed) return undefined;
    const updateZoom = () => setZoomScale(getImageZoomScale());
    window.addEventListener('resize', updateZoom);
    return () => window.removeEventListener('resize', updateZoom);
  }, [zoomed, getImageZoomScale]);

  const handleViewerClick = (event) => {
    if (event.target.closest('button, input, video, audio, a, [role="slider"]')) return;
    if (event.target.closest('.project-media-image-frame, .project-media-viewer-video, .project-media-audio-art')) return;
    onClose?.();
  };

  const navigate = (offset) => {
    if (!canNavigate) return;
    const nextIndex = assetIndex + offset;
    if (nextIndex < 0 || nextIndex >= assets.length) return;
    onNavigate?.(assets[nextIndex]);
  };

  useEffect(() => {
    if (!asset) return undefined;
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === 'Escape') { onClose?.(); return; }
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])]
          .filter((element) => element.getAttribute('aria-hidden') !== 'true');
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (isTyping) return;
      if (event.key === 'ArrowLeft' && canNavigate) { event.preventDefault(); navigate(-1); }
      else if (event.key === 'ArrowRight' && canNavigate) { event.preventDefault(); navigate(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asset?.id, assetIndex, assets, canNavigate, onClose, onNavigate]);

  useEffect(() => {
    setPlaybackSource('');
    if (!asset?.data) return undefined;
    if (!/^data:[^;,]+;base64,/i.test(asset.data)) { setPlaybackSource(asset.data); return undefined; }
    let objectUrl = '';
    try {
      const encoded = asset.data.slice(asset.data.indexOf(',') + 1);
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: asset.contentType || 'application/octet-stream' }));
      setPlaybackSource(objectUrl);
    } catch { setPlaybackError(true); }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset?.id, asset?.data, asset?.contentType]);

  if (!asset) return null;
  const kind = mediaKind(asset);
  const isPlayable = kind === 'video' || kind === 'audio';
  const imageIsLoading = imageLoadState.src !== asset.data || imageLoadState.status === 'loading';
  const imageLoadError = imageLoadState.src === asset.data && imageLoadState.status === 'error';
  return createPortal(<div ref={dialogRef} className="discord-gallery-lightbox project-media-viewer" role="dialog" aria-modal="true" aria-label={`Preview ${asset.filename}`} tabIndex={-1} onClick={handleViewerClick}>
    <button ref={closeButtonRef} type="button" className="discord-gallery-lightbox-close" aria-label="Close media viewer" title="Close media viewer (Esc)" onClick={onClose}><X size={20} /></button>
    {canNavigate && <>
      <button type="button" className="project-media-viewer-nav is-previous" onClick={() => navigate(-1)} disabled={assetIndex === 0} aria-label="Previous media" title="Previous media (←)"><ChevronLeft size={21} /></button>
      <button type="button" className="project-media-viewer-nav is-next" onClick={() => navigate(1)} disabled={assetIndex === assets.length - 1} aria-label="Next media" title="Next media (→)"><ChevronRight size={21} /></button>
    </>}
    <figure className="discord-gallery-lightbox-content">
      {isPlayable
        ? <MediaPlayer src={playbackSource} filename={asset.filename} kind={kind} onError={() => setPlaybackError(true)} />
        : <div className="project-media-image-stage">
          <button ref={imageFrameRef} type="button" className={`project-media-image-frame${zoomed ? ' is-zoomed' : ''}${imageIsLoading || imageLoadError ? ' has-status' : ''}`} aria-label={zoomed ? 'Fit image to screen' : 'Enlarge image'} aria-pressed={zoomed} onClick={() => {
            if (zoomed) {
              setZoomed(false);
              setZoomScale(1);
            } else {
              setZoomScale(getImageZoomScale());
              setZoomed(true);
            }
          }}>
            {!imageLoadError && <img className="project-media-image" style={{ '--media-image-zoom': zoomScale }} src={asset.data} alt={asset.filename} draggable="false" onLoad={() => setImageLoadState({ src: asset.data, status: 'loaded' })} onError={() => setImageLoadState({ src: asset.data, status: 'error' })} />}
            {imageIsLoading && !imageLoadError && <span className="project-media-image-status" role="status"><LoaderCircle size={18} /> Loading image</span>}
            {imageLoadError && <span className="project-media-image-status is-error" role="alert"><AlertCircle size={18} /> This image could not be displayed</span>}
          </button>
        </div>}
      {playbackError && <span className="project-media-playback-error"><AlertCircle size={15} /> This {kind} format cannot be played here. Download the file to open it.</span>}
      <figcaption className="discord-gallery-lightbox-caption">{asset.filename}{canNavigate && <small>{assetIndex + 1} of {assets.length}</small>}</figcaption>
      {onDownload && <button type="button" className="project-media-viewer-download" onClick={() => void onDownload(asset)}><Download size={14} /> Download original</button>}
    </figure>
  </div>, document.body);
}
