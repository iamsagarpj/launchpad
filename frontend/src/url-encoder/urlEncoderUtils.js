// "component" mode (encodeURIComponent) is for encoding a single value that
// will sit inside a URL (a query param, a path segment) - it escapes
// URL-structural characters like / ? # &. "full" mode (encodeURI) is for
// encoding a whole URL and deliberately leaves those structural characters
// alone.
export function encodeUrl(text, mode = 'component') {
  try {
    const result = mode === 'full' ? encodeURI(text) : encodeURIComponent(text);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function decodeUrl(text, mode = 'component') {
  try {
    const result = mode === 'full' ? decodeURI(text) : decodeURIComponent(text);
    return { ok: true, result };
  } catch {
    return { ok: false, error: 'Invalid percent-encoding in input' };
  }
}
