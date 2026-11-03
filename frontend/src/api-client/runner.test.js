import test from 'node:test';
import assert from 'node:assert/strict';
import { listRequests } from './runner.js';

test('listRequests walks folders depth-first and skips nothing that is a request', () => {
  const items = [
    { type: 'request', name: 'Login' },
    { type: 'folder', name: 'Pets', items: [{ type: 'request', name: 'List' }, { type: 'folder', name: 'Nested', items: [{ type: 'request', name: 'Get' }] }] },
  ];
  assert.deepEqual(listRequests(items).map((item) => item.name), ['Login', 'List', 'Get']);
});
