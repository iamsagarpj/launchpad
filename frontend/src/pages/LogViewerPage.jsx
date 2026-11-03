import { useState } from 'react';
import { parseLogText, filterLogEntries } from '../log-viewer/logViewerUtils.js';

const LEVELS = ['all', 'error', 'warn', 'info', 'debug', 'trace', 'fatal'];

export default function LogViewerPage() {
  const [input, setInput] = useState('');
  const [level, setLevel] = useState('all');
  const [search, setSearch] = useState('');

  const entries = input ? parseLogText(input) : [];
  const filtered = filterLogEntries(entries, { level, search });

  return (
    <div className="log-page">
      <div className="log-toolbar">
        <select className="nav-theme-select" value={level} onChange={(event) => setLevel(event.target.value)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l === 'all' ? 'All levels' : l}
            </option>
          ))}
        </select>
        <input
          className="ts-input log-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search…"
          spellCheck={false}
        />
        <span className="jw-pane-meta">
          {filtered.length} / {entries.length} lines
        </span>
      </div>
      <div className="jw-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Paste logs</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder='{"level":"error","message":"boom"}'
              spellCheck={false}
            />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Parsed</span>
          </div>
          <div className="jw-pane-body log-entries">
            {filtered.length === 0 && <div className="jw-output-placeholder">No matching log lines.</div>}
            {filtered.map((entry, index) => (
              <div className={`log-entry log-entry-${entry.level || 'none'}`} key={index}>
                {entry.level && <span className="log-entry-level">{entry.level}</span>}
                <span className="log-entry-text">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
