import { Link } from 'react-router-dom';
import { TOOLS } from '../tools/registry.js';
import StarIcon from '../components/icons/StarIcon.jsx';

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

function ToolCard({ tool, favorites }) {
  const Icon = tool.Icon;
  const favorite = favorites.isFavorite(tool.id);
  return (
    <div className="tool-card">
      <Link to={tool.path} className="tool-card-link">
        <div className="tool-card-icon">
          <Icon />
        </div>
        <div className="tool-card-label">{tool.label}</div>
        <div className="tool-card-description">{tool.description}</div>
      </Link>
      <button
        type="button"
        className={`tool-card-favorite${favorite ? ' active' : ''}`}
        onClick={() => favorites.toggleFavorite(tool.id)}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <StarIcon filled={favorite} />
      </button>
    </div>
  );
}

export default function ToolsHubPage({ favorites, recents }) {
  const groups = groupByCategory(TOOLS);
  const favoriteTools = TOOLS.filter((tool) => favorites.isFavorite(tool.id));
  const recentTools = recents.recentIds.map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean);

  return (
    <div className="tools-hub">
      <h2>Developer Tools</h2>
      <p>Handy utilities for local development and testing.</p>

      {favoriteTools.length > 0 && (
        <section className="tools-hub-section">
          <h3>Favorites</h3>
          <div className="tools-hub-grid">
            {favoriteTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} favorites={favorites} />
            ))}
          </div>
        </section>
      )}

      {recentTools.length > 0 && (
        <section className="tools-hub-section">
          <h3>Recently Used</h3>
          <div className="tools-hub-grid">
            {recentTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} favorites={favorites} />
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section className="tools-hub-section" key={group.category}>
          <h3>{group.category}</h3>
          <div className="tools-hub-grid">
            {group.tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} favorites={favorites} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
