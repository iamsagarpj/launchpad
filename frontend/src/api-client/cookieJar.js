function parseSetCookie(line) {
  const parts = String(line).split(';').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const eq = parts[0].indexOf('=');
  if (eq <= 0) return null;
  const cookie = { name: parts[0].slice(0, eq), value: parts[0].slice(eq + 1), path: '/' };
  parts.slice(1).forEach((attr) => {
    const [rawKey, ...rest] = attr.split('=');
    const key = rawKey.toLowerCase();
    const attrValue = rest.join('=');
    if (key === 'path' && attrValue) cookie.path = attrValue;
    if (key === 'domain' && attrValue) cookie.domain = attrValue.replace(/^\./, '');
  });
  return cookie;
}

export function cookieHeader(jar, urlString) {
  const url = new URL(urlString);
  const host = url.hostname;
  const path = url.pathname || '/';
  return (jar || [])
    .filter((cookie) => {
      const domain = cookie.domain || host;
      const domainOk = host === domain || host.endsWith(`.${domain}`);
      const pathOk = path.startsWith(cookie.path || '/');
      return domainOk && pathOk;
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

export function absorbSetCookies(jar, urlString, setCookies) {
  const host = new URL(urlString).hostname;
  let next = [...(jar || [])];
  (setCookies || []).forEach((line) => {
    const parsed = parseSetCookie(line);
    if (!parsed) return;
    if (!parsed.domain) parsed.domain = host;
    next = next.filter((cookie) => !(cookie.name === parsed.name && cookie.domain === parsed.domain && cookie.path === parsed.path));
    next.push(parsed);
  });
  return next;
}
