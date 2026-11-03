// Runs a user-authored script after a response comes back, giving it a
// small curated API (modeled loosely on Postman's pm.* convention for
// familiarity) rather than the raw page/DOM. This is NOT a hardened sandbox:
// the script executes via `new Function` with the same privileges as the
// rest of this page (it could still call fetch(), read localStorage, etc.).
// The trust model is the same as every other "paste your own input" field in
// this app - it only ever runs a script YOU typed or pasted yourself, never
// code fetched automatically from anywhere. Only run scripts you wrote or
// trust, same as you would with a Postman/Insomnia/Bruno pre/post-request
// script.
export function runPostResponseScript(script, response, getEnvVar) {
  const trimmed = (script || '').trim();
  if (!trimmed) {
    return { ok: true, envUpdates: {}, tests: [] };
  }

  const envUpdates = {};
  const tests = [];
  const pm = {
    response: {
      status: response.status,
      headers: response.headers,
      body: response.body,
      json() {
        return JSON.parse(response.body);
      },
      to: {
        have: {
          status(code) {
            if (response.status !== code) {
              throw new Error(`expected status ${code} but got ${response.status}`);
            }
          },
        },
      },
    },
    environment: {
      get: (key) => (Object.prototype.hasOwnProperty.call(envUpdates, key) ? envUpdates[key] : getEnvVar(key)),
      set: (key, value) => {
        envUpdates[key] = value;
      },
    },
    test(name, fn) {
      try {
        fn();
        tests.push({ name, ok: true });
      } catch (err) {
        tests.push({ name, ok: false, error: err.message });
      }
    },
    expect(actual) {
      return {
        to: {
          equal(expected) {
            if (actual !== expected) {
              throw new Error(`expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
            }
          },
          eql(expected) {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
              throw new Error(`expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
            }
          },
        },
      };
    },
  };

  try {
    const run = new Function('pm', trimmed);
    run(pm);
    return { ok: true, envUpdates, tests };
  } catch (err) {
    return { ok: false, error: err.message, envUpdates, tests };
  }
}
