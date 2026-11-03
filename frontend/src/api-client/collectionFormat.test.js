import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCollectionNative, exportCollectionPostman, importCollection } from './collectionFormat.js';

test('exportCollectionNative -> importCollection round-trips a native v2 collection', () => {
  const collection = {
    name: 'My Collection',
    items: [
      {
        id: 'r1',
        type: 'request',
        name: 'Get users',
        request: { method: 'GET', url: 'https://api.example.com/users', queryParams: [], headers: [], bodyType: 'none', body: '', auth: { type: 'none' } },
      },
      {
        id: 'f1',
        type: 'folder',
        name: 'Auth flow',
        items: [
          { id: 'r2', type: 'request', name: 'Login', request: { method: 'POST', url: '', queryParams: [], headers: [], bodyType: 'none', body: '', auth: { type: 'none' } } },
        ],
      },
    ],
  };
  const json = exportCollectionNative(collection);
  const result = importCollection(json);
  assert.equal(result.ok, true);
  assert.deepEqual(result.collection, collection);
});

test('importCollection upgrades a v1 (or version-less) native export with a flat requests array', () => {
  const legacy = JSON.stringify({
    launchpadCollection: true,
    name: 'Old Export',
    requests: [{ name: 'Get users', request: { method: 'GET' } }],
  });
  const result = importCollection(legacy);
  assert.equal(result.ok, true);
  assert.equal(result.collection.name, 'Old Export');
  assert.equal(result.collection.items[0].type, 'request');
  assert.equal(result.collection.items[0].name, 'Get users');
  assert.equal(typeof result.collection.items[0].id, 'string');
});

test('importCollection returns ok:false for invalid JSON', () => {
  const result = importCollection('not json');
  assert.equal(result.ok, false);
});

