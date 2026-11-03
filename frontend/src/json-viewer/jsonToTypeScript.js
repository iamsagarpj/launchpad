import { parseJsonValue } from './jsonUtils.js';

function isValidIdentifier(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function propertyName(key) {
  return isValidIdentifier(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
}

function renderObjectType(obj, indent) {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return '{}';
  }
  const pad = '  '.repeat(indent + 1);
  const closePad = '  '.repeat(indent);
  const lines = keys.map((key) => `${pad}${propertyName(key)}: ${inferType(obj[key], indent + 1)};`);
  return `{\n${lines.join('\n')}\n${closePad}}`;
}

function inferType(value, indent) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'unknown[]';
    }
    const elementTypes = [...new Set(value.map((item) => inferType(item, indent)))];
    const elementType = elementTypes.length === 1 ? elementTypes[0] : `(${elementTypes.join(' | ')})`;
    return `${elementType}[]`;
  }
  const type = typeof value;
  if (type === 'object') {
    return renderObjectType(value, indent);
  }
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return type;
  }
  return 'unknown';
}

// Generates a single TypeScript interface from a top-level JSON object,
// inferring nested object shapes as inline object type literals (rather than
// hoisting separate named interfaces, which would require a naming scheme
// this tool doesn't try to invent) and arrays as element-type unions.
export function jsonToTypeScript(jsonText, interfaceName = 'Root') {
  const parsed = parseJsonValue(jsonText);
  if (!parsed.ok) {
    return { ok: false, error: `Document is not valid JSON: ${parsed.error}` };
  }
  const value = parsed.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'JSON-to-TypeScript requires a top-level JSON object.' };
  }
  const name = isValidIdentifier(interfaceName) ? interfaceName : 'Root';
  const body = renderObjectType(value, 0);
  return { ok: true, result: `interface ${name} ${body}\n` };
}
