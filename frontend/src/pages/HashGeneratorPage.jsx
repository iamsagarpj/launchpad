import { useEffect, useState } from 'react';
import { computeHash, SUPPORTED_ALGORITHMS } from '../hash/hashUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';

export default function HashGeneratorPage() {
  const [input, setInput] = useState('');
  const [hashes, setHashes] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (!input) {
      setHashes({});
      return undefined;
    }
    Promise.all(SUPPORTED_ALGORITHMS.map((algorithm) => computeHash(input, algorithm))).then((results) => {
      if (cancelled) return;
      const next = {};
      SUPPORTED_ALGORITHMS.forEach((algorithm, index) => {
        next[algorithm] = results[index].result;
      });
      setHashes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [input]);

  function handleCopy(value) {
    navigator.clipboard.writeText(value);
  }

  return (
    <div className="hash-page">
      <textarea
        className="b64-textarea hash-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Text to hash…"
        spellCheck={false}
      />
      <div className="hash-results">
        {SUPPORTED_ALGORITHMS.map((algorithm) => (
          <div className="hash-row" key={algorithm}>
            <span className="hash-algo">{algorithm}</span>
            <span className="hash-value">{hashes[algorithm] || '—'}</span>
            {hashes[algorithm] && (
              <button title="Copy" onClick={() => handleCopy(hashes[algorithm])}>
                <CopyIcon />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
