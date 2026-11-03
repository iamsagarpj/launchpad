import { parseYaml } from '../yaml/yamlUtils.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function parseSpecDocument(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch (err) {
      return { ok: false, error: `Document is not valid JSON: ${err.message}` };
    }
  }
  const yamlResult = parseYaml(trimmed);
  if (!yamlResult.ok) {
    return { ok: false, error: `Document is not valid JSON or YAML: ${yamlResult.error}` };
  }
  return { ok: true, value: yamlResult.value };
}

// Accepts either JSON or YAML (OpenAPI specs are commonly authored in YAML),
// reusing this project's own YAML-subset parser. Summarizes paths/methods
// into a flat, easy-to-scan list rather than reproducing the full spec tree.
export function parseOpenApiSpec(text) {
  const parsed = parseSpecDocument(text);
  if (!parsed.ok) {
    return parsed;
  }
  const spec = parsed.value;
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: 'Document does not look like an OpenAPI spec (expected an object).' };
  }
  const isOpenApi = typeof spec.openapi === 'string' || typeof spec.swagger === 'string';
  if (!isOpenApi || !spec.paths || typeof spec.paths !== 'object') {
    return { ok: false, error: 'Document is missing an "openapi"/"swagger" version field and/or a "paths" object.' };
  }

  const info = {
    title: spec.info?.title || 'Untitled API',
    version: spec.info?.version || '',
    description: spec.info?.description || '',
  };

  let baseUrl = '';
  if (Array.isArray(spec.servers) && spec.servers[0] && typeof spec.servers[0].url === 'string') {
    baseUrl = spec.servers[0].url;
  } else if (spec.host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes[0] ? spec.schemes[0] : 'https';
    baseUrl = `${scheme}://${spec.host}${spec.basePath || ''}`;
  }

  const endpoints = [];
  Object.entries(spec.paths).forEach(([path, pathItem]) => {
    if (!pathItem || typeof pathItem !== 'object') return;
    const shared = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    HTTP_METHODS.forEach((method) => {
      const operation = pathItem[method];
      if (!operation) return;
      const own = Array.isArray(operation.parameters) ? operation.parameters : [];
      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: operation.summary || '',
        description: operation.description || '',
        operationId: operation.operationId || '',
        parameters: [...shared, ...own].filter((p) => p && p.name).map((p) => ({
          name: p.name,
          in: p.in,
          required: Boolean(p.required),
          description: p.description || '',
        })),
        tags: operation.tags || [],
      });
    });
  });

  return { ok: true, info, endpoints, baseUrl };
}
