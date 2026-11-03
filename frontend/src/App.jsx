import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import RemoteLogsPage from './pages/RemoteLogsPage.jsx';
import ToolsHubPage from './pages/ToolsHubPage.jsx';
import ToolLayout from './tools/ToolLayout.jsx';
import { TOOLS } from './tools/registry.js';
import { useTheme } from './hooks/useTheme.js';
import { useFavorites } from './hooks/useFavorites.js';
import { useRecentTools } from './hooks/useRecentTools.js';
import CloudIcon from './components/icons/CloudIcon.jsx';

const NAV_LINKS = [
  { path: '/', label: 'Dashboard' },
  { path: '/remote-logs', label: 'Remote Logs', icon: CloudIcon },
];

export default function App() {
  const [theme, setTheme] = useTheme();
  const favorites = useFavorites();
  const recents = useRecentTools();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    function handleKeyDown(event) {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const matched = TOOLS.find((tool) => tool.path === location.pathname);
    if (matched) {
      recents.recordRecent(matched.id);
    }
    // Only re-run when the route changes, not when recordRecent's identity
    // changes (it changes every render the recents list updates).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className="app-shell" data-theme={theme}>
      <Navbar
        links={NAV_LINKS}
        theme={theme}
        onThemeChange={setTheme}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isFavorite={favorites.isFavorite}
        onNavigate={(tool) => recents.recordRecent(tool.id)}
      />
      <Routes>
        <Route path="/" element={<DashboardPage theme={theme} onThemeChange={setTheme} />} />
        <Route path="/remote-logs" element={<RemoteLogsPage />} />
        <Route path="/json-viewer" element={<Navigate to="/tools/json" replace />} />
        <Route path="/tools" element={<ToolLayout favorites={favorites} />}>
          <Route index element={<ToolsHubPage favorites={favorites} recents={recents} />} />
          {TOOLS.map((tool) => (
            <Route key={tool.id} path={tool.id} element={<tool.Component />} />
          ))}
        </Route>
      </Routes>
    </div>
  );
}
