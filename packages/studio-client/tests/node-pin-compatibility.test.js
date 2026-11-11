import test from 'node:test';
import assert from 'node:assert/strict';
import { isConvertiblePinPair } from '../src/components/nodes/nodeDefinitions.js';
//
test('allows string and number pins to connect with conversion', () => {
  assert.equal(isConvertiblePinPair('number', 'string'), true);
  assert.equal(isConvertiblePinPair('string', 'number'), true);
});

test('does not treat unrelated pin types as convertible', () => {
  assert.equal(isConvertiblePinPair('number', 'boolean'), false);
  assert.equal(isConvertiblePinPair('boolean', 'string'), false);
});
