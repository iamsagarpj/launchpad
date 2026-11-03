// Native format: full fidelity (scripts included, folders preserved).
// version: 2 uses the recursive {items} tree; version: 1 (or no version
// field at all, i.e. every file exported before this change) used a flat
// {requests} array and is upgraded on import via upgradeCollection.
//
// The download button writes Postman Collection v2.1. Postman rejects a file
// that has no info.schema, and Bruno only accepts these four schema strings
// (https://github.com/usebruno/bruno/issues/4190):
//   https://schema.getpostman.com/json/collection/v2.0.0/collection.json
//   https://schema.getpostman.com/json/collection/v2.1.0/collection.json
//   https://schema.postman.com/json/collection/v2.0.0/collection.json
//   https://schema.postman.com/json/collection/v2.1.0/collection.json
// The getpostman.com v2.1 URL is the one both current Postman and older Bruno
// accept. Bruno reads url.raw, request.method, body.mode "raw", and a "test"
// event script. A folder is any item that has no request property.

import { upgradeCollection } from './collectionsLogic.js';

function generateId() {
  return crypto.randomUUID();
}

export function exportCollectionNative(collection) {
  return JSON.stringify({ launchpadCollection: true, version: 2, name: collection.name, items: collection.items }, null, 2);
}

// Older Bruno builds compare this string exactly. Postman still imports it.
const POSTMAN_V21_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

function enabledQuery(params) {
  return (params || []).filter((param) => param && param.key && param.enabled !== false);
}

function toPostmanUrl(request) {
  const base = request.url || '';
  const params = request.queryParams || [];
  const enabled = enabledQuery(params);
  let raw = base;
  if (enabled.length && !base.includes('?')) {
    raw = `${base}?${enabled.map((param) => `${param.key}=${param.value ?? ''}`).join('&')}`;
  }
  const url = { raw };
  const query = params
    .filter((param) => param && param.key)
    .map((param) => {
      const entry = { key: param.key, value: param.value ?? '' };
      if (param.enabled === false) entry.disabled = true;
      return entry;
    });
  if (query.length) url.query = query;
  return url;
}

function toPostmanHeaders(headers) {
  return (headers || [])
    .filter((header) => header && header.key)
    .map((header) => {
      const entry = { key: header.key, value: header.value ?? '', type: 'text' };
      if (header.enabled === false) entry.disabled = true;
      return entry;
    });
}

function toPostmanFields(rows) {
  return (rows || [])
    .filter((row) => row && row.key)
    .map((row) => {
      const entry = { key: row.key, value: row.value ?? '', type: 'text' };
      if (row.enabled === false) entry.disabled = true;
      return entry;
    });
}

function toPostmanBody(request) {
  if (request.bodyType === 'form') {
    return { mode: 'urlencoded', urlencoded: toPostmanFields(request.formParams) };
  }
  if (request.bodyType === 'multipart') {
    return {
      mode: 'formdata',
      formdata: (request.formParams || [])
        .filter((row) => row && row.key)
        .map((row) => {
          if (row.fileName) {
            const entry = { key: row.key, type: 'file', src: row.fileName };
            if (row.enabled === false) entry.disabled = true;
            return entry;
          }
          const entry = { key: row.key, value: row.value ?? '', type: 'text' };
          if (row.enabled === false) entry.disabled = true;
          return entry;
        }),
    };
  }
  if (request.bodyType === 'graphql') {
    return { mode: 'graphql', graphql: { query: request.body || '', variables: request.graphqlVariables || '' } };
  }
  if (!request.bodyType || request.bodyType === 'none') return null;
  return {
    mode: 'raw',
    raw: request.body || '',
    options: { raw: { language: request.bodyType === 'json' ? 'json' : 'text' } },
  };
}

function toPostmanAuth(auth) {
  if (!auth || !auth.type || auth.type === 'none' || auth.type === 'noauth') {
    return { type: 'noauth' };
  }
  if (auth.type === 'bearer') {
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.token || '', type: 'string' }] };
  }
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      basic: [
        { key: 'username', value: auth.username || '', type: 'string' },
        { key: 'password', value: auth.password || '', type: 'string' },
      ],
    };
  }
  if (auth.type === 'apikey' && auth.key) {
    return {
      type: 'apikey',
      apikey: [
        { key: 'key', value: auth.key, type: 'string' },
        { key: 'value', value: auth.value || '', type: 'string' },
        { key: 'in', value: auth.in === 'query' ? 'query' : 'header', type: 'string' },
      ],
    };
  }
  if (auth.type === 'oauth2' && auth.tokenUrl) {
    return {
      type: 'oauth2',
      oauth2: [
        { key: 'grant_type', value: 'client_credentials', type: 'string' },
        { key: 'accessTokenUrl', value: auth.tokenUrl, type: 'string' },
        { key: 'clientId', value: auth.clientId || '', type: 'string' },
        { key: 'clientSecret', value: auth.clientSecret || '', type: 'string' },
        { key: 'scope', value: auth.scope || '', type: 'string' },
      ],
    };
  }
  return { type: 'noauth' };
}

