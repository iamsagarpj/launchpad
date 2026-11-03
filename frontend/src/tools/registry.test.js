import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_METADATA } from './registryData.js';

test('every tool has the required metadata fields with correct types', () => {
  for (const tool of TOOL_METADATA) {
    assert.equal(typeof tool.id, 'string');
    assert.ok(tool.id.length > 0, `tool.id must be non-empty (got ${JSON.stringify(tool.id)})`);
    assert.equal(typeof tool.path, 'string');
    assert.equal(typeof tool.label, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.equal(typeof tool.category, 'string');
    assert.ok(tool.category.length > 0, `tool.category must be non-empty for ${tool.id}`);
    assert.ok(Array.isArray(tool.keywords), `tool.keywords must be an array for ${tool.id}`);
    assert.equal(typeof tool.capabilities, 'object');
    assert.equal(typeof tool.capabilities.localOnly, 'boolean');
  }
});

test('tool ids are unique', () => {
  const ids = TOOL_METADATA.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('tool paths are unique', () => {
  const paths = TOOL_METADATA.map((t) => t.path);
  assert.equal(new Set(paths).size, paths.length);
});

test('tool path is derived from /tools/<id>', () => {
  for (const tool of TOOL_METADATA) {
    assert.equal(tool.path, `/tools/${tool.id}`);
  }
});

test('every tool has at least one search keyword', () => {
  for (const tool of TOOL_METADATA) {
    assert.ok(tool.keywords.length > 0, `${tool.id} should have at least one keyword`);
  }
});
