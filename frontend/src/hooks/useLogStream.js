import { useState, useEffect, useRef } from 'react';

export function useLogStream(name) {
  const [lines, setLines] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!name) {
      return undefined;
    }
    setLines([]);
    let active = true;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${window.location.host}/ws/logs/${name}`);
    socketRef.current = socket;

    socket.addEventListener('message', (event) => {
      if (!active) {
        return;
      }
      setLines((prev) => [...prev, event.data]);
    });
    socket.addEventListener('close', () => {
      if (!active) {
        return;
      }
      setLines((prev) => [...prev, '[service stopped]']);
    });

    return () => {
      active = false;
      socket.close();
      socketRef.current = null;
    };
  }, [name]);

  return lines;
}
