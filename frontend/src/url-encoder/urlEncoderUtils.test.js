import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeUrl, decodeUrl } from './urlEncoderUtils.js';

test('encodeUrl in component mode escapes structural characters', () => {
  const result = encodeUrl('a b/c?d=e&f#g');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'a%20b%2Fc%3Fd%3De%26f%23g');
});

test('encodeUrl in full mode leaves URL-structural characters alone', () => {
  const result = encodeUrl('https://example.com/a b?x=1&y=2', 'full');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'https://example.com/a%20b?x=1&y=2');
});

test('decodeUrl reverses component-mode encoding', () => {
  const result = decodeUrl('a%20b%2Fc%3Fd%3De%26f%23g');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'a b/c?d=e&f#g');
});

test('encodeUrl -> decodeUrl round-trips unicode text', () => {
  const input = 'café ☕ 日本語';
  const encoded = encodeUrl(input);
  assert.equal(encoded.ok, true);
  const decoded = decodeUrl(encoded.result);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.result, input);
});

test('decodeUrl returns ok:false for a malformed percent-sequence', () => {
  const result = decodeUrl('100% done');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});
