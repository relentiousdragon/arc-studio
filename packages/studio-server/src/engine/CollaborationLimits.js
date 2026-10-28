export const MAX_REALTIME_COLLABORATORS = 10;

export const COLLABORATOR_COLORS = Object.freeze([
  '#63b3ed', '#f687b3', '#68d391', '#f6ad55', '#b794f4',
  '#4fd1c5', '#fc8181', '#90cdf4', '#fbd38d', '#9ae6b4'
]);

export function getActiveCollaborators(clients, openState) {
  const active = new Map();
  for (const client of clients || []) {
    const userId = String(client?.arcUser?.id || '');
    if (!client?.arcAuthenticated || client.readyState !== openState || !userId || active.has(userId)) continue;
    active.set(userId, { userId, color: client.arcColor || '' });
  }
  return [...active.values()];
}

export function getCollaboratorColor(userId, activeCollaborators = []) {
  const normalizedUserId = String(userId || '');
  const existing = activeCollaborators.find((collaborator) => collaborator.userId === normalizedUserId && collaborator.color);
  if (existing) return existing.color;

  const usedColors = new Set(activeCollaborators.map((collaborator) => collaborator.color).filter(Boolean));
  return COLLABORATOR_COLORS.find((color) => !usedColors.has(color)) || COLLABORATOR_COLORS[0];
}
