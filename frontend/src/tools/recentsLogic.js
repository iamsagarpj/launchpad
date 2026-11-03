export const MAX_RECENTS = 5;

export function addRecent(recentIds, toolId, max = MAX_RECENTS) {
  const deduped = recentIds.filter((id) => id !== toolId);
  return [toolId, ...deduped].slice(0, max);
}

export function parseRecents(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
