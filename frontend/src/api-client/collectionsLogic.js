// Collections are a recursive tree: a Collection is {name, items: Item[]},
// where an Item is either a folder ({id, type:'folder', name, items}) or a
// request ({id, type:'request', name, request}). Every item carries a stable
// id (generated once, never regenerated) so drag-and-drop and the
// file-system backend can address an item by identity instead of by array
// position or name - both of which change under rename/reorder.

function generateId() {
  return crypto.randomUUID();
}

export function findNode(items, id) {
  for (const node of items) {
    if (node.id === id) return node;
    if (node.type === 'folder') {
      const found = findNode(node.items, id);
      if (found) return found;
    }
  }
  return null;
}

export function removeNode(items, id) {
  let removed = null;
  const next = [];
  for (const node of items) {
    if (node.id === id) {
      removed = node;
      continue;
    }
    if (node.type === 'folder') {
      const [childRemoved, childItems] = removeNode(node.items, id);
      if (childRemoved) removed = childRemoved;
      next.push({ ...node, items: childItems });
    } else {
      next.push(node);
    }
  }
  return [removed, next];
}

function insertNodeDeep(items, parentId, node, index) {
  let inserted = false;
  const next = items.map((item) => {
    if (inserted) return item;
    if (item.id === parentId && item.type === 'folder') {
      inserted = true;
      const childItems = [...item.items];
      const at = index === undefined || index < 0 || index > childItems.length ? childItems.length : index;
      childItems.splice(at, 0, node);
      return { ...item, items: childItems };
    }
    if (item.type === 'folder') {
      const [childItems, childInserted] = insertNodeDeep(item.items, parentId, node, index);
      if (childInserted) {
        inserted = true;
        return { ...item, items: childItems };
      }
    }
    return item;
  });
  return [next, inserted];
}

export function insertNode(items, parentId, node, index) {
  if (parentId === null || parentId === undefined) {
    const next = [...items];
    const at = index === undefined || index < 0 || index > next.length ? next.length : index;
    next.splice(at, 0, node);
    return next;
  }
  const [next, inserted] = insertNodeDeep(items, parentId, node, index);
  if (inserted) return next;
  // parentId didn't resolve to any folder anywhere in the tree - fail safe
  // by appending at the root rather than silently dropping the node (e.g. a
  // folder deleted concurrently with a pending move/save targeting it).
  return [...items, node];
}

function replaceNodeInPlace(items, id, newNode) {
  return items.map((item) => {
    if (item.id === id) return newNode;
    if (item.type === 'folder') return { ...item, items: replaceNodeInPlace(item.items, id, newNode) };
    return item;
  });
}

// Lifts a legacy {name, requests: [{name, request}]} collection into
// {name, items}. A collection already in {name, items} shape passes through
// unchanged. Legacy requests missing an id (every request saved before this
// change) get one generated here, once, on first load.
export function upgradeCollection(collection) {
  if (Array.isArray(collection.items)) {
    return collection;
  }
  return {
    name: collection.name,
    items: (collection.requests || []).map((entry) => ({
      id: entry.id || generateId(),
      type: 'request',
      name: entry.name,
      request: entry.request,
    })),
  };
}

export function parseCollections(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.name === 'string' && (Array.isArray(c.items) || Array.isArray(c.requests)))
      .map(upgradeCollection);
  } catch {
    return [];
  }
}

export function createCollection(collections, name) {
  return [...collections, { name, items: [] }];
}

export function renameCollection(collections, oldName, newName) {
  return collections.map((c) => (c.name === oldName ? { ...c, name: newName } : c));
}

export function deleteCollection(collections, name) {
  return collections.filter((c) => c.name !== name);
}

function withVariables(node, variables) {
  const next = { ...node };
  if (variables && Object.keys(variables).length) next.variables = variables;
  else delete next.variables;
  return next;
}

function setFolderVariables(items, folderId, variables) {
  return items.map((item) => {
    if (item.id === folderId && item.type === 'folder') return withVariables(item, variables);
    if (item.type === 'folder') return { ...item, items: setFolderVariables(item.items, folderId, variables) };
    return item;
  });
}

// folderId null stores the variables on the collection itself.
export function setNodeVariables(collections, collectionName, folderId, variables) {
  return collections.map((collection) => {
    if (collection.name !== collectionName) return collection;
    if (folderId == null) return withVariables(collection, variables);
    return { ...collection, items: setFolderVariables(collection.items, folderId, variables) };
  });
}

export function createFolder(collections, collectionName, parentId, name, id = generateId()) {
  const folder = { id, type: 'folder', name, items: [] };
  return collections.map((c) =>
    c.name === collectionName ? { ...c, items: insertNode(c.items, parentId, folder, undefined) } : c
  );
}

// Creates a new request (appended under parentId) if node.id isn't already
// present anywhere in the collection, otherwise updates it in place -
// preserving its existing position and parent folder. Moving an item
// between folders is a separate, explicit operation: moveItem.
export function upsertRequestInCollection(collections, collectionName, parentId, node) {
  return collections.map((c) => {
    if (c.name !== collectionName) return c;
    if (findNode(c.items, node.id)) {
      return { ...c, items: replaceNodeInPlace(c.items, node.id, node) };
    }
    return { ...c, items: insertNode(c.items, parentId, node, undefined) };
  });
}

export function removeItemById(collections, itemId) {
  return collections.map((c) => {
    const [, items] = removeNode(c.items, itemId);
    return { ...c, items };
  });
}

// The core drag-and-drop primitive: pulls the item out from wherever it
// currently lives (any collection, any depth) and inserts it at the given
// destination. Works across collections for free since it scans the whole
// `collections` array rather than operating on one collection at a time.
export function moveItem(collections, itemId, destCollectionName, destParentId, destIndex) {
  let moved = null;
  const withoutItem = collections.map((c) => {
    const [removed, items] = removeNode(c.items, itemId);
    if (removed) moved = removed;
    return { ...c, items };
  });
  if (!moved) return collections;
  return withoutItem.map((c) =>
    c.name === destCollectionName ? { ...c, items: insertNode(c.items, destParentId, moved, destIndex) } : c
  );
}

// Inserts an entire (e.g. imported) collection, renaming it with a numeric
// suffix if its name collides with an existing one, so an import never
// silently clobbers an existing collection. Accepts either shape (legacy
// requests[] or current items[]) and normalizes via upgradeCollection.
export function addFullCollection(collections, collection) {
  const upgraded = upgradeCollection(collection);
  const existingNames = new Set(collections.map((c) => c.name));
  let name = upgraded.name;
  let suffix = 2;
  while (existingNames.has(name)) {
    name = `${upgraded.name} (${suffix})`;
    suffix += 1;
  }
  return [...collections, { ...upgraded, name }];
}

// Flattens every folder (including each collection's own root) into a flat
// list of {collectionName, parentId, label} options for the Save modal's
// folder-path picker - e.g. "My Collection / Auth flow / Edge cases".
export function flattenFolderPaths(collections) {
  const paths = [];
  function walk(items, collectionName, parentId, prefix) {
    paths.push({ collectionName, parentId, label: prefix });
    items.forEach((item) => {
      if (item.type === 'folder') {
        walk(item.items, collectionName, item.id, `${prefix} / ${item.name}`);
      }
    });
  }
  collections.forEach((c) => walk(c.items, c.name, null, c.name));
  return paths;
}
