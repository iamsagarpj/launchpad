import { useEffect, useState } from 'react';
import { parseEnvironments, upsertEnvironment, removeEnvironment, mergeEnvironments } from '../api-client/environmentsLogic.js';

const STORAGE_KEY = 'launchpad-api-environments';
const ACTIVE_KEY = 'launchpad-api-active-environment';

export function useEnvironments() {
  const [environments, setEnvironments] = useState(() => parseEnvironments(localStorage.getItem(STORAGE_KEY)));
  const [activeName, setActiveName] = useState(() => localStorage.getItem(ACTIVE_KEY) || '');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(environments));
  }, [environments]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeName);
  }, [activeName]);

  const active = environments.find((e) => e.name === activeName) || null;

  function saveEnvironment(env) {
    setEnvironments((prev) => upsertEnvironment(prev, env));
  }

  function mergeDisk(payload) {
    const diskEnvs = payload?.environments || [];
    const diskActive = payload?.activeName || '';
    setEnvironments((prev) => mergeEnvironments(prev, diskEnvs));
    setActiveName((current) => current || diskActive);
  }

  function deleteEnvironment(name) {
    setEnvironments((prev) => removeEnvironment(prev, name));
    if (activeName === name) {
      setActiveName('');
    }
  }

  return { environments, active, activeName, setActiveName, saveEnvironment, deleteEnvironment, mergeDisk };
}
