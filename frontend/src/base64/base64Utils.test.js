import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64, decodeBase64, encodeBytesToBase64, decodeBase64ToBytes } from './base64Utils.js';

test('encodeBase64 encodes plain ASCII text', () => {
  const result = encodeBase64('hello');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'aGVsbG8=');
});

test('decodeBase64 decodes plain ASCII text', () => {
  const result = decodeBase64('aGVsbG8=');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'hello');
});

test('encodeBase64 -> decodeBase64 round-trips UTF-8 text correctly', () => {
  const input = 'café ☕ 日本語';
  const encoded = encodeBase64(input);
  assert.equal(encoded.ok, true);
  const decoded = decodeBase64(encoded.result);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.result, input);
});

test('encodeBase64 with urlSafe produces no +, /, or = characters', () => {
  const result = encodeBase64('>>> subs ??? >>>', { urlSafe: true });
  assert.equal(result.ok, true);
  assert.equal(/[+/=]/.test(result.result), false);
});

test('urlSafe encode -> urlSafe decode round-trips correctly', () => {
  const input = 'a random string with enough bytes to need padding??';
  const encoded = encodeBase64(input, { urlSafe: true });
  const decoded = decodeBase64(encoded.result, { urlSafe: true });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.result, input);
});

test('decodeBase64 returns ok:false for invalid base64 input', () => {
  const result = decodeBase64('not valid base64!!!');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('decodeBase64 returns ok:false for base64 that is not valid UTF-8', () => {
  // 0xFF 0xFF is not a valid UTF-8 byte sequence.
  const result = decodeBase64('//8=');
  assert.equal(result.ok, false);
});

test('encodeBytesToBase64 -> decodeBase64ToBytes round-trips arbitrary binary bytes', () => {
  // 0x00-0xFF is not valid UTF-8, which is exactly why these byte-level
  // helpers exist separately from encodeBase64/decodeBase64.
  const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 65]);
  const encoded = encodeBytesToBase64(bytes);
  const decoded = decodeBase64ToBytes(encoded);
  assert.equal(decoded.ok, true);
  assert.deepEqual(Array.from(decoded.bytes), Array.from(bytes));
});

test('encodeBytesToBase64 with urlSafe produces no +, /, or = characters', () => {
  const bytes = new Uint8Array([251, 255, 254, 253]);
  const encoded = encodeBytesToBase64(bytes, { urlSafe: true });
  assert.equal(/[+/=]/.test(encoded), false);
});

test('decodeBase64ToBytes returns ok:false for invalid base64 input', () => {
  const result = decodeBase64ToBytes('not valid base64!!!');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});
