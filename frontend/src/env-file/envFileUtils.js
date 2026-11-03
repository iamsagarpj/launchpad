// Permissive .env parser: skips blank lines, full-line comments, and any
// line without an '=' (e.g. a bare "export FOO") rather than erroring, since
// .env files in the wild vary a lot and this tool's job is to extract
// key/value pairs, not validate strict syntax.
export function parseEnvFile(text) {
  const entries = [];
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    const isQuoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (!isQuoted) {
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    } else if (value.length >= 2) {
      value = value.slice(1, -1);
    }
    entries.push({ key, value });
  }
  return entries;
}

export function envFileToObject(text) {
  const result = {};
  parseEnvFile(text).forEach(({ key, value }) => {
    result[key] = value;
  });
  return result;
}

// Order-independent, key-based diff - unlike a line diff, reordering the
// same keys produces no diffs at all.
export function diffEnvFiles(leftText, rightText) {
  const left = envFileToObject(leftText);
  const right = envFileToObject(rightText);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const diffs = [];
  keys.forEach((key) => {
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);
    if (hasLeft && !hasRight) {
      diffs.push({ key, type: 'removed', left: left[key], right: undefined });
    } else if (!hasLeft && hasRight) {
      diffs.push({ key, type: 'added', left: undefined, right: right[key] });
    } else if (left[key] !== right[key]) {
      diffs.push({ key, type: 'changed', left: left[key], right: right[key] });
    }
  });
  return diffs;
}
