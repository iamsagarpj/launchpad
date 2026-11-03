import { buildUrl } from './apiRequest.js';
import { cookieHeader, absorbSetCookies } from './cookieJar.js';

// One send: pre-request script, cookie header, the call, then the post-response
// script. Environment updates from either script are applied to the copy of
// `variables` returned here so a folder run can feed them into the next request.
export async function sendPrepared({ request, variables, jar, execute, runPre, runPost }) {
  let vars = { ...(variables || {}) };
  let next = { ...request, headers: [...(request.headers || [])] };
  const preResult = runPre(request.preRequest, next, (key) => vars[key]);
  if (!preResult.ok) {
    return { ok: false, error: preResult.error, result: null, scriptOutcome: null, variables: vars, jar };
  }
  Object.assign(vars, preResult.envUpdates);
  if (preResult.headerAdds.length) {
    next.headers = [
      ...next.headers,
      ...preResult.headerAdds.map((header) => ({ key: header.key, value: header.value == null ? '' : String(header.value), enabled: true })),
    ];
  }

  const url = buildUrl(next, vars);
  const hasCookie = next.headers.some((header) => header.key && header.key.toLowerCase() === 'cookie' && header.enabled !== false);
  if (!hasCookie && url) {
    try {
      const cookie = cookieHeader(jar, url);
      if (cookie) next.headers = [...next.headers, { key: 'Cookie', value: cookie, enabled: true }];
    } catch {
      // buildUrl can return a template that is not a URL yet. The call itself reports that.
    }
  }

  const result = await execute(next, vars);
  let nextJar = jar || [];
  if (result && result.ok && result.setCookies && result.setCookies.length) {
    try {
      nextJar = absorbSetCookies(nextJar, result.url || url, result.setCookies);
    } catch {
      // Leave the jar unchanged when the response URL is not parseable.
    }
  }

  let scriptOutcome = null;
  if (result && result.ok) {
    scriptOutcome = runPost(request.script, result, (key) => vars[key]);
    if (scriptOutcome.ok) Object.assign(vars, scriptOutcome.envUpdates);
  }
  return { ok: true, result, scriptOutcome, variables: vars, jar: nextJar };
}
