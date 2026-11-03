import { loader, Editor } from '@monaco-editor/react';
import 'monaco-editor/language/json/monaco.contribution.js';
import * as monaco from 'monaco-editor/editor/editor.api.js';

loader.config({ monaco });

export default function MonacoJsonEditor({ value, onChange, onEditorMount, theme = 'vs-dark', readOnly = false }) {
  return (
    <Editor
      height="100%"
      language="json"
      theme={theme}
      value={value}
      onChange={(newValue) => onChange?.(newValue ?? '')}
      onMount={(editor) => onEditorMount?.(editor)}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        automaticLayout: true,
        wordWrap: 'on',
        folding: true,
        scrollBeyondLastLine: false,
        readOnly,
      }}
    />
  );
}
