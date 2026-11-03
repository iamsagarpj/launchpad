import { useEffect, useState } from 'react';
import { parseFavorites, toggleFavorite as toggleFavoriteId } from '../tools/favoritesLogic.js';

const STORAGE_KEY = 'launchpad-favorite-tools';

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState(() => parseFavorites(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  function toggleFavorite(toolId) {
    setFavoriteIds((prev) => toggleFavoriteId(prev, toolId));
  }

  function isFavorite(toolId) {
    return favoriteIds.includes(toolId);
  }

  return { favoriteIds, isFavorite, toggleFavorite };
}
