import { parseJsonValue } from './jsonUtils.js';

// Removes // line comments and /* block */ comments, but only outside of
// string literals (so a comment-looking substring inside a JSON string is
// left untouched).
function stripComments(text) {
  let result = '';
  let inString = false;
  let stringChar = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      result += ch;
      if (ch === '\\') {
        if (i + 1 < text.length) {
          result += text[i + 1];
          i += 1;
        }
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        i += 1;
      }
      result += '\n';
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i += 1;
      }
      i += 1; // land on the '/'
      continue;
    }
    result += ch;
  }
  return result;
}

// Rewrites single-quoted strings as double-quoted strings, re-escaping any
// double quotes that land inside them and unescaping now-unnecessary \'.
// Double-quoted strings are copied through untouched.
function convertSingleQuotes(text) {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      result += ch;
      i += 1;
      while (i < text.length) {
        result += text[i];
        if (text[i] === '\\') {
          i += 1;
          if (i < text.length) {
            result += text[i];
            i += 1;
          }
          continue;
        }
        if (text[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "'") {
      result += '"';
      i += 1;
      while (i < text.length && text[i] !== "'") {
        if (text[i] === '\\' && text[i + 1] === "'") {
          result += "'";
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          result += '\\"';
          i += 1;
          continue;
        }
        if (text[i] === '\\') {
          result += text[i] + (text[i + 1] || '');
          i += 2;
          continue;
        }
        result += text[i];
        i += 1;
      }
      result += '"';
      i += 1; // skip the closing '
      continue;
    }
    result += ch;
    i += 1;
  }
  return result;
}

// Splits text into segments tagged isString, assuming all strings are
// already double-quoted (call after convertSingleQuotes). Lets later passes
// apply a regex to only the non-string segments.
function splitStringSegments(text) {
  const segments = [];
  let i = 0;
  let buffer = '';
  while (i < text.length) {
    if (text[i] === '"') {
      if (buffer) {
        segments.push({ text: buffer, isString: false });
        buffer = '';
      }
      let str = '"';
      i += 1;
      while (i < text.length) {
        str += text[i];
        if (text[i] === '\\') {
          i += 1;
          if (i < text.length) {
            str += text[i];
            i += 1;
          }
          continue;
        }
        if (text[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      segments.push({ text: str, isString: true });
      continue;
    }
    buffer += text[i];
    i += 1;
  }
  if (buffer) {
    segments.push({ text: buffer, isString: false });
  }
  return segments;
}

function quoteUnquotedKeys(text) {
  return splitStringSegments(text)
    .map((seg) =>
      seg.isString ? seg.text : seg.text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
    )
    .join('');
}

function stripTrailingCommas(text) {
  return splitStringSegments(text)
    .map((seg) => (seg.isString ? seg.text : seg.text.replace(/,(\s*[}\]])/g, '$1')))
    .join('');
}

// Best-effort repair for the most common hand-written-JSON mistakes: JS-style
// comments, single-quoted strings, unquoted object keys, and trailing commas.
// Not a fault-tolerant parser - if the result still doesn't parse, this
// reports the remaining error rather than guessing further.
export function repairJson(text) {
  let working = stripComments(text);
  working = convertSingleQuotes(working);
  working = quoteUnquotedKeys(working);
  working = stripTrailingCommas(working);

  const parsed = parseJsonValue(working);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, line: parsed.line, column: parsed.column };
  }
  const result = JSON.stringify(parsed.value, null, 2);
  return { ok: true, result, changed: working.trim() !== text.trim() };
}
