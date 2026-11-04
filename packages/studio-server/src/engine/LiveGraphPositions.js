const MAX_NODE_POSITIONS = 50;
const MAX_COORDINATE = 1_000_000;
//
export function normalizeNodePositions(value, limit = MAX_NODE_POSITIONS) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const positions = [];
  for (const item of value) {
    if (positions.length >= limit) break;
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || seen.has(item.id)) continue;
    const x = Number(item.x);
    const y = Number(item.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) continue;
    seen.add(item.id);
    positions.push({ id: item.id, x: Math.round(x), y: Math.round(y) });
  }
  return positions;
}

export function applyNodePositions(graph, positions) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(positions) || !positions.length) return graph;
  const byId = new Map(positions.map((position) => [position.id, position]));
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    const position = node && byId.get(node.id);
    if (!position || node.x === position.x && node.y === position.y) return node;
    changed = true;
    return { ...node, x: position.x, y: position.y };
  });
  return changed ? { ...graph, nodes } : graph;
}

export function rebaseNodePositions(incomingGraph, liveGraph, nodePositionRevisions, baseRevision) {
  if (!incomingGraph || !Array.isArray(incomingGraph.nodes) || !liveGraph || !Array.isArray(liveGraph.nodes)) return incomingGraph;
  const revisions = nodePositionRevisions && typeof nodePositionRevisions === 'object' ? nodePositionRevisions : {};
  const liveById = new Map(liveGraph.nodes.filter((node) => node && typeof node.id === 'string').map((node) => [node.id, node]));
  let changed = false;
  const nodes = incomingGraph.nodes.map((node) => {
    if (!node || typeof node.id !== 'string') return node;
    const movedAt = Number(revisions[node.id]);
    if (!Number.isInteger(movedAt) || movedAt <= baseRevision) return node;
    const live = liveById.get(node.id);
    if (!live || live.x === node.x && live.y === node.y) return node;
    changed = true;
    return { ...node, x: live.x, y: live.y };
  });
  return changed ? { ...incomingGraph, nodes } : incomingGraph;
}
