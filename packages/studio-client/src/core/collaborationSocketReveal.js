function revealColumn(map, nodeId, column) {
  if (typeof nodeId !== 'string' || !nodeId || !['inputs', 'outputs'].includes(column)) return;
  const columns = map.get(nodeId) || { inputs: false, outputs: false };
  columns[column] = true;
  map.set(nodeId, columns);
}

export function getRemoteSocketRevealByNode(actions) {
  const revealByNode = new Map();
  for (const peer of actions || []) {
    const action = peer?.action;
    if (action?.kind === 'wire-drag') {
      const sourceColumn = action.direction === 'input' ? 'inputs' : action.direction === 'output' ? 'outputs' : null;
      revealColumn(revealByNode, action.nodeId, sourceColumn);
      if (action.snapTarget) {
        const targetColumn = sourceColumn === 'inputs' ? 'outputs' : sourceColumn === 'outputs' ? 'inputs' : null;
        revealColumn(revealByNode, action.snapTarget.nodeId, targetColumn);
      }
    }
    const reveals = Array.isArray(action?.socketReveals)
      ? action.socketReveals
      : action?.socketReveal ? [action.socketReveal] : [];
    for (const reveal of reveals) revealColumn(revealByNode, reveal?.nodeId, reveal?.column);
  }
  return revealByNode;
}
