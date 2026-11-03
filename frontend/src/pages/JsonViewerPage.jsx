import { useState } from 'react';
import MonacoJsonEditor from '../json-viewer/MonacoJsonEditor.jsx';
import JsonTreeView from '../json-viewer/JsonTreeView.jsx';
import JsonCompareView from '../json-viewer/JsonCompareView.jsx';
import JsonCsvView from '../json-viewer/JsonCsvView.jsx';
import {
  formatJson,
  minifyJson,
  validateJson,
  evaluateJsonPath,
  SAMPLE_JSON,
} from '../json-viewer/jsonUtils.js';
import { repairJson } from '../json-viewer/jsonRepair.js';
import { jsonToTypeScript } from '../json-viewer/jsonToTypeScript.js';
import SampleIcon from '../components/icons/SampleIcon.jsx';
import UploadIcon from '../components/icons/UploadIcon.jsx';
import TrashIcon from '../components/icons/TrashIcon.jsx';
import ExpandIcon from '../components/icons/ExpandIcon.jsx';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import DownloadIcon from '../components/icons/DownloadIcon.jsx';

const MODES = [
  { id: 'format', label: 'Format' },
  { id: 'minify', label: 'Minify' },
  { id: 'validate', label: 'Validate' },
  { id: 'repair', label: 'Repair' },
];

const VIEWS = [
  { id: 'json', label: 'JSON' },
  { id: 'tree', label: 'Tree' },
  { id: 'query', label: 'Query' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'compare', label: 'Compare' },
  { id: 'csv', label: 'CSV' },
];

// Views that bypass the shared Document/Output pane layout entirely and
// render their own self-contained multi-pane UI.
const SELF_CONTAINED_VIEWS = new Set(['compare', 'csv']);

function computeModeOutput(documentContent, mode) {
  if (!documentContent) {
    return { kind: 'empty' };
  }
  if (mode === 'format') {
    const result = formatJson(documentContent);
    return result.ok ? { kind: 'json', text: result.result } : { kind: 'error', text: result.error };
  }
  if (mode === 'minify') {
    const result = minifyJson(documentContent);
    return result.ok ? { kind: 'json', text: result.result } : { kind: 'error', text: result.error };
  }
  if (mode === 'repair') {
    const result = repairJson(documentContent);
    return result.ok ? { kind: 'json', text: result.result } : { kind: 'error', text: result.error };
  }
  const result = validateJson(documentContent);
  if (result.ok) {
    return { kind: 'valid', text: '✓ Valid JSON' };
  }
  return { kind: 'invalid', text: `✗ Invalid JSON (line ${result.line}): ${result.error}` };
}

function computeQueryOutput(documentContent, queryPath) {
  if (!documentContent) {
    return { kind: 'empty' };
  }
  const trimmed = queryPath.trim();
  if (!trimmed) {
    return { kind: 'query-empty' };
  }
  const result = evaluateJsonPath(documentContent, trimmed);
  if (!result.ok) {
    return { kind: 'error', text: result.error };
  }
  return { kind: 'json', text: JSON.stringify(result.matches, null, 2), count: result.matches.length };
}

function computeTypeScriptOutput(documentContent, interfaceName) {
  if (!documentContent) {
    return { kind: 'empty' };
  }
  const result = jsonToTypeScript(documentContent, interfaceName.trim() || 'Root');
  if (!result.ok) {
    return { kind: 'error', text: result.error };
  }
  return { kind: 'text', text: result.result };
}

