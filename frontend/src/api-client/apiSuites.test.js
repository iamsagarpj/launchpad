import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RECIPE,
  DEFAULT_SUITES,
  applyBearerFromVariable,
  applyPatchToRows,
  buildTokenRequest,
  loadSuiteConfig,
  matchEnvironmentName,
  readExpiry,
  readToken,
  signInSuite,
  suiteVariablePatch,
  tokenNeedsRefresh,
  validateSuiteDraft,
  withSuiteVariables,
} from './apiSuites.js';

const TOKEN_BODY = JSON.stringify({
  accessToken: 'eyJabc',
  refresh_token: 'refresh',
  exp: 1793509883,
  email: 'dev@example.com',
});

const DEV_SUITE = { id: 'dev', label: 'Dev', basePath: 'https://api.example.com/', studioUrl: 'https://app.example.com' };
const DEMO_SUITE = { id: 'demo', label: 'Demo', basePath: 'https://demo.example.com/', studioUrl: 'https://demo.example.com' };

test('buildTokenRequest targets the suite base and fills the studio URL', () => {
  const request = buildTokenRequest(DEV_SUITE, DEFAULT_RECIPE);
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://api.example.com/v1/session');
  const body = JSON.parse(request.body);
  assert.equal(body.email, 'dev@example.com');
  assert.equal(body.password, '');
  assert.equal(request.headers.find((header) => header.key === 'Referer').value, 'https://app.example.com/');
});

test('buildTokenRequest joins a custom path onto Local', () => {
  const request = buildTokenRequest(DEFAULT_SUITES[0], { ...DEFAULT_RECIPE, path: '/v4/session' });
  assert.equal(request.url, 'http://127.0.0.1:8000/v4/session');
});

test('readToken reads a top-level field and a nested field', () => {
  assert.equal(readToken(TOKEN_BODY, 'accessToken'), 'eyJabc');
  assert.equal(readToken(JSON.stringify({ data: { accessToken: 'nested' } }), 'data.accessToken'), 'nested');
  assert.equal(readToken(TOKEN_BODY, 'missing'), '');
  assert.equal(readToken('not-json', 'accessToken'), '');
});

test('readExpiry reads the exp claim', () => {
  assert.equal(readExpiry(TOKEN_BODY), 1793509883);
  assert.equal(readExpiry('{}'), 0);
});

test('matchEnvironmentName reuses a same name regardless of case', () => {
  assert.equal(matchEnvironmentName([{ name: 'dev', variables: {} }], DEV_SUITE), 'dev');
  assert.equal(matchEnvironmentName([], DEV_SUITE), 'Dev');
});

test('withSuiteVariables keeps existing keys and sets BASE_PATH plus the token', () => {
  const variables = withSuiteVariables(
    { name: 'dev', variables: { phone: '999', access_token: 'old' } },
    DEV_SUITE,
    'eyJabc',
    'access_token'
  );
  assert.equal(variables.phone, '999');
  assert.equal(variables.BASE_PATH, 'https://api.example.com/');
  assert.equal(variables.STUDIO_URL, 'https://app.example.com');
  assert.equal(variables.access_token, 'eyJabc');
});

test('suiteVariablePatch omits the token when sign-in did not return one', () => {
  const patch = suiteVariablePatch(DEMO_SUITE, '', 'access_token');
  assert.equal(patch.BASE_PATH, 'https://demo.example.com/');
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'access_token'), false);
});

test('applyBearerFromVariable adds a Bearer token and leaves an existing Authorization alone', () => {
  const open = applyBearerFromVariable({ method: 'GET', headers: [], auth: { type: 'none' } }, { access_token: 'eyJabc' });
  assert.equal(open.auth.type, 'bearer');
  assert.equal(open.auth.token, 'eyJabc');

  const prefixed = applyBearerFromVariable({ auth: { type: 'none' }, headers: [] }, { access_token: 'Bearer eyJabc' });
  assert.equal(prefixed.auth.token, 'eyJabc');

  const owned = { method: 'GET', headers: [{ key: 'Authorization', value: 'Bearer other', enabled: true }], auth: { type: 'none' } };
  assert.equal(applyBearerFromVariable(owned, { access_token: 'eyJabc' }), owned);

  const explicit = { headers: [], auth: { type: 'bearer', token: '{{access_token}}' } };
  assert.equal(applyBearerFromVariable(explicit, { access_token: 'eyJabc' }), explicit);
});

test('applyPatchToRows overrides a matching key and adds a missing one', () => {
  const rows = applyPatchToRows(
    [{ key: 'BASE_PATH', value: 'http://old', source: 'Folder' }],
    { BASE_PATH: 'https://api.example.com/', access_token: 'eyJabc' }
  );
  assert.equal(rows[0].value, 'https://api.example.com/');
  assert.equal(rows[0].source, 'Suite');
  assert.equal(rows[1].key, 'access_token');
});

test('tokenNeedsRefresh is true when the token is missing or near expiry', () => {
  const now = 1_700_000_000_000;
  assert.equal(tokenNeedsRefresh('', 0, now), true);
  assert.equal(tokenNeedsRefresh('eyJabc', 0, now), false);
  assert.equal(tokenNeedsRefresh('eyJabc', now / 1000, now), true);
  assert.equal(tokenNeedsRefresh('eyJabc', now / 1000 + 3600, now), false);
});

test('signInSuite returns the accessToken and a clear error when the field is missing', async () => {
  const ok = await signInSuite(DEV_SUITE, DEFAULT_RECIPE, async () => ({ ok: true, status: 200, body: TOKEN_BODY }));
  assert.equal(ok.ok, true);
  assert.equal(ok.token, 'eyJabc');
  assert.equal(ok.exp, 1793509883);

  const missing = await signInSuite(DEV_SUITE, { ...DEFAULT_RECIPE, tokenField: 'data.token' }, async () => ({
    ok: true,
    status: 200,
    body: TOKEN_BODY,
  }));
  assert.equal(missing.ok, false);
  assert.match(missing.error, /data\.token/);
});

test('loadSuiteConfig keeps a custom sign-in path and falls back when storage is broken', () => {
  const stored = loadSuiteConfig(JSON.stringify({
    activeId: 'dev',
    suites: [{ id: 'dev', label: 'Dev', basePath: 'https://api.example.com', studioUrl: 'https://app.example.com/' }],
    recipe: { path: 'v9/login', tokenField: 'data.accessToken' },
  }));
  assert.equal(stored.activeId, 'dev');
  assert.equal(stored.suites.find((suite) => suite.id === 'dev').basePath, 'https://api.example.com/');
  assert.equal(stored.suites.find((suite) => suite.id === 'local').basePath, 'http://127.0.0.1:8000/');
  assert.equal(stored.recipe.path, 'v9/login');
  assert.equal(stored.recipe.tokenField, 'data.accessToken');
  assert.equal(stored.recipe.variableName, 'access_token');
  assert.equal(loadSuiteConfig('not json').activeId, '');
  assert.equal(loadSuiteConfig('not json').recipe.path, 'v1/session');
});

test('validateSuiteDraft rejects a base URL that is not http', () => {
  const draft = {
    suites: [{ id: 'dev', label: 'Dev', basePath: 'ftp://files', studioUrl: '' }],
    recipe: DEFAULT_RECIPE,
  };
  assert.match(validateSuiteDraft(draft), /http/);
  assert.equal(validateSuiteDraft({ suites: DEFAULT_SUITES, recipe: DEFAULT_RECIPE }), '');
});
