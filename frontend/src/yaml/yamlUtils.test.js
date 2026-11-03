import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, validateYaml, yamlToJson, formatYaml, jsonToYaml } from './yamlUtils.js';

test('parseYaml parses a flat mapping of scalars', () => {
  const result = parseYaml('name: Launchpad\nversion: 1.0.0\ndebug: false\nport: 4040\nnote: ~');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: 'Launchpad', version: '1.0.0', debug: false, port: 4040, note: null });
});

test('parseYaml parses a nested block mapping', () => {
  const result = parseYaml('config:\n  port: 4040\n  debug: false');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { config: { port: 4040, debug: false } });
});

test('parseYaml parses a simple block sequence of scalars', () => {
  const result = parseYaml('services:\n  - data-service\n  - web-service\n  - ui');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { services: ['data-service', 'web-service', 'ui'] });
});

test('parseYaml parses a block sequence of mappings ("- key: value" items)', () => {
  const yaml = 'items:\n  - name: a\n    value: 1\n  - name: b\n    value: 2';
  const result = parseYaml(yaml);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    items: [
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
    ],
  });
});

test('parseYaml parses flow sequences and flow mappings', () => {
  const result = parseYaml('services: [a, b, c]\nconfig: {port: 4040, debug: false}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { services: ['a', 'b', 'c'], config: { port: 4040, debug: false } });
});

test('parseYaml parses quoted strings, including one with a colon inside', () => {
  const result = parseYaml(`url: "http://example.com:8080"\nlabel: 'it''s fine'`);
  assert.equal(result.ok, true);
  assert.equal(result.value.url, 'http://example.com:8080');
  assert.equal(result.value.label, "it's fine");
});

test('parseYaml strips comments outside of strings', () => {
  const result = parseYaml('name: Launchpad # the app name\n# a full-line comment\nport: 4040');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: 'Launchpad', port: 4040 });
});

test('parseYaml does not treat a "#" inside a quoted string as a comment', () => {
  const result = parseYaml('note: "has a # inside"');
  assert.equal(result.ok, true);
  assert.equal(result.value.note, 'has a # inside');
});

test('parseYaml returns null for an entirely empty document', () => {
  const result = parseYaml('');
  assert.equal(result.ok, true);
  assert.equal(result.value, null);
});

test('parseYaml returns ok:false for malformed content', () => {
  const result = parseYaml('- a\nkey: value');
  assert.equal(result.ok, false);
});

test('validateYaml returns ok:true for valid YAML', () => {
  assert.equal(validateYaml('a: 1').ok, true);
});

test('yamlToJson converts a mapping to a JSON string', () => {
  const result = yamlToJson('name: Launchpad\nport: 4040');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { name: 'Launchpad', port: 4040 });
});

test('jsonToYaml serializes a flat object', () => {
  const result = jsonToYaml('{"name":"Launchpad","port":4040,"debug":false}');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'name: Launchpad\nport: 4040\ndebug: false');
});

test('jsonToYaml serializes nested objects with increasing indentation', () => {
  const result = jsonToYaml('{"config":{"port":4040,"debug":false}}');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'config:\n  port: 4040\n  debug: false');
});

test('jsonToYaml serializes a flat array of scalars', () => {
  const result = jsonToYaml('{"services":["a","b","c"]}');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'services:\n  - a\n  - b\n  - c');
});

test('jsonToYaml quotes a string that would otherwise be ambiguous', () => {
  const result = jsonToYaml('{"flag":"true","id":"123"}');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'flag: "true"\nid: "123"');
});

test('jsonToYaml returns ok:false for invalid JSON', () => {
  const result = jsonToYaml('not json');
  assert.equal(result.ok, false);
});

test('yamlToJson -> jsonToYaml -> yamlToJson round-trips a nested document', () => {
  const originalJson = JSON.stringify({ name: 'a', config: { port: 1, tags: ['x', 'y'] } });
  const asYaml = jsonToYaml(originalJson);
  assert.equal(asYaml.ok, true);
  const backToJson = yamlToJson(asYaml.result);
  assert.equal(backToJson.ok, true);
  assert.deepEqual(JSON.parse(backToJson.result), JSON.parse(originalJson));
});

test('formatYaml re-serializes YAML into the canonical output style', () => {
  const result = formatYaml('name:   Launchpad\nport:    4040');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'name: Launchpad\nport: 4040');
});