function toPostmanItem(item) {
  if (item.type === 'folder') {
    return { name: item.name || 'Untitled folder', item: (item.items || []).map(toPostmanItem) };
  }
  const request = item.request || {};
  const postmanRequest = {
    method: (request.method || 'GET').toUpperCase(),
    header: toPostmanHeaders(request.headers),
    url: toPostmanUrl(request),
  };
  const body = toPostmanBody(request);
  if (body) postmanRequest.body = body;
  const auth = toPostmanAuth(request.auth);
  if (auth.type !== 'noauth') postmanRequest.auth = auth;
  const node = { name: item.name || 'Untitled request', request: postmanRequest, response: [] };
  const events = [];
  const preRequest = (request.preRequest || '').trim();
  if (preRequest) {
    events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preRequest.split('\n') } });
  }
  const script = (request.script || '').trim();
  if (script) {
    events.push({ listen: 'test', script: { type: 'text/javascript', exec: script.split('\n') } });
  }
  if (events.length) node.event = events;
  return node;
}

// Postman Collection v2.1. Same file imports in Postman (Collection v2.1)
// and in Bruno (Import Collection → Postman Collection).
export function exportCollectionPostman(collection) {
  return JSON.stringify(
    {
      info: {
        _postman_id: crypto.randomUUID(),
        name: collection.name || 'Untitled collection',
        schema: POSTMAN_V21_SCHEMA,
      },
      item: (collection.items || []).map(toPostmanItem),
    },
    null,
    2
  );
}

function postmanUrlToString(url) {
  if (typeof url === 'string') return url;
  if (url && typeof url.raw === 'string') return url.raw;
  return '';
}

function postmanHeadersToRows(headers) {
  return (headers || []).map((h) => ({ key: h.key, value: h.value, enabled: !h.disabled }));
}

function postmanQueryParams(url, base) {
  if (url && Array.isArray(url.query)) {
    return url.query.map((q) => ({ key: q.key, value: q.value || '', enabled: !q.disabled }));
  }
  const query = base.includes('?') ? base.split('?')[1] : '';
  if (!query) return [];
  return [...new URLSearchParams(query).entries()].map(([key, value]) => ({ key, value, enabled: true }));
}

function postmanAuth(auth) {
  if (!auth || !auth.type || auth.type === 'noauth') {
    return { type: 'none' };
  }
  if (auth.type === 'bearer') {
    const token = (auth.bearer || []).find((e) => e.key === 'token')?.value || '';
    return { type: 'bearer', token };
  }
  if (auth.type === 'basic') {
    const fields = auth.basic || [];
    return {
      type: 'basic',
      username: fields.find((e) => e.key === 'username')?.value || '',
      password: fields.find((e) => e.key === 'password')?.value || '',
    };
  }
  if (auth.type === 'apikey') {
    const fields = auth.apikey || [];
    const read = (key) => fields.find((entry) => entry.key === key)?.value || '';
    return { type: 'apikey', key: read('key'), value: read('value'), in: read('in') === 'query' ? 'query' : 'header' };
  }
  if (auth.type === 'oauth2') {
    const fields = auth.oauth2 || [];
    const read = (key) => fields.find((entry) => entry.key === key)?.value || '';
    if (read('grant_type') && read('grant_type') !== 'client_credentials') return { type: 'none' };
    return {
      type: 'oauth2',
      tokenUrl: read('accessTokenUrl'),
      clientId: read('clientId'),
      clientSecret: read('clientSecret'),
      scope: read('scope'),
    };
  }
  return { type: 'none' };
}

function postmanFieldRows(rows) {
  return (rows || []).filter((row) => row && row.key).map((row) => ({
    key: row.key,
    value: row.value || '',
    enabled: !row.disabled,
  }));
}

