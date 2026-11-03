import { useEffect, useRef, useState } from 'react';
import { useLogStream } from '../hooks/useLogStream.js';
import { parseLogLine } from '../log-viewer/logViewerUtils.js';
import { parsePort } from '../utils.js';

// fatal folds into the same red as error; debug/trace are left unstyled (not
// requested, and too noisy in services that log at debug level by default).
const LEVEL_CLASS = {
  error: 'log-line-error',
  fatal: 'log-line-error',
  warn: 'log-line-warn',
  info: 'log-line-info',
};

const FONT_SIZE_KEY = 'launchpad-log-font-size';
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 16;

export default function LogPanel({ resource }) {
  const lines = useLogStream(resource ? resource.name : null);
  const bodyRef = useRef(null);
  const [fontSize, setFontSize] = useState(() => {
    const stored = Number(localStorage.getItem(FONT_SIZE_KEY));
    return stored >= MIN_FONT_SIZE && stored <= MAX_FONT_SIZE ? stored : DEFAULT_FONT_SIZE;
  });

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines]);

  if (!resource) {
    return <div className="detail-placeholder">Select a service to view logs</div>;
  }

  const port = resource.links.length > 0 ? parsePort(resource.links[0].url) : null;

  function adjustFontSize(delta) {
    setFontSize((prev) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta)));
  }

  return (
    <div className="detail-content">
      <div className="log-title-bar">
        <span className="log-title-text">
          {resource.name}
          {port ? ` · :${port}` : ''}
        </span>
        <div className="log-font-controls">
          <button
            className="log-font-btn"
            onClick={() => adjustFontSize(-2)}
            disabled={fontSize <= MIN_FONT_SIZE}
            title="Decrease log font size"
          >
            A−
          </button>
          <button
            className="log-font-btn"
            onClick={() => adjustFontSize(2)}
            disabled={fontSize >= MAX_FONT_SIZE}
            title="Increase log font size"
          >
            A+
          </button>
        </div>
      </div>
      <div className="log-panel-body" style={{ fontSize: `${fontSize}px` }} ref={bodyRef}>
        {lines.map((line, index) => {
          const cls = LEVEL_CLASS[parseLogLine(line)?.level] || '';
          return (
            <div key={index} className={`log-line${cls ? ` ${cls}` : ''}`}>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}
