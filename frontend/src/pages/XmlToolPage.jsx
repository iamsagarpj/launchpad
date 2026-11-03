import { useState } from 'react';
import { formatXml, validateXml } from '../xml/xmlUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import TrashIcon from '../components/icons/TrashIcon.jsx';

function computeOutput(input, mode) {
  if (!input) {
    return { kind: 'empty' };
  }
  if (mode === 'validate') {
    const result = validateXml(input);
    return result.ok ? { kind: 'valid', text: '✓ Valid XML' } : { kind: 'invalid', text: `✗ Invalid XML: ${result.error}` };
  }
  const result = formatXml(input);
  return result.ok ? { kind: 'text', text: result.result } : { kind: 'error', text: result.error };
}

export default function XmlToolPage() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('format');

  const output = computeOutput(input, mode);

  function handleCopy() {
    if (output.kind === 'text') {
      navigator.clipboard.writeText(output.text);
    }
  }

  function handleClear() {
    setInput('');
  }

  return (
    <div className="json-viewer-page">
      <div className="jw-toolbar">
        <div className="jw-mode-group">
          <button className={`jw-mode-btn${mode === 'format' ? ' active' : ''}`} onClick={() => setMode('format')}>
            Format
          </button>
          <button className={`jw-mode-btn${mode === 'validate' ? ' active' : ''}`} onClick={() => setMode('validate')}>
            Validate
          </button>
        </div>
      </div>
      <div className="jw-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Document</span>
            <div className="jw-pane-actions">
              <button title="Clear" onClick={handleClear}>
                <TrashIcon />
              </button>
            </div>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste XML…"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Output</span>
            <div className="jw-pane-actions">
              {output.kind === 'text' && (
                <button title="Copy" onClick={handleCopy}>
                  <CopyIcon />
                </button>
              )}
            </div>
          </div>
          <div className="jw-pane-body">
            {output.kind === 'empty' && <div className="jw-output-placeholder">Paste XML in the Document pane.</div>}
            {output.kind === 'text' && <textarea className="b64-textarea" value={output.text} readOnly spellCheck={false} />}
            {output.kind === 'error' && (
              <div className="jw-output-message jw-output-error">Cannot format: {output.text}</div>
            )}
            {(output.kind === 'valid' || output.kind === 'invalid') && (
              <div className={`jw-output-message ${output.kind === 'valid' ? 'jw-output-valid' : 'jw-output-error'}`}>
                {output.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
