export function toggleFavorite(favoriteIds, toolId) {
  return favoriteIds.includes(toolId) ? favoriteIds.filter((id) => id !== toolId) : [...favoriteIds, toolId];
}

export function parseFavorites(raw) {
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
