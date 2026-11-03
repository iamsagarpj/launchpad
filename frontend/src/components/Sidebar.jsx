import { useState } from 'react';
import ResourceRow from './ResourceRow.jsx';
import ServiceSetup from './ServiceSetup.jsx';
import { THEMES } from '../hooks/useTheme.js';

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

  function matches(resource) {
    return resource.name.toLowerCase().includes(filter.trim().toLowerCase());
  }

  const services = resources.filter((r) => r.section === 'services' && matches(r));
  const infra = resources.filter((r) => r.section !== 'services' && matches(r));

  function toggleSection(key) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside className="sidebar">
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
          <button type="button" className="register-repo" onClick={() => setSetupOpen(true)}>
            Register repo
          </button>
          {setupOpen && <ServiceSetup onClose={() => setSetupOpen(false)} />}
          <div className="resource-list">
            {services.map((resource) => (
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
    </aside>
  );
}
