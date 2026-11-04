const CONTROL_FLOW_NODE_TYPES = new Set([
  'branch_if',
  'branch_switch',
  'delay',
  'loop_count',
  'repeat_while',
  'wait_until_condition',
  'wait_until_time',
  'parallel',
  'parallel_join'
]);
//
export function waitFor(ms, signal) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Graph execution cancelled.'), { name: 'AbortError' }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, ms));
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(Object.assign(new Error('Graph execution cancelled.'), { name: 'AbortError' }));
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function isControlFlowNodeType(type) {
  return CONTROL_FLOW_NODE_TYPES.has(type);
}

export function selectIfBranch(condition) {
  return {
    branchPin: condition ? 'true_exec' : 'false_exec',
    logMessage: `[Branch] Condition evaluated to: ${Boolean(condition)}`
  };
}

export function selectSwitchBranch(value, resolveCase) {
  const selected = Array.from({ length: 50 }, (_, index) => index + 1).find((index) => {
    const caseValue = resolveCase(index);
    return caseValue !== '' && String(value ?? '') === String(caseValue ?? '');
  });
  return {
    branchPin: selected ? `case_${selected}_exec` : 'default_exec',
    logMessage: `[Switch] Value matched ${selected ? `Case ${selected}` : 'Default'}`
  };
}

export function validateDelayDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0 || ms > 604_800_000) throw new Error('Wait duration must be between 0 ms and 7 days.');
  return ms;
}

export function validateLoopCount(value) {
  const rawCount = Number(value);
  if (!Number.isFinite(rawCount) || rawCount < 0) throw new Error('For Count needs a finite count of zero or more.');
  const count = Math.trunc(rawCount);
  if (count > 1000) throw new Error('For Count is limited to 1,000 iterations per run.');
  return count;
}

export function validateRepeatInterval(value) {
  const intervalMs = Number(value);
  if (!Number.isFinite(intervalMs) || intervalMs < 100 || intervalMs > 604_800_000) throw new Error('Repeat While interval must be between 100 ms and 7 days.');
  return intervalMs;
}

export function validateWaitConditionSettings(timeoutValue, intervalValue) {
  const timeoutMs = Number(timeoutValue);
  const intervalMs = Number(intervalValue);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 86_400_000) throw new Error('Wait Until Condition timeout must be between 1 ms and 24 hours.');
  if (!Number.isFinite(intervalMs) || intervalMs < 50 || intervalMs > 10_000) throw new Error('Wait Until Condition check interval must be between 50 and 10,000 ms.');
  return { timeoutMs, intervalMs };
}

export function parseWaitUntilTime(value, now = Date.now()) {
  const rawTime = String(value || '').trim();
  const targetTime = /^-?\d+(?:\.\d+)?$/.test(rawTime) ? Number(rawTime) : Date.parse(rawTime);
  if (!rawTime || !Number.isFinite(targetTime)) throw new Error('Wait Until Time needs a valid ISO date/time or Unix timestamp in milliseconds.');
  const waitMs = targetTime - now;
  if (waitMs > 7 * 24 * 60 * 60 * 1000) throw new Error('Wait Until Time cannot wait more than 7 days.');
  return { targetTime, waitMs };
}

export async function executeCountedLoop({
  count,
  bodyWires,
  completedWires,
  runBody,
  setIndex,
  invalidateBody,
  createExecutionError = (message) => new Error(message),
  log
}) {
  if (count > 0 && bodyWires.length === 0) throw new Error('For Count needs at least one wire connected to its Body output.');
  if (bodyWires.length && count > 0) {
    for (let index = 0; index < count; index += 1) {
      setIndex(index);
      log(`[For Count] Iteration ${index + 1} of ${count}.`);
      invalidateBody(bodyWires);
      const result = await runBody(bodyWires);
      if (result?.error) throw createExecutionError(result.error);
      if (result?.joinId) throw createExecutionError('For Count cannot cross a Parallel Join boundary. Put the loop inside the parallel branch instead.');
    }
  }
  return completedWires;
}

export async function executeRepeatWhile({
  intervalMs,
  bodyWires,
  completedWires,
  getCondition,
  wait,
  setIteration,
  invalidateBody,
  runBody,
  beginLoop,
  endLoop,
  getFlowStepCount,
  setFlowStepCount,
  createExecutionError = (message) => new Error(message),
  log
}) {
  const loopState = { iteration: 0, lastLogAt: 0 };
  const currentStepBaseline = getFlowStepCount();
  if (getCondition() && !bodyWires.length) throw new Error('Repeat While needs at least one wire connected to its Body output.');
  beginLoop(loopState);
  try {
    while (getCondition()) {
      if (loopState.iteration === 0 || Date.now() - loopState.lastLogAt >= 30_000) {
        log(`[Repeat While] Waiting ${intervalMs} ms before iteration ${loopState.iteration + 1}.`);
      }
      await wait(intervalMs);
      if (!getCondition()) break;
      loopState.iteration += 1;
      setIteration(loopState.iteration);
      invalidateBody(bodyWires);
      const bodyResult = await runBody(bodyWires);
      if (bodyResult?.error) throw createExecutionError(bodyResult.error);
      if (bodyResult?.joinId) throw createExecutionError('Repeat While cannot cross a Parallel Join boundary. Put the loop inside the parallel branch instead.');
      setFlowStepCount(currentStepBaseline);
    }
  } finally {
    endLoop();
    setFlowStepCount(currentStepBaseline);
  }
  return completedWires;
}

export async function executeParallelBranches(branches, runBranch, log, createExecutionError = (message) => new Error(message)) {
  if (branches.length < 2 || branches.some((branch) => branch.length !== 1)) throw createExecutionError('Parallel needs at least two connected branches and exactly one wire per branch output.');
  log(`[Parallel] Running ${branches.length} branches concurrently. Connect every branch to the same Join node.`);
  const results = await Promise.all(branches.map((branch) => runBranch(branch)));
  const failed = results.find((result) => result?.error);
  if (failed) throw createExecutionError(failed.error);
  const joinIds = new Set(results.map((result) => result?.joinId).filter(Boolean));
  if (joinIds.size !== 1 || results.some((result) => !result?.joinId)) throw createExecutionError('Every Parallel branch must reach the same Join node.');
  const joinId = [...joinIds][0];
  log('[Parallel] All branches completed. Continuing after Join.');
  return joinId;
}
