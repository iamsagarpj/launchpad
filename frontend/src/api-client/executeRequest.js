import { buildFetchOptions, buildClientCredentialsRequest } from './apiRequest.js';

// This is a thin, browser-only wrapper - not unit-tested with plain
// node --test for the same reason the useTheme/useFavorites hooks aren't: a
// real network call isn't something a fast, deterministic test should depend
// on. The request-building logic it calls (buildFetchOptions) is fully
// tested in apiRequest.test.js.
//
// Routed through this app's own /api/proxy endpoint (dev-dashboard's Express
// server) rather than calling fetch(url) directly from the browser. A direct
// browser fetch is subject to the target API's CORS policy, which silently
// broke testing real-world APIs that don't send CORS headers for this
// origin - the exact thing Postman/Bruno don't hit, because their HTTP
// clients aren't running inside a browser's CORS enforcement at all. The
// proxy reproduces that: it's a same-origin POST to this app's own backend,
// which then makes the actual request server-to-server (CORS doesn't apply
// between servers). See lib/proxy.js on the server for the origin-check that
// keeps this proxy from being usable by any other site the developer has
// open in another tab.
async function callProxy(options) {
  const proxyResponse = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return proxyResponse.json();
}

export async function executeRequest(request, variables = {}) {
  let prepared = request;
  if (request.auth && request.auth.type === 'oauth2') {
    const tokenRequest = buildClientCredentialsRequest(request.auth, variables);
    if (!tokenRequest.url) {
      return { ok: false, error: 'OAuth2 client credentials needs a token URL.' };
    }
    try {
      const tokenResult = await callProxy(tokenRequest);
      if (!tokenResult.ok) {
        return { ok: false, error: `Token request failed: ${tokenResult.error || tokenResult.status}` };
      }
      let accessToken = '';
      try {
        accessToken = JSON.parse(tokenResult.body).access_token || '';
      } catch {
        accessToken = '';
      }
      if (!accessToken) {
        return { ok: false, error: 'Token response had no access_token.' };
      }
      prepared = { ...request, auth: { type: 'bearer', token: accessToken } };
    } catch (err) {
      return { ok: false, error: `Could not reach the local proxy: ${err.message}` };
    }
  }

  const options = buildFetchOptions(prepared, variables);
  const startedAt = Date.now();
  try {
    const result = await callProxy(options);
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      body: result.body,
      durationMs,
      sizeBytes: new TextEncoder().encode(result.body || '').length,
      url: result.url,
      redirects: result.redirects || [],
      setCookies: result.setCookies || [],
    };
  } catch (err) {
    return { ok: false, error: `Could not reach the local proxy: ${err.message}` };
  }
}
