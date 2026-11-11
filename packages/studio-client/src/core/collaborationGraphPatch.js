function equalValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => equalValue(value, right[index]));
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key) && equalValue(left[key], right[key]));
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hasStableIds(items) {
  if (!Array.isArray(items)) return false;
  const ids = items.map((item) => item?.id);
  return items.every((item, index) => item && typeof item === 'object' && !Array.isArray(item)
    && typeof ids[index] === 'string' && ids[index].length > 0 && ids[index].length <= 100)
    && new Set(ids).size === ids.length;
}

function preservesEntityOrder(before, after) {
  const beforeIds = before.map((item) => item.id);
  const afterIds = after.map((item) => item.id);
  const afterSet = new Set(afterIds);
  const beforeSet = new Set(beforeIds);
  const expected = [
    ...beforeIds.filter((id) => afterSet.has(id)),
    ...afterIds.filter((id) => !beforeSet.has(id))
  ];
  return expected.length === afterIds.length && expected.every((id, index) => id === afterIds[index]);
}

function propertyChange(key, before, after, beforeExists, afterExists) {
  return {
    key,
    beforeExists,
    ...(beforeExists ? { before: cloneValue(before) } : {}),
    afterExists,
    ...(afterExists ? { after: cloneValue(after) } : {})
  };
}

function entityChange(id, before, after, beforeExists, afterExists) {
  return {
    id,
    beforeExists,
    ...(beforeExists ? { before: cloneValue(before) } : {}),
    afterExists,
    ...(afterExists ? { after: cloneValue(after) } : {})
  };
}

export function createCollaborationGraphPatch(base, next) {
  if (!base || !next || base.id !== next.id) return null;
  const fields = [];
  const collections = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (key === 'id') continue;
    const beforeExists = Object.hasOwn(base, key);
    const afterExists = Object.hasOwn(next, key);
    const before = base[key];
    const after = next[key];
    if (beforeExists === afterExists && equalValue(before, after)) continue;
    if (beforeExists && afterExists && hasStableIds(before) && hasStableIds(after) && preservesEntityOrder(before, after)) {
      const beforeById = new Map(before.map((item) => [item.id, item]));
      const afterById = new Map(after.map((item) => [item.id, item]));
      const changes = [];
      for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
        const beforeItem = beforeById.get(id);
        const afterItem = afterById.get(id);
        const hasBefore = beforeById.has(id);
        const hasAfter = afterById.has(id);
        if (hasBefore === hasAfter && equalValue(beforeItem, afterItem)) continue;
        changes.push(entityChange(id, beforeItem, afterItem, hasBefore, hasAfter));
      }
      if (changes.length) collections.push({ key, changes });
      continue;
    }
    fields.push(propertyChange(key, before, after, beforeExists, afterExists));
  }
  return { version: 1, fields, collections };
}
