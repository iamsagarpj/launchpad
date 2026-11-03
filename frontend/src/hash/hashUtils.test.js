import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHash } from './hashUtils.js';

test('computeHash computes the correct SHA-256 digest of an empty string', async () => {
  const result = await computeHash('');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('computeHash computes the correct SHA-256 digest of "hello"', async () => {
  const result = await computeHash('hello', 'SHA-256');
  assert.equal(result.ok, true);
  assert.equal(result.result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('computeHash computes the correct SHA-384 digest of "hello"', async () => {
  const result = await computeHash('hello', 'SHA-384');
  assert.equal(result.ok, true);
  assert.equal(result.result, '59e1748777448c69de6b800d7a33bbfb9ff1b463e44354c3553bcdb9c666fa90125a3c79f90397bdf5f6a13de828684f');
});

test('computeHash computes the correct SHA-512 digest of "hello"', async () => {
  const result = await computeHash('hello', 'SHA-512');
  assert.equal(result.ok, true);
  assert.equal(
    result.result,
    '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043'
  );
});

test('computeHash defaults to SHA-256 when no algorithm is given', async () => {
  const result = await computeHash('hello');
  assert.equal(result.ok, true);
  assert.equal(result.result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('computeHash returns ok:false for an unsupported algorithm', async () => {
  const result = await computeHash('hello', 'MD5');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});
