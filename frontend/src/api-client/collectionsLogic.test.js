import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCollections,
  upgradeCollection,
  createCollection,
  renameCollection,
  deleteCollection,
  createFolder,
  setNodeVariables,
  upsertRequestInCollection,
  removeItemById,
  moveItem,
  addFullCollection,
  flattenFolderPaths,
  findNode,
  removeNode,
  insertNode,
} from './collectionsLogic.js';

test('findNode finds a node at the root and inside a nested folder', () => {
  const items = [
    { id: 'a', type: 'request', name: 'A', request: {} },
    { id: 'f1', type: 'folder', name: 'Folder', items: [{ id: 'b', type: 'request', name: 'B', request: {} }] },
  ];
  assert.equal(findNode(items, 'a').name, 'A');
  assert.equal(findNode(items, 'b').name, 'B');
  assert.equal(findNode(items, 'missing'), null);
});

test('removeNode removes a root item and returns the remaining tree', () => {
  const items = [{ id: 'a', type: 'request', name: 'A', request: {} }, { id: 'b', type: 'request', name: 'B', request: {} }];
  const [removed, remaining] = removeNode(items, 'a');
  assert.equal(removed.name, 'A');
  assert.deepEqual(remaining, [{ id: 'b', type: 'request', name: 'B', request: {} }]);
});

test('removeNode removes an item nested inside a folder, keeping the folder', () => {
  const items = [{ id: 'f1', type: 'folder', name: 'Folder', items: [{ id: 'b', type: 'request', name: 'B', request: {} }] }];
  const [removed, remaining] = removeNode(items, 'b');
  assert.equal(removed.name, 'B');
  assert.deepEqual(remaining, [{ id: 'f1', type: 'folder', name: 'Folder', items: [] }]);
});

test('removeNode returns null removed and the same tree when the id is not found', () => {
  const items = [{ id: 'a', type: 'request', name: 'A', request: {} }];
  const [removed, remaining] = removeNode(items, 'missing');
  assert.equal(removed, null);
  assert.deepEqual(remaining, items);
});

test('insertNode appends to the root when parentId is null and no index given', () => {
  const items = [{ id: 'a', type: 'request', name: 'A', request: {} }];
  const node = { id: 'b', type: 'request', name: 'B', request: {} };
  assert.deepEqual(insertNode(items, null, node), [items[0], node]);
});

test('insertNode inserts at a specific root index', () => {
  const items = [{ id: 'a', type: 'request', name: 'A', request: {} }, { id: 'c', type: 'request', name: 'C', request: {} }];
  const node = { id: 'b', type: 'request', name: 'B', request: {} };
  assert.deepEqual(insertNode(items, null, node, 1), [items[0], node, items[1]]);
});

test('insertNode inserts inside a nested folder by parentId', () => {
  const items = [{ id: 'f1', type: 'folder', name: 'Folder', items: [] }];
  const node = { id: 'b', type: 'request', name: 'B', request: {} };
  const result = insertNode(items, 'f1', node);
  assert.deepEqual(result, [{ id: 'f1', type: 'folder', name: 'Folder', items: [node] }]);
});

test('insertNode falls back to appending at the root when parentId does not match any folder in the tree', () => {
  const items = [{ id: 'a', type: 'request', name: 'A', request: {} }];
  const node = { id: 'b', type: 'request', name: 'B', request: {} };
  assert.deepEqual(insertNode(items, 'nonexistent-folder-id', node), [items[0], node]);
});

test('parseCollections returns an empty array for null/empty/invalid input', () => {
  assert.deepEqual(parseCollections(null), []);
  assert.deepEqual(parseCollections(''), []);
  assert.deepEqual(parseCollections('not json'), []);
});

test('parseCollections upgrades a legacy {name, requests} collection to {name, items}', () => {
  const raw = JSON.stringify([{ name: 'A', requests: [{ name: 'Get users', request: { method: 'GET' } }] }]);
  const result = parseCollections(raw);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'A');
  assert.equal(result[0].items.length, 1);
  assert.equal(result[0].items[0].type, 'request');
  assert.equal(result[0].items[0].name, 'Get users');
  assert.equal(typeof result[0].items[0].id, 'string');
  assert.ok(result[0].items[0].id.length > 0);
});

