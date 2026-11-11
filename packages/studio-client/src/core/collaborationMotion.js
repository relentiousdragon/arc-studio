export function getRemoteCursorInterpolationDuration(previousUpdateAt, currentUpdateAt) {
  const previous = Number(previousUpdateAt);
  const current = Number(currentUpdateAt);
  const gap = Number.isFinite(previous) && Number.isFinite(current)
    ? Math.max(0, current - previous)
    : 32;
  return Math.min(110, Math.max(20, gap * 0.8));
}
