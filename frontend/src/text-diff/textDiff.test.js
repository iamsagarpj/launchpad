import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffStats } from './textDiff.js';

test('diffLines reports all lines as equal for identical text', () => {
  const result = diffLines('a\nb\nc', 'a\nb\nc');
  assert.deepEqual(
    result.map((e) => e.type),
    ['equal', 'equal', 'equal']
  );
});

test('diffLines reports an appended line as added', () => {
  const result = diffLines('a\nb', 'a\nb\nc');
  assert.deepEqual(result, [
    { type: 'equal', line: 'a' },
    { type: 'equal', line: 'b' },
    { type: 'added', line: 'c' },
  ]);
});

test('diffLines reports a removed line', () => {
  const result = diffLines('a\nb\nc', 'a\nc');
  assert.deepEqual(result, [
    { type: 'equal', line: 'a' },
    { type: 'removed', line: 'b' },
    { type: 'equal', line: 'c' },
  ]);
});

test('diffLines reports a changed line as a removal followed by an addition', () => {
  const result = diffLines('a\nb\nc', 'a\nX\nc');
  assert.deepEqual(result, [
    { type: 'equal', line: 'a' },
    { type: 'removed', line: 'b' },
    { type: 'added', line: 'X' },
    { type: 'equal', line: 'c' },
  ]);
});

test('diffLines treats an empty left side as entirely added', () => {
  const result = diffLines('', 'a\nb');
  assert.deepEqual(
    result.map((e) => e.type),
    ['added', 'added']
  );
});

test('diffLines treats an empty right side as entirely removed', () => {
  const result = diffLines('a\nb', '');
  assert.deepEqual(
    result.map((e) => e.type),
    ['removed', 'removed']
  );
});

test('diffStats counts each entry type', () => {
  const entries = diffLines('a\nb\nc', 'a\nX\nc\nd');
  const stats = diffStats(entries);
  assert.equal(stats.equal, 2);
  assert.equal(stats.removed, 1);
  assert.equal(stats.added, 2);
});
