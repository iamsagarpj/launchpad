// A bare integer timestamp is ambiguous between seconds and milliseconds.
// This uses the same digit-count heuristic most timestamp tools use: current
// Unix seconds are ~10 digits (until year 2286), current Unix milliseconds
// are ~13 digits, so anything at or above 1e12 in magnitude is treated as
// milliseconds.
function looksLikeMillis(numericValue) {
  return Math.abs(numericValue) >= 1e12;
}

export function timestampToDate(input) {
  const trimmed = String(input).trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: 'Enter a whole number of seconds or milliseconds since the Unix epoch.' };
  }
  const numericValue = Number(trimmed);
  const isMillis = looksLikeMillis(numericValue);
  const millis = isMillis ? numericValue : numericValue * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'That value is out of range for a valid date.' };
  }
  return {
    ok: true,
    unit: isMillis ? 'milliseconds' : 'seconds',
    iso: date.toISOString(),
    utcString: date.toUTCString(),
    localString: date.toString(),
    unixSeconds: Math.floor(millis / 1000),
    unixMillis: millis,
  };
}

export function dateToTimestamp(input) {
  const trimmed = String(input).trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a date/time string, e.g. 2024-01-15T10:30:00Z.' };
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Could not parse that as a date.' };
  }
  return {
    ok: true,
    iso: date.toISOString(),
    utcString: date.toUTCString(),
    localString: date.toString(),
    unixSeconds: Math.floor(date.getTime() / 1000),
    unixMillis: date.getTime(),
  };
}
