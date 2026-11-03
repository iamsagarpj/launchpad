import { useEffect, useRef, useState } from 'react';
import { useEnvironments } from '../hooks/useEnvironments.js';
import { useCollections } from '../hooks/useCollections.js';
import { formatJsonWithVariables } from '../api-client/bodyVariableSupport.js';
import { executeRequest } from '../api-client/executeRequest.js';
import { fromCurl } from '../api-client/curl.js';
import { exportCollectionPostman, importCollection } from '../api-client/collectionFormat.js';
import { exportEnvironmentPostman, importEnvironment } from '../api-client/environmentsLogic.js';
import { collectionFromOpenApi } from '../api-client/openApiImport.js';
import { collectionToFolder, findSiblingByName, siblingCopyName } from '../api-client/importPlacement.js';
import { runPostResponseScript } from '../api-client/postResponseScript.js';
import { runPreRequestScript } from '../api-client/preRequestScript.js';
import { sendPrepared } from '../api-client/sendFlow.js';
import { listRequests } from '../api-client/runner.js';
import {
  SUITE_STORAGE_KEY,
  applyBearerFromVariable,
  applyPatchToRows,
  loadSuiteConfig,
  matchEnvironmentName,
  normalizeSuiteDraft,
  serializeSuiteConfig,
  signInSuite,
  suiteVariablePatch,
  tokenNeedsRefresh,
  validateSuiteDraft,
  withSuiteVariables,
} from '../api-client/apiSuites.js';
import { findNode } from '../api-client/collectionsLogic.js';
import {
  changedVariables,
  overlayScriptWrites,
  resolveTabVariables,
  scriptHome,
  variablesForRequest,
  variablesForScope,
} from '../api-client/scopeVariables.js';
import { pushHistory } from '../api-client/historyLogic.js';
import { toCurlSnippet, toJsFetchSnippet, toPythonRequestsSnippet } from '../api-client/codeSnippets.js';
import KeyValueEditor from '../api-client/KeyValueEditor.jsx';
import VariableSuggestInput from '../api-client/VariableSuggestInput.jsx';
import MonacoJsonEditor from '../json-viewer/MonacoJsonEditor.jsx';
import MonacoBodyEditor from '../api-client/MonacoBodyEditor.jsx';
import CopyIcon from '../components/icons/CopyIcon.jsx';
import SearchIcon from '../components/icons/SearchIcon.jsx';
import TrashIcon from '../components/icons/TrashIcon.jsx';
import DownloadIcon from '../components/icons/DownloadIcon.jsx';
import ExpandIcon from '../components/icons/ExpandIcon.jsx';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SECTIONS = ['Params', 'Headers', 'Body', 'Auth', 'Scripts', 'Code'];
const CODE_LANGUAGES = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
];
const COMMON_HEADER_NAMES = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Host',
  'If-Modified-Since',
  'If-None-Match',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Api-Key',
  'X-Correlation-Id',
  'X-Forwarded-For',
  'X-Request-Id',
  'X-Requested-With',
];

const EMPTY_REQUEST = {
  method: 'GET',
  url: '',
  queryParams: [],
  headers: [],
  bodyType: 'none',
  body: '',
  formParams: [],
  graphqlVariables: '',
  auth: { type: 'none' },
  script: '',
  preRequest: '',
};

const BODY_TYPES = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'form', label: 'Form' },
  { id: 'multipart', label: 'Multipart' },
  { id: 'graphql', label: 'GraphQL' },
];

const AUTH_TYPES = [
  { id: 'none', label: 'None' },
  { id: 'bearer', label: 'Bearer' },
  { id: 'basic', label: 'Basic' },
  { id: 'apikey', label: 'API Key' },
  { id: 'oauth2', label: 'OAuth2' },
];

const COOKIE_KEY = 'launchpad-api-cookies';
const HISTORY_KEY = 'launchpad-api-history';

const CURL_PASTE_PATTERN = /^\s*curl\s/i;
const TOAST_ICONS = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };
const TABS_STORAGE_KEY = 'launchpad-api-tabs';
const ACTIVE_TAB_STORAGE_KEY = 'launchpad-api-active-tab';
const EDITOR_HEIGHT_STORAGE_KEY = 'launchpad-api-editor-height';
const DEFAULT_EDITOR_HEIGHT = 440;
const SIDEBAR_WIDTH_STORAGE_KEY = 'launchpad-api-sidebar-width';
const DEFAULT_SIDEBAR_WIDTH = 272;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 520;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function tryPrettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// Total request count across a folder tree, for the collection header's
// count badge (today that badge showed collection.requests.length - a flat
// count; this recurses into folders so the badge still means "how many
// requests are in here", not "how many top-level items").
function countItems(items) {
  return items.reduce((total, item) => (item.type === 'folder' ? total + countItems(item.items) : total + 1), 0);
}

function generateSnippet(language, request, variables) {
  if (language === 'javascript') return toJsFetchSnippet(request, variables);
  if (language === 'python') return toPythonRequestsSnippet(request, variables);
  return toCurlSnippet(request, variables);
}

function createTab(overrides = {}) {
  return {
    label: 'Untitled',
    request: EMPTY_REQUEST,
    response: null,
    scriptResult: null,
    loading: false,
    section: 'Params',
    curlText: '',
    curlImportOpen: false,
    curlImportError: null,
    saveName: '',
    saveCollectionName: '',
    saveItemId: null,
    saveParentId: null,
    codeLang: 'curl',
    ...overrides,
  };
}

function loadPersistedTabs() {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((tab) => ({ ...createTab(), ...tab, loading: false }));
  } catch {
    return null;
  }
}

