const MAX_EXPRESSION_LENGTH = 2048;
const MAX_TOKENS = 256;
//
function templateText(value) {
  if (value == null) return '';
  if (typeof value === 'object') { try { return JSON.stringify(value); } catch { return ''; } }
  return String(value);
}

export function splitTemplatePipeline(source) {
  const parts = []; let quote = ''; let escaped = false; let depth = 0; let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && quote) { escaped = true; continue; }
    if ((c === '"' || c === "'") && (!quote || quote === c)) { quote = quote ? '' : c; continue; }
    if (quote) continue;
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === '|' && depth === 0 && source[i - 1] !== '|' && source[i + 1] !== '|') { parts.push(source.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(source.slice(start).trim()); return parts;
}

function tokenize(source) {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error('Expression is too long.');
  const tokens = []; let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i += 1; continue; }
    const rest = source.slice(i);
    const number = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
    if (number) { tokens.push({ type: 'literal', value: Number(number[0]) }); i += number[0].length; continue; }
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++]; let value = ''; let closed = false;
      while (i < source.length) { const c = source[i++]; if (c === quote) { closed = true; break; } if (c === '\\' && i < source.length) { const next = source[i++]; value += next === 'n' ? '\n' : next === 't' ? '\t' : next; } else value += c; }
      if (!closed) throw new Error('Unclosed string.'); tokens.push({ type: 'literal', value }); continue;
    }
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(rest);
    if (identifier) { const word = identifier[0]; i += word.length; tokens.push({ type: 'identifier', value: word }); continue; }
    const operator = ['===', '!==', '>=', '<=', '==', '!=', '&&', '||', '**'].find((item) => rest.startsWith(item));
    if (operator) { tokens.push({ type: 'operator', value: operator }); i += operator.length; continue; }
    if ('+-*/%^!><?:().,[]'.includes(source[i])) { tokens.push({ type: 'operator', value: source[i++] }); continue; }
    throw new Error('Unsupported expression character.');
  }
  tokens.push({ type: 'eof', value: '' });
  if (tokens.length > MAX_TOKENS) throw new Error('Expression has too many parts.');
  return tokens;
}

