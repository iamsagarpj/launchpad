import { useState } from 'react';
import { generateUuidV4, generateUuidV7, formatUuid } from '../uuid/uuidUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import DownloadIcon from '../components/icons/DownloadIcon.jsx';

const MAX_QUANTITY = 100;

export default function UuidPage() {
  const [uuids, setUuids] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [uppercase, setUppercase] = useState(false);
  const [stripHyphens, setStripHyphens] = useState(false);
  const [checkDuplicates, setCheckDuplicates] = useState(false);

  function format(raw) {
    return formatUuid(raw, { uppercase, stripHyphens });
  }

  function handleGenerate(version) {
    const count = Math.min(Math.max(Number(quantity) || 1, 1), MAX_QUANTITY);
    const generator = version === 'v7' ? generateUuidV7 : generateUuidV4;
    setUuids(Array.from({ length: count }, () => generator()));
  }

  function handleCopyOne(raw) {
    navigator.clipboard.writeText(format(raw));
  }

  function handleCopyAll() {
    navigator.clipboard.writeText(uuids.map(format).join('\n'));
  }

  function handleDownload() {
    const blob = new Blob([uuids.map(format).join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uuids.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  const duplicateCount = checkDuplicates ? uuids.length - new Set(uuids).size : 0;

  return (
    <div className="uuid-page">
      <div className="uuid-controls">
        <button className="uuid-generate-btn" onClick={() => handleGenerate('v4')}>
          Generate UUID v4
        </button>
        <button className="uuid-generate-btn" onClick={() => handleGenerate('v7')}>
          Generate UUID v7
        </button>
        <label className="uuid-field">
          Quantity
          <input
            type="number"
            min="1"
            max={MAX_QUANTITY}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label className="uuid-field">
          <input type="checkbox" checked={uppercase} onChange={(event) => setUppercase(event.target.checked)} />
          Uppercase
        </label>
        <label className="uuid-field">
          <input
            type="checkbox"
            checked={stripHyphens}
            onChange={(event) => setStripHyphens(event.target.checked)}
          />
          Strip hyphens
        </label>
        <label className="uuid-field">
          <input
            type="checkbox"
            checked={checkDuplicates}
            onChange={(event) => setCheckDuplicates(event.target.checked)}
          />
          Check for duplicates
        </label>
        {uuids.length > 0 && (
          <>
            <button className="uuid-generate-btn" onClick={handleCopyAll}>
              Copy all
            </button>
            <button className="uuid-generate-btn" onClick={handleDownload} title="Download as a .txt file">
              <DownloadIcon /> Download
            </button>
          </>
        )}
      </div>
      <p className="uuid-help">
        <strong>v4</strong> is fully random. <strong>v7</strong> embeds a millisecond timestamp prefix, so values sort
        chronologically and reveal roughly when they were generated — prefer v4 if that leak is undesirable.
      </p>
      {duplicateCount > 0 && (
        <div className="uuid-duplicate-warning">
          ⚠ {duplicateCount} duplicate {duplicateCount === 1 ? 'value' : 'values'} found in this batch.
        </div>
      )}
      <div className="uuid-list">
        {uuids.length === 0 ? (
          <div className="uuid-empty">Click Generate to create UUIDs.</div>
        ) : (
          uuids.map((raw, index) => (
            <div className="uuid-row" key={`${raw}-${index}`}>
              <span>{format(raw)}</span>
              <button className="uuid-row-copy" title="Copy" onClick={() => handleCopyOne(raw)}>
                <CopyIcon />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
