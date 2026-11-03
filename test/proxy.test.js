'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedOrigin, performProxyRequest } = require('../lib/proxy');

function fakeResponse({ status = 200, statusText = 'OK', headers = {}, bodyText = '' } = {}) {
  return {
    status,
    statusText,
    headers: { forEach: (cb) => Object.entries(headers).forEach(([k, v]) => cb(v, k)) },
    arrayBuffer: async () => Buffer.from(bodyText, 'utf-8'),
  };
}

test('isAllowedOrigin accepts the matching localhost origin', () => {
  assert.equal(isAllowedOrigin('http://localhost:4040', 4040), true);
});

test('isAllowedOrigin accepts the matching 127.0.0.1 origin', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:4040', 4040), true);
});

test('isAllowedOrigin rejects a different origin', () => {
  assert.equal(isAllowedOrigin('https://evil.example.com', 4040), false);
});

test('isAllowedOrigin rejects a mismatched port', () => {
  assert.equal(isAllowedOrigin('http://localhost:9999', 4040), false);
});

test('isAllowedOrigin rejects a missing origin header', () => {
  assert.equal(isAllowedOrigin(undefined, 4040), false);
  assert.equal(isAllowedOrigin('', 4040), false);
});

test('performProxyRequest returns ok:false for a missing url', async () => {
  const result = await performProxyRequest({ method: 'GET', url: '' });
  assert.equal(result.ok, false);
});

test('performProxyRequest returns ok:false for an invalid url', async () => {
  const result = await performProxyRequest({ method: 'GET', url: 'not a url' });
  assert.equal(result.ok, false);
});

test('performProxyRequest rejects a non-http(s) protocol', async () => {
  const result = await performProxyRequest({ method: 'GET', url: 'file:///etc/passwd' });
  assert.equal(result.ok, false);
  assert.match(result.error, /http/);
});

test('performProxyRequest calls the injected fetch and maps a successful response', async () => {
  let capturedUrl;
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return fakeResponse({ status: 201, statusText: 'Created', headers: { 'content-type': 'application/json' }, bodyText: '{"id":1}' });
  };
  const result = await performProxyRequest(
    { method: 'POST', url: 'https://api.example.com/users', headers: { 'X-Api-Key': 'secret' }, body: '{"name":"Ada"}' },
    { fetchImpl }
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.body, '{"id":1}');
  assert.deepEqual(result.headers, { 'content-type': 'application/json' });
  assert.equal(capturedUrl, 'https://api.example.com/users');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.body, '{"name":"Ada"}');
});

test('performProxyRequest omits the body for a GET request even if one is supplied', async () => {
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedOptions = options;
    return fakeResponse();
  };
  await performProxyRequest({ method: 'GET', url: 'https://api.example.com', body: 'should be dropped' }, { fetchImpl });
  assert.equal(capturedOptions.body, undefined);
});

test('performProxyRequest returns ok:false when the upstream response exceeds the size limit', async () => {
  const fetchImpl = async () => fakeResponse({ bodyText: 'x'.repeat(1000) });
  const result = await performProxyRequest({ method: 'GET', url: 'https://api.example.com' }, { fetchImpl, maxResponseBytes: 100 });
  assert.equal(result.ok, false);
  assert.match(result.error, /limit/);
});

test('performProxyRequest returns ok:false with a timeout message when the fetch aborts', async () => {
  const fetchImpl = (url, options) =>
    new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  const result = await performProxyRequest({ method: 'GET', url: 'https://api.example.com' }, { fetchImpl, timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
});

test('performProxyRequest follows a redirect and reports it', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url === 'https://api.example.com/start') {
      return {
        status: 302,
        statusText: 'Found',
        headers: {
          get: (name) => (name === 'location' ? '/done' : null),
          getSetCookie: () => ['sid=1; Path=/'],
          forEach: () => {},
        },
        arrayBuffer: async () => Buffer.from(''),
      };
    }
    return fakeResponse({ bodyText: 'done' });
  };
  const result = await performProxyRequest({ method: 'GET', url: 'https://api.example.com/start' }, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.body, 'done');
  assert.equal(result.url, 'https://api.example.com/done');
  assert.deepEqual(result.redirects, [{ status: 302, location: '/done' }]);
  assert.deepEqual(result.setCookies, ['sid=1; Path=/']);
  assert.deepEqual(seen, ['https://api.example.com/start', 'https://api.example.com/done']);
});

test('performProxyRequest sends a base64 body as raw bytes', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = options.body;
    return fakeResponse({ bodyText: 'ok' });
  };
  await performProxyRequest({ method: 'POST', url: 'https://api.example.com', bodyBase64: Buffer.from('file-bytes').toString('base64') }, { fetchImpl });
  assert.equal(Buffer.from(captured).toString('utf8'), 'file-bytes');
});

test('performProxyRequest surfaces a network error message', async () => {
  const fetchImpl = async () => {
    throw new Error('getaddrinfo ENOTFOUND api.example.com');
  };
  const result = await performProxyRequest({ method: 'GET', url: 'https://api.example.com' }, { fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /ENOTFOUND/);
});