const PRECEDENCE = { '||': 1, '&&': 2, '==': 3, '===': 3, '!=': 3, '!==': 3, '>': 4, '>=': 4, '<': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 7, '**': 7 };
function parse(source) {
  const tokens = tokenize(source); let at = 0; const peek = () => tokens[at]; const take = () => tokens[at++];
  function primary(depth = 0) {
    if (depth > 32) throw new Error('Expression nesting is too deep.');
    let token = take(); let node;
    if (token.type === 'literal') node = { kind: 'literal', value: token.value };
    else if (token.value === '(') { node = expression(0, depth + 1); if (take().value !== ')') throw new Error('Expected closing parenthesis.'); }
    else if (['!', '+', '-'].includes(token.value)) node = { kind: 'unary', op: token.value, value: primary(depth + 1) };
    else if (token.type === 'identifier') {
      const constants = { true: true, false: false, null: null, undefined: undefined, pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
      if (Object.hasOwn(constants, token.value.toLowerCase())) node = { kind: 'literal', value: constants[token.value.toLowerCase()] };
      else node = { kind: 'path', root: token.value, keys: [] };
    } else throw new Error('Expected a value.');
    while (true) {
      if (peek().value === '.') { take(); const key = take(); if (key.type !== 'identifier') throw new Error('Expected property name.'); node = { kind: 'member', object: node, key: { kind: 'literal', value: key.value } }; continue; }
      if (peek().value === '[') { take(); const key = expression(0, depth + 1); if (take().value !== ']') throw new Error('Expected closing bracket.'); node = { kind: 'member', object: node, key }; continue; }
      if (peek().value === '(') {
        if (node.kind !== 'path' || node.keys.length) throw new Error('Only built-in functions can be called.');
        take(); const args = [];
        if (peek().value !== ')') { do { args.push(expression(0, depth + 1)); if (peek().value !== ',') break; take(); } while (true); }
        if (take().value !== ')') throw new Error('Expected closing parenthesis.'); node = { kind: 'call', name: node.root.toLowerCase(), args }; continue;
      }
      break;
    }
    return node;
  }
  function expression(min = 0, depth = 0) {
    let left = primary(depth);
    while (true) {
      const op = peek().value; const precedence = PRECEDENCE[op];
      if (precedence === undefined || precedence < min) break;
      take(); const right = expression(precedence + (op === '^' || op === '**' ? 0 : 1), depth + 1); left = { kind: 'binary', op, left, right };
    }
    if (min === 0 && peek().value === '?') { take(); const yes = expression(0, depth + 1); if (take().value !== ':') throw new Error('Expected : in conditional.'); const no = expression(0, depth + 1); left = { kind: 'conditional', test: left, yes, no }; }
    return left;
  }
  const ast = expression(); if (peek().type !== 'eof') throw new Error('Unexpected expression content.'); return ast;
}

const number = (value) => { const result = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.trim()) : NaN; return Number.isFinite(result) ? result : 0; };
const MATH = {
  abs: (x) => Math.abs(number(x)), sqrt: (x) => Math.sqrt(Math.max(0, number(x))), round: (x, d = 0) => { const p = 10 ** Math.max(0, Math.min(12, Math.trunc(number(d)))); return Math.round(number(x) * p) / p; },
  floor: (x) => Math.floor(number(x)), ceil: (x) => Math.ceil(number(x)), min: (...x) => Math.min(...x.map(number)), max: (...x) => Math.max(...x.map(number)),
  clamp: (x, lo, hi) => Math.max(number(lo), Math.min(number(hi), number(x))), lerp: (a, b, t) => number(a) + (number(b) - number(a)) * number(t),
  sin: (x) => Math.sin(number(x)), cos: (x) => Math.cos(number(x)), tan: (x) => Math.tan(number(x)), asin: (x) => Math.asin(number(x)), acos: (x) => Math.acos(number(x)), atan: (x) => Math.atan(number(x)),
  log: (x) => number(x) > 0 ? Math.log(number(x)) : 0, log10: (x) => number(x) > 0 ? Math.log10(number(x)) : 0, exp: (x) => Math.exp(number(x)), sign: (x) => Math.sign(number(x)),
  sum: (...x) => x.reduce((a, b) => a + number(b), 0), average: (...x) => x.length ? x.reduce((a, b) => a + number(b), 0) / x.length : 0,
  tonumber: (x) => number(x), tostring: (x) => templateText(x)
};
function safeResult(value) { return typeof value === 'number' && !Number.isFinite(value) ? 0 : value; }
function evaluate(ast, resolveSlot) {
  switch (ast.kind) {
    case 'literal': return { found: true, value: ast.value };
    case 'path': {
      let value = resolveSlot?.(ast.root, `{{${ast.root}}}`); if (value === undefined) return { found: false, value };
      for (const key of ast.keys) { if (['__proto__', 'prototype', 'constructor'].includes(String(key)) || value == null || !Object.hasOwn(Object(value), key)) return { found: false, value: undefined }; value = value[key]; }
      return { found: true, value };
    }
    case 'member': {
      const base = evaluate(ast.object, resolveSlot);
      const keyNode = typeof ast.key === 'object' && ast.key !== null && ast.key.kind ? evaluate(ast.key, resolveSlot) : { found: true, value: ast.key };
      if (!base.found || !keyNode.found) return { found: false, value: undefined };
      const key = keyNode.value;
      if (['__proto__', 'prototype', 'constructor'].includes(String(key)) || base.value == null || !Object.hasOwn(Object(base.value), key)) return { found: false, value: undefined };
      return { found: true, value: base.value[key] };
    }
    case 'unary': { const v = evaluate(ast.value, resolveSlot); return { found: v.found, value: ast.op === '!' ? !v.value : safeResult(ast.op === '-' ? -number(v.value) : number(v.value)) }; }
    case 'conditional': { const test = evaluate(ast.test, resolveSlot); return evaluate(test.value ? ast.yes : ast.no, resolveSlot); }
    case 'call': {
      const fn = MATH[ast.name]; if (!fn || ast.args.length > 50) return { found: false, value: undefined };
      const args = ast.args.map((arg) => evaluate(arg, resolveSlot)); if (args.some((arg) => !arg.found)) return { found: false, value: undefined };
      return { found: true, value: safeResult(fn(...args.map((arg) => arg.value))) };
    }
    case 'binary': {
      const a = evaluate(ast.left, resolveSlot); if (!a.found) return a;
      if (ast.op === '&&' && !a.value) return { found: true, value: a.value };
      if (ast.op === '||' && a.value) return { found: true, value: a.value };
      const b = evaluate(ast.right, resolveSlot); if (!b.found) return b; const x = a.value, y = b.value;
      const result = ast.op === '+' ? (typeof x === 'string' || typeof y === 'string' ? templateText(x) + templateText(y) : number(x) + number(y))
        : ast.op === '-' ? number(x) - number(y) : ast.op === '*' ? number(x) * number(y) : ast.op === '/' ? number(y) === 0 ? 0 : number(x) / number(y)
          : ast.op === '%' ? number(y) === 0 ? 0 : number(x) % number(y) : ['^', '**'].includes(ast.op) ? number(x) ** number(y)
            : ast.op === '==' || ast.op === '===' ? x === y : ast.op === '!=' || ast.op === '!==' ? x !== y : ast.op === '>' ? x > y : ast.op === '>=' ? x >= y : ast.op === '<' ? x < y : ast.op === '<=' ? x <= y
              : ast.op === '&&' ? y : y;
      return { found: true, value: safeResult(result) };
    }
    default: return { found: false, value: undefined };
  }
}

