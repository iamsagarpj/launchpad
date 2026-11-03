import test from 'node:test';
import assert from 'node:assert/strict';
import { repairJson } from './jsonRepair.js';

test('repairJson strips a trailing comma before a closing brace', () => {
  const result = repairJson('{"a":1,}');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { a: 1 });
});

test('repairJson strips a trailing comma before a closing bracket', () => {
  const result = repairJson('[1,2,3,]');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), [1, 2, 3]);
});

test('repairJson converts single-quoted strings to double-quoted', () => {
  const result = repairJson("{'a':'hello'}");
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { a: 'hello' });
});

test('repairJson preserves a double quote embedded inside a converted single-quoted string', () => {
  const result = repairJson(`{'a':'say "hi"'}`);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { a: 'say "hi"' });
});

test('repairJson quotes unquoted object keys', () => {
  const result = repairJson('{a:1,b:2}');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { a: 1, b: 2 });
});

test('repairJson strips // line comments outside strings', () => {
  const result = repairJson('{\n  "a": 1 // trailing comment\n}');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { a: 1 });
});

test('repairJson strips /* block */ comments outside strings', () => {
  const result = repairJson('{ /* note */ "a": 1 }');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { a: 1 });
});

test('repairJson does not touch a "//"-looking substring inside a string value', () => {
  const result = repairJson('{"url":"http://example.com"}');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { url: 'http://example.com' });
});

test('repairJson fixes a combination of mistakes in one pass', () => {
  const input = "{\n  name: 'Launchpad', // app name\n  version: '1.0.0',\n}";
  const result = repairJson(input);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), { name: 'Launchpad', version: '1.0.0' });
});

test('repairJson reports changed:false when the input was already valid JSON', () => {
  const result = repairJson('{"a":1}');
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
});

test('repairJson reports changed:true when a fix was applied', () => {
  const result = repairJson('{a:1}');
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
});

test('repairJson returns ok:false with the remaining error when it cannot fully repair the input', () => {
  const result = repairJson('{"a":1');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});
