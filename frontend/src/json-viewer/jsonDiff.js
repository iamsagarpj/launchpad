import { parseJsonValue, formatJsonPath } from './jsonUtils.js';

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function diffValues(left, right, path, out) {
  const leftType = valueType(left);
  const rightType = valueType(right);

  if (leftType !== rightType) {
    out.push({ path: formatJsonPath(path), type: 'changed', left, right });
    return;
  }

  if (leftType === 'object') {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
      const hasRight = Object.prototype.hasOwnProperty.call(right, key);
      if (hasLeft && !hasRight) {
        out.push({ path: formatJsonPath([...path, key]), type: 'removed', left: left[key], right: undefined });
      } else if (!hasLeft && hasRight) {
        out.push({ path: formatJsonPath([...path, key]), type: 'added', left: undefined, right: right[key] });
      } else {
        diffValues(left[key], right[key], [...path, key], out);
      }
    }
    return;
  }

  if (leftType === 'array') {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (index >= left.length) {
        out.push({ path: formatJsonPath([...path, index]), type: 'added', left: undefined, right: right[index] });
      } else if (index >= right.length) {
        out.push({ path: formatJsonPath([...path, index]), type: 'removed', left: left[index], right: undefined });
      } else {
        diffValues(left[index], right[index], [...path, index], out);
      }
    }
    return;
  }

  if (left !== right) {
    out.push({ path: formatJsonPath(path), type: 'changed', left, right });
  }
}

// Structural diff between two JSON documents: walks both values in parallel
// (union of object keys, union of array indices) and reports only the paths
// that differ - added/removed/changed. Unchanged leaves are not reported, to
// keep the result focused on what's different.
export function diffJson(leftText, rightText) {
  const leftParsed = parseJsonValue(leftText);
  if (!leftParsed.ok) {
    return { ok: false, error: `Left document is not valid JSON: ${leftParsed.error}` };
  }
  const rightParsed = parseJsonValue(rightText);
  if (!rightParsed.ok) {
    return { ok: false, error: `Right document is not valid JSON: ${rightParsed.error}` };
  }
  const diffs = [];
  diffValues(leftParsed.value, rightParsed.value, [], diffs);
  return { ok: true, diffs };
}
