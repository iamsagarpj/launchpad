import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonToTypeScript } from './jsonToTypeScript.js';

test('jsonToTypeScript generates primitive field types', () => {
  const result = jsonToTypeScript('{"name":"a","count":1,"active":true,"note":null}');
  assert.equal(result.ok, true);
  assert.equal(
    result.result,
    'interface Root {\n  name: string;\n  count: number;\n  active: boolean;\n  note: null;\n}\n'
  );
});

test('jsonToTypeScript generates a nested inline object type', () => {
  const result = jsonToTypeScript('{"config":{"port":4040,"debug":false}}');
  assert.equal(result.ok, true);
  assert.equal(
    result.result,
    'interface Root {\n  config: {\n    port: number;\n    debug: boolean;\n  };\n}\n'
  );
});

test('jsonToTypeScript generates a homogeneous array as Type[]', () => {
  const result = jsonToTypeScript('{"services":["a","b","c"]}');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'interface Root {\n  services: string[];\n}\n');
});

test('jsonToTypeScript generates a mixed array as a union type array', () => {
  const result = jsonToTypeScript('{"values":[1,"a"]}');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'interface Root {\n  values: (number | string)[];\n}\n');
});

test('jsonToTypeScript generates unknown[] for an empty array', () => {
  const result = jsonToTypeScript('{"items":[]}');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'interface Root {\n  items: unknown[];\n}\n');
});

test('jsonToTypeScript quotes a property name that is not a valid identifier', () => {
  const result = jsonToTypeScript('{"weird key":1}');
  assert.equal(result.ok, true);
  assert.equal(result.result, "interface Root {\n  'weird key': number;\n}\n");
});

test('jsonToTypeScript accepts a custom interface name', () => {
  const result = jsonToTypeScript('{"a":1}', 'Config');
  assert.equal(result.ok, true);
  assert.match(result.result, /^interface Config /);
});

test('jsonToTypeScript falls back to Root for an invalid interface name', () => {
  const result = jsonToTypeScript('{"a":1}', '123-bad');
  assert.equal(result.ok, true);
  assert.match(result.result, /^interface Root /);
});

test('jsonToTypeScript returns ok:false for a top-level array', () => {
  const result = jsonToTypeScript('[1,2,3]');
  assert.equal(result.ok, false);
});

test('jsonToTypeScript returns ok:false for invalid JSON', () => {
  const result = jsonToTypeScript('not json');
  assert.equal(result.ok, false);
});
