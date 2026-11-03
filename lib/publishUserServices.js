'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { renderUserTiltfile } = require('./renderUserTiltfile');

function publishUserServices(services, tiltfilePath, trigger) {
  fs.mkdirSync(path.dirname(tiltfilePath), { recursive: true });
  const next = renderUserTiltfile(services);
  const previous = fs.existsSync(tiltfilePath) ? fs.readFileSync(tiltfilePath, 'utf8') : null;
  if (previous === next) return { changed: false };
  fs.writeFileSync(tiltfilePath, next);
  if (trigger) trigger();
  return { changed: true };
}

// Re-read the Tiltfile so a newly written include is picked up. Unchanged
// resources stay as they are; Tilt only applies the diff.
function triggerTiltfileReload() {
  const child = spawn('tilt', ['trigger', '(Tiltfile)'], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

module.exports = { publishUserServices, triggerTiltfileReload };
