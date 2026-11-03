import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile, envFileToObject, diffEnvFiles } from './envFileUtils.js';

test('parseEnvFile parses simple KEY=VALUE lines', () => {
  const result = parseEnvFile('PORT=4040\nDEBUG=false');
  assert.deepEqual(result, [
    { key: 'PORT', value: '4040' },
    { key: 'DEBUG', value: 'false' },
  ]);
});

test('parseEnvFile skips blank lines and full-line comments', () => {
  const result = parseEnvFile('# a comment\n\nPORT=4040\n');
  assert.deepEqual(result, [{ key: 'PORT', value: '4040' }]);
});

test('parseEnvFile skips a line with no "="', () => {
  const result = parseEnvFile('export\nPORT=4040');
  assert.deepEqual(result, [{ key: 'PORT', value: '4040' }]);
});

test('parseEnvFile strips a leading "export "', () => {
  const result = parseEnvFile('export PORT=4040');
  assert.deepEqual(result, [{ key: 'PORT', value: '4040' }]);
});

test('parseEnvFile strips matching quotes from a quoted value', () => {
  const result = parseEnvFile('NAME="Launchpad"\nLABEL=\'hello\'');
  assert.deepEqual(result, [
    { key: 'NAME', value: 'Launchpad' },
    { key: 'LABEL', value: 'hello' },
  ]);
});

test('parseEnvFile strips an inline comment on an unquoted value but not a quoted one', () => {
  const result = parseEnvFile('PORT=4040 # the port\nNOTE="has # inside"');
  assert.deepEqual(result, [
    { key: 'PORT', value: '4040' },
    { key: 'NOTE', value: 'has # inside' },
  ]);
});

test('envFileToObject builds a plain key-value map', () => {
  assert.deepEqual(envFileToObject('A=1\nB=2'), { A: '1', B: '2' });
});

test('diffEnvFiles reports no diffs when the same keys appear in a different order', () => {
  assert.deepEqual(diffEnvFiles('A=1\nB=2', 'B=2\nA=1'), []);
});

test('diffEnvFiles reports added, removed, and changed keys', () => {
  const result = diffEnvFiles('A=1\nB=2\nC=3', 'A=1\nB=9\nD=4');
  assert.deepEqual(result, [
    { key: 'B', type: 'changed', left: '2', right: '9' },
    { key: 'C', type: 'removed', left: '3', right: undefined },
    { key: 'D', type: 'added', left: undefined, right: '4' },
  ]);
});
