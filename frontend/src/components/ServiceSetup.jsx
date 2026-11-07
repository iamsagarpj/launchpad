import { useEffect, useRef, useState } from 'react';
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

export default function ServiceSetup({ onClose, editName, onChanged }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [readmeServices, setReadmeServices] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [hint, setHint] = useState('');
  const [justSaved, setJustSaved] = useState([]);
  const [closeWhenRunning, setCloseWhenRunning] = useState([]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!closeWhenRunning.length) return undefined;
    let cancelled = false;

    async function check() {
      try {
        const response = await fetch('/api/resources');
        if (!response.ok || cancelled) return;
        const body = await response.json();
        const list = body.resources || [];
        const started = closeWhenRunning.every((name) => {
          const resource = list.find((item) => item.name === name);
          return resource && resource.status === 'healthy';
        });
        if (started && !cancelled) onCloseRef.current();
      } catch (err) {
        // Leave the dialog open until this service is actually running.
      }
    }

    check();
    const timer = setInterval(check, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [closeWhenRunning]);

  useEffect(() => {
    if (!editName) return undefined;
    let cancelled = false;
    fetch('/api/services')
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        const found = (body.services || []).find((service) => service.name === editName);
        if (found) loadService(found);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load registered repos.');
      });
    return () => {
      cancelled = true;
    };
  }, [editName]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function rememberSuggestions(body) {
    setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
    setHint(body.hint || '');
  }

  function loadService(service) {
    setEditing(true);
    setError('');
    setNotice('');
    setSuggestions([]);
    setHint('');
    setForm({
      name: service.name,
      path: service.path,
      command: service.command,
      port: service.port == null ? '' : String(service.port),
      section: service.section,
      framework: service.framework || '',
      needsAws: service.needsAws,
    });
    fetch('/api/services/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: service.path }),
    })
      .then((response) => response.json())
      .then((body) => {
        if (body && !body.error) rememberSuggestions(body);
      })
      .catch(() => {});
  }

  function applySuggestion(item) {
    const match = item.command.match(/--port(?:=|\s+)(\d+)|--web-port(?:=|\s+)(\d+)|--port=(\d+)|runserver\s+(\d+)|-p\s+(\d+)|http\.server\s+(\d+)/);
    const port = match && match.slice(1).find(Boolean);
    setForm((current) => ({
      ...current,
      command: item.command,
      port: port || current.port,
    }));
  }

  function applyDetected(body, keepName) {
    const listed = Array.isArray(body.services) && body.services.length > 1 ? body.services : [];
    setReadmeServices(listed);
    rememberSuggestions(body);
    setForm((current) => ({
      ...current,
      path: body.path,
      name: keepName ? current.name : body.name || '',
      command: body.command || '',
      port: body.port == null ? '' : String(body.port),
      section: body.section || 'backend',
      framework: body.framework || '',
      needsAws: body.fromReadme && body.needsAws != null ? Boolean(body.needsAws) : current.needsAws,
    }));
    if (body.fromReadme && listed.length > 1) {
      setNotice(`README.md lists ${listed.length} services. Save this one, or register all of them.`);
    } else if (body.fromReadme) {
      setNotice('Filled from the launchpad block in README.md. Change anything before saving.');
    }
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
    setNotice(
      ['fastapi', 'flask', 'django', 'python'].includes(form.framework)
        ? 'Creating a virtualenv for this service and installing requirements.txt.'
        : ''
    );
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
      setJustSaved([body.service]);
      setEditing(false);
      setForm(EMPTY_FORM);
      setReadmeServices([]);
      if (body.pythonEnv) {
        const packages = body.pythonEnv.requirements ? ' Installed requirements.txt.' : '';
        setNotice(`Saved with Python ${body.pythonEnv.version} in ${body.pythonEnv.venvDir}.${packages}`);
      } else {
        setNotice('Saved. It joins the Services list, and Start All runs it with the others. Click it to read its logs.');
      }
      setCloseWhenRunning([body.service.name]);
      if (onChanged) onChanged();
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
    setJustSaved((current) => current.filter((item) => item.name !== service.name));
    setCloseWhenRunning((current) => current.filter((name) => name !== service.name));
    if (onChanged) onChanged();
    if (form.name === service.name) {
      setEditing(false);
      setForm(EMPTY_FORM);
      setReadmeServices([]);
    }
  }

  async function saveReadmeServices() {
    const ready = readmeServices.filter((service) => service.command && !service.error);
    if (!ready.length) {
      setError('The README block has no service with a start command.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const saved = [];
    try {
      for (const service of ready) {
        const response = await fetch('/api/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: service.name,
            path: service.path,
            command: service.command,
            port: service.port == null ? '' : service.port,
            section: service.section,
            framework: service.framework,
            needsAws: Boolean(service.needsAws),
          }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error || `Could not save ${service.name}.`);
          break;
        }
        saved.push(body.service);
      }
    } catch (err) {
      setError('Could not save the services from README.md.');
    } finally {
      setBusy(false);
    }
    if (!saved.length) return;
    setJustSaved(saved);
    setReadmeServices([]);
    setForm(EMPTY_FORM);
    setNotice(`Registered ${saved.length} ${saved.length === 1 ? 'service' : 'services'} from README.md.`);
    if (saved.length === ready.length) {
      setCloseWhenRunning(saved.map((service) => service.name));
    }
    if (onChanged) onChanged();
  }

  const detailsOpen = Boolean(form.path);

  return createPortal(
    <div className="svc-backdrop" onClick={onClose}>
      <form className="svc-dialog" onClick={(event) => event.stopPropagation()} onSubmit={save}>
        <div className="svc-dialog-header">
          <h2>{editing ? 'Edit repo' : 'Register a repo'}</h2>
          <button type="button" className="svc-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="svc-help">
          Choose the folder. Launchpad names the language and stack, then lists the start commands it supports for that stack. Click one to fill the command. A <code>launchpad</code> block in README.md is used when the repo has one.
        </p>
        <button type="button" className="svc-choose" onClick={chooseFolder} disabled={busy}>
          {busy ? 'Waiting for the folder…' : detailsOpen ? 'Change folder' : 'Choose folder'}
        </button>
        {detailsOpen && (
          <>
            <label className="svc-field">
              Folder
              <input value={form.path} onChange={(event) => updateField('path', event.target.value)} placeholder="/path/to/the/repo" />
            </label>
            <label className="svc-field">
              Name
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="api" disabled={editing} />
            </label>
            <label className="svc-field">
              Start command
              <input value={form.command} onChange={(event) => updateField('command', event.target.value)} placeholder="npm run dev" />
            </label>
            {(hint || suggestions.length > 0) && (
              <div className="svc-suggestions">
                {hint && <p className="svc-help">{hint}</p>}
                {suggestions.map((item) => (
                  <button
                    key={item.command}
                    type="button"
                    className={`svc-suggestion${form.command === item.command ? ' is-selected' : ''}`}
                    onClick={() => applySuggestion(item)}
                  >
                    <span>{item.label}</span>
                    <code>{item.command}</code>
                  </button>
                ))}
              </div>
            )}
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
            {readmeServices.length > 1 && (
              <button type="button" onClick={saveReadmeServices} disabled={busy}>
                Register all from README
              </button>
            )}
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
        {justSaved.length > 0 && (
          <ul className="svc-list">
            {justSaved.map((service) => (
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
        )}
      </form>
    </div>,
    document.querySelector('.app-shell') || document.body
  );
}
