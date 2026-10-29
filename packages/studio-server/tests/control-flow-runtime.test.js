import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import {
  executeCountedLoop,
  executeParallelBranches,
  executeRepeatWhile,
  isControlFlowNodeType,
  parseWaitUntilTime,
  selectIfBranch,
  selectSwitchBranch,
  validateDelayDuration,
  validateLoopCount,
  validateRepeatInterval,
  validateWaitConditionSettings,
  waitFor
} from '../src/engine/nodes/runtime/control_flow.js';
//
test('control flow helpers select branches and enforce bounded timing and loop inputs', () => {
  assert.deepEqual(selectIfBranch('false'), {
    branchPin: 'true_exec',
    logMessage: '[Branch] Condition evaluated to: true'
  });
  assert.deepEqual(selectSwitchBranch(2, (index) => index === 2 ? '2' : ''), {
    branchPin: 'case_2_exec',
    logMessage: '[Switch] Value matched Case 2'
  });
  assert.equal(selectSwitchBranch('missing', () => '').branchPin, 'default_exec');

  assert.equal(validateDelayDuration('250'), 250);
  assert.equal(validateLoopCount(2.9), 2);
  assert.equal(validateRepeatInterval(100), 100);
  assert.deepEqual(validateWaitConditionSettings(1000, 100), { timeoutMs: 1000, intervalMs: 100 });
  assert.deepEqual(parseWaitUntilTime('2000', 1000), { targetTime: 2000, waitMs: 1000 });
  assert.deepEqual(parseWaitUntilTime(new Date(2000).toISOString(), 1000), { targetTime: 2000, waitMs: 1000 });

  assert.throws(() => validateDelayDuration(-1), /Wait duration/);
  assert.throws(() => validateLoopCount(1001), /1,000 iterations/);
  assert.throws(() => validateRepeatInterval(99), /Repeat While interval/);
  assert.throws(() => validateWaitConditionSettings(0, 100), /timeout/);
  assert.throws(() => parseWaitUntilTime('not a time', 1000), /valid ISO date\/time/);
  assert.equal(isControlFlowNodeType('parallel'), true);
  assert.equal(isControlFlowNodeType('action_send_message'), false);
});

test('counted loop executes each iteration and reports invalid body and join paths', async () => {
  const indexes = [];
  const invalidations = [];
  const logs = [];
  const completed = [{ targetNodeId: 'next' }];
  const result = await executeCountedLoop({
    count: 3,
    bodyWires: [{ targetNodeId: 'body' }],
    completedWires: completed,
    setIndex: (index) => indexes.push(index),
    invalidateBody: (wires) => invalidations.push(wires),
    runBody: async () => ({}),
    log: (message) => logs.push(message)
  });
  assert.deepEqual(indexes, [0, 1, 2]);
  assert.equal(invalidations.length, 3);
  assert.equal(result, completed);
  await assert.rejects(executeCountedLoop({
    count: 1,
    bodyWires: [],
    completedWires: [],
    setIndex: () => {},
    invalidateBody: () => {},
    runBody: async () => ({}),
    log: () => {}
  }), /Body output/);
  await assert.rejects(executeCountedLoop({
    count: 1,
    bodyWires: [{}],
    completedWires: [],
    setIndex: () => {},
    invalidateBody: () => {},
    runBody: async () => ({ joinId: 'join' }),
    log: () => {}
  }), /Parallel Join boundary/);
  await assert.rejects(executeCountedLoop({
    count: 1,
    bodyWires: [{}],
    completedWires: [],
    setIndex: () => {},
    invalidateBody: () => {},
    runBody: async () => ({ error: 'cancelled' }),
    createExecutionError: (message) => Object.assign(new Error(message), { name: 'AbortError' }),
    log: () => {}
  }), { name: 'AbortError', message: 'cancelled' });
});

test('repeat loop rechecks conditions, waits before body runs, and restores loop state', async () => {
  const conditionValues = [true, true, true, true, true, false];
  const waits = [];
  const iterations = [];
  const loopStates = [];
  let flowSteps = 20;
  let bodies = 0;
  const completed = [{ targetNodeId: 'done' }];
  const result = await executeRepeatWhile({
    intervalMs: 100,
    bodyWires: [{ targetNodeId: 'body' }],
    completedWires: completed,
    getCondition: () => conditionValues.shift() ?? false,
    wait: async (duration) => waits.push(duration),
    setIteration: (iteration) => iterations.push(iteration),
    invalidateBody: () => {},
    runBody: async () => {
      bodies += 1;
      flowSteps += 10;
      return {};
    },
    beginLoop: (state) => loopStates.push(state),
    endLoop: () => loopStates.pop(),
    getFlowStepCount: () => flowSteps,
    setFlowStepCount: (value) => { flowSteps = value; },
    log: () => {}
  });

  assert.equal(result, completed);
  assert.equal(bodies, 2);
  assert.deepEqual(waits, [100, 100]);
  assert.deepEqual(iterations, [1, 2]);
  assert.deepEqual(loopStates, []);
  assert.equal(flowSteps, 20);
});

