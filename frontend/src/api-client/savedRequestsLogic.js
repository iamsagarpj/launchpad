export function parseSavedRequests(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.name === 'string' && r.request) : [];
  } catch {
    return [];
  }
}

export function upsertSavedRequest(saved, entry) {
  const index = saved.findIndex((s) => s.name === entry.name);
  if (index === -1) return [...saved, entry];
  const next = [...saved];
  next[index] = entry;
  return next;
}

export function removeSavedRequest(saved, name) {
  return saved.filter((s) => s.name !== name);
}
