import test from 'node:test';
import assert from 'node:assert/strict';
import { absorbSetCookies, cookieHeader } from './cookieJar.js';

test('absorbSetCookies stores a cookie and cookieHeader sends it back to that host', () => {
  const jar = absorbSetCookies([], 'https://api.example.com/login', ['session=abc; Path=/; Domain=example.com']);
  assert.equal(cookieHeader(jar, 'https://api.example.com/users'), 'session=abc');
  assert.equal(cookieHeader(jar, 'https://other.example.net/users'), '');
});

test('absorbSetCookies replaces a cookie with the same name, domain, and path', () => {
  const first = absorbSetCookies([], 'https://api.example.com/', ['session=old; Path=/']);
  const next = absorbSetCookies(first, 'https://api.example.com/', ['session=new; Path=/']);
  assert.equal(cookieHeader(next, 'https://api.example.com/a'), 'session=new');
});
