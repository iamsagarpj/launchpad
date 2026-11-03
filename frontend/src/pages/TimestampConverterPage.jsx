import { useState } from 'react';
import { timestampToDate, dateToTimestamp } from '../timestamp/timestampUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';

export default function TimestampConverterPage() {
  const [direction, setDirection] = useState('to-date');
  const [input, setInput] = useState('');

  const result = input.trim() ? (direction === 'to-date' ? timestampToDate(input) : dateToTimestamp(input)) : null;

  function handleNow() {
    setInput(direction === 'to-date' ? String(Date.now()) : new Date().toISOString());
  }

  function handleCopy(value) {
    navigator.clipboard.writeText(String(value));
  }

  return (
    <div className="ts-page">
      <div className="ts-toolbar">
        <div className="b64-direction-group">
          <button
            className={`b64-direction-btn${direction === 'to-date' ? ' active' : ''}`}
            onClick={() => setDirection('to-date')}
          >
            Timestamp → Date
          </button>
          <button
            className={`b64-direction-btn${direction === 'to-timestamp' ? ' active' : ''}`}
            onClick={() => setDirection('to-timestamp')}
          >
            Date → Timestamp
          </button>
        </div>
        <button className="b64-swap-btn" onClick={handleNow}>
          Now
        </button>
      </div>
      <input
        className="ts-input"
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={direction === 'to-date' ? 'e.g. 1700000000 or 1700000000000' : 'e.g. 2024-01-15T10:30:00Z'}
        spellCheck={false}
      />
      {result && !result.ok && <div className="jw-output-message jw-output-error">{result.error}</div>}
      {result && result.ok && (
        <div className="ts-results">
          {direction === 'to-date' && (
            <div className="ts-row">
              <span className="ts-label">Detected unit</span>
              <span className="ts-value">{result.unit}</span>
            </div>
          )}
          <div className="ts-row">
            <span className="ts-label">ISO 8601</span>
            <span className="ts-value">{result.iso}</span>
            <button title="Copy" onClick={() => handleCopy(result.iso)}>
              <CopyIcon />
            </button>
          </div>
          <div className="ts-row">
            <span className="ts-label">UTC</span>
            <span className="ts-value">{result.utcString}</span>
          </div>
          <div className="ts-row">
            <span className="ts-label">Local</span>
            <span className="ts-value">{result.localString}</span>
          </div>
          <div className="ts-row">
            <span className="ts-label">Unix seconds</span>
            <span className="ts-value">{result.unixSeconds}</span>
            <button title="Copy" onClick={() => handleCopy(result.unixSeconds)}>
              <CopyIcon />
            </button>
          </div>
          <div className="ts-row">
            <span className="ts-label">Unix milliseconds</span>
            <span className="ts-value">{result.unixMillis}</span>
            <button title="Copy" onClick={() => handleCopy(result.unixMillis)}>
              <CopyIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
