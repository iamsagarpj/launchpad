import { useState } from 'react';
import { jsonToCsv, csvToJson } from './jsonCsv.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';

function computeOutput(direction, input) {
  if (!input.trim()) {
    return { ok: true, result: '' };
  }
  return direction === 'json-to-csv' ? jsonToCsv(input) : csvToJson(input);
}

export default function JsonCsvView() {
  const [direction, setDirection] = useState('json-to-csv');
  const [input, setInput] = useState('');

  const output = computeOutput(direction, input);

  function handleCopy() {
    if (output.ok) {
      navigator.clipboard.writeText(output.result);
    }
  }

  return (
    <div className="jw-panes">
      <div className="jw-pane">
        <div className="jw-pane-header">
          <span className="jw-pane-label">{direction === 'json-to-csv' ? 'JSON' : 'CSV'}</span>
          <div className="jw-pane-actions">
            <div className="b64-direction-group">
              <button
                className={`b64-direction-btn${direction === 'json-to-csv' ? ' active' : ''}`}
                onClick={() => setDirection('json-to-csv')}
              >
                JSON → CSV
              </button>
              <button
                className={`b64-direction-btn${direction === 'csv-to-json' ? ' active' : ''}`}
                onClick={() => setDirection('csv-to-json')}
              >
                CSV → JSON
              </button>
            </div>
          </div>
        </div>
        <div className="jw-pane-body">
          <textarea
            className="b64-textarea"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={direction === 'json-to-csv' ? '[{"a":1}]' : 'a,b\n1,2'}
            spellCheck={false}
          />
        </div>
      </div>
      <div className="jw-pane">
        <div className="jw-pane-header">
          <span className="jw-pane-label">{direction === 'json-to-csv' ? 'CSV' : 'JSON'}</span>
          <div className="jw-pane-actions">
            <button title="Copy" onClick={handleCopy}>
              <CopyIcon />
            </button>
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
  );
}
