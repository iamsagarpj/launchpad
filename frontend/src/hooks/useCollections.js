import { useEffect, useRef, useState } from 'react';
import {
  parseCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  createFolder,
  setNodeVariables,
  upsertRequestInCollection,
  removeItemById,
  moveItem as moveItemLogic,
  addFullCollection,
  flattenFolderPaths as flattenFolderPathsLogic,
  findNode,
} from '../api-client/collectionsLogic.js';
import { parseSavedRequests } from '../api-client/savedRequestsLogic.js';
import { cleanVariables } from '../api-client/scopeVariables.js';
import {
  isFileSystemAccessSupported,
  connectFolder as connectFolderFs,
  readCollectionFromFolder,
  writeCollectionMetadata,
  writeFolderMetadata,
  writeFolderTree,
  readEnvironmentsFile,
  writeEnvironmentsFile,
  writeRequestFile,
  deleteRequestFile,
  createFolderDir,
  moveRequestFile,
  moveFolderDir,
  persistHandle,
  restoreHandle,
  clearPersistedHandle,
} from '../api-client/fileSystemCollections.js';

const STORAGE_KEY = 'launchpad-api-collections';
const LEGACY_SAVED_KEY = 'launchpad-api-saved-requests';

function generateId() {
  return crypto.randomUUID();
}

// findNode (from collectionsLogic.js) searches one Item[] tree; collections
// is an array of {name, items} - this searches every collection's own items
// tree in turn, which is what moveItem's re-derivation step below needs.
function findNodeInCollections(collections, itemId) {
  for (const c of collections) {
    const found = findNode(c.items, itemId);
    if (found) return found;
  }
  return null;
}

// One-time upgrade path: the first version of the API client saved requests
// as a flat list (useSavedRequests). If that data exists and no collections
// have been created yet, fold it into a single starter collection instead of
// discarding it.
function loadInitialCollections() {
  const stored = parseCollections(localStorage.getItem(STORAGE_KEY));
  if (stored.length > 0) {
    return stored;
  }
  const legacy = parseSavedRequests(localStorage.getItem(LEGACY_SAVED_KEY));
  return legacy.length > 0
    ? [{ name: 'My Collection', items: legacy.map((entry) => ({ id: generateId(), type: 'request', ...entry })) }]
    : [];
}

