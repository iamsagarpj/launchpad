function compileRegex(pattern, flags) {
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Ensures the 'g' flag is present so matchAll can iterate every match,
// without mutating what the caller displays as "the flags you typed".
function withGlobalFlag(flags) {
  return flags.includes('g') ? flags : `${flags}g`;
}

export function testRegex(pattern, flags, input) {
  if (!pattern) {
    return { ok: true, matches: [] };
  }
  const compiled = compileRegex(pattern, withGlobalFlag(flags));
  if (!compiled.ok) {
    return { ok: false, error: compiled.error };
  }
  const matches = [];
  for (const match of input.matchAll(compiled.regex)) {
    matches.push({
      match: match[0],
      index: match.index,
      groups: match.slice(1),
      namedGroups: match.groups ? { ...match.groups } : null,
    });
  }
  return { ok: true, matches };
}

export function applyReplacement(pattern, flags, input, replacement) {
  if (!pattern) {
    return { ok: true, result: input };
  }
  const compiled = compileRegex(pattern, withGlobalFlag(flags));
  if (!compiled.ok) {
    return { ok: false, error: compiled.error };
  }
  return { ok: true, result: input.replace(compiled.regex, replacement) };
}
