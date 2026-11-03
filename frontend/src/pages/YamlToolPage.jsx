import { useState } from 'react';
import { yamlToJson, jsonToYaml, formatYaml } from '../yaml/yamlUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';

const MODES = [
  { id: 'format', label: 'Format YAML' },
  { id: 'to-json', label: 'YAML → JSON' },
  { id: 'to-yaml', label: 'JSON → YAML' },
];

function computeOutput(mode, input) {
  if (!input.trim()) {
    return { ok: true, result: '' };
  }
  if (mode === 'format') return formatYaml(input);
  if (mode === 'to-json') return yamlToJson(input);
  return jsonToYaml(input);
}

export default function YamlToolPage() {
  const [mode, setMode] = useState('format');
  const [input, setInput] = useState('');

  const output = computeOutput(mode, input);

  function handleCopy() {
    if (output.ok) {
      navigator.clipboard.writeText(output.result);
    }
  }

  return (
    <div className="json-viewer-page">
      <div className="jw-toolbar">
        <div className="jw-mode-group">
          {MODES.map((m) => (
            <button key={m.id} className={`jw-mode-btn${mode === m.id ? ' active' : ''}`} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="jw-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">{mode === 'to-yaml' ? 'JSON' : 'YAML'}</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={mode === 'to-yaml' ? '{"name":"Launchpad"}' : 'name: Launchpad'}
              spellCheck={false}
            />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">{mode === 'to-json' ? 'JSON' : 'YAML'}</span>
            <div className="jw-pane-actions">
              {output.ok && output.result && (
                <button title="Copy" onClick={handleCopy}>
                  <CopyIcon />
                </button>
              )}
            </div>
          </div>
          <div className="jw-pane-body">
            {output.ok ? (
              <textarea className="b64-textarea" value={output.result} readOnly spellCheck={false} />
            ) : (
              <div className="jw-output-message jw-output-error">{output.error}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
