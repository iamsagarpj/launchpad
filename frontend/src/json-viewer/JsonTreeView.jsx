import { useEffect, useMemo, useState } from 'react';
import { parseJsonValue, formatJsonPath } from './jsonUtils.js';
import { findKeyPaths } from './jsonKeySearch.js';
import CopyIcon from '../components/icons/CopyIcon.jsx';

const DEFAULT_EXPANDED_DEPTH = 2;

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isContainer(value) {
  const type = valueType(value);
  return type === 'object' || type === 'array';
}

function entriesOf(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item]);
  }
  return Object.entries(value);
}

function pathKeyOf(segments) {
  return JSON.stringify(segments);
}

const TYPE_LABELS = {
  object: 'obj',
  array: 'arr',
  string: 'str',
  number: 'num',
  boolean: 'bool',
  null: 'null',
};

function collectContainerPaths(value, segments, depth, out) {
  if (!isContainer(value)) {
    return;
  }
  out.push({ key: pathKeyOf(segments), depth });
  for (const [key, child] of entriesOf(value)) {
    collectContainerPaths(child, [...segments, key], depth + 1, out);
  }
}

function childCountLabel(value) {
  if (Array.isArray(value)) {
    return `[] ${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  }
  const count = Object.keys(value).length;
  return `{} ${count} ${count === 1 ? 'key' : 'keys'}`;
}

function renderPrimitive(value) {
  const type = valueType(value);
  if (type === 'string') return `"${value}"`;
  return String(value);
}

// "Copy value" semantics: a string copies its raw content (no quotes, so it
// pastes directly); any other value copies its JSON representation.
function copyableValueText(value) {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function TreeNode({ segments, keyLabel, value, depth, expandedKeys, onToggle, onCopyPath, onCopyKey, onCopyValue }) {
  const type = valueType(value);
  const container = isContainer(value);
  const key = pathKeyOf(segments);
  const expanded = expandedKeys.has(key);

  return (
    <div className="jtv-node">
      <div className="jtv-row" style={{ paddingLeft: depth * 16 }}>
        {container ? (
          <button
            className={`jtv-chevron${expanded ? ' expanded' : ''}`}
            onClick={() => onToggle(key)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            ▸
          </button>
        ) : (
          <span className="jtv-chevron-spacer" />
        )}
        <span className="jtv-key" onClick={() => onCopyPath(formatJsonPath(segments))} title="Click to copy JSONPath">
          {keyLabel}
        </span>
        <span className={`jtv-type-badge jtv-type-${type}`}>{TYPE_LABELS[type]}</span>
        {container ? (
          !expanded && <span className="jtv-count">{childCountLabel(value)}</span>
        ) : (
          <span className={`jtv-value jtv-value-${type}`}>{renderPrimitive(value)}</span>
        )}
        <span className="jtv-row-actions">
          <button title="Copy key" onClick={() => onCopyKey(String(keyLabel))}>
            <CopyIcon />
            <span className="jtv-row-action-label">key</span>
          </button>
          <button title="Copy value" onClick={() => onCopyValue(value)}>
            <CopyIcon />
            <span className="jtv-row-action-label">value</span>
          </button>
        </span>
      </div>
      {container && expanded && (
        <div className="jtv-children">
          {entriesOf(value).map(([childKey, childValue]) => (
            <TreeNode
              key={childKey}
              segments={[...segments, childKey]}
              keyLabel={String(childKey)}
              value={childValue}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              onCopyPath={onCopyPath}
              onCopyKey={onCopyKey}
              onCopyValue={onCopyValue}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function JsonTreeView({ documentContent }) {
  const parsed = useMemo(() => parseJsonValue(documentContent), [documentContent]);
  const [searchTerm, setSearchTerm] = useState('');

  const allContainerPaths = useMemo(() => {
    if (!parsed.ok) return [];
    const out = [];
    collectContainerPaths(parsed.value, [], 0, out);
    return out;
  }, [parsed]);

  const defaultExpandedKeys = useMemo(
    () => new Set(allContainerPaths.filter((p) => p.depth < DEFAULT_EXPANDED_DEPTH).map((p) => p.key)),
    [allContainerPaths]
  );

  const [expandedKeys, setExpandedKeys] = useState(defaultExpandedKeys);

  useEffect(() => {
    setExpandedKeys(defaultExpandedKeys);
    // Only reset when the document itself changes, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentContent]);

  const keyMatches = useMemo(() => {
    if (!parsed.ok || !searchTerm.trim()) {
      return null;
    }
    return findKeyPaths(parsed.value, searchTerm);
  }, [parsed, searchTerm]);

  function handleToggle(key) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleExpandAll() {
    setExpandedKeys(new Set(allContainerPaths.map((p) => p.key)));
  }

  function handleCollapseAll() {
    setExpandedKeys(new Set());
  }

  function handleCopyPath(path) {
    navigator.clipboard.writeText(path);
  }

  function handleCopyKey(key) {
    navigator.clipboard.writeText(key);
  }

  function handleCopyValue(value) {
    navigator.clipboard.writeText(copyableValueText(value));
  }

  if (!documentContent) {
    return <div className="jw-output-placeholder">Paste JSON in the Document pane to see the tree.</div>;
  }
  if (!parsed.ok) {
    return (
      <div className="jw-output-message jw-output-error">
        Cannot show tree: Invalid JSON (line {parsed.line}): {parsed.error}
      </div>
    );
  }

  return (
    <div className="jtv-root">
      <div className="jtv-toolbar">
        <button onClick={handleExpandAll}>Expand all</button>
        <button onClick={handleCollapseAll}>Collapse all</button>
        <input
          className="jtv-search"
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Find key…"
          spellCheck={false}
        />
      </div>
      {keyMatches ? (
        <div className="jtv-search-results">
          {keyMatches.length === 0 && (
            <div className="jw-output-placeholder">No keys match &quot;{searchTerm}&quot;</div>
          )}
          {keyMatches.map((match) => (
            <div className="jtv-search-row" key={match.path}>
              <span className="jtv-key" onClick={() => handleCopyPath(match.path)} title="Click to copy JSONPath">
                {match.key}
              </span>
              <span className="jtv-search-path">{match.path}</span>
              <span className="jtv-search-value">{copyableValueText(match.value).slice(0, 80)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="jtv-body">
          <TreeNode
            segments={[]}
            keyLabel="$"
            value={parsed.value}
            depth={0}
            expandedKeys={expandedKeys}
            onToggle={handleToggle}
            onCopyPath={handleCopyPath}
            onCopyKey={handleCopyKey}
            onCopyValue={handleCopyValue}
          />
        </div>
      )}
    </div>
  );
}
