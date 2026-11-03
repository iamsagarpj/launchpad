// Classic LCS-based line diff. O(n*m) time/space, which is fine for the
// text sizes a dev-tool diff view is realistically used on; very large
// inputs (tens of thousands of lines) would need a smarter algorithm
// (e.g. Myers diff) - not implemented here.
function toLines(text) {
  // ''.split('\n') is ['' ] (one empty line), not zero lines - treat a fully
  // empty document as having no lines, so comparing against an empty
  // document reports every line of the other side as added/removed, not an
  // extra spurious blank-line entry.
  return text === '' ? [] : text.split('\n');
}

export function diffLines(leftText, rightText) {
  const left = toLines(leftText);
  const right = toLines(rightText);
  const n = left.length;
  const m = right.length;

  const lcsLength = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcsLength[i][j] =
        left[i] === right[j] ? lcsLength[i + 1][j + 1] + 1 : Math.max(lcsLength[i + 1][j], lcsLength[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      result.push({ type: 'equal', line: left[i] });
      i += 1;
      j += 1;
    } else if (lcsLength[i + 1][j] >= lcsLength[i][j + 1]) {
      result.push({ type: 'removed', line: left[i] });
      i += 1;
    } else {
      result.push({ type: 'added', line: right[j] });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: 'removed', line: left[i] });
    i += 1;
  }
  while (j < m) {
    result.push({ type: 'added', line: right[j] });
    j += 1;
  }
  return result;
}

export function diffStats(entries) {
  return entries.reduce(
    (stats, entry) => {
      stats[entry.type] += 1;
      return stats;
    },
    { equal: 0, added: 0, removed: 0 }
  );
}
