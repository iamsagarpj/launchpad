import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUuidV4, generateUuidV7, formatUuid } from './uuidUtils.js';

test('generateUuidV4 produces a well-formed version-4 UUID', () => {
  const uuid = generateUuidV4();
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('generateUuidV7 produces a well-formed version-7 UUID', () => {
  const uuid = generateUuidV7();
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('generateUuidV7 timestamps are non-decreasing across consecutive calls', () => {
  const first = generateUuidV7();
  const second = generateUuidV7();
  const msOf = (uuid) => parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16);
  assert.ok(msOf(second) >= msOf(first));
});

test('formatUuid returns the value unchanged with default options', () => {
  const input = 'abcd1234-ab12-7abc-89ab-abcdefabcdef';
  assert.equal(formatUuid(input), input);
});

test('formatUuid strips hyphens when stripHyphens is true', () => {
  const input = 'abcd1234-ab12-7abc-89ab-abcdefabcdef';
  assert.equal(formatUuid(input, { stripHyphens: true }), 'abcd1234ab127abc89ababcdefabcdef');
});

test('formatUuid uppercases when uppercase is true', () => {
  const input = 'abcd1234-ab12-7abc-89ab-abcdefabcdef';
  assert.equal(formatUuid(input, { uppercase: true }), 'ABCD1234-AB12-7ABC-89AB-ABCDEFABCDEF');
});

test('formatUuid applies both uppercase and stripHyphens together', () => {
  const input = 'abcd1234-ab12-7abc-89ab-abcdefabcdef';
  assert.equal(formatUuid(input, { uppercase: true, stripHyphens: true }), 'ABCD1234AB127ABC89ABABCDEFABCDEF');
});
