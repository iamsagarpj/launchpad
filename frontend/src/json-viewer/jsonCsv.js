import { parseJsonValue } from './jsonUtils.js';

function csvEscapeField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Converts a top-level array of flat objects into a CSV string. The header
// row is the union of all keys across every item, in first-seen order.
export function jsonToCsv(jsonText) {
  const parsed = parseJsonValue(jsonText);
  if (!parsed.ok) {
    return { ok: false, error: `Document is not valid JSON: ${parsed.error}` };
  }
  const value = parsed.value;
  if (!Array.isArray(value)) {
    return { ok: false, error: 'JSON-to-CSV requires a top-level array of objects.' };
  }
  if (value.length === 0) {
    return { ok: true, result: '' };
  }
  const isFlatObject = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);
  if (!value.every(isFlatObject)) {
    return { ok: false, error: 'Every array item must be a flat object to convert to CSV.' };
  }

  const headers = [];
  const seen = new Set();
  value.forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    });
  });

  const lines = [headers.map(csvEscapeField).join(',')];
  value.forEach((item) => {
    lines.push(headers.map((header) => csvEscapeField(item[header])).join(','));
  });
  return { ok: true, result: lines.join('\n') };
}

// Parses one CSV line (RFC 4180-ish: quoted fields, doubled-quote escaping).
// Does not handle a quoted field containing an embedded newline spanning
// multiple raw lines - a documented limitation for this simple converter.
function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

export function csvToJson(csvText) {
  const trimmed = csvText.replace(/\r\n/g, '\n').trim();
  if (!trimmed) {
    return { ok: true, result: '[]' };
  }
  const lines = trimmed.split('\n');
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = fields[index] ?? '';
    });
    return obj;
  });
  return { ok: true, result: JSON.stringify(rows, null, 2) };
}
