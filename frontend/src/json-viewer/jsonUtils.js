import { parse, printParseErrorCode } from 'jsonc-parser';

export const SAMPLE_JSON = JSON.stringify(
  {
    name: 'Launchpad',
    version: '1.0.0',
    services: ['data-service', 'web-service', 'ui'],
    config: {
      port: 4040,
      debug: false,
    },
  },
  null,
  2
);

// jsonc-parser is designed for JSONC (JSON with Comments, as used in VS Code
// settings files), so it silently tolerates comments by default - disallow
// them here since this is a strict JSON validator, not a JSONC one.
const PARSE_OPTIONS = { disallowComments: true };

// jsonc-parser's printParseErrorCode gives a short PascalCase label
// (e.g. "ValueExpected") - map the ones we're likely to see to a more
// readable phrase for the status bar / error display.
const FRIENDLY_MESSAGES = {
  InvalidSymbol: 'Invalid character',
  InvalidNumberFormat: 'Invalid number format',
  PropertyNameExpected: 'Expected a property name',
  ValueExpected: 'Expected a value',
  ColonExpected: "Expected ':'",
  CommaExpected: "Expected ','",
  CloseBraceExpected: "Expected '}'",
  CloseBracketExpected: "Expected ']'",
  EndOfFileExpected: 'Unexpected trailing content',
  InvalidCommentToken: 'Comments are not allowed in strict JSON',
  UnexpectedEndOfComment: 'Unterminated comment',
  UnexpectedEndOfString: 'Unterminated string',
  UnexpectedEndOfNumber: 'Unterminated number',
  InvalidUnicode: 'Invalid unicode escape',
  InvalidEscapeCharacter: 'Invalid escape character',
  InvalidCharacter: 'Invalid character',
};

function offsetToLineColumn(text, offset) {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

export function parseJsonValue(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: 'Expected a string', line: 1, column: 1 };
  }
  const errors = [];
  const value = parse(text, errors, PARSE_OPTIONS);
  if (errors.length === 0) {
    return { ok: true, value };
  }
  const first = errors[0];
  const { line, column } = offsetToLineColumn(text, first.offset);
  const label = printParseErrorCode(first.error);
  return {
    ok: false,
    error: FRIENDLY_MESSAGES[label] || 'Invalid JSON',
    line,
    column,
  };
}

export function validateJson(text) {
  const result = parseJsonValue(text);
  if (result.ok) {
    return { ok: true };
  }
  return { ok: false, error: result.error, line: result.line, column: result.column };
}

export function formatJson(text, indent = 2) {
  try {
    const parsed = JSON.parse(text);
    return { ok: true, result: JSON.stringify(parsed, null, indent) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function minifyJson(text) {
  try {
    const parsed = JSON.parse(text);
    return { ok: true, result: JSON.stringify(parsed) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function getByteSize(text) {
  return new TextEncoder().encode(text).length;
}

export function formatJsonPath(segments) {
  let path = '$';
  for (const segment of segments) {
    if (typeof segment === 'number') {
      path += `[${segment}]`;
    } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
      path += `.${segment}`;
    } else {
      const escaped = String(segment).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      path += `['${escaped}']`;
    }
  }
  return path;
}

function unescapeBracketKey(raw) {
  return raw.replace(/\\(.)/g, '$1');
}

// Hand-rolled JSONPath subset: $ (root), .key / ['key'] (child), [n] (index),
// [*] / .* (wildcard), ..key (recursive descent). Deliberately not a full
// JSONPath implementation (no filters/slices/pipes) - see design doc non-goals.
// Bracket keys support backslash-escaped quotes (['it\'s']) so any JSONPath
// produced by formatJsonPath round-trips back through here.
function tokenizeJsonPath(path) {
  if (typeof path !== 'string' || !path.startsWith('$')) {
    return { ok: false, error: 'Path must start with $' };
  }
  const rest = path.slice(1);
  const tokens = [];
  const tokenPattern =
    /\.\.([A-Za-z_$][A-Za-z0-9_$]*)|\.(\*)|\.([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]|(\[\*\])|\['((?:\\.|[^'\\])*)'\]|\["((?:\\.|[^"\\])*)"\]/g;
  let lastEnd = 0;
  let match;
  while ((match = tokenPattern.exec(rest)) !== null) {
    if (match.index !== lastEnd) {
      return { ok: false, error: `Unexpected syntax near "${rest.slice(lastEnd)}"` };
    }
    if (match[1] !== undefined) {
      tokens.push({ type: 'recursive', key: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'wildcard' });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'child', key: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'index', index: Number(match[4]) });
    } else if (match[5] !== undefined) {
      tokens.push({ type: 'wildcard' });
    } else if (match[6] !== undefined) {
      tokens.push({ type: 'child', key: unescapeBracketKey(match[6]) });
    } else if (match[7] !== undefined) {
      tokens.push({ type: 'child', key: unescapeBracketKey(match[7]) });
    }
    lastEnd = tokenPattern.lastIndex;
  }
  if (lastEnd !== rest.length) {
    return { ok: false, error: `Unexpected syntax near "${rest.slice(lastEnd)}"` };
  }
  return { ok: true, tokens };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function applyToken(nodes, token) {
  const next = [];
  for (const value of nodes) {
    if (token.type === 'child') {
      if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, token.key)) {
        next.push(value[token.key]);
      }
    } else if (token.type === 'index') {
      if (Array.isArray(value) && token.index < value.length) {
        next.push(value[token.index]);
      }
    } else if (token.type === 'wildcard') {
      if (Array.isArray(value)) {
        next.push(...value);
      } else if (isPlainObject(value)) {
        next.push(...Object.values(value));
      }
    } else if (token.type === 'recursive') {
      next.push(...collectRecursive(value, token.key));
    }
  }
  return next;
}

function collectRecursive(value, key) {
  const results = [];
  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (isPlainObject(node)) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        results.push(node[key]);
      }
      Object.values(node).forEach(walk);
    }
  }
  walk(value);
  return results;
}

export function evaluateJsonPath(documentText, path) {
  const parsed = parseJsonValue(documentText);
  if (!parsed.ok) {
    return { ok: false, error: `Document is not valid JSON: ${parsed.error}` };
  }
  const tokenized = tokenizeJsonPath(path);
  if (!tokenized.ok) {
    return { ok: false, error: tokenized.error };
  }
  let nodes = [parsed.value];
  for (const token of tokenized.tokens) {
    nodes = applyToken(nodes, token);
  }
  return { ok: true, matches: nodes };
}
