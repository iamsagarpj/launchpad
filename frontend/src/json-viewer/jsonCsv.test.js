import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonToCsv, csvToJson } from './jsonCsv.js';

test('jsonToCsv converts a simple array of flat objects', () => {
  const result = jsonToCsv('[{"name":"a","age":1},{"name":"b","age":2}]');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'name,age\na,1\nb,2');
});

test('jsonToCsv unions headers across rows with differing keys', () => {
  const result = jsonToCsv('[{"a":1},{"b":2}]');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'a,b\n1,\n,2');
});

test('jsonToCsv quotes and escapes fields containing commas or quotes', () => {
  const result = jsonToCsv('[{"note":"hello, \\"world\\""}]');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'note\n"hello, ""world"""');
});

test('jsonToCsv returns an empty string for an empty array', () => {
  const result = jsonToCsv('[]');
  assert.equal(result.ok, true);
  assert.equal(result.result, '');
});

test('jsonToCsv returns ok:false for a non-array top-level value', () => {
  const result = jsonToCsv('{"a":1}');
  assert.equal(result.ok, false);
});

test('jsonToCsv returns ok:false when an array item is not a flat object', () => {
  const result = jsonToCsv('[1,2,3]');
  assert.equal(result.ok, false);
});

test('jsonToCsv returns ok:false for invalid JSON', () => {
  const result = jsonToCsv('not json');
  assert.equal(result.ok, false);
});

test('csvToJson converts a simple CSV into an array of objects', () => {
  const result = csvToJson('name,age\na,1\nb,2');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), [
    { name: 'a', age: '1' },
    { name: 'b', age: '2' },
  ]);
});

test('csvToJson handles quoted fields containing commas and escaped quotes', () => {
  const result = csvToJson('note\n"hello, ""world"""');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.result), [{ note: 'hello, "world"' }]);
});

test('csvToJson returns an empty array for empty input', () => {
  const result = csvToJson('');
  assert.equal(result.ok, true);
  assert.equal(result.result, '[]');
});

test('jsonToCsv -> csvToJson round-trips simple tabular data', () => {
  const original = [{ name: 'a', age: '1' }, { name: 'b', age: '2' }];
  const csv = jsonToCsv(JSON.stringify(original));
  assert.equal(csv.ok, true);
  const roundTripped = csvToJson(csv.result);
  assert.equal(roundTripped.ok, true);
  assert.deepEqual(JSON.parse(roundTripped.result), original);
});
