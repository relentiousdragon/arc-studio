import { spawnSync } from 'node:child_process';
//
export const REGEX_MATCH_TIMEOUT_MS = 1000;

const regexWorker = String.raw`
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const { text, pattern, flags, mode, replacement } = JSON.parse(input);
    const expression = new RegExp(pattern, flags);
    const results = [];
    let result;
    do {
      result = expression.exec(text);
      if (!result) break;
      results.push(result);
      if (result[0] === '') {
        if (!expression.global) break;
        const index = expression.lastIndex;
        const first = text.charCodeAt(index);
        const second = text.charCodeAt(index + 1);
        expression.lastIndex += expression.unicode && first >= 0xD800 && first <= 0xDBFF && second >= 0xDC00 && second <= 0xDFFF ? 2 : 1;
      }
    } while (expression.global && results.length < 1000);
    let outputText = text;
    if (mode === 'replace') {
      let outputLength = text.length;
      const replacer = (...args) => {
        const groups = typeof args.at(-1) === 'object' ? args.at(-1) : undefined;
        const offset = args.at(groups ? -3 : -2);
        const captures = args.slice(1, groups ? -3 : -2);
        const match = args[0];
        const expanded = replacement.replace(/\$([$&'\`]|\d{1,2}|<[^>]+>)/g, (token, key) => {
          if (key === '$') return '$';
          if (key === '&') return match;
          if (key === String.fromCharCode(96)) return text.slice(0, offset);
          if (key === "'") return text.slice(offset + match.length);
          if (key[0] === '<') return groups?.[key.slice(1, -1)] ?? token;
          const number = Number(key);
          if (number > 0 && number <= captures.length && captures[number - 1] !== undefined) return captures[number - 1];
          if (key.length === 2 && Number(key[0]) > 0 && Number(key[0]) <= captures.length && number > captures.length) return '$' + key[0] + key[1];
          return token;
        });
        outputLength += expanded.length - match.length;
        if (outputLength > 10000) throw new Error('Regex output is limited to 10,000 characters.');
        return expanded;
      };
      outputText = text.replace(new RegExp(pattern, flags), replacer);
    }
    if (outputText.length > 10000) throw new Error('Regex output is limited to 10,000 characters.');
    const matches = [];
    let matchBytes = 0;
    for (const item of results) {
      const bytes = Buffer.byteLength(item[0]);
      if (matchBytes + bytes > 48000) break;
      matches.push(item[0]);
      matchBytes += bytes;
    }
    const first = results[0];
    process.stdout.write(JSON.stringify({
      text: outputText,
      matched: Boolean(first),
      match: first?.[0] ?? '',
      matches,
      captures: first ? first.slice(1).map((value) => value ?? '') : [],
      named_captures: first?.groups ? Object.fromEntries(Object.entries(first.groups).map(([name, value]) => [name, value ?? ''])) : {},
      index: first?.index ?? -1
    }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error?.message || 'Regex execution failed.' }));
  }
});
`;

export function executeRegexIsolated({ text, pattern, flags, mode, replacement }) {
  const env = process.platform === 'win32'
    ? Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]))
    : {};
  const child = spawnSync(process.execPath, ['-e', regexWorker], {
    input: JSON.stringify({ text, pattern, flags, mode, replacement }),
    encoding: 'utf8',
    timeout: REGEX_MATCH_TIMEOUT_MS,
    maxBuffer: 128 * 1024,
    windowsHide: true,
    env,
    stdio: ['pipe', 'pipe', 'ignore']
  });
  if (child.error?.code === 'ETIMEDOUT' || child.signal === 'SIGTERM' || child.signal === 'SIGKILL') {
    return { error: `Regex match exceeded the ${REGEX_MATCH_TIMEOUT_MS} ms time limit.` };
  }
  if (child.error || child.status !== 0) return { error: 'Regex execution could not be completed safely.' };
  try { return JSON.parse(child.stdout || '{}'); }
  catch { return { error: 'Regex execution returned an invalid result.' }; }
}
