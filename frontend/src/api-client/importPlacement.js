import { cleanVariables } from './scopeVariables.js';

export function findSiblingByName(items, name) {
  return (items || []).find((item) => item && item.name === name) || null;
}

// "Billing" then "Billing (2)", "Billing (3)", ... so Keep both never overwrites.
export function siblingCopyName(existingNames, name) {
  const taken = new Set(existingNames);
  if (!taken.has(name)) return name;
  let suffix = 2;
  let next = `${name} (${suffix})`;
  while (taken.has(next)) {
    suffix += 1;
    next = `${name} (${suffix})`;
  }
  return next;
}

// An imported collection becomes one folder. Its variables stay on that folder,
// so a later run uses them without rewriting the selected environment.
export function collectionToFolder(collection, name) {
  const folder = {
    id: crypto.randomUUID(),
    type: 'folder',
    name: name || collection?.name || 'Imported collection',
    items: Array.isArray(collection?.items) ? collection.items : [],
  };
  const variables = cleanVariables(collection?.variables);
  if (Object.keys(variables).length) folder.variables = variables;
  return folder;
}
