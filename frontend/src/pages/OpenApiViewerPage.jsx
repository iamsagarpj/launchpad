import { useState } from 'react';
import { parseOpenApiSpec } from '../openapi/openApiUtils.js';

export default function OpenApiViewerPage() {
  const [input, setInput] = useState('');

  const result = input.trim() ? parseOpenApiSpec(input) : null;

  return (
    <div className="json-viewer-page">
      <div className="jw-panes">
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Spec (JSON or YAML)</span>
          </div>
          <div className="jw-pane-body">
            <textarea
              className="b64-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste an OpenAPI/Swagger document…"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="jw-pane">
          <div className="jw-pane-header">
            <span className="jw-pane-label">Endpoints</span>
            {result?.ok && <span className="jw-pane-meta">{result.endpoints.length}</span>}
          </div>
          <div className="jw-pane-body oapi-body">
            {!result && <div className="jw-output-placeholder">Paste an OpenAPI spec to see its endpoints.</div>}
            {result && !result.ok && <div className="jw-output-message jw-output-error">{result.error}</div>}
            {result?.ok && (
              <>
                <div className="oapi-info">
                  <strong>{result.info.title}</strong>
                  {result.info.version && <span className="oapi-version">v{result.info.version}</span>}
                </div>
                {result.endpoints.map((endpoint, index) => (
                  <div className="oapi-endpoint" key={index}>
                    <span className={`oapi-method oapi-method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                    <span className="oapi-path">{endpoint.path}</span>
                    {endpoint.summary && <span className="oapi-summary">{endpoint.summary}</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
