import { buildFetchOptions } from './apiRequest.js';

export { toCurl as toCurlSnippet } from './curl.js';

export function toJsFetchSnippet(request, variables = {}) {
  const { url, method, headers, body } = buildFetchOptions(request, variables);
  const lines = [`fetch(${JSON.stringify(url)}, {`, `  method: ${JSON.stringify(method)},`];
  if (Object.keys(headers).length > 0) {
    lines.push(`  headers: ${JSON.stringify(headers, null, 2).split('\n').join('\n  ')},`);
  }
  if (body !== undefined) {
    lines.push(`  body: ${JSON.stringify(body)},`);
  }
  lines.push('})', '  .then((res) => res.json())', '  .then((data) => console.log(data));');
  return lines.join('\n');
}

export function toPythonRequestsSnippet(request, variables = {}) {
  const { url, method, headers, body } = buildFetchOptions(request, variables);
  const lines = ['import requests', '', `url = ${JSON.stringify(url)}`];
  const kwargs = [];
  if (Object.keys(headers).length > 0) {
    lines.push(`headers = ${JSON.stringify(headers, null, 2)}`);
    kwargs.push('headers=headers');
  }
  if (body !== undefined) {
    lines.push(`data = ${JSON.stringify(body)}`);
    kwargs.push('data=data');
  }
  lines.push('', `response = requests.${method.toLowerCase()}(url${kwargs.length > 0 ? `, ${kwargs.join(', ')}` : ''})`);
  lines.push('print(response.status_code)');
  lines.push('print(response.text)');
  return lines.join('\n');
}
