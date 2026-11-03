import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvironments, upsertEnvironment, removeEnvironment, mergeEnvironments, exportEnvironmentPostman, importEnvironment } from './environmentsLogic.js';

test('parseEnvironments returns an empty array for null/empty input', () => {
  assert.deepEqual(parseEnvironments(null), []);
  assert.deepEqual(parseEnvironments(''), []);
});

test('parseEnvironments returns an empty array for invalid JSON', () => {
  assert.deepEqual(parseEnvironments('not json'), []);
});

test('parseEnvironments filters out entries missing a name or variables object', () => {
  const raw = JSON.stringify([{ name: 'dev', variables: { host: 'x' } }, { variables: {} }, { name: 'bad' }]);
  assert.deepEqual(parseEnvironments(raw), [{ name: 'dev', variables: { host: 'x' } }]);
});

test('upsertEnvironment adds a new environment', () => {
  const result = upsertEnvironment([], { name: 'dev', variables: { host: 'a' } });
  assert.deepEqual(result, [{ name: 'dev', variables: { host: 'a' } }]);
});

test('upsertEnvironment replaces an existing environment with the same name', () => {
  const existing = [{ name: 'dev', variables: { host: 'a' } }];
  const result = upsertEnvironment(existing, { name: 'dev', variables: { host: 'b' } });
  assert.deepEqual(result, [{ name: 'dev', variables: { host: 'b' } }]);
});

test('exportEnvironmentPostman writes a Postman environment file and importEnvironment reads it back', () => {
  const json = exportEnvironmentPostman({ name: 'dev', variables: { host: 'https://api.example.com', retries: 2 } });
  const data = JSON.parse(json);
  assert.equal(data.name, 'dev');
  assert.equal(data._postman_variable_scope, 'environment');
  assert.deepEqual(data.values.find((row) => row.key === 'host'), { key: 'host', value: 'https://api.example.com', type: 'default', enabled: true });
  const result = importEnvironment(json);
  assert.equal(result.ok, true);
  assert.equal(result.environment.name, 'dev');
  assert.equal(result.environment.variables.host, 'https://api.example.com');
  assert.equal(result.environment.variables.retries, '2');
});

test('importEnvironment skips disabled Postman values', () => {
  const result = importEnvironment(JSON.stringify({
    name: 'dev',
    _postman_variable_scope: 'environment',
    values: [
      { key: 'host', value: 'https://api.example.com', enabled: true },
      { key: 'secret', value: 'nope', enabled: false },
    ],
  }));
  assert.deepEqual(result.environment.variables, { host: 'https://api.example.com' });
});

test('importEnvironment returns ok:false for an unrecognized file', () => {
  const result = importEnvironment(JSON.stringify({ info: { name: 'collection' }, item: [] }));
  assert.equal(result.ok, false);
});

test('mergeEnvironments keeps keys that exist on only one side and lets the browser value win', () => {
  const merged = mergeEnvironments(
    [{ name: 'dev', variables: { phone: '000', token: 'abc' } }],
    [{ name: 'dev', variables: { phone: '111', baseUrl: 'https://dev.api' } }, { name: 'prod', variables: { phone: '9' } }]
  );
  assert.deepEqual(merged, [
    { name: 'dev', variables: { phone: '000', baseUrl: 'https://dev.api', token: 'abc' } },
    { name: 'prod', variables: { phone: '9' } },
  ]);
});

test('removeEnvironment removes the environment with the matching name', () => {
  const existing = [{ name: 'dev', variables: {} }, { name: 'prod', variables: {} }];
  assert.deepEqual(removeEnvironment(existing, 'dev'), [{ name: 'prod', variables: {} }]);
});
