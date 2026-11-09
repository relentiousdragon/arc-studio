import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, AudioLines, Download, LoaderCircle, Maximize2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
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

export function MediaPreviewModal({ asset, onClose, onDownload }) {
  const [zoomed, setZoomed] = useState(false);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isPanningImage, setIsPanningImage] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackSource, setPlaybackSource] = useState('');
  const imageFrameRef = useRef(null);
  const imagePointerRef = useRef(null);
  const suppressImageClickRef = useRef(false);

  useEffect(() => {
    if (!asset) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asset, onClose]);

  useEffect(() => {
    setZoomed(false);
    setImagePan({ x: 0, y: 0 });
    setIsPanningImage(false);
    imagePointerRef.current = null;
    suppressImageClickRef.current = false;
    setPlaybackError(false);
  }, [asset?.id]);

  const clampImagePan = (x, y) => {
    const frame = imageFrameRef.current;
    const image = frame?.querySelector('img');
    if (!frame || !image) return { x: 0, y: 0 };
    const bounds = image.getBoundingClientRect();
    const maxX = Math.max(0, (bounds.width - frame.clientWidth) / 2);
    const maxY = Math.max(0, (bounds.height - frame.clientHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  const startImagePan = (event) => {
    if (!zoomed || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    imagePointerRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: imagePan.x, panY: imagePan.y, moved: false };
  };

  const moveImagePan = (event) => {
    const drag = imagePointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    setIsPanningImage(true);
    setImagePan(clampImagePan(drag.panX + dx, drag.panY + dy));
  };

  const endImagePan = (event) => {
    const drag = imagePointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    imagePointerRef.current = null;
    setIsPanningImage(false);
    if (drag.moved) {
      suppressImageClickRef.current = true;
      window.setTimeout(() => { suppressImageClickRef.current = false; }, 0);
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const panImageWithWheel = (event) => {
    if (!zoomed) return;
    event.preventDefault();
    setImagePan((current) => clampImagePan(current.x - event.deltaX, current.y - event.deltaY));
  };

  const toggleImageZoom = () => {
    setImagePan({ x: 0, y: 0 });
    setZoomed((current) => !current);
  };

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
  return createPortal(<div className={`discord-gallery-lightbox project-media-viewer${zoomed ? ' is-image-zoomed' : ''}`} role="dialog" aria-modal="true" aria-label={`Preview ${asset.filename}`} onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <button type="button" className="discord-gallery-lightbox-close" aria-label="Close media viewer" title="Close media viewer" onClick={onClose}><X size={20} /></button>
    <figure className="discord-gallery-lightbox-content" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      {isPlayable
        ? <MediaPlayer src={playbackSource} filename={asset.filename} kind={kind} onError={() => setPlaybackError(true)} />
        : <button ref={imageFrameRef} type="button" className={`project-media-image-frame${zoomed ? ' is-zoomed' : ''}${isPanningImage ? ' is-panning-image' : ''}`} aria-label={zoomed ? 'Drag to pan, click to zoom out' : 'Zoom in'} aria-pressed={zoomed} title={zoomed ? 'Drag or scroll to pan · Click to zoom out' : 'Click to zoom in'} onPointerDown={startImagePan} onPointerMove={moveImagePan} onPointerUp={endImagePan} onPointerCancel={endImagePan} onLostPointerCapture={endImagePan} onWheel={panImageWithWheel} onClick={(event) => { if (suppressImageClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressImageClickRef.current = false; return; } if (event.target === event.currentTarget) { if (zoomed) toggleImageZoom(); else onClose?.(); } else toggleImageZoom(); }}>
          <img className="project-media-image" src={asset.data} alt={asset.filename} draggable="false" style={zoomed ? { transform: `translate3d(${imagePan.x}px, ${imagePan.y}px, 0) scale(1.5)` } : undefined} />
        </button>}
      {playbackError && <span className="project-media-playback-error"><AlertCircle size={15} /> This {kind} format cannot be played here. Download the file to open it.</span>}
      <figcaption className="discord-gallery-lightbox-caption">{asset.filename}</figcaption>
      {onDownload && <button type="button" className="project-media-viewer-download" onClick={() => void onDownload(asset)}><Download size={14} /> Download original</button>}
    </figure>
  </div>, document.body);
}
