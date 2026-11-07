'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveFolder } = require('./serviceInput');

const KEYS = {
  name: 'name',
  service: 'name',
  path: 'path',
  folder: 'path',
  command: 'command',
  start: 'command',
  port: 'port',
  section: 'section',
  group: 'section',
  stack: 'stack',
  framework: 'stack',
  needsaws: 'needsAws',
};

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

function readReadme(folder) {
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch (err) {
    return null;
  }
  const found = names.find((name) => /^readme\.md$/i.test(name));
  if (!found) return null;
  try {
    return fs.readFileSync(path.join(folder, found), 'utf8');
  } catch (err) {
    return null;
  }
}

function launchpadText(markdown) {
  const parts = [];
  const fence = /```[ \t]*launchpad[ \t]*\r?\n([\s\S]*?)```/gi;
  let match = fence.exec(markdown);
  while (match) {
    parts.push(match[1]);
    match = fence.exec(markdown);
  }
  return parts.join('\n\n');
}

function asBool(value) {
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return null;
}

function asSection(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'frontend' || text === 'front-end' || text === 'ui' || text === 'web') return 'frontend';
  if (text === 'backend' || text === 'back-end' || text === 'api' || text === 'server') return 'backend';
  return null;
}

function parseLaunchpadReadme(markdown) {
  const text = launchpadText(markdown);
  if (!text.trim()) return [];
  const services = [];
  let current = null;
  function flush() {
    if (current && Object.keys(current).length) services.push(current);
    current = null;
  }
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      if (!line) flush();
      return;
    }
    const sep = line.indexOf(':');
    if (sep <= 0) return;
    const key = KEYS[line.slice(0, sep).trim().toLowerCase().replace(/[\s_-]/g, '')];
    if (!key) return;
    const value = line.slice(sep + 1).trim();
    if (!current) current = {};
    if (key === 'needsAws') {
      const flag = asBool(value);
      if (flag != null) current.needsAws = flag;
      return;
    }
    if (key === 'section') {
      const section = asSection(value);
      if (section) current.section = section;
      return;
    }
    if (key === 'port') {
      const port = Number(value);
      if (Number.isInteger(port) && port >= 1 && port <= 65535) current.port = port;
      return;
    }
    if (value) current[key] = value;
  });
  flush();
  return services;
}

function insideFolder(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function overlay(base, spec) {
  const next = { ...base, fromReadme: true };
  const name = slug(spec.name);
  if (name) next.name = name;
  if (spec.command) next.command = spec.command;
  if (spec.port) next.port = spec.port;
  if (spec.section) next.section = spec.section;
  const framework = slug(spec.stack);
  if (framework) next.framework = framework;
  if (Object.prototype.hasOwnProperty.call(spec, 'needsAws')) next.needsAws = spec.needsAws;
  return next;
}

function applyReadme(folder, detected, workspaceRoot, detectFolder) {
  const specs = parseLaunchpadReadme(readReadme(folder) || '');
  if (!specs.length) return detected;

  const services = [];
  specs.forEach((spec) => {
    const relative = spec.path && spec.path !== '.' ? spec.path : '';
    if (!relative) {
      services.push(overlay(detected, spec));
      return;
    }
    let serviceFolder;
    try {
      serviceFolder = resolveFolder(path.resolve(folder, relative), workspaceRoot);
    } catch (err) {
      services.push({
        path: path.resolve(folder, relative),
        name: slug(spec.name) || slug(relative) || 'service',
        command: spec.command || null,
        framework: slug(spec.stack) || null,
        section: spec.section || 'backend',
        port: spec.port || null,
        fromReadme: true,
        error: err.message,
      });
      return;
    }
    if (!insideFolder(folder, serviceFolder)) return;
    const base = serviceFolder === folder ? detected : detectFolder(serviceFolder);
    const next = overlay(base, spec);
    next.path = serviceFolder;
    services.push(next);
  });

  if (!services.length) return detected;
  if (services.length === 1) return services[0];
  return { ...services[0], services };
}

module.exports = {
  applyReadme,
  parseLaunchpadReadme,
  readReadme,
};
