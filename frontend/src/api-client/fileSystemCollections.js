import { uniqueFileName, uniqueDirName, isValidRequestFileShape } from './fileCollectionHelpers.js';
import { cleanVariables } from './scopeVariables.js';

// Browser-only wrapper around the File System Access API - not unit-tested
// with plain `node --test` for the same reason executeRequest.js and the
// React hooks aren't: there's no meaningful way to fake a real OS-level
// filesystem permission prompt in Node. The pure logic it depends on
// (filename/dirname sanitizing/collisions, request-file shape validation)
// lives in fileCollectionHelpers.js and is fully tested there. Manually
// verified in Chrome/Edge per this task's testing section.
//
// A folder in the UI = an actual directory on disk. A folder *item* within
// it = a real subdirectory, holding its own `_folder.json` ({id, name}) the
// same way the collection root holds `_collection.json` - this decouples a
// folder's display name from its on-disk directory name, since File System
// Access API rename support is inconsistent across browsers. Directory
// names are only chosen once, at creation time. Folder and collection
// variables live on those same metadata files.

const DB_NAME = 'launchpad-api-client';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'collectionFolder';
const METADATA_FILE = '_collection.json';
const FOLDER_METADATA_FILE = '_folder.json';
const ENV_FILE = '_environments.json';

function generateId() {
  return crypto.randomUUID();
}

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function connectFolder() {
  return window.showDirectoryPicker({ mode: 'readwrite' });
}

// Recursively reads a directory into {items, skipped, fileHandlesById}.
// fileHandlesById maps every item's id to {kind, handle, parentHandle,
// fileName?} so later writes/moves/deletes can resolve "where does this
// item live right now" in O(1) instead of re-walking the whole tree.
async function readDirectory(dirHandle, skipped, fileHandlesById) {
  const items = [];
  for await (const [entryName, entryHandle] of dirHandle.entries()) {
    if (entryName === METADATA_FILE || entryName === ENV_FILE || entryName === FOLDER_METADATA_FILE) continue;

    if (entryHandle.kind === 'directory') {
      let folderName = entryName;
      let folderId = null;
      let folderVariables = {};
      try {
        const metaFile = await entryHandle.getFileHandle(FOLDER_METADATA_FILE);
        const text = await (await metaFile.getFile()).text();
        const meta = JSON.parse(text);
        if (typeof meta.name === 'string' && meta.name.trim()) folderName = meta.name;
        if (typeof meta.id === 'string' && meta.id) folderId = meta.id;
        folderVariables = cleanVariables(meta.variables);
      } catch {
        // No _folder.json yet (shouldn't happen for folders created by this
        // app, but tolerate a hand-made directory by falling back to its
        // on-disk name and a freshly generated id).
      }
      if (!folderId) folderId = generateId();
      const childItems = await readDirectory(entryHandle, skipped, fileHandlesById);
      fileHandlesById.set(folderId, { kind: 'dir', handle: entryHandle, parentHandle: dirHandle, dirName: entryName });
      const folder = { id: folderId, type: 'folder', name: folderName, items: childItems };
      if (Object.keys(folderVariables).length) folder.variables = folderVariables;
      items.push(folder);
      continue;
    }

    if (!entryName.endsWith('.json')) continue;
    const file = await entryHandle.getFile();
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!isValidRequestFileShape(data)) {
        skipped.push({ fileName: entryName, error: 'Not a recognized request file shape.' });
        continue;
      }
      const id = data.id || generateId();
      fileHandlesById.set(id, { kind: 'file', handle: entryHandle, parentHandle: dirHandle, fileName: entryName });
      items.push({ id, type: 'request', name: data.name, request: data.request });
    } catch (err) {
      skipped.push({ fileName: entryName, error: err.message });
    }
  }
  return items;
}

export async function readCollectionFromFolder(handle) {
  let name = handle.name;
  let variables = {};
  try {
    const metaFile = await handle.getFileHandle(METADATA_FILE);
    const text = await (await metaFile.getFile()).text();
    const meta = JSON.parse(text);
    if (typeof meta.name === 'string' && meta.name.trim()) name = meta.name;
    variables = cleanVariables(meta.variables);
  } catch {
    // No _collection.json yet - fall back to the directory's own name.
  }

  const skipped = [];
  const fileHandlesById = new Map();
  const items = await readDirectory(handle, skipped, fileHandlesById);
  return { name, items, skipped, fileHandlesById, variables };
}

function metadataWithVariables(fields, variables) {
  const payload = { ...fields };
  const clean = cleanVariables(variables);
  if (Object.keys(clean).length) payload.variables = clean;
  return payload;
}

export async function writeCollectionMetadata(handle, name, variables) {
  const fileHandle = await handle.getFileHandle(METADATA_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(metadataWithVariables({ name }, variables), null, 2));
  await writable.close();
}

export async function readEnvironmentsFile(handle) {
  try {
    const fileHandle = await handle.getFileHandle(ENV_FILE);
    const text = await (await fileHandle.getFile()).text();
    const data = JSON.parse(text);
    const environments = Array.isArray(data.environments)
      ? data.environments.filter((env) => env && typeof env.name === 'string' && env.variables && typeof env.variables === 'object' && !Array.isArray(env.variables))
      : [];
    return { environments, activeName: typeof data.activeName === 'string' ? data.activeName : '' };
  } catch {
    return { environments: [], activeName: '' };
  }
}

