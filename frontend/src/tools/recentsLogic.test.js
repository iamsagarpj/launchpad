import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecent, parseRecents, MAX_RECENTS } from './recentsLogic.js';

test('addRecent prepends a new id to the front', () => {
  assert.deepEqual(addRecent(['json'], 'uuid'), ['uuid', 'json']);
});

test('addRecent dedups: re-adding an existing id moves it to the front instead of duplicating', () => {
  assert.deepEqual(addRecent(['json', 'uuid', 'base64'], 'uuid'), ['uuid', 'json', 'base64']);
});

test('addRecent caps the list at the given max', () => {
  const result = addRecent(['a', 'b', 'c'], 'd', 3);
  assert.deepEqual(result, ['d', 'a', 'b']);
  assert.equal(result.length, 3);
});

test('addRecent uses MAX_RECENTS as the default cap', () => {
  const start = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(start.length, MAX_RECENTS);
  const result = addRecent(start, 'f');
  assert.equal(result.length, MAX_RECENTS);
  assert.deepEqual(result, ['f', 'a', 'b', 'c', 'd']);
});

test('parseRecents returns an empty array for null/empty input', () => {
  assert.deepEqual(parseRecents(null), []);
  assert.deepEqual(parseRecents(''), []);
});

test('parseRecents returns an empty array for invalid JSON', () => {
  assert.deepEqual(parseRecents('not json'), []);
});

test('parseRecents filters out non-string entries', () => {
  assert.deepEqual(parseRecents('["json", 42, "uuid"]'), ['json', 'uuid']);
});
