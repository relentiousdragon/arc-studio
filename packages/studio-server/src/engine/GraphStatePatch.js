export function sameCollaborationValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameCollaborationValue(value, right[index]));
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key) && sameCollaborationValue(left[key], right[key]));
}

export function cloneCollaborationValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function mergeConcurrentGraphValue(base, current, incoming) {
  if (sameCollaborationValue(incoming, base)) return cloneCollaborationValue(current);
  if (sameCollaborationValue(current, base) || sameCollaborationValue(incoming, current)) return cloneCollaborationValue(incoming);
  if (incoming === undefined) return cloneCollaborationValue(current);
  if (current === undefined) return cloneCollaborationValue(incoming);
  if (base && current && incoming && !Array.isArray(base) && !Array.isArray(current) && !Array.isArray(incoming)
    && typeof base === 'object' && typeof current === 'object' && typeof incoming === 'object') {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(incoming)])) {
      const value = mergeConcurrentGraphValue(base[key], current[key], incoming[key]);
      if (value !== undefined) Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true
      });
    }
    return result;
  }
  if ([base, current, incoming].every((value) => Array.isArray(value) && value.every((item) => item && typeof item === 'object' && item.id != null))) {
    const baseById = new Map(base.map((item) => [item.id, item]));
    const currentById = new Map(current.map((item) => [item.id, item]));
    const incomingById = new Map(incoming.map((item) => [item.id, item]));
    const order = [...current.map((item) => item.id), ...incoming.map((item) => item.id)].filter((id, index, ids) => ids.indexOf(id) === index);
    const result = [];
    for (const id of order) {
      const value = mergeConcurrentGraphValue(baseById.get(id), currentById.get(id), incomingById.get(id));
      if (value !== undefined) result.push(value);
    }
    return result;
  }
  return cloneCollaborationValue(incoming);
}

const isSafeKey = (key) => typeof key === 'string' && key.length > 0 && key.length <= 100
  && !['__proto__', 'prototype', 'constructor', 'id'].includes(key);

function mergeOperationValue(current, currentExists, operation, mergeValue) {
  return mergeValue(
    operation.beforeExists ? operation.before : undefined,
    currentExists ? current : undefined,
    operation.afterExists ? operation.after : undefined
  );
}

export function applyGraphStatePatch(graph, patch) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph) || patch?.version !== 1
    || !Array.isArray(patch.fields) || !Array.isArray(patch.collections)) {
    throw new TypeError('Graph patch is invalid.');
  }
  const operationCount = patch.fields.length + patch.collections.reduce((total, collection) => total + (collection?.changes?.length || 0), 0);
  if (patch.fields.length > 100 || patch.collections.length > 100 || operationCount > 20_000) {
    throw new TypeError('Graph patch exceeds the collaboration limits.');
  }
  const result = cloneCollaborationValue(graph);
  const fieldKeys = new Set();
  for (const operation of patch.fields) {
    if (!operation || !isSafeKey(operation.key) || fieldKeys.has(operation.key)
      || typeof operation.beforeExists !== 'boolean' || typeof operation.afterExists !== 'boolean') {
      throw new TypeError('Graph patch contains an invalid field operation.');
    }
    fieldKeys.add(operation.key);
    const currentExists = Object.hasOwn(result, operation.key);
    const merged = mergeOperationValue(result[operation.key], currentExists, operation, mergeConcurrentGraphValue);
    if (merged === undefined) delete result[operation.key];
    else result[operation.key] = merged;
  }

  const collectionKeys = new Set();
  for (const collection of patch.collections) {
    if (!collection || !isSafeKey(collection.key) || collectionKeys.has(collection.key)
      || !Array.isArray(collection.changes)) {
      throw new TypeError('Graph patch contains an invalid collection operation.');
    }
    collectionKeys.add(collection.key);
    const items = Array.isArray(result[collection.key]) ? [...result[collection.key]] : [];
    const changedIds = new Set();
    for (const operation of collection.changes) {
      if (!operation || typeof operation.id !== 'string' || !operation.id.length || operation.id.length > 100
        || changedIds.has(operation.id) || typeof operation.beforeExists !== 'boolean' || typeof operation.afterExists !== 'boolean'
        || operation.beforeExists && operation.before?.id !== operation.id
        || operation.afterExists && operation.after?.id !== operation.id) {
        throw new TypeError('Graph patch contains an invalid entity operation.');
      }
      changedIds.add(operation.id);
      const index = items.findIndex((item) => item?.id === operation.id);
      const currentExists = index >= 0;
      const merged = mergeOperationValue(currentExists ? items[index] : undefined, currentExists, operation, mergeConcurrentGraphValue);
      if (merged === undefined) {
        if (currentExists) items.splice(index, 1);
      } else if (currentExists) {
        items[index] = merged;
      } else {
        items.push(merged);
      }
    }
    result[collection.key] = items;
  }
  return result;
}
