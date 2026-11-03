'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const remoteLogs = require('../lib/remoteLogs');

const {
  validateEnv,
  validateService,
  clampMinutes,
  mapEvents,
  mapError,
  fetchRemoteLogs,
  applyConfig,
} = remoteLogs;

const SAMPLE = {
  region: 'us-east-1',
  environments: {
    dev: { label: 'Dev', profile: 'default' },
    demo: { label: 'Demo', profile: 'demo' },
  },
  logGroups: {
    api: '/aws/ecs/api',
    worker: '/aws/ecs/worker',
  },
};

test('an empty cloudwatch file rejects every environment, including prod', async () => {
  applyConfig({});
  assert.equal(validateEnv('dev'), false);
  assert.equal(validateEnv('demo'), false);
  assert.equal(validateEnv('prod'), false);
  assert.equal(validateEnv('__proto__'), false);
  assert.equal(validateService('api'), false);

  let factoryCalled = false;
  const result = await fetchRemoteLogs('prod', 'api', 15, () => {
    factoryCalled = true;
    throw new Error('clientFactory must never be called for an invalid environment');
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(factoryCalled, false);
});

test('cloudwatch config accepts only the environments and log groups in the file', async () => {
  applyConfig(SAMPLE);
  assert.equal(validateEnv('dev'), true);
  assert.equal(validateEnv('demo'), true);
  assert.equal(validateEnv('prod'), false);
  assert.equal(validateService('api'), true);
  assert.equal(validateService('worker'), true);
  assert.equal(validateService('web-service'), false);
  assert.equal(validateService('__proto__'), false);

  let factoryCalled = false;
  const unknown = await fetchRemoteLogs('dev', 'missing', 15, () => {
    factoryCalled = true;
    throw new Error('clientFactory must never be called for an invalid service');
  });
  assert.equal(unknown.status, 400);
  assert.equal(factoryCalled, false);

  const fakeFactory = (profile) => {
    assert.equal(profile, 'default');
    return {
      send: async () => ({
        events: [{ timestamp: 1000, message: 'hello' }],
        nextToken: undefined,
      }),
    };
  };
  const result = await fetchRemoteLogs('dev', 'api', 15, fakeFactory);
  assert.equal(result.ok, true);
  assert.deepEqual(result.events, [{ timestamp: 1000, message: 'hello' }]);
  assert.equal(result.truncated, false);

  const truncated = await fetchRemoteLogs('demo', 'worker', 5, () => ({
    send: async () => ({ events: [], nextToken: 'some-token' }),
  }));
  assert.equal(truncated.ok, true);
  assert.equal(truncated.truncated, true);

  const denied = await fetchRemoteLogs('dev', 'api', 15, () => ({
    send: async () => {
      throw { name: 'CredentialsProviderError', message: 'Could not load credentials' };
    },
  }));
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 401);
  assert.match(denied.error, /aws sso login --profile default/);
});

test('clampMinutes bounds to [1,60] and falls back to 15 for invalid input', () => {
  assert.equal(clampMinutes(15), 15);
  assert.equal(clampMinutes(0), 1);
  assert.equal(clampMinutes(-5), 1);
  assert.equal(clampMinutes(999), 60);
  assert.equal(clampMinutes('abc'), 15);
  assert.equal(clampMinutes(undefined), 15);
  assert.equal(clampMinutes(30.6), 31);
});

test('mapEvents extracts timestamp/message pairs and handles missing input', () => {
  const result = mapEvents([
    { timestamp: 1000, message: 'line one', eventId: 'x', logStreamName: 'y' },
    { timestamp: 2000, message: 'line two', eventId: 'z', logStreamName: 'w' },
  ]);
  assert.deepEqual(result, [
    { timestamp: 1000, message: 'line one' },
    { timestamp: 2000, message: 'line two' },
  ]);
  assert.deepEqual(mapEvents(undefined), []);
  assert.deepEqual(mapEvents([]), []);
});

test('mapError recognizes credential errors and returns the exact sso login command', () => {
  const credError = { name: 'CredentialsProviderError', message: 'Could not load credentials' };
  const mapped = mapError(credError, 'dev');
  assert.equal(mapped.status, 401);
  assert.equal(mapped.error, 'AWS session expired or not configured for profile "dev". Run: aws sso login --profile dev');
});

test('mapError recognizes a generic expired-token-style message even without the named error class', () => {
  const genericError = { name: 'UnknownError', message: 'The security token included in the request is expired' };
  const mapped = mapError(genericError, 'demo');
  assert.equal(mapped.status, 401);
  assert.match(mapped.error, /aws sso login --profile demo/);
});

test('mapError recognizes ResourceNotFoundException distinctly', () => {
  const notFound = { name: 'ResourceNotFoundException', message: 'The specified log group does not exist.' };
  const mapped = mapError(notFound, 'dev');
  assert.equal(mapped.status, 404);
});

test('mapError falls back to a generic 502 for anything else', () => {
  const mapped = mapError(new Error('boom'), 'dev');
  assert.equal(mapped.status, 502);
});
