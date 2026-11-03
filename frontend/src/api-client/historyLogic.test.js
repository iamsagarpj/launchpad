import test from 'node:test';
import assert from 'node:assert/strict';
import { pushHistory } from './historyLogic.js';

test('pushHistory keeps the newest entry first and drops file bytes', () => {
  const history = pushHistory([], {
    method: 'POST',
    url: 'https://api.example.com',
    status: 201,
    ok: true,
    request: { method: 'POST', formParams: [{ key: 'file', dataBase64: 'abc', fileName: 'a.txt' }] },
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 201);
  assert.equal(history[0].request.formParams[0].dataBase64, '');
  assert.equal(history[0].request.formParams[0].fileName, 'a.txt');
});

test('pushHistory keeps at most 30 entries', () => {
  let history = [];
  for (let i = 0; i < 35; i += 1) {
    history = pushHistory(history, { method: 'GET', url: `https://api.example.com/${i}`, status: 200, ok: true, request: {} });
  }
  assert.equal(history.length, 30);
  assert.equal(history[0].url, 'https://api.example.com/34');
});