test('parseCollections passes through a collection already in {name, items} shape unchanged', () => {
  const collection = { name: 'A', items: [{ id: 'x', type: 'request', name: 'R', request: {} }] };
  const result = parseCollections(JSON.stringify([collection]));
  assert.deepEqual(result, [collection]);
});

test('parseCollections filters out entries missing a name or both requests/items', () => {
  const raw = JSON.stringify([{ name: 'A', items: [] }, { items: [] }, { name: 'B' }]);
  assert.deepEqual(parseCollections(raw), [{ name: 'A', items: [] }]);
});

test('upgradeCollection generates an id for a legacy request missing one', () => {
  const result = upgradeCollection({ name: 'A', requests: [{ name: 'R', request: {} }] });
  assert.equal(typeof result.items[0].id, 'string');
});

test('createCollection adds a new empty collection', () => {
  assert.deepEqual(createCollection([], 'My Collection'), [{ name: 'My Collection', items: [] }]);
});

test('renameCollection renames the matching collection only', () => {
  const collections = [{ name: 'A', items: [] }, { name: 'B', items: [] }];
  assert.deepEqual(renameCollection(collections, 'A', 'A2'), [{ name: 'A2', items: [] }, { name: 'B', items: [] }]);
});

test('deleteCollection removes the matching collection', () => {
  const collections = [{ name: 'A', items: [] }, { name: 'B', items: [] }];
  assert.deepEqual(deleteCollection(collections, 'A'), [{ name: 'B', items: [] }]);
});

test('createFolder adds a new empty folder at the collection root', () => {
  const result = createFolder([{ name: 'A', items: [] }], 'A', null, 'Auth flow');
  assert.equal(result[0].items.length, 1);
  assert.equal(result[0].items[0].type, 'folder');
  assert.equal(result[0].items[0].name, 'Auth flow');
  assert.deepEqual(result[0].items[0].items, []);
  assert.equal(typeof result[0].items[0].id, 'string');
});

test('setNodeVariables stores folder values and clears them when empty', () => {
  const collections = [{ name: 'A', items: [{ id: 'f1', type: 'folder', name: 'Auth', items: [] }] }];
  const withVars = setNodeVariables(collections, 'A', 'f1', { phone: '999' });
  assert.deepEqual(withVars[0].items[0].variables, { phone: '999' });
  const cleared = setNodeVariables(withVars, 'A', 'f1', {});
  assert.equal(cleared[0].items[0].variables, undefined);
  const onCollection = setNodeVariables(collections, 'A', null, { baseUrl: 'https://dev.api' });
  assert.deepEqual(onCollection[0].variables, { baseUrl: 'https://dev.api' });
});

test('createFolder adds a nested folder inside an existing folder', () => {
  const collections = [{ name: 'A', items: [{ id: 'f1', type: 'folder', name: 'Outer', items: [] }] }];
  const result = createFolder(collections, 'A', 'f1', 'Inner');
  assert.equal(result[0].items[0].items.length, 1);
  assert.equal(result[0].items[0].items[0].name, 'Inner');
});

test('upsertRequestInCollection creates a new request under the given parent', () => {
  const collections = [{ name: 'A', items: [] }];
  const node = { id: 'r1', type: 'request', name: 'Get users', request: { method: 'GET' } };
  const result = upsertRequestInCollection(collections, 'A', null, node);
  assert.deepEqual(result, [{ name: 'A', items: [node] }]);
});

test('upsertRequestInCollection updates an existing request in place, keeping its position and parent', () => {
  const collections = [
    {
      name: 'A',
      items: [
        { id: 'r1', type: 'request', name: 'First', request: { method: 'GET' } },
        { id: 'r2', type: 'request', name: 'Second', request: { method: 'GET' } },
      ],
    },
  ];
  const updated = { id: 'r1', type: 'request', name: 'First (renamed)', request: { method: 'POST' } };
  // parentId argument is irrelevant on update - the node stays exactly where it already is.
  const result = upsertRequestInCollection(collections, 'A', 'some-other-folder', updated);
  assert.deepEqual(result[0].items[0], updated);
  assert.equal(result[0].items[1].name, 'Second');
});

