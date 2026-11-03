import test from 'node:test';
import assert from 'node:assert/strict';
import { describeJsonError, findJsonErrorIndex, getJsonIssues } from '../../studio-client/src/core/jsonDiagnostics.js';

const deck = '[\n"12_of_clubs",\n"13_of_clubs",jj hhk  ffy\n"eof"\n]';

const validDocuments = [
  '{}',
  '[]',
  'null',
  'true',
  'false',
  '0',
  '-0',
  '1.5e-3',
  '"text"',
  ' \t\r\n[ 1 , 2 ] \n',
  '{"a":1,"b":[true,false,null],"c":{"d":"\\u00e9\\n"}}',
  '["\\"\\\\\\/\\b\\f\\n\\r\\t"]',
  '{"emoji":"🎉","lone":"\\ud800"}',
  '{"0":1,"":2,"dup":1,"dup":2}',
  '[[[[[[[[[[{"a":[[[1]]]}]]]]]]]]]]',
  `["\u2028\u2029"]`
];
//
test('accepts the documents the runtime accepts', () => {
  for (const document of validDocuments) {
    assert.equal(findJsonErrorIndex(document), -1, document);
    assert.equal(describeJsonError(document), '', document);
    assert.doesNotThrow(() => JSON.parse(document), document);
  }
});

test('accepts deeply nested documents without a recursion limit', () => {
  const deep = `${'['.repeat(6000)}1${']'.repeat(6000)}`;
  assert.equal(findJsonErrorIndex(deep), -1);
});

test('points at the line that broke the JSON, not the closing bracket', () => {
  assert.equal(findJsonErrorIndex(deck), deck.indexOf('jj'));
  assert.match(describeJsonError(deck), /^Invalid JSON · line 3, column \d+$/);
});

test('reports every broken line and keeps one count', () => {
  const brokenDeck = '["1_of_clubs", stray\n"2_of_clubs",\n"3_of_clubs", nope\n"4_of_clubs",\n"5_of_clubs", junk\n"6_of_clubs"\n]';
  const issues = getJsonIssues(brokenDeck);
  assert.deepEqual(issues.map((issue) => issue.line), [1, 3, 5]);
  for (let index = 1; index < issues.length; index += 1) assert.ok(issues[index].index > issues[index - 1].index);
  assert.equal(findJsonErrorIndex(brokenDeck), brokenDeck.indexOf('stray'));
  assert.match(describeJsonError(brokenDeck), /^Invalid JSON · line 1, column \d+ · 3 issues$/);
});

test('returns no issues for a valid document', () => {
  assert.deepEqual(getJsonIssues('{"a": [1, 2, 3]}'), []);
});

test('reports structural mistakes on their own line', () => {
  const cases = [
    ['{"a": 1,}', 8, 1],
    ['{"a" 1}', 5, 1],
    ['{"a":}', 5, 1],
    ['[1,,2]', 3, 1],
    ['[1,]', 3, 1],
    ['[,1]', 1, 1],
    ['{"a": "b}', 9, 1],
    ['"bad\\qescape"', 4, 1],
    ['"raw\u0001control"', 4, 1],
    ['nul', 0, 1],
    ['01', 1, 1],
    ['-', 1, 1],
    ['.5', 0, 1],
    ['1.', 2, 1],
    ['1e', 2, 1],
    ['{} {}', 3, 1],
    ['[\n1,\n2,\n]', 8, 4],
    ['[\n"1", stray\n"2"\n]', 7, 2],
    ['[\n1\n2\n]', 4, 3]
  ];
  for (const [document, position, line] of cases) {
    assert.equal(findJsonErrorIndex(document), position, document);
    assert.equal(describeJsonError(document).match(/line (\d+)/)?.[1], String(line), document);
    assert.throws(() => JSON.parse(document), document);
  }
});

test('rejects whitespace and bytes the grammar does not allow', () => {
  assert.equal(findJsonErrorIndex(''), 0);
  assert.equal(findJsonErrorIndex('   '), 3);
  assert.equal(findJsonErrorIndex('\uFEFF{}'), 0);
  assert.equal(findJsonErrorIndex('{\u00A0}'), 1);
});

test('reports unclosed containers at the end of the text', () => {
  assert.equal(findJsonErrorIndex('{"a": [1, 2'), 11);
  assert.equal(findJsonErrorIndex('[1, 2'), 5);
});

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomValue(random, depth = 0) {
  const pick = random();
  if (depth > 3 || pick < 0.45) {
    const scalar = random();
    if (scalar < 0.3) return Math.floor(random() * 2000) - 1000;
    if (scalar < 0.55) return Number((random() * 20 - 10).toFixed(4));
    if (scalar < 0.7) return random() < 0.2 ? '' : `text ${Math.random().toString(36).slice(2, 6)}`;
    if (scalar < 0.78) return null;
    if (scalar < 0.86) return random() < 0.5;
    return `line\nbreak ${Math.floor(random() * 10)}`;
  }
  if (pick < 0.72) {
    return Array.from({ length: Math.floor(random() * 4) }, () => randomValue(random, depth + 1));
  }
  const object = {};
  const size = Math.floor(random() * 4);
  for (let index = 0; index < size; index += 1) {
    object[`key_${index}_${Math.floor(random() * 1000)}`] = randomValue(random, depth + 1);
  }
  return object;
}

test('agrees with JSON.parse on mutated documents', () => {
  const random = createRandom(20261103);
  const alphabet = '{}[],:"\\ 0123456789.eE+-truefalsnul\n\t\uFEFF';
  for (let round = 0; round < 3000; round += 1) {
    let document = JSON.stringify(randomValue(random));
    const mutations = 1 + Math.floor(random() * 3);
    for (let step = 0; step < mutations; step += 1) {
      const position = Math.floor(random() * (document.length + 1));
      const operation = random();
      if (operation < 0.4) document = document.slice(0, position) + document.slice(position + 1);
      else if (operation < 0.8) document = document.slice(0, position) + alphabet[Math.floor(random() * alphabet.length)] + document.slice(position);
      else document = document.slice(0, position) + document.slice(position + 1) + (document[position] ?? '');
    }
    let accepted = true;
    try {
      JSON.parse(document);
    } catch {
      accepted = false;
    }
    const located = findJsonErrorIndex(document);
    if (accepted) {
      assert.equal(located, -1, `expected valid: ${JSON.stringify(document)}`);
    } else {
      assert.ok(located >= 0 && located <= document.length, `expected a position: ${JSON.stringify(document)}`);
    }
  }
});
