export const AUTO_QUALITY_SWITCH_COOLDOWN_MS = 10_000;
export const AUTO_QUALITY_PROBE_DELAY_MS = 60_000;

let autoQualityDisabledForRuntime = false;

const summarizeFrames = (frames) => {
  if (frames.length < 45) return null;
  const ordered = [...frames].sort((left, right) => left - right);
  const total = ordered.reduce((sum, value) => sum + value, 0);
  const mean = total / ordered.length;
  const cadence = ordered[Math.floor((ordered.length - 1) * 0.5)];
  const p95 = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))];
  const slowFrames = ordered.filter((value) => value > cadence * 1.5).length;
  return { mean, cadence, p95, slowRatio: slowFrames / ordered.length };
};

const pushFrame = (frames, interval) => {
  if (!Number.isFinite(interval) || interval < 4 || interval > 250) return false;
  frames.push(interval);
  if (frames.length > 240) frames.shift();
  return true;
};
//
export function createAutoCanvasQualityController(now = performance.now()) {
  return {
    preset: 'optimal',
    presetStartedAt: now,
    lastSwitchAt: now,
    frames: [],
    framesSinceCheck: 0,
    stableFrameCount: 0,
    pendingPreset: null,
    qualityBlocked: autoQualityDisabledForRuntime,
    qualityAttempted: false,
    qualityBaselineMs: 0,
    qualityWarmupFrames: 0,
    qualityTrialFrames: [],
    qualityFramesSinceCheck: 0,
    qualityTrialComplete: false
  };
}

export function resetAutoCanvasQualityController(controller, now = performance.now()) {
  const qualityBlocked = controller.qualityBlocked || autoQualityDisabledForRuntime;
  Object.assign(controller, createAutoCanvasQualityController(now), { qualityBlocked });
}

export function recordAutoCanvasFrame(controller, interval, now = performance.now()) {
  if (controller.preset === 'quality') {
    if (controller.qualityWarmupFrames > 0) {
      controller.qualityWarmupFrames -= 1;
      return null;
    }
    if (controller.qualityTrialComplete || !controller.qualityBaselineMs) return null;
    if (!pushFrame(controller.qualityTrialFrames, interval)) return null;
    controller.qualityFramesSinceCheck += 1;
    if (controller.qualityTrialFrames.length < 45
      || controller.qualityTrialFrames.length > 45 && controller.qualityFramesSinceCheck < 15) return null;
    controller.qualityFramesSinceCheck = 0;
    const trial = summarizeFrames(controller.qualityTrialFrames);
    if (!trial) return null;
    if (trial.mean >= controller.qualityBaselineMs * 1.08) {
      controller.qualityBlocked = true;
      autoQualityDisabledForRuntime = true;
      controller.pendingPreset = 'optimal';
      return { immediatePreset: 'optimal', qualityRegression: true };
    }
    if (controller.qualityTrialFrames.length >= 120) controller.qualityTrialComplete = true;
    return null;
  }

  if (!pushFrame(controller.frames, interval)) return null;
  controller.framesSinceCheck += 1;
  controller.stableFrameCount += 1;
  if (controller.frames.length < 45
    || controller.frames.length > 45 && controller.framesSinceCheck < 15) return null;
  controller.framesSinceCheck = 0;
  const stats = summarizeFrames(controller.frames);
  if (!stats) return null;

  if (controller.preset === 'fast') {
    const stable = stats.mean <= Math.max(18.5, stats.cadence * 1.15)
      && stats.p95 <= Math.max(27, stats.cadence * 1.6)
      && stats.slowRatio <= 0.06;
    controller.pendingPreset = stable && controller.frames.length >= 180 ? 'optimal' : null;
    return null;
  }

  const struggling = stats.mean > 24
    || stats.mean > stats.cadence * 1.35 && stats.slowRatio > 0.1
    || stats.p95 > Math.max(38, stats.cadence * 2.1) && stats.slowRatio > 0.08;
  if (struggling) {
    controller.stableFrameCount = 0;
    controller.pendingPreset = 'fast';
    return null;
  }

  controller.pendingPreset = null;
  const maintained = stats.mean <= Math.max(18.5, stats.cadence * 1.15)
    && stats.p95 <= Math.max(27, stats.cadence * 1.6)
    && stats.slowRatio <= 0.04;
  if (!maintained) {
    controller.stableFrameCount = 0;
    return null;
  }
  if (!controller.qualityBlocked && !controller.qualityAttempted && maintained
    && controller.stableFrameCount >= 600
    && now - controller.presetStartedAt >= AUTO_QUALITY_PROBE_DELAY_MS) {
    controller.pendingPreset = 'quality';
  }
  return null;
}

export function commitPendingAutoCanvasQuality(controller, now = performance.now(), force = false) {
  const nextPreset = controller.pendingPreset;
  if (!nextPreset || nextPreset === controller.preset) return null;
  if (!force && now - controller.lastSwitchAt < AUTO_QUALITY_SWITCH_COOLDOWN_MS) return null;
  if (nextPreset === 'quality' && (controller.qualityBlocked || controller.qualityAttempted)) return null;

  if (nextPreset === 'quality') {
    const baseline = summarizeFrames(controller.frames);
    if (!baseline) {
      controller.pendingPreset = null;
      return null;
    }
    controller.qualityAttempted = true;
    controller.qualityBaselineMs = baseline.mean;
    controller.qualityWarmupFrames = 24;
    controller.qualityTrialFrames = [];
    controller.qualityFramesSinceCheck = 0;
    controller.qualityTrialComplete = false;
  }

  controller.preset = nextPreset;
  controller.presetStartedAt = now;
  controller.lastSwitchAt = now;
  controller.frames = [];
  controller.framesSinceCheck = 0;
  controller.stableFrameCount = 0;
  controller.pendingPreset = null;
  return nextPreset;
}
