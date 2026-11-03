export function cleanVariables(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const variables = {};
  Object.entries(raw).forEach(([key, value]) => {
    const name = String(key || '').trim();
    if (!name) return;
    variables[name] = value == null ? '' : String(value);
  });
  return variables;
}

export function mergeVariableLayers(layers) {
  const values = {};
  const sourceByKey = {};
  (layers || []).forEach((layer) => {
    const variables = cleanVariables(layer?.variables);
    Object.entries(variables).forEach(([key, value]) => {
      values[key] = value;
      sourceByKey[key] = layer.source || 'Folder';
    });
  });
  const rows = Object.keys(values).map((key) => ({ key, value: values[key], source: sourceByKey[key] }));
  return { values, rows };
}

function chainTo(items, targetId, chain) {
  for (const item of items || []) {
    if (item.id === targetId) return [...chain, item];
    if (item.type === 'folder') {
      const found = chainTo(item.items, targetId, [...chain, item]);
      if (found) return found;
    }
  }
  return null;
}

// Folders from the collection root down to and including `folderId`.
export function folderChain(items, folderId) {
  if (!folderId) return [];
  return (chainTo(items, folderId, []) || []).filter((node) => node.type === 'folder');
}

// Environment, then the collection, then each folder from the root down to the
// folder that holds the request. A later layer wins when the name matches.
export function variablesForRequest(collection, requestId, environment) {
  const layers = [{ source: environment?.name || 'Environment', variables: environment?.variables }];
  if (collection?.variables) layers.push({ source: collection.name, variables: collection.variables });
  (chainTo(collection?.items, requestId, []) || []).forEach((node) => {
    if (node.type !== 'folder') return;
    layers.push({ source: node.name, variables: node.variables });
  });
  return mergeVariableLayers(layers);
}

export function variablesForScope(collection, folderId, environment) {
  const layers = [{ source: environment?.name || 'Environment', variables: environment?.variables }];
  if (collection?.variables) layers.push({ source: collection.name, variables: collection.variables });
  folderChain(collection?.items, folderId).forEach((folder) => {
    layers.push({ source: folder.name, variables: folder.variables });
  });
  return mergeVariableLayers(layers);
}

// The folder that holds the request. A request at the collection root has no
// folder, so the script writes land on the collection instead.
export function scriptHome(collection, requestId) {
  const chain = chainTo(collection?.items, requestId, []);
  if (!chain) return null;
  const folders = chain.filter((node) => node.type === 'folder');
  if (!folders.length) return { folderId: null, name: collection.name, kind: 'collection' };
  const folder = folders[folders.length - 1];
  return { folderId: folder.id, name: folder.name, kind: 'folder' };
}

// Writes captured earlier in a run. Collection writes apply first, then each
// folder from the root down to the request, so the nearest folder wins.
export function overlayScriptWrites(collection, requestId, writes) {
  const values = { ...(writes?.[''] || {}) };
  const home = scriptHome(collection, requestId);
  if (home?.folderId) {
    folderChain(collection.items, home.folderId).forEach((folder) => {
      Object.assign(values, writes?.[folder.id] || {});
    });
  }
  return values;
}

export function resolveTabVariables(collections, tab, environment) {
  const fallback = mergeVariableLayers([{ source: environment?.name || 'Environment', variables: environment?.variables }]);
  if (!tab?.saveCollectionName || !tab.saveItemId) return fallback;
  const collection = (collections || []).find((item) => item.name === tab.saveCollectionName);
  if (!collection || !chainTo(collection.items, tab.saveItemId, [])) return fallback;
  return variablesForRequest(collection, tab.saveItemId, environment);
}

export function changedVariables(before, after) {
  const updates = {};
  Object.entries(after || {}).forEach(([key, value]) => {
    if (!before || before[key] !== value) updates[key] = value;
  });
  return updates;
}
