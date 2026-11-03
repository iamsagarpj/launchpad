import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const EMPTY_FORM = {
  name: '',
  path: '',
  command: '',
  port: '',
  section: 'backend',
  framework: '',
  needsAws: false,
};

export default function ServiceSetup({ onClose }) {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/services')
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setServices(body.services || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load registered repos.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function loadService(service) {
    setEditing(true);
    setError('');
    setNotice('');
    setForm({
      name: service.name,
      path: service.path,
      command: service.command,
      port: service.port == null ? '' : String(service.port),
      section: service.section,
      framework: service.framework || '',
      needsAws: service.needsAws,
    });
  }

  function applyDetected(body, keepName) {
    setForm((current) => ({
      ...current,
      path: body.path,
      name: keepName ? current.name : body.name || '',
      command: body.command || '',
      port: body.port == null ? '' : String(body.port),
      section: body.section || 'backend',
      framework: body.framework || '',
    }));
    if (!body.command) {
      setError('This folder has no obvious start command. Enter the command that runs it.');
    }
  }

  async function chooseFolder() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/services/pick', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || 'Could not open the folder picker.');
        return;
      }
      if (body.cancelled) return;
      applyDetected(body, editing);
    } catch (err) {
      setError('Could not open the folder picker.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const payload = {
      name: form.name,
      path: form.path,
      command: form.command,
      port: form.port,
      section: form.section,
      framework: form.framework,
      needsAws: form.needsAws,
    };
    try {
      const response = await fetch(editing ? `/api/services/${encodeURIComponent(form.name)}` : '/api/services', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || 'Could not save this repo.');
        return;
      }
      setServices((current) => {
        const next = current.filter((service) => service.name !== body.service.name);
        next.push(body.service);
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setEditing(false);
      setForm(EMPTY_FORM);
      setNotice('Saved. It joins the Services list, and Start All runs it with the others. Click it to read its logs.');
    } catch (err) {
      setError('Could not save this repo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(service) {
    if (!window.confirm(`Remove ${service.name} from Launchpad? The repo on disk stays.`)) return;
    setError('');
    setNotice('');
    const response = await fetch(`/api/services/${encodeURIComponent(service.name)}`, { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Could not remove this repo.');
      return;
    }
    setServices((current) => current.filter((item) => item.name !== service.name));
    if (form.name === service.name) {
      setEditing(false);
      setForm(EMPTY_FORM);
    }
  }

  const detailsOpen = Boolean(form.path);

  return createPortal(
    <div className="svc-backdrop" onClick={onClose}>
      <form className="svc-dialog" onClick={(event) => event.stopPropagation()} onSubmit={save}>
        <div className="svc-dialog-header">
          <h2>Register a repo</h2>
          <button type="button" className="svc-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="svc-help">
          Choose the folder. Launchpad fills the kind, start command, and port from that repo. Change any of those before saving, or open a saved repo below to edit it later.
        </p>
        <button type="button" className="svc-choose" onClick={chooseFolder} disabled={busy}>
          {busy ? 'Waiting for the folder…' : detailsOpen ? 'Change folder' : 'Choose folder'}
        </button>
        {detailsOpen && (
          <>
            <label className="svc-field">
              Folder
              <input value={form.path} readOnly />
            </label>
            <label className="svc-field">
              Name
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="api" disabled={editing} />
            </label>
            <label className="svc-field">
              Start command
              <input value={form.command} onChange={(event) => updateField('command', event.target.value)} placeholder="npm run dev" />
            </label>
            <div className="svc-split">
              <label className="svc-field">
                Port
                <input value={form.port} onChange={(event) => updateField('port', event.target.value)} placeholder="Detected when the repo has one" inputMode="numeric" />
              </label>
              <label className="svc-field">
                Group
                <select value={form.section} onChange={(event) => updateField('section', event.target.value)}>
                  <option value="backend">Backend</option>
                  <option value="frontend">Frontend</option>
                </select>
              </label>
            </div>
            <label className="svc-field">
              Stack
              <input value={form.framework} onChange={(event) => updateField('framework', event.target.value)} placeholder="go, rails, dotnet" />
            </label>
            <label className="svc-check">
              <input type="checkbox" checked={form.needsAws} onChange={(event) => updateField('needsAws', event.target.checked)} />
              Wait for the aws-creds check before starting
            </label>
          </>
        )}
        {error && <p className="svc-error">{error}</p>}
        {notice && <p className="svc-notice">{notice}</p>}
        {detailsOpen && (
          <div className="svc-actions">
            <button type="submit" className="svc-save" disabled={busy}>
              {editing ? 'Update repo' : 'Save repo'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setForm(EMPTY_FORM);
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        )}
        <ul className="svc-list">
          {services.length === 0 && <li className="svc-empty">No extra repos yet.</li>}
          {services.map((service) => (
            <li key={service.name}>
              <button type="button" className="svc-item" onClick={() => loadService(service)}>
                <strong>{service.name}</strong>
                <span>{service.path}</span>
                <span>
                  {service.section} · {service.command}
                  {service.port ? ` · ${service.port}` : ''}
                  {service.needsAws ? ' · AWS' : ''}
                </span>
              </button>
              <button type="button" className="svc-remove" onClick={() => remove(service)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </form>
    </div>,
    document.querySelector('.app-shell') || document.body
  );
}
