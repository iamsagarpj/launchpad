import { useRef, useState } from 'react';
import { detectVariableTrigger } from './bodyVariableSupport.js';

// A plain text input that shows a contextual suggestion list of environment
// variable names when you type "{{" - matching how Postman suggests
// variables inline rather than as a separate always-visible list. Only
// activates when there's an unclosed "{{" before the cursor (i.e. no "}}"
// after it), and only while variableNames is non-empty.
export default function VariableSuggestInput({ value, onChange, variableNames, className, placeholder, type = 'text', onPaste }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const filtered = open ? variableNames.filter((name) => name.toLowerCase().includes(query.toLowerCase())) : [];

  function handleChange(event) {
    const next = event.target.value;
    onChange(next);
    const cursor = event.target.selectionStart ?? next.length;
    const trigger = variableNames.length > 0 ? detectVariableTrigger(next, cursor) : null;
    if (trigger) {
      setQuery(trigger.query);
      setOpen(true);
      setActiveIndex(0);
    } else {
      setOpen(false);
    }
  }

  function applySuggestion(name) {
    const input = inputRef.current;
    const cursor = input ? (input.selectionStart ?? value.length) : value.length;
    const upToCursor = value.slice(0, cursor);
    const openIndex = upToCursor.lastIndexOf('{{');
    const before = value.slice(0, openIndex);
    const after = value.slice(cursor);
    const next = `${before}{{${name}}}${after}`;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      if (input) {
        const pos = before.length + name.length + 4;
        input.focus();
        input.setSelectionRange(pos, pos);
      }
    });
  }

  function handleKeyDown(event) {
    if (!open || filtered.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      applySuggestion(filtered[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="var-suggest-wrapper">
      <input
        ref={inputRef}
        type={type}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <div className="var-suggest-list">
          {filtered.map((name, index) => (
            <button
              key={name}
              type="button"
              className={`var-suggest-item${index === activeIndex ? ' active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySuggestion(name)}
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
