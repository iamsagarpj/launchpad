import { useEffect, useState } from 'react';

const TIME_RANGES = [5, 15, 30, 60];

function formatLine(event) {
  return `${new Date(event.timestamp).toISOString()}  ${event.message}`;
}

export default function RemoteLogsPage() {
  const [environments, setEnvironments] = useState([]);
  const [services, setServices] = useState([]);
  const [env, setEnv] = useState('');
  const [service, setService] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [events, setEvents] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/remote-logs/config')
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        const nextEnvironments = Array.isArray(body.environments) ? body.environments : [];
        const nextServices = Array.isArray(body.services) ? body.services : [];
        setEnvironments(nextEnvironments);
        setServices(nextServices);
        setEnv(nextEnvironments[0] ? nextEnvironments[0].id : '');
        setService(nextServices[0] ? nextServices[0].id : '');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load CloudWatch settings.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/remote-logs/${env}/${service}?minutes=${minutes}`);
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || 'Failed to load logs.');
        setEvents(null);
        setTruncated(false);
        return;
      }
      setEvents(body.events);
      setTruncated(body.truncated);
    } catch (err) {
      setError('Network error while fetching logs.');
      setEvents(null);
      setTruncated(false);
    } finally {
      setLoading(false);
    }
  }

  let bodyContent;
  if (events === null) {
    bodyContent = 'Select an environment and service, then click Load Logs.';
  } else if (events.length === 0) {
    bodyContent = 'No log events in this time range.';
  } else {
    bodyContent = events.map(formatLine).join('\n');
  }

  return (
    <div className="remote-logs-page">
      <div className="remote-logs-header">
        <h2>Remote Logs</h2>
        <p>View recent CloudWatch logs for the environments in data/cloudwatch.json. Nothing auto-refreshes.</p>
      </div>
      {environments.length === 0 || services.length === 0 ? (
        <p className="remote-logs-error">Copy data/cloudwatch.example.json to data/cloudwatch.json and add your AWS profile and log groups.</p>
      ) : null}
      <div className="remote-logs-toolbar">
        <select value={env} onChange={(event) => setEnv(event.target.value)}>
          {environments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <select value={service} onChange={(event) => setService(event.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          {TIME_RANGES.map((m) => (
            <option key={m} value={m}>
              Last {m} min
            </option>
          ))}
        </select>
        <button onClick={handleLoad} disabled={loading || !env || !service}>
          {loading ? 'Loading…' : 'Load Logs'}
        </button>
      </div>
      {error && <div className="remote-logs-error">{error}</div>}
      {truncated && (
        <div className="remote-logs-truncated-note">
          Showing the first {events.length} events in this window — narrow the time range for a more complete
          picture.
        </div>
      )}
      <pre className="remote-logs-body">{bodyContent}</pre>
    </div>
  );
}
