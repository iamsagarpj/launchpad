import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFileName, uniqueFileName, isValidRequestFileShape, uniqueDirName } from './fileCollectionHelpers.js';

test('sanitizeFileName replaces path-unsafe characters with a dash', () => {
  assert.equal(sanitizeFileName('Get /users:all?'), 'Get -users-all-');
});

test('sanitizeFileName trims whitespace', () => {
  assert.equal(sanitizeFileName('  Get users  '), 'Get users');
});

test('sanitizeFileName falls back to "untitled" for an empty/all-unsafe name', () => {
  assert.equal(sanitizeFileName('   '), 'untitled');
  assert.equal(sanitizeFileName('///'), 'untitled');
});

test('uniqueFileName returns "name.json" when there is no collision', () => {
  assert.equal(uniqueFileName(new Set(), 'Get users'), 'Get users.json');
});

test('uniqueFileName appends a numeric suffix on a collision', () => {
  const existing = new Set(['Get users.json']);
  assert.equal(uniqueFileName(existing, 'Get users'), 'Get users (2).json');
});

test('uniqueFileName increments the suffix past repeated collisions', () => {
  const existing = new Set(['Get users.json', 'Get users (2).json', 'Get users (3).json']);
  assert.equal(uniqueFileName(existing, 'Get users'), 'Get users (4).json');
});

test('isValidRequestFileShape accepts a well-formed request file', () => {
  assert.equal(isValidRequestFileShape({ name: 'Get users', request: { method: 'GET' } }), true);
});

test('isValidRequestFileShape rejects a missing name, missing request, or wrong types', () => {
  assert.equal(isValidRequestFileShape({ request: {} }), false);
  assert.equal(isValidRequestFileShape({ name: 'X' }), false);
  assert.equal(isValidRequestFileShape({ name: 'X', request: 'not an object' }), false);
  assert.equal(isValidRequestFileShape(null), false);
  assert.equal(isValidRequestFileShape('not an object'), false);
});

test('uniqueDirName returns the sanitized name when there is no collision', () => {
  assert.equal(uniqueDirName(new Set(), 'Auth flow'), 'Auth flow');
});

test('uniqueDirName appends a numeric suffix on a collision', () => {
  const existing = new Set(['Auth flow']);
  assert.equal(uniqueDirName(existing, 'Auth flow'), 'Auth flow (2)');
});

test('uniqueDirName increments the suffix past repeated collisions', () => {
  const existing = new Set(['Auth flow', 'Auth flow (2)', 'Auth flow (3)']);
  assert.equal(uniqueDirName(existing, 'Auth flow'), 'Auth flow (4)');
});
