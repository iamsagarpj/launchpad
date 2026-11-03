// Hand-rolled YAML SUBSET parser/serializer - there is no good reason to add
// a dependency (e.g. js-yaml) just to avoid writing this, but full YAML is a
// large grammar, so this deliberately covers only the common hand-written
// subset: block mappings/sequences with consistent indentation, flow
// collections ([...]/{...}), scalar types (string/number/boolean/null),
// quoted strings, and comments. NOT supported: anchors/aliases, multi-
// document streams, block scalars (| and >), explicit tags, complex keys.
// Unsupported syntax surfaces as a parse error rather than being silently
// misinterpreted.

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function preprocess(text) {
  return text
    .split('\n')
    .map((raw) => stripComment(raw.replace(/\r$/, '')))
    .filter((line) => line.trim() !== '')
    .map((line) => ({ indent: line.length - line.trimStart().length, content: line.trim() }));
}

function parseQuotedScalar(trimmed) {
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      return { matched: true, value: JSON.parse(trimmed) };
    } catch {
      return { matched: true, value: trimmed.slice(1, -1) };
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return { matched: true, value: trimmed.slice(1, -1).replace(/''/g, "'") };
  }
  return { matched: false };
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '~' || /^null$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+([eE][-+]?\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  const quoted = parseQuotedScalar(trimmed);
  if (quoted.matched) return quoted.value;
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseFlow(trimmed);
  }
  return trimmed;
}

function parseFlow(text) {
  let pos = 0;

  function skipWs() {
    while (pos < text.length && /\s/.test(text[pos])) pos += 1;
  }

  function parseQuotedAt() {
    const quote = text[pos];
    const start = pos;
    pos += 1;
    while (pos < text.length && text[pos] !== quote) {
      if (quote === '"' && text[pos] === '\\') pos += 1;
      pos += 1;
    }
    pos += 1;
    return parseScalar(text.slice(start, pos));
  }

  function parseFlowScalarRaw(stopChars) {
    skipWs();
    const start = pos;
    while (pos < text.length && !stopChars.includes(text[pos])) pos += 1;
    return text.slice(start, pos).trim();
  }

  function parseValue() {
    skipWs();
    if (text[pos] === '[') return parseArray();
    if (text[pos] === '{') return parseObject();
    if (text[pos] === '"' || text[pos] === "'") return parseQuotedAt();
    return parseScalar(parseFlowScalarRaw(',]}'));
  }

  function parseArray() {
    pos += 1;
    const result = [];
    skipWs();
    if (text[pos] === ']') {
      pos += 1;
      return result;
    }
    for (;;) {
      result.push(parseValue());
      skipWs();
      if (text[pos] === ',') {
        pos += 1;
        skipWs();
        continue;
      }
      break;
    }
    if (text[pos] !== ']') throw new Error('Expected closing ] in flow sequence');
    pos += 1;
    return result;
  }

  function parseObject() {
    pos += 1;
    const result = {};
    skipWs();
    if (text[pos] === '}') {
      pos += 1;
      return result;
    }
    for (;;) {
      skipWs();
      const key = text[pos] === '"' || text[pos] === "'" ? parseQuotedAt() : parseFlowScalarRaw(':,}');
      skipWs();
      if (text[pos] !== ':') throw new Error('Expected : in flow mapping');
      pos += 1;
      const value = parseValue();
      result[String(key)] = value;
      skipWs();
      if (text[pos] === ',') {
        pos += 1;
        skipWs();
        continue;
      }
      break;
    }
    if (text[pos] !== '}') throw new Error('Expected closing } in flow mapping');
    pos += 1;
    return result;
  }

  const value = parseValue();
  skipWs();
  if (pos !== text.length) throw new Error('Unexpected trailing characters in flow collection');
  return value;
}

function splitKeyValue(content) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === ':' && (i + 1 === content.length || content[i + 1] === ' ')) {
      return { key: content.slice(0, i).trim(), value: content.slice(i + 1).trim() };
    }
  }
  return null;
}

function parseKeyName(rawKey) {
  const quoted = parseQuotedScalar(rawKey.trim());
  return quoted.matched ? String(quoted.value) : rawKey.trim();
}

// Returns [value, nextIndex].
function parseBlock(lines, startIndex, indent) {
  if (startIndex >= lines.length || lines[startIndex].indent < indent) {
    return [null, startIndex];
  }
  const first = lines[startIndex];
  if (first.content === '-' || first.content.startsWith('- ')) {
    return parseSequence(lines, startIndex, indent);
  }
  return parseMapping(lines, startIndex, indent);
}

