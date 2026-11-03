import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import monacoEditorPkg from 'vite-plugin-monaco-editor';

// vite-plugin-monaco-editor's CJS->ESM interop double-wraps its default
// export: the real plugin function is at monacoEditorPkg.default, not
// monacoEditorPkg itself. Confirmed by inspecting the installed package
// directly (1.1.0) - importing monacoEditorPkg and calling it as a function
// throws "monacoEditorPkg is not a function".
const monacoEditorPlugin = monacoEditorPkg.default;

export default defineConfig({
  plugins: [
    react(),
    // Scoped to JSON only - this is a JSON-focused tool, not a general code
    // editor, so we skip bundling css/html/typescript workers and the ~60
    // syntax-highlighting language chunks Monaco ships by default. Confirmed
    // via a real build: unscoped = 94 output files / 4.28MB main bundle;
    // scoped = 7 files / ~780KB gzip total.
    monacoEditorPlugin({ languageWorkers: ['editorWorkerService', 'json'] }),
  ],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
});
