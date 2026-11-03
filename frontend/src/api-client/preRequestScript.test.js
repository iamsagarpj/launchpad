import test from 'node:test';
import assert from 'node:assert/strict';
import { runPreRequestScript } from './preRequestScript.js';

test('runPreRequestScript sets an environment variable and adds a header', () => {
  const script = `
    pm.environment.set("nonce", "abc");
    pm.request.headers.add("X-Nonce", pm.environment.get("nonce"));
  `;
  const result = runPreRequestScript(script, { method: 'GET', url: 'https://api.example.com' }, () => undefined);
  assert.equal(result.ok, true);
  assert.equal(result.envUpdates.nonce, 'abc');
  assert.deepEqual(result.headerAdds, [{ key: 'X-Nonce', value: 'abc' }]);
});

test('runPreRequestScript returns ok:false for a thrown script', () => {
  const result = runPreRequestScript('throw new Error("nope")', {}, () => undefined);
  assert.equal(result.ok, false);
  assert.match(result.error, /nope/);
});
