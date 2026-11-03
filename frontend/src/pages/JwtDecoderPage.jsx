import { useState } from 'react';
import { decodeJwt } from '../jwt/jwtUtils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import SampleIcon from '../components/icons/SampleIcon.jsx';
import TrashIcon from '../components/icons/TrashIcon.jsx';

const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlhdCI6MTUxNjIzOTAyMn0.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ';

export default function JwtDecoderPage() {
  const [token, setToken] = useState('');
  const result = token.trim() ? decodeJwt(token) : null;

  function handleCopySection(value) {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  }

  return (
    <div className="jwt-page">
      <div className="jwt-warning">
        ⚠ This decodes the token only. It does <strong>not</strong> verify the signature or confirm the token is
        authentic — never trust a decoded JWT&apos;s claims without verifying it server-side against the issuer&apos;s
        signing key.
      </div>
      <div className="jwt-input-row">
        <textarea
          className="jwt-input"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste a JWT (header.payload.signature)…"
          spellCheck={false}
        />
        <div className="jwt-input-actions">
          <button title="Load sample token" onClick={() => setToken(SAMPLE_TOKEN)}>
            <SampleIcon />
          </button>
          <button title="Clear" onClick={() => setToken('')}>
            <TrashIcon />
          </button>
        </div>
      </div>
      {result && !result.ok && <div className="jw-output-message jw-output-error">{result.error}</div>}
      {result && result.ok && (
        <div className="jwt-sections">
          <div className="jwt-section">
            <div className="jwt-section-header">
              <span>Header</span>
              <button title="Copy" onClick={() => handleCopySection(result.header)}>
                <CopyIcon />
              </button>
            </div>
            <pre className="jwt-section-body">{JSON.stringify(result.header, null, 2)}</pre>
          </div>
          <div className="jwt-section">
            <div className="jwt-section-header">
              <span>Payload</span>
              <button title="Copy" onClick={() => handleCopySection(result.payload)}>
                <CopyIcon />
              </button>
            </div>
            <pre className="jwt-section-body">{JSON.stringify(result.payload, null, 2)}</pre>
          </div>
          <div className="jwt-section">
            <div className="jwt-section-header">
              <span>Signature (not verified)</span>
            </div>
            <pre className="jwt-section-body jwt-signature">{result.signature}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
