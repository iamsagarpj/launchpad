import { substituteVariables } from './apiRequest.js';

export const SUITE_STORAGE_KEY = 'launchpad-api-suites';
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

export const DEFAULT_SUITES = [
  { id: 'local', label: 'Local', basePath: 'http://127.0.0.1:8000/', studioUrl: 'http://127.0.0.1:8000' },
];

export const DEFAULT_RECIPE = {
  method: 'POST',
  path: 'v1/session',
  body: JSON.stringify(
    {
      email: 'dev@example.com',
      password: '',
    },
    null,
    2
  ),
  tokenField: 'accessToken',
  variableName: 'access_token',
};

export function normalizeBase(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function normalizeStudio(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function joinUrl(base, path) {
  return normalizeBase(base) + String(path || '').replace(/^\/+/, '');
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function loadSuiteConfig(raw) {
  const fallback = { activeId: '', suites: DEFAULT_SUITES.map((suite) => ({ ...suite })), recipe: { ...DEFAULT_RECIPE }, tokens: {} };
  if (!raw) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object') return fallback;
  const byId = new Map(DEFAULT_SUITES.map((suite) => [suite.id, { ...suite }]));
  (Array.isArray(parsed.suites) ? parsed.suites : []).forEach((suite) => {
    if (!suite || typeof suite.id !== 'string' || !suite.id) return;
    const base = byId.get(suite.id) || { id: suite.id, label: suite.id, basePath: '', studioUrl: '' };
    byId.set(suite.id, {
      id: suite.id,
      label: String(suite.label || base.label),
      basePath: normalizeBase(suite.basePath || base.basePath),
      studioUrl: normalizeStudio(suite.studioUrl || base.studioUrl),
    });
  });
  const recipe = parsed.recipe && typeof parsed.recipe === 'object' ? parsed.recipe : {};
  const tokens = {};
  if (parsed.tokens && typeof parsed.tokens === 'object') {
    Object.entries(parsed.tokens).forEach(([id, entry]) => {
      const exp = Number(entry?.exp);
      if (Number.isFinite(exp) && exp > 0) tokens[id] = { exp };
    });
  }
  return {
    activeId: typeof parsed.activeId === 'string' ? parsed.activeId : '',
    suites: [...byId.values()],
    recipe: {
      method: String(recipe.method || DEFAULT_RECIPE.method).toUpperCase(),
      path: String(recipe.path || DEFAULT_RECIPE.path).replace(/^\/+/, ''),
      body: typeof recipe.body === 'string' && recipe.body.trim() ? recipe.body : DEFAULT_RECIPE.body,
      tokenField: String(recipe.tokenField || DEFAULT_RECIPE.tokenField),
      variableName: String(recipe.variableName || DEFAULT_RECIPE.variableName),
    },
    tokens,
  };
}

export function serializeSuiteConfig(config) {
  return JSON.stringify(config);
}

export function matchEnvironmentName(environments, suite) {
  const names = [suite?.label, suite?.id].map((name) => String(name || '').toLowerCase()).filter(Boolean);
  const found = (environments || []).find((env) => names.includes(String(env?.name || '').toLowerCase()));
  return found ? found.name : suite.label;
}

export function suiteVariablePatch(suite, token, variableName) {
  const patch = { BASE_PATH: normalizeBase(suite.basePath) };
  const studio = normalizeStudio(suite.studioUrl);
  if (studio) patch.STUDIO_URL = studio;
  if (token) patch[variableName || DEFAULT_RECIPE.variableName] = String(token);
  return patch;
}

export function withSuiteVariables(env, suite, token, variableName) {
  return { ...(env?.variables || {}), ...suiteVariablePatch(suite, token, variableName) };
}

export function applyPatchToRows(rows, patch) {
  const next = (rows || []).map((row) => (
    patch && Object.prototype.hasOwnProperty.call(patch, row.key)
      ? { ...row, value: String(patch[row.key]), source: 'Suite' }
      : row
  ));
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (!next.some((row) => row.key === key)) next.push({ key, value: String(value), source: 'Suite' });
  });
  return next;
}

export function tokenNeedsRefresh(token, exp, now = Date.now()) {
  if (!token) return true;
  if (!exp) return false;
  return exp * 1000 <= now + TOKEN_REFRESH_SKEW_MS;
}

export function readToken(bodyText, field) {
  let data;
  try {
    data = JSON.parse(bodyText || '');
  } catch {
    return '';
  }
  const parts = String(field || 'accessToken').split('.').filter(Boolean);
  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return '';
    current = current[part];
  }
  return typeof current === 'string' ? current : '';
}

export function readExpiry(bodyText) {
  try {
    const exp = Number(JSON.parse(bodyText || '').exp);
    return Number.isFinite(exp) ? exp : 0;
  } catch {
    return 0;
  }
}

