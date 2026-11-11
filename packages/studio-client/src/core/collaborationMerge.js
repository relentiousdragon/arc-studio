function valuesEqual(left, right) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function mergeCollaborativeValue(base, local, remote) {
  if (valuesEqual(local, base)) return cloneValue(remote);
  if (valuesEqual(remote, base) || valuesEqual(local, remote)) return cloneValue(local);
  if (remote === undefined) return cloneValue(local);
  if (local === undefined) return cloneValue(remote);
  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeCollaborativeValue(base[key], local[key], remote[key]);
      if (value !== undefined) Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true
      });
    }
    return result;
  }
  if ([base, local, remote].every((value) => Array.isArray(value) && value.every((item) => item && typeof item === 'object' && item.id != null))) {
    const baseById = new Map(base.map((item) => [item.id, item]));
    const localById = new Map(local.map((item) => [item.id, item]));
    const remoteById = new Map(remote.map((item) => [item.id, item]));
    const order = [...remote.map((item) => item.id), ...local.map((item) => item.id)].filter((id, index, ids) => ids.indexOf(id) === index);
    const result = [];
    for (const id of order) {
      const value = mergeCollaborativeValue(baseById.get(id), localById.get(id), remoteById.get(id));
      if (value !== undefined) result.push(value);
    }
    return result;
  }
  if ([base, local, remote].every((value) => Array.isArray(value) && value.length === base.length)) {
    return base.map((item, index) => mergeCollaborativeValue(item, local[index], remote[index]));
  }
  return cloneValue(remote);
}
