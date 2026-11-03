import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXml, validateXml, formatXml } from './xmlUtils.js';

test('validateXml accepts a well-formed nested document', () => {
  const result = validateXml('<root><child>text</child></root>');
  assert.equal(result.ok, true);
});

test('validateXml accepts a self-closing tag', () => {
  const result = validateXml('<root><child/></root>');
  assert.equal(result.ok, true);
});

test('validateXml rejects a mismatched closing tag', () => {
  const result = validateXml('<root><child></wrong></root>');
  assert.equal(result.ok, false);
  assert.match(result.error, /Mismatched/);
});

test('validateXml rejects an unclosed tag', () => {
  const result = validateXml('<root><child></root>');
  assert.equal(result.ok, false);
});

test('validateXml rejects more than one root element', () => {
  const result = validateXml('<a></a><b></b>');
  assert.equal(result.ok, false);
  assert.match(result.error, /one root element/);
});

test('validateXml rejects a document with no elements at all', () => {
  const result = validateXml('just text, no tags');
  assert.equal(result.ok, false);
});

test('parseXml tokenizes an XML declaration, comment, and CDATA section', () => {
  const result = parseXml('<?xml version="1.0"?><root><!-- note --><![CDATA[raw <stuff>]]></root>');
  assert.equal(result.ok, true);
  const types = result.tokens.map((t) => t.type);
  assert.deepEqual(types, ['declaration', 'opentag', 'comment', 'cdata', 'closetag']);
});

test('formatXml indents nested elements by 2 spaces per level', () => {
  const result = formatXml('<root><child>text</child></root>');
  assert.equal(result.ok, true);
  assert.equal(result.result, '<root>\n  <child>\n    text\n  </child>\n</root>');
});

test('formatXml preserves attributes verbatim', () => {
  const result = formatXml('<root id="1" class="a b"><child/></root>');
  assert.equal(result.ok, true);
  assert.equal(result.result, '<root id="1" class="a b">\n  <child />\n</root>');
});

test('formatXml keeps the XML declaration unindented at the top', () => {
  const result = formatXml('<?xml version="1.0" encoding="UTF-8"?><root/>');
  assert.equal(result.ok, true);
  assert.equal(result.result, '<?xml version="1.0" encoding="UTF-8"?>\n<root />');
});

test('formatXml returns ok:false for malformed XML instead of guessing', () => {
  const result = formatXml('<root><child></root>');
  assert.equal(result.ok, false);
});
