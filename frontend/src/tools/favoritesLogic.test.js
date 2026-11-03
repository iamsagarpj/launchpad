import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleFavorite, parseFavorites } from './favoritesLogic.js';

test('toggleFavorite adds an id that is not already a favorite', () => {
  assert.deepEqual(toggleFavorite(['json'], 'uuid'), ['json', 'uuid']);
});

test('toggleFavorite removes an id that is already a favorite', () => {
  assert.deepEqual(toggleFavorite(['json', 'uuid'], 'json'), ['uuid']);
});

test('toggleFavorite does not mutate the input array', () => {
  const input = ['json'];
  toggleFavorite(input, 'uuid');
  assert.deepEqual(input, ['json']);
});

test('parseFavorites returns an empty array for null/empty input', () => {
  assert.deepEqual(parseFavorites(null), []);
  assert.deepEqual(parseFavorites(''), []);
});

test('parseFavorites returns an empty array for invalid JSON', () => {
  assert.deepEqual(parseFavorites('not json'), []);
});

test('parseFavorites returns an empty array for valid JSON that is not an array', () => {
  assert.deepEqual(parseFavorites('{"json":true}'), []);
});

test('parseFavorites filters out non-string entries', () => {
  assert.deepEqual(parseFavorites('["json", 42, null, "uuid"]'), ['json', 'uuid']);
});

test('parseFavorites returns the array unchanged for valid string-array JSON', () => {
  assert.deepEqual(parseFavorites('["json","base64"]'), ['json', 'base64']);
});
