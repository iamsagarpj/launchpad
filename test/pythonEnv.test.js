'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { commandWithPython, detectPythonVersion, preparePythonService } = require('../lib/pythonEnv');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-python-'));
}

test('detectPythonVersion reads a working virtualenv next to the service', () => {
  const root = tempDir();
  const app = path.join(root, 'backend');
  const python = path.join(root, 'python3.12');
  fs.mkdirSync(path.join(root, 'env'));
  fs.mkdirSync(app);
  fs.writeFileSync(python, '');
  fs.writeFileSync(path.join(root, 'env', 'pyvenv.cfg'), `version = 3.12.3\nexecutable = ${python}\n`);

  assert.equal(detectPythonVersion(app), '3.12.3');
});

test('detectPythonVersion ignores a virtualenv whose interpreter is gone', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'partnerenv'));
  fs.writeFileSync(
    path.join(root, 'partnerenv', 'pyvenv.cfg'),
    'version = 3.11.0\nexecutable = /missing/partnerenv/bin/python3\n'
  );
  fs.writeFileSync(path.join(root, '.python-version'), '3.12\n');

  assert.equal(detectPythonVersion(root), '3.12');
});

test('commandWithPython runs uvicorn through the service virtualenv', () => {
  const bin = '/tmp/app/.venv-backend/bin/python';
  assert.equal(
    commandWithPython(bin, 'uvicorn app.main:app --reload --port 8010'),
    `${bin} -m uvicorn app.main:app --reload --port 8010`
  );
  assert.equal(
    commandWithPython(bin, 'python -m uvicorn app.main:app --reload'),
    `${bin} -m uvicorn app.main:app --reload`
  );
});

test('preparePythonService installs the requested Python with uv when it is missing', async () => {
  const root = tempDir();
  const app = path.join(root, 'backend');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, '.python-version'), '3.11.9\n');
  fs.writeFileSync(path.join(app, 'requirements.txt'), 'fastapi\n');
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === 'python' && args[1] === 'find') {
      const error = new Error('not found');
      error.status = 500;
      throw error;
    }
    return '';
  };

  const prepared = await preparePythonService(
    {
      name: 'backend',
      path: app,
      command: 'uvicorn app.main:app --reload --port 8010',
      section: 'backend',
      framework: 'fastapi',
      port: 8010,
    },
    root,
    { run }
  );

  assert.deepEqual(calls.map((call) => call[1][0]), ['python', 'python', 'venv', 'pip']);
  assert.deepEqual(calls[1][1], ['python', 'install', '3.11']);
  assert.equal(
    prepared.service.command,
    `${path.join(fs.realpathSync(app), '.venv-backend', 'bin', 'python')} -m uvicorn app.main:app --reload --port 8010`
  );
  assert.equal(prepared.pythonEnv.version, '3.11.9');
  assert.equal(prepared.pythonEnv.requirements, true);
});
