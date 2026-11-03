import { useState, useEffect } from 'react';
import { sortResources } from '../utils.js';

export function useResources() {
  const [resources, setResources] = useState([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch('/api/resources');
        if (!response.ok) {
          throw new Error('not ok');
        }
        const data = await response.json();
        if (!cancelled) {
          setResources(sortResources(data.resources));
          setOnline(true);
        }
      } catch (err) {
        if (!cancelled) {
          setOnline(false);
        }
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { resources, online };
}
