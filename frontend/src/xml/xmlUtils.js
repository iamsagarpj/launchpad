// Hand-rolled XML tokenizer/validator/formatter - there is no DOMParser in
// Node, and this needs to be unit-testable with plain `node --test`, so it
// can't rely on the browser's native XML parser. Scope: well-formedness
// (matching tags, proper nesting, single root), declarations, DOCTYPE,
// comments, CDATA, and attributes preserved verbatim (not parsed into
// key/value pairs - formatting doesn't need to manipulate them).
function tokenize(text) {
  const tokens = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    if (text[i] === '<') {
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4);
        if (end === -1) throw new Error('Unterminated comment');
        tokens.push({ type: 'comment', value: text.slice(i + 4, end) });
        i = end + 3;
        continue;
      }
      if (text.startsWith('<![CDATA[', i)) {
        const end = text.indexOf(']]>', i + 9);
        if (end === -1) throw new Error('Unterminated CDATA section');
        tokens.push({ type: 'cdata', value: text.slice(i + 9, end) });
        i = end + 3;
        continue;
      }
      if (text.startsWith('<?', i)) {
        const end = text.indexOf('?>', i + 2);
        if (end === -1) throw new Error('Unterminated processing instruction');
        tokens.push({ type: 'declaration', value: text.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
      if (text.startsWith('<!', i)) {
        const end = text.indexOf('>', i + 2);
        if (end === -1) throw new Error('Unterminated declaration');
        tokens.push({ type: 'doctype', value: text.slice(i + 2, end).trim() });
        i = end + 1;
        continue;
      }
      if (text[i + 1] === '/') {
        const end = text.indexOf('>', i);
        if (end === -1) throw new Error('Unterminated closing tag');
        tokens.push({ type: 'closetag', name: text.slice(i + 2, end).trim() });
        i = end + 1;
        continue;
      }
      const end = text.indexOf('>', i);
      if (end === -1) throw new Error('Unterminated tag');
      let tagContent = text.slice(i + 1, end).trim();
      let selfClosing = false;
      if (tagContent.endsWith('/')) {
        selfClosing = true;
        tagContent = tagContent.slice(0, -1).trim();
      }
      const nameMatch = /^[^\s/>]+/.exec(tagContent);
      if (!nameMatch) throw new Error('Malformed tag: missing element name');
      const name = nameMatch[0];
      const attrs = tagContent.slice(name.length).trim();
      tokens.push({ type: 'opentag', name, attrs, selfClosing });
      i = end + 1;
      continue;
    }
    const next = text.indexOf('<', i);
    const end = next === -1 ? len : next;
    const value = text.slice(i, end);
    if (value.trim()) {
      tokens.push({ type: 'text', value });
    }
    i = end;
  }
  return tokens;
}

export function parseXml(text) {
  let tokens;
  try {
    tokens = tokenize(text);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const stack = [];
  let rootCount = 0;
  for (const token of tokens) {
    if (token.type === 'opentag') {
      if (stack.length === 0) {
        rootCount += 1;
        if (rootCount > 1) {
          return { ok: false, error: 'XML must have exactly one root element.' };
        }
      }
      if (!token.selfClosing) {
        stack.push(token.name);
      }
    } else if (token.type === 'closetag') {
      if (stack.length === 0 || stack[stack.length - 1] !== token.name) {
        return { ok: false, error: `Mismatched closing tag </${token.name}>.` };
      }
      stack.pop();
    } else if (token.type === 'text') {
      if (stack.length === 0 && token.value.trim()) {
        return { ok: false, error: 'Text content found outside the root element.' };
      }
    }
  }
  if (stack.length > 0) {
    return { ok: false, error: `Unclosed tag <${stack[stack.length - 1]}>.` };
  }
  if (rootCount === 0) {
    return { ok: false, error: 'XML document must have a root element.' };
  }
  return { ok: true, tokens };
}

export function validateXml(text) {
  const result = parseXml(text);
  return result.ok ? { ok: true } : result;
}

export function formatXml(text, indentSize = 2) {
  const parsed = parseXml(text);
  if (!parsed.ok) {
    return parsed;
  }
  const indentUnit = ' '.repeat(indentSize);
  let depth = 0;
  const lines = [];
  for (const token of parsed.tokens) {
    if (token.type === 'declaration') {
      lines.push(`<?${token.value}?>`);
    } else if (token.type === 'doctype') {
      lines.push(`<!${token.value}>`);
    } else if (token.type === 'comment') {
      lines.push(`${indentUnit.repeat(depth)}<!--${token.value}-->`);
    } else if (token.type === 'cdata') {
      lines.push(`${indentUnit.repeat(depth)}<![CDATA[${token.value}]]>`);
    } else if (token.type === 'opentag') {
      const attrs = token.attrs ? ` ${token.attrs}` : '';
      if (token.selfClosing) {
        lines.push(`${indentUnit.repeat(depth)}<${token.name}${attrs} />`);
      } else {
        lines.push(`${indentUnit.repeat(depth)}<${token.name}${attrs}>`);
        depth += 1;
      }
    } else if (token.type === 'closetag') {
      depth -= 1;
      lines.push(`${indentUnit.repeat(depth)}</${token.name}>`);
    } else if (token.type === 'text') {
      lines.push(`${indentUnit.repeat(depth)}${token.value.trim()}`);
    }
  }
  return { ok: true, result: lines.join('\n') };
}
