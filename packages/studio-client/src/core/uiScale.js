export function getArcUiScale() {
  const appRoot = typeof document === 'undefined' ? null : document.querySelector('.app-root');
  const declaredScale = Number(appRoot?.dataset.uiScale) / 100;
  return Number.isFinite(declaredScale) && declaredScale > 0 ? declaredScale : 1;
}
