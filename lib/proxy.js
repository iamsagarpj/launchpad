'use strict';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_TIMEOUT_MS = 30000;
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

// Only Launchpad's own UI (served from this same Express server) may use
// this proxy. This is the critical anti-SSRF-via-CSRF guard: a malicious
// page open in another browser tab cannot spoof the Origin header a real
// browser attaches to a fetch() request, so checking it reliably distinguishes
// "my own frontend called this" from "some other site tricked the browser
// into hitting this endpoint" - the proxy would otherwise let any page the
// developer has open make this dev-dashboard fetch arbitrary URLs on its
// behalf (classic SSRF-via-CSRF).
//
// Deliberately NOT blocking requests to localhost/private IP ranges: unlike
// a public-facing proxy, this tool's whole point is often testing a locally
// running API (http://localhost:8080, a Docker-internal host, etc.), so that
// SSRF mitigation would break the primary use case. The origin check above
// is the real protection here - once that passes, this proxy does exactly
// what Postman/Bruno's desktop HTTP clients already do unrestricted.
function isAllowedOrigin(originHeader, port) {
  if (!originHeader) return false;
  const allowed = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  return allowed.has(originHeader);
}

function headerGet(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name);
  return null;
}

function collectSetCookies(headers) {
  if (headers && typeof headers.getSetCookie === 'function') {
    const list = headers.getSetCookie();
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

function outboundPayload(method, body, bodyBase64) {
  if (BODYLESS_METHODS.has(method)) return undefined;
  if (typeof bodyBase64 === 'string' && bodyBase64) return Buffer.from(bodyBase64, 'base64');
  return body;
}

const MAX_REDIRECTS = 5;

async function performProxyRequest(
  { method, url, headers, body, bodyBase64 },
  { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, maxResponseBytes = MAX_RESPONSE_BYTES } = {}
) {
  if (!url || typeof url !== 'string') {
    return { ok: false, error: 'Missing url' };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// URLs are supported' };
  }

  let upperMethod = (method || 'GET').toUpperCase();
  let currentUrl = parsed.href;
  let payload = outboundPayload(upperMethod, body, bodyBase64);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const redirects = [];
  const setCookies = [];
  try {
    let upstream;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      upstream = await fetchImpl(currentUrl, {
        method: upperMethod,
        headers: headers || {},
        body: payload,
        redirect: 'manual',
        signal: controller.signal,
      });
      setCookies.push(...collectSetCookies(upstream.headers));
      const location = headerGet(upstream.headers, 'location');
      const isRedirect = upstream.status >= 300 && upstream.status < 400 && location && hop < MAX_REDIRECTS;
      if (!isRedirect) break;
      redirects.push({ status: upstream.status, location });
      currentUrl = new URL(location, currentUrl).href;
      if (upstream.status === 303 || (upstream.status === 302 && upperMethod !== 'GET' && upperMethod !== 'HEAD')) {
        upperMethod = 'GET';
        payload = undefined;
      }
    }
    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > maxResponseBytes) {
      return { ok: false, error: `Response exceeded the ${Math.round(maxResponseBytes / (1024 * 1024))}MB limit.` };
    }
    const text = Buffer.from(buffer).toString('utf-8');
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    if (!setCookies.length && responseHeaders['set-cookie']) setCookies.push(responseHeaders['set-cookie']);
    return {
      ok: true,
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      body: text,
      url: currentUrl,
      redirects,
      setCookies,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: `Request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { isAllowedOrigin, performProxyRequest, MAX_RESPONSE_BYTES, DEFAULT_TIMEOUT_MS };