function parseSequence(lines, startIndex, indent) {
  const result = [];
  let i = startIndex;
  while (i < lines.length && lines[i].indent === indent && (lines[i].content === '-' || lines[i].content.startsWith('- '))) {
    const remainder = lines[i].content === '-' ? '' : lines[i].content.slice(2);
    if (remainder === '') {
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const [value, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
        result.push(value);
        i = next;
      } else {
        result.push(null);
        i += 1;
      }
      continue;
    }
    const kv = splitKeyValue(remainder);
    if (kv) {
      // "- key: value" starts an inline mapping; sibling keys of that same
      // object are expected at indent+2, the column right after "- ".
      const itemIndent = indent + 2;
      const syntheticLines = [{ indent: itemIndent, content: remainder }, ...lines.slice(i + 1)];
      const [value, consumed] = parseMapping(syntheticLines, 0, itemIndent);
      result.push(value);
      i += consumed;
      continue;
    }
    result.push(parseScalar(remainder));
    i += 1;
  }
  return [result, i];
}

function parseMapping(lines, startIndex, indent) {
  const result = {};
  let i = startIndex;
  while (i < lines.length && lines[i].indent === indent) {
    const kv = splitKeyValue(lines[i].content);
    if (!kv) {
      throw new Error(`Expected "key: value" but found "${lines[i].content}"`);
    }
    const key = parseKeyName(kv.key);
    if (kv.value === '') {
      const hasNestedBlock = i + 1 < lines.length && lines[i + 1].indent > indent;
      if (hasNestedBlock) {
        const [value, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
        result[key] = value;
        i = next;
        continue;
      }
      result[key] = null;
      i += 1;
      continue;
    }
    result[key] = parseScalar(kv.value);
    i += 1;
  }
  return [result, i];
}

export function parseYaml(text) {
  try {
    const lines = preprocess(text);
    if (lines.length === 0) {
      return { ok: true, value: null };
    }
    const [value, next] = parseBlock(lines, 0, lines[0].indent);
    if (next < lines.length) {
      throw new Error(
        `Unexpected content at "${lines[next].content}" - inconsistent indentation or a mapping/sequence mixed at the same level.`
      );
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function validateYaml(text) {
  const result = parseYaml(text);
  return result.ok ? { ok: true } : result;
}

export function yamlToJson(text) {
  const result = parseYaml(text);
  if (!result.ok) {
    return result;
  }
  return { ok: true, result: JSON.stringify(result.value, null, 2) };
}

function needsQuoting(str) {
  if (str === '') return true;
  if (/^(true|false|null|~)$/i.test(str)) return true;
  if (/^-?\d+(\.\d+)?$/.test(str)) return true;
  if (/^[\s#\-?:,[\]{}&*!|>'"%@`]/.test(str)) return true;
  if (/:(\s|$)|#/.test(str)) return true;
  return false;
}

function formatYamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    return needsQuoting(value) ? JSON.stringify(value) : value;
  }
  return JSON.stringify(value);
}

function isNonEmptyContainer(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && typeof value === 'object' && Object.keys(value).length > 0;
}

function serializeYaml(value, indent) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        if (isNonEmptyContainer(item)) {
          const nestedLines = serializeYaml(item, indent + 1).split('\n');
          const firstLine = nestedLines[0].trimStart();
          const rest = nestedLines.slice(1).join('\n');
          return rest ? `${pad}- ${firstLine}\n${rest}` : `${pad}- ${firstLine}`;
        }
        return `${pad}- ${formatYamlScalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return `${pad}{}`;
    return keys
      .map((key) => {
        const v = value[key];
        if (isNonEmptyContainer(v)) {
          return `${pad}${key}:\n${serializeYaml(v, indent + 1)}`;
        }
        if (Array.isArray(v)) return `${pad}${key}: []`;
        if (v !== null && typeof v === 'object') return `${pad}${key}: {}`;
        return `${pad}${key}: ${formatYamlScalar(v)}`;
      })
      .join('\n');
  }
  return `${pad}${formatYamlScalar(value)}`;
}

export function formatYaml(text) {
  const parsed = parseYaml(text);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, result: serializeYaml(parsed.value, 0) };
}

export function jsonToYaml(jsonText) {
  let value;
  try {
    value = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, error: `Document is not valid JSON: ${err.message}` };
  }
  return { ok: true, result: serializeYaml(value, 0) };
}
