// Pure helpers for the file-based collections feature, split out from
// fileSystemCollections.js so the naming/validation logic can be unit-tested
// with plain `node --test` - the File System Access API calls themselves
// can't be (see fileSystemCollections.js for why).

export function sanitizeFileName(name) {
  const cleaned = String(name).replace(/[\\/:*?"<>|]/g, '-').trim();
  // A name made of nothing but path-unsafe characters (e.g. "///") sanitizes
  // to a string of dashes, which is truthy but not a meaningful filename.
  return cleaned && !/^-+$/.test(cleaned) ? cleaned : 'untitled';
}

// Picks a request's .json filename, appending a numeric suffix on collision
// with any name already in use (excluding the request's own previous
// filename, so re-saving a request under the same name doesn't collide with
// itself).
export function uniqueFileName(existingFileNames, desiredName) {
  const base = sanitizeFileName(desiredName);
  const candidate = `${base}.json`;
  if (!existingFileNames.has(candidate)) {
    return candidate;
  }
  let suffix = 2;
  let next = `${base} (${suffix}).json`;
  while (existingFileNames.has(next)) {
    suffix += 1;
    next = `${base} (${suffix}).json`;
  }
  return next;
}

// Same collision-suffix behavior as uniqueFileName, for directory names
// instead of filenames (no extension to append).
export function uniqueDirName(existingDirNames, desiredName) {
  const base = sanitizeFileName(desiredName);
  if (!existingDirNames.has(base)) {
    return base;
  }
  let suffix = 2;
  let next = `${base} (${suffix})`;
  while (existingDirNames.has(next)) {
    suffix += 1;
    next = `${base} (${suffix})`;
  }
  return next;
}

export function isValidRequestFileShape(data) {
  return Boolean(data) && typeof data === 'object' && typeof data.name === 'string' && Boolean(data.request) && typeof data.request === 'object';
}