export default function JsonViewerPage() {
  const [documentContent, setDocumentContent] = useState('');
  const [mode, setMode] = useState('format');
  const [view, setView] = useState('json');
  const [queryPath, setQueryPath] = useState('$');
  const [tsInterfaceName, setTsInterfaceName] = useState('Root');
  const [fullscreenPane, setFullscreenPane] = useState(null);

  let output;
  if (view === 'query') {
    output = computeQueryOutput(documentContent, queryPath);
  } else if (view === 'typescript') {
    output = computeTypeScriptOutput(documentContent, tsInterfaceName);
  } else {
    output = computeModeOutput(documentContent, mode);
  }
  const activeView = VIEWS.find((v) => v.id === view);

  function handleLoadSample() {
    setDocumentContent(SAMPLE_JSON);
  }

  function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDocumentContent(String(reader.result));
    reader.readAsText(file);
    event.target.value = '';
  }

  function handleClear() {
    setDocumentContent('');
  }

  function handleCopy() {
    if (output.kind === 'json' || output.kind === 'text') {
      navigator.clipboard.writeText(output.text);
    }
  }

  function handleDownload() {
    if (output.kind !== 'json' && output.kind !== 'text') {
      return;
    }
    const isTypeScript = view === 'typescript';
    const blob = new Blob([output.text], { type: isTypeScript ? 'text/plain' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isTypeScript ? 'types.ts' : 'data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleFullscreen(pane) {
    setFullscreenPane((current) => (current === pane ? null : pane));
  }

  return (
    <div className="json-viewer-page">
      <div className="jw-toolbar">
        <div className="jw-mode-group">
          {view === 'query' && (
            <input
              className="jqv-input"
              type="text"
              value={queryPath}
              onChange={(event) => setQueryPath(event.target.value)}
              placeholder="$.services[*]"
              spellCheck={false}
            />
          )}
          {view === 'typescript' && (
            <input
              className="jqv-input"
              type="text"
              value={tsInterfaceName}
              onChange={(event) => setTsInterfaceName(event.target.value)}
              placeholder="Interface name (e.g. Root)"
              spellCheck={false}
            />
          )}
          {view === 'json' &&
            MODES.map((m) => (
              <button
                key={m.id}
                className={`jw-mode-btn${mode === m.id ? ' active' : ''}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
        </div>
        <div className="jw-view-group">
          {VIEWS.map((v) => (
            <button key={v.id} className={`jw-view-btn${view === v.id ? ' active' : ''}`} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {view === 'compare' && <JsonCompareView />}
      {view === 'csv' && <JsonCsvView />}
      {!SELF_CONTAINED_VIEWS.has(view) && (
        <div className="jw-panes">
          <div
            className={`jw-pane${fullscreenPane === 'document' ? ' is-fullscreen' : ''}${
              fullscreenPane === 'output' ? ' is-hidden' : ''
            }`}
          >
            <div className="jw-pane-header">
              <span className="jw-pane-label">Document</span>
              <span className="jw-pane-meta">{documentContent.length} chars</span>
              <div className="jw-pane-actions">
                <button title="Load sample JSON" onClick={handleLoadSample}>
                  <SampleIcon />
                </button>
                <label className="jw-pane-upload" title="Upload a file">
                  <UploadIcon />
                  <input type="file" accept=".json,application/json,text/plain" onChange={handleUpload} hidden />
                </label>
                <button title="Clear" onClick={handleClear}>
                  <TrashIcon />
                </button>
                <button title="Fullscreen" onClick={() => toggleFullscreen('document')}>
                  <ExpandIcon />
                </button>
              </div>
            </div>
            <div className="jw-pane-body">
              <MonacoJsonEditor value={documentContent} onChange={setDocumentContent} theme="vs" />
            </div>
          </div>
          <div
            className={`jw-pane${fullscreenPane === 'output' ? ' is-fullscreen' : ''}${
              fullscreenPane === 'document' ? ' is-hidden' : ''
            }`}
          >
            <div className="jw-pane-header">
              <span className="jw-pane-label">{activeView.label}</span>
              {view === 'query' && output.kind === 'json' && (
                <span className="jw-pane-meta">
                  {output.count} {output.count === 1 ? 'match' : 'matches'}
                </span>
              )}
              <div className="jw-pane-actions">
                {view !== 'tree' && (
                  <>
                    <button title="Copy" onClick={handleCopy}>
                      <CopyIcon />
                    </button>
                    <button title="Download" onClick={handleDownload}>
                      <DownloadIcon />
                    </button>
                  </>
                )}
                <button title="Fullscreen" onClick={() => toggleFullscreen('output')}>
                  <ExpandIcon />
                </button>
              </div>
            </div>
            <div className="jw-pane-body">
              {view === 'tree' && <JsonTreeView documentContent={documentContent} />}
              {view !== 'tree' && output.kind === 'empty' && (
                <div className="jw-output-placeholder">
                  {view === 'query' && 'Paste JSON in the Document pane to run a query.'}
                  {view === 'typescript' && 'Paste a JSON object in the Document pane to generate a TypeScript interface.'}
                  {view !== 'query' && view !== 'typescript' && 'Paste JSON in the Document pane to see formatted output.'}
                </div>
              )}
              {view !== 'tree' && output.kind === 'query-empty' && (
                <div className="jw-output-placeholder">Enter a JSONPath expression above, e.g. $.config.port</div>
              )}
              {view !== 'tree' && output.kind === 'json' && <MonacoJsonEditor value={output.text} theme="vs" readOnly />}
              {view !== 'tree' && output.kind === 'text' && (
                <textarea className="b64-textarea" value={output.text} readOnly spellCheck={false} />
              )}
              {view !== 'tree' && output.kind === 'error' && (
                <div className="jw-output-message jw-output-error">
                  {view === 'query' || view === 'typescript' ? output.text : `Cannot ${mode}: ${output.text}`}
                </div>
              )}
              {view !== 'tree' && (output.kind === 'valid' || output.kind === 'invalid') && (
                <div className={`jw-output-message ${output.kind === 'valid' ? 'jw-output-valid' : 'jw-output-error'}`}>
                  {output.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
