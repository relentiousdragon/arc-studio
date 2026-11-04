const ROOT_VALUE = 'value';
const ROOT_DONE = 'done';
const MAX_ISSUES = 200;
//
function scanJson(text, recover) {
  const input = String(text ?? '');
  const length = input.length;
  let index = 0;
  const errors = [];
  const stack = [{ type: 'root', stage: ROOT_VALUE }];

  const record = () => {
    if (errors[errors.length - 1] !== index) errors.push(index);
  };

  const skipWhitespace = () => {
    while (index < length) {
      const code = input.charCodeAt(index);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) index += 1;
      else break;
    }
  };

  const readString = () => {
    index += 1;
    while (index < length) {
      const char = input[index];
      const code = input.charCodeAt(index);
      if (char === '"') {
        index += 1;
        return true;
      }
      if (code < 0x20) return false;
      if (char === '\\') {
        const escape = input[index + 1];
        if (escape === undefined) return false;
        if ('"\\/bfnrt'.includes(escape)) {
          index += 2;
          continue;
        }
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(input.slice(index + 2, index + 6))) return false;
          index += 6;
          continue;
        }
        return false;
      }
      index += 1;
    }
    return false;
  };

  const readNumber = () => {
    if (input[index] === '-') index += 1;
    if (input[index] === '0') index += 1;
    else if (input[index] >= '1' && input[index] <= '9') {
      index += 1;
      while (index < length && input[index] >= '0' && input[index] <= '9') index += 1;
    } else return false;
    if (input[index] === '.') {
      index += 1;
      if (!(input[index] >= '0' && input[index] <= '9')) return false;
      while (index < length && input[index] >= '0' && input[index] <= '9') index += 1;
    }
    if (input[index] === 'e' || input[index] === 'E') {
      index += 1;
      if (input[index] === '+' || input[index] === '-') index += 1;
      if (!(input[index] >= '0' && input[index] <= '9')) return false;
      while (index < length && input[index] >= '0' && input[index] <= '9') index += 1;
    }
    return true;
  };

  const finishValue = () => {
    const frame = stack[stack.length - 1];
    frame.stage = frame.type === 'root' ? ROOT_DONE : 'commaOrEnd';
  };

  const synchronize = () => {
    const frame = stack[stack.length - 1];
    if (frame.type === 'root') return false;
    if (index < length && !',]}'.includes(input[index])) {
      while (index < length && !',]}'.includes(input[index])) index += 1;
    } else {
      index += 1;
    }
    if (index >= length) return false;
    if (input[index] === ',') {
      index += 1;
      frame.stage = frame.type === 'object' ? 'key' : 'value';
      return true;
    }
    frame.stage = 'commaOrEnd';
    return true;
  };

  const failAt = () => {
    record();
    if (!recover || errors.length >= MAX_ISSUES) return false;
    return synchronize();
  };

  loop:
  while (true) {
    skipWhitespace();
    const frame = stack[stack.length - 1];
    const stage = frame.stage;
    if (stage === ROOT_DONE) {
      if (index < length) record();
      break;
    }
    if (index >= length) {
      record();
      break;
    }
    const char = input[index];

    if (stage === 'commaOrEnd') {
      if (char === ',') {
        index += 1;
        frame.stage = frame.type === 'object' ? 'key' : 'value';
        continue;
      }
      if (frame.type === 'object' ? char === '}' : char === ']') {
        index += 1;
        stack.pop();
        finishValue();
        continue;
      }
      if (!failAt()) break loop;
      continue;
    }

    if (stage === 'colon') {
      if (char !== ':') {
        if (!failAt()) break loop;
        continue;
      }
      index += 1;
      frame.stage = 'value';
      continue;
    }

    if (stage === 'key' || stage === 'keyOrEnd') {
      if (char === '}' && stage === 'keyOrEnd') {
        index += 1;
        stack.pop();
        finishValue();
        continue;
      }
      if (char === '"' && readString()) {
        frame.stage = 'colon';
        continue;
      }
      if (!failAt()) break loop;
      continue;
    }

    if (char === ']' && stage === 'valueOrEnd') {
      index += 1;
      stack.pop();
      finishValue();
      continue;
    }

    if (char === '{' || char === '[') {
      index += 1;
      stack.push({ type: char === '{' ? 'object' : 'array', stage: char === '{' ? 'keyOrEnd' : 'valueOrEnd' });
      continue;
    }
    if (char === '"') {
      if (!readString()) {
        if (!failAt()) break loop;
        continue;
      }
      finishValue();
      continue;
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      if (!readNumber()) {
        if (!failAt()) break loop;
        continue;
      }
      finishValue();
      continue;
    }
    if (input.startsWith('true', index)) {
      index += 4;
      finishValue();
      continue;
    }
    if (input.startsWith('false', index)) {
      index += 5;
      finishValue();
      continue;
    }
    if (input.startsWith('null', index)) {
      index += 4;
      finishValue();
      continue;
    }
    if (!failAt()) break loop;
  }

  return errors;
}

export function findJsonErrorIndex(text) {
  const errors = scanJson(text, false);
  return errors.length ? errors[0] : -1;
}

export function getJsonIssues(value) {
  const text = String(value ?? '');
  try {
    JSON.parse(text);
    return [];
  } catch {
    // 
  }
  const indices = scanJson(text, true);
  const positions = indices.length ? indices : [text.length];
  return positions.map((index) => {
    const before = text.slice(0, index).split('\n');
    return { index, line: before.length, column: before[before.length - 1].length + 1 };
  });
}

export function describeJsonError(value) {
  const issues = getJsonIssues(value);
  if (!issues.length) return '';
  const first = issues[0];
  const count = issues.length === 1 ? '' : ` · ${issues.length} issues`;
  return `Invalid JSON · line ${first.line}, column ${first.column}${count}`;
}
