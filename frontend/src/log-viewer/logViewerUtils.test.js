import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLogLine, parseLogText, filterLogEntries } from './logViewerUtils.js';

test('parseLogLine parses a structured JSON log line', () => {
  const result = parseLogLine('{"level":"ERROR","message":"boom","timestamp":"2024-01-01T00:00:00Z"}');
  assert.equal(result.structured, true);
  assert.equal(result.level, 'error');
  assert.equal(result.message, 'boom');
  assert.equal(result.timestamp, '2024-01-01T00:00:00Z');
});

test('parseLogLine recognizes alternate common field names', () => {
  const result = parseLogLine('{"severity":"warn","msg":"low disk","ts":123}');
  assert.equal(result.level, 'warn');
  assert.equal(result.message, 'low disk');
  assert.equal(result.timestamp, 123);
});

test('parseLogLine falls back to plain-text level detection for non-JSON lines', () => {
  const result = parseLogLine('2024-01-01 12:00:00 ERROR something broke');
  assert.equal(result.structured, false);
  assert.equal(result.level, 'error');
});

test('parseLogLine normalizes "warning" to "warn"', () => {
  const result = parseLogLine('WARNING: disk almost full');
  assert.equal(result.level, 'warn');
});

test('parseLogLine returns null for a blank line', () => {
  assert.equal(parseLogLine('   '), null);
});

test('parseLogText splits multi-line text and skips blank lines', () => {
  const result = parseLogText('line one\n\nline two ERROR');
  assert.equal(result.length, 2);
  assert.equal(result[1].level, 'error');
});

test('filterLogEntries filters by level', () => {
  const entries = parseLogText('INFO ok\nERROR bad\nINFO also ok');
  const result = filterLogEntries(entries, { level: 'error' });
  assert.equal(result.length, 1);
  assert.match(result[0].raw, /bad/);
});

test('filterLogEntries with level "all" returns everything', () => {
  const entries = parseLogText('INFO ok\nERROR bad');
  assert.equal(filterLogEntries(entries, { level: 'all' }).length, 2);
});

test('filterLogEntries filters by case-insensitive search term', () => {
  const entries = parseLogText('INFO starting up\nINFO shutting down');
  const result = filterLogEntries(entries, { search: 'SHUTTING' });
  assert.equal(result.length, 1);
});

test('filterLogEntries combines level and search filters', () => {
  const entries = parseLogText('ERROR disk full\nERROR network down\nINFO disk ok');
  const result = filterLogEntries(entries, { level: 'error', search: 'disk' });
  assert.equal(result.length, 1);
  assert.match(result[0].raw, /disk full/);
});
