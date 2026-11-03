import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { TOOLS } from './registry.js';
import StarIcon from '../components/icons/StarIcon.jsx';
import SidebarToggleIcon from '../components/icons/SidebarToggleIcon.jsx';

const RAIL_STORAGE_KEY = 'launchpad-tools-rail-hidden';

function readRailHidden() {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function groupByCategory(tools) {
  const groups = [];
  const indexByCategory = new Map();
  tools.forEach((tool) => {
    if (!indexByCategory.has(tool.category)) {
      indexByCategory.set(tool.category, groups.length);
      groups.push({ category: tool.category, tools: [] });
    }
    groups[indexByCategory.get(tool.category)].tools.push(tool);
  });
  return groups;
}

export default function ToolLayout({ favorites }) {
  const location = useLocation();
  const groups = groupByCategory(TOOLS);
  const [railHidden, setRailHidden] = useState(readRailHidden);

  function toggleRail() {
    setRailHidden((current) => {
      const next = !current;
      try {
        localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Preference still applies for this visit when storage is blocked.
      }
      return next;
    });
  }

  const railLabel = railHidden ? 'Show tools sidebar' : 'Hide tools sidebar';

  return (
    <div className="tool-layout">
      <aside className={`tool-rail${railHidden ? ' collapsed' : ''}`}>
        <div className="tool-rail-head">
          {!railHidden && (
            <Link to="/tools" className={`tool-rail-all${location.pathname === '/tools' ? ' active' : ''}`}>
              ⊞ View all tools
            </Link>
          )}
          <button
            type="button"
            className="tool-rail-toggle"
            onClick={toggleRail}
            title={railLabel}
            aria-label={railLabel}
            aria-expanded={!railHidden}
          >
            <SidebarToggleIcon collapsed={railHidden} />
          </button>
        </div>
        {!railHidden && groups.map((group) => (
          <div className="tool-rail-group" key={group.category}>
            <div className="tool-rail-group-label">{group.category}</div>
            {group.tools.map((tool) => {
              const Icon = tool.Icon;
              return (
                <div className="tool-rail-row" key={tool.id}>
                  <Link
                    to={tool.path}
                    className={`tool-rail-link${location.pathname === tool.path ? ' active' : ''}`}
                  >
                    <Icon />
                    {tool.label}
                  </Link>
                  <button
                    type="button"
                    className={`tool-rail-favorite${favorites.isFavorite(tool.id) ? ' active' : ''}`}
                    onClick={() => favorites.toggleFavorite(tool.id)}
                    title={favorites.isFavorite(tool.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <StarIcon filled={favorites.isFavorite(tool.id)} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </aside>
      <div className="tool-content">
        <Outlet />
      </div>
    </div>
  );
}
