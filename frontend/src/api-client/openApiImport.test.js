import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionFromOpenApi } from './openApiImport.js';

test('collectionFromOpenApi builds a folder per tag and turns path params into variables', () => {
  const spec = {
    openapi: '3.0.0',
    info: { title: 'Pet Store', version: '1' },
    servers: [{ url: 'https://api.example.com/v1' }],
    paths: {
      '/pets': { get: { summary: 'List pets', tags: ['pets'], parameters: [{ name: 'limit', in: 'query' }] } },
      '/pets/{id}': { get: { summary: 'Get pet', tags: ['pets'], parameters: [{ name: 'id', in: 'path', required: true }] } },
    },
  };
  const result = collectionFromOpenApi(JSON.stringify(spec));
  assert.equal(result.ok, true);
  assert.equal(result.collection.name, 'Pet Store');
  assert.equal(result.collection.items[0].type, 'folder');
  assert.equal(result.collection.items[0].name, 'pets');
  const getPet = result.collection.items[0].items.find((item) => item.name === 'Get pet');
  assert.equal(getPet.request.url, '{{baseUrl}}/pets/{{id}}');
  assert.equal(result.collection.variables.baseUrl, 'https://api.example.com/v1');
  const list = result.collection.items[0].items.find((item) => item.name === 'List pets');
  assert.deepEqual(list.request.queryParams, [{ key: 'limit', value: '', enabled: true }]);
});