export function useCollections() {
  const [collections, setCollections] = useState(loadInitialCollections);
  const [folderHandle, setFolderHandle] = useState(null);
  const [folderName, setFolderName] = useState(null);
  const [skippedFiles, setSkippedFiles] = useState([]);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [folderError, setFolderError] = useState(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderEnvironments, setFolderEnvironments] = useState(null);
  const [folderLoadId, setFolderLoadId] = useState(0);
  // Live FileSystemHandles aren't serializable, so the id -> handle lookup
  // built while reading the connected folder lives in a ref (not state) -
  // it's write-through storage for the file-system backend, not something
  // that should trigger a re-render on its own.
  const fileHandlesByIdRef = useRef(new Map());

  // On mount, try to silently restore a previously connected folder without
  // prompting - if permission is still granted, reconnect automatically; if
  // it's been revoked (browsers forget across restarts), surface a
  // "Reconnect" prompt instead of silently falling back, so the user knows
  // which storage mode they're actually in.
  useEffect(() => {
    if (!isFileSystemAccessSupported()) return;
    (async () => {
      const handle = await restoreHandle().catch(() => null);
      if (!handle) return;
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        await loadFolder(handle);
      } else {
        setFolderName(handle.name);
        setNeedsReconnect(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (folderHandle) return; // folder mode persists to disk, not localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
  }, [collections, folderHandle]);

  async function loadFolder(handle) {
    setFolderBusy(true);
    setFolderError(null);
    try {
      const result = await readCollectionFromFolder(handle);
      fileHandlesByIdRef.current = result.fileHandlesById;
      setFolderHandle(handle);
      setFolderName(result.name);
      setSkippedFiles(result.skipped);
      const loaded = { name: result.name, items: result.items };
      if (result.variables && Object.keys(result.variables).length) loaded.variables = result.variables;
      setCollections([loaded]);
      setFolderEnvironments(await readEnvironmentsFile(handle));
      setFolderLoadId((current) => current + 1);
      setNeedsReconnect(false);
      await persistHandle(handle);
    } catch (err) {
      setFolderError(err.message);
    } finally {
      setFolderBusy(false);
    }
  }

  async function connectFolder() {
    try {
      const handle = await connectFolderFs();
      await loadFolder(handle);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setFolderError(err.message);
      }
    }
  }

  async function reconnectFolder() {
    const handle = await restoreHandle().catch(() => null);
    if (!handle) return;
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      await loadFolder(handle);
    }
  }

  function disconnectFolder() {
    setFolderHandle(null);
    setFolderName(null);
    fileHandlesByIdRef.current = new Map();
    setSkippedFiles([]);
    setNeedsReconnect(false);
    setFolderError(null);
    setFolderEnvironments(null);
    clearPersistedHandle();
    setCollections(loadInitialCollections());
  }

  function addCollection(name) {
    if (folderHandle) return; // folder mode is exactly one collection, the folder itself
    setCollections((prev) => createCollection(prev, name));
  }

  // Resolves the live directory handle for a parentId (null = the connected
  // folder's own root handle).
  function resolveParentDirHandle(parentId) {
    if (parentId === null || parentId === undefined) return folderHandle;
    return fileHandlesByIdRef.current.get(parentId)?.handle || folderHandle;
  }

  // Only entries whose parentHandle matches the given handle count as
  // siblings - this is a same-folder check by reference identity, which is
  // correct because handles for a given directory are read once per connect
  // and reused for its whole lifetime in this ref. Takes a resolved handle
  // directly (rather than a parentId) so callers that already have the
  // *actual* current parent of an existing item - which may differ from
  // whatever parentId they were called with, e.g. saveRequest updating an
  // item that already lives somewhere else - compute siblings against the
  // right directory.
  function existingNamesUnder(parentHandle, kind) {
    const names = new Set();
    for (const entry of fileHandlesByIdRef.current.values()) {
      if (entry.kind === kind && entry.parentHandle === parentHandle) {
        names.add(kind === 'file' ? entry.fileName : entry.dirName);
      }
    }
    return names;
  }

  function addFolder(collectionName, parentId, name) {
    const id = generateId();
    setCollections((prev) => createFolder(prev, collectionName, parentId, name, id));
    if (folderHandle) {
      const parentHandle = resolveParentDirHandle(parentId);
      const existingDirNames = existingNamesUnder(parentHandle, 'dir');
      createFolderDir(parentHandle, name, id, existingDirNames)
        .then(({ handle, dirName }) => {
          fileHandlesByIdRef.current.set(id, { kind: 'dir', handle, parentHandle, dirName });
        })
        .catch((err) => setFolderError(err.message));
    }
    return id;
  }

  function importFullCollection(collection) {
    if (folderHandle) return;
    setCollections((prev) => addFullCollection(prev, collection));
  }

  function rename(oldName, newName) {
    const current = collections.find((collection) => collection.name === oldName);
    setCollections((prev) => renameCollection(prev, oldName, newName));
    if (folderHandle) {
      setFolderName(newName);
      writeCollectionMetadata(folderHandle, newName, current?.variables).catch((err) => setFolderError(err.message));
    }
  }

  function setVariables(collectionName, folderId, variables) {
    const clean = cleanVariables(variables);
    setCollections((prev) => setNodeVariables(prev, collectionName, folderId, clean));
    if (!folderHandle) return;
    if (folderId == null) {
      writeCollectionMetadata(folderHandle, collectionName, clean).catch((err) => setFolderError(err.message));
      return;
    }
    const node = findNodeInCollections(collections, folderId);
    const entry = fileHandlesByIdRef.current.get(folderId);
    if (!node || !entry || entry.kind !== 'dir') return;
    writeFolderMetadata(entry.handle, node.id, node.name, clean).catch((err) => setFolderError(err.message));
  }

  function remove(name) {
    if (folderHandle) {
      disconnectFolder();
      return;
    }
    setCollections((prev) => deleteCollection(prev, name));
  }

  function removeItem(itemId) {
    const handleEntry = fileHandlesByIdRef.current.get(itemId);
    setCollections((prev) => removeItemById(prev, itemId));
    if (!folderHandle || !handleEntry) return Promise.resolve();
    const op =
      handleEntry.kind === 'file'
        ? deleteRequestFile(handleEntry.parentHandle, handleEntry.fileName)
        : handleEntry.parentHandle.removeEntry(handleEntry.dirName, { recursive: true });
    return op
      .then(() => {
        fileHandlesByIdRef.current.delete(itemId);
      })
      .catch((err) => {
        setFolderError(err.message);
        throw err;
      });
  }

  async function importAsFolder(folderNode, { replaceId } = {}) {
    if (!folderHandle) throw new Error('Connect a folder before importing into it.');
    if (replaceId) await removeItem(replaceId);
    const handles = await writeFolderTree(folderHandle, folderNode, existingNamesUnder(folderHandle, 'dir'));
    handles.forEach((entry, id) => fileHandlesByIdRef.current.set(id, entry));
    setCollections((prev) =>
      prev.map((collection, index) => {
        if (index !== 0) return collection;
        const items = collection.items.filter((item) => item.id !== replaceId);
        return { ...collection, items: [...items, folderNode] };
      })
    );
  }

  function persistEnvironments(environments, activeName) {
    if (!folderHandle) return Promise.resolve();
    return writeEnvironmentsFile(folderHandle, environments, activeName).catch((err) => setFolderError(err.message));
  }

  // entry: {id?, name, request}. Returns the id used (generated if absent).
  function saveRequest(collectionName, parentId, entry) {
    const id = entry.id || generateId();
    const node = { id, type: 'request', name: entry.name, request: entry.request };
    setCollections((prev) => upsertRequestInCollection(prev, collectionName, parentId, node));
    if (folderHandle) {
      const existing = fileHandlesByIdRef.current.get(id);
      const parentHandle = existing ? existing.parentHandle : resolveParentDirHandle(parentId);
      // Siblings are computed against parentHandle - the item's *actual*
      // current parent when updating (which may not match the parentId
      // argument at all, since an update always stays where it already is -
      // see collectionsLogic.js's upsertRequestInCollection), or the
      // resolved target parent when creating new.
      const existingFileNames = existingNamesUnder(parentHandle, 'file');
      writeRequestFile(parentHandle, node, existing?.fileName || null, existingFileNames)
        .then((fileName) => {
          fileHandlesByIdRef.current.set(id, { kind: 'file', handle: null, parentHandle, fileName });
        })
        .catch((err) => setFolderError(err.message));
    }
    return id;
  }

  function moveItem(itemId, destCollectionName, destParentId, destIndex) {
    setCollections((prev) => moveItemLogic(prev, itemId, destCollectionName, destParentId, destIndex));
    if (!folderHandle) return;
    const handleEntry = fileHandlesByIdRef.current.get(itemId);
    if (!handleEntry) return;
    const destParentHandle = resolveParentDirHandle(destParentId);
    if (handleEntry.kind === 'file') {
      const destExistingNames = existingNamesUnder(destParentHandle, 'file');
      // The in-memory node content is the source of truth for the move - read
      // it back from state after the move above would race the async file
      // write, so re-derive the {id, name, request} shape from what we know.
      const node = findNodeInCollections(collections, itemId);
      const entry = node ? { id: node.id, type: 'request', name: node.name, request: node.request } : null;
      if (!entry) return;
      moveRequestFile(handleEntry.parentHandle, handleEntry.fileName, destParentHandle, entry, destExistingNames)
        .then((fileName) => {
          fileHandlesByIdRef.current.set(itemId, { kind: 'file', handle: null, parentHandle: destParentHandle, fileName });
        })
        .catch((err) => setFolderError(err.message));
    } else {
      const destExistingNames = existingNamesUnder(destParentHandle, 'dir');
      moveFolderDir(handleEntry.parentHandle, handleEntry.dirName, destParentHandle, destExistingNames)
        .then(async (dirName) => {
          const newHandle = await destParentHandle.getDirectoryHandle(dirName);
          fileHandlesByIdRef.current.set(itemId, { kind: 'dir', handle: newHandle, parentHandle: destParentHandle, dirName });
        })
        .catch((err) => setFolderError(err.message));
    }
  }

  function flattenFolderPaths() {
    return flattenFolderPathsLogic(collections);
  }

  return {
    collections,
    addCollection,
    addFolder,
    setVariables,
    importFullCollection,
    importAsFolder,
    persistEnvironments,
    folderEnvironments,
    folderLoadId,
    rename,
    remove,
    removeItem,
    saveRequest,
    moveItem,
    flattenFolderPaths,
    isFileSystemSupported: isFileSystemAccessSupported(),
    isFolderConnected: Boolean(folderHandle),
    folderName,
    folderBusy,
    folderError,
    skippedFiles,
    needsReconnect,
    connectFolder,
    disconnectFolder,
    reconnectFolder,
  };
}
