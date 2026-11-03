import test from 'node:test';
import assert from 'node:assert/strict';
import { timestampToDate, dateToTimestamp } from './timestampUtils.js';

test('timestampToDate treats a 10-digit value as seconds', () => {
  const result = timestampToDate('1700000000');
  assert.equal(result.ok, true);
  assert.equal(result.unit, 'seconds');
  assert.equal(result.iso, '2023-11-14T22:13:20.000Z');
});

test('timestampToDate treats a 13-digit value as milliseconds', () => {
  const result = timestampToDate('1700000000000');
  assert.equal(result.ok, true);
  assert.equal(result.unit, 'milliseconds');
  assert.equal(result.iso, '2023-11-14T22:13:20.000Z');
});

test('timestampToDate handles a negative (pre-1970) timestamp', () => {
  const result = timestampToDate('-86400');
  assert.equal(result.ok, true);
  assert.equal(result.iso, '1969-12-31T00:00:00.000Z');
});

test('timestampToDate returns ok:false for non-numeric input', () => {
  const result = timestampToDate('not a number');
  assert.equal(result.ok, false);
});

test('timestampToDate returns consistent unixSeconds and unixMillis', () => {
  const result = timestampToDate('1700000000');
  assert.equal(result.ok, true);
  assert.equal(result.unixSeconds, 1700000000);
  assert.equal(result.unixMillis, 1700000000000);
});

test('dateToTimestamp parses an ISO date string', () => {
  const result = dateToTimestamp('2023-11-14T22:13:20.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.unixSeconds, 1700000000);
  assert.equal(result.unixMillis, 1700000000000);
});

test('dateToTimestamp returns ok:false for an unparseable string', () => {
  const result = dateToTimestamp('not a date');
  assert.equal(result.ok, false);
});

test('dateToTimestamp returns ok:false for an empty string', () => {
  const result = dateToTimestamp('');
  assert.equal(result.ok, false);
});

test('timestampToDate -> dateToTimestamp round-trips through ISO', () => {
  const forward = timestampToDate('1700000000');
  assert.equal(forward.ok, true);
  const back = dateToTimestamp(forward.iso);
  assert.equal(back.ok, true);
  assert.equal(back.unixSeconds, 1700000000);
});
