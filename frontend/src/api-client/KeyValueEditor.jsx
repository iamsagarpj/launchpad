import { useId } from 'react';
import VariableSuggestInput from './VariableSuggestInput.jsx';

export default function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  showEnabled = true,
  keySuggestions,
  variableNames,
}) {
  const datalistId = useId();

  function updateRow(index, field, value) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    onChange([...rows, { key: '', value: '', enabled: true }]);
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="kv-editor">
      {rows.map((row, index) => (
        <div className="kv-row" key={index}>
          {showEnabled && (
            <input
              type="checkbox"
              checked={row.enabled !== false}
              onChange={(event) => updateRow(index, 'enabled', event.target.checked)}
            />
          )}
          <input
            className="kv-input"
            list={keySuggestions ? datalistId : undefined}
            value={row.key}
            onChange={(event) => updateRow(index, 'key', event.target.value)}
            placeholder={keyPlaceholder}
            spellCheck={false}
          />
          {variableNames && variableNames.length > 0 ? (
            <VariableSuggestInput
              className="kv-input"
              value={row.value}
              onChange={(value) => updateRow(index, 'value', value)}
              variableNames={variableNames}
              placeholder={valuePlaceholder}
            />
          ) : (
            <input
              className="kv-input"
              value={row.value}
              onChange={(event) => updateRow(index, 'value', event.target.value)}
              placeholder={valuePlaceholder}
              spellCheck={false}
            />
          )}
          <button type="button" className="kv-remove-btn" onClick={() => removeRow(index)} title="Remove">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="kv-add-btn" onClick={addRow}>
        + Add
      </button>
      {keySuggestions && (
        <datalist id={datalistId}>
          {keySuggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
    </div>
  );
}
