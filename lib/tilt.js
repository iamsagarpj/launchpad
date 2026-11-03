'use strict';

const { execFile, spawn } = require('node:child_process');
const { classifyResource } = require('./classify');

function run(args) {
  return new Promise((resolve, reject) => {
    execFile('tilt', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function getResources(excludeNames) {
  const stdout = await run(['get', 'uiresources', '-o', 'json']);
  const parsed = JSON.parse(stdout);
  const items = parsed.items || [];
  return items
    .filter((item) => !excludeNames.includes(item.metadata.name))
    .map(classifyResource);
}

async function isEnabled(name) {
  const stdout = await run(['get', 'uiresources', name, '-o', 'json']);
  const parsed = JSON.parse(stdout);
  return parsed.status.disableStatus.state === 'Enabled';
}

async function toggleResource(name) {
  try {
    const currentlyEnabled = await isEnabled(name);
    if (currentlyEnabled) {
      await run(['disable', name]);
      return { ok: true, enabled: false };
    }
    await run(['enable', name]);
    return { ok: true, enabled: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function triggerResource(name) {
  try {
    await run(['trigger', name]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function enableOne(name) {
  try {
    await run(['enable', name]);
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, error: err.message };
  }
}

async function disableOne(name) {
  try {
    await run(['disable', name]);
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, error: err.message };
  }
}

async function enableAll(names) {
  const results = await Promise.all(names.map(enableOne));
  return { ok: results.every((r) => r.ok), results };
}

async function disableAll(names) {
  const results = await Promise.all(names.map(disableOne));
  return { ok: results.every((r) => r.ok), results };
}

// Lets server.js tell apart "I was launched by `tilt up` as the dashboard's own
// serve_cmd" (Tilt's API is already up) from "someone ran `node server.js` by hand
// before starting Tilt" - the latter is exactly the stray/un-managed process we had
// to hand-kill once already, so server.js uses this to self-bootstrap `tilt up`
// instead of silently binding the port on top of nothing.
function isRunning(runner = run) {
  return runner(['get', 'uiresources', '-o', 'json']).then(() => true).catch(() => false);
}

// Keyed by name, not hardcoded to 'aws-creds', so a future second AWS-gated
// resource doesn't need a new code path here.
let awsLoginInFlight = null;

function loginAws(profile, recheckName, spawnFn = spawn, triggerFn = triggerResource) {
  if (awsLoginInFlight) {
    return awsLoginInFlight;
  }
  awsLoginInFlight = new Promise((resolve) => {
    // No stdio capture: the only thing that matters is `aws sso login` opening the
    // user's browser (which it does regardless of stdio), not anything it prints.
    const child = spawnFn('aws', ['sso', 'login', '--profile', profile]);
    const finish = (result) => {
      awsLoginInFlight = null;
      resolve(result);
    };
    child.on('exit', (code) => {
      if (code === 0) {
        // Tilt's own check never re-runs on its own once it has failed once, so
        // without this the dashboard would stay stuck on the old error forever
        // even after the user finishes logging in in the browser.
        triggerFn(recheckName).catch(() => {});
      }
      finish({ ok: code === 0 });
    });
    child.on('error', (err) => {
      finish({ ok: false, error: err.message });
    });
  });
  return awsLoginInFlight;
}

function streamLogs(name, onLine) {
  const child = spawn('tilt', ['logs', '-f', '--tail', '200', name]);
  let buffer = '';
  child.on('error', (err) => {
    onLine(`[log stream error: ${err.message}]`);
  });
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(onLine);
  });
  child.stderr.on('data', (chunk) => {
    onLine(chunk.toString());
  });
  return () => {
    child.kill();
  };
}

module.exports = {
  getResources,
  toggleResource,
  triggerResource,
  enableAll,
  disableAll,
  streamLogs,
  isRunning,
  loginAws,
};
