import test from 'node:test';
import assert from 'node:assert/strict';
import { diffJson } from './jsonDiff.js';

test('diffJson reports no diffs for two identical documents', () => {
  const result = diffJson('{"a":1,"b":[1,2]}', '{"a":1,"b":[1,2]}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, []);
});

test('diffJson reports a changed primitive value with its path', () => {
  const result = diffJson('{"a":1}', '{"a":2}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, [{ path: '$.a', type: 'changed', left: 1, right: 2 }]);
});

test('diffJson reports an added key', () => {
  const result = diffJson('{"a":1}', '{"a":1,"b":2}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, [{ path: '$.b', type: 'added', left: undefined, right: 2 }]);
});

test('diffJson reports a removed key', () => {
  const result = diffJson('{"a":1,"b":2}', '{"a":1}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, [{ path: '$.b', type: 'removed', left: 2, right: undefined }]);
});

test('diffJson reports a type change (object to array) as changed, not a deep walk', () => {
  const result = diffJson('{"a":{"x":1}}', '{"a":[1,2]}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, [{ path: '$.a', type: 'changed', left: { x: 1 }, right: [1, 2] }]);
});

test('diffJson walks arrays by index and reports added/removed/changed entries', () => {
  const result = diffJson('[1,2,3]', '[1,9,3,4]');
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, [
    { path: '$[1]', type: 'changed', left: 2, right: 9 },
    { path: '$[3]', type: 'added', left: undefined, right: 4 },
  ]);
});

test('diffJson walks into nested objects and reports the deep path', () => {
  const result = diffJson('{"config":{"port":4040}}', '{"config":{"port":5050}}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, [{ path: '$.config.port', type: 'changed', left: 4040, right: 5050 }]);
});

test('diffJson returns ok:false when the left document is invalid JSON', () => {
  const result = diffJson('{not json}', '{"a":1}');
  assert.equal(result.ok, false);
  assert.match(result.error, /Left document/);
});

test('diffJson returns ok:false when the right document is invalid JSON', () => {
  const result = diffJson('{"a":1}', '{not json}');
  assert.equal(result.ok, false);
  assert.match(result.error, /Right document/);
});
