import { useEffect, useRef } from 'react';
import { loader, Editor } from '@monaco-editor/react';
import 'monaco-editor/language/json/monaco.contribution.js';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { detectVariableTrigger, findVariableTokens } from './bodyVariableSupport.js';

loader.config({ monaco });

// Shared editor for the request Body tab's JSON and Text modes. Beyond what
// MonacoJsonEditor (used for read-only/generic JSON elsewhere in this app)
// already does, this adds {{variable}} support: an autocomplete dropdown
// triggered by "{" (reusing the same trigger-detection VariableSuggestInput
// uses for the URL/Headers/Auth fields), and known/unknown decorations on
// every {{name}} token in the content.
//
// The completion provider is registered globally per Monaco `language` (that's
// how Monaco's API works - there's no per-editor-instance registration), so
// it guards itself by comparing the model being completed against this
// editor's own model and returning no suggestions for any other model -
// otherwise it would also offer suggestions inside the unrelated JSON Viewer
// tool's own Monaco instances, which use the same 'json' language id.
export default function MonacoBodyEditor({ value, onChange, onEditorMount, language = 'json', variableNames = [], theme = 'vs' }) {
  const editorRef = useRef(null);
  const variableNamesRef = useRef(variableNames);
  const decorationIdsRef = useRef([]);
  const providerDisposableRef = useRef(null);
  const markerDisposableRef = useRef(null);
  const filteringMarkersRef = useRef(false);
  const suppressTimerRef = useRef(0);

  useEffect(() => {
    variableNamesRef.current = variableNames;
    applyDecorations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableNames]);

  useEffect(() => {
    return () => {
      providerDisposableRef.current?.dispose();
      markerDisposableRef.current?.dispose();
      window.clearTimeout(suppressTimerRef.current);
    };
  }, []);

  function markerComesFromToken(model, marker, tokens) {
    const start = model.getOffsetAt({ lineNumber: marker.startLineNumber, column: marker.startColumn });
    const end = model.getOffsetAt({ lineNumber: marker.endLineNumber, column: marker.endColumn });
    return tokens.some((token) => {
      if (start < token.end && end > token.start) return true;
      const tokenEnd = model.getPositionAt(token.end);
      return marker.startLineNumber === tokenEnd.lineNumber && marker.startColumn === tokenEnd.column;
    });
  }

  function suppressVariableMarkers(editor) {
    if (language !== 'json' || filteringMarkersRef.current || !editor) return;
    const model = editor.getModel();
    if (!model) return;
    const tokens = findVariableTokens(model.getValue(), variableNamesRef.current);
    if (!tokens.length) return;
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    const byOwner = new Map();
    markers.forEach((marker) => {
      if (!byOwner.has(marker.owner)) byOwner.set(marker.owner, []);
      byOwner.get(marker.owner).push(marker);
    });
    filteringMarkersRef.current = true;
    byOwner.forEach((list, owner) => {
      const kept = list.filter((marker) => !markerComesFromToken(model, marker, tokens));
      if (kept.length !== list.length) monaco.editor.setModelMarkers(model, owner, kept);
    });
    filteringMarkersRef.current = false;
  }

  // Monaco delivers marker changes on a microtask and drops a change fired
  // from inside that delivery. Clearing the variable markers immediately
  // deletes them without ever removing the red underline, so wait a turn.
  function scheduleSuppress(editor) {
    if (suppressTimerRef.current) return;
    suppressTimerRef.current = window.setTimeout(() => {
      suppressTimerRef.current = 0;
      suppressVariableMarkers(editor);
    }, 0);
  }

  function applyDecorations(text) {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const content = text ?? model.getValue();
    const tokens = findVariableTokens(content, variableNamesRef.current);
    const decorations = tokens.map((token) => {
      const start = model.getPositionAt(token.start);
      const end = model.getPositionAt(token.end);
      return {
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: { inlineClassName: token.known ? 'var-token-known' : 'var-token-unknown' },
      };
    });
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }

  function handleMount(editor) {
    editorRef.current = editor;
    applyDecorations(value);
    const thisModel = editor.getModel();
    // key={language} on the <Editor> below forces a full remount on every
    // JSON<->Text toggle, which calls handleMount again - dispose whatever
    // provider the previous mount registered first, or each toggle leaks a
    // permanently-registered global completion provider for the old
    // language (the unmount-only cleanup effect never fires on a remount).
    providerDisposableRef.current?.dispose();
    markerDisposableRef.current?.dispose();
    markerDisposableRef.current = monaco.editor.onDidChangeMarkers((uris) => {
      if (uris.some((uri) => uri.toString() === thisModel.uri.toString())) scheduleSuppress(editor);
    });
    scheduleSuppress(editor);
    providerDisposableRef.current = monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['{'],
      provideCompletionItems(model, position) {
        if (model.uri.toString() !== thisModel.uri.toString()) {
          return { suggestions: [] };
        }
        const names = variableNamesRef.current;
        if (names.length === 0) return { suggestions: [] };
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const trigger = detectVariableTrigger(textBeforeCursor, textBeforeCursor.length);
        if (!trigger) return { suggestions: [] };
        const wordStartColumn = position.column - trigger.query.length;
        return {
          suggestions: names
            .filter((name) => name.toLowerCase().includes(trigger.query.toLowerCase()))
            .map((name) => ({
              label: `{{${name}}}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: `${name}}}`,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: wordStartColumn,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            })),
        };
      },
    });
    onEditorMount?.(editor);
  }

  return (
    <Editor
      key={language}
      height="100%"
      language={language}
      theme={theme}
      value={value}
      onChange={(newValue) => {
        const next = newValue ?? '';
        onChange?.(next);
        applyDecorations(next);
      }}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        automaticLayout: true,
        wordWrap: 'on',
        folding: language === 'json',
        scrollBeyondLastLine: false,
      }}
    />
  );
}
