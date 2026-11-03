import { decodeBase64 } from '../base64/base64Utils.js';

function decodeJsonSegment(segment, label) {
  const decoded = decodeBase64(segment, { urlSafe: true });
  if (!decoded.ok) {
    return { ok: false, error: `Could not decode ${label}: ${decoded.error}` };
  }
  try {
    return { ok: true, value: JSON.parse(decoded.result) };
  } catch {
    return { ok: false, error: `${label} segment is not valid JSON.` };
  }
}

// Decodes a JWT's header and payload. This is decoding only - it never
// verifies the signature or confirms the token is authentic, since that
// would require the issuer's signing key/secret, which this tool does not
// have (and should not be asked to accept, per the no-credential-exposure
// stance for a client-side dev tool).
export function decodeJwt(token) {
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'A JWT must have exactly 3 dot-separated parts (header.payload.signature).' };
  }
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodeJsonSegment(headerPart, 'Header');
  if (!header.ok) {
    return header;
  }
  const payload = decodeJsonSegment(payloadPart, 'Payload');
  if (!payload.ok) {
    return payload;
  }

  return {
    ok: true,
    header: header.value,
    payload: payload.value,
    signature: signaturePart,
    verified: false,
  };
}
