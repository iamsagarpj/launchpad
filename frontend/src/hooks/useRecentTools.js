import { useEffect, useState } from 'react';
import { parseRecents, addRecent, MAX_RECENTS } from '../tools/recentsLogic.js';

const STORAGE_KEY = 'launchpad-recent-tools';

export function useRecentTools() {
  const [recentIds, setRecentIds] = useState(() => parseRecents(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentIds));
  }, [recentIds]);

  function recordRecent(toolId) {
    setRecentIds((prev) => addRecent(prev, toolId, MAX_RECENTS));
  }

  return { recentIds, recordRecent };
}
