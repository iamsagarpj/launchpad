import { parseOpenApiSpec } from '../openapi/openApiUtils.js';

function generateId() {
  return crypto.randomUUID();
}

function requestFromEndpoint(endpoint, baseUrl) {
  const path = endpoint.path.replace(/\{([^}]+)\}/g, '{{$1}}');
  const url = baseUrl ? `{{baseUrl}}${path}` : path;
  const queryParams = (endpoint.parameters || [])
    .filter((param) => param.in === 'query')
    .map((param) => ({ key: param.name, value: '', enabled: true }));
  const headers = (endpoint.parameters || [])
    .filter((param) => param.in === 'header')
    .map((param) => ({ key: param.name, value: '', enabled: true }));
  const writesBody = endpoint.method === 'POST' || endpoint.method === 'PUT' || endpoint.method === 'PATCH';
  return {
    id: generateId(),
    type: 'request',
    name: endpoint.summary || endpoint.operationId || `${endpoint.method} ${endpoint.path}`,
    request: {
      method: endpoint.method,
      url,
      queryParams,
      headers,
      bodyType: writesBody ? 'json' : 'none',
      body: '',
      formParams: [],
      graphqlVariables: '',
      auth: { type: 'none' },
      script: '',
      preRequest: '',
    },
  };
}

export function collectionFromOpenApi(text) {
  const parsed = parseOpenApiSpec(text);
  if (!parsed.ok) return parsed;
  const baseUrl = (parsed.baseUrl || '').replace(/\/$/, '');
  const folders = new Map();
  const root = [];
  parsed.endpoints.forEach((endpoint) => {
    const request = requestFromEndpoint(endpoint, baseUrl);
    const tag = endpoint.tags && endpoint.tags[0];
    if (!tag) {
      root.push(request);
      return;
    }
    if (!folders.has(tag)) folders.set(tag, []);
    folders.get(tag).push(request);
  });
  const items = [...root];
  folders.forEach((requests, tag) => {
    items.push({ id: generateId(), type: 'folder', name: tag, items: requests });
  });
  const collection = { name: parsed.info.title || 'Imported API', items };
  if (baseUrl) collection.variables = { baseUrl };
  return { ok: true, collection };
}
