import test from 'node:test';
import assert from 'node:assert/strict';
import { toCurl, fromCurl, tokenize, shellQuote } from './curl.js';

test('toCurl renders a basic GET request', () => {
  const result = toCurl({ method: 'GET', url: 'https://api.example.com/users' });
  assert.equal(result, "curl -X GET 'https://api.example.com/users'");
});

test('toCurl includes headers and a JSON body with auto Content-Type', () => {
  const result = toCurl({ method: 'POST', url: 'https://api.example.com/users', bodyType: 'json', body: '{"a":1}' });
  assert.equal(result, "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{\"a\":1}'");
});

test('toCurl includes a Bearer authorization header', () => {
  const result = toCurl({ method: 'GET', url: 'https://api.example.com', auth: { type: 'bearer', token: 'abc123' } });
  assert.match(result, /-H 'Authorization: Bearer abc123'/);
});

test('fromCurl parses a simple GET command', () => {
  const result = fromCurl('curl https://api.example.com/users');
  assert.equal(result.ok, true);
  assert.equal(result.request.method, 'GET');
  assert.equal(result.request.url, 'https://api.example.com/users');
});

test('fromCurl parses -X to set the method', () => {
  const result = fromCurl("curl -X POST 'https://api.example.com/users'");
  assert.equal(result.ok, true);
  assert.equal(result.request.method, 'POST');
});

test('fromCurl parses -H headers', () => {
  const result = fromCurl("curl https://api.example.com -H 'X-Api-Key: secret' -H 'Accept: application/json'");
  assert.equal(result.ok, true);
  assert.deepEqual(result.request.headers, [
    { key: 'X-Api-Key', value: 'secret', enabled: true },
    { key: 'Accept', value: 'application/json', enabled: true },
  ]);
});

test('fromCurl parses -d as a JSON body and defaults method to POST', () => {
  const result = fromCurl(`curl https://api.example.com/users -d '{"name":"Ada"}'`);
  assert.equal(result.ok, true);
  assert.equal(result.request.method, 'POST');
  assert.equal(result.request.bodyType, 'json');
  assert.equal(result.request.body, '{"name":"Ada"}');
});

test('fromCurl treats non-JSON -d data as a text body', () => {
  const result = fromCurl(`curl https://api.example.com -d 'plain text body'`);
  assert.equal(result.ok, true);
  assert.equal(result.request.bodyType, 'text');
});

test('fromCurl parses -u into basic auth', () => {
  const result = fromCurl('curl -u user:pass https://api.example.com');
  assert.equal(result.ok, true);
  assert.deepEqual(result.request.auth, { type: 'basic', username: 'user', password: 'pass' });
});

test('fromCurl splits query params out of the URL', () => {
  const result = fromCurl('curl "https://api.example.com/users?active=true&limit=10"');
  assert.equal(result.ok, true);
  assert.equal(result.request.url, 'https://api.example.com/users');
  assert.deepEqual(result.request.queryParams, [
    { key: 'active', value: 'true', enabled: true },
    { key: 'limit', value: '10', enabled: true },
  ]);
});

test('fromCurl returns ok:false when no URL is present', () => {
  const result = fromCurl('curl -X GET');
  assert.equal(result.ok, false);
});

test('fromCurl returns ok:false for empty input', () => {
  const result = fromCurl('   ');
  assert.equal(result.ok, false);
});

test('toCurl -> fromCurl round-trips method, url, and headers', () => {
  const original = {
    method: 'POST',
    url: 'https://api.example.com/users',
    headers: [{ key: 'X-Api-Key', value: 'secret', enabled: true }],
    bodyType: 'json',
    body: '{"name":"Ada"}',
  };
  const command = toCurl(original);
  const parsed = fromCurl(command);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.request.method, 'POST');
  assert.equal(parsed.request.url, 'https://api.example.com/users');
  assert.equal(parsed.request.body, '{"name":"Ada"}');
  assert.ok(parsed.request.headers.some((h) => h.key === 'X-Api-Key' && h.value === 'secret'));
});

test('tokenize splits on whitespace and respects quoted segments', () => {
  assert.deepEqual(tokenize('curl -X GET "https://api.example.com/a b" -H \'X: 1\''), [
    'curl',
    '-X',
    'GET',
    'https://api.example.com/a b',
    '-H',
    'X: 1',
  ]);
});

test('tokenize treats \\" inside a double-quoted segment as a literal embedded quote', () => {
  assert.deepEqual(tokenize('curl -d "{\\"a\\":1}"'), ['curl', '-d', '{"a":1}']);
});

test('shellQuote wraps a plain value in single quotes', () => {
  assert.equal(shellQuote('hello'), "'hello'");
});

test('shellQuote escapes an embedded single quote', () => {
  assert.equal(shellQuote("O'Brien"), "'O'\\''Brien'");
});
