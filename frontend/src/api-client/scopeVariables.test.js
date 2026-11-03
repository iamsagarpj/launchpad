import test from 'node:test';
import assert from 'node:assert/strict';
import { variablesForRequest, variablesForScope, changedVariables, resolveTabVariables, scriptHome, overlayScriptWrites } from './scopeVariables.js';

const collection = {
  name: 'Launchpad',
  variables: { clientId: 'from-collection' },
  items: [
    {
      id: 'auth',
      type: 'folder',
      name: 'Auth',
      variables: { clientId: 'from-auth', phone: '111' },
      items: [
        {
          id: 'otp',
          type: 'folder',
          name: 'OTP',
          variables: { phone: '999' },
          items: [{ id: 'send', type: 'request', name: 'Send OTP', request: {} }],
        },
      ],
    },
    { id: 'health', type: 'request', name: 'Health', request: {} },
  ],
};

const environment = { name: 'dev', variables: { baseUrl: 'https://dev.api', clientId: 'from-env', phone: '000' } };

test('variablesForRequest lets the nearest folder win over parents and the environment', () => {
  const resolved = variablesForRequest(collection, 'send', environment);
  assert.equal(resolved.values.baseUrl, 'https://dev.api');
  assert.equal(resolved.values.clientId, 'from-auth');
  assert.equal(resolved.values.phone, '999');
  assert.equal(resolved.rows.find((row) => row.key === 'phone').source, 'OTP');
  assert.equal(resolved.rows.find((row) => row.key === 'baseUrl').source, 'dev');
});

test('variablesForScope includes the folder being run and its parents', () => {
  const resolved = variablesForScope(collection, 'otp', environment);
  assert.equal(resolved.values.phone, '999');
  assert.equal(resolved.values.clientId, 'from-auth');
});

test('a request at the collection root uses the collection and the environment', () => {
  const resolved = variablesForRequest(collection, 'health', environment);
  assert.equal(resolved.values.clientId, 'from-collection');
  assert.equal(resolved.values.baseUrl, 'https://dev.api');
  assert.equal(resolved.values.phone, '000');
});

test('resolveTabVariables falls back to the environment when the request is not saved', () => {
  const resolved = resolveTabVariables([collection], { saveName: '' }, environment);
  assert.deepEqual(resolved.values, { baseUrl: 'https://dev.api', clientId: 'from-env', phone: '000' });
});

test('changedVariables keeps only keys a script changed', () => {
  assert.deepEqual(changedVariables({ phone: '999', baseUrl: 'https://dev.api' }, { phone: '999', baseUrl: 'https://dev.api', token: 'abc' }), { token: 'abc' });
});

test('scriptHome is the folder that holds the request, or the collection at the root', () => {
  assert.deepEqual(scriptHome(collection, 'send'), { folderId: 'otp', name: 'OTP', kind: 'folder' });
  assert.deepEqual(scriptHome(collection, 'health'), { folderId: null, name: 'Launchpad', kind: 'collection' });
  assert.equal(scriptHome(collection, 'missing'), null);
});

test('overlayScriptWrites stays inside the folder that set the value', () => {
  const writes = { '': { clientId: 'from-run' }, auth: { phone: 'from-auth-run' }, otp: { auth_account_id: '9996' } };
  assert.equal(overlayScriptWrites(collection, 'send', writes).auth_account_id, '9996');
  assert.equal(overlayScriptWrites(collection, 'send', writes).phone, 'from-auth-run');
  assert.equal(overlayScriptWrites(collection, 'health', writes).auth_account_id, undefined);
  assert.equal(overlayScriptWrites(collection, 'health', writes).clientId, 'from-run');
});
