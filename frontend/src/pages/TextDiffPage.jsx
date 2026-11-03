import { useState } from 'react';
import { diffLines, diffStats } from '../text-diff/textDiff.js';

export default function TextDiffPage() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');

  const entries = left || right ? diffLines(left, right) : [];
  const stats = diffStats(entries);

  return (
    <div className="tdv-root">
      <div className="jw-panes tdv-input-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Left</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={left}
              onChange={(event) => setLeft(event.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Right</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={right}
              onChange={(event) => setRight(event.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      </div>
      <div className="tdv-diff">
        <div className="tdv-diff-header">
          <span>Diff</span>
          <span className="jw-pane-meta">
            +{stats.added} -{stats.removed}
          </span>
        </div>
        <div className="tdv-diff-body">
          {entries.length === 0 && <div className="jw-output-placeholder">Paste text into both sides to compare.</div>}
          {entries.map((entry, index) => (
            <div className={`tdv-line tdv-line-${entry.type}`} key={index}>
              <span className="tdv-line-marker">{entry.type === 'added' ? '+' : entry.type === 'removed' ? '-' : ' '}</span>
              <span className="tdv-line-text">{entry.line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
