import test from 'node:test';
import assert from 'node:assert/strict';
import { testRegex, applyReplacement } from './regexUtils.js';

test('testRegex finds every match of a simple pattern', () => {
  const result = testRegex('\\d+', '', 'a1 b22 c333');
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.matches.map((m) => m.match),
    ['1', '22', '333']
  );
});

test('testRegex reports match index', () => {
  const result = testRegex('b+', '', 'aabbbcc');
  assert.equal(result.ok, true);
  assert.equal(result.matches[0].index, 2);
});

test('testRegex captures numbered groups', () => {
  const result = testRegex('(\\w+)@(\\w+)', '', 'user@host');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches[0].groups, ['user', 'host']);
});

test('testRegex captures named groups', () => {
  const result = testRegex('(?<user>\\w+)@(?<host>\\w+)', '', 'user@host');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches[0].namedGroups, { user: 'user', host: 'host' });
});

test('testRegex respects the i flag for case-insensitive matching', () => {
  const result = testRegex('hello', 'i', 'HELLO world');
  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].match, 'HELLO');
});

test('testRegex returns ok:false for invalid pattern syntax', () => {
  const result = testRegex('(unclosed', '', 'test');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('testRegex returns an empty match list for an empty pattern', () => {
  const result = testRegex('', '', 'anything');
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches, []);
});

test('applyReplacement replaces every occurrence, not just the first', () => {
  const result = applyReplacement('\\d', '', 'a1b2c3', '#');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'a#b#c#');
});

test('applyReplacement supports $1 backreferences', () => {
  const result = applyReplacement('(\\w+)@(\\w+)', '', 'user@host', '$2@$1');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'host@user');
});

test('applyReplacement returns ok:false for invalid pattern syntax', () => {
  const result = applyReplacement('[', '', 'test', 'x');
  assert.equal(result.ok, false);
});

test('applyReplacement returns the input unchanged for an empty pattern', () => {
  const result = applyReplacement('', '', 'unchanged', 'x');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'unchanged');
});
