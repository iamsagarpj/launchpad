import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSavedRequests, upsertSavedRequest, removeSavedRequest } from './savedRequestsLogic.js';

test('parseSavedRequests returns an empty array for null/empty input', () => {
  assert.deepEqual(parseSavedRequests(null), []);
  assert.deepEqual(parseSavedRequests(''), []);
});

test('parseSavedRequests returns an empty array for invalid JSON', () => {
  assert.deepEqual(parseSavedRequests('not json'), []);
});

test('parseSavedRequests filters out entries missing a name or request', () => {
  const raw = JSON.stringify([{ name: 'Get users', request: { method: 'GET' } }, { request: {} }, { name: 'bad' }]);
  assert.deepEqual(parseSavedRequests(raw), [{ name: 'Get users', request: { method: 'GET' } }]);
});

test('upsertSavedRequest adds a new saved request', () => {
  const result = upsertSavedRequest([], { name: 'Get users', request: { method: 'GET' } });
  assert.deepEqual(result, [{ name: 'Get users', request: { method: 'GET' } }]);
});

test('upsertSavedRequest replaces an existing saved request with the same name', () => {
  const existing = [{ name: 'Get users', request: { method: 'GET' } }];
  const result = upsertSavedRequest(existing, { name: 'Get users', request: { method: 'POST' } });
  assert.deepEqual(result, [{ name: 'Get users', request: { method: 'POST' } }]);
});

test('removeSavedRequest removes the entry with the matching name', () => {
  const existing = [{ name: 'A', request: {} }, { name: 'B', request: {} }];
  assert.deepEqual(removeSavedRequest(existing, 'A'), [{ name: 'B', request: {} }]);
});
