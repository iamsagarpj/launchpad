import test from 'node:test';
import assert from 'node:assert/strict';
import { runPostResponseScript } from './postResponseScript.js';

const RESPONSE = { status: 200, headers: { 'content-type': 'application/json' }, body: '{"token":"abc123","userId":42}' };

test('runPostResponseScript returns ok:true with no updates for an empty script', () => {
  const result = runPostResponseScript('', RESPONSE, () => undefined);
  assert.equal(result.ok, true);
  assert.deepEqual(result.envUpdates, {});
});

test('runPostResponseScript sets an environment variable from the parsed response JSON', () => {
  const script = 'pm.environment.set("token", pm.response.json().token);';
  const result = runPostResponseScript(script, RESPONSE, () => undefined);
  assert.equal(result.ok, true);
  assert.deepEqual(result.envUpdates, { token: 'abc123' });
});

test('runPostResponseScript can set multiple variables', () => {
  const script = `
    const data = pm.response.json();
    pm.environment.set("token", data.token);
    pm.environment.set("userId", data.userId);
  `;
  const result = runPostResponseScript(script, RESPONSE, () => undefined);
  assert.equal(result.ok, true);
  assert.deepEqual(result.envUpdates, { token: 'abc123', userId: 42 });
});

test('runPostResponseScript can read an existing environment variable via pm.environment.get', () => {
  const script = 'pm.environment.set("combined", pm.environment.get("prefix") + pm.response.json().token);';
  const result = runPostResponseScript(script, RESPONSE, (key) => (key === 'prefix' ? 'Bearer ' : undefined));
  assert.equal(result.ok, true);
  assert.equal(result.envUpdates.combined, 'Bearer abc123');
});

test('runPostResponseScript exposes the raw response status and body', () => {
  const script = 'pm.environment.set("status", pm.response.status); pm.environment.set("raw", pm.response.body);';
  const result = runPostResponseScript(script, RESPONSE, () => undefined);
  assert.equal(result.ok, true);
  assert.equal(result.envUpdates.status, 200);
  assert.equal(result.envUpdates.raw, RESPONSE.body);
});

test('runPostResponseScript returns ok:false with the error message for a syntax error', () => {
  const result = runPostResponseScript('this is not valid js (((', RESPONSE, () => undefined);
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('runPostResponseScript returns ok:false with the error message for a runtime error', () => {
  const result = runPostResponseScript('pm.response.json().missing.deeper;', RESPONSE, () => undefined);
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('runPostResponseScript records pm.test pass and fail without aborting the script', () => {
  const script = `
    pm.test("status", function () { pm.response.to.have.status(200); });
    pm.test("token", function () { pm.expect(pm.response.json().token).to.eql("nope"); });
    pm.environment.set("kept", "yes");
  `;
  const result = runPostResponseScript(script, RESPONSE, () => undefined);
  assert.equal(result.ok, true);
  assert.equal(result.tests[0].ok, true);
  assert.equal(result.tests[1].ok, false);
  assert.equal(result.envUpdates.kept, 'yes');
});

test('runPostResponseScript returns ok:false when the response body is not valid JSON but the script calls .json()', () => {
  const result = runPostResponseScript('pm.response.json();', { ...RESPONSE, body: 'not json' }, () => undefined);
  assert.equal(result.ok, false);
});