test('removeItemById removes a request', () => {
  const collections = [{ name: 'A', items: [{ id: 'r1', type: 'request', name: 'X', request: {} }] }];
  assert.deepEqual(removeItemById(collections, 'r1'), [{ name: 'A', items: [] }]);
});

test('removeItemById removes a folder along with everything inside it', () => {
  const collections = [
    { name: 'A', items: [{ id: 'f1', type: 'folder', name: 'Folder', items: [{ id: 'r1', type: 'request', name: 'X', request: {} }] }] },
  ];
  assert.deepEqual(removeItemById(collections, 'f1'), [{ name: 'A', items: [] }]);
});

test('moveItem reorders an item within the same collection root', () => {
  const collections = [
    {
      name: 'A',
      items: [
        { id: 'r1', type: 'request', name: 'First', request: {} },
        { id: 'r2', type: 'request', name: 'Second', request: {} },
      ],
    },
  ];
  const result = moveItem(collections, 'r1', 'A', null, 1);
  assert.deepEqual(result[0].items.map((i) => i.id), ['r2', 'r1']);
});

test('moveItem nests an item inside a folder in the same collection', () => {
  const collections = [
    {
      name: 'A',
      items: [
        { id: 'f1', type: 'folder', name: 'Folder', items: [] },
        { id: 'r1', type: 'request', name: 'X', request: {} },
      ],
    },
  ];
  const result = moveItem(collections, 'r1', 'A', 'f1');
  assert.deepEqual(result[0].items, [{ id: 'f1', type: 'folder', name: 'Folder', items: [{ id: 'r1', type: 'request', name: 'X', request: {} }] }]);
});

test('moveItem moves an item from one collection into a different collection', () => {
  const collections = [
    { name: 'A', items: [{ id: 'r1', type: 'request', name: 'X', request: {} }] },
    { name: 'B', items: [] },
  ];
  const result = moveItem(collections, 'r1', 'B', null);
  assert.deepEqual(result[0].items, []);
  assert.deepEqual(result[1].items, [{ id: 'r1', type: 'request', name: 'X', request: {} }]);
});

test('moveItem is a no-op (returns the same collections) when the item id does not exist', () => {
  const collections = [{ name: 'A', items: [] }];
  assert.deepEqual(moveItem(collections, 'missing', 'A', null), collections);
});

test('addFullCollection appends an upgraded collection with no name collision unchanged', () => {
  const result = addFullCollection([], { name: 'Imported', requests: [{ name: 'X', request: {} }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Imported');
  assert.equal(result[0].items[0].name, 'X');
});

test('addFullCollection renames on a name collision instead of overwriting', () => {
  const existing = [{ name: 'Imported', items: [] }];
  const result = addFullCollection(existing, { name: 'Imported', requests: [{ name: 'X', request: {} }] });
  assert.equal(result.length, 2);
  assert.equal(result[1].name, 'Imported (2)');
});

test('addFullCollection increments the suffix past repeated collisions', () => {
  const existing = [{ name: 'Imported', items: [] }, { name: 'Imported (2)', items: [] }];
  const result = addFullCollection(existing, { name: 'Imported', requests: [] });
  assert.equal(result[2].name, 'Imported (3)');
});

test('flattenFolderPaths lists the collection root plus every nested folder as a slash-joined label', () => {
  const collections = [
    {
      name: 'My Collection',
      items: [
        {
          id: 'f1',
          type: 'folder',
          name: 'Auth flow',
          items: [{ id: 'f2', type: 'folder', name: 'Edge cases', items: [] }],
        },
      ],
    },
  ];
  assert.deepEqual(flattenFolderPaths(collections), [
    { collectionName: 'My Collection', parentId: null, label: 'My Collection' },
    { collectionName: 'My Collection', parentId: 'f1', label: 'My Collection / Auth flow' },
    { collectionName: 'My Collection', parentId: 'f2', label: 'My Collection / Auth flow / Edge cases' },
  ]);
});
