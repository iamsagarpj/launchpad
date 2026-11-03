// Same trust model as postResponseScript.js: the script runs via new Function
// with this page's privileges. Only run a script you wrote or trust.
export function runPreRequestScript(script, request, getEnvVar) {
  const trimmed = (script || '').trim();
  if (!trimmed) {
    return { ok: true, envUpdates: {}, headerAdds: [] };
  }

  const envUpdates = {};
  const headerAdds = [];
  const pm = {
    environment: {
      get: (key) => (Object.prototype.hasOwnProperty.call(envUpdates, key) ? envUpdates[key] : getEnvVar(key)),
      set: (key, value) => {
        envUpdates[key] = value;
      },
    },
    request: {
      method: request.method,
      url: request.url,
      headers: {
        add(keyOrHeader, value) {
          if (keyOrHeader && typeof keyOrHeader === 'object') {
            headerAdds.push({ key: keyOrHeader.key, value: keyOrHeader.value });
            return;
          }
          headerAdds.push({ key: keyOrHeader, value });
        },
      },
    },
  };

  try {
    const run = new Function('pm', trimmed);
    run(pm);
    return { ok: true, envUpdates, headerAdds };
  } catch (err) {
    return { ok: false, error: err.message, envUpdates, headerAdds };
  }
}
