import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { readAppStorage, writeAppStorage } from '../../core/storage.js';

const LH = 4;
const CW = 1.4;
const PAD = 8;
const MIN_W = 52;
const MAX_W = 200;
const DEF_W = 86;

const DARK = {
  text: '#d7dae0', keyword: '#c792ea', 'json-key': '#82aaff', string: '#c3e88d',
  number: '#f78c6c', literal: '#f78c6c', comment: '#697386', function: '#82aaff',
  punctuation: '#89ddff', heading: '#ffcb6b', strong: '#ffcb6b', 'inline-code': '#c3e88d',
  strikethrough: '#8993a4', spoiler: '#c792ea', emphasis: '#f78c6c', link: '#82aaff',
  quote: '#89ddff', list: '#ffcb6b', subtext: '#8993a4', fence: '#697386',
  'diff-added': '#c3e88d', 'diff-removed': '#f07178', 'diff-meta': '#82aaff',
  template: '#c792ea',
};
const LIGHT = {
  text: '#1f2328', keyword: '#8250df', 'json-key': '#0550ae', string: '#0a7d3f',
  number: '#b35900', literal: '#b35900', comment: '#6e7781', function: '#8250df',
  punctuation: '#57606a', heading: '#953800', strong: '#953800', 'inline-code': '#116329',
  strikethrough: '#6e7781', spoiler: '#8250df', emphasis: '#b35900', link: '#0969da',
  quote: '#0a7d3f', list: '#953800', subtext: '#6e7781', fence: '#6e7781',
  'diff-added': '#116329', 'diff-removed': '#cf222e', 'diff-meta': '#0969da',
  template: '#8250df',
};

