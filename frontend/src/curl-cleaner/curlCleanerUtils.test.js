import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRawCurl, classifyHeader, titleCaseHeader, redactAuthValue, buildCleanCurl } from './curlCleanerUtils.js';

const CMD_ESCAPED_EXAMPLE = `curl --url ^"https://api.example.com/v2/preview^" ^
  -H ^"accept: application/json, text/plain, */*^" ^
  -H ^"accept-language: en-US,en;q=0.9,ar;q=0.8^" ^
  -H ^"authorization: Bearer abc.def.ghi^" ^
  -H ^"content-type: application/json^" ^
  -H ^"origin: https://localhost:8085^" ^
  -H ^"sec-ch-ua: ^\\^"Google Chrome^\\^";v=^\\^"155^\\^"^" ^
  -H ^"user-agent: Mozilla/5.0 ^(Windows NT 10.0; Win64; x64^) AppleWebKit/537.36^" ^
  --data-raw ^"^{^\\^"cp_id^\\^":49184,^\\^"nested^\\^":^{^\\^"a^\\^":1^}^}^"`;

test('parseRawCurl decodes a Windows-cmd caret-escaped command end to end', () => {
  const result = parseRawCurl(CMD_ESCAPED_EXAMPLE);
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://api.example.com/v2/preview');
  assert.equal(result.method, null);
  assert.equal(result.bodyIsJson, true);
  assert.equal(result.body, '{"cp_id":49184,"nested":{"a":1}}');
  assert.deepEqual(
    result.headers.map((h) => h.key),
    ['accept', 'accept-language', 'authorization', 'content-type', 'origin', 'sec-ch-ua', 'user-agent']
  );
  const auth = result.headers.find((h) => h.key === 'authorization');
  assert.equal(auth.value, 'Bearer abc.def.ghi');
  const ua = result.headers.find((h) => h.key === 'user-agent');
  assert.equal(ua.value, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
});

test('parseRawCurl also accepts a plain already-clean bash command', () => {
  const result = parseRawCurl(
    `curl --location 'https://api.example.com/users' \\\n  --header 'Accept: application/json' \\\n  --data-raw '{"a":1}'`
  );
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://api.example.com/users');
  assert.deepEqual(result.headers, [{ key: 'Accept', value: 'application/json' }]);
  assert.equal(result.body, '{"a":1}');
  assert.equal(result.bodyIsJson, true);
});

test('parseRawCurl captures an explicit -X/--request method', () => {
  const result = parseRawCurl("curl -X DELETE 'https://api.example.com/users/1'");
  assert.equal(result.ok, true);
  assert.equal(result.method, 'DELETE');
});

test('parseRawCurl treats a non-JSON body as bodyIsJson:false and keeps it verbatim', () => {
  const result = parseRawCurl(`curl 'https://api.example.com' -d 'plain text, not json'`);
  assert.equal(result.ok, true);
  assert.equal(result.bodyIsJson, false);
  assert.equal(result.body, 'plain text, not json');
});

test('parseRawCurl returns ok:false for empty input', () => {
  assert.equal(parseRawCurl('').ok, false);
  assert.equal(parseRawCurl('   ').ok, false);
});

test('parseRawCurl returns ok:false when no URL is present', () => {
  const result = parseRawCurl('curl -X GET');
  assert.equal(result.ok, false);
  assert.match(result.error, /no url/i);
});

test('classifyHeader marks known browser-fingerprinting headers as noise, case-insensitively', () => {
  for (const key of [
    'accept-language',
    'Origin',
    'REFERER',
    'priority',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'User-Agent',
    'host',
    'content-length',
    'connection',
    'accept-encoding',
    'cookie',
  ]) {
    assert.equal(classifyHeader(key), 'noise', `expected ${key} to be noise`);
  }
});

test('classifyHeader keeps Accept, Content-Type, Authorization, and custom headers', () => {
  for (const key of ['accept', 'content-type', 'authorization', 'x-api-key', 'X-Custom-Thing']) {
    assert.equal(classifyHeader(key), 'keep', `expected ${key} to be kept`);
  }
});

test('titleCaseHeader title-cases each hyphen-separated part', () => {
  assert.equal(titleCaseHeader('content-type'), 'Content-Type');
  assert.equal(titleCaseHeader('accept'), 'Accept');
  assert.equal(titleCaseHeader('x-api-key'), 'X-Api-Key');
});

test('redactAuthValue redacts a Bearer token', () => {
  assert.equal(redactAuthValue('Bearer eyJhbGciOi.abc.def'), 'Bearer <YOUR_ACCESS_TOKEN>');
});

test('redactAuthValue redacts Basic credentials', () => {
  assert.equal(redactAuthValue('Basic dXNlcjpwYXNz'), 'Basic <YOUR_CREDENTIALS>');
});

test('redactAuthValue leaves a non-auth-shaped value untouched', () => {
  assert.equal(redactAuthValue('application/json'), 'application/json');
});

test('buildCleanCurl reproduces the full worked example byte for byte', () => {
  const output = buildCleanCurl({
    method: null,
    url: 'https://api.example.com/v2/preview',
    headers: [
      { key: 'accept', value: 'application/json, text/plain, */*' },
      { key: 'authorization', value: 'Bearer <YOUR_ACCESS_TOKEN>' },
      { key: 'content-type', value: 'application/json' },
    ],
    body: '{"id":1,"nested":{"a":1}}',
    bodyIsJson: true,
  });

  assert.equal(
    output,
    [
      "curl --location 'https://api.example.com/v2/preview' \\",
      "  --header 'Accept: application/json, text/plain, */*' \\",
      "  --header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>' \\",
      "  --header 'Content-Type: application/json' \\",
      "  --data-raw '{",
      '    "id": 1,',
      '    "nested": {',
      '      "a": 1',
      '    }',
      "  }'",
    ].join('\n')
  );
});

test('buildCleanCurl includes --request only when an explicit method was given', () => {
  const withMethod = buildCleanCurl({
    method: 'DELETE',
    url: 'https://api.example.com/users/1',
    headers: [],
    body: null,
    bodyIsJson: false,
  });
  assert.match(withMethod, /--request DELETE/);

  const withoutMethod = buildCleanCurl({
    method: null,
    url: 'https://api.example.com/users',
    headers: [],
    body: null,
    bodyIsJson: false,
  });
  assert.doesNotMatch(withoutMethod, /--request/);
});

test('buildCleanCurl with no body omits --data-raw and has no trailing backslash', () => {
  const output = buildCleanCurl({
    method: null,
    url: 'https://api.example.com/users',
    headers: [{ key: 'accept', value: 'application/json' }],
    body: null,
    bodyIsJson: false,
  });
  assert.equal(output, "curl --location 'https://api.example.com/users' \\\n  --header 'Accept: application/json'");
});

test('buildCleanCurl passes a non-JSON body through unformatted', () => {
  const output = buildCleanCurl({
    method: null,
    url: 'https://api.example.com',
    headers: [],
    body: 'plain text body',
    bodyIsJson: false,
  });
  assert.match(output, /--data-raw 'plain text body'$/);
});

test('buildCleanCurl escapes an embedded single quote in a header value', () => {
  const output = buildCleanCurl({
    method: null,
    url: 'https://api.example.com',
    headers: [{ key: 'x-name', value: "O'Brien" }],
    body: null,
    bodyIsJson: false,
  });
  assert.match(output, /--header 'X-Name: O'\\''Brien'$/);
});