export function buildTokenRequest(suite, recipe) {
  const base = normalizeBase(suite?.basePath);
  const path = String(recipe?.path || '').trim().replace(/^\/+/, '');
  if (!isHttpUrl(base)) throw new Error('Suite base URL must start with http:// or https://.');
  if (!path) throw new Error('Sign-in path is empty.');
  const studio = normalizeStudio(suite?.studioUrl);
  const vars = { BASE_PATH: base, STUDIO_URL: studio };
  const body = substituteVariables(String(recipe.body || ''), vars);
  try {
    JSON.parse(body);
  } catch (err) {
    throw new Error(`Sign-in body is not valid JSON: ${err.message}`);
  }
  const headers = [
    { key: 'Accept', value: 'application/json, text/plain, */*', enabled: true },
    { key: 'Content-Type', value: 'application/json', enabled: true },
  ];
  if (studio) headers.push({ key: 'Referer', value: `${studio}/`, enabled: true });
  return {
    method: String(recipe.method || 'POST').toUpperCase(),
    url: joinUrl(base, substituteVariables(path, vars)),
    headers,
    bodyType: 'json',
    body,
    auth: { type: 'none' },
    queryParams: [],
  };
}

function responseSnippet(body) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

export async function signInSuite(suite, recipe, execute) {
  let request;
  try {
    request = buildTokenRequest(suite, recipe);
  } catch (err) {
    return { ok: false, error: err.message, token: '', exp: 0 };
  }
  const result = await execute(request, {});
  if (!result || result.ok === false) {
    return { ok: false, error: result?.error || 'Sign-in request failed.', token: '', exp: 0 };
  }
  if (result.status >= 400) {
    const snippet = responseSnippet(result.body);
    return { ok: false, error: `Sign-in returned ${result.status}${snippet ? `: ${snippet}` : ''}`, token: '', exp: 0 };
  }
  const field = recipe.tokenField || DEFAULT_RECIPE.tokenField;
  const token = readToken(result.body, field);
  if (!token) {
    const snippet = responseSnippet(result.body);
    return { ok: false, error: `Sign-in response had no "${field}"${snippet ? `: ${snippet}` : ''}`, token: '', exp: 0 };
  }
  return { ok: true, token, exp: readExpiry(result.body) };
}

export function applyBearerFromVariable(request, variables, variableName = DEFAULT_RECIPE.variableName) {
  const token = String(variables?.[variableName] || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) return request;
  const headers = request?.headers || [];
  const hasHeader = headers.some((header) => (
    header.enabled !== false
    && String(header.key || '').toLowerCase() === 'authorization'
    && String(header.value || '').trim()
  ));
  const auth = request?.auth || { type: 'none' };
  const hasAuth = Boolean(auth.type && auth.type !== 'none' && !(auth.type === 'bearer' && !String(auth.token || '').trim()));
  if (hasHeader || hasAuth) return request;
  return { ...request, auth: { ...auth, type: 'bearer', token } };
}

export function normalizeSuiteDraft(draft) {
  return {
    suites: (draft?.suites || []).map((suite) => ({
      id: String(suite.id || '').trim(),
      label: String(suite.label || '').trim(),
      basePath: normalizeBase(suite.basePath),
      studioUrl: normalizeStudio(suite.studioUrl),
    })),
    recipe: {
      method: String(draft?.recipe?.method || 'POST').trim().toUpperCase() || 'POST',
      path: String(draft?.recipe?.path || '').trim().replace(/^\/+/, ''),
      body: String(draft?.recipe?.body || ''),
      tokenField: String(draft?.recipe?.tokenField || '').trim(),
      variableName: String(draft?.recipe?.variableName || '').trim(),
    },
  };
}

export function validateSuiteDraft(draft) {
  const normalized = normalizeSuiteDraft(draft);
  if (!normalized.suites.length) return 'Add at least one suite.';
  for (const suite of normalized.suites) {
    if (!suite.label) return 'Each suite needs a name.';
    if (!isHttpUrl(suite.basePath)) return `${suite.label || 'Suite'} base URL must start with http:// or https://.`;
    if (suite.studioUrl && !isHttpUrl(suite.studioUrl)) return `${suite.label} studio URL must start with http:// or https://.`;
  }
  if (!normalized.recipe.path) return 'Sign-in path is empty.';
  if (!normalized.recipe.tokenField) return 'Response field is empty.';
  if (!/^[\w.-]+$/.test(normalized.recipe.variableName)) return 'Variable name can only use letters, numbers, dots, and underscores.';
  const sample = normalized.suites[0];
  try {
    buildTokenRequest(sample, normalized.recipe);
  } catch (err) {
    return err.message;
  }
  return '';
}