const CODE_RE = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|--.*|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|function|return|if|else|for|while|class|new|this|import|from|export|default|async|await|try|catch|throw|true|false|null|undefined|None|True|False|def|print|interface|type|extends|implements|public|private|static|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AS|AND|OR|NOT)\b|\b[A-Za-z_$][\w$]*(?=\s*\()|[{}()[\],.;:]|[=+*/<>!-]+)/gi;
const JSON_RE = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
const MD_RE = /(`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\|\|[^|]+\|\||\*[^*]+\*|_[^_]+_|https?:\/\/[^\s]+)/g;
const TMPL_RE = /(?<!\\)\{\{[^{}]*\}\}/g;
//
function classifyCode(token, after) {
  if (/^(?:"|'|`)/.test(token)) return 'string';
  if (/^(?:\/\/|#|--)/.test(token)) return 'comment';
  if (/^\d/.test(token)) return 'number';
  if (/^(?:true|false|null|undefined|None|True|False)$/i.test(token)) return 'literal';
  if (/^(?:const|let|var|function|return|if|else|for|while|class|new|this|import|from|export|default|async|await|try|catch|throw|def|print|interface|type|extends|implements|public|private|static|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AS|AND|OR|NOT)$/i.test(token)) return 'keyword';
  if (/^[A-Za-z_$]/.test(token) && /^\s*\(/.test(after)) return 'function';
  return 'punctuation';
}

function classifyJson(token, after) {
  if (token.startsWith('"') && after.trimStart().startsWith(':')) return 'json-key';
  if (token.startsWith('"')) return 'string';
  if (/^(?:true|false|null)$/.test(token)) return 'literal';
  if (/^-?\d/.test(token)) return 'number';
  return 'punctuation';
}

function classifyMd(token) {
  if (token.startsWith('`')) return 'inline-code';
  if (token.startsWith('**') || token.startsWith('__')) return 'strong';
  if (token.startsWith('~~')) return 'strikethrough';
  if (token.startsWith('||')) return 'spoiler';
  if (token.startsWith('http')) return 'link';
  return 'emphasis';
}

function drawBar(ctx, line, y, lh, cw, maxW, color, alpha) {
  const indent = (line.match(/^\s*/)?.[0] || '').length;
  const textLen = line.trimEnd().length - indent;
  if (textLen <= 0) return;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  const x = indent * cw;
  const w = Math.min(textLen * cw, maxW - x);
  if (w > 0) ctx.fillRect(x, y, w, lh - 1);
  ctx.globalAlpha = 1;
}

function drawTokens(ctx, line, y, lh, cw, maxW, regex, classify, colors) {
  let drawn = false;
  for (const m of line.matchAll(new RegExp(regex.source, regex.flags))) {
    const tok = m[0];
    const s = m.index ?? 0;
    const type = classify(tok, line.slice(s + tok.length));
    ctx.fillStyle = colors[type] || colors.text;
    ctx.globalAlpha = type === 'comment' ? 0.45 : 0.75;
    const x = s * cw;
    const w = Math.min(tok.length * cw, maxW - x);
    if (w > 0 && x < maxW) { ctx.fillRect(x, y, w, lh - 1); drawn = true; }
  }
  if (!drawn) drawBar(ctx, line, y, lh, cw, maxW, colors.text, 0.3);
  ctx.globalAlpha = 1;
}

function drawCompactTokens(ctx, line, y, lh, cw, maxW, regex, classify, colors) {
  drawBar(ctx, line, y, lh, cw, maxW, colors.text, 0.2);
  const sample = line.slice(0, 320);
  regex.lastIndex = 0;
  let count = 0;
  let match;
  while ((match = regex.exec(sample)) && count < 18) {
    const token = match[0];
    const start = match.index;
    const type = classify(token, sample.slice(start + token.length));
    ctx.fillStyle = colors[type] || colors.text;
    ctx.globalAlpha = type === 'comment' ? 0.55 : 0.9;
    const x = start * cw;
    const width = Math.min(token.length * cw, maxW - x);
    if (width > 0 && x < maxW) ctx.fillRect(x, y, width, Math.max(1, lh - 1));
    count += 1;
  }
  ctx.globalAlpha = 1;
}

function paintMinimap(canvas, lines, isJson, lh, colors, simplified, language) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  if (w <= 0) return;
  const totalH = Math.ceil(lines.length * lh + PAD * 2);
  const crispRows = simplified && lines.length > 1500;
  const pixelRows = crispRows
    ? Math.min(16384, Math.max(1, lines.length))
    : Math.min(8192, Math.round(totalH * dpr));
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, pixelRows);
  canvas.style.height = `${totalH}px`;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.setTransform(canvas.width / w, 0, 0, crispRows ? 1 : canvas.height / totalH, 0, 0);
  ctx.clearRect(0, 0, w, totalH);
  const maxW = w - 4;
  const codeLanguage = Boolean(language && !['markdown', 'text', 'plain', 'plaintext'].includes(language));
  const rowStride = crispRows ? pixelRows / lines.length : lh;
  const rowStart = crispRows ? (PAD / totalH) * pixelRows : PAD;
  const drawLineHeight = crispRows ? 2 : lh;
  let inFence = false;
  let fenceLang = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = crispRows ? rowStart + i * rowStride : PAD + i * lh;
    if (!line.trim()) continue;
    if (simplified) {
      const useJson = isJson || language === 'json' || language === 'jsonl';
      const useCode = codeLanguage && !useJson;
      const regex = useJson ? JSON_RE : useCode ? CODE_RE : MD_RE;
      const classify = useJson ? classifyJson : useCode ? classifyCode : classifyMd;
      drawCompactTokens(ctx, line, y, drawLineHeight, CW, maxW, regex, classify, colors);
      continue;
    }
    const fenceMatch = line.match(/^\s*```([^`]*)$/);
    if (fenceMatch && !inFence) {
      fenceLang = fenceMatch[1].trim().split(/\s+/)[0] || '';
      inFence = true;
      drawBar(ctx, line, y, lh, CW, maxW, colors.fence, 0.5);
      continue;
    }
    if (inFence && /^\s*```\s*$/.test(line)) {
      inFence = false;
      drawBar(ctx, line, y, lh, CW, maxW, colors.fence, 0.5);
      continue;
    }
    if (inFence) {
      if (fenceLang === 'diff') {
        const diffType = line.startsWith('+') ? 'diff-added' : line.startsWith('-') ? 'diff-removed' : line.startsWith('@@') ? 'diff-meta' : '';
        if (diffType) { drawBar(ctx, line, y, lh, CW, maxW, colors[diffType], 0.7); }
        else drawTokens(ctx, line, y, lh, CW, maxW, CODE_RE, classifyCode, colors);
      } else {
        const useJson = fenceLang === 'json' || isJson;
        drawTokens(ctx, line, y, lh, CW, maxW, useJson ? JSON_RE : CODE_RE, useJson ? classifyJson : classifyCode, colors);
      }
    } else if (isJson || language === 'json' || language === 'jsonl') {
      drawTokens(ctx, line, y, lh, CW, maxW, JSON_RE, classifyJson, colors);
    } else if (codeLanguage) {
      drawTokens(ctx, line, y, lh, CW, maxW, CODE_RE, classifyCode, colors);
    } else {
      const trimmed = line.trimStart();
      if (/^#{1,6}\s/.test(trimmed)) { drawBar(ctx, line, y, lh, CW, maxW, colors.heading, 0.8); }
      else if (/^>\s?/.test(trimmed)) { drawBar(ctx, line, y, lh, CW, maxW, colors.quote, 0.6); }
      else if (/^(?:[-*+]\s|\d+\.\s)/.test(trimmed)) { drawBar(ctx, line, y, lh, CW, maxW, colors.list, 0.6); }
      else if (/^-#\s/.test(trimmed)) { drawBar(ctx, line, y, lh, CW, maxW, colors.subtext, 0.5); }
      else drawTokens(ctx, line, y, lh, CW, maxW, MD_RE, classifyMd, colors);
    }
    for (const tm of line.matchAll(new RegExp(TMPL_RE.source, TMPL_RE.flags))) {
      const s = tm.index ?? 0;
      ctx.fillStyle = colors.template;
      ctx.globalAlpha = 0.6;
      const x = s * CW;
      const tw = Math.min(tm[0].length * CW, maxW - x);
      if (tw > 0 && x < maxW) ctx.fillRect(x, y, tw, lh - 1);
      ctx.globalAlpha = 1;
    }
  }
}

export function EditorMinimap({ text, lines: providedLines, simplified = false, language = '', isJson, jsonIssueLines, searchMatches = [], searchOpen = false, scrollTop, scrollHeight, viewHeight, editorLineHeight = 22, onScrollTo }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [containerH, setContainerH] = useState(400);
  const [minimapW, setMinimapW] = useState(() => {
    try { return Math.max(MIN_W, Math.min(MAX_W, Number(readAppStorage('arc_minimap_width')) || DEF_W)); }
    catch { return DEF_W; }
  });
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light');

  useEffect(() => {
    const ob = new MutationObserver(() => setDark(document.documentElement.getAttribute('data-theme') !== 'light'));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerH(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lines = useMemo(() => providedLines || text.split('\n'), [providedLines, text]);
  const colors = useMemo(() => dark ? DARK : LIGHT, [dark]);
  const lh = useMemo(() => Math.min(LH, Math.max(2, 16000 / Math.max(1, lines.length))), [lines.length]);
  const totalMinimapH = lines.length * lh + PAD * 2;
  const editorMaxScroll = Math.max(0, scrollHeight - viewHeight);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintMinimap(canvas, lines, isJson, lh, colors, simplified, language);
  }, [lines, isJson, lh, colors, minimapW, simplified, language]);

  const vpScreenH = Math.max(16, (viewHeight / Math.max(1, scrollHeight)) * containerH);
  const vpScreenTop = editorMaxScroll > 0
    ? (scrollTop / editorMaxScroll) * Math.max(0, containerH - vpScreenH)
    : 0;
  const minimapOffset = editorMaxScroll > 0
    ? (scrollTop / editorMaxScroll) * Math.max(0, totalMinimapH - containerH)
    : 0;

  const searchMatchLineSet = useMemo(() => {
    if (!searchOpen || !searchMatches.length) return new Set();
    const set = new Set();
    const offsets = [];
    let off = 0;
    for (const line of lines) { offsets.push(off); off += line.length + 1; }
    for (const match of searchMatches) {
      let lo = 0, hi = offsets.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (offsets[mid] <= match.start) lo = mid; else hi = mid - 1; }
      set.add(lo + 1);
    }
    return set;
  }, [lines, searchMatches, searchOpen]);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || editorMaxScroll <= 0) return;
    const clickY = event.clientY - rect.top;
    if (clickY >= vpScreenTop && clickY <= vpScreenTop + vpScreenH) {
      dragRef.current = { offsetY: clickY - vpScreenTop };
    } else {
      const fraction = Math.max(0, Math.min(1, clickY / Math.max(1, containerH)));
      onScrollTo(fraction * editorMaxScroll);
      dragRef.current = { offsetY: vpScreenH / 2 };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [vpScreenTop, vpScreenH, containerH, editorMaxScroll, onScrollTo]);

  const handlePointerMove = useCallback((event) => {
    if (!dragRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const desiredTop = event.clientY - rect.top - dragRef.current.offsetY;
    const fraction = Math.max(0, Math.min(1, desiredTop / Math.max(1, containerH - vpScreenH)));
    onScrollTo(fraction * editorMaxScroll);
  }, [containerH, vpScreenH, editorMaxScroll, onScrollTo]);

  const handlePointerUp = useCallback((event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const handleWheel = useCallback((event) => {
    onScrollTo(Math.max(0, Math.min(scrollTop + event.deltaY, editorMaxScroll)));
  }, [scrollTop, editorMaxScroll, onScrollTo]);

  const handleResizeDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { startX: event.clientX, startW: minimapW };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [minimapW]);

  const handleResizeMove = useCallback((event) => {
    if (!resizeRef.current) return;
    const delta = event.clientX - resizeRef.current.startX;
    setMinimapW(Math.max(MIN_W, Math.min(MAX_W, resizeRef.current.startW - delta)));
  }, []);

  const handleResizeUp = useCallback((event) => {
    if (resizeRef.current) writeAppStorage('arc_minimap_width', String(Math.round(minimapW)));
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [minimapW]);

  return (
    <div className="editor-minimap" ref={containerRef} style={{ width: minimapW }}>
      <div className="editor-minimap-resize" onPointerDown={handleResizeDown} onPointerMove={handleResizeMove} onPointerUp={handleResizeUp} onPointerCancel={handleResizeUp} data-tooltip="Drag to resize minimap" />
      <canvas className="editor-minimap-canvas" ref={canvasRef} style={{ transform: `translateY(${-minimapOffset}px)` }} />
      <div className="editor-minimap-viewport" style={{ top: vpScreenTop, height: vpScreenH }} />
      <div className="editor-minimap-marks" style={{ transform: `translateY(${-minimapOffset}px)` }}>
        {Array.from(jsonIssueLines).map((line) => (
          <span key={`e${line}`} className="editor-minimap-mark-error" style={{ top: PAD + (line - 1) * lh }} />
        ))}
        {Array.from(searchMatchLineSet).map((line) => (
          <span key={`s${line}`} className="editor-minimap-mark-search" style={{ top: PAD + (line - 1) * lh }} />
        ))}
      </div>
      <div className="editor-minimap-overlay" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} />
    </div>
  );
}

