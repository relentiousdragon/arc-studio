export const xmasSnow = (date = new Date()) => date.getMonth() === 11 && date.getDate() >= 20;
export const halloweenFrills = (date = new Date()) => date.getMonth() === 9 && date.getDate() >= 15;
export const fallLeaves = (date = new Date()) => date.getMonth() === 9;

const SPLASH_EFFECT_PREFERENCE_PREFIX = 'arc_splash_effects_disabled:';

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return null; }
}

export function getSplashSeasonalState(date = new Date(), storage = browserStorage()) {
  const fall = fallLeaves(date);
  const halloween = halloweenFrills(date);
  const snow = xmasSnow(date);
  const seasonId = fall ? `fall-${date.getFullYear()}` : snow ? `winter-${date.getFullYear()}` : '';
  const activeKey = seasonId ? `${SPLASH_EFFECT_PREFERENCE_PREFIX}${seasonId}` : '';
  let enabled = true;

  if (storage) {
    try {
      const staleKeys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(SPLASH_EFFECT_PREFERENCE_PREFIX) && key !== activeKey) staleKeys.push(key);
      }
      for (const key of staleKeys) storage.removeItem(key);
      enabled = !activeKey || storage.getItem(activeKey) !== 'disabled';
    } catch {}
  }

  return { seasonId, fall, halloween, snow, enabled };
}

export function setSplashSeasonalEffectsEnabled(seasonId, enabled, storage = browserStorage()) {
  if (!seasonId || !storage) return;
  const key = `${SPLASH_EFFECT_PREFERENCE_PREFIX}${seasonId}`;
  try {
    if (enabled) storage.removeItem(key);
    else storage.setItem(key, 'disabled');
  } catch {}
}
