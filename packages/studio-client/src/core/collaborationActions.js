export function mergeRemoteCollaborationActions(current, updates, projectId, graphId) {
  const nextByUser = new Map(current.map((action) => [action.userId, action]));
  let changed = false;

  for (const action of updates) {
    if (action?.projectId !== projectId || action?.graphId !== graphId || typeof action.userId !== 'string') continue;
    if (nextByUser.get(action.userId) === action) continue;
    nextByUser.set(action.userId, action);
    changed = true;
  }

  return changed ? [...nextByUser.values()] : current;
}
