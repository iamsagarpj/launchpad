// Pure variable-token logic shared between VariableSuggestInput (the
// single-line URL/Headers/Auth fields) and MonacoBodyEditor (the request
// Body editor) - lifted into one module so both surfaces detect a "{{"
// trigger and classify "{{name}}" tokens exactly the same way.

// Returns {openIndex, query} if there's an unclosed "{{" before `cursor`
// (i.e. no "}}" after it) and the text between the "{{" and the cursor has
// no whitespace or braces in it; otherwise null.
export function detectVariableTrigger(text, cursor) {
  const upToCursor = text.slice(0, cursor);
  const openIndex = upToCursor.lastIndexOf('{{');
  if (openIndex === -1) return null;
  const closeIndex = upToCursor.lastIndexOf('}}');
  if (closeIndex > openIndex) return null;
  const query = upToCursor.slice(openIndex + 2);
  if (/[\s{}]/.test(query)) return null;
  return { openIndex, query };
}

const VARIABLE_TOKEN_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;
const VARIABLE_TOKEN_AT = /^\{\{\s*[\w.-]+\s*\}\}/;

// Scans `text` for every "{{name}}" token and classifies each as known
// (name is in variableNames) or unknown. start/end are character offsets
// into `text`, suitable for converting to editor positions by the caller.
export function findVariableTokens(text, variableNames) {
  const known = new Set(variableNames);
  const tokens = [];
  let match;
  VARIABLE_TOKEN_PATTERN.lastIndex = 0;
  while ((match = VARIABLE_TOKEN_PATTERN.exec(text))) {
    tokens.push({ start: match.index, end: match.index + match[0].length, name: match[1], known: known.has(match[1]) });
  }
  return tokens;
}

// Quoted {{name}} stays inside a string. A bare {{name}} stands in for a
// number, true, false, or null, so formatting must not wrap it in quotes.
export function formatJsonWithVariables(text) {
  const replacements = [];
  let masked = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        masked += char;
        escaped = false;
        index += 1;
        continue;
      }
      if (char === '\\') {
        masked += char;
        escaped = true;
        index += 1;
        continue;
      }
      if (char === '"') {
        inString = false;
        masked += char;
        index += 1;
        continue;
      }
      const token = text.slice(index).match(VARIABLE_TOKEN_AT);
      if (token) {
        const id = replacements.length;
        replacements.push({ id, raw: token[0], quoted: true });
        masked += `__LP_QUOTED_${id}__`;
        index += token[0].length;
        continue;
      }
      masked += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      masked += char;
      index += 1;
      continue;
    }
    const token = text.slice(index).match(VARIABLE_TOKEN_AT);
    if (token) {
      const id = replacements.length;
      replacements.push({ id, raw: token[0], quoted: false });
      masked += `"__LP_BARE_${id}__"`;
      index += token[0].length;
      continue;
    }
    masked += char;
    index += 1;
  }
  let pretty = JSON.stringify(JSON.parse(masked), null, 2);
  replacements.forEach((item) => {
    if (item.quoted) pretty = pretty.replace(`__LP_QUOTED_${item.id}__`, item.raw);
    else pretty = pretty.replace(`"__LP_BARE_${item.id}__"`, item.raw);
  });
  return pretty;
}
