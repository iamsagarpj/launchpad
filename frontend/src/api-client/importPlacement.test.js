import test from 'node:test';
import assert from 'node:assert/strict';
import { findSiblingByName, siblingCopyName, collectionToFolder } from './importPlacement.js';

test('findSiblingByName matches a folder or request with the same name', () => {
  const items = [
    { id: 'f', type: 'folder', name: 'Auth', items: [] },
    { id: 'r', type: 'request', name: 'Health', request: {} },
  ];
  assert.equal(findSiblingByName(items, 'Auth').id, 'f');
  assert.equal(findSiblingByName(items, 'Health').type, 'request');
  assert.equal(findSiblingByName(items, 'Missing'), null);
});

test('siblingCopyName leaves a free name and suffixes a taken one', () => {
  assert.equal(siblingCopyName(['Auth'], 'Billing'), 'Billing');
  assert.equal(siblingCopyName(['Billing', 'Billing (2)'], 'Billing'), 'Billing (3)');
});

test('collectionToFolder keeps imported variables on the folder', () => {
  const folder = collectionToFolder({ name: 'Billing', items: [{ id: 'r', type: 'request', name: 'Pay' }], variables: { baseUrl: 'https://b.example' } }, 'Billing');
  assert.equal(folder.type, 'folder');
  assert.equal(folder.name, 'Billing');
  assert.equal(folder.items[0].name, 'Pay');
  assert.deepEqual(folder.variables, { baseUrl: 'https://b.example' });
  assert.equal(typeof folder.id, 'string');
});
