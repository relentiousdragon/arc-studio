function regexSafetyError(pattern) {
  if (pattern.length > 256) return 'Regex pattern is limited to 256 characters.';
  if (/\\(?:[1-9]|k<)/.test(pattern)) return 'Regex backreferences are disabled because they can cause very slow matches.';
  if (/\(\?<([=!])/.test(pattern)) return 'Regex lookbehind is not supported.';
  const stack = [{ hasQuantifier: false, hasUnboundedQuantifier: false, hasAlternation: false }];
  let inClass = false;
  let unboundedCount = 0;
  let quantifierCount = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '\\') { index += 1; continue; }
    if (inClass) { if (char === ']') inClass = false; continue; }
    if (char === '[') { inClass = true; continue; }
    if (char === '(') {
      let headerEnd = index;
      if (pattern[index + 1] === '?') {
        if (pattern[index + 2] === ':' || pattern[index + 2] === '=' || pattern[index + 2] === '!') headerEnd = index + 2;
        else if (pattern[index + 2] === '<') headerEnd = pattern.indexOf('>', index + 3);
      }
      stack.push({ hasQuantifier: false, hasUnboundedQuantifier: false, hasAlternation: false });
      index = Math.max(index, headerEnd);
      continue;
    }
    if (char === '|') { stack.at(-1).hasAlternation = true; continue; }
    if (char === ')') {
      if (stack.length === 1) continue;
      const group = stack.pop();
      const next = pattern[index + 1];
      const quantified = next === '*' || next === '+' || next === '?' || next === '{' && /^\{\d+(?:,\d*)?\}/.test(pattern.slice(index + 1));
      const repetition = next === '{' ? /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(index + 1)) : null;
      const repetitionMax = next === '*' || next === '+' || repetition?.[2] === '' ? Infinity : next === '?' ? 1 : Number(repetition?.[2] ?? repetition?.[1] ?? 0);
      const groupRepeatIsUnbounded = next === '*' || next === '+' || Boolean(repetition && repetition[2] === '');
      if (quantified && (group.hasUnboundedQuantifier || group.hasQuantifier && groupRepeatIsUnbounded || group.hasAlternation && (groupRepeatIsUnbounded || repetitionMax > 10))) return 'Regex groups with nested repetition or repeated alternatives are not supported.';
      const parent = stack.at(-1);
      parent.hasQuantifier ||= group.hasQuantifier || quantified;
      parent.hasUnboundedQuantifier ||= group.hasUnboundedQuantifier || groupRepeatIsUnbounded;
      parent.hasAlternation ||= group.hasAlternation;
      if (quantified) {
        quantifierCount += 1;
        if (quantifierCount > 32) return 'Regex patterns are limited to 32 repetition operators.';
        if (next === '{') {
          const repetition = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(index + 1));
          const maximum = repetition?.[2] === '' ? Infinity : Number(repetition?.[2] ?? repetition?.[1]);
          if (maximum > 1000) return 'Regex repetition counts are limited to 1,000.';
        }
      }
      if (quantified && (next === '*' || next === '+' || next === '{' && /^\{\d+,\}/.test(pattern.slice(index + 1)))) unboundedCount += 1;
      continue;
    }
    const quantifier = char === '*' || char === '+' || char === '?' || char === '{' && /^\{\d+(?:,\d*)?\}/.test(pattern.slice(index));
    if (quantifier) {
      quantifierCount += 1;
      if (quantifierCount > 32) return 'Regex patterns are limited to 32 repetition operators.';
      if (char === '{') {
        const repetition = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(index));
        const maximum = repetition?.[2] === '' ? Infinity : Number(repetition?.[2] ?? repetition?.[1]);
        if (maximum > 1000) return 'Regex repetition counts are limited to 1,000.';
      }
      stack.at(-1).hasQuantifier = true;
      const unbounded = char === '*' || char === '+' || char === '{' && /^\{\d+,\}/.test(pattern.slice(index));
      if (unbounded) {
        stack.at(-1).hasUnboundedQuantifier = true;
        unboundedCount += 1;
      }
      if (char === '{') index += (pattern.slice(index).match(/^\{\d+(?:,\d*)?\}/)?.[0].length || 1) - 1;
    }
  }
  if (unboundedCount > 4) return 'Regex patterns can use at most four unbounded repetitions.';
  return '';
}

