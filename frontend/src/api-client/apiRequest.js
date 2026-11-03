// Substitutes {{varName}} tokens using the active environment's variables.
// An unmatched token is left as-is (rather than becoming an empty string),
// so a missing variable is visibly obvious in the built request instead of
// silently disappearing.
export function substituteVariables(text, variables = {}) {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  );
}

export function buildUrl(request, variables = {}) {
  const substitutedUrl = substituteVariables(request.url || '', variables);
  const enabledParams = (request.queryParams || []).filter((p) => p.enabled !== false && p.key);
  const auth = request.auth || {};
  const apiKeyInQuery = auth.type === 'apikey' && auth.in === 'query' && auth.key;
  if (enabledParams.length === 0 && !apiKeyInQuery) {
    return substitutedUrl;
  }
  const [base, existingQuery] = substitutedUrl.split('?');
  const params = new URLSearchParams(existingQuery || '');
  enabledParams.forEach((p) => {
    params.append(substituteVariables(p.key, variables), substituteVariables(p.value || '', variables));
  });
  if (apiKeyInQuery) {
    params.append(substituteVariables(auth.key, variables), substituteVariables(auth.value || '', variables));
  }
  const queryString = params.toString();
  return queryString ? `${base}?${queryString}` : base;
}

export function buildHeaders(request, variables = {}) {
  const headers = {};
  (request.headers || [])
    .filter((h) => h.enabled !== false && h.key)
    .forEach((h) => {
      headers[substituteVariables(h.key, variables)] = substituteVariables(h.value || '', variables);
    });

  const auth = request.auth || { type: 'none' };
  if (auth.type === 'bearer' && auth.token) {
    headers.Authorization = `Bearer ${substituteVariables(auth.token, variables)}`;
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    const user = substituteVariables(auth.username || '', variables);
    const pass = substituteVariables(auth.password || '', variables);
    headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  } else if (auth.type === 'apikey' && auth.in !== 'query' && auth.key) {
    headers[substituteVariables(auth.key, variables)] = substituteVariables(auth.value || '', variables);
  }

  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
  if (!hasContentType && (request.bodyType === 'json' || request.bodyType === 'graphql')) {
    headers['Content-Type'] = 'application/json';
  }
  if (!hasContentType && request.bodyType === 'form') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  return headers;
}

function enabledFields(rows) {
  return (rows || []).filter((row) => row && row.enabled !== false && row.key);
}

export function buildBody(request, variables = {}) {
  if (request.bodyType === 'form') {
    const params = new URLSearchParams();
    enabledFields(request.formParams).forEach((row) => {
      params.append(substituteVariables(row.key, variables), substituteVariables(row.value || '', variables));
    });
    const text = params.toString();
    return text || undefined;
  }
  if (request.bodyType === 'graphql') {
    let graphqlVariables = {};
    const rawVars = substituteVariables(request.graphqlVariables || '', variables).trim();
    if (rawVars) {
      try {
        graphqlVariables = JSON.parse(rawVars);
      } catch {
        graphqlVariables = rawVars;
      }
    }
    return JSON.stringify({ query: substituteVariables(request.body || '', variables), variables: graphqlVariables });
  }
  if (request.bodyType === 'none' || request.bodyType === 'multipart' || !request.body) {
    return undefined;
  }
  return substituteVariables(request.body, variables);
}

const MULTIPART_BOUNDARY = '----LaunchpadBoundary';

// Text fields go out as a normal string. A file field is bytes, so the whole
// part is base64 and the proxy decodes it before sending — a JSON string
// cannot carry arbitrary file bytes.
export function buildMultipart(request, variables = {}) {
  const fields = enabledFields(request.formParams);
  const contentType = `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`;
  const hasFile = fields.some((field) => field.dataBase64);
  if (!hasFile) {
    let body = '';
    fields.forEach((field) => {
      const key = substituteVariables(field.key, variables);
      const value = substituteVariables(field.value || '', variables);
      body += `--${MULTIPART_BOUNDARY}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
    });
    body += `--${MULTIPART_BOUNDARY}--\r\n`;
    return { body: body || undefined, contentType };
  }
  const chunks = [];
  const encoder = new TextEncoder();
  fields.forEach((field) => {
    const key = substituteVariables(field.key, variables);
    let head = `--${MULTIPART_BOUNDARY}\r\nContent-Disposition: form-data; name="${key}"`;
    if (field.fileName) head += `; filename="${field.fileName}"`;
    head += '\r\n';
    if (field.contentType) head += `Content-Type: ${field.contentType}\r\n`;
    head += '\r\n';
    chunks.push(encoder.encode(head));
    if (field.dataBase64) {
      const binary = atob(field.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      chunks.push(bytes);
    } else {
      chunks.push(encoder.encode(substituteVariables(field.value || '', variables)));
    }
    chunks.push(encoder.encode('\r\n'));
  });
  chunks.push(encoder.encode(`--${MULTIPART_BOUNDARY}--\r\n`));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  let binary = '';
  merged.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return { bodyBase64: btoa(binary), contentType };
}

export function buildClientCredentialsRequest(auth, variables = {}) {
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', substituteVariables(auth.clientId || '', variables));
  params.set('client_secret', substituteVariables(auth.clientSecret || '', variables));
  if (auth.scope) params.set('scope', substituteVariables(auth.scope, variables));
  return {
    url: substituteVariables(auth.tokenUrl || '', variables),
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  };
}

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

// Resolves a request + the active environment's variables into the exact
// {url, method, headers, body} that would be handed to fetch().
export function buildFetchOptions(request, variables = {}) {
  const method = (request.method || 'GET').toUpperCase();
  const headers = buildHeaders(request, variables);
  if (BODYLESS_METHODS.has(method)) {
    return { url: buildUrl(request, variables), method, headers, body: undefined };
  }
  if (request.bodyType === 'multipart') {
    const multipart = buildMultipart(request, variables);
    if (multipart.contentType && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = multipart.contentType;
    }
    return {
      url: buildUrl(request, variables),
      method,
      headers,
      body: multipart.body,
      bodyBase64: multipart.bodyBase64,
    };
  }
  return {
    url: buildUrl(request, variables),
    method,
    headers,
    body: buildBody(request, variables),
  };
}