function splitArguments(source) {
  const args = []; let quote = ''; let escaped = false; let depth = 0; let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && quote) { escaped = true; continue; }
    if ((c === '"' || c === "'") && (!quote || quote === c)) { quote = quote ? '' : c; continue; }
    if (quote) continue;
    if ('(['.includes(c)) depth += 1; else if (')]'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) { args.push(source.slice(start, i).trim()); start = i + 1; }
  }
  if (source.slice(start).trim() || args.length) args.push(source.slice(start).trim());
  return quote || depth !== 0 ? null : args;
}
export function evaluateTemplateExpression(source, resolveSlot) {
  try { const tree = parse(source.trim()); return evaluate(tree, resolveSlot); } catch { return { found: false, value: undefined }; }
}

export function applyTemplateTransforms(value, transforms = []) {
  let result = value;
  for (const source of transforms) {
    const match = /^([A-Za-z][A-Za-z0-9]*)(?:\((.*)\))?$/.exec(source.trim()); if (!match) continue;
    const name = match[1].toLowerCase(); let args = [];
    if (match[2]?.trim()) { const raw = splitArguments(match[2]); if (!raw) continue; args = raw.map((part) => evaluateTemplateExpression(part, () => undefined)); if (args.some((arg) => !arg.found)) continue; args = args.map((arg) => arg.value); }
    const text = () => templateText(result);
    if (['lower', 'lowercase', 'tolowercase'].includes(name)) result = text().toLocaleLowerCase(); else if (['upper', 'uppercase', 'touppercase'].includes(name)) result = text().toLocaleUpperCase();
    else if (name === 'trim') result = text().trim(); else if (name === 'trimstart') result = text().trimStart(); else if (name === 'trimend') result = text().trimEnd();
    else if (['title', 'titlecase'].includes(name)) result = text().toLocaleLowerCase().replace(/(^|[\s\p{P}\p{S}])([\p{L}\p{N}])/gu, (_m, p, c) => `${p}${c.toLocaleUpperCase()}`);
    else if (name === 'capitalize') result = text().replace(/^\s*\p{L}/u, (c) => c.toLocaleUpperCase());
    else if (name === 'replace' && args.length >= 2 && String(args[0])) result = text().split(String(args[0])).join(String(args[1]));
    else if (name === 'replacefirst' && args.length >= 2 && String(args[0])) result = text().replace(String(args[0]), String(args[1]));
    else if (name === 'join' && Array.isArray(result)) result = result.map(templateText).join(args[0] == null ? ', ' : String(args[0]));
    else if (name === 'slice') result = (Array.isArray(result) ? result : text()).slice(number(args[0]), args[1] === undefined ? undefined : number(args[1]));
    else if (name === 'length') result = result != null && Number.isFinite(result.length) ? result.length : text().length;
    else if (name === 'json') result = JSON.stringify(result) ?? '';
    else if (name === 'default' && (result == null || result === '')) result = args[0] ?? '';
    else if (name === 'tonumber') result = number(result);
    else if (['tostring', 'totext'].includes(name)) result = templateText(result);
    else if (name === 'round') result = MATH.round(result, args[0] ?? 0); else if (name === 'floor') result = Math.floor(number(result)); else if (name === 'ceil') result = Math.ceil(number(result));
  }
  return templateText(result);
}

export function getTemplateReferences(source) {
  const refs = new Set(); const parts = splitTemplatePipeline(source); const expr = parts[0] || '';
  const constants = new Set(['true', 'false', 'null', 'undefined', 'pi', 'tau', 'e']);
  let quote = '';
  let escaped = false;
  for (let index = 0; index < expr.length;) {
    const character = expr[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      index += 1;
      continue;
    }
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(expr.slice(index));
    if (!identifier) {
      index += 1;
      continue;
    }
    const name = identifier[0];
    let next = index + name.length;
    while (/\s/.test(expr[next] || '')) next += 1;
    let previous = index - 1;
    while (previous >= 0 && /\s/.test(expr[previous])) previous -= 1;
    if (expr[previous] !== '.' && expr[next] !== '(' && !constants.has(name.toLowerCase())) refs.add(name);
    index += name.length;
  }
  return [...refs];
}

export function renderTextTemplate(template, resolveSlot, appEmojis = []) {
  return String(template ?? '').replace(/(\\)?(\{\{\s*([^{}]+?)\s*\}\})/g, (_match, escaped, token, source) => {
    if (escaped) return `\\${token}`;
    const parts = splitTemplatePipeline(source); const base = parts.shift() || '';
    const emojiName = /^e_([A-Za-z0-9_-]+)$/.exec(base.trim())?.[1];
    if (emojiName) { const emoji = appEmojis instanceof Map ? appEmojis.get(emojiName.toLowerCase()) : appEmojis.find?.((item) => item?.name?.toLowerCase() === emojiName.toLowerCase()); if (emoji?.id && emoji.name) return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`; }
    const evaluated = evaluateTemplateExpression(base, resolveSlot);
    if (!evaluated.found && !parts.some((part) => /^default\s*\(/i.test(part))) return token;
    return applyTemplateTransforms(evaluated.value, parts);
  });
}
