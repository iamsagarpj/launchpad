const LEVEL_KEYS = ['level', 'lvl', 'severity'];
const MESSAGE_KEYS = ['message', 'msg', 'text'];
const TIMESTAMP_KEYS = ['timestamp', 'time', 'ts', '@timestamp', 'datetime'];

function pickField(obj, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) {
      return obj[key];
    }
  }
  return null;
}

const TEXT_LEVEL_PATTERN = /\b(error|warn(?:ing)?|info|debug|trace|fatal)\b/i;

function detectLevelFromText(text) {
  const match = TEXT_LEVEL_PATTERN.exec(text);
  return match ? match[1].toLowerCase().replace('warning', 'warn') : null;
}

// Parses one log line, preferring structured (JSON) logs - the common
// format for "structured logging" - and falling back to a plain-text level
// keyword scan for everything else.
export function parseLogLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const level = pickField(parsed, LEVEL_KEYS);
      return {
        raw: line,
        structured: true,
        level: level ? String(level).toLowerCase() : null,
        message: pickField(parsed, MESSAGE_KEYS),
        timestamp: pickField(parsed, TIMESTAMP_KEYS),
        fields: parsed,
      };
    }
  } catch {
    // Not JSON - fall through to the plain-text path below.
  }
  return { raw: line, structured: false, level: detectLevelFromText(trimmed), message: trimmed, timestamp: null, fields: null };
}

export function parseLogText(text) {
  return text.split('\n').map(parseLogLine).filter(Boolean);
}

export function filterLogEntries(entries, { level, search } = {}) {
  const term = (search || '').trim().toLowerCase();
  return entries.filter((entry) => {
    if (level && level !== 'all' && entry.level !== level) return false;
    if (term && !entry.raw.toLowerCase().includes(term)) return false;
    return true;
  });
}
