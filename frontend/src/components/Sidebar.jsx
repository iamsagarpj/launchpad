import { useEffect, useRef, useState } from 'react';
import ResourceRow from './ResourceRow.jsx';
import ServiceSetup from './ServiceSetup.jsx';
import { THEMES } from '../hooks/useTheme.js';

const HIDDEN_KEY = 'launchpad-hidden-services';
const WIDTH_KEY = 'launchpad-sidebar-width';
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

function readWidth() {
  const stored = Number(localStorage.getItem(WIDTH_KEY));
  return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
}

function readHidden() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeHidden(names) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...names]));
}

export default function Sidebar({
  resources,
  selectedName,
  cardErrors,
  theme,
  onThemeChange,
  onSelect,
  onToggle,
  onRecheck,
  onStartAll,
  onStopAll,
}) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState({ services: false, infra: false });
  const [setupOpen, setSetupOpen] = useState(false);
  const [editName, setEditName] = useState(null);
  const [registered, setRegistered] = useState([]);
  const [hidden, setHidden] = useState(() => readHidden());
  const [menuName, setMenuName] = useState(null);
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef(null);
  const widthRef = useRef(width);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/services')
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setRegistered(body.services || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [setupOpen]);

  function reloadRegistered() {
    fetch('/api/services')
      .then((response) => response.json())
      .then((body) => setRegistered(body.services || []))
      .catch(() => {});
  }

  function matches(resource) {
    return resource.name.toLowerCase().includes(filter.trim().toLowerCase());
  }

  const registeredByName = new Map(registered.map((service) => [service.name, service]));
  const services = resources.filter((r) => r.section === 'services' && matches(r) && !hidden.has(r.name));
  const infra = resources.filter((r) => r.section !== 'services' && matches(r));

  function toggleSection(key) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function hideService(name) {
    setHidden((current) => {
      const next = new Set(current);
      next.add(name);
      writeHidden(next);
      return next;
    });
  }

  function showHidden() {
    setHidden(new Set());
    localStorage.removeItem(HIDDEN_KEY);
  }

  function handleResizeMouseDown(event) {
    event.preventDefault();
    setDragging(true);
    const parent = asideRef.current?.parentElement;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(moveEvent) {
      if (!asideRef.current || !parent) return;
      const parentRect = parent.getBoundingClientRect();
      const left = asideRef.current.getBoundingClientRect().left;
      const max = Math.min(MAX_WIDTH, parentRect.right - left - 280);
      const next = Math.min(Math.max(moveEvent.clientX - left, MIN_WIDTH), Math.max(MIN_WIDTH, max));
      widthRef.current = next;
      setWidth(next);
    }

    function onUp() {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  async function removeService(resource, saved) {
    setMenuName(null);
    if (!saved) {
      if (!window.confirm(`Remove ${resource.name} from this list? It keeps running. Show hidden brings it back.`)) return;
      hideService(resource.name);
      return;
    }
    if (!window.confirm(`Remove ${saved.name} from Launchpad? The repo on disk stays.`)) return;
    const response = await fetch(`/api/services/${encodeURIComponent(saved.name)}`, { method: 'DELETE' });
    if (!response.ok) return;
    setRegistered((current) => current.filter((service) => service.name !== saved.name));
  }

  return (
    <>
    <aside className="sidebar" ref={asideRef} style={{ width }}>
      <div className="sidebar-toolbar">
        <input
          className="sidebar-search"
          type="text"
          placeholder="Filter services…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <select
          className="sidebar-theme-select"
          value={theme}
          onChange={(event) => onThemeChange(event.target.value)}
          title="Theme"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar-scroll">
      <div className="section-header" onClick={() => toggleSection('services')}>
        <h2>
          <span className={`section-chevron${collapsed.services ? ' collapsed' : ''}`}>▾</span>
          Services
        </h2>
      </div>
      {!collapsed.services && (
        <>
          <div className="section-actions">
            <button className="action-start" onClick={onStartAll}>
              ▶ Start All
            </button>
            <button className="action-stop" onClick={onStopAll}>
              ■ Stop All
            </button>
          </div>
          <button
            type="button"
            className="register-repo"
            onClick={() => {
              setEditName(null);
              setSetupOpen(true);
            }}
          >
            Register repo
          </button>
          {hidden.size > 0 && (
            <button type="button" className="register-repo" onClick={showHidden}>
              Show hidden ({hidden.size})
            </button>
          )}
          {setupOpen && (
            <ServiceSetup
              editName={editName}
              onChanged={reloadRegistered}
              onClose={() => {
                setSetupOpen(false);
                setEditName(null);
              }}
            />
          )}
          <div className="resource-list">
            {services.map((resource) => (
              <ResourceRow
                key={resource.name}
                resource={resource}
                registered={registeredByName.get(resource.name)}
                selected={resource.name === selectedName}
                error={cardErrors[resource.name]}
                menuOpen={menuName === resource.name}
                onMenuToggle={() => setMenuName((current) => (current === resource.name ? null : resource.name))}
                onSelect={onSelect}
                onToggle={onToggle}
                onRecheck={onRecheck}
                onEdit={(service) => {
                  setMenuName(null);
                  setEditName(service.name);
                  setSetupOpen(true);
                }}
                onRemove={removeService}
              />
            ))}
          </div>
        </>
      )}

      <div className="section-header" onClick={() => toggleSection('infra')}>
        <h2>
          <span className={`section-chevron${collapsed.infra ? ' collapsed' : ''}`}>▾</span>
          Infrastructure
        </h2>
      </div>
      {!collapsed.infra && (
        <div className="resource-list">
          {infra.map((resource) => (
            <ResourceRow
              key={resource.name}
              resource={resource}
              selected={resource.name === selectedName}
              error={cardErrors[resource.name]}
              onSelect={onSelect}
              onToggle={onToggle}
              onRecheck={onRecheck}
            />
          ))}
        </div>
      )}
      </div>
    </aside>
    <div
      className={`sidebar-resizer${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      title="Drag to resize"
      onMouseDown={handleResizeMouseDown}
    >
      <div className="sidebar-resizer-grip" />
    </div>
    </>
  );
}
