export const SUPPORTED_ALGORITHMS = ['SHA-256', 'SHA-384', 'SHA-512'];

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeHash(text, algorithm = 'SHA-256') {
  if (!SUPPORTED_ALGORITHMS.includes(algorithm)) {
    return { ok: false, error: `Unsupported algorithm: ${algorithm}` };
  }
  const bytes = new TextEncoder().encode(text);
  const digestBuffer = await crypto.subtle.digest(algorithm, bytes);
  return { ok: true, result: bytesToHex(new Uint8Array(digestBuffer)) };
}
