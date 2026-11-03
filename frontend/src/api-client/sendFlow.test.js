import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPrepared } from './sendFlow.js';
import { runPreRequestScript } from './preRequestScript.js';
import { runPostResponseScript } from './postResponseScript.js';

test('sendPrepared applies a pre-request variable, stores a cookie, then lets the post script read it', async () => {
  const request = {
    method: 'GET',
    url: 'https://api.example.com/me',
    headers: [],
    queryParams: [],
    preRequest: 'pm.environment.set("token", "t1"); pm.request.headers.add("X-Token", pm.environment.get("token"));',
    script: 'pm.test("ok", function () { pm.response.to.have.status(200); }); pm.environment.set("user", pm.response.json().user);',
  };
  let sentHeaders;
  const step = await sendPrepared({
    request,
    variables: {},
    jar: [],
    execute: async (prepared) => {
      sentHeaders = prepared.headers;
      return { ok: true, status: 200, body: '{"user":"ada"}', url: 'https://api.example.com/me', setCookies: ['sid=1; Path=/'] };
    },
    runPre: runPreRequestScript,
    runPost: runPostResponseScript,
  });
  assert.equal(step.ok, true);
  assert.equal(sentHeaders.find((header) => header.key === 'X-Token').value, 't1');
  assert.equal(step.variables.user, 'ada');
  assert.equal(step.scriptOutcome.tests[0].ok, true);
  assert.equal(step.jar[0].name, 'sid');
});
