export function sortResources(resources) {
  return [...resources].sort((a, b) => a.name.localeCompare(b.name));
}

export function parsePort(url) {
  if (!url) {
    return null;
  }
  const match = url.match(/:(\d+)/);
  return match ? match[1] : null;
}
