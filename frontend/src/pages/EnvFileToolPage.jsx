import { useState } from 'react';
import { diffEnvFiles } from '../env-file/envFileUtils.js';

function typeLabel(type) {
  if (type === 'added') return '+ added';
  if (type === 'removed') return '- removed';
  return '~ changed';
}

export default function EnvFileToolPage() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');

  const diffs = left.trim() && right.trim() ? diffEnvFiles(left, right) : null;

  return (
    <div className="jcv-root">
      <div className="jw-panes jcv-input-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Left .env</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={left}
              onChange={(event) => setLeft(event.target.value)}
              placeholder="PORT=4040"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Right .env</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={right}
              onChange={(event) => setRight(event.target.value)}
              placeholder="PORT=5050"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
      <div className="jcv-diff">
        <div className="jcv-diff-header">
          <span>Differences</span>
          {diffs && <span className="jw-pane-meta">{diffs.length}</span>}
        </div>
        <div className="jcv-diff-body">
          {!diffs && <div className="jw-output-placeholder">Paste two .env files to compare.</div>}
          {diffs && diffs.length === 0 && <div className="jw-output-message jw-output-valid">✓ No differences</div>}
          {diffs &&
            diffs.map((entry) => (
              <div className={`jcv-diff-row jcv-diff-${entry.type}`} key={entry.key}>
                <span className="jcv-diff-type">{typeLabel(entry.type)}</span>
                <span className="jcv-diff-path">{entry.key}</span>
                {entry.type !== 'added' && <span className="jcv-diff-value jcv-diff-left">{entry.left}</span>}
                {entry.type !== 'removed' && <span className="jcv-diff-value jcv-diff-right">{entry.right}</span>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
