import { useMemo, useState } from 'react';
import { parseRawCurl, classifyHeader, redactAuthValue, buildCleanCurl } from '../curl-cleaner/curlCleanerUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import TrashIcon from '../components/icons/TrashIcon.jsx';

export default function CurlCleanerPage() {
  const [rawInput, setRawInput] = useState('');
  const [headerChecked, setHeaderChecked] = useState({});
  const [revealToken, setRevealToken] = useState(false);

  const parsed = useMemo(() => (rawInput.trim() ? parseRawCurl(rawInput) : null), [rawInput]);

  // Re-derive each header's checked state from the raw input every time it changes,
  // defaulting unseen headers to classifyHeader's recommendation, but preserving any
  // choice the user already made for a header that's still present after a re-paste.
  const headers = useMemo(() => {
    if (!parsed || !parsed.ok) {
      return [];
    }
    return parsed.headers.map((h, index) => {
      const checked = Object.prototype.hasOwnProperty.call(headerChecked, index)
        ? headerChecked[index]
        : classifyHeader(h.key) === 'keep';
      return { ...h, checked };
    });
  }, [parsed, headerChecked]);

  const output = useMemo(() => {
    if (!parsed || !parsed.ok) {
      return '';
    }
    const kept = headers
      .filter((h) => h.checked)
      .map((h) => ({
        key: h.key,
        value: h.key.toLowerCase() === 'authorization' && !revealToken ? redactAuthValue(h.value) : h.value,
      }));
    return buildCleanCurl({ method: parsed.method, url: parsed.url, headers: kept, body: parsed.body, bodyIsJson: parsed.bodyIsJson });
  }, [parsed, headers, revealToken]);

  function toggleHeader(index) {
    setHeaderChecked((prev) => ({ ...prev, [index]: !(headers[index]?.checked) }));
  }

  function handleClear() {
    setRawInput('');
    setHeaderChecked({});
    setRevealToken(false);
  }

  function handleCopy() {
    if (output) {
      navigator.clipboard.writeText(output);
    }
  }

  return (
    <div className="curl-cleaner-page">
      <div className="curl-cleaner-input-row">
        <textarea
          className="curl-cleaner-input"
          value={rawInput}
          onChange={(event) => {
            setRawInput(event.target.value);
            setRevealToken(false);
          }}
          placeholder="Paste a cURL command (Windows cmd or bash export)…"
          spellCheck={false}
        />
        <div className="curl-cleaner-input-actions">
          <button title="Clear" onClick={handleClear}>
            <TrashIcon />
          </button>
        </div>
      </div>

      {parsed && !parsed.ok && <div className="curl-cleaner-error">{parsed.error}</div>}

      {parsed && parsed.ok && (
        <div className="curl-cleaner-body">
          <div className="curl-cleaner-headers">
            <div className="curl-cleaner-headers-title">Headers</div>
            {headers.map((h, index) => (
              <label className="curl-cleaner-header-row" key={index}>
                <input type="checkbox" checked={h.checked} onChange={() => toggleHeader(index)} />
                <span className="curl-cleaner-header-key">{h.key}</span>
              </label>
            ))}
            {headers.some((h) => h.key.toLowerCase() === 'authorization') && (
              <label className="curl-cleaner-header-row curl-cleaner-reveal-row">
                <input type="checkbox" checked={revealToken} onChange={() => setRevealToken((prev) => !prev)} />
                <span>Reveal real token</span>
              </label>
            )}
          </div>

          <div className="curl-cleaner-output-pane">
            <div className="curl-cleaner-output-header">
              <span>Cleaned cURL</span>
              <button title="Copy" onClick={handleCopy}>
                <CopyIcon />
              </button>
            </div>
            <pre className="curl-cleaner-output">{output}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
