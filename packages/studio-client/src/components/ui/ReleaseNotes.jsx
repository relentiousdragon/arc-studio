import React from 'react';
//
function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function renderInline(source, keyPrefix) {
  const tokenPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|\*([^*\n]+)\*|(https?:\/\/[^\s<>()]+)/g;
  const result = [];
  let cursor = 0;
  let match;

  while ((match = tokenPattern.exec(source))) {
    if (match.index > cursor) result.push(source.slice(cursor, match.index));
    const key = `${keyPrefix}-${match.index}`;
    if (match[1] !== undefined) {
      const href = safeHttpUrl(match[2]);
      result.push(href ? <a key={key} href={href} target="_blank" rel="noreferrer">{match[1]}</a> : match[0]);
    } else if (match[3] !== undefined) result.push(<strong key={key}>{match[3]}</strong>);
    else if (match[4] !== undefined) result.push(<u key={key}>{match[4]}</u>);
    else if (match[5] !== undefined) result.push(<s key={key}>{match[5]}</s>);
    else if (match[6] !== undefined) result.push(<code key={key}>{match[6]}</code>);
    else if (match[7] !== undefined) result.push(<em key={key}>{match[7]}</em>);
    else {
      const bareUrl = match[8];
      const trailingPunctuation = /[.,!?;:]+$/.exec(bareUrl)?.[0] || '';
      const linkText = trailingPunctuation ? bareUrl.slice(0, -trailingPunctuation.length) : bareUrl;
      const href = safeHttpUrl(linkText);
      result.push(href ? <a key={key} href={href} target="_blank" rel="noreferrer">{linkText}</a> : bareUrl);
      if (trailingPunctuation) result.push(trailingPunctuation);
    }
    cursor = tokenPattern.lastIndex;
  }

  if (cursor < source.length) result.push(source.slice(cursor));
  return result;
}

export const ReleaseNotes = React.memo(function ReleaseNotes({ children }) {
  const blocks = React.useMemo(() => {
    const lines = String(children || '').replace(/\r\n?/g, '\n').split('\n');
    const parsedBlocks = [];

    for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i += 1; continue; }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      parsedBlocks.push(<h3 key={`heading-${i}`}>{renderInline(heading[2], `heading-${i}`)}</h3>);
      i += 1;
      continue;
    }

    const listItem = /^[-*+]\s+(.+)$/.exec(line);
    if (listItem) {
      const items = [];
      while (i < lines.length) {
        const item = /^\s*[-*+]\s+(.+)$/.exec(lines[i]);
        if (!item) break;
        items.push(<li key={`list-${i}`}>{renderInline(item[1], `list-${i}`)}</li>);
        i += 1;
      }
      parsedBlocks.push(<ul key={`list-${i}`}>{items}</ul>);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      const quoteLines = [];
      while (i < lines.length) {
        const item = /^>\s?(.*)$/.exec(lines[i].trim());
        if (!item) break;
        quoteLines.push(item[1]);
        i += 1;
      }
      parsedBlocks.push(<blockquote key={`quote-${i}`}>{quoteLines.map((text, index) => <React.Fragment key={index}>{index > 0 && <br />}{renderInline(text, `quote-${i}-${index}`)}</React.Fragment>)}</blockquote>);
      continue;
    }

    const paragraphLines = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s+/.test(lines[i].trim()) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^>\s?/.test(lines[i].trim())) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
      parsedBlocks.push(<p key={`paragraph-${i}`}>{paragraphLines.map((text, index) => <React.Fragment key={index}>{index > 0 && <br />}{renderInline(text, `paragraph-${i}-${index}`)}</React.Fragment>)}</p>);
    }

    return parsedBlocks;
  }, [children]);

  return <div className="release-notes-content">{blocks}</div>;
});
