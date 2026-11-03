import test from 'node:test';
import assert from 'node:assert/strict';
import { substituteVariables, buildUrl, buildHeaders, buildBody, buildFetchOptions, buildMultipart, buildClientCredentialsRequest } from './apiRequest.js';

test('substituteVariables replaces a matched {{var}} token', () => {
  assert.equal(substituteVariables('{{baseUrl}}/users', { baseUrl: 'https://api.example.com' }), 'https://api.example.com/users');
});

test('substituteVariables leaves an unmatched token untouched', () => {
  assert.equal(substituteVariables('{{missing}}/users', {}), '{{missing}}/users');
});

test('buildUrl appends only enabled query params', () => {
  const request = {
    url: 'https://api.example.com/users',
    queryParams: [
      { key: 'active', value: 'true', enabled: true },
      { key: 'disabled', value: 'x', enabled: false },
    ],
  };
  assert.equal(buildUrl(request, {}), 'https://api.example.com/users?active=true');
});

test('buildUrl merges new params with an existing query string', () => {
  const request = { url: 'https://api.example.com/users?page=1', queryParams: [{ key: 'limit', value: '10', enabled: true }] };
  assert.equal(buildUrl(request, {}), 'https://api.example.com/users?page=1&limit=10');
});

test('buildUrl substitutes variables in the base URL and in param values', () => {
  const request = { url: '{{host}}/users', queryParams: [{ key: 'id', value: '{{userId}}', enabled: true }] };
  const result = buildUrl(request, { host: 'https://api.example.com', userId: '42' });
  assert.equal(result, 'https://api.example.com/users?id=42');
});

test('buildHeaders includes only enabled custom headers', () => {
  const request = {
    headers: [
      { key: 'X-A', value: '1', enabled: true },
      { key: 'X-B', value: '2', enabled: false },
    ],
  };
  assert.deepEqual(buildHeaders(request, {}), { 'X-A': '1' });
});

test('buildHeaders adds a Bearer authorization header', () => {
  const request = { auth: { type: 'bearer', token: 'abc123' } };
  assert.deepEqual(buildHeaders(request, {}), { Authorization: 'Bearer abc123' });
});

test('buildHeaders adds a Basic authorization header, base64-encoded', () => {
  const request = { auth: { type: 'basic', username: 'user', password: 'pass' } };
  const headers = buildHeaders(request, {});
  assert.equal(headers.Authorization, `Basic ${Buffer.from('user:pass').toString('base64')}`);
});

test('buildHeaders auto-adds Content-Type for a json body when not already set', () => {
  const request = { bodyType: 'json' };
  assert.deepEqual(buildHeaders(request, {}), { 'Content-Type': 'application/json' });
});

test('buildHeaders does not override an explicitly set Content-Type', () => {
  const request = { bodyType: 'json', headers: [{ key: 'Content-Type', value: 'application/vnd.api+json', enabled: true }] };
  assert.deepEqual(buildHeaders(request, {}), { 'Content-Type': 'application/vnd.api+json' });
});

test('buildBody returns undefined for bodyType none', () => {
  assert.equal(buildBody({ bodyType: 'none', body: 'ignored' }, {}), undefined);
});

test('buildBody substitutes variables into the body text', () => {
  const result = buildBody({ bodyType: 'json', body: '{"id":"{{userId}}"}' }, { userId: '42' });
  assert.equal(result, '{"id":"42"}');
});

test('buildFetchOptions omits the body for GET requests even if body text is set', () => {
  const options = buildFetchOptions({ method: 'GET', url: 'https://api.example.com', bodyType: 'json', body: '{"a":1}' }, {});
  assert.equal(options.body, undefined);
  assert.equal(options.method, 'GET');
});

test('buildFetchOptions includes the body for POST requests', () => {
  const options = buildFetchOptions({ method: 'POST', url: 'https://api.example.com', bodyType: 'json', body: '{"a":1}' }, {});
  assert.equal(options.body, '{"a":1}');
});

test('buildHeaders adds an API key header and leaves query placement to the URL', () => {
  const headerAuth = { auth: { type: 'apikey', key: 'X-Api-Key', value: '{{key}}', in: 'header' } };
  assert.equal(buildHeaders(headerAuth, { key: 'abc' })['X-Api-Key'], 'abc');
  const queryAuth = { url: 'https://api.example.com/search', auth: { type: 'apikey', key: 'api_key', value: 'abc', in: 'query' } };
  assert.equal(buildUrl(queryAuth, {}), 'https://api.example.com/search?api_key=abc');
  assert.equal(buildHeaders(queryAuth, {}).api_key, undefined);
});

test('buildBody encodes enabled form fields and a GraphQL query', () => {
  const form = buildBody({
    bodyType: 'form',
    formParams: [{ key: 'name', value: '{{user}}', enabled: true }, { key: 'skip', value: 'no', enabled: false }],
  }, { user: 'Ada' });
  assert.equal(form, 'name=Ada');
  const graphql = JSON.parse(buildBody({ bodyType: 'graphql', body: 'query { me }', graphqlVariables: '{"id":"{{id}}"}' }, { id: '7' }));
  assert.equal(graphql.query, 'query { me }');
  assert.deepEqual(graphql.variables, { id: '7' });
});

test('buildMultipart writes text fields and base64 when a file is attached', () => {
  const text = buildMultipart({ formParams: [{ key: 'title', value: 'Hello', enabled: true }] }, {});
  assert.match(text.body, /name="title"/);
  assert.match(text.body, /Hello/);
  assert.match(text.contentType, /multipart\/form-data/);
  const file = buildMultipart({ formParams: [{ key: 'upload', fileName: 'note.txt', contentType: 'text/plain', dataBase64: btoa('hi'), enabled: true }] }, {});
  assert.equal(typeof file.bodyBase64, 'string');
  assert.match(Buffer.from(file.bodyBase64, 'base64').toString('utf8'), /filename="note.txt"/);
  assert.match(Buffer.from(file.bodyBase64, 'base64').toString('utf8'), /hi/);
});

test('buildClientCredentialsRequest posts client id and secret as form fields', () => {
  const request = buildClientCredentialsRequest({
    tokenUrl: '{{authUrl}}/token',
    clientId: 'id',
    clientSecret: 'secret',
    scope: 'read',
  }, { authUrl: 'https://login.example.com' });
  assert.equal(request.url, 'https://login.example.com/token');
  assert.equal(request.method, 'POST');
  assert.match(request.body, /grant_type=client_credentials/);
  assert.match(request.body, /client_id=id/);
  assert.match(request.body, /scope=read/);
});
