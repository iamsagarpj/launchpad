import test from 'node:test';
import assert from 'node:assert/strict';
import { toCurlSnippet, toJsFetchSnippet, toPythonRequestsSnippet } from './codeSnippets.js';

const JSON_REQUEST = {
  method: 'POST',
  url: 'https://api.example.com/users',
  headers: [{ key: 'X-Api-Key', value: 'secret', enabled: true }],
  bodyType: 'json',
  body: '{"name":"Ada"}',
};

test('toCurlSnippet is re-exported and produces a curl command', () => {
  const result = toCurlSnippet({ method: 'GET', url: 'https://api.example.com' });
  assert.match(result, /^curl /);
});

test('toJsFetchSnippet includes the method, url, headers, and body', () => {
  const result = toJsFetchSnippet(JSON_REQUEST);
  assert.match(result, /fetch\("https:\/\/api\.example\.com\/users"/);
  assert.match(result, /method: "POST"/);
  assert.match(result, /"X-Api-Key": "secret"/);
  assert.match(result, /"Content-Type": "application\/json"/);
  assert.match(result, /body: "\{\\"name\\":\\"Ada\\"\}"/);
});

test('toJsFetchSnippet omits headers/body blocks when there are none', () => {
  const result = toJsFetchSnippet({ method: 'GET', url: 'https://api.example.com' });
  assert.doesNotMatch(result, /headers:/);
  assert.doesNotMatch(result, /body:/);
});

test('toPythonRequestsSnippet includes url, headers, data, and the correct requests method call', () => {
  const result = toPythonRequestsSnippet(JSON_REQUEST);
  assert.match(result, /url = "https:\/\/api\.example\.com\/users"/);
  assert.match(result, /headers = \{/);
  assert.match(result, /"X-Api-Key": "secret"/);
  assert.match(result, /data = "\{\\"name\\":\\"Ada\\"\}"/);
  assert.match(result, /requests\.post\(url, headers=headers, data=data\)/);
});

test('toPythonRequestsSnippet omits headers/data kwargs when there are none', () => {
  const result = toPythonRequestsSnippet({ method: 'GET', url: 'https://api.example.com' });
  assert.match(result, /requests\.get\(url\)/);
  assert.doesNotMatch(result, /headers =/);
});

test('code snippets substitute environment variables consistently with the curl exporter', () => {
  const request = { method: 'GET', url: '{{baseUrl}}/users' };
  const variables = { baseUrl: 'https://api.example.com' };
  assert.match(toJsFetchSnippet(request, variables), /https:\/\/api\.example\.com\/users/);
  assert.match(toPythonRequestsSnippet(request, variables), /https:\/\/api\.example\.com\/users/);
});
