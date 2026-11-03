export function parseEnvironments(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.name === 'string' && e.variables && typeof e.variables === 'object')
      : [];
  } catch {
    return [];
  }
}

export function upsertEnvironment(environments, env) {
  const index = environments.findIndex((e) => e.name === env.name);
  if (index === -1) return [...environments, env];
  const next = [...environments];
  next[index] = env;
  return next;
}

export function removeEnvironment(environments, name) {
  return environments.filter((e) => e.name !== name);
}

// Disk and browser copies are combined. A key that exists in both keeps the
// browser value. A key that exists on only one side is kept, so a connect
// never drops a variable that lived in only one place.
export function mergeEnvironments(local, disk) {
  const byName = new Map();
  (disk || []).forEach((env) => {
    if (!env || typeof env.name !== 'string') return;
    byName.set(env.name, { name: env.name, variables: { ...(env.variables || {}) } });
  });
  (local || []).forEach((env) => {
    if (!env || typeof env.name !== 'string') return;
    const existing = byName.get(env.name);
    byName.set(env.name, {
      name: env.name,
      variables: { ...(existing?.variables || {}), ...(env.variables || {}) },
    });
  });
  return [...byName.values()];
}

// Postman environment export. Bruno imports this same file
// (Environments → Import environment). Disabled rows are omitted on import
// by Bruno; we keep that rule so a file from either tool loads the same way.
export function exportEnvironmentPostman(env) {
  return JSON.stringify(
    {
      id: crypto.randomUUID(),
      name: env.name,
      values: Object.entries(env.variables || {}).map(([key, value]) => ({
        key,
        value: value == null ? '' : String(value),
        type: 'default',
        enabled: true,
      })),
      _postman_variable_scope: 'environment',
    },
    null,
    2
  );
}

export function importEnvironment(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${err.message}` };
  }
  if (data && typeof data.name === 'string' && Array.isArray(data.values) && data._postman_variable_scope !== 'globals') {
    const variables = {};
    data.values.forEach((row) => {
      if (!row || !row.key || row.enabled === false) return;
      variables[String(row.key)] = row.value == null ? '' : String(row.value);
    });
    return { ok: true, environment: { name: data.name, variables } };
  }
  if (data && typeof data.name === 'string' && data.variables && typeof data.variables === 'object' && !Array.isArray(data.variables)) {
    return { ok: true, environment: { name: data.name, variables: data.variables } };
  }
  return { ok: false, error: 'Unrecognized environment format (expected a Postman environment export).' };
}
