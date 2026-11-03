'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Names Launchpad uses itself. Registering them again makes `tilt up` fail
// with a duplicate resource, so the UI rejects them.
const RESERVED_NAMES = new Set([
  'aws-creds',
  'dashboard',
]);

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const FRAMEWORK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function resolveFolder(rawPath, workspaceRoot) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) throw new ServiceError(400, 'Enter the folder path for this repo.');
  const expanded = expandHome(trimmed);
  const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(workspaceRoot, expanded);
  let real;
  try {
    real = fs.realpathSync(absolute);
  } catch (err) {
    throw new ServiceError(400, 'That folder does not exist.');
  }
  if (!fs.statSync(real).isDirectory()) {
    throw new ServiceError(400, 'That path is not a folder.');
  }
  return real;
}

function normalizeService(input, workspaceRoot) {
  const name = String((input && input.name) || '').trim();
  if (!NAME_PATTERN.test(name)) {
    throw new ServiceError(400, 'Use a short name like api or billing-web (lowercase letters, numbers, and dashes).');
  }
  if (RESERVED_NAMES.has(name)) {
    throw new ServiceError(409, `${name} is already defined in the Tiltfile.`);
  }
  const folder = resolveFolder(input && input.path, workspaceRoot);
  const command = String((input && input.command) || '').trim();
  if (!command) throw new ServiceError(400, 'Enter the command that starts this service.');
  if (/[\r\n]/.test(command) || command.length > 500) {
    throw new ServiceError(400, 'The start command must be a single line.');
  }
  const requested = input && input.section;
  const section = requested === 'frontend' || requested === 'backend' ? requested : null;
  if (!section) throw new ServiceError(400, 'Choose backend or frontend.');
  let port = null;
  if (input && input.port !== '' && input.port != null) {
    port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceError(400, 'Port must be between 1 and 65535.');
    }
  }
  let framework = String((input && input.framework) || '').trim().toLowerCase();
  if (framework.startsWith('fw-')) framework = framework.slice(3);
  if (framework && !FRAMEWORK_PATTERN.test(framework)) {
    throw new ServiceError(400, 'Framework should look like node, django, or spring-boot.');
  }
  return {
    name,
    path: folder,
    command,
    port,
    section,
    framework: framework || null,
    needsAws: Boolean(input && input.needsAws),
  };
}

module.exports = {
  RESERVED_NAMES,
  ServiceError,
  resolveFolder,
  normalizeService,
};
