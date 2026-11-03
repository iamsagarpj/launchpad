import { useState, useEffect, useRef } from 'react';
import { useResources } from '../hooks/useResources.js';
import Sidebar from '../components/Sidebar.jsx';
import LogPanel from '../components/LogPanel.jsx';

// Must match server.js's AWS_LOGIN_RESOURCE / the Tiltfile's aws-creds local_resource name.
const AWS_LOGIN_RESOURCE = 'aws-creds';

export default function DashboardPage({ theme, onThemeChange }) {
  const { resources, online } = useResources();
  const [selectedName, setSelectedName] = useState(null);
  const [cardErrors, setCardErrors] = useState({});
  const [awsLoggingIn, setAwsLoggingIn] = useState(false);
  const triedAwsLoginRef = useRef(false);

  useEffect(() => {
    const awsCreds = resources.find((r) => r.name === AWS_LOGIN_RESOURCE);
    if (!awsCreds) {
      return;
    }
    if (awsCreds.status === 'error' && !triedAwsLoginRef.current) {
      // Once per page load, not once per 2s poll tick - aws sso login takes as long
      // as the user takes in the browser, so repeated triggers would just pop a new
      // browser tab every poll until they finish.
      triedAwsLoginRef.current = true;
      setAwsLoggingIn(true);
      fetch('/api/aws-login', { method: 'POST' }).catch(() => {});
    } else if (awsCreds.status === 'healthy') {
      setAwsLoggingIn(false);
    }
  }, [resources]);

  const selectedResource = resources.find((r) => r.name === selectedName) || null;

  useEffect(() => {
    setCardErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      resources.forEach((r) => {
        if (r.status === 'healthy' && next[r.name]) {
          next[r.name] = null;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [resources]);

  async function postAction(url) {
    const response = await fetch(url, { method: 'POST' });
    const body = await response.json();
    return { ok: response.ok, body };
  }

  async function handleToggle(name) {
    const { ok, body } = await postAction(`/api/toggle/${name}`);
    setCardErrors((prev) => ({ ...prev, [name]: ok ? null : body.error || 'toggle failed' }));
  }

  async function handleRecheck(name) {
    const { ok, body } = await postAction(`/api/trigger/${name}`);
    setCardErrors((prev) => ({ ...prev, [name]: ok ? null : body.error || 'trigger failed' }));
  }

  function applyBulkResults(body) {
    setCardErrors((prev) => {
      const next = { ...prev };
      (body.results || []).forEach((r) => {
        next[r.name] = r.ok ? null : r.error || 'failed';
      });
      return next;
    });
  }

  async function handleStartAll() {
    const { body } = await postAction('/api/start-all');
    applyBulkResults(body);
  }

  async function handleStopAll() {
    const { body } = await postAction('/api/stop-all');
    applyBulkResults(body);
  }

  return (
    <>
      {!online && <div className="banner">Tilt isn&apos;t running — start it with `tilt up`.</div>}
      {awsLoggingIn && (
        <div className="banner">
          AWS session expired — opening the SSO login in your browser. This banner clears once it completes.
        </div>
      )}
      <div className="layout">
        <Sidebar
          resources={resources}
          selectedName={selectedName}
          cardErrors={cardErrors}
          theme={theme}
          onThemeChange={onThemeChange}
          onSelect={setSelectedName}
          onToggle={handleToggle}
          onRecheck={handleRecheck}
          onStartAll={handleStartAll}
          onStopAll={handleStopAll}
        />
        <section className="detail-panel">
          <LogPanel resource={selectedResource} />
        </section>
      </div>
    </>
  );
}
