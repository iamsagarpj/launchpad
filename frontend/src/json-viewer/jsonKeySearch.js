import { formatJsonPath } from './jsonUtils.js';

function walk(value, term, path, out) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, term, [...path, index], out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.toLowerCase().includes(term)) {
        out.push({ path: formatJsonPath([...path, key]), key, value: value[key] });
      }
      walk(value[key], term, [...path, key], out);
    }
  }
}

// Finds every object key whose name contains searchTerm (case-insensitive
// substring match), anywhere in the document - distinct from a JSONPath
// query, which addresses a structural location rather than a key name.
export function findKeyPaths(value, searchTerm) {
  const term = searchTerm.trim().toLowerCase();
  if (!term) {
    return [];
  }
  const out = [];
  walk(value, term, [], out);
  return out;
}
