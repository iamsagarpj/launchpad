import { useState } from 'react';
import { encodeBase64, decodeBase64, encodeBytesToBase64, decodeBase64ToBytes } from '../base64/base64Utils.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import TrashIcon from '../components/icons/TrashIcon.jsx';
import SampleIcon from '../components/icons/SampleIcon.jsx';
import UploadIcon from '../components/icons/UploadIcon.jsx';
import DownloadIcon from '../components/icons/DownloadIcon.jsx';

const SAMPLE_TEXT = 'Hello, Launchpad! 👋';
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB - base64 inflates ~33%, stays reasonable in a textarea

function computeOutput(direction, input, urlSafe) {
  if (!input) {
    return { ok: true, result: '' };
  }
  if (direction === 'encode') {
    return encodeBase64(input, { urlSafe });
  }
  return decodeBase64(input, { urlSafe });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function Base64Page() {
  const [direction, setDirection] = useState('encode');
  const [input, setInput] = useState('');
  const [urlSafe, setUrlSafe] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null); // { name, size, result } | null
  const [uploadError, setUploadError] = useState(null);

  const output = uploadedFile ? { ok: true, result: uploadedFile.result } : computeOutput(direction, input, urlSafe);

  function clearFile() {
    setUploadedFile(null);
    setUploadError(null);
  }

  function handleInputChange(event) {
    clearFile();
    setInput(event.target.value);
  }

  function handleSample() {
    clearFile();
    if (direction === 'encode') {
      setInput(SAMPLE_TEXT);
    } else {
      setInput(encodeBase64(SAMPLE_TEXT, { urlSafe }).result);
    }
  }

  function handleSwap() {
    clearFile();
    setDirection((prev) => (prev === 'encode' ? 'decode' : 'encode'));
    setInput(output.ok ? output.result : '');
  }

  function handleClear() {
    clearFile();
    setInput('');
  }

  function handleCopy() {
    if (output.ok) {
      navigator.clipboard.writeText(output.result);
    }
  }

  function handleUploadFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File is too large (${formatFileSize(file.size)}). Max size is ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`);
      return;
    }
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      const result = encodeBytesToBase64(bytes, { urlSafe });
      setInput('');
      setUploadedFile({ name: file.name, size: file.size, result });
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDownloadDecoded() {
    const decoded = decodeBase64ToBytes(input, { urlSafe });
    if (!decoded.ok) {
      return;
    }
    const blob = new Blob([decoded.bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'decoded.bin';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="b64-page">
      <div className="b64-toolbar">
        <div className="b64-direction-group">
          <button
            className={`b64-direction-btn${direction === 'encode' ? ' active' : ''}`}
            onClick={() => {
              clearFile();
              setDirection('encode');
            }}
          >
            Encode
          </button>
          <button
            className={`b64-direction-btn${direction === 'decode' ? ' active' : ''}`}
            onClick={() => {
              clearFile();
              setDirection('decode');
            }}
          >
            Decode
          </button>
        </div>
        <button className="b64-swap-btn" onClick={handleSwap} title="Swap direction and use output as input">
          ⇄ Swap
        </button>
        <label className="b64-toggle">
          <input type="checkbox" checked={urlSafe} onChange={(event) => setUrlSafe(event.target.checked)} />
          URL-safe
        </label>
      </div>
      <div className="b64-panes">
        <div className="b64-pane">
          <div className="b64-pane-header">
            <span>Input</span>
            <div className="jw-pane-actions">
              <button title="Load sample" onClick={handleSample}>
                <SampleIcon />
              </button>
              {direction === 'encode' && (
                <label className="jw-pane-upload" title="Upload a file to encode">
                  <UploadIcon />
                  <input type="file" onChange={handleUploadFile} hidden />
                </label>
              )}
              <button title="Clear" onClick={handleClear}>
                <TrashIcon />
              </button>
            </div>
          </div>
          {uploadedFile ? (
            <div className="b64-file-info">
              📄 {uploadedFile.name} · {formatFileSize(uploadedFile.size)}
            </div>
          ) : (
            <textarea
              className="b64-textarea"
              value={input}
              onChange={handleInputChange}
              placeholder={direction === 'encode' ? 'Text to encode…' : 'Base64 to decode…'}
              spellCheck={false}
            />
          )}
          {uploadError && <div className="jw-output-message jw-output-error">{uploadError}</div>}
        </div>
        <div className="b64-pane">
          <div className="b64-pane-header">
            <span>Output</span>
            <div className="jw-pane-actions">
              <button title="Copy" onClick={handleCopy}>
                <CopyIcon />
              </button>
              {direction === 'decode' && !uploadedFile && (
                <button title="Download decoded bytes as a file" onClick={handleDownloadDecoded}>
                  <DownloadIcon />
                </button>
              )}
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
