import { useState } from 'react';
import MonacoJsonEditor from './MonacoJsonEditor.jsx';
import { diffJson } from './jsonDiff.js';

function typeLabel(type) {
  if (type === 'added') return '+ added';
  if (type === 'removed') return '- removed';
  return '~ changed';
}

function renderValuePreview(value) {
  if (value === undefined) return '—';
  if (typeof value === 'string') return `"${value}"`;
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function JsonCompareView() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');

  const diffResult = left.trim() && right.trim() ? diffJson(left, right) : null;

  return (
    <div className="jcv-root">
      <div className="jw-panes jcv-input-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Left</span>
          </div>
          <div className="jw-pane-body">
            <MonacoJsonEditor value={left} onChange={setLeft} theme="vs" />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Right</span>
          </div>
          <div className="jw-pane-body">
            <MonacoJsonEditor value={right} onChange={setRight} theme="vs" />
          </div>
        </div>
      </div>
      <div className="jcv-diff">
        <div className="jcv-diff-header">
          <span>Differences</span>
          {diffResult?.ok && <span className="jw-pane-meta">{diffResult.diffs.length}</span>}
        </div>
        <div className="jcv-diff-body">
          {!diffResult && (
            <div className="jw-output-placeholder">Paste JSON into both Left and Right to compare.</div>
          )}
          {diffResult && !diffResult.ok && <div className="jw-output-message jw-output-error">{diffResult.error}</div>}
          {diffResult?.ok && diffResult.diffs.length === 0 && (
            <div className="jw-output-message jw-output-valid">✓ No differences</div>
          )}
          {diffResult?.ok &&
            diffResult.diffs.length > 0 &&
            diffResult.diffs.map((entry) => (
              <div className={`jcv-diff-row jcv-diff-${entry.type}`} key={entry.path}>
                <span className="jcv-diff-type">{typeLabel(entry.type)}</span>
                <span className="jcv-diff-path">{entry.path}</span>
                {entry.type !== 'added' && (
                  <span className="jcv-diff-value jcv-diff-left">{renderValuePreview(entry.left)}</span>
                )}
                {entry.type !== 'removed' && (
                  <span className="jcv-diff-value jcv-diff-right">{renderValuePreview(entry.right)}</span>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
