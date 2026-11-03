import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenApiSpec } from './openApiUtils.js';

const MINIMAL_JSON_SPEC = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Pet Store', version: '1.0.0' },
  paths: {
    '/pets': {
      get: { summary: 'List pets', operationId: 'listPets' },
      post: { summary: 'Create a pet', operationId: 'createPet' },
    },
    '/pets/{id}': {
      get: {
        summary: 'Get a pet',
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Pet id' }],
      },
    },
  },
});

test('parseOpenApiSpec extracts info and endpoints from a JSON spec', () => {
  const result = parseOpenApiSpec(MINIMAL_JSON_SPEC);
  assert.equal(result.ok, true);
  assert.equal(result.info.title, 'Pet Store');
  assert.equal(result.info.version, '1.0.0');
  assert.equal(result.endpoints.length, 3);
});

test('parseOpenApiSpec extracts multiple methods on the same path', () => {
  const result = parseOpenApiSpec(MINIMAL_JSON_SPEC);
  const petsEndpoints = result.endpoints.filter((e) => e.path === '/pets');
  assert.deepEqual(
    petsEndpoints.map((e) => e.method).sort(),
    ['GET', 'POST']
  );
});

test('parseOpenApiSpec extracts parameters', () => {
  const result = parseOpenApiSpec(MINIMAL_JSON_SPEC);
  const getPetById = result.endpoints.find((e) => e.path === '/pets/{id}');
  assert.deepEqual(getPetById.parameters, [{ name: 'id', in: 'path', required: true, description: 'Pet id' }]);
});

test('parseOpenApiSpec accepts a YAML-formatted spec', () => {
  const yaml = 'openapi: 3.0.0\ninfo:\n  title: Pet Store\n  version: 1.0.0\npaths:\n  /pets:\n    get:\n      summary: List pets';
  const result = parseOpenApiSpec(yaml);
  assert.equal(result.ok, true);
  assert.equal(result.info.title, 'Pet Store');
  assert.equal(result.endpoints.length, 1);
  assert.equal(result.endpoints[0].method, 'GET');
});

test('parseOpenApiSpec accepts a swagger 2.0 document', () => {
  const result = parseOpenApiSpec(JSON.stringify({ swagger: '2.0', info: { title: 'X', version: '1' }, paths: { '/a': { get: {} } } }));
  assert.equal(result.ok, true);
  assert.equal(result.endpoints.length, 1);
});

test('parseOpenApiSpec returns ok:false when missing an openapi/swagger field', () => {
  const result = parseOpenApiSpec(JSON.stringify({ info: {}, paths: {} }));
  assert.equal(result.ok, false);
});

test('parseOpenApiSpec returns ok:false when missing a paths object', () => {
  const result = parseOpenApiSpec(JSON.stringify({ openapi: '3.0.0', info: {} }));
  assert.equal(result.ok, false);
});

test('parseOpenApiSpec returns ok:false for invalid JSON/YAML', () => {
  const result = parseOpenApiSpec('{not valid at all despite: no clear format');
  assert.equal(result.ok, false);
});
