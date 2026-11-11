export const MAX_VISIBLE_DATA_SOCKETS = 11;
//
export function getNodesNearInputSockets(point, nodeRects, sourceNodeId, maxDistance = 56) {
  const nearby = [];
  for (const item of nodeRects || []) {
    if (!item?.nodeId || item.nodeId === sourceNodeId || !item.rect) continue;
    const dx = Math.max(item.rect.left - point.x, 0, point.x - item.rect.right);
    const dy = Math.max(item.rect.top - point.y, 0, point.y - item.rect.bottom);
    if (Math.hypot(dx, dy) <= maxDistance) nearby.push(item.nodeId);
  }
  return nearby;
}

export function getVisibleNodeSockets(pins, connectedPinIds, expanded = false, enabled = true) {
  const entries = (Array.isArray(pins) ? pins : []).map((pin, index) => ({ pin, index }));
  if (!enabled) return { entries, hiddenCount: 0 };

  let dataSocketIndex = 0;
  let lastVisibleDataSocket = MAX_VISIBLE_DATA_SOCKETS;
  for (const entry of entries) {
    if (entry.pin?.type === 'exec') continue;
    dataSocketIndex += 1;
    if (connectedPinIds?.has?.(entry.pin?.id) === true) {
      lastVisibleDataSocket = Math.max(lastVisibleDataSocket, dataSocketIndex);
    }
  }

  const visibleThrough = expanded ? dataSocketIndex : lastVisibleDataSocket;
  const visible = [];
  let hiddenCount = 0;
  dataSocketIndex = 0;
  for (const entry of entries) {
    if (entry.pin?.type === 'exec') {
      visible.push(entry);
      continue;
    }
    dataSocketIndex += 1;
    if (dataSocketIndex <= visibleThrough) visible.push(entry);
    else hiddenCount += 1;
  }

  return { entries: visible, hiddenCount };
}
