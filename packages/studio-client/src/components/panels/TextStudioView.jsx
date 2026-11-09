import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, LoaderCircle, Search, X } from 'lucide-react';
import { countDiscordCodeBlocks, detectDiscordCodeLanguages, inferDiscordCodeLanguage } from '../ui/DiscordLongTextField.jsx';
import { TemplateSyntaxHelp } from '../ui/TemplateSyntaxHelp.jsx';
import { renderTextTemplate } from '../../../../studio-server/src/engine/TemplateExpressions.js';
import { DiscordTextField } from '../ui/DiscordTextField.jsx';
import { EditorMinimap } from './EditorMinimap.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { notifyStudioSwitchCancelled, useStudioEscape, useStudioSwitchClose } from './useStudioEscape.js';
import { getJsonIssues } from '../../core/jsonDiagnostics.js';
import { replaceNullTemplateValues } from '../../core/templatePreview.js';
import { getTextLanguage } from '../ui/mediaTypes.js';

const CODE_TOKENS = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*.*?\*\/|\/\/.*|--.*|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|function|return|if|else|elif|for|while|class|new|this|import|from|export|default|async|await|try|catch|throw|true|false|null|undefined|None|True|False|def|print|pass|lambda|fn|mut|impl|struct|enum|pub|use|mod|match|self|package|func|defer|chan|range|go|select|void|int|String|boolean|char|long|short|float|double|static|public|private|protected|interface|type|extends|implements|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AS|AND|OR|NOT)\b|\b[A-Za-z_$][\w$]*(?=\s*\()|[{}()[\],.;:]|[=+*/<>!-]+)/gi;
const MARKDOWN_TOKENS = /(`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\|\|[^|]+\|\||\*[^*]+\*|_[^_]+_|https?:\/\/[^\s]+)/g;
const JSON_TOKENS = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
const MARKUP_TOKENS = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w:.-]*|\/?>|[A-Za-z_:][\w:.-]*(?=\s*=)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|=|&(?:#[\da-f]+|#\d+|[A-Za-z][\w]+);/gi;
const CSS_TOKENS = /\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-f]{3,8}\b|@[A-Za-z_-][\w-]*|\b\d+(?:\.\d+)?(?:%|[A-Za-z]+)?\b|[A-Za-z_-][\w-]*|[{}()[\]:;,]/gi;
const CONFIG_TOKENS = /#.*|;.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|-?\b\d+(?:\.\d+)?\b|\b(?:true|false|null|yes|no|on|off)\b|[:=\[\]{},]/gi;
//
function highlightJson(line) {
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(JSON_TOKENS)) {
    const token = match[0];
    const start = match.index ?? cursor;
    if (start > cursor) tokens.push(line.slice(cursor, start));
    const type = token.startsWith('"') ? (line.slice(start + token.length).trimStart().startsWith(':') ? 'json-key' : 'string')
      : /^(?:true|false|null)$/.test(token) ? 'literal'
        : /^-?\d/.test(token) ? 'number' : 'punctuation';
    tokens.push(<span key={`${start}-${token}`} className={`syntax-${type}`}>{token}</span>);
    cursor = start + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens.length ? tokens : ' ';
}

function getSearchMatches(text, query, { matchCase, wholeWord, useRegex }) {
  if (!query) return { matches: [], error: '' };
  let expression;
  try {
    const source = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expression = new RegExp(source, `gu${matchCase ? '' : 'i'}`);
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : 'Invalid regular expression' };
  }
  const matches = [];
  for (const match of text.matchAll(expression)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (end === start) continue;
    if (wholeWord && (/[\p{L}\p{N}_]/u.test(text[start - 1] || '') || /[\p{L}\p{N}_]/u.test(text[end] || ''))) continue;
    matches.push({ start, end });
  }
  return { matches, error: '' };
}

function renderSearchLine(line, lineStart, matches, activeMatchIndex, startIndex) {
  const lineEnd = lineStart + line.length;
  const segments = [];
  let cursor = 0;
  let index = startIndex;
  while (index < matches.length && matches[index].end <= lineStart) index += 1;
  for (; index < matches.length && matches[index].start < lineEnd; index += 1) {
    const match = matches[index];
    const start = Math.max(match.start, lineStart);
    const end = Math.min(match.end, lineEnd);
    if (start >= end) continue;
    if (start > cursor + lineStart) segments.push(line.slice(cursor, start - lineStart));
    segments.push(<mark key={`${index}-${start}`} className={index === activeMatchIndex ? 'is-active' : ''}>{line.slice(start - lineStart, end - lineStart)}</mark>);
    cursor = end - lineStart;
  }
  if (cursor < line.length) segments.push(line.slice(cursor));
  const nextIndex = index > startIndex && matches[index - 1].end > lineEnd + 1 ? index - 1 : index;
  return { content: segments.length ? segments : line || ' ', nextIndex };
}

function highlightTokenMatches(line, expression, classify) {
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(expression)) {
    const token = match[0];
    const start = match.index ?? cursor;
    if (start > cursor) tokens.push(line.slice(cursor, start));
    const type = classify(token, start);
    tokens.push(type ? <span key={`${start}-${token}`} className={`syntax-${type}`}>{token}</span> : token);
    cursor = start + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens.length ? tokens : line || ' ';
}

function highlightMarkup(line) {
  return highlightTokenMatches(line, MARKUP_TOKENS, (token) => {
    if (token.startsWith('<!--')) return 'comment';
    if (token.startsWith('<')) return 'keyword';
    if (token.startsWith('"') || token.startsWith("'") || token.startsWith('&')) return 'string';
    if (token === '=' || token === '>' || token === '/>') return 'punctuation';
    return 'function';
  });
}

function highlightCss(line) {
  const inDeclaration = line.lastIndexOf('{') > line.lastIndexOf('}');
  return highlightTokenMatches(line, CSS_TOKENS, (token, start) => {
    if (token.startsWith('/*')) return 'comment';
    if (token.startsWith('"') || token.startsWith("'")) return 'string';
    if (token.startsWith('@')) return 'keyword';
    if (/^#[\da-f]{3,8}$/i.test(token)) return 'number';
    if (/^\d/.test(token)) return 'number';
    if (/^[{}()[\]:;,]$/.test(token)) return 'punctuation';
    if (/^[A-Za-z_-]/.test(token) && /^\s*:/.test(line.slice(start + token.length))) return 'function';
    if (!inDeclaration && /^[A-Za-z_-]/.test(token)) return 'keyword';
    return '';
  });
}

function highlightConfig(line) {
  const keyMatch = /^(\s*)([^\s:=#[\],{}]+)(\s*)(?=[:=])/.exec(line);
  const highlightedKeyEnd = keyMatch ? keyMatch[0].length : 0;
  const content = highlightTokenMatches(line.slice(highlightedKeyEnd), CONFIG_TOKENS, (token) => {
    if (token.startsWith('#') || token.startsWith(';')) return 'comment';
    if (token.startsWith('"') || token.startsWith("'")) return 'string';
    if (/^(?:true|false|null|yes|no|on|off)$/i.test(token)) return 'literal';
    if (/^-?\d/.test(token)) return 'number';
    return 'punctuation';
  });
  if (!keyMatch) return content;
  return <>{line.slice(0, keyMatch[1].length)}<span className="syntax-json-key">{keyMatch[2]}</span>{line.slice(keyMatch[1].length + keyMatch[2].length, highlightedKeyEnd)}{content}</>;
}

function highlightCsv(line) {
  return highlightTokenMatches(line, /"(?:""|[^"])*"|[^\t,]+|[\t,]/g, (token) => {
    if (token.startsWith('"')) return 'string';
    if (token === ',' || token === '\t') return 'punctuation';
    if (/^-?\d+(?:\.\d+)?$/.test(token.trim())) return 'number';
    return '';
  });
}

function highlightCode(line, language) {
  if (language === 'diff') {
    const kind = line.startsWith('+') ? 'diff-added' : line.startsWith('-') ? 'diff-removed' : line.startsWith('@@') ? 'diff-meta' : '';
    return kind ? <span className={`syntax-${kind}`}>{line || ' '}</span> : line || ' ';
  }
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(CODE_TOKENS)) {
    const token = match[0];
    const start = match.index ?? cursor;
    if (start > cursor) tokens.push(line.slice(cursor, start));
    let type = 'punctuation';
    if (/^(?:"|'|`)/.test(token)) type = 'string';
    else if (/^(?:\/\/|\/\*|--)/.test(token) || (token.startsWith('#') && ['python', 'ruby', 'shell'].includes(language))) type = 'comment';
    else if (/^\d/.test(token)) type = 'number';
    else if (/^(?:true|false|null|undefined|None|True|False)$/i.test(token)) type = 'literal';
    else if (/^(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AS|AND|OR|NOT)$/i.test(token)) type = 'keyword';
    else if (/^(?:const|let|var|function|return|if|else|elif|for|while|class|new|this|import|from|export|default|async|await|try|catch|throw|def|print|pass|lambda|fn|mut|impl|struct|enum|pub|use|mod|match|self|package|func|defer|chan|range|go|void|int|string|boolean|char|long|short|float|double|interface|type|extends|implements|public|private|protected|static|echo|namespace|use|trait|yield|foreach|endforeach|endif)$/.test(token)) type = 'keyword';
    else if (/^[A-Za-z_$]/.test(token) && /\($/.test(line.slice(start + token.length).match(/^\s*\(/)?.[0] || '')) type = 'function';
    tokens.push(<span key={`${start}-${token}`} className={`syntax-${type}`}>{token}</span>);
    cursor = start + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens.length ? tokens : ' ';
}

function highlightMarkdown(line) {
  const trimmed = line.trimStart();
  let lineClass = '';
  if (/^#{1,6}\s/.test(trimmed)) lineClass = 'syntax-heading';
  else if (/^>\s?/.test(trimmed)) lineClass = 'syntax-quote';
  else if (/^(?:[-*+]\s|\d+\.\s)/.test(trimmed)) lineClass = 'syntax-list';
  else if (/^-#\s/.test(trimmed)) lineClass = 'syntax-subtext';
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(MARKDOWN_TOKENS)) {
    const token = match[0];
    const start = match.index ?? cursor;
    if (start > cursor) tokens.push(line.slice(cursor, start));
    const type = token.startsWith('`') ? 'inline-code'
      : token.startsWith('**') || token.startsWith('__') ? 'strong'
        : token.startsWith('~~') ? 'strikethrough'
          : token.startsWith('||') ? 'spoiler'
            : token.startsWith('http') ? 'link' : 'emphasis';
    tokens.push(<span key={`${start}-${token}`} className={`syntax-${type}`}>{token}</span>);
    cursor = start + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return <span className={lineClass}>{tokens.length ? tokens : line || ' '}</span>;
}

function highlightSourceLine(line, language) {
  if (language === 'json' || language === 'jsonl') return highlightJson(line);
  if (language === 'html' || language === 'xml') return highlightMarkup(line);
  if (language === 'css') return highlightCss(line);
  if (language === 'yaml' || language === 'toml' || language === 'ini') return highlightConfig(line);
  if (language === 'csv') return highlightCsv(line);
  if (language === 'markdown') return highlightMarkdown(line);
  return highlightCode(line, language);
}

function buildHighlightedLines(text, isJson, sourceLanguage = '') {
  let language = '';
  let inFence = false;
  return String(text ?? '').split('\n').map((line, index, allLines) => {
    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence && !inFence) {
      const explicit = fence[1].trim().split(/\s+/)[0];
      const end = allLines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^\s*```\s*$/.test(candidate));
      language = explicit || inferDiscordCodeLanguage(allLines.slice(index + 1, end < 0 ? allLines.length : end).join('\n'));
      inFence = true;
      return { content: <span className="syntax-fence">{line || ' '}</span>, isCode: true };
    }
    if (inFence && /^\s*```\s*$/.test(line)) {
      inFence = false;
      return { content: <span className="syntax-fence">{line || ' '}</span>, isCode: true };
    }
    const detectedLanguage = sourceLanguage || (isJson ? 'json' : '');
    return {
      content: inFence ? highlightSourceLine(line, language) : detectedLanguage ? highlightSourceLine(line, detectedLanguage) : highlightMarkdown(line),
      isCode: inFence || Boolean(detectedLanguage)
    };
  });
}

export function TextStudioView({ label, contentType = '', value = '', readOnly = false, plainText = false, loading = false, loadError = '', sharedDraft, remoteCursors = [], collaborators = [], appEmojis = [], graphVariables = [], templateValuePaths = [], templateSuggestions = [], templateFunctions = [], connectedTemplateArguments = [], templatePreviewValues = {}, maxLength, onApply, onClose, onDraftChange, onCursorChange }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const [activePane, setActivePane] = useState('editor');
  const [scrollMetrics, setScrollMetrics] = useState({ top: 0, height: 0, view: 0 });
  const [previewScrollMetrics, setPreviewScrollMetrics] = useState({ top: 0, height: 0, view: 0 });
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const editorRef = useRef(null);
  const searchInputRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const beforeInputRef = useRef(null);
  const gutterRef = useRef(null);
  const codeLayerRef = useRef(null);
  const searchLayerRef = useRef(null);
  const remoteCaretLayerRef = useRef(null);
  const previewScrollRef = useRef(null);
  const lines = useMemo(() => draft.split('\n'), [draft]);
  const largeFileMode = lines.length > 2500 || draft.length > 200000;
  const blocks = useMemo(() => plainText || largeFileMode ? [] : countDiscordCodeBlocks(draft), [draft, largeFileMode, plainText]);
  const characterCount = useMemo(() => largeFileMode ? draft.length : Array.from(draft).length, [draft, largeFileMode]);
  const sourceLanguage = useMemo(() => getTextLanguage({ filename: label, contentType }), [label, contentType]);
  const useHighlightLayer = !largeFileMode && (!plainText || Boolean(sourceLanguage));
  const jsonBlock = useMemo(() => plainText || largeFileMode || sourceLanguage ? null : /(```json[^\n]*\n)([\s\S]*?)(```)/i.exec(draft), [draft, largeFileMode, plainText, sourceLanguage]);
  const isJson = useMemo(() => !largeFileMode && (sourceLanguage === 'json' || (!plainText && (/json/i.test(label) || Boolean(jsonBlock) || /^[\s\uFEFF]*[\[{]/.test(draft)))), [draft, jsonBlock, label, largeFileMode, plainText, sourceLanguage]);
  const jsonContent = jsonBlock?.[2] ?? draft;
  const jsonIssues = useMemo(() => (isJson && !largeFileMode ? getJsonIssues(jsonContent) : []), [isJson, jsonContent, largeFileMode]);
  const jsonIssueLineOffset = useMemo(() => (jsonBlock ? draft.slice(0, draft.indexOf(jsonBlock[0]) + jsonBlock[1].length).split('\n').length - 1 : 0), [draft, jsonBlock]);
  const jsonIssueLines = useMemo(() => new Set(jsonIssues.map((issue) => issue.line + jsonIssueLineOffset)), [jsonIssues, jsonIssueLineOffset]);
  const jsonError = useMemo(() => {
    if (!jsonIssues.length) return '';
    const first = jsonIssues[0];
    const count = jsonIssues.length === 1 ? '' : ` · ${jsonIssues.length} issues`;
    return `Invalid JSON · line ${first.line + jsonIssueLineOffset}, column ${first.column}${count}`;
  }, [jsonIssues, jsonIssueLineOffset]);
  useEffect(() => {
    measureScroll();
  }, [draft, activePane]);
  useEffect(() => {
    window.addEventListener('resize', measureScroll);
    return () => window.removeEventListener('resize', measureScroll);
  }, []);
  useEffect(() => {
    if (typeof sharedDraft === 'string' && sharedDraft !== draft) {
      setDraft(sharedDraft);
      undoStackRef.current = [];
      redoStackRef.current = [];
      beforeInputRef.current = null;
    }
  }, [sharedDraft, draft]);
  useEffect(() => {
    if (!loading && readOnly && plainText && String(value ?? '') !== draft) setDraft(String(value ?? ''));
  }, [loading, readOnly, plainText, value, draft]);
  const highlightedLines = useMemo(() => useHighlightLayer ? buildHighlightedLines(draft, isJson, sourceLanguage) : [], [draft, isJson, sourceLanguage, useHighlightLayer]);
  const templatePreview = useMemo(() => {
    if (plainText || largeFileMode) return draft;
    const values = new Map(graphVariables.filter((item) => item?.name).map((item) => [item.name.toLowerCase(), item.initialValue]));
    for (const [pinId, previewValue] of Object.entries(templatePreviewValues || {})) {
      const slot = /^slot_(.+)$/.exec(pinId); const arg = /^arg_(\d+)$/.exec(pinId);
      if (slot) values.set(slot[1].toLowerCase(), previewValue);
      if (arg) values.set(`arg${arg[1]}`, previewValue);
    }
    const resolve = (name) => values.get(String(name).toLowerCase());
    return renderTextTemplate(replaceNullTemplateValues(draft, resolve, (name) => values.has(String(name).toLowerCase())), resolve, appEmojis);
  }, [draft, graphVariables, templatePreviewValues, appEmojis, largeFileMode, plainText]);
  const containsTemplate = useMemo(() => !plainText && !largeFileMode && /(?<!\\)\{\{\s*[^{}]+?\s*\}\}/.test(draft), [draft, largeFileMode, plainText]);
  const previewText = templatePreview || '(empty)';
  const previewLines = useMemo(() => largeFileMode ? [] : buildHighlightedLines(previewText, isJson, sourceLanguage), [previewText, isJson, sourceLanguage, largeFileMode]);
  const { matches: searchMatches, error: searchError } = useMemo(
    () => getSearchMatches(draft, searchQuery, { matchCase, wholeWord, useRegex }),
    [draft, searchQuery, matchCase, wholeWord, useRegex]
  );
  const searchLines = useMemo(() => {
    if (!searchOpen || largeFileMode) return [];
    let offset = 0;
    let matchIndex = 0;
    return draft.split('\n').map((line) => {
      const result = renderSearchLine(line, offset, searchMatches, activeMatchIndex, matchIndex);
      matchIndex = result.nextIndex;
      offset += line.length + 1;
      return result.content;
    });
  }, [draft, searchMatches, activeMatchIndex, searchOpen, largeFileMode]);

  const navigateSearch = (direction, fromOffset = editorRef.current?.selectionStart ?? 0) => {
    if (!searchMatches.length) {
      setActiveMatchIndex(-1);
      return;
    }
    let nextIndex;
    if (activeMatchIndex >= 0) {
      nextIndex = (activeMatchIndex + direction + searchMatches.length) % searchMatches.length;
    } else if (direction > 0) {
      nextIndex = searchMatches.findIndex((match) => match.start >= fromOffset);
      if (nextIndex < 0) nextIndex = 0;
    } else {
      nextIndex = -1;
      for (let index = searchMatches.length - 1; index >= 0; index -= 1) {
        if (searchMatches[index].start < fromOffset) {
          nextIndex = index;
          break;
        }
      }
      if (nextIndex < 0) nextIndex = searchMatches.length - 1;
    }
    setActiveMatchIndex(nextIndex);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      const match = searchMatches[nextIndex];
      if (!editor || !match) return;
      editor.focus();
      editor.setSelectionRange(match.start, match.end);
      const line = draft.slice(0, match.start).split('\n').length - 1;
      editor.scrollTop = Math.max(0, line * 22 - editor.clientHeight / 2);
    });
  };
  const openSearch = () => {
    const editor = editorRef.current;
    const selectedText = editor && editor.selectionStart !== editor.selectionEnd
      ? draft.slice(editor.selectionStart, editor.selectionEnd)
      : '';
    if (selectedText && !searchOpen) setSearchQuery(selectedText);
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  useEffect(() => {
    if (!searchMatches.length) {
      setActiveMatchIndex(-1);
      return;
    }
    setActiveMatchIndex((current) => current >= searchMatches.length ? 0 : current);
  }, [searchMatches]);

  const close = () => {
    if (!readOnly && draft !== String(value ?? '')) { setDiscardPromptOpen(true); return; }
    onClose?.();
  };
  useStudioSwitchClose('text', close);
  useStudioEscape(() => {
    if (searchOpen) {
      setSearchOpen(false);
      editorRef.current?.focus();
      return;
    }
    close();
  });
  const apply = () => {
    if (readOnly) return;
    onApply?.(detectDiscordCodeLanguages(draft));
  };

  useEffect(() => {
    const handleKeys = (event) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
        return;
      }
      if (command && !event.altKey && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        navigateSearch(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        navigateSearch(event.shiftKey ? -1 : 1);
        return;
      }
      if (!readOnly && (event.metaKey || event.ctrlKey) && event.key === 'Enter') apply();
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [draft, onApply, onClose, readOnly, searchMatches, matchCase, wholeWord, useRegex, searchQuery, activeMatchIndex]);

  const syncScroll = (event) => {
    const editor = event.currentTarget;
    if (gutterRef.current && !largeFileMode) gutterRef.current.scrollTop = editor.scrollTop;
    if (codeLayerRef.current) codeLayerRef.current.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    if (searchLayerRef.current) searchLayerRef.current.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    if (remoteCaretLayerRef.current) remoteCaretLayerRef.current.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    setScrollMetrics({ top: editor.scrollTop, height: editor.scrollHeight, view: editor.clientHeight });
  };
  const measureScroll = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setScrollMetrics({ top: editor.scrollTop, height: editor.scrollHeight, view: editor.clientHeight });
  };
  const scrollEditorTo = (next) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.scrollTop = Math.max(0, Math.min(next, editor.scrollHeight - editor.clientHeight));
  };
  const syncPreviewScroll = (event) => {
    const el = event.currentTarget;
    setPreviewScrollMetrics({ top: el.scrollTop, height: el.scrollHeight, view: el.clientHeight });
  };
  const scrollPreviewTo = (next) => {
    const el = previewScrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, Math.min(next, el.scrollHeight - el.clientHeight));
  };
  const gutterStart = largeFileMode ? Math.max(0, Math.floor(scrollMetrics.top / 22) - 4) : 0;
  const gutterEnd = largeFileMode ? Math.min(lines.length, Math.ceil((scrollMetrics.top + scrollMetrics.view) / 22) + 5) : lines.length;
  const gutterRows = useMemo(() => lines.slice(gutterStart, gutterEnd), [lines, gutterStart, gutterEnd]);
  const changeDraft = (event) => {
    if (readOnly) return;
    const next = event.target.value;
    if (next !== draft) {
      const previous = beforeInputRef.current || { text: draft, start: event.target.selectionStart, end: event.target.selectionEnd };
      undoStackRef.current.push(previous);
      if (undoStackRef.current.length > 200) undoStackRef.current.shift();
      redoStackRef.current = [];
    }
    beforeInputRef.current = null;
    setDraft(next);
    onDraftChange?.(next, event.target.selectionStart);
  };
  const captureSnapshot = () => ({
    text: draft,
    start: editorRef.current?.selectionStart ?? draft.length,
    end: editorRef.current?.selectionEnd ?? draft.length
  });
  const recordProgrammaticEdit = () => {
    undoStackRef.current.push(captureSnapshot());
    if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    redoStackRef.current = [];
  };
  const restoreHistory = (direction) => {
    const source = direction === 'undo' ? undoStackRef.current : redoStackRef.current;
    const destination = direction === 'undo' ? redoStackRef.current : undoStackRef.current;
    if (!source.length) return;
    const current = captureSnapshot();
    const target = source.pop();
    destination.push(current);
    setDraft(target.text);
    onDraftChange?.(target.text, target.start);
    onCursorChange?.(target.start);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(Math.min(target.start, target.text.length), Math.min(target.end, target.text.length));
    });
  };
  const handleBeforeInput = (event) => {
    beforeInputRef.current = { text: draft, start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
  };
  const handleEditorKeyDown = (event) => {
    if (readOnly) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        restoreHistory('undo');
        return;
      }
      if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        event.preventDefault();
        restoreHistory('redo');
        return;
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const next = `${draft.slice(0, start)}  ${draft.slice(end)}`;
      recordProgrammaticEdit();
      setDraft(next);
      onDraftChange?.(next, start + 2);
      onCursorChange?.(start + 2);
      requestAnimationFrame(() => { editor.selectionStart = editor.selectionEnd = start + 2; });
      return;
    }
    if (event.key !== 'Enter') return;
    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const currentLine = before.slice(before.lastIndexOf('\n') + 1);
    const indent = currentLine.match(/^\s*/)?.[0] || '';
    const opensContainer = isJson && /[\[{]\s*$/.test(before) && /^\s*[\]}]/.test(after);
    const extraIndent = isJson && /[\[{]\s*$/.test(before) ? '  ' : '';
    event.preventDefault();
    const insertion = opensContainer ? `\n${indent}  \n${indent}` : `\n${indent}${extraIndent}`;
    const next = `${before}${insertion}${after}`;
    const caret = before.length + (opensContainer ? indent.length + 3 : insertion.length);
    recordProgrammaticEdit();
    setDraft(next);
    onDraftChange?.(next, caret);
    onCursorChange?.(caret);
    requestAnimationFrame(() => { editor.selectionStart = editor.selectionEnd = caret; });
  };
  const formatJson = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonContent), null, 2);
      const next = jsonBlock ? draft.replace(jsonBlock[0], `${jsonBlock[1]}${formatted}${jsonBlock[3]}`) : formatted;
      if (next !== draft) recordProgrammaticEdit();
      setDraft(next);
      onDraftChange?.(next, next.length);
      onCursorChange?.(next.length);
    }
    catch { /* inline validator explains why formatting is unavailable */ }
  };

  return <section className="discord-text-studio" aria-label={`Edit ${label}`}>
    <header className="discord-text-studio-header">
      <button type="button" className="discord-text-studio-back" onClick={close}><ArrowLeft size={15} /><span>Back</span></button>
      <div className="discord-text-studio-title"><div><strong>Text editor</strong>{readOnly && <span className="read-only-badge">Locked (Read only)</span>}</div>
        {!plainText && <div className="discord-text-studio-tabs" role="tablist" aria-label="Text editor panes">
          <button type="button" role="tab" aria-selected={activePane === 'editor'} className={activePane === 'editor' ? 'is-active' : ''} onClick={() => { setActivePane('editor'); requestAnimationFrame(() => editorRef.current?.focus()); }}>Editor</button>
          <button type="button" role="tab" aria-selected={activePane === 'preview'} className={activePane === 'preview' ? 'is-active' : ''} onClick={() => setActivePane('preview')}>Template preview</button>
        </div>}
        {collaborators.length > 0 && <div className="studio-collaborators" title={collaborators.map((peer) => peer.username).join(', ')} aria-label={`Editing with ${collaborators.map((peer) => peer.username).join(', ')}`}>{collaborators.slice(0, 5).map((peer) => <span key={peer.userId} style={{ '--collaborator-color': peer.color }}>{peer.username.slice(0, 1).toUpperCase()}</span>)}</div>}</div>
      <div className="discord-text-studio-actions">{!readOnly && <button type="button" className="discord-text-studio-apply" onClick={apply}>Apply</button>}<button type="button" className="discord-text-studio-close" onClick={close} aria-label="Close editor"><X size={16} /></button></div>
    </header>
    {searchOpen && <div className="text-studio-search" role="search" aria-label="Find in text">
      <label className="text-studio-search-input"><Search size={14} /><input ref={searchInputRef} value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setActiveMatchIndex(-1); }} onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); navigateSearch(event.shiftKey ? -1 : 1); }
        if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false); editorRef.current?.focus(); }
      }} placeholder="Find" aria-label="Find text" /></label>
      <span className="text-studio-search-count" role="status">{searchError ? 'Invalid pattern' : searchMatches.length ? `${activeMatchIndex < 0 ? 0 : activeMatchIndex + 1} of ${searchMatches.length}` : 'No results'}</span>
      <button type="button" className="text-studio-search-nav" onClick={() => navigateSearch(-1)} aria-label="Previous match" title="Previous match (⌘⇧G)"><ChevronUp size={15} /></button>
      <button type="button" className="text-studio-search-nav" onClick={() => navigateSearch(1)} aria-label="Next match" title="Next match (⌘G)"><ChevronDown size={15} /></button>
      <label className="text-studio-search-option" title="Match case"><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /> Aa</label>
      <label className="text-studio-search-option" title="Match whole word"><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} /> ab</label>
      <label className="text-studio-search-option" title="Use regular expression"><input type="checkbox" checked={useRegex} onChange={(event) => setUseRegex(event.target.checked)} /> .* </label>
      <button type="button" className="text-studio-search-close" onClick={() => { setSearchOpen(false); editorRef.current?.focus(); }} aria-label="Close find"><X size={15} /></button>
    </div>}
    <div className={`discord-text-studio-editor-shell ${activePane === 'preview' ? 'is-pane-hidden' : ''} ${largeFileMode ? 'is-large-file' : ''} ${plainText && !useHighlightLayer ? 'is-plain-text' : ''}`}>
      {loading ? <div className="discord-text-studio-file-status" role="status" aria-live="polite"><LoaderCircle size={20} className="is-spinning" /><strong>Loading {label}…</strong></div>
        : loadError ? <div className="discord-text-studio-file-status is-error" role="alert"><strong>Could not load this file</strong><span>{loadError}</span></div>
          : <>
            <div className={`discord-text-studio-gutter ${largeFileMode ? 'is-virtual' : ''}`} ref={gutterRef} aria-hidden="true">
              {largeFileMode ? <div style={{ top: 15 + gutterStart * 22 - scrollMetrics.top }}>{gutterRows.map((_, index) => <span key={gutterStart + index}>{gutterStart + index + 1}</span>)}</div>
                : lines.map((_, index) => <span key={index} className={jsonIssueLines.has(index + 1) ? 'is-invalid-line' : undefined}>{index + 1}</span>)}
            </div>
            <div className="discord-text-studio-editor-viewport">
              {useHighlightLayer && <pre ref={codeLayerRef} className="discord-text-studio-code-layer" aria-hidden="true">{highlightedLines.map((line, index) => <span key={index} className={`discord-text-studio-line ${line.isCode ? 'is-code' : ''}`}>{line.content}</span>)}</pre>}
              {searchOpen && !largeFileMode && <pre ref={searchLayerRef} className="text-studio-search-layer" aria-hidden="true">{searchLines.map((line, index) => <span key={index} className="discord-text-studio-line">{line}</span>)}</pre>}
              {!largeFileMode && <div ref={remoteCaretLayerRef} className="discord-text-remote-caret-layer" aria-hidden="true">{remoteCursors.map((peer) => {
                const caret = Math.min(peer.caret, draft.length);
                const before = draft.slice(0, caret).split('\n');
                const line = before.length - 1;
                const column = before.at(-1).length;
                return <span key={peer.username} className="discord-text-remote-caret" style={{ left: 18 + column * 7.83, top: 15 + line * 22, '--collaborator-color': peer.color }}><i /><b>{peer.username}</b></span>;
              })}</div>}
              <DiscordTextField as="textarea" ref={editorRef} className="discord-text-studio-editor" readOnly={readOnly} value={draft} onBeforeInput={handleBeforeInput} onChange={changeDraft} onKeyDown={handleEditorKeyDown} onKeyUp={(event) => onCursorChange?.(event.currentTarget.selectionStart)} onClick={(event) => onCursorChange?.(event.currentTarget.selectionStart)} onScroll={syncScroll} onPointerDown={(event) => event.stopPropagation()} spellCheck={false} autoFocus wrap="off" aria-label={`${label} text`} discordAutocomplete templateAutocomplete appEmojis={appEmojis} graphVariables={graphVariables} templateValuePaths={templateValuePaths} templateSuggestions={templateSuggestions} templateFunctions={templateFunctions} />
            </div>
            <EditorMinimap text={draft} lines={lines} simplified={largeFileMode} language={sourceLanguage} isJson={isJson} jsonIssueLines={jsonIssueLines} searchMatches={largeFileMode ? [] : searchMatches} searchOpen={searchOpen && !largeFileMode} scrollTop={scrollMetrics.top} scrollHeight={scrollMetrics.height} viewHeight={scrollMetrics.view} editorLineHeight={22} onScrollTo={scrollEditorTo} />
          </>}
    </div>
    {activePane === 'preview' && <div className="discord-text-studio-preview-pane" role="tabpanel" aria-label="Template preview">
      {!containsTemplate && <p className="discord-text-studio-preview-note">This text has no template placeholders</p>}
      <div className="discord-text-studio-preview-shell">
        <div className="discord-text-studio-preview-scroll" ref={previewScrollRef} onScroll={syncPreviewScroll}>
          <div className="discord-text-studio-preview-body">
            <div className="discord-text-studio-gutter" aria-hidden="true">{previewLines.map((_, index) => <span key={index} className={jsonIssueLines.has(index + 1) ? 'is-invalid-line' : undefined}>{index + 1}</span>)}</div>
            <pre className="discord-text-studio-preview-code">{previewLines.map((line, index) => <span key={index} className={`discord-text-studio-line ${line.isCode ? 'is-code' : ''}`}>{line.content}</span>)}</pre>
          </div>
        </div>
        <EditorMinimap text={previewText} language={sourceLanguage} isJson={isJson} jsonIssueLines={jsonIssueLines} searchMatches={[]} searchOpen={false} scrollTop={previewScrollMetrics.top} scrollHeight={previewScrollMetrics.height} viewHeight={previewScrollMetrics.view} editorLineHeight={22} onScrollTo={scrollPreviewTo} />
      </div>
    </div>}
    <footer className="discord-text-studio-footer"><TemplateSyntaxHelp connectedArguments={connectedTemplateArguments} /><span className={maxLength && characterCount > maxLength ? 'is-over-limit' : ''}>{characterCount.toLocaleString()}{maxLength ? ` / ${maxLength.toLocaleString()} characters` : ' characters'}</span><span>{jsonError ? <em className="text-editor-json-error" role="status">{jsonError}</em> : isJson ? 'Valid JSON' : `${lines.length.toLocaleString()} lines${blocks.length ? ` · ${blocks.length} code ${blocks.length === 1 ? 'block' : 'blocks'}` : ''}`}</span>{isJson && !readOnly && <button type="button" className="text-editor-format-json" disabled={Boolean(jsonError)} onClick={formatJson}>Format JSON</button>}</footer>
    <Modal isOpen={discardPromptOpen} onClose={() => { setDiscardPromptOpen(false); notifyStudioSwitchCancelled(); }} title="Discard text changes?" subtitle="These edits have not been applied." footer={<><Button variant="secondary" onClick={() => { setDiscardPromptOpen(false); notifyStudioSwitchCancelled(); }}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard changes</Button></>}><p className="close-graph-copy">Your graph or variable stays unchanged until you choose Apply.</p></Modal>
  </section>;
}
