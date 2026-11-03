function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toUrlSafe(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafe(base64) {
  let result = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padding = result.length % 4;
  if (padding === 2) {
    result += '==';
  } else if (padding === 3) {
    result += '=';
  } else if (padding !== 0) {
    throw new Error('Invalid base64 length');
  }
  return result;
}

export function encodeBase64(text, { urlSafe = false } = {}) {
  try {
    const bytes = new TextEncoder().encode(text);
    const encoded = bytesToBase64(bytes);
    return { ok: true, result: urlSafe ? toUrlSafe(encoded) : encoded };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function decodeBase64(text, { urlSafe = false } = {}) {
  try {
    const normalized = urlSafe ? fromUrlSafe(text) : text;
    const bytes = base64ToBytes(normalized);
    const result = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, result };
  } catch {
    return { ok: false, error: 'Invalid Base64 input' };
  }
}

// Binary-safe variants for file encode/decode - bytes in, bytes out, with no
// UTF-8 interpretation (a binary file's bytes are not necessarily valid
// UTF-8, so running them through TextEncoder/TextDecoder would corrupt them).
export function encodeBytesToBase64(bytes, { urlSafe = false } = {}) {
  const encoded = bytesToBase64(bytes);
  return urlSafe ? toUrlSafe(encoded) : encoded;
}

export function decodeBase64ToBytes(text, { urlSafe = false } = {}) {
  try {
    const normalized = urlSafe ? fromUrlSafe(text) : text;
    return { ok: true, bytes: base64ToBytes(normalized) };
  } catch {
    return { ok: false, error: 'Invalid Base64 input' };
  }
}