export default function ApiClientPage() {
  const tabIdRef = useRef(1);
  const [tabs, setTabs] = useState(() => {
    const restored = loadPersistedTabs();
    if (restored) {
      tabIdRef.current = Math.max(...restored.map((t) => t.id || 0), 1);
      return restored;
    }
    return [{ id: tabIdRef.current, ...createTab() }];
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    const stored = Number(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY));
    return tabs.some((t) => t.id === stored) ? stored : tabs[0].id;
  });
  const [envEditorOpen, setEnvEditorOpen] = useState(false);
  const [variableEditor, setVariableEditor] = useState(null);
  const [importPrompt, setImportPrompt] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [envDiskReady, setEnvDiskReady] = useState(false);
  const [envDraftName, setEnvDraftName] = useState('');
  const [envDraftVars, setEnvDraftVars] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedCollections, setExpandedCollections] = useState({});
  const [dragItemId, setDragItemId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { collectionName, parentId, index } | null
  const [importError, setImportError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalTabId, setSaveModalTabId] = useState(null);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalCollection, setSaveModalCollection] = useState('');
  const [saveModalNewCollection, setSaveModalNewCollection] = useState(false);
  const [saveModalNewCollectionName, setSaveModalNewCollectionName] = useState('');
  const [saveModalParentId, setSaveModalParentId] = useState(null);
  const [saveModalNewFolder, setSaveModalNewFolder] = useState(false);
  const [saveModalNewFolderName, setSaveModalNewFolderName] = useState('');
  const [newCollectionModalOpen, setNewCollectionModalOpen] = useState(false);
  const [newCollectionDraftName, setNewCollectionDraftName] = useState('');
  const [editorHeight, setEditorHeight] = useState(() => {
    const stored = Number(localStorage.getItem(EDITOR_HEIGHT_STORAGE_KEY));
    return stored > 150 ? stored : DEFAULT_EDITOR_HEIGHT;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return stored >= MIN_SIDEBAR_WIDTH && stored <= MAX_SIDEBAR_WIDTH ? stored : DEFAULT_SIDEBAR_WIDTH;
  });

  const environments = useEnvironments();
  const collections = useCollections();
  const fileInputRef = useRef(null);
  const envFileRef = useRef(null);
  const multipartFileRef = useRef(null);
  const [cookies, setCookies] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(COOKIE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [history, setHistory] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [runner, setRunner] = useState(null);
  const [suiteConfig, setSuiteConfig] = useState(() => loadSuiteConfig(localStorage.getItem(SUITE_STORAGE_KEY)));
  const [suiteBusy, setSuiteBusy] = useState(false);
  const [suiteStatus, setSuiteStatus] = useState('');
  const [suiteDraft, setSuiteDraft] = useState(null);
  const toastIdRef = useRef(0);
  const suiteBusyRef = useRef(false);
  const wasFolderConnectedRef = useRef(false);
  const pageRef = useRef(null);
  const mainRef = useRef(null);
  const editorHeightRef = useRef(editorHeight);
  const sidebarWidthRef = useRef(sidebarWidth);
  const resizeModeRef = useRef(null);
  const responseEditorRef = useRef(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const environmentLayer = {
    name: environments.active?.name || 'Environment',
    variables: environments.active?.variables || {},
  };
  const variables = resolveTabVariables(collections.collections, activeTab, environmentLayer).values;
  const variableNames = Object.keys(variables);

  function patchTab(id, patch) {
    setTabs((prev) => prev.map((tab) => (tab.id === id ? { ...tab, ...(typeof patch === 'function' ? patch(tab) : patch) } : tab)));
  }

  function patchActiveTab(patch) {
    patchTab(activeTabId, patch);
  }

  function updateField(field, value) {
    patchActiveTab((tab) => ({
      request: { ...tab.request, [field]: value },
      saveDirty: Boolean(tab.saveName),
    }));
  }

  function pushToast(type, message, duration = 4000) {
    const id = (toastIdRef.current += 1);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, String(activeTabId));
  }, [activeTabId]);

  useEffect(() => {
    editorHeightRef.current = editorHeight;
  }, [editorHeight]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Drag handling is registered once. The active handle is tracked in a ref
  // so the listeners aren't torn down and rebuilt on every pixel of drag.
  useEffect(() => {
    function handleMouseMove(event) {
      if (resizeModeRef.current === 'editor' && mainRef.current) {
        const rect = mainRef.current.getBoundingClientRect();
        const next = Math.min(Math.max(event.clientY - rect.top, 220), rect.height - 160);
        editorHeightRef.current = next;
        setEditorHeight(next);
      }
      if (resizeModeRef.current === 'sidebar' && pageRef.current) {
        const rect = pageRef.current.getBoundingClientRect();
        const max = Math.min(MAX_SIDEBAR_WIDTH, rect.width - 360);
        const next = Math.min(Math.max(event.clientX - rect.left, MIN_SIDEBAR_WIDTH), Math.max(MIN_SIDEBAR_WIDTH, max));
        sidebarWidthRef.current = next;
        setSidebarWidth(next);
      }
    }
    function handleMouseUp() {
      if (resizeModeRef.current === 'editor') {
        localStorage.setItem(EDITOR_HEIGHT_STORAGE_KEY, String(editorHeightRef.current));
      }
      if (resizeModeRef.current === 'sidebar') {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidthRef.current));
      }
      if (resizeModeRef.current) {
        resizeModeRef.current = null;
        document.body.style.cursor = '';
      }
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  function handleResizerMouseDown(event) {
    event.preventDefault();
    resizeModeRef.current = 'editor';
    document.body.style.cursor = 'row-resize';
  }

  function handleSidebarResizeMouseDown(event) {
    event.preventDefault();
    resizeModeRef.current = 'sidebar';
    document.body.style.cursor = 'col-resize';
  }

  useEffect(() => {
    if (!fullscreen) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setFullscreen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen]);

  // Cmd/Ctrl+Enter sends the active tab's request, matching the convention
  // every Postman-like tool uses.
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (activeTab.request.url && !activeTab.loading) {
          handleSend(activeTab.id);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.id, activeTab.request.url, activeTab.loading]);

  // Cmd/Ctrl+S saves the active tab - opens the Save modal (name + which
  // collection) the first time, otherwise re-saves silently under the
  // existing name/collection (same as Postman).
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSaveRequest();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reacts to the hook's connect/disconnect state rather than the triggering
  // function returning a value, so the toast fires correctly whether the
  // connection happened via a manual click or the silent auto-restore on
  // mount.
  useEffect(() => {
    const isConnected = collections.isFolderConnected;
    if (isConnected && !wasFolderConnectedRef.current) {
      pushToast(
        'success',
        `📁 Connected to "${collections.folderName}" — requests now save as files here. Avoid hardcoding secrets; use {{variables}} instead.`,
        7000
      );
    } else if (!isConnected && wasFolderConnectedRef.current) {
      pushToast('info', 'Disconnected — back to automatic browser storage.');
    }
    wasFolderConnectedRef.current = isConnected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections.isFolderConnected, collections.folderName]);

  useEffect(() => {
    if (!collections.isFolderConnected || !collections.folderLoadId) {
      setEnvDiskReady(false);
      return;
    }
    environments.mergeDisk(collections.folderEnvironments);
    setEnvDiskReady(true);
    // folderLoadId changes once per successful connect. mergeDisk reads the
    // environments loaded in that same update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections.isFolderConnected, collections.folderLoadId]);

  useEffect(() => {
    if (!envDiskReady || !collections.isFolderConnected) return;
    collections.persistEnvironments(environments.environments, environments.activeName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envDiskReady, environments.environments, environments.activeName, collections.isFolderConnected]);

  useEffect(() => {
    if (collections.skippedFiles.length > 0) {
      pushToast(
        'warning',
        `${collections.skippedFiles.length} file(s) in this folder couldn't be read and were skipped: ${collections.skippedFiles.map((f) => f.fileName).join(', ')}`,
        7000
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections.skippedFiles]);

  useEffect(() => {
    if (collections.folderError) {
      pushToast('error', collections.folderError, 6000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections.folderError]);

  function handleNewTab() {
    tabIdRef.current += 1;
    const tab = { id: tabIdRef.current, ...createTab() };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }

  function handleCloseTab(id) {
    const index = tabs.findIndex((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);
    if (remaining.length === 0) {
      tabIdRef.current += 1;
      const fresh = { id: tabIdRef.current, ...createTab() };
      setTabs([fresh]);
      setActiveTabId(fresh.id);
      return;
    }
    setTabs(remaining);
    if (activeTabId === id) {
      const fallback = remaining[Math.max(0, index - 1)];
      setActiveTabId(fallback.id);
    }
  }

  useEffect(() => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify(cookies));
  }, [cookies]);

  useEffect(() => {
    localStorage.setItem(SUITE_STORAGE_KEY, serializeSuiteConfig(suiteConfig));
  }, [suiteConfig]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  function persistSuitePatch(patch, scriptUpdates) {
    if (!environments.active) return null;
    const current = environments.active.variables || {};
    const changed = {};
    Object.entries({ ...patch, ...scriptUpdates }).forEach(([key, value]) => {
      if (current[key] !== value) changed[key] = value;
    });
    if (!Object.keys(changed).length) return null;
    environments.saveEnvironment({
      name: environments.active.name,
      variables: { ...current, ...changed },
    });
    return { kind: 'environment', name: environments.active.name };
  }

  function persistFolderScript(collectionName, folderId, updates, remembered) {
    const keys = Object.keys(updates || {});
    if (!collectionName || !keys.length) return null;
    const collection = collections.collections.find((item) => item.name === collectionName);
    if (!collection) return null;
    const storeKey = folderId || '';
    const nextRemembered = { ...(remembered?.[storeKey] || {}) };
    keys.forEach((key) => {
      nextRemembered[key] = updates[key] == null ? '' : String(updates[key]);
    });
    if (remembered) remembered[storeKey] = nextRemembered;
    const node = folderId ? findNode(collection.items, folderId) : collection;
    if (!node) return null;
    collections.setVariables(collectionName, folderId, { ...(node.variables || {}), ...nextRemembered });
    return folderId ? { kind: 'folder', name: node.name } : { kind: 'collection', name: collection.name };
  }

  function splitScriptUpdates(allUpdates, postUpdates) {
    const folder = {};
    const environment = {};
    Object.entries(allUpdates || {}).forEach(([key, value]) => {
      if (postUpdates && Object.prototype.hasOwnProperty.call(postUpdates, key)) folder[key] = postUpdates[key];
      else environment[key] = value;
    });
    return { folder, environment };
  }

  async function prepareSuitePatch() {
    const suite = suiteConfig.suites.find((item) => item.id === suiteConfig.activeId);
    if (!suite) return {};
    const envName = matchEnvironmentName(environments.environments, suite);
    if (String(environments.activeName || '').toLowerCase() !== envName.toLowerCase()) return {};
    const variableName = suiteConfig.recipe.variableName;
    const current = environments.active?.variables || {};
    let token = current[variableName] || '';
    const exp = suiteConfig.tokens?.[suite.id]?.exp || 0;
    if (tokenNeedsRefresh(token, exp)) {
      const outcome = await signInSuite(suite, suiteConfig.recipe, executeRequest);
      if (outcome.ok) {
        token = outcome.token;
        setSuiteConfig((prev) => ({
          ...prev,
          tokens: { ...(prev.tokens || {}), [suite.id]: { exp: outcome.exp || 0 } },
        }));
        setSuiteStatus(`${suite.label} token is ready`);
      } else {
        pushToast('warning', `${suite.label} sign-in failed. ${outcome.error}`, 7000);
      }
    }
    return suiteVariablePatch(suite, token, variableName);
  }

  async function handleSelectSuite(suiteId) {
    if (suiteBusyRef.current) return;
    const suite = suiteConfig.suites.find((item) => item.id === suiteId);
    if (!suite) return;
    suiteBusyRef.current = true;
    setSuiteBusy(true);
    setSuiteConfig((prev) => ({ ...prev, activeId: suiteId }));
    setSuiteStatus(`Signing in to ${suite.label}…`);
    const outcome = await signInSuite(suite, suiteConfig.recipe, executeRequest);
    const envName = matchEnvironmentName(environments.environments, suite);
    const existing = environments.environments.find((item) => item.name === envName);
    const variableName = suiteConfig.recipe.variableName;
    environments.saveEnvironment({
      name: envName,
      variables: withSuiteVariables(existing, suite, outcome.token, variableName),
    });
    environments.setActiveName(envName);
    if (outcome.ok) {
      setSuiteConfig((prev) => ({
        ...prev,
        activeId: suiteId,
        tokens: { ...(prev.tokens || {}), [suite.id]: { exp: outcome.exp || 0 } },
      }));
      setSuiteStatus(`${suite.label} token is ready`);
      pushToast('success', `${suite.label} is active. BASE_PATH is set and ${variableName} is sent as a Bearer token.`);
    } else {
      setSuiteStatus(`${suite.label} sign-in failed`);
      pushToast('error', outcome.error, 7000);
    }
    suiteBusyRef.current = false;
    setSuiteBusy(false);
  }

  function openSuiteEditor() {
    setSuiteDraft({
      suites: suiteConfig.suites.map((suite) => ({ ...suite })),
      recipe: { ...suiteConfig.recipe },
    });
  }

  function saveSuiteDraft() {
    const error = validateSuiteDraft(suiteDraft);
    if (error) {
      pushToast('error', error, 6000);
      return;
    }
    const normalized = normalizeSuiteDraft(suiteDraft);
    setSuiteConfig((prev) => ({ ...prev, suites: normalized.suites, recipe: normalized.recipe }));
    setSuiteDraft(null);
    pushToast('success', 'Sign-in request saved. Choose the suite again to use it.');
  }

  function updateSuiteDraftSuite(id, field, value) {
    setSuiteDraft((current) => (
      current
        ? { ...current, suites: current.suites.map((suite) => (suite.id === id ? { ...suite, [field]: value } : suite)) }
        : current
    ));
  }

  async function handleSend(tabId) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const patch = await prepareSuitePatch();
    const sent = { ...resolveTabVariables(collections.collections, tab, environmentLayer).values, ...patch };
    patchTab(tabId, { loading: true, response: null, scriptResult: null });
    const step = await sendPrepared({
      request: applyBearerFromVariable(tab.request, sent, suiteConfig.recipe.variableName),
      variables: sent,
      jar: cookies,
      execute: executeRequest,
      runPre: runPreRequestScript,
      runPost: runPostResponseScript,
    });
    setCookies(step.jar || []);
    const postUpdates = step.scriptOutcome?.ok ? step.scriptOutcome.envUpdates : {};
    const split = splitScriptUpdates(changedVariables(sent, step.variables), postUpdates);
    persistSuitePatch(patch, split.environment);
    const collection = collections.collections.find((item) => item.name === tab.saveCollectionName);
    const home = collection && tab.saveItemId ? scriptHome(collection, tab.saveItemId) : null;
    const savedOn = home
      ? persistFolderScript(tab.saveCollectionName, home.folderId, postUpdates)
      : persistSuitePatch({}, postUpdates);
    const response = step.result || { ok: false, error: step.error || 'Request failed' };
    const scriptResult = step.scriptOutcome ? { ...step.scriptOutcome, savedOn } : null;
    patchTab(tabId, { response, scriptResult, loading: false });
    setHistory((prev) => pushHistory(prev, {
      method: tab.request.method,
      url: response.url || tab.request.url,
      status: response.status,
      ok: Boolean(response.ok),
      request: tab.request,
    }));
  }

  async function handleRunScope(title, collectionName, folderId) {
    const collection = collections.collections.find((item) => item.name === collectionName);
    if (!collection) return;
    const scopeItems = folderId ? findNode(collection.items, folderId)?.items || [] : collection.items;
    const requests = listRequests(scopeItems);
    if (!requests.length) {
      pushToast('info', 'Nothing to run.');
      return;
    }
    const patch = await prepareSuitePatch();
    const variableRows = applyPatchToRows(variablesForScope(collection, folderId, environmentLayer).rows, patch);
    const authNote = patch[suiteConfig.recipe.variableName]
      ? `Authorization: Bearer ${suiteConfig.recipe.variableName}`
      : '';
    setRunner({ title, results: [], running: true, variableRows, authNote });
    let scriptVars = {};
    const folderWrites = {};
    let jar = cookies;
    const results = [];
    for (const item of requests) {
      const resolved = variablesForRequest(collection, item.id, environmentLayer).values;
      const sent = { ...resolved, ...overlayScriptWrites(collection, item.id, folderWrites), ...patch, ...scriptVars };
      const step = await sendPrepared({
        request: applyBearerFromVariable(item.request, sent, suiteConfig.recipe.variableName),
        variables: sent,
        jar,
        execute: executeRequest,
        runPre: runPreRequestScript,
        runPost: runPostResponseScript,
      });
      const postUpdates = step.scriptOutcome?.ok ? step.scriptOutcome.envUpdates : {};
      const split = splitScriptUpdates(changedVariables(sent, step.variables), postUpdates);
      const home = scriptHome(collection, item.id);
      if (home) persistFolderScript(collection.name, home.folderId, postUpdates, folderWrites);
      else Object.assign(scriptVars, postUpdates);
      scriptVars = { ...scriptVars, ...split.environment };
      jar = step.jar || jar;
      const response = step.result;
      const tests = step.scriptOutcome?.tests || [];
      const httpOk = Boolean(response?.ok) && response.status < 400;
      results.push({
        name: item.name,
        method: item.request.method,
        url: response?.url || item.request.url,
        status: response?.status,
        statusText: response?.statusText,
        durationMs: response?.durationMs,
        body: response?.body || '',
        ok: httpOk && tests.every((entry) => entry.ok) && step.ok,
        error: response?.error || step.error,
        tests,
        request: item.request,
        response: response || { ok: false, error: step.error || 'Request failed' },
      });
      setRunner({ title, results: [...results], running: requests.length !== results.length, variableRows, authNote });
    }
    setCookies(jar);
    persistSuitePatch(patch, scriptVars);
    setRunner({ title, results, running: false, variableRows, authNote });
  }

  function openVariableEditor(collectionName, folderId, title) {
    const collection = collections.collections.find((item) => item.name === collectionName);
    const source = folderId == null ? collection : findNode(collection?.items, folderId);
    const rows = Object.entries(source?.variables || {}).map(([key, value]) => ({ key, value }));
    setVariableEditor({
      collectionName,
      folderId,
      title,
      rows: rows.length ? rows : [{ key: '', value: '' }],
    });
  }

  function saveVariableEditor() {
    if (!variableEditor) return;
    const next = {};
    variableEditor.rows.forEach((row) => {
      const key = String(row.key || '').trim();
      if (key) next[key] = row.value ?? '';
    });
    collections.setVariables(variableEditor.collectionName, variableEditor.folderId, next);
    setVariableEditor(null);
  }

  function openRunnerResult(entry) {
    tabIdRef.current += 1;
    const tab = {
      id: tabIdRef.current,
      ...createTab({
        label: entry.name || 'Run result',
        request: { ...EMPTY_REQUEST, ...(entry.request || {}) },
        response: entry.response || null,
      }),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setRunner(null);
  }

  function openHistory(entry) {
    tabIdRef.current += 1;
    const tab = {
      id: tabIdRef.current,
      ...createTab({
        label: entry.request?.url || entry.url || 'History',
        request: { ...EMPTY_REQUEST, ...(entry.request || {}) },
      }),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }

  function applyCurl(text) {
    const result = fromCurl(text);
    if (!result.ok) {
      return result;
    }
    patchActiveTab((tab) => ({ request: { script: '', ...result.request }, saveDirty: Boolean(tab.saveName) }));
    return result;
  }

  // Postman-style "paste a curl command and it just becomes a request" -
  // detected on paste into the URL bar itself, no extra import step needed.
  function handleUrlPaste(event) {
    const text = event.clipboardData.getData('text');
    if (!CURL_PASTE_PATTERN.test(text)) {
      return;
    }
    event.preventDefault();
    const result = applyCurl(text);
    if (result.ok) {
      pushToast('success', 'Imported request from pasted cURL command');
    } else {
      patchActiveTab({ curlText: text, curlImportOpen: true, curlImportError: result.error });
    }
  }

  function handleImportCurl() {
    const result = applyCurl(activeTab.curlText);
    if (!result.ok) {
      patchActiveTab({ curlImportError: result.error });
      return;
    }
    patchActiveTab({ curlImportOpen: false, curlImportError: null, curlText: '' });
  }

  function handleBeautifyBody() {
    try {
      updateField('body', formatJsonWithVariables(activeTab.request.body));
      pushToast('success', 'Formatted');
    } catch (err) {
      pushToast('error', `Can't format - invalid JSON: ${err.message}`);
    }
  }

  // Shared by every save entry point (tab rename, the request-bar Save
  // button, Cmd/Ctrl+S, and the Save modal's confirm) - this does the actual
  // write, routed to a file or localStorage inside collections.saveRequest
  // depending on whether a folder is connected. Always takes an explicit
  // collection so nothing guesses where a request should live.
  function saveTabAsRequest(tab, rawName, collectionName, parentId) {
    const name = (rawName || '').trim();
    const targetCollection = collectionName || tab.saveCollectionName;
    const targetParentId = parentId !== undefined ? parentId : tab.saveParentId;
    if (!name || !targetCollection) return;
    const id = collections.saveRequest(targetCollection, targetParentId, { id: tab.saveItemId, name, request: tab.request });
    pushToast('success', collections.isFolderConnected ? `Saved "${name}" to folder` : `Saved "${name}" in "${targetCollection}"`);
    patchTab(tab.id, {
      saveName: name,
      saveCollectionName: targetCollection,
      saveParentId: targetParentId,
      saveItemId: id,
      saveDirty: false,
      label: name,
    });
  }

  // First save of a tab always asks which collection it belongs in (that's
  // the whole point of the modal); once a tab has been saved once, further
  // saves silently reuse the same name/collection, matching how Postman only
  // asks on the first save and treats Ctrl+S afterward as a quiet update.
  function handleSaveRequest() {
    if (activeTab.saveName) {
      saveTabAsRequest(activeTab, activeTab.saveName, activeTab.saveCollectionName, activeTab.saveParentId);
    } else {
      openSaveModal(activeTab, activeTab.label !== 'Untitled' ? activeTab.label : '');
    }
  }

  function openSaveModal(tab, prefillName) {
    const name = (prefillName ?? tab.saveName ?? '').trim();
    setSaveModalTabId(tab.id);
    setSaveModalName(name);
    setSaveModalParentId(tab.saveParentId ?? null);
    setSaveModalNewFolder(false);
    setSaveModalNewFolderName('');
    if (collections.isFolderConnected) {
      setSaveModalCollection(collections.collections[0]?.name || '');
      setSaveModalNewCollection(false);
    } else if (collections.collections.length === 0) {
      setSaveModalCollection('__new__');
      setSaveModalNewCollection(true);
      setSaveModalNewCollectionName('My Collection');
    } else {
      setSaveModalCollection(tab.saveCollectionName || collections.collections[0].name);
      setSaveModalNewCollection(false);
      setSaveModalNewCollectionName('');
    }
    setSaveModalOpen(true);
  }

  function closeSaveModal() {
    setSaveModalOpen(false);
    setSaveModalTabId(null);
  }

  function handleSaveModalCollectionChange(value) {
    setSaveModalParentId(null);
    setSaveModalNewFolder(false);
    setSaveModalNewFolderName('');
    if (value === '__new__') {
      setSaveModalNewCollection(true);
      setSaveModalCollection('__new__');
    } else {
      setSaveModalNewCollection(false);
      setSaveModalCollection(value);
    }
  }

  function handleSaveModalFolderChange(value) {
    if (value === '__new_folder__') {
      setSaveModalNewFolder(true);
      setSaveModalNewFolderName('');
    } else {
      setSaveModalNewFolder(false);
      setSaveModalParentId(value === '' ? null : value);
    }
  }

  function confirmSaveModal() {
    const name = saveModalName.trim();
    const tab = tabs.find((t) => t.id === saveModalTabId);
    if (!name || !tab) return;
    let targetCollection = saveModalCollection;
    if (saveModalNewCollection) {
      targetCollection = saveModalNewCollectionName.trim();
      if (!targetCollection) return;
      collections.addCollection(targetCollection);
    }
    if (!targetCollection) return;
    let targetParentId = saveModalParentId;
    if (saveModalNewFolder) {
      const folderName = saveModalNewFolderName.trim();
      if (!folderName) return;
      targetParentId = collections.addFolder(targetCollection, saveModalParentId, folderName);
    }
    saveTabAsRequest(tab, name, targetCollection, targetParentId);
    closeSaveModal();
  }

  function startEditingTabLabel(tab) {
    if (tab.id !== activeTabId) {
      setActiveTabId(tab.id);
      return;
    }
    setEditingTabId(tab.id);
    setEditingLabel(tab.label === 'Untitled' ? '' : tab.label);
  }

  function commitTabLabelEdit(tab) {
    const name = editingLabel.trim();
    setEditingTabId(null);
    if (!name || name === tab.label) return;
    if (tab.saveName) {
      // Already saved before - renaming just updates the existing entry in
      // place, same collection and folder, no need to ask again.
      saveTabAsRequest(tab, name, tab.saveCollectionName, tab.saveParentId);
    } else {
      openSaveModal(tab, name);
    }
  }

  function handleLoadRequest(collectionName, entry, parentId) {
    tabIdRef.current += 1;
    const tab = {
      id: tabIdRef.current,
      ...createTab({
        request: { script: '', ...entry.request },
        label: entry.name,
        saveName: entry.name,
        saveCollectionName: collectionName,
        saveItemId: entry.id,
        saveParentId: parentId ?? null,
        saveDirty: false,
      }),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }

  function handleNewCollection() {
    setNewCollectionDraftName('');
    setNewCollectionModalOpen(true);
  }

  function confirmNewCollection() {
    const name = newCollectionDraftName.trim();
    if (!name) return;
    collections.addCollection(name);
    setNewCollectionModalOpen(false);
  }

  function handleNewFolder(collectionName, parentId) {
    const name = window.prompt('Folder name');
    if (!name || !name.trim()) return;
    collections.addFolder(collectionName, parentId, name.trim());
  }

  function handleDeleteItem(itemId) {
    collections.removeItem(itemId);
  }

  function handleDragStart(event, itemId) {
    // Native dragstart bubbles through every ancestor DOM node - since
    // folder rows are themselves draggable, starting a drag on a request or
    // folder nested inside another folder would otherwise also fire each
    // ancestor's onDragStart as the event bubbles up, with the outermost
    // ancestor's call overwriting dragItemId last and hijacking the drag.
    event.stopPropagation();
    setDragItemId(itemId);
    event.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for drag-and-drop to activate at all.
    event.dataTransfer.setData('text/plain', itemId);
  }

  function handleDragEnd() {
    setDragItemId(null);
    setDropTarget(null);
  }

  function handleRowDragOver(event, collectionName, parentId, index) {
    if (!dragItemId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ collectionName, parentId, index });
  }

  function handleFolderDragOver(event, collectionName, folderId) {
    if (!dragItemId || dragItemId === folderId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ collectionName, parentId: folderId, index: undefined });
  }

  function handleDrop(event) {
    event.preventDefault();
    if (dragItemId && dropTarget) {
      collections.moveItem(dragItemId, dropTarget.collectionName, dropTarget.parentId, dropTarget.index);
    }
    setDragItemId(null);
    setDropTarget(null);
  }

  function toggleCollectionExpanded(name) {
    setExpandedCollections((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function downloadJson(filename, json) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportEnvironment() {
    if (!environments.active) return;
    const slug = environments.active.name.replace(/\s+/g, '-').toLowerCase();
    downloadJson(`${slug}.postman_environment.json`, exportEnvironmentPostman(environments.active));
  }

  function handleImportEnvironment(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importEnvironment(String(reader.result));
      if (!result.ok) {
        pushToast('error', result.error);
        return;
      }
      const existing = environments.environments.find((item) => item.name === result.environment.name);
      const variables = existing ? { ...existing.variables, ...result.environment.variables } : result.environment.variables;
      environments.saveEnvironment({ name: result.environment.name, variables });
      environments.setActiveName(result.environment.name);
      pushToast('success', `Imported environment "${result.environment.name}"`);
    };
    reader.readAsText(file);
  }

  function handleExportCollection(collection) {
    const slug = (collection.name || 'collection').replace(/\s+/g, '-').toLowerCase();
    downloadJson(`${slug}.postman_collection.json`, exportCollectionPostman(collection));
  }

  function importMessage(name, sourceLabel, collection, connected) {
    const where = connected ? ` into "${collections.folderName}"` : ' into this browser';
    const vars = collection.variables && Object.keys(collection.variables).length
      ? ' Its variables stay with this import, so running it uses them and your other environments are left as they are.'
      : '';
    const browserNote = connected ? '' : ' Connect a folder to store imports as files.';
    return `Imported "${name}"${where}${sourceLabel}.${vars}${browserNote}`;
  }

  function beginImport(collection, sourceLabel) {
    const name = collection.name || 'Imported collection';
    if (collections.isFolderConnected) {
      const items = collections.collections[0]?.items || [];
      const conflict = findSiblingByName(items, name);
      if (conflict) {
        setImportPrompt({
          collection,
          name,
          conflictId: conflict.id,
          conflictKind: conflict.type === 'request' ? 'request' : 'folder',
          connected: true,
          sourceLabel,
          customName: '',
          nameError: '',
        });
        return;
      }
      applyConnectedImport(collection, name, null, sourceLabel);
      return;
    }
    const conflict = collections.collections.find((item) => item.name === name);
    if (conflict) {
      setImportPrompt({
        collection,
        name,
        conflictId: null,
        conflictKind: 'collection',
        connected: false,
        sourceLabel,
        customName: '',
        nameError: '',
      });
      return;
    }
    collections.importFullCollection(collection);
    pushToast('success', importMessage(name, sourceLabel, collection, false));
  }

  async function applyConnectedImport(collection, name, replaceId, sourceLabel) {
    setImportBusy(true);
    try {
      await collections.importAsFolder(collectionToFolder(collection, name), { replaceId });
      setImportPrompt(null);
      pushToast('success', importMessage(name, sourceLabel, collection, true));
    } catch (err) {
      pushToast('error', err.message || 'Import failed. Nothing else was changed.');
    } finally {
      setImportBusy(false);
    }
  }

  function confirmImportChoice(choice) {
    if (!importPrompt || importBusy) return;
    const { collection, name, connected, conflictId, sourceLabel } = importPrompt;
    if (choice === 'reject') {
      setImportPrompt(null);
      pushToast('info', 'Import cancelled. Nothing was changed.');
      return;
    }
    const takenNames = connected
      ? (collections.collections[0]?.items || []).map((item) => item.name)
      : collections.collections.map((item) => item.name);
    if (choice === 'rename') {
      const nextName = importPrompt.customName.trim();
      if (!nextName) {
        setImportPrompt({ ...importPrompt, nameError: 'Enter a name for the imported collection.' });
        return;
      }
      if (takenNames.includes(nextName)) {
        setImportPrompt({ ...importPrompt, nameError: `"${nextName}" is already there. Choose another name, or use Keep both.` });
        return;
      }
      if (connected) {
        applyConnectedImport(collection, nextName, null, sourceLabel);
        return;
      }
      collections.importFullCollection({ ...collection, name: nextName });
      setImportPrompt(null);
      pushToast('success', importMessage(nextName, sourceLabel, collection, false));
      return;
    }
    if (choice === 'keep') {
      const nextName = siblingCopyName(takenNames, name);
      if (connected) {
        applyConnectedImport(collection, nextName, null, sourceLabel);
        return;
      }
      collections.importFullCollection({ ...collection, name: nextName });
      setImportPrompt(null);
      pushToast('success', importMessage(nextName, sourceLabel, collection, false));
      return;
    }
    if (connected) {
      applyConnectedImport(collection, name, conflictId, sourceLabel);
      return;
    }
    collections.remove(name);
    collections.importFullCollection({ ...collection, name });
    setImportPrompt(null);
    pushToast('success', importMessage(name, sourceLabel, collection, false));
  }

  function handleImportFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const result = importCollection(text);
      if (result.ok) {
        setImportError(null);
        beginImport(result.collection, '');
        return;
      }
      const spec = collectionFromOpenApi(text);
      if (spec.ok) {
        setImportError(null);
        beginImport(spec.collection, ' from OpenAPI');
        return;
      }
      const looksLikeSpec = text.includes('openapi') || text.includes('swagger');
      setImportError(looksLikeSpec ? spec.error : result.error);
    };
    reader.readAsText(file);
  }

  function handleOpenEnvEditor(env) {
    setEnvDraftName(env ? env.name : '');
    setEnvDraftVars(env ? Object.entries(env.variables).map(([key, value]) => ({ key, value })) : []);
    setEnvEditorOpen(true);
  }

  function handleSaveEnv() {
    const name = envDraftName.trim();
    if (!name) return;
    const variablesObject = {};
    envDraftVars.forEach((row) => {
      if (row.key.trim()) variablesObject[row.key.trim()] = row.value;
    });
    environments.saveEnvironment({ name, variables: variablesObject });
    environments.setActiveName(name);
    setEnvEditorOpen(false);
  }

  const codeSnippet = generateSnippet(activeTab.codeLang, activeTab.request, variables);

  return (
    <div className={`api-page${fullscreen ? ' is-fullscreen' : ''}`} ref={pageRef}>
      <div className="api-toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`api-toast api-toast-${toast.type}`}>
            <span className="api-toast-icon">{TOAST_ICONS[toast.type]}</span>
            <span className="api-toast-message">{toast.message}</span>
            <button className="api-toast-dismiss" onClick={() => dismissToast(toast.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <aside className="api-sidebar" style={{ width: sidebarWidth }}>
        <button className="api-new-request-btn" onClick={handleNewTab}>
          + New Request
        </button>

        <div className="api-sidebar-section">
          <div className="api-sidebar-header">
            <span>API suite</span>
            <div className="api-sidebar-header-actions">
              <button title="Edit the sign-in request" onClick={openSuiteEditor}>
                ✎
              </button>
            </div>
          </div>
          <div className="api-suite-row">
            {suiteConfig.suites.map((suite) => (
              <button
                key={suite.id}
                type="button"
                className={suiteConfig.activeId === suite.id ? 'api-suite-btn is-active' : 'api-suite-btn'}
                disabled={suiteBusy}
                title={`${suite.label}: set BASE_PATH and sign in`}
                onClick={() => handleSelectSuite(suite.id)}
              >
                {suite.label}
              </button>
            ))}
          </div>
          <div className="api-suite-meta">
            {suiteStatus
              || (suiteConfig.suites.find((suite) => suite.id === suiteConfig.activeId)?.basePath
                ?? 'Pick a suite to set BASE_PATH and sign in.')}
          </div>
          <div className="api-sidebar-header">
            <span>Environment</span>
            <div className="api-sidebar-header-actions">
              <button title="Import a Postman environment" onClick={() => envFileRef.current?.click()}>
                ⇪
              </button>
              <button title="Export the active environment for Postman and Bruno" onClick={handleExportEnvironment} disabled={!environments.active}>
                ↓
              </button>
              <button title="New environment" onClick={() => handleOpenEnvEditor(null)}>
                +
              </button>
            </div>
          </div>
          <select
            className="nav-theme-select api-env-select"
            value={environments.activeName}
            onChange={(event) => environments.setActiveName(event.target.value)}
          >
            <option value="">No environment</option>
            {environments.environments.map((env) => (
              <option key={env.name} value={env.name}>
                {env.name}
              </option>
            ))}
          </select>
          <input ref={envFileRef} type="file" accept="application/json,.json" hidden onChange={handleImportEnvironment} />
          {environments.active && (
            <button className="api-env-edit-btn" onClick={() => handleOpenEnvEditor(environments.active)}>
              Edit &quot;{environments.active.name}&quot; variables ({variableNames.length})
            </button>
          )}
          {cookies.length > 0 && (
            <button className="api-env-edit-btn" onClick={() => setCookies([])}>
              Clear {cookies.length} cookie{cookies.length === 1 ? '' : 's'}
            </button>
          )}
        </div>

        <div className="api-sidebar-section">
          <div className="api-sidebar-header">
            <span>Collections</span>
            <div className="api-sidebar-header-actions">
              <button title="Import a Launchpad, Postman, or OpenAPI collection" onClick={() => fileInputRef.current?.click()}>
                ⇪
              </button>
              <button title="New collection" onClick={handleNewCollection}>
                +
              </button>
            </div>
          </div>
          {collections.isFileSystemSupported ? (
            <div className="api-storage-status">
              {collections.isFolderConnected ? (
                <div className="api-folder-connected">
                  <span className="api-folder-dot" />
                  <span className="api-folder-name" title={collections.folderName}>
                    📁 {collections.folderName}
                  </span>
                  <button className="api-folder-disconnect" onClick={collections.disconnectFolder}>
                    Disconnect
                  </button>
                </div>
              ) : collections.needsReconnect ? (
                <button className="api-folder-reconnect-btn" onClick={collections.reconnectFolder}>
                  ⚠ Reconnect to &quot;{collections.folderName}&quot;
                </button>
              ) : (
                <>
                  <div className="api-storage-warning">
                    ⚠ Saving to browser storage only — cleared if you clear site data or cookies.
                  </div>
                  <button className="api-folder-connect-btn" onClick={collections.connectFolder} disabled={collections.folderBusy}>
                    📁 {collections.folderBusy ? 'Connecting…' : 'Connect a folder for permanent storage'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="api-storage-warning">
              ⚠ This browser can&apos;t save to a folder — requests stay in browser storage only. Use Chrome or Edge for
              permanent, file-based storage.
            </div>
          )}

          <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,application/json,text/yaml" hidden onChange={handleImportFile} />
          {importError && <div className="jw-output-message jw-output-error">{importError}</div>}
          {collections.collections.length === 0 && (
            <div className="api-sidebar-empty">No collections yet. Click + to create one, or import a Postman or OpenAPI file.</div>
          )}
          {collections.collections.map((collection) => (
            <div
              className={`api-collection${dropTarget && dropTarget.collectionName === collection.name && dropTarget.parentId === null ? ' is-drop-target' : ''}`}
              key={collection.name}
              onDragOver={(event) => handleFolderDragOver(event, collection.name, null)}
              onDrop={handleDrop}
            >
              <div className="api-collection-header">
                <button className="api-collection-toggle" onClick={() => toggleCollectionExpanded(collection.name)}>
                  <span className={`api-collection-chevron${expandedCollections[collection.name] ? ' expanded' : ''}`}>▸</span>
                  <span className="api-collection-name">{collection.name}</span>
                  <span className="api-collection-count">{countItems(collection.items)}</span>
                </button>
                <div className="api-collection-actions">
                  <button title="Run collection" onClick={() => handleRunScope(collection.name, collection.name, null)}>
                    ▶
                  </button>
                  <button
                    title={Object.keys(collection.variables || {}).length ? `${Object.keys(collection.variables).length} collection variables` : 'Collection variables'}
                    onClick={() => openVariableEditor(collection.name, null, collection.name)}
                  >
                    {Object.keys(collection.variables || {}).length ? `{${Object.keys(collection.variables).length}}` : '{ }'}
                  </button>
                  <button title="New folder" onClick={() => handleNewFolder(collection.name, null)}>
                    📁+
                  </button>
                  <button title="Export as Postman Collection v2.1 (imports in Postman and Bruno)" onClick={() => handleExportCollection(collection)}>
                    <DownloadIcon />
                  </button>
                  {!collections.isFolderConnected && (
                    <button title="Delete collection" onClick={() => collections.remove(collection.name)}>
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
              {expandedCollections[collection.name] && (
                <div className="api-collection-requests">
                  {collection.items.length === 0 && <div className="api-sidebar-empty">No requests saved yet.</div>}
                  {collection.items.map((item, index) => (
                    <TreeNode
                      key={item.id}
                      item={item}
                      collectionName={collection.name}
                      parentId={null}
                      index={index}
                      expandedCollections={expandedCollections}
                      onToggleExpanded={toggleCollectionExpanded}
                      onNewFolder={handleNewFolder}
                      onLoadRequest={handleLoadRequest}
                      onDeleteItem={handleDeleteItem}
                      onRun={handleRunScope}
                      onEditVariables={openVariableEditor}
                      dragItemId={dragItemId}
                      dropTarget={dropTarget}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onRowDragOver={handleRowDragOver}
                      onFolderDragOver={handleFolderDragOver}
                      onDrop={handleDrop}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="api-sidebar-section">
            <div className="api-sidebar-header">
              <span>History</span>
              <button title="Clear history" onClick={() => setHistory([])} disabled={history.length === 0}>
                ✕
              </button>
            </div>
            {history.length === 0 && <div className="api-sidebar-empty">Sent requests show up here.</div>}
            {history.slice(0, 12).map((entry) => (
              <div className="api-saved-row" key={entry.id}>
                <button className="api-saved-link" onClick={() => openHistory(entry)}>
                  <span className={`api-method-badge oapi-method-${(entry.method || 'get').toLowerCase()}`}>{entry.method || 'GET'}</span>
                  {entry.status || '—'} {entry.url}
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div
        className="api-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={handleSidebarResizeMouseDown}
        title="Drag to resize"
      >
        <div className="api-resizer-grip" />
      </div>

      <div className="api-main" ref={mainRef}>
        <div className="api-editor-region" style={{ height: editorHeight }}>
          {/* Tabs, URL bar, curl bar/panels, and section tabs stay fixed - only
              the section content below (Params/Headers/Body/etc, which can get
              long) scrolls internally, so a big header list never pushes the
              request bar out of view or overlaps the Response panel. */}
          <div className="api-editor-toolbar">
          <div className="api-tab-strip">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`api-request-tab${tab.id === activeTabId ? ' active' : ''}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className={`api-method-dot oapi-method-${tab.request.method.toLowerCase()}`} />
                {tab.saveName && !tab.saveDirty && (
                  <span className="api-saved-tick" title={`Saved in "${tab.saveCollectionName}"`}>✓</span>
                )}
                {editingTabId === tab.id ? (
                  <input
                    className="api-request-tab-label-input"
                    value={editingLabel}
                    autoFocus
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setEditingLabel(event.target.value)}
                    onBlur={() => commitTabLabelEdit(tab)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitTabLabelEdit(tab);
                      } else if (event.key === 'Escape') {
                        setEditingTabId(null);
                      }
                    }}
                    placeholder="Name this request…"
                  />
                ) : (
                  <span
                    className="api-request-tab-label"
                    title={
                      tab.saveName && !tab.saveDirty
                        ? `Saved in "${tab.saveCollectionName}" — click to rename`
                        : tab.saveName
                          ? 'Unsaved changes — click to rename'
                          : 'Click to name and save'
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      startEditingTabLabel(tab);
                    }}
                  >
                    {tab.label}
                  </span>
                )}
                {tab.loading && <span className="api-request-tab-spinner" />}
                <button
                  className="api-request-tab-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  title="Close tab"
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="api-request-tab-add" onClick={handleNewTab} title="New request tab">
              +
            </button>
          </div>

          <div className="api-request-bar">
            <select
              className={`api-method-select method-${activeTab.request.method.toLowerCase()}`}
              value={activeTab.request.method}
              onChange={(event) => updateField('method', event.target.value)}
            >
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <VariableSuggestInput
              className="api-url-input"
              value={activeTab.request.url}
              onChange={(value) => updateField('url', value)}
              onPaste={handleUrlPaste}
              variableNames={variableNames}
              placeholder="Paste a URL or a whole curl command… (type {{ for variables)"
            />
            <button
              className={`uuid-generate-btn api-send-btn${activeTab.loading ? ' is-loading' : ''}`}
              onClick={() => handleSend(activeTab.id)}
              disabled={!activeTab.request.url || activeTab.loading}
              title="Send (Cmd/Ctrl+Enter)"
            >
              {activeTab.loading ? 'Sending…' : 'Send'}
            </button>
            <button
              className={`api-save-btn${activeTab.saveName && !activeTab.saveDirty ? ' is-saved' : ''}`}
              onClick={handleSaveRequest}
              title={activeTab.saveName && !activeTab.saveDirty ? `Saved in "${activeTab.saveCollectionName}"` : 'Save (Cmd/Ctrl+S)'}
            >
              {activeTab.saveName && !activeTab.saveDirty && <span className="api-saved-tick">✓</span>}
              {activeTab.saveName && !activeTab.saveDirty ? 'Saved' : 'Save'}
            </button>
            <button
              className="api-icon-btn"
              onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            >
              <ExpandIcon />
            </button>
          </div>

          {/* No dedicated Import/Export cURL bar - pasting a curl command
              directly into the URL bar above already imports it, and the
              Code tab already exports cURL/JS/Python snippets. This panel
              only appears automatically when a pasted command fails to
              parse, so you can fix and retry without losing it. */}
          {activeTab.curlImportOpen && (
            <div className="api-curl-panel">
              <div className="api-curl-panel-header">
                <span>Couldn&apos;t parse that as a curl command - fix and retry:</span>
                <button
                  className="api-curl-panel-dismiss"
                  onClick={() => patchActiveTab({ curlImportOpen: false, curlImportError: null, curlText: '' })}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
              <textarea
                className="b64-textarea api-curl-textarea"
                value={activeTab.curlText}
                onChange={(event) => patchActiveTab({ curlText: event.target.value })}
                placeholder="Paste a curl command…"
                spellCheck={false}
              />
              {activeTab.curlImportError && <div className="jw-output-message jw-output-error">{activeTab.curlImportError}</div>}
              <button className="uuid-generate-btn" onClick={handleImportCurl}>
                Import
              </button>
            </div>
          )}

          <div className="api-tabs">
            {SECTIONS.map((section) => (
              <button
                key={section}
                className={`api-tab-btn${activeTab.section === section ? ' active' : ''}`}
                onClick={() => patchActiveTab({ section })}
              >
                {section}
              </button>
            ))}
          </div>
          </div>
          <div className="api-tab-body">
            {activeTab.section === 'Params' && (
              <KeyValueEditor
                rows={activeTab.request.queryParams}
                onChange={(rows) => updateField('queryParams', rows)}
                keyPlaceholder="Param"
                variableNames={variableNames}
              />
            )}
            {activeTab.section === 'Headers' && (
              <KeyValueEditor
                rows={activeTab.request.headers}
                onChange={(rows) => updateField('headers', rows)}
                keyPlaceholder="Header"
                keySuggestions={COMMON_HEADER_NAMES}
                variableNames={variableNames}
              />
            )}
            {activeTab.section === 'Body' && (
              <div className="api-body-tab">
                <div className="api-body-toolbar">
                  <div className="b64-direction-group">
                    {BODY_TYPES.map((type) => (
                      <button
                        key={type.id}
                        className={`b64-direction-btn${activeTab.request.bodyType === type.id ? ' active' : ''}`}
                        onClick={() => updateField('bodyType', type.id)}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                  <div className="api-body-toolbar-actions">
                    {activeTab.request.bodyType === 'json' && (
                      <span className="api-body-var-hint">{'Number {{name}} · Text "{{name}}"'}</span>
                    )}
                    {activeTab.request.bodyType === 'json' && (
                      <button className="jw-mode-btn" onClick={handleBeautifyBody} disabled={!activeTab.request.body}>
                        ✨ Beautify
                      </button>
                    )}
                    {activeTab.request.bodyType !== 'none' && (
                      <button
                        className="api-icon-btn"
                        title="Copy body"
                        disabled={!activeTab.request.body}
                        onClick={() => {
                          navigator.clipboard.writeText(activeTab.request.body);
                          pushToast('success', 'Copied body');
                        }}
                      >
                        <CopyIcon />
                      </button>
                    )}
                  </div>
                </div>
                {activeTab.request.bodyType === 'json' && (
                  <div className="api-body-editor">
                    <MonacoBodyEditor
                      value={activeTab.request.body}
                      onChange={(value) => updateField('body', value)}
                      language="json"
                      variableNames={variableNames}
                      theme="vs"
                    />
                  </div>
                )}
                {activeTab.request.bodyType === 'text' && (
                  <div className="api-body-editor">
                    <MonacoBodyEditor
                      value={activeTab.request.body}
                      onChange={(value) => updateField('body', value)}
                      language="plaintext"
                      variableNames={variableNames}
                      theme="vs"
                    />
                  </div>
                )}
                {(activeTab.request.bodyType === 'form' || activeTab.request.bodyType === 'multipart') && (
                  <>
                    <KeyValueEditor
                      rows={(activeTab.request.formParams || []).filter((row) => !row.dataBase64)}
                      onChange={(rows) => updateField('formParams', [...rows, ...(activeTab.request.formParams || []).filter((row) => row.dataBase64)])}
                      keyPlaceholder="Field"
                      variableNames={variableNames}
                    />
                    {activeTab.request.bodyType === 'multipart' && (
                      <>
                        <input
                          ref={multipartFileRef}
                          type="file"
                          hidden
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) {
                              pushToast('error', 'Files larger than 2MB are not attached.');
                              return;
                            }
                            const dataBase64 = await new Promise((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const text = String(reader.result || '');
                                const comma = text.indexOf(',');
                                resolve(comma >= 0 ? text.slice(comma + 1) : text);
                              };
                              reader.onerror = () => reject(reader.error);
                              reader.readAsDataURL(file);
                            });
                            updateField('formParams', [
                              ...(activeTab.request.formParams || []),
                              { key: 'file', value: '', fileName: file.name, contentType: file.type || 'application/octet-stream', dataBase64, enabled: true },
                            ]);
                          }}
                        />
                        <button className="jw-mode-btn" onClick={() => multipartFileRef.current?.click()}>
                          Attach file
                        </button>
                        {(activeTab.request.formParams || []).filter((row) => row.dataBase64 || row.fileName).map((row, index) => (
                          <div className="api-file-row" key={`${row.fileName}-${index}`}>
                            <span>{row.key}: {row.fileName || 'file'}{row.dataBase64 ? '' : ' (choose the file again before sending)'}</span>
                            <button
                              className="api-icon-btn"
                              title="Remove file"
                              onClick={() => updateField('formParams', (activeTab.request.formParams || []).filter((candidate) => candidate !== row))}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
                {activeTab.request.bodyType === 'graphql' && (
                  <>
                    <textarea
                      className="b64-textarea api-script-textarea"
                      value={activeTab.request.body}
                      onChange={(event) => updateField('body', event.target.value)}
                      placeholder="query { me }"
                      spellCheck={false}
                    />
                    <textarea
                      className="b64-textarea api-script-textarea"
                      value={activeTab.request.graphqlVariables || ''}
                      onChange={(event) => updateField('graphqlVariables', event.target.value)}
                      placeholder='{"id": "{{id}}"}'
                      spellCheck={false}
                    />
                  </>
                )}
              </div>
            )}
            {activeTab.section === 'Auth' && (
              <div className="api-auth-tab">
                <div className="b64-direction-group">
                  {AUTH_TYPES.map((type) => (
                    <button
                      key={type.id}
                      className={`b64-direction-btn${activeTab.request.auth.type === type.id ? ' active' : ''}`}
                      onClick={() => updateField('auth', { ...activeTab.request.auth, type: type.id })}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
                {activeTab.request.auth.type === 'bearer' && (
                  <VariableSuggestInput
                    className="ts-input api-auth-input"
                    value={activeTab.request.auth.token || ''}
                    onChange={(value) => updateField('auth', { ...activeTab.request.auth, token: value })}
                    variableNames={variableNames}
                    placeholder="Token"
                  />
                )}
                {activeTab.request.auth.type === 'basic' && (
                  <div className="api-auth-basic">
                    <input
                      className="ts-input"
                      value={activeTab.request.auth.username || ''}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, username: event.target.value })}
                      placeholder="Username"
                      spellCheck={false}
                    />
                    <input
                      className="ts-input"
                      type="password"
                      value={activeTab.request.auth.password || ''}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, password: event.target.value })}
                      placeholder="Password"
                    />
                  </div>
                )}
                {activeTab.request.auth.type === 'apikey' && (
                  <div className="api-auth-basic">
                    <input
                      className="ts-input"
                      value={activeTab.request.auth.key || ''}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, key: event.target.value })}
                      placeholder="Key name"
                      spellCheck={false}
                    />
                    <VariableSuggestInput
                      className="ts-input api-auth-input"
                      value={activeTab.request.auth.value || ''}
                      onChange={(value) => updateField('auth', { ...activeTab.request.auth, value })}
                      variableNames={variableNames}
                      placeholder="Key value"
                    />
                    <select
                      className="nav-theme-select"
                      value={activeTab.request.auth.in === 'query' ? 'query' : 'header'}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, in: event.target.value })}
                    >
                      <option value="header">Header</option>
                      <option value="query">Query param</option>
                    </select>
                  </div>
                )}
                {activeTab.request.auth.type === 'oauth2' && (
                  <div className="api-auth-basic">
                    <input
                      className="ts-input"
                      value={activeTab.request.auth.tokenUrl || ''}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, tokenUrl: event.target.value })}
                      placeholder="Token URL"
                      spellCheck={false}
                    />
                    <input
                      className="ts-input"
                      value={activeTab.request.auth.clientId || ''}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, clientId: event.target.value })}
                      placeholder="Client ID"
                      spellCheck={false}
                    />
                    <input
                      className="ts-input"
                      type="password"
                      value={activeTab.request.auth.clientSecret || ''}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, clientSecret: event.target.value })}
                      placeholder="Client secret"
                    />
                    <input
                      className="ts-input"
                      value={activeTab.request.auth.scope || ''}
                      onChange={(event) => updateField('auth', { ...activeTab.request.auth, scope: event.target.value })}
                      placeholder="Scope (optional)"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            )}
            {activeTab.section === 'Scripts' && (
              <div className="api-script-tab">
                <div className="api-script-hint">
                  Before the request: <code>pm.environment.set</code>, <code>pm.environment.get</code>, <code>pm.request.headers.add(name, value)</code>.
                  After the response: <code>pm.response.json()</code>, <code>pm.response.to.have.status(200)</code>, <code>pm.test(name, fn)</code>, <code>pm.expect(value).to.eql(expected)</code>.
                  <code>pm.environment.set</code> after the response is saved on this request's folder.
                  <br />
                  ⚠ Scripts run with full page privileges in your browser — only paste scripts you wrote or trust.
                </div>
                <div className="api-env-editor-label">Before request</div>
                <textarea
                  className="b64-textarea api-script-textarea"
                  value={activeTab.request.preRequest || ''}
                  onChange={(event) => updateField('preRequest', event.target.value)}
                  placeholder='pm.request.headers.add("X-Nonce", "{{nonce}}");'
                  spellCheck={false}
                />
                <div className="api-env-editor-label">After response</div>
                <textarea
                  className="b64-textarea api-script-textarea"
                  value={activeTab.request.script || ''}
                  onChange={(event) => updateField('script', event.target.value)}
                  placeholder={'pm.test("ok", function () { pm.response.to.have.status(200); });'}
                  spellCheck={false}
                />
                {(activeTab.scriptResult?.tests || []).map((entry) => (
                  <div key={entry.name} className={`api-test-line${entry.ok ? ' is-pass' : ' is-fail'}`}>
                    {entry.ok ? '✓' : '✕'} {entry.name}{entry.error ? ` — ${entry.error}` : ''}
                  </div>
                ))}
                {activeTab.scriptResult && !activeTab.scriptResult.ok && (
                  <div className="jw-output-message jw-output-error">Script error: {activeTab.scriptResult.error}</div>
                )}
                {activeTab.scriptResult?.ok && Object.keys(activeTab.scriptResult.envUpdates).length > 0 && (
                  <div className={activeTab.scriptResult.savedOn ? 'api-script-applied' : 'jw-output-message jw-output-error'}>
                    {activeTab.scriptResult.savedOn
                      ? `✓ Set ${Object.keys(activeTab.scriptResult.envUpdates).join(', ')} on ${activeTab.scriptResult.savedOn.kind} "${activeTab.scriptResult.savedOn.name}"`
                      : `Script set ${Object.keys(activeTab.scriptResult.envUpdates).join(', ')}, but this request is not saved in a folder and no environment is selected.`}
                  </div>
                )}
              </div>
            )}
            {activeTab.section === 'Code' && (
              <div className="api-code-tab">
                <div className="b64-direction-group">
                  {CODE_LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      className={`b64-direction-btn${activeTab.codeLang === lang.id ? ' active' : ''}`}
                      onClick={() => patchActiveTab({ codeLang: lang.id })}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
                <textarea className="b64-textarea api-code-textarea" readOnly value={codeSnippet} spellCheck={false} />
                <button className="uuid-generate-btn" onClick={() => navigator.clipboard.writeText(codeSnippet)}>
                  <CopyIcon /> Copy snippet
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="api-resizer" onMouseDown={handleResizerMouseDown} title="Drag to resize">
          <div className="api-resizer-grip" />
        </div>

        <div className="api-response">
          <div className="api-response-header">
            <span className="jw-pane-label">Response</span>
            <div className="api-response-header-right">
              {activeTab.response?.ok && (
                <span className="api-response-meta">
                  <span className={`api-status api-status-${Math.floor(activeTab.response.status / 100)}xx`}>
                    {activeTab.response.status} {activeTab.response.statusText}
                  </span>
                  <span>{activeTab.response.durationMs} ms</span>
                  <span>{formatBytes(activeTab.response.sizeBytes)}</span>
                  {activeTab.response.redirects?.length > 0 && <span>{activeTab.response.redirects.length} redirect{activeTab.response.redirects.length === 1 ? '' : 's'}</span>}
                  {(activeTab.scriptResult?.tests || []).length > 0 && (
                    <span>
                      {(activeTab.scriptResult.tests.filter((entry) => entry.ok).length)}/{activeTab.scriptResult.tests.length} tests
                    </span>
                  )}
                </span>
              )}
              <button
                className="api-icon-btn"
                title="Search in response"
                disabled={!activeTab.response?.ok}
                onClick={() => responseEditorRef.current?.getAction('actions.find')?.run()}
              >
                <SearchIcon />
              </button>
              <button
                className="api-icon-btn"
                title="Copy response"
                disabled={!activeTab.response?.ok}
                onClick={() => {
                  navigator.clipboard.writeText(tryPrettyJson(activeTab.response.body));
                  pushToast('success', 'Copied response');
                }}
              >
                <CopyIcon />
              </button>
            </div>
          </div>
          <div className="api-response-body">
            {!activeTab.response && <div className="jw-output-placeholder">Send a request to see the response here.</div>}
            {activeTab.response && !activeTab.response.ok && (
              <div className="jw-output-message jw-output-error">{activeTab.response.error}</div>
            )}
            {activeTab.response?.ok && (
              <MonacoJsonEditor
                value={tryPrettyJson(activeTab.response.body)}
                theme="vs"
                readOnly
                onEditorMount={(editor) => {
                  responseEditorRef.current = editor;
                }}
              />
            )}
          </div>
        </div>
      </div>

      {runner && (
        <div className="cmdk-backdrop" onMouseDown={() => !runner.running && setRunner(null)}>
          <div className="api-env-editor api-runner-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="api-env-editor-title">{runner.running ? `Running ${runner.title}` : `Ran ${runner.title}`}</h3>
            {runner.variableRows?.length > 0 && (
              <div className="api-runner-vars">
                <div className="api-env-editor-label">Variables for this run</div>
                {runner.authNote && <div className="api-suite-meta">{runner.authNote}</div>}
                {runner.variableRows.map((row) => (
                  <div className="api-runner-var" key={row.key}>
                    <code>{row.key}</code>
                    <span className="api-runner-var-value">{String(row.value).length > 42 ? `${String(row.value).slice(0, 16)}…` : row.value}</span>
                    <span className="api-runner-var-source">{row.source}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="api-runner-list">
              {runner.results.map((entry, index) => (
                <div className="api-runner-block" key={`${entry.name}-${index}`}>
                  <div className="api-runner-line">
                    <span className={entry.ok ? 'api-test-line is-pass' : 'api-test-line is-fail'}>{entry.ok ? '✓' : '✕'}</span>
                    <span className={`api-method-badge oapi-method-${(entry.method || 'get').toLowerCase()}`}>{entry.method}</span>
                    <span className="api-runner-name">{entry.name}</span>
                    <span>{entry.status ? `${entry.status} ${entry.statusText || ''}` : entry.error || '—'}</span>
                    {entry.durationMs != null && <span>{entry.durationMs} ms</span>}
                    <button className="b64-swap-btn" onClick={() => openRunnerResult(entry)}>
                      Open
                    </button>
                  </div>
                  {entry.url && <div className="api-runner-url">{entry.url}</div>}
                  {(entry.tests || []).filter((test) => !test.ok).map((test) => (
                    <div key={test.name} className="api-test-line is-fail">✕ {test.name}{test.error ? ` — ${test.error}` : ''}</div>
                  ))}
                  <pre className="api-runner-output">{entry.error && !entry.body ? entry.error : tryPrettyJson(entry.body || '') || '(empty response)'}</pre>
                </div>
              ))}
              {runner.results.length === 0 && <div className="api-sidebar-empty">Starting…</div>}
            </div>
            <div className="api-env-editor-actions">
              <button className="b64-swap-btn" onClick={() => setRunner(null)} disabled={runner.running}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {importPrompt && (
        <div className="cmdk-backdrop" onMouseDown={() => !importBusy && confirmImportChoice('reject')}>
          <div className="api-env-editor api-import-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="api-env-editor-title">
              A {importPrompt.conflictKind} named “{importPrompt.name}” is already{' '}
              {importPrompt.connected ? `in “${collections.folderName}”` : 'saved in this browser'}
            </h3>
            <div className="api-env-editor-label">
              Keep both adds “{siblingCopyName(
                importPrompt.connected
                  ? (collections.collections[0]?.items || []).map((item) => item.name)
                  : collections.collections.map((item) => item.name),
                importPrompt.name
              )}” and leaves the existing one. Replace removes only this {importPrompt.conflictKind}. Cancel changes nothing.
              {importPrompt.connected
                ? ' Your other saved requests and environments stay.'
                : ' Until you connect a folder, the import stays in this browser.'}
            </div>
            <div className="api-import-choices">
              <button className="b64-swap-btn" disabled={importBusy} onClick={() => confirmImportChoice('keep')}>
                Keep both
              </button>
              <button className="b64-swap-btn" disabled={importBusy} onClick={() => confirmImportChoice('replace')}>
                Replace
              </button>
              <button className="b64-swap-btn" disabled={importBusy} onClick={() => confirmImportChoice('reject')}>
                Cancel import
              </button>
            </div>
            <div className="api-env-editor-label">Or save this import under a new name.</div>
            <input
              className="ts-input"
              value={importPrompt.customName}
              onChange={(event) => setImportPrompt({ ...importPrompt, customName: event.target.value, nameError: '' })}
              placeholder="New name"
              spellCheck={false}
              disabled={importBusy}
            />
            {importPrompt.nameError && <div className="api-import-error">{importPrompt.nameError}</div>}
            <div className="api-env-editor-actions">
              <button className="uuid-generate-btn" disabled={importBusy} onClick={() => confirmImportChoice('rename')}>
                {importBusy ? 'Importing…' : 'Import as new name'}
              </button>
            </div>
          </div>
        </div>
      )}

      {variableEditor && (
        <div className="cmdk-backdrop" onMouseDown={() => setVariableEditor(null)}>
          <div className="api-env-editor" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="api-env-editor-title">Variables · {variableEditor.title}</h3>
            <div className="api-env-editor-label">
              {variableEditor.folderId == null
                ? 'Shared by every request in this collection. A folder with the same name overrides these. Use {{name}} in the URL, headers, body, or auth.'
                : 'Used when you send or run requests in this folder. The same name here overrides the selected environment and the collection. An after-response script on a request in this folder writes pm.environment.set here.'}
            </div>
            <KeyValueEditor
              rows={variableEditor.rows}
              onChange={(rows) => setVariableEditor((current) => (current ? { ...current, rows } : current))}
              keyPlaceholder="Variable"
              showEnabled={false}
            />
            <div className="api-env-editor-actions">
              <button className="b64-swap-btn" onClick={() => setVariableEditor(null)}>
                Cancel
              </button>
              <button className="uuid-generate-btn" onClick={saveVariableEditor}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {suiteDraft && (
        <div className="cmdk-backdrop" onMouseDown={() => setSuiteDraft(null)}>
          <div className="api-env-editor api-suite-editor" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="api-env-editor-title">Suite sign-in</h3>
            <div className="api-env-editor-label">
              Each suite sets BASE_PATH. The sign-in request below runs against that base. The response field is saved as the variable, and Send and Run add it as Authorization: Bearer unless the request already has one. Use {'{{BASE_PATH}}'} and {'{{STUDIO_URL}}'} in the path or body.
            </div>
            {suiteDraft.suites.map((suite) => (
              <div className="api-suite-draft" key={suite.id}>
                <div className="api-env-editor-label">{suite.label}</div>
                <input
                  className="ts-input"
                  value={suite.basePath}
                  spellCheck={false}
                  placeholder="Base URL"
                  onChange={(event) => updateSuiteDraftSuite(suite.id, 'basePath', event.target.value)}
                />
                <input
                  className="ts-input"
                  value={suite.studioUrl}
                  spellCheck={false}
                  placeholder="Studio URL (Referer and url_details.url)"
                  onChange={(event) => updateSuiteDraftSuite(suite.id, 'studioUrl', event.target.value)}
                />
              </div>
            ))}
            <div className="api-suite-draft-grid">
              <input
                className="ts-input"
                value={suiteDraft.recipe.method}
                spellCheck={false}
                placeholder="Method"
                onChange={(event) => setSuiteDraft((current) => (current ? { ...current, recipe: { ...current.recipe, method: event.target.value } } : current))}
              />
              <input
                className="ts-input"
                value={suiteDraft.recipe.path}
                spellCheck={false}
                placeholder="Path, e.g. v3/validateVerificationCode"
                onChange={(event) => setSuiteDraft((current) => (current ? { ...current, recipe: { ...current.recipe, path: event.target.value } } : current))}
              />
            </div>
            <div className="api-suite-draft-grid">
              <input
                className="ts-input"
                value={suiteDraft.recipe.tokenField}
                spellCheck={false}
                placeholder="Response field, e.g. accessToken"
                onChange={(event) => setSuiteDraft((current) => (current ? { ...current, recipe: { ...current.recipe, tokenField: event.target.value } } : current))}
              />
              <input
                className="ts-input"
                value={suiteDraft.recipe.variableName}
                spellCheck={false}
                placeholder="Variable name"
                onChange={(event) => setSuiteDraft((current) => (current ? { ...current, recipe: { ...current.recipe, variableName: event.target.value } } : current))}
              />
            </div>
            <textarea
              className="api-suite-body"
              value={suiteDraft.recipe.body}
              spellCheck={false}
              onChange={(event) => setSuiteDraft((current) => (current ? { ...current, recipe: { ...current.recipe, body: event.target.value } } : current))}
            />
            <div className="api-env-editor-actions">
              <button className="b64-swap-btn" onClick={() => setSuiteDraft(null)}>
                Cancel
              </button>
              <button className="uuid-generate-btn" onClick={saveSuiteDraft}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {envEditorOpen && (
        <div className="cmdk-backdrop" onMouseDown={() => setEnvEditorOpen(false)}>
          <div className="api-env-editor" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="api-env-editor-title">{envDraftName ? 'Edit environment' : 'New environment'}</h3>
            <input
              className="ts-input api-env-name-input"
              value={envDraftName}
              onChange={(event) => setEnvDraftName(event.target.value)}
              placeholder="Environment name (e.g. dev)"
              spellCheck={false}
            />
            <div className="api-env-editor-label">
              Variables (use as {'{{name}}'} in the URL, headers, body, or auth token — type {'{{'} anywhere in those fields to get
              suggestions)
            </div>
            <KeyValueEditor rows={envDraftVars} onChange={setEnvDraftVars} keyPlaceholder="Variable" showEnabled={false} />
            <div className="api-env-editor-actions">
              {envDraftName && environments.environments.some((e) => e.name === envDraftName) && (
                <button
                  className="b64-swap-btn"
                  onClick={() => {
                    environments.deleteEnvironment(envDraftName);
                    setEnvEditorOpen(false);
                  }}
                >
                  Delete
                </button>
              )}
              <button className="b64-swap-btn" onClick={() => setEnvEditorOpen(false)}>
                Cancel
              </button>
              <button className="uuid-generate-btn" onClick={handleSaveEnv}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {newCollectionModalOpen && (
        <div className="cmdk-backdrop" onMouseDown={() => setNewCollectionModalOpen(false)}>
          <div className="api-env-editor api-modal-compact" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="api-env-editor-title">New collection</h3>
            <input
              className="ts-input"
              value={newCollectionDraftName}
              onChange={(event) => setNewCollectionDraftName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && confirmNewCollection()}
              placeholder="Collection name…"
              autoFocus
              spellCheck={false}
            />
            <div className="api-env-editor-actions">
              <button className="b64-swap-btn" onClick={() => setNewCollectionModalOpen(false)}>
                Cancel
              </button>
              <button className="uuid-generate-btn" onClick={confirmNewCollection} disabled={!newCollectionDraftName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {saveModalOpen && (
        <div className="cmdk-backdrop" onMouseDown={closeSaveModal}>
          <div className="api-env-editor api-modal-compact" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="api-env-editor-title">Save request</h3>
            <label className="api-save-modal-label">
              Name
              <input
                className="ts-input"
                value={saveModalName}
                onChange={(event) => setSaveModalName(event.target.value)}
                placeholder="e.g. Validate OTP"
                autoFocus
                spellCheck={false}
              />
            </label>
            {!collections.isFolderConnected && (
              <label className="api-save-modal-label">
                Collection
                <select
                  className="nav-theme-select"
                  value={saveModalCollection}
                  onChange={(event) => handleSaveModalCollectionChange(event.target.value)}
                >
                  {collections.collections.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">➕ New collection…</option>
                </select>
              </label>
            )}
            {!collections.isFolderConnected && saveModalNewCollection && (
              <input
                className="ts-input"
                value={saveModalNewCollectionName}
                onChange={(event) => setSaveModalNewCollectionName(event.target.value)}
                placeholder="New collection name…"
                spellCheck={false}
              />
            )}
            {collections.isFolderConnected && (
              <div className="api-save-modal-folder-note">📁 Saving into the connected folder "{collections.folderName}"</div>
            )}
            {!saveModalNewCollection && (
              <label className="api-save-modal-label">
                Folder
                <select
                  className="nav-theme-select"
                  value={saveModalNewFolder ? '__new_folder__' : saveModalParentId || ''}
                  onChange={(event) => handleSaveModalFolderChange(event.target.value)}
                >
                  {collections
                    .flattenFolderPaths()
                    .filter((p) => p.collectionName === saveModalCollection)
                    .map((p) => (
                      <option key={p.parentId || 'root'} value={p.parentId || ''}>
                        {p.label}
                      </option>
                    ))}
                  <option value="__new_folder__">➕ New folder here…</option>
                </select>
              </label>
            )}
            {saveModalNewFolder && (
              <input
                className="ts-input"
                value={saveModalNewFolderName}
                onChange={(event) => setSaveModalNewFolderName(event.target.value)}
                placeholder="New folder name…"
                autoFocus
                spellCheck={false}
              />
            )}
            <div className="api-env-editor-actions">
              <button className="b64-swap-btn" onClick={closeSaveModal}>
                Cancel
              </button>
              <button
                className="uuid-generate-btn"
                onClick={confirmSaveModal}
                disabled={!saveModalName.trim() || (saveModalNewCollection && !saveModalNewCollectionName.trim())}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Renders one item in a collection's folder tree - either a folder (which
// recurses into its own items when expanded) or a leaf request row. Kept in
// this file rather than a separate component file because every prop here
// is a callback owned by ApiClientPage's own state; there's no reuse
// benefit to extracting it, only an extra prop-drilling hop.
function TreeNode({
  item,
  collectionName,
  parentId,
  index,
  expandedCollections,
  onToggleExpanded,
  onNewFolder,
  onLoadRequest,
  onDeleteItem,
  onRun,
  onEditVariables,
  dragItemId,
  dropTarget,
  onDragStart,
  onDragEnd,
  onRowDragOver,
  onFolderDragOver,
  onDrop,
}) {
  const isDragging = dragItemId === item.id;
  const isRowDropTarget =
    dropTarget && dropTarget.collectionName === collectionName && dropTarget.parentId === parentId && dropTarget.index === index;

  if (item.type === 'folder') {
    const expanded = Boolean(expandedCollections[item.id]);
    const isFolderDropTarget = dropTarget && dropTarget.parentId === item.id;
    return (
      <div
        className={`api-folder${isDragging ? ' is-dragging' : ''}${isFolderDropTarget ? ' is-drop-target' : ''}`}
        draggable
        onDragStart={(event) => onDragStart(event, item.id)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          event.stopPropagation();
          onFolderDragOver(event, collectionName, item.id);
        }}
        onDrop={(event) => {
          event.stopPropagation();
          onDrop(event);
        }}
      >
        <div className="api-folder-header">
          <button className="api-collection-toggle" onClick={() => onToggleExpanded(item.id)}>
            <span className={`api-collection-chevron${expanded ? ' expanded' : ''}`}>▸</span>
            <span className="api-collection-name">📁 {item.name}</span>
            <span className="api-collection-count">{countItems(item.items)}</span>
          </button>
          <div className="api-collection-actions">
            <button title="Run folder" onClick={() => onRun(item.name, collectionName, item.id)}>
              ▶
            </button>
            <button
              title={Object.keys(item.variables || {}).length ? `${Object.keys(item.variables).length} folder variables` : 'Folder variables'}
              onClick={() => onEditVariables(collectionName, item.id, item.name)}
            >
              {Object.keys(item.variables || {}).length ? `{${Object.keys(item.variables).length}}` : '{ }'}
            </button>
            <button title="New folder" onClick={() => onNewFolder(collectionName, item.id)}>
              📁+
            </button>
            <button title="Delete folder" onClick={() => onDeleteItem(item.id)}>
              <TrashIcon />
            </button>
          </div>
        </div>
        {expanded && (
          <div className="api-collection-requests">
            {item.items.length === 0 && <div className="api-sidebar-empty">Empty folder.</div>}
            {item.items.map((child, childIndex) => (
              <TreeNode
                key={child.id}
                item={child}
                collectionName={collectionName}
                parentId={item.id}
                index={childIndex}
                expandedCollections={expandedCollections}
                onToggleExpanded={onToggleExpanded}
                onNewFolder={onNewFolder}
                onLoadRequest={onLoadRequest}
                onDeleteItem={onDeleteItem}
                onRun={onRun}
                onEditVariables={onEditVariables}
                dragItemId={dragItemId}
                dropTarget={dropTarget}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onRowDragOver={onRowDragOver}
                onFolderDragOver={onFolderDragOver}
                onDrop={onDrop}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`api-saved-row${isDragging ? ' is-dragging' : ''}${isRowDropTarget ? ' is-drop-target-line' : ''}`}
      draggable
      onDragStart={(event) => onDragStart(event, item.id)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.stopPropagation();
        onRowDragOver(event, collectionName, parentId, index);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDrop(event);
      }}
    >
      <button className="api-saved-link" onClick={() => onLoadRequest(collectionName, item, parentId)}>
        <span className={`api-method-badge oapi-method-${item.request.method.toLowerCase()}`}>{item.request.method}</span>
        <span className="api-saved-name">{item.name}</span>
        <span className="api-folder-saved" title="Saved in this folder">✓</span>
      </button>
      <button title="Delete" onClick={() => onDeleteItem(item.id)}>
        <TrashIcon />
      </button>
    </div>
  );
}
