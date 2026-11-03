import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTools } from './searchTools.js';
import { TOOL_METADATA } from './registryData.js';

const FIXTURES = [
  { id: 'json', label: 'JSON Viewer', description: 'Format JSON documents.', category: 'Data', keywords: ['json', 'tree'] },
  { id: 'base64', label: 'Base64', description: 'Encode and decode Base64 text.', category: 'Encoding', keywords: ['b64', 'encode'] },
  { id: 'uuid', label: 'UUID Generator', description: 'Generate unique identifiers.', category: 'Generators', keywords: ['guid', 'identifier'] },
];

test('an empty query returns every tool, unchanged order', () => {
  assert.deepEqual(searchTools(FIXTURES, ''), FIXTURES);
});

test('a whitespace-only query is treated as empty', () => {
  assert.deepEqual(searchTools(FIXTURES, '   '), FIXTURES);
});

test('matching is case-insensitive', () => {
  const result = searchTools(FIXTURES, 'JSON');
  assert.equal(result[0].id, 'json');
});

test('an exact label match ranks above a mere substring match', () => {
  const result = searchTools(FIXTURES, 'base64');
  assert.equal(result[0].id, 'base64');
});

test('a label-prefix match ranks above a label-substring match', () => {
  const extra = [...FIXTURES, { id: 'other', label: 'My UUID-like thing', description: '', category: 'Misc', keywords: [] }];
  const result = searchTools(extra, 'uuid');
  assert.equal(result[0].id, 'uuid'); // label starts with "uuid"
  assert.ok(result.map((t) => t.id).includes('other')); // label merely contains "uuid"
});

test('a keyword match finds a tool whose label does not contain the query', () => {
  const result = searchTools(FIXTURES, 'guid');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'uuid');
});

test('a category match finds tools by category name', () => {
  const result = searchTools(FIXTURES, 'encoding');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'base64');
});

test('a query with no matches returns an empty array', () => {
  assert.deepEqual(searchTools(FIXTURES, 'nonexistent-tool-xyz'), []);
});

test('real registry metadata: "guid" finds the UUID tool, "b64" finds Base64', () => {
  assert.equal(searchTools(TOOL_METADATA, 'guid')[0].id, 'uuid');
  assert.equal(searchTools(TOOL_METADATA, 'b64')[0].id, 'base64');
});