test('parallel coordinator requires one wire per branch and a shared join', async () => {
  const starts = [];
  const logs = [];
  const joinId = await executeParallelBranches(
    [[{ branch: 'a' }], [{ branch: 'b' }]],
    async (branch) => {
      starts.push(branch[0].branch);
      return { joinId: 'join-1' };
    },
    (message) => logs.push(message)
  );
  assert.equal(joinId, 'join-1');
  assert.deepEqual(starts.sort(), ['a', 'b']);
  assert.equal(logs.length, 2);

  await assert.rejects(executeParallelBranches([[], [{}]], async () => ({}), () => {}), /exactly one wire/);
  await assert.rejects(executeParallelBranches([[{}], [{}]], async (branch) => ({ joinId: branch[0].id }), () => {}), /same Join/);
  await assert.rejects(executeParallelBranches([[{ fail: true }], [{}]], async (branch) => branch[0].fail ? ({ error: 'branch failed' }) : ({ joinId: 'join' }), () => {}), /branch failed/);
});

test('GraphRunner routes selected If and Switch branches and preserves loop outputs', async () => {
  const executed = [];
  const graph = {
    id: 'control-flow-integration',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'switch', type: 'branch_switch', data: { value: '2', case_1: '1', case_2: '2' } },
      { id: 'wrong', type: 'action_send_message', data: { channel_id: 'channel', content: 'wrong' } },
      { id: 'right', type: 'action_send_message', data: { channel_id: 'channel', content: 'right' } },
      { id: 'loop', type: 'loop_count', data: { count: 2 } },
      { id: 'loop-body', type: 'action_send_message', data: { channel_id: 'channel', content: 'loop' } },
      { id: 'complete', type: 'action_send_message', data: { channel_id: 'channel', content: 'complete' } }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'switch', targetPinId: 'exec' },
      { sourceNodeId: 'switch', sourcePinId: 'case_1_exec', targetNodeId: 'wrong', targetPinId: 'exec' },
      { sourceNodeId: 'switch', sourcePinId: 'case_2_exec', targetNodeId: 'right', targetPinId: 'exec' },
      { sourceNodeId: 'right', sourcePinId: 'exec', targetNodeId: 'loop', targetPinId: 'exec' },
      { sourceNodeId: 'loop', sourcePinId: 'body_exec', targetNodeId: 'loop-body', targetPinId: 'exec' },
      { sourceNodeId: 'loop', sourcePinId: 'completed_exec', targetNodeId: 'complete', targetPinId: 'exec' }
    ]
  };
  const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', {}, {
    mock: true,
    rest: { createMessage: async (_channelId, payload) => executed.push(payload.content) },
    log: () => {}
  });
  assert.equal(result.error, null);
  assert.deepEqual(executed, ['right', 'loop', 'loop', 'complete']);

  const ifGraph = {
    id: 'if-flow',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'branch', type: 'branch_if', data: { condition: false } },
      { id: 'false', type: 'action_send_message', data: { channel_id: 'channel', content: 'false' } }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'branch', targetPinId: 'exec' },
      { sourceNodeId: 'branch', sourcePinId: 'false_exec', targetNodeId: 'false', targetPinId: 'exec' }
    ]
  };
  const ifResult = await GraphRunner.execute(ifGraph, 'MESSAGE_CREATE', {}, {
    mock: true,
    rest: { createMessage: async (_channelId, payload) => executed.push(payload.content) },
    log: () => {}
  });
  assert.equal(ifResult.error, null);
  assert.equal(executed.at(-1), 'false');
});

test('GraphRunner waits for both parallel branches before continuing through their join', async () => {
  const calls = [];
  const graph = {
    id: 'parallel-integration',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'parallel', type: 'parallel' },
      { id: 'left', type: 'action_send_message', data: { channel_id: 'channel', content: 'left' } },
      { id: 'right', type: 'action_send_message', data: { channel_id: 'channel', content: 'right' } },
      { id: 'join', type: 'parallel_join' },
      { id: 'after', type: 'action_send_message', data: { channel_id: 'channel', content: 'after' } }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'parallel', targetPinId: 'exec' },
      { sourceNodeId: 'parallel', sourcePinId: 'branch_a_exec', targetNodeId: 'left', targetPinId: 'exec' },
      { sourceNodeId: 'parallel', sourcePinId: 'branch_b_exec', targetNodeId: 'right', targetPinId: 'exec' },
      { sourceNodeId: 'left', sourcePinId: 'exec', targetNodeId: 'join', targetPinId: 'exec' },
      { sourceNodeId: 'right', sourcePinId: 'exec', targetNodeId: 'join', targetPinId: 'exec' },
      { sourceNodeId: 'join', sourcePinId: 'exec', targetNodeId: 'after', targetPinId: 'exec' }
    ]
  };
  const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', {}, {
    mock: true,
    rest: {
      createMessage: async (_channelId, payload) => {
        calls.push(payload.content);
        return { id: payload.content };
      }
    },
    log: () => {}
  });

  assert.equal(result.error, null);
  assert.deepEqual(new Set(calls), new Set(['left', 'right', 'after']));
  assert.equal(calls.at(-1), 'after');
});

test('wait helper rejects promptly when its signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitFor(10, controller.signal), { name: 'AbortError', message: 'Graph execution cancelled.' });
});
