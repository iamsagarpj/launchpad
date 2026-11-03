import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOOLS } from '../tools/registry.js';
import { searchTools } from '../tools/searchTools.js';
import SearchIcon from './icons/SearchIcon.jsx';
import StarIcon from './icons/StarIcon.jsx';

export default function CommandPalette({ open, onClose, isFavorite, onNavigate }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const results = useMemo(() => searchTools(TOOLS, query), [query]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    setQuery('');
    setActiveIndex(0);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function handleSelect(tool) {
    onNavigate(tool);
    navigate(tool.path);
    onClose();
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (results[activeIndex]) {
        handleSelect(results[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      onClose();
    }
  }

  if (!open) {
    return null;
  }

  // Group the ranked results by category, preserving ranked order within
  // each group, and track a flat index across groups for arrow-key nav.
  const groups = [];
  const groupIndexByCategory = new Map();
  results.forEach((tool) => {
    if (!groupIndexByCategory.has(tool.category)) {
      groupIndexByCategory.set(tool.category, groups.length);
      groups.push({ category: tool.category, tools: [] });
    }
    groups[groupIndexByCategory.get(tool.category)].tools.push(tool);
  });

  let flatIndex = -1;

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div className="cmdk-panel" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cmdk-input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tools…"
            spellCheck={false}
            aria-label="Search tools"
          />
          <span className="cmdk-hint">Esc to close</span>
        </div>
        <div className="cmdk-results">
          {results.length === 0 && <div className="cmdk-empty">No tools match &quot;{query}&quot;</div>}
          {groups.map((group) => (
            <div className="cmdk-group" key={group.category}>
              <div className="cmdk-group-label">{group.category}</div>
              {group.tools.map((tool) => {
                flatIndex += 1;
                const index = flatIndex;
                const Icon = tool.Icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`cmdk-item${index === activeIndex ? ' active' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(tool)}
                  >
                    <Icon />
                    <span className="cmdk-item-label">{tool.label}</span>
                    <span className="cmdk-item-description">{tool.description}</span>
                    {isFavorite(tool.id) && <StarIcon filled />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