function readDataPath(source, path) {
  const text = String(path || '').trim();
  if (!text || text.length > 512) return { exists: false, value: undefined };
  const parts = []; let index = 0;
  while (index < text.length) {
    if (text[index] === '.') {
      if (index === 0 || index === text.length - 1 || text[index + 1] === '.' || text[index + 1] === '[') return { exists: false, value: undefined };
      index += 1; continue;
    }
    if (text[index] === '[') {
      const rest = text.slice(index);
      const match = /^\[(?:(\d+)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\]/.exec(rest);
      if (!match) return { exists: false, value: undefined };
      parts.push(match[1] !== undefined ? Number(match[1]) : (match[2] ?? match[3]).replace(/\\([\\"'])/g, '$1'));
      index += match[0].length;
    } else {
      const match = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(text.slice(index));
      if (!match) return { exists: false, value: undefined };
      parts.push(match[0]); index += match[0].length;
    }
    if (parts.length > 64) return { exists: false, value: undefined };
  }
  let value = source;
  for (const key of parts) {
    if (['__proto__', 'prototype', 'constructor'].includes(String(key)) || value == null || (typeof value !== 'object' && typeof value !== 'string') || !Object.hasOwn(Object(value), key)) return { exists: false, value: undefined };
    value = value[key];
  }
  return { exists: true, value };
}

function compareArrayItem(actual, expected, operator) {
  if (operator === 'exists') return actual.exists;
  if (operator === 'is_empty') return actual.exists && (actual.value == null || actual.value === '' || Array.isArray(actual.value) && !actual.value.length || typeof actual.value === 'object' && !Array.isArray(actual.value) && !Object.keys(actual.value).length);
  if (!actual.exists) return false;
  const left = actual.value;
  if (operator === 'not_equals') return !Object.is(left, expected);
  if (operator === 'contains') return typeof left === 'string' ? left.includes(String(expected ?? '')) : Array.isArray(left) ? left.some((item) => Object.is(item, expected)) : false;
  if (operator === 'starts_with') return typeof left === 'string' && left.startsWith(String(expected ?? ''));
  if (operator === 'ends_with') return typeof left === 'string' && left.endsWith(String(expected ?? ''));
  if (operator === 'greater_than') return left > expected;
  if (operator === 'greater_or_equal') return left >= expected;
  if (operator === 'less_than') return left < expected;
  if (operator === 'less_or_equal') return left <= expected;
  return Object.is(left, expected);
}

export function evaluateDataNode(type, inputs = {}, data = {}) {
  if (type === 'data_check_value') {
    const value = inputs.value;
    const state = value === undefined ? 'missing' : value === null ? 'null' : typeof value === 'string' && value.trim() === '' ? 'empty' : 'value';
    return { value: state === 'value' ? value : inputs.fallback, state, is_missing: state === 'missing', is_null: state === 'null', is_empty: state === 'empty', has_value: state === 'value' };
  }
  if (type === 'data_format_number') {
    const raw = inputs.value;
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw.trim()) : NaN;
    if (!Number.isFinite(value)) return { text: '', valid: false };
    const style = ['decimal', 'percent', 'currency'].includes(inputs.style) ? inputs.style : 'decimal';
    const minimumFractionDigits = Math.max(0, Math.min(20, Math.trunc(Number(inputs.minimum_fraction_digits) || 0)));
    const maximumFractionDigits = Math.max(minimumFractionDigits, Math.min(20, Math.trunc(Number.isFinite(Number(inputs.maximum_fraction_digits)) ? Number(inputs.maximum_fraction_digits) : 2)));
    try {
      const options = { style, useGrouping: true, minimumFractionDigits, maximumFractionDigits };
      if (style === 'currency') { const currency = String(inputs.currency || 'USD').toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) return { text: '', valid: false }; options.currency = currency; }
      return { text: new Intl.NumberFormat(String(inputs.locale || 'en-US'), options).format(value), valid: true };
    } catch { return { text: '', valid: false }; }
  }
  if (type === 'data_get_value_by_path') {
    const result = readDataPath(inputs.value, inputs.path);
    return { value: result.exists ? result.value : inputs.fallback, exists: result.exists };
  }
  if (type === 'data_find_array_item' || type === 'data_filter_array') {
    const array = Array.isArray(inputs.array) ? inputs.array.slice(0, 10000) : [];
    const path = String(inputs.path ?? '').trim();
    const operator = ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal', 'exists', 'is_empty'].includes(inputs.operator) ? inputs.operator : 'equals';
    const matches = array.map((item, index) => ({ item, index, actual: path ? readDataPath(item, path) : { exists: true, value: item } }))
      .filter(({ actual }) => compareArrayItem(actual, inputs.value, type === 'data_find_array_item' ? 'equals' : operator));
    if (type === 'data_find_array_item') { const found = matches[0]; return { item: found?.item ?? null, index: found?.index ?? -1, found: Boolean(found) }; }
    const filtered = matches.map(({ item }) => item);
    return { array: filtered, count: filtered.length };
  }
  if (type === 'data_permission_overwrites') {
    const permissionBits = {
      CreateInstantInvite: 0, KickMembers: 1, BanMembers: 2, Administrator: 3, ManageChannels: 4, ManageGuild: 5, AddReactions: 6, ViewAuditLog: 7,
      PrioritySpeaker: 8, Stream: 9, ViewChannel: 10, SendMessages: 11, SendTTSMessages: 12, ManageMessages: 13, EmbedLinks: 14, AttachFiles: 15,
      ReadMessageHistory: 16, MentionEveryone: 17, UseExternalEmojis: 18, ViewGuildInsights: 19, Connect: 20, Speak: 21, MuteMembers: 22,
      DeafenMembers: 23, MoveMembers: 24, UseVAD: 25, ChangeNickname: 26, ManageNicknames: 27, ManageRoles: 28, ManageWebhooks: 29,
      ManageGuildExpressions: 30, UseApplicationCommands: 31, RequestToSpeak: 32, ManageEvents: 33, ManageThreads: 34, CreatePublicThreads: 35,
      CreatePrivateThreads: 36, UseExternalStickers: 37, SendMessagesInThreads: 38, UseEmbeddedActivities: 39, ModerateMembers: 40,
      ViewCreatorMonetizationAnalytics: 41, UseSoundboard: 42, CreateGuildExpressions: 43, CreateEvents: 44, UseExternalSounds: 45,
      SendVoiceMessages: 46, SetVoiceChannelStatus: 48, SendPolls: 49, UseExternalApps: 50, PinMessages: 51, BypassSlowmode: 52
    };
    const parsePermissionBits = (value) => {
      const text = String(value ?? '').trim();
      if (!/^(?:\d+|0x[\da-f]+)$/i.test(text)) return 0n;
      try { return BigInt(text); } catch { return 0n; }
    };
    const serializePermissions = (value, customBits = '') => {
      const names = Array.isArray(value) ? value : [];
      const mask = names.reduce((total, name) => permissionBits[name] === undefined ? total : total | (1n << BigInt(permissionBits[name])), parsePermissionBits(customBits));
      return mask ? mask.toString() : '';
    };
    const overwrites = [];
    const targetCount = Math.min(100, Math.max(1, ...Object.keys(inputs).map((key) => Number(/^target_id_(\d+)$/.exec(key)?.[1]) || 0)));
    for (let index = 1; index <= targetCount; index += 1) {
      const id = String(inputs[`target_id_${index}`] ?? '').trim();
      if (!id) continue;
      const permission = { id, type: Number(data[`target_type_${index}`]) === 1 ? 1 : 0 };
      const allow = serializePermissions(data[`allow_${index}`], data[`allowBits_${index}`]);
      const deny = serializePermissions(data[`deny_${index}`], data[`denyBits_${index}`]);
      if (allow) permission.allow = allow;
      if (deny) permission.deny = deny;
      overwrites.push(permission);
    }
    return { overwrites };
  }
  if (type === 'data_to_json') {
    try {
      const json = JSON.stringify(inputs.value);
      return { json: json ?? '', valid: json !== undefined };
    } catch { return { json: '', valid: false }; }
  }
  if (type === 'data_parse_json') {
    try { return { value: JSON.parse(String(inputs.json ?? '')), valid: true }; }
    catch { return { value: null, valid: false }; }
  }
  if (type === 'data_to_number') {
    const text = String(inputs.text ?? '').trim();
    const valid = Boolean(text) && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(Number(text));
    return { number: valid ? Number(text) : 0, valid };
  }
  if (type === 'data_to_text') {
    const value = inputs.value;
    if (value == null) return { text: '', valid: true };
    if (typeof value === 'string') return { text: value.slice(0, 10000), valid: true };
    try {
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return { text: String(text ?? '').slice(0, 10000), valid: text !== undefined };
    } catch { return { text: '', valid: false }; }
  }
  if (type === 'data_to_boolean') {
    const value = inputs.value;
    if (typeof value === 'boolean') return { boolean: value, valid: true };
    if (typeof value === 'number') return { boolean: Number.isFinite(value) && value !== 0, valid: Number.isFinite(value) };
    if (value == null) return { boolean: false, valid: true };
    const normalized = String(value).trim().toLowerCase();
    if (['true', 'yes', '1', 'on'].includes(normalized)) return { boolean: true, valid: true };
    if (['false', 'no', '0', 'off', ''].includes(normalized)) return { boolean: false, valid: true };
    return { boolean: false, valid: false };
  }
  if (type === 'data_regex') {
    const text = String(inputs.text ?? '');
    const pattern = String(inputs.pattern ?? '');
    const flags = String(inputs.flags ?? '');
    const mode = ['test', 'match', 'replace'].includes(data.mode) ? data.mode : 'test';
    const invalid = (error) => ({ text, matched: false, match: '', matches: [], captures: [], index: -1, valid: false, error });
    if (text.length > 8192) return invalid('Regex input is limited to 8,192 characters.');
    if (pattern.length > 256) return invalid('Regex pattern is limited to 256 characters.');
    if (flags.length > 6 || !/^[gimsuy]*$/.test(flags)) return invalid('Use the supported JavaScript regex flags: g, i, m, s, u, y.');
    const safetyError = regexSafetyError(pattern);
    if (safetyError) return invalid(safetyError);
    try {
      const expression = new RegExp(pattern, flags);
      const results = [];
      if (expression.global) {
        let result;
        while ((result = expression.exec(text)) && results.length < 1000) {
          results.push(result);
          if (result[0] === '') expression.lastIndex += 1;
        }
      } else {
        const result = expression.exec(text);
        if (result) results.push(result);
      }
      const first = results[0];
      let outputText = text;
      if (mode === 'replace') {
        const replacement = String(inputs.replacement ?? '').slice(0, 2000);
        outputText = text.replace(expression, replacement);
        if (outputText.length > 10000) return invalid('Regex output is limited to 10,000 characters.');
      }
      return {
        text: outputText,
        matched: Boolean(first),
        match: first?.[0] ?? '',
        matches: results.map((result) => result[0]).slice(0, 1000),
        captures: first ? first.slice(1).map((value) => value ?? '') : [],
        index: first?.index ?? -1,
        valid: true,
        error: ''
      };
    } catch (error) { return invalid(error?.message || 'Invalid regular expression.'); }
  }
  if (type === 'data_array_create') {
    const array = Array.from({ length: 50 }, (_, index) => inputs[`item_${index + 1}`]).filter((value) => value !== undefined && value !== null);
    return { array, length: array.length };
  }
  if (type === 'data_array_concat') {
    const numberedArrays = Object.keys(inputs)
      .map((key) => ({ index: Number(/^array_(\d+)$/.exec(key)?.[1]), value: inputs[key] }))
      .filter(({ index }) => Number.isInteger(index) && index > 0)
      .sort((a, b) => a.index - b.index)
      .map(({ value }) => Array.isArray(value) ? value : []);
    const legacyArrays = [inputs.array_a, inputs.array_b].filter(Array.isArray);
    const array = [...numberedArrays.flat(), ...legacyArrays.flat()].slice(0, 10000);
    return { array, length: array.length };
  }
  if (type === 'data_text_uppercase') return { text: String(inputs.text ?? '').toUpperCase() };
  if (type === 'data_text_lowercase') return { text: String(inputs.text ?? '').toLowerCase() };
  if (type === 'data_text_titlecase') return { text: String(inputs.text ?? '').toLocaleLowerCase().replace(/(^|[\s\p{P}\p{S}])([\p{L}\p{N}])/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`) };
  if (type === 'data_text_trim') return { text: String(inputs.text ?? '').trim() };
  if (type === 'data_array_length') {
    const length = Array.isArray(inputs.array) ? inputs.array.length : 0;
    return { length, empty: length === 0 };
  }
  if (type === 'data_array_get') {
    const array = Array.isArray(inputs.array) ? inputs.array : [];
    const index = Math.trunc(Number(inputs.index));
    const found = Number.isInteger(index) && index >= 0 && index < array.length;
    return { value: found ? array[index] : null, found };
  }
  if (type === 'data_array_set') {
    const array = Array.isArray(inputs.array) ? inputs.array.slice(0, 10000) : [];
    const index = Math.trunc(Number(inputs.index));
    const updated = Number.isInteger(index) && index >= 0 && index < array.length;
    if (updated) array[index] = inputs.value;
    return { array, updated };
  }
  if (type === 'data_array_append') {
    const result = Array.isArray(inputs.array) ? inputs.array.slice(0, 10000) : [];
    const items = Object.keys(inputs)
      .map((key) => ({ index: Number(/^item_(\d+)$/.exec(key)?.[1]), value: inputs[key] }))
      .filter(({ index, value }) => Number.isInteger(index) && index > 0 && value !== undefined)
      .sort((a, b) => a.index - b.index)
      .map(({ value }) => value);
    if (inputs.value !== undefined) items.push(inputs.value);
    for (const item of items) {
      if (result.length >= 10000) break;
      result.push(item);
    }
    return { array: result, length: result.length };
  }
  if (type === 'data_object_get') {
    const object = inputs.object && typeof inputs.object === 'object' && !Array.isArray(inputs.object) ? inputs.object : {};
    const key = String(inputs.key ?? '');
    return { value: Object.hasOwn(object, key) ? object[key] : null, exists: Object.hasOwn(object, key) };
  }
  if (type === 'data_object_set') {
    const object = inputs.object && typeof inputs.object === 'object' && !Array.isArray(inputs.object) ? inputs.object : {};
    const key = String(inputs.key ?? '').slice(0, 256);
    return { object: key ? { ...object, [key]: inputs.value } : { ...object } };
  }
  if (type === 'data_object_keys') {
    const object = inputs.object && typeof inputs.object === 'object' && !Array.isArray(inputs.object) ? inputs.object : {};
    const keys = Object.keys(object);
    return { keys, length: keys.length };
  }
  if (type === 'data_string_split') {
    const text = String(inputs.text ?? '');
    const separator = String(inputs.separator ?? ',');
    const array = (separator ? text.split(separator) : Array.from(text)).slice(0, 10000);
    return { array, length: array.length, ...Object.fromEntries(array.slice(0, 50).map((value, index) => [`part_${index + 1}`, value])) };
  }
  if (type === 'data_parse_prefix_command') {
    const prefix = String(inputs.prefix ?? '!');
    const source = String(inputs.content ?? '').trimStart();
    if (!prefix || !source.startsWith(prefix)) return { recognized: false, command: '', arguments: [], argument_count: 0 };
    const raw = source.slice(prefix.length);
    const tokens = [];
    let current = '';
    let quote = '';
    let escaped = false;
    let started = false;
    for (const char of raw) {
      if (escaped) { current += char; escaped = false; started = true; continue; }
      if (char === '\\') { escaped = true; started = true; continue; }
      if (quote) {
        if (char === quote) quote = '';
        else current += char;
        started = true;
        continue;
      }
      if (char === '"' || char === "'") { quote = char; started = true; continue; }
      if (/\s/.test(char)) {
        if (started) { tokens.push(current); current = ''; started = false; }
        continue;
      }
      current += char;
      started = true;
    }
    if (escaped) current += '\\';
    if (started) tokens.push(current);
    const [command = '', ...args] = tokens;
    const boundedArgs = args.slice(0, 10000);
    return {
      recognized: Boolean(command), command, arguments: boundedArgs, argument_count: boundedArgs.length,
      ...Object.fromEntries(boundedArgs.slice(0, 50).map((value, index) => [`argument_${index + 1}`, value]))
    };
  }
  if (type === 'data_string_join') {
    const array = Array.isArray(inputs.array) ? inputs.array : [];
    return { text: array.map((value) => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)).join(String(inputs.separator ?? ', ')) };
  }
  if (type === 'data_text_replace') {
    const text = String(inputs.text ?? '');
    const search = String(inputs.search ?? '');
    if (!search) return { text, replacements: 0 };
    const parts = text.split(search);
    return { text: parts.join(String(inputs.replacement ?? '')), replacements: parts.length - 1 };
  }
  if (type === 'data_current_timestamp') {
    const timestampMs = Date.now();
    return { timestamp_ms: timestampMs, iso: new Date(timestampMs).toISOString() };
  }
  if (type === 'data_format_time' || type === 'data_to_iso_time') {
    const raw = inputs.value;
    const date = typeof raw === 'number' || (typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw.trim()))
      ? new Date(Number(raw)) : new Date(raw);
    if (!Number.isFinite(date.getTime())) return { text: '', valid: false };
    if (type === 'data_to_iso_time') return { text: date.toISOString(), valid: true };
    try {
      const options = { timeZone: String(inputs.timeZone || 'UTC') };
      const dateStyle = String(inputs.dateStyle || 'medium');
      const timeStyle = String(inputs.timeStyle || 'short');
      if (dateStyle !== 'none') options.dateStyle = dateStyle;
      if (timeStyle !== 'none') options.timeStyle = timeStyle;
      if (!options.dateStyle && !options.timeStyle) options.dateStyle = 'medium';
      return { text: new Intl.DateTimeFormat(String(inputs.locale || 'en-US'), options).format(date), valid: true };
    } catch { return { text: '', valid: false }; }
  }
  return {};
}
