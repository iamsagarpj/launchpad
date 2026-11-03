import { useState } from 'react';
import { encodeUrl, decodeUrl } from '../url-encoder/urlEncoderUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import TrashIcon from '../components/icons/TrashIcon.jsx';

function computeOutput(direction, mode, input) {
  if (!input) {
    return { ok: true, result: '' };
  }
  return direction === 'encode' ? encodeUrl(input, mode) : decodeUrl(input, mode);
}

export default function UrlEncoderPage() {
  const [direction, setDirection] = useState('encode');
  const [mode, setMode] = useState('component');
  const [input, setInput] = useState('');

  const output = computeOutput(direction, mode, input);

  function handleSwap() {
    setDirection((prev) => (prev === 'encode' ? 'decode' : 'encode'));
    setInput(output.ok ? output.result : '');
  }

  function handleClear() {
    setInput('');
  }

  function handleCopy() {
    if (output.ok) {
      navigator.clipboard.writeText(output.result);
    }
  }

  return (
    <div className="b64-page">
      <div className="b64-toolbar">
        <div className="b64-direction-group">
          <button
            className={`b64-direction-btn${direction === 'encode' ? ' active' : ''}`}
            onClick={() => setDirection('encode')}
          >
            Encode
          </button>
          <button
            className={`b64-direction-btn${direction === 'decode' ? ' active' : ''}`}
            onClick={() => setDirection('decode')}
          >
            Decode
          </button>
        </div>
        <div className="b64-direction-group">
          <button
            className={`b64-direction-btn${mode === 'component' ? ' active' : ''}`}
            onClick={() => setMode('component')}
            title="encodeURIComponent - for a single value like a query param"
          >
            Component
          </button>
          <button
            className={`b64-direction-btn${mode === 'full' ? ' active' : ''}`}
            onClick={() => setMode('full')}
            title="encodeURI - for a whole URL, preserves : / ? # etc."
          >
            Full URI
          </button>
        </div>
        <button className="b64-swap-btn" onClick={handleSwap} title="Swap direction and use output as input">
          ⇄ Swap
        </button>
      </div>
      <div className="b64-panes">
        <div className="b64-pane">
          <div className="b64-pane-header">
            <span>Input</span>
            <div className="jw-pane-actions">
              <button title="Clear" onClick={handleClear}>
                <TrashIcon />
              </button>
            </div>
          </div>
          <textarea
            className="b64-textarea"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={direction === 'encode' ? 'Text or URL to encode…' : 'Percent-encoded text to decode…'}
            spellCheck={false}
          />
        </div>
        <div className="b64-pane">
          <div className="b64-pane-header">
            <span>Output</span>
            <div className="jw-pane-actions">
              <button title="Copy" onClick={handleCopy}>
                <CopyIcon />
              </button>
            </div>
          </div>
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
