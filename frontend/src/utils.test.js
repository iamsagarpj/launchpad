import test from 'node:test';
import assert from 'node:assert/strict';
import { sortResources, parsePort } from './utils.js';

test('sortResources sorts alphabetically by name regardless of input order', () => {
  const input = [{ name: 'web-service' }, { name: 'aws-creds' }, { name: 'data-service' }];
  const result = sortResources(input);
  assert.deepEqual(result.map((r) => r.name), ['aws-creds', 'data-service', 'web-service']);
});

test('sortResources does not mutate the input array', () => {
  const input = [{ name: 'b' }, { name: 'a' }];
  sortResources(input);
  assert.deepEqual(input.map((r) => r.name), ['b', 'a']);
});

test('parsePort extracts the port from a URL', () => {
  assert.equal(parsePort('http://localhost:8080/swagger-ui.html'), '8080');
  assert.equal(parsePort('https://localhost:8085'), '8085');
});

test('parsePort returns null for a URL with no port, or a falsy input', () => {
  assert.equal(parsePort('https://example.com/path'), null);
  assert.equal(parsePort(null), null);
  assert.equal(parsePort(undefined), null);
  assert.equal(parsePort(''), null);
});
