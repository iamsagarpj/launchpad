import { Link, useLocation } from 'react-router-dom';
import LaunchpadMark from './icons/LaunchpadMark.jsx';
import SearchIcon from './icons/SearchIcon.jsx';
import { THEMES } from '../hooks/useTheme.js';

export default function Navbar({ links, theme, onThemeChange, onOpenSearch }) {
  const location = useLocation();
  const toolsActive = location.pathname.startsWith('/tools') || location.pathname === '/json-viewer';

  return (
    <header className="header">
      <div className="brand">
        <div className="monogram">
          <LaunchpadMark />
        </div>
        <h1>Launchpad</h1>
      </div>
      <nav className="nav-links">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`nav-link${location.pathname === link.path ? ' active' : ''}`}
            >
              {Icon && <Icon />}
              {link.label}
            </Link>
          );
        })}
        <Link to="/tools" className={`nav-link${toolsActive ? ' active' : ''}`}>
          Tools
        </Link>
      </nav>
      <div className="nav-actions">
        <button type="button" className="nav-search-btn" onClick={onOpenSearch} title="Search tools">
          <SearchIcon />
          <span className="nav-search-hint">⌘K</span>
        </button>
        <select
          className="nav-theme-select"
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
        <a className="tilt-link" href="http://localhost:10350" target="_blank" rel="noopener">
          Open native Tilt UI ↗
        </a>
      </div>
    </header>
  );
}
