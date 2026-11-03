'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { ServiceError, normalizeService } = require('./serviceInput');

function toService(record) {
  if (!record) return null;
  return {
    name: record.name,
    path: record.path,
    command: record.command,
    port: record.port,
    section: record.section,
    framework: record.framework,
    needsAws: Boolean(record.needsAws),
  };
}

function openServiceStore(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      command TEXT NOT NULL,
      port INTEGER,
      section TEXT NOT NULL,
      framework TEXT,
      needs_aws INTEGER NOT NULL DEFAULT 0
    )
  `);

  const listStmt = db.prepare(`
    SELECT name, path, command, port, section, framework, needs_aws AS needsAws
    FROM services
    ORDER BY name
  `);
  const getStmt = db.prepare(`
    SELECT name, path, command, port, section, framework, needs_aws AS needsAws
    FROM services
    WHERE name = ?
  `);
  const insertStmt = db.prepare(`
    INSERT INTO services (name, path, command, port, section, framework, needs_aws)
    VALUES (@name, @path, @command, @port, @section, @framework, @needsAws)
  `);
  const updateStmt = db.prepare(`
    UPDATE services
    SET path = @path,
        command = @command,
        port = @port,
        section = @section,
        framework = @framework,
        needs_aws = @needsAws
    WHERE name = @name
  `);
  const deleteStmt = db.prepare('DELETE FROM services WHERE name = ?');

  function persist(service) {
    return {
      name: service.name,
      path: service.path,
      command: service.command,
      port: service.port,
      section: service.section,
      framework: service.framework,
      needsAws: service.needsAws ? 1 : 0,
    };
  }

  return {
    list() {
      return listStmt.all().map(toService);
    },
    get(name) {
      return toService(getStmt.get(name));
    },
    create(input, workspaceRoot) {
      const service = normalizeService(input, workspaceRoot);
      if (getStmt.get(service.name)) {
        throw new ServiceError(409, `${service.name} is already registered.`);
      }
      insertStmt.run(persist(service));
      return this.get(service.name);
    },
    update(name, input, workspaceRoot) {
      if (!getStmt.get(name)) throw new ServiceError(404, 'That service is not registered.');
      const service = normalizeService(Object.assign({}, input, { name }), workspaceRoot);
      updateStmt.run(persist(service));
      return this.get(name);
    },
    remove(name) {
      const result = deleteStmt.run(name);
      if (result.changes === 0) throw new ServiceError(404, 'That service is not registered.');
    },
    close() {
      db.close();
    },
  };
}

module.exports = { openServiceStore };
