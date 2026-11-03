import { buildFetchOptions } from './apiRequest.js';

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Serializes exactly what would be sent (post variable-substitution, with
// the resolved auth header) - reuses buildFetchOptions so export never
// drifts from what Execute actually does.
export function toCurl(request, variables = {}) {
  const { url, method, headers, body } = buildFetchOptions(request, variables);
  const parts = ['curl', '-X', method, shellQuote(url)];
  Object.entries(headers).forEach(([key, value]) => {
    parts.push('-H', shellQuote(`${key}: ${value}`));
  });
  if (body !== undefined) {
    parts.push('-d', shellQuote(body));
  }
  return parts.join(' ');
}

export function tokenize(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (quote === '"' && ch === '\\' && '"\\$`'.includes(command[i + 1])) {
        current += command[i + 1];
        i += 1;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      current += command[i + 1];
      i += 1;
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function extractQueryParams(url) {
  const [base, query] = url.split('?');
  if (!query) {
    return { base: url, queryParams: [] };
  }
  const params = new URLSearchParams(query);
  return { base, queryParams: [...params.entries()].map(([key, value]) => ({ key, value, enabled: true })) };
}

// Parses a cURL command into a request object. Supports the flags people
// actually paste from "Copy as cURL" in a browser devtools network panel:
// -X/--request, -H/--header, -d/--data(-raw|-binary), -u/--user. Anything
// else (e.g. --compressed, -k) is silently ignored rather than rejected,
// since those don't affect the request shape this tool models.
export function fromCurl(command) {
  const trimmed = command.trim().replace(/\\\r?\n/g, ' ');
  if (!trimmed) {
    return { ok: false, error: 'Paste a cURL command to import.' };
  }
  let tokens = tokenize(trimmed);
  if (tokens[0] === 'curl') {
    tokens = tokens.slice(1);
  }

  let method = null;
  let url = '';
  const headers = [];
  let body = '';
  let bodyType = 'none';
  let auth = { type: 'none' };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '-X' || token === '--request') {
      method = tokens[(i += 1)];
    } else if (token === '-H' || token === '--header') {
      const headerLine = tokens[(i += 1)] || '';
      const sep = headerLine.indexOf(':');
      if (sep !== -1) {
        headers.push({ key: headerLine.slice(0, sep).trim(), value: headerLine.slice(sep + 1).trim(), enabled: true });
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      body = tokens[(i += 1)] || '';
      try {
        JSON.parse(body);
        bodyType = 'json';
      } catch {
        bodyType = 'text';
      }
      method = method || 'POST';
    } else if (token === '-u' || token === '--user') {
      const credentials = tokens[(i += 1)] || '';
      const sep = credentials.indexOf(':');
      auth = {
        type: 'basic',
        username: sep === -1 ? credentials : credentials.slice(0, sep),
        password: sep === -1 ? '' : credentials.slice(sep + 1),
      };
    } else if (!token.startsWith('-') && !url) {
      url = token;
    }
  }

  if (!url) {
    return { ok: false, error: 'No URL found in the cURL command.' };
  }

  const { base, queryParams } = extractQueryParams(url);
  return {
    ok: true,
    request: { method: method || 'GET', url: base, queryParams, headers, bodyType, body, auth },
  };
}
