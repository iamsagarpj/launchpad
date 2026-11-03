import { useState } from 'react';
import { testRegex, applyReplacement } from '../regex/regexUtils.js';

export default function RegexTesterPage() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [input, setInput] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplacement, setShowReplacement] = useState(false);

  const result = pattern ? testRegex(pattern, flags, input) : { ok: true, matches: [] };
  const replaceResult = showReplacement && pattern ? applyReplacement(pattern, flags, input, replacement) : null;

  return (
    <div className="regex-page">
      <div className="regex-toolbar">
        <span className="regex-slash">/</span>
        <input
          className="regex-pattern"
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
          placeholder="pattern"
          spellCheck={false}
        />
        <span className="regex-slash">/</span>
        <input
          className="regex-flags"
          value={flags}
          onChange={(event) => setFlags(event.target.value)}
          placeholder="flags"
          spellCheck={false}
        />
        <label className="b64-toggle">
          <input type="checkbox" checked={showReplacement} onChange={(event) => setShowReplacement(event.target.checked)} />
          Replace
        </label>
      </div>
      {showReplacement && (
        <input
          className="regex-replacement"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder="Replacement (supports $1, $2…)"
          spellCheck={false}
        />
      )}
      {!result.ok && <div className="jw-output-message jw-output-error">{result.error}</div>}
      <div className="jw-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Test string</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Text to test against…"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">{showReplacement ? 'Replaced' : 'Matches'}</span>
            {result.ok && !showReplacement && (
              <span className="jw-pane-meta">
                {result.matches.length} {result.matches.length === 1 ? 'match' : 'matches'}
              </span>
            )}
          </div>
          <div className="jw-pane-body">
            {showReplacement ? (
              replaceResult?.ok ? (
                <textarea className="b64-textarea" value={replaceResult.result} readOnly spellCheck={false} />
              ) : (
                <div className="jw-output-message jw-output-error">{replaceResult?.error}</div>
              )
            ) : (
              <div className="regex-matches">
                {result.ok && result.matches.length === 0 && <div className="jw-output-placeholder">No matches</div>}
                {result.ok &&
                  result.matches.map((match, index) => (
                    <div className="regex-match-row" key={index}>
                      <span className="regex-match-index">[{match.index}]</span>
                      <span className="regex-match-text">{match.match}</span>
                      {match.groups.length > 0 && (
                        <span className="regex-match-groups">{match.groups.map((g) => g ?? '∅').join(', ')}</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
