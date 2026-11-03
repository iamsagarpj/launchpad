import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt } from './jwtUtils.js';
import { encodeBase64 } from '../base64/base64Utils.js';

function buildToken(header, payload, signature = 'sig') {
  const headerPart = encodeBase64(JSON.stringify(header), { urlSafe: true }).result;
  const payloadPart = encodeBase64(JSON.stringify(payload), { urlSafe: true }).result;
  return `${headerPart}.${payloadPart}.${signature}`;
}

test('decodeJwt decodes the header and payload of a well-formed token', () => {
  const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '123', name: 'Ada' });
  const result = decodeJwt(token);
  assert.equal(result.ok, true);
  assert.deepEqual(result.header, { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(result.payload, { sub: '123', name: 'Ada' });
});

test('decodeJwt never reports the token as verified', () => {
  const token = buildToken({ alg: 'HS256' }, { sub: '123' });
  const result = decodeJwt(token);
  assert.equal(result.ok, true);
  assert.equal(result.verified, false);
});

test('decodeJwt preserves the raw signature segment without attempting to decode it', () => {
  const token = buildToken({ alg: 'HS256' }, { sub: '123' }, 'abcXYZ123-_');
  const result = decodeJwt(token);
  assert.equal(result.ok, true);
  assert.equal(result.signature, 'abcXYZ123-_');
});

test('decodeJwt returns ok:false for a token that does not have exactly 3 parts', () => {
  assert.equal(decodeJwt('not.a.valid.jwt.token').ok, false);
  assert.equal(decodeJwt('onlyone').ok, false);
});

test('decodeJwt returns ok:false for a header that is not valid base64url', () => {
  const result = decodeJwt('not valid base64!!!.abc.def');
  assert.equal(result.ok, false);
});

test('decodeJwt returns ok:false when a decoded segment is not valid JSON', () => {
  const notJsonPart = encodeBase64('not json', { urlSafe: true }).result;
  const result = decodeJwt(`${notJsonPart}.${notJsonPart}.sig`);
  assert.equal(result.ok, false);
});

test('decodeJwt trims surrounding whitespace before splitting', () => {
  const token = buildToken({ alg: 'HS256' }, { sub: '123' });
  const result = decodeJwt(`  ${token}  \n`);
  assert.equal(result.ok, true);
});