function postmanBody(body) {
  const empty = { bodyType: 'none', body: '', formParams: [], graphqlVariables: '' };
  if (!body || !body.mode) return empty;
  if (body.mode === 'urlencoded') {
    return { bodyType: 'form', body: '', formParams: postmanFieldRows(body.urlencoded), graphqlVariables: '' };
  }
  if (body.mode === 'formdata') {
    return {
      bodyType: 'multipart',
      body: '',
      formParams: (body.formdata || []).filter((row) => row && row.key).map((row) => ({
        key: row.key,
        value: row.type === 'file' ? '' : row.value || '',
        fileName: row.type === 'file' ? (Array.isArray(row.src) ? row.src[0] || '' : row.src || '') : '',
        enabled: !row.disabled,
      })),
      graphqlVariables: '',
    };
  }
  if (body.mode === 'graphql') {
    const variables = body.graphql?.variables;
    return {
      bodyType: 'graphql',
      body: body.graphql?.query || '',
      formParams: [],
      graphqlVariables: typeof variables === 'string' ? variables : JSON.stringify(variables || {}),
    };
  }
  if (body.mode !== 'raw' || !body.raw) return empty;
  try {
    JSON.parse(body.raw);
    return { bodyType: 'json', body: body.raw, formParams: [], graphqlVariables: '' };
  } catch {
    return { bodyType: 'text', body: body.raw, formParams: [], graphqlVariables: '' };
  }
}

function postmanEventScript(item, listen) {
  const events = item.event || [];
  const match = events.find((event) => event && event.listen === listen && event.script);
  if (!match) return '';
  const exec = match.script.exec;
  if (Array.isArray(exec)) return exec.join('\n');
  if (typeof exec === 'string') return exec;
  return '';
}

function postmanItemToRequest(item) {
  const req = item.request || {};
  const rawUrl = postmanUrlToString(req.url);
  const base = rawUrl.split('?')[0];
  const { bodyType, body, formParams, graphqlVariables } = postmanBody(req.body);
  return {
    method: (req.method || 'GET').toUpperCase(),
    url: base,
    queryParams: postmanQueryParams(req.url, rawUrl),
    headers: postmanHeadersToRows(req.header),
    bodyType,
    body,
    formParams,
    graphqlVariables,
    auth: postmanAuth(req.auth),
    script: postmanEventScript(item, 'test'),
    preRequest: postmanEventScript(item, 'prerequest'),
  };
}

// Converts a Postman item array into this tool's Item[] tree, preserving
// folders (item.item arrays) as real nested folders instead of flattening
// them. Postman's own item ids aren't reused - fresh ids are generated here,
// consistent with every other creation path in this app.
function convertPostmanItems(items) {
  return (items || []).map((item) => {
    if (Array.isArray(item.item)) {
      return { id: generateId(), type: 'folder', name: item.name || 'Untitled folder', items: convertPostmanItems(item.item) };
    }
    return { id: generateId(), type: 'request', name: item.name || 'Untitled request', request: postmanItemToRequest(item) };
  });
}

function postmanKeyValues(rows) {
  const variables = {};
  (rows || []).forEach((row) => {
    if (!row || row.disabled) return;
    const key = String(row.key || '').trim();
    if (!key) return;
    variables[key] = row.value == null ? '' : String(row.value);
  });
  return variables;
}

function fromPostmanCollection(data) {
  const collection = { name: data.info?.name || 'Imported collection', items: convertPostmanItems(data.item) };
  const variables = postmanKeyValues(data.variable);
  if (Object.keys(variables).length) collection.variables = variables;
  return collection;
}

// Parses either this tool's own export format (v1 or v2) or a Postman
// Collection v2.x export into { name, items }.
export function importCollection(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${err.message}` };
  }
  if (data.launchpadCollection) {
    if (typeof data.name !== 'string' || !(Array.isArray(data.items) || Array.isArray(data.requests))) {
      return { ok: false, error: 'File is missing a name or an items/requests array.' };
    }
    const collectionData = { name: data.name };
    if (Array.isArray(data.items)) {
      collectionData.items = data.items;
    } else if (Array.isArray(data.requests)) {
      collectionData.requests = data.requests;
    }
    return { ok: true, collection: upgradeCollection(collectionData) };
  }
  if (data.info && Array.isArray(data.item)) {
    return { ok: true, collection: fromPostmanCollection(data) };
  }
  return { ok: false, error: 'Unrecognized collection format (expected a Launchpad or Postman collection export).' };
}