export async function writeEnvironmentsFile(handle, environments, activeName) {
  const fileHandle = await handle.getFileHandle(ENV_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  const payload = {
    activeName: activeName || '',
    environments: (environments || []).map((env) => ({
      name: env.name,
      variables: cleanVariables(env.variables),
    })),
  };
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

async function writeChildItems(dirHandle, items, handles) {
  const fileNames = new Set();
  const dirNames = new Set();
  for (const item of items || []) {
    if (item.type === 'folder') {
      const created = await createFolderDir(dirHandle, item.name, item.id, dirNames);
      dirNames.add(created.dirName);
      if (item.variables && Object.keys(item.variables).length) {
        await writeFolderMetadata(created.handle, item.id, item.name, item.variables);
      }
      handles.set(item.id, { kind: 'dir', handle: created.handle, parentHandle: dirHandle, dirName: created.dirName });
      await writeChildItems(created.handle, item.items, handles);
      continue;
    }
    if (item.type !== 'request') continue;
    const entry = { id: item.id, name: item.name, request: item.request };
    const fileName = await writeRequestFile(dirHandle, entry, null, fileNames);
    fileNames.add(fileName);
    handles.set(item.id, { kind: 'file', handle: null, parentHandle: dirHandle, fileName });
  }
}

// Writes one imported folder and everything inside it. If a later file fails,
// the new directory is removed so a half-written import is not left behind.
export async function writeFolderTree(parentHandle, folder, existingDirNames) {
  const created = await createFolderDir(parentHandle, folder.name, folder.id, existingDirNames);
  const handles = new Map();
  try {
    if (folder.variables && Object.keys(folder.variables).length) {
      await writeFolderMetadata(created.handle, folder.id, folder.name, folder.variables);
    }
    handles.set(folder.id, { kind: 'dir', handle: created.handle, parentHandle, dirName: created.dirName });
    await writeChildItems(created.handle, folder.items, handles);
    return handles;
  } catch (err) {
    try {
      await parentHandle.removeEntry(created.dirName, { recursive: true });
    } catch {
      // The original write error is the one the caller should see.
    }
    throw err;
  }
}

export async function writeFolderMetadata(dirHandle, id, name, variables) {
  const fileHandle = await dirHandle.getFileHandle(FOLDER_METADATA_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(metadataWithVariables({ id, name }, variables), null, 2));
  await writable.close();
}

export async function deleteRequestFile(parentHandle, fileName) {
  try {
    await parentHandle.removeEntry(fileName);
  } catch {
    // Already gone - nothing to do.
  }
}

// Writes entry to disk under parentHandle, picking a filename that avoids
// colliding with any other request's file in that same directory. If the
// request previously had a different filename in this same directory (it
// was renamed), the old file is removed so renames don't leave an orphan.
// Returns the filename actually used.
export async function writeRequestFile(parentHandle, entry, previousFileName, existingFileNames) {
  const namesExcludingSelf = new Set([...existingFileNames].filter((n) => n !== previousFileName));
  const fileName = uniqueFileName(namesExcludingSelf, entry.name);

  if (previousFileName && previousFileName !== fileName) {
    await deleteRequestFile(parentHandle, previousFileName);
  }

  const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(entry, null, 2));
  await writable.close();
  return fileName;
}

// Creates a new subdirectory for a folder item, writing its _folder.json.
// Returns the live handle and the directory name actually used (so the
// caller can track it in its id -> handle map).
export async function createFolderDir(parentHandle, name, id, existingDirNames) {
  const dirName = uniqueDirName(existingDirNames, name);
  const dirHandle = await parentHandle.getDirectoryHandle(dirName, { create: true });
  const metaHandle = await dirHandle.getFileHandle(FOLDER_METADATA_FILE, { create: true });
  const writable = await metaHandle.createWritable();
  await writable.write(JSON.stringify({ id, name }, null, 2));
  await writable.close();
  return { handle: dirHandle, dirName };
}

// Moving a single request file: the File System Access API has no
// cross-parent rename, so this reads the entry (the caller already has
// `entry`, the in-memory {id, name, request} object, so no read is actually
// needed here) and writes it fresh under the destination parent, then
// deletes the original. Returns the new filename.
export async function moveRequestFile(sourceParentHandle, fileName, destParentHandle, entry, existingDestFileNames) {
  const newFileName = await writeRequestFile(destParentHandle, entry, null, existingDestFileNames);
  await deleteRequestFile(sourceParentHandle, fileName);
  return newFileName;
}

// Moving a folder: there's no atomic cross-parent directory move in the File
// System Access API, so this recursively copies every file/subdirectory
// into a freshly created directory under the destination parent, then
// recursively removes the original directory tree.
export async function moveFolderDir(sourceParentHandle, dirName, destParentHandle, existingDestDirNames) {
  const sourceHandle = await sourceParentHandle.getDirectoryHandle(dirName);
  const newDirName = uniqueDirName(existingDestDirNames, dirName);
  const newDirHandle = await destParentHandle.getDirectoryHandle(newDirName, { create: true });
  await copyDirectoryContents(sourceHandle, newDirHandle);
  await sourceParentHandle.removeEntry(dirName, { recursive: true });
  return newDirName;
}

async function copyDirectoryContents(sourceHandle, destHandle) {
  for await (const [entryName, entryHandle] of sourceHandle.entries()) {
    if (entryHandle.kind === 'directory') {
      const newChildDir = await destHandle.getDirectoryHandle(entryName, { create: true });
      await copyDirectoryContents(entryHandle, newChildDir);
    } else {
      const file = await entryHandle.getFile();
      const text = await file.text();
      const newFileHandle = await destHandle.getFileHandle(entryName, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(text);
      await writable.close();
    }
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function persistHandle(handle) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function restoreHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearPersistedHandle() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