test('importCollection returns ok:false for unrecognized JSON shapes', () => {
  const result = importCollection(JSON.stringify({ foo: 'bar' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /Unrecognized/);
});

const POSTMAN_COLLECTION = {
  info: { name: 'Pet Store API' },
  item: [
    {
      name: 'List pets',
      request: {
        method: 'GET',
        url: { raw: 'https://api.example.com/pets?limit=10', query: [{ key: 'limit', value: '10' }] },
        header: [{ key: 'Accept', value: 'application/json' }],
      },
    },
    {
      name: 'Create pet',
      request: {
        method: 'POST',
        url: { raw: 'https://api.example.com/pets' },
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"name":"Fido"}' },
        auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc123' }] },
      },
    },
    {
      name: 'Delete pet (basic auth)',
      request: {
        method: 'DELETE',
        url: { raw: 'https://api.example.com/pets/1' },
        auth: { type: 'basic', basic: [{ key: 'username', value: 'admin' }, { key: 'password', value: 'secret' }] },
      },
    },
    {
      name: 'Admin folder',
      item: [
        {
          name: 'Nested request',
          request: { method: 'GET', url: { raw: 'https://api.example.com/admin' } },
        },
        {
          name: 'Deeper folder',
          item: [{ name: 'Double nested request', request: { method: 'GET', url: { raw: 'https://api.example.com/deep' } } }],
        },
      ],
    },
  ],
};

test('importCollection reads the collection name from a Postman export', () => {
  const result = importCollection(JSON.stringify(POSTMAN_COLLECTION));
  assert.equal(result.ok, true);
  assert.equal(result.collection.name, 'Pet Store API');
});

test('importCollection keeps Postman collection variables and skips disabled ones', () => {
  const result = importCollection(JSON.stringify({
    ...POSTMAN_COLLECTION,
    variable: [
      { key: 'baseUrl', value: 'https://dev.api' },
      { key: 'skip', value: 'no', disabled: true },
    ],
  }));
  assert.deepEqual(result.collection.variables, { baseUrl: 'https://dev.api' });
});

test('importCollection converts method, url, query params, and headers from a Postman request at the root', () => {
  const result = importCollection(JSON.stringify(POSTMAN_COLLECTION));
  const listPets = result.collection.items.find((i) => i.name === 'List pets');
  assert.equal(listPets.type, 'request');
  assert.equal(listPets.request.method, 'GET');
  assert.equal(listPets.request.url, 'https://api.example.com/pets');
  assert.deepEqual(listPets.request.queryParams, [{ key: 'limit', value: '10', enabled: true }]);
  assert.deepEqual(listPets.request.headers, [{ key: 'Accept', value: 'application/json', enabled: true }]);
});

test('importCollection converts a raw JSON body and bearer auth', () => {
  const result = importCollection(JSON.stringify(POSTMAN_COLLECTION));
  const createPet = result.collection.items.find((i) => i.name === 'Create pet');
  assert.equal(createPet.request.bodyType, 'json');
  assert.equal(createPet.request.body, '{"name":"Fido"}');
  assert.deepEqual(createPet.request.auth, { type: 'bearer', token: 'abc123' });
});

test('importCollection converts basic auth', () => {
  const result = importCollection(JSON.stringify(POSTMAN_COLLECTION));
  const deletePet = result.collection.items.find((i) => i.name === 'Delete pet (basic auth)');
  assert.deepEqual(deletePet.request.auth, { type: 'basic', username: 'admin', password: 'secret' });
});

test('importCollection preserves a Postman folder as a nested folder instead of flattening it', () => {
  const result = importCollection(JSON.stringify(POSTMAN_COLLECTION));
  const adminFolder = result.collection.items.find((i) => i.name === 'Admin folder');
  assert.ok(adminFolder, 'expected the Postman folder to be preserved');
  assert.equal(adminFolder.type, 'folder');
  assert.equal(typeof adminFolder.id, 'string');
  const nested = adminFolder.items.find((i) => i.name === 'Nested request');
  assert.equal(nested.type, 'request');
  assert.equal(nested.request.url, 'https://api.example.com/admin');
});

const POSTMAN_V21_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

test('exportCollectionPostman writes Collection v2.1 that Postman and Bruno accept', () => {
  const collection = {
    name: 'Pet Store',
    items: [
      {
        id: 'r1',
        type: 'request',
        name: 'List pets',
        request: {
          method: 'GET',
          url: 'https://api.example.com/pets',
          queryParams: [
            { key: 'limit', value: '10', enabled: true },
            { key: 'debug', value: '1', enabled: false },
          ],
          headers: [
            { key: 'Accept', value: 'application/json', enabled: true },
            { key: 'X-Debug', value: '1', enabled: false },
          ],
          bodyType: 'none',
          body: '',
          auth: { type: 'none' },
        },
      },
      {
        id: 'r2',
        type: 'request',
        name: 'Create pet',
        request: {
          method: 'POST',
          url: 'https://api.example.com/pets',
          queryParams: [],
          headers: [],
          bodyType: 'json',
          body: '{"name":"Fido"}',
          auth: { type: 'bearer', token: '{{token}}' },
          script: 'pm.environment.set("id", pm.response.json().id);\npm.test("created", function () { pm.response.to.have.status(201); });',
        },
      },
      {
        id: 'f1',
        type: 'folder',
        name: 'Admin',
        items: [
          {
            id: 'r3',
            type: 'request',
            name: 'Delete pet',
            request: {
              method: 'DELETE',
              url: '',
              queryParams: [],
              headers: [],
              bodyType: 'text',
              body: 'plain',
              auth: { type: 'basic', username: 'admin', password: 'secret' },
            },
          },
        ],
      },
    ],
  };

  const exported = JSON.parse(exportCollectionPostman(collection));
  assert.deepEqual(Object.keys(exported).sort(), ['info', 'item']);
  assert.equal(exported.info.name, 'Pet Store');
  assert.equal(exported.info.schema, POSTMAN_V21_SCHEMA);
  assert.equal(typeof exported.info._postman_id, 'string');

  const listPets = exported.item[0];
  assert.equal(listPets.request.method, 'GET');
  assert.equal(listPets.request.url.raw, 'https://api.example.com/pets?limit=10');
  assert.equal(listPets.request.url.query.find((q) => q.key === 'debug').disabled, true);
  assert.equal(listPets.request.header.find((h) => h.key === 'X-Debug').disabled, true);
  assert.equal(listPets.request.auth, undefined);

  const createPet = exported.item[1];
  assert.equal(createPet.request.body.mode, 'raw');
  assert.equal(createPet.request.body.options.raw.language, 'json');
  assert.equal(createPet.request.auth.type, 'bearer');
  assert.equal(createPet.request.auth.bearer[0].value, '{{token}}');
  assert.equal(createPet.event[0].listen, 'test');
  assert.deepEqual(createPet.event[0].script.exec[0], 'pm.environment.set("id", pm.response.json().id);');

  const admin = exported.item[2];
  assert.equal(admin.request, undefined);
  assert.equal(admin.item[0].request.method, 'DELETE');
  assert.equal(admin.item[0].request.url.raw, '');
  assert.equal(admin.item[0].request.auth.type, 'basic');

  const imported = importCollection(JSON.stringify(exported));
  assert.equal(imported.ok, true);
  assert.equal(imported.collection.name, 'Pet Store');
  const importedList = imported.collection.items[0];
  assert.equal(importedList.request.method, 'GET');
  assert.equal(importedList.request.url, 'https://api.example.com/pets');
  assert.deepEqual(importedList.request.queryParams, [
    { key: 'limit', value: '10', enabled: true },
    { key: 'debug', value: '1', enabled: false },
  ]);
  const importedCreate = imported.collection.items[1];
  assert.equal(importedCreate.request.bodyType, 'json');
  assert.equal(importedCreate.request.body, '{"name":"Fido"}');
  assert.deepEqual(importedCreate.request.auth, { type: 'bearer', token: '{{token}}' });
  assert.match(importedCreate.request.script, /pm\.test\("created"/);
  const importedFolder = imported.collection.items[2];
  assert.equal(importedFolder.type, 'folder');
  assert.equal(importedFolder.items[0].request.auth.username, 'admin');
  assert.equal(importedFolder.items[0].request.bodyType, 'text');
});

test('importCollection preserves folders nested more than one level deep', () => {
  const result = importCollection(JSON.stringify(POSTMAN_COLLECTION));
  const adminFolder = result.collection.items.find((i) => i.name === 'Admin folder');
  const deeperFolder = adminFolder.items.find((i) => i.name === 'Deeper folder');
  assert.equal(deeperFolder.type, 'folder');
  const doubleNested = deeperFolder.items.find((i) => i.name === 'Double nested request');
  assert.equal(doubleNested.request.url, 'https://api.example.com/deep');
});
