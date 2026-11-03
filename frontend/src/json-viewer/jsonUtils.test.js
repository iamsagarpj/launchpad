import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatJson,
  minifyJson,
  validateJson,
  getByteSize,
  SAMPLE_JSON,
  parseJsonValue,
  formatJsonPath,
  evaluateJsonPath,
} from './jsonUtils.js';

test('formatJson pretty-prints valid JSON with a 2-space indent by default', () => {
  const result = formatJson('{"a":1,"b":[1,2,3]}');
  assert.equal(result.ok, true);
  assert.equal(result.result, '{\n  "a": 1,\n  "b": [\n    1,\n    2,\n    3\n  ]\n}');
});

test('formatJson respects a custom indent size', () => {
  const result = formatJson('{"a":1}', 4);
  assert.equal(result.ok, true);
  assert.equal(result.result, '{\n    "a": 1\n}');
});

test('formatJson returns ok:false with an error message for invalid JSON', () => {
  const result = formatJson('{a:1}');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('minifyJson strips all whitespace from valid JSON', () => {
  const result = minifyJson('{\n  "a": 1,\n  "b": 2\n}');
  assert.equal(result.ok, true);
  assert.equal(result.result, '{"a":1,"b":2}');
});

test('minifyJson returns ok:false for invalid JSON', () => {
  const result = minifyJson('not json');
  assert.equal(result.ok, false);
});

test('validateJson returns ok:true for valid JSON', () => {
  assert.deepEqual(validateJson('{"a":1}'), { ok: true });
});

test('validateJson returns a reliable line and column for a missing value', () => {
  // Line 3 is `  "b":` with nothing after the colon before the closing brace.
  const result = validateJson('{\n  "a": 1,\n  "b":\n}');
  assert.equal(result.ok, false);
  assert.equal(typeof result.line, 'number');
  assert.equal(typeof result.column, 'number');
  assert.ok(result.line >= 1);
});

test('validateJson flags an unquoted key as invalid', () => {
  const result = validateJson('{a:1}');
  assert.equal(result.ok, false);
});

test('validateJson flags a trailing comment as invalid (strict JSON, not JSONC)', () => {
  const result = validateJson('{"a":1} // trailing comment');
  assert.equal(result.ok, false);
});

test('getByteSize counts UTF-8 bytes, not JS string length', () => {
  assert.equal(getByteSize('abc'), 3);
  assert.equal(getByteSize('€'), 3); // the euro sign is 1 UTF-16 code unit but 3 UTF-8 bytes
});

test('SAMPLE_JSON is valid, non-empty JSON', () => {
  assert.equal(validateJson(SAMPLE_JSON).ok, true);
  assert.ok(SAMPLE_JSON.length > 0);
});

test('validateJson returns ok:false for non-string input instead of throwing', () => {
  const result = validateJson(undefined);
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
  assert.equal(result.line, 1);
  assert.equal(result.column, 1);
});

test('parseJsonValue returns the parsed value for valid JSON', () => {
  const result = parseJsonValue('{"a":[1,2,3]}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { a: [1, 2, 3] });
});

test('parseJsonValue returns the same error shape as validateJson for invalid JSON', () => {
  const result = parseJsonValue('{a:1}');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
  assert.equal(typeof result.line, 'number');
});

test('formatJsonPath renders an empty segment list as the root', () => {
  assert.equal(formatJsonPath([]), '$');
});

test('formatJsonPath renders dotted child keys', () => {
  assert.equal(formatJsonPath(['config', 'port']), '$.config.port');
});

test('formatJsonPath renders numeric indices with brackets', () => {
  assert.equal(formatJsonPath(['services', 0]), '$.services[0]');
});

test('formatJsonPath bracket-quotes keys that are not valid identifiers', () => {
  assert.equal(formatJsonPath(['weird key']), "$['weird key']");
});

test('evaluateJsonPath resolves a simple child path', () => {
  const result = evaluateJsonPath('{"config":{"port":4040}}', '$.config.port');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, [4040]);
});

test('evaluateJsonPath resolves a numeric index', () => {
  const result = evaluateJsonPath('{"services":["a","b","c"]}', '$.services[1]');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, ['b']);
});

test('evaluateJsonPath resolves a bracket wildcard over an array', () => {
  const result = evaluateJsonPath('{"services":["a","b","c"]}', '$.services[*]');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, ['a', 'b', 'c']);
});

test('evaluateJsonPath resolves a dot wildcard over an object', () => {
  const result = evaluateJsonPath('{"config":{"port":4040,"debug":false}}', '$.config.*');
  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  assert.ok(result.matches.includes(4040));
  assert.ok(result.matches.includes(false));
});

test('evaluateJsonPath resolves recursive descent', () => {
  const result = evaluateJsonPath('{"a":{"name":"x"},"b":{"name":"y"}}', '$..name');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches.slice().sort(), ['x', 'y']);
});

test('evaluateJsonPath returns an empty match list for a path that resolves nothing', () => {
  const result = evaluateJsonPath('{"a":1}', '$.missing');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, []);
});

test('evaluateJsonPath returns ok:false when the document is not valid JSON', () => {
  const result = evaluateJsonPath('{not json}', '$.a');
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/);
});

test('evaluateJsonPath returns ok:false for a malformed path (dangling dots)', () => {
  const result = evaluateJsonPath('{"a":1}', '$.a..');
  assert.equal(result.ok, false);
});

test('evaluateJsonPath returns ok:false for a path missing the root $', () => {
  const result = evaluateJsonPath('{"a":1}', 'a.b');
  assert.equal(result.ok, false);
});

test('formatJsonPath -> evaluateJsonPath round-trips a key containing an apostrophe', () => {
  const path = formatJsonPath(['it\'s']);
  const result = evaluateJsonPath('{"it\'s": 42}', path);
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, [42]);
});

test('formatJsonPath -> evaluateJsonPath round-trips a key containing a backslash', () => {
  const path = formatJsonPath(['back\\slash']);
  const result = evaluateJsonPath('{"back\\\\slash": 1}', path);
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, [1]);
});

test('evaluateJsonPath resolves a double-quoted bracket key', () => {
  const result = evaluateJsonPath('{"weird key":7}', '$["weird key"]');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, [7]);
});
