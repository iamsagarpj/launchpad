import { useEffect, useState } from 'react';
import { parseSavedRequests, upsertSavedRequest, removeSavedRequest } from '../api-client/savedRequestsLogic.js';

const STORAGE_KEY = 'launchpad-api-saved-requests';

export function useSavedRequests() {
  const [saved, setSaved] = useState(() => parseSavedRequests(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  function save(entry) {
    setSaved((prev) => upsertSavedRequest(prev, entry));
  }

  function remove(name) {
    setSaved((prev) => removeSavedRequest(prev, name));
  }

  return { saved, save, remove };
}
