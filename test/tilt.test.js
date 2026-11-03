'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { isRunning, loginAws } = require('../lib/tilt');

test('isRunning resolves true when the injected runner succeeds', async () => {
  const fakeRunner = async () => '{}';
  assert.equal(await isRunning(fakeRunner), true);
});

test('isRunning resolves false (never rejects) when the injected runner fails', async () => {
  const fakeRunner = async () => {
    throw new Error('connection refused');
  };
  assert.equal(await isRunning(fakeRunner), false);
});

function fakeChild() {
  return new EventEmitter();
}

test('loginAws resolves ok:true and re-checks the given resource on a clean exit', async () => {
  const child = fakeChild();
  const spawnFn = () => child;
  const triggered = [];
  const triggerFn = async (name) => {
    triggered.push(name);
  };

  const promise = loginAws('default', 'aws-creds', spawnFn, triggerFn);
  child.emit('exit', 0);
  const result = await promise;

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(triggered, ['aws-creds']);
});

test('loginAws resolves ok:false and does NOT re-check on a non-zero exit', async () => {
  const child = fakeChild();
  const spawnFn = () => child;
  const triggered = [];
  const triggerFn = async (name) => {
    triggered.push(name);
  };

  const promise = loginAws('default', 'aws-creds', spawnFn, triggerFn);
  child.emit('exit', 1);
  const result = await promise;

  assert.deepEqual(result, { ok: false });
  assert.deepEqual(triggered, []);
});

test('loginAws resolves ok:false with the error message if the process never spawns', async () => {
  const child = fakeChild();
  const spawnFn = () => child;
  const triggerFn = async () => {
    throw new Error('should not be called');
  };

  const promise = loginAws('default', 'aws-creds', spawnFn, triggerFn);
  child.emit('error', new Error('spawn aws ENOENT'));
  const result = await promise;

  assert.deepEqual(result, { ok: false, error: 'spawn aws ENOENT' });
});

test('loginAws dedupes concurrent calls into the single in-flight attempt', async () => {
  const child = fakeChild();
  const spawnFn = () => child;
  let spawnCount = 0;
  const countingSpawn = (...args) => {
    spawnCount += 1;
    return spawnFn(...args);
  };
  const triggerFn = async () => {};

  const first = loginAws('default', 'aws-creds', countingSpawn, triggerFn);
  const second = loginAws('default', 'aws-creds', countingSpawn, triggerFn);
  assert.equal(first, second);

  child.emit('exit', 0);
  await first;
  assert.equal(spawnCount, 1);
});
