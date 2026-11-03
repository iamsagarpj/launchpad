import test from 'node:test';
import assert from 'node:assert/strict';
import { findKeyPaths } from './jsonKeySearch.js';

test('findKeyPaths finds a top-level key by exact name', () => {
  const result = findKeyPaths({ name: 'Launchpad', version: '1.0.0' }, 'name');
  assert.deepEqual(result, [{ path: '$.name', key: 'name', value: 'Launchpad' }]);
});

test('findKeyPaths matches by case-insensitive substring', () => {
  const result = findKeyPaths({ userName: 'x' }, 'NAME');
  assert.deepEqual(result, [{ path: '$.userName', key: 'userName', value: 'x' }]);
});

test('findKeyPaths finds keys nested inside objects and arrays', () => {
  const doc = { services: [{ name: 'a' }, { name: 'b' }], config: { name: 'c' } };
  const result = findKeyPaths(doc, 'name');
  assert.deepEqual(
    result.map((r) => r.path).sort(),
    ['$.config.name', '$.services[0].name', '$.services[1].name']
  );
});

test('findKeyPaths returns an empty array for a blank search term', () => {
  assert.deepEqual(findKeyPaths({ a: 1 }, ''), []);
  assert.deepEqual(findKeyPaths({ a: 1 }, '   '), []);
});

test('findKeyPaths returns an empty array when nothing matches', () => {
  assert.deepEqual(findKeyPaths({ a: 1 }, 'nonexistent'), []);
});

test('findKeyPaths does not descend into or match against array indices', () => {
  const result = findKeyPaths([1, 2, 3], '1');
  assert.deepEqual(result, []);
});
