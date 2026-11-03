import test from 'node:test';
import assert from 'node:assert/strict';
import { detectVariableTrigger, findVariableTokens, formatJsonWithVariables } from './bodyVariableSupport.js';

test('detectVariableTrigger returns null when there is no unclosed {{', () => {
  assert.equal(detectVariableTrigger('hello world', 5), null);
  assert.equal(detectVariableTrigger('{{baseUrl}}/users', 18), null);
});

test('detectVariableTrigger returns the query typed after an unclosed {{', () => {
  assert.deepEqual(detectVariableTrigger('{{bas', 5), { openIndex: 0, query: 'bas' });
});

test('detectVariableTrigger returns an empty query right after typing {{', () => {
  assert.deepEqual(detectVariableTrigger('{{', 2), { openIndex: 0, query: '' });
});

test('detectVariableTrigger returns null if the query contains whitespace or braces', () => {
  assert.equal(detectVariableTrigger('{{bas eUrl', 10), null);
  assert.equal(detectVariableTrigger('{{bas{', 6), null);
});

test('detectVariableTrigger finds the most recent unclosed {{ before the cursor', () => {
  assert.deepEqual(detectVariableTrigger('{{baseUrl}} and {{tok', 22), { openIndex: 16, query: 'tok' });
});

test('findVariableTokens finds no tokens in plain text', () => {
  assert.deepEqual(findVariableTokens('hello world', ['baseUrl']), []);
});

test('findVariableTokens marks a token matching a known variable name as known', () => {
  const result = findVariableTokens('{{baseUrl}}/users', ['baseUrl']);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'baseUrl');
  assert.equal(result[0].known, true);
  assert.equal(result[0].start, 0);
  assert.equal(result[0].end, 11);
});

test('findVariableTokens marks a token with no matching variable name as unknown', () => {
  const result = findVariableTokens('{{missingVar}}', ['baseUrl']);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'missingVar');
  assert.equal(result[0].known, false);
});

test('formatJsonWithVariables keeps a bare token numeric and a quoted token as text', () => {
  const pretty = formatJsonWithVariables('{"crm_data_source":"Contacts","auth_account_id":{{auth_account_id}},"name":"{{name}}"}');
  assert.match(pretty, /"auth_account_id": \{\{auth_account_id\}\}/);
  assert.match(pretty, /"name": "\{\{name\}\}"/);
  assert.doesNotMatch(pretty, /"auth_account_id": "\{\{auth_account_id\}\}"/);
});

test('formatJsonWithVariables still rejects a single-brace placeholder', () => {
  assert.throws(() => formatJsonWithVariables('{"auth_account_id": {auth_account_id}}'));
});

test('findVariableTokens finds multiple tokens, tolerating internal whitespace', () => {
  const result = findVariableTokens('{{ baseUrl }}/{{ token }}', ['baseUrl', 'token']);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((t) => t.name), ['baseUrl', 'token']);
  assert.deepEqual(result.map((t) => t.known), [true, true]);
});
