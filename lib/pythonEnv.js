'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ServiceError, normalizeService } = require('./serviceInput');

const PYTHON_FRAMEWORKS = new Set(['fastapi', 'flask', 'django', 'python']);

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return null;
  }
}

function isPythonService(service) {
  if (PYTHON_FRAMEWORKS.has(service && service.framework)) return true;
  return /\b(uvicorn|flask|gunicorn|manage\.py)\b/.test((service && service.command) || '');
}

function versionFromText(text) {
  const match = String(text || '').match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

function versionFromPythonVersionFile(folder) {
  const text = readText(path.join(folder, '.python-version'));
  if (!text) return null;
  const line = text.split(/\r?\n/).map((item) => item.trim()).find((item) => item && !item.startsWith('#'));
  return versionFromText(line);
}

function versionFromPyproject(folder) {
  const text = readText(path.join(folder, 'pyproject.toml'));
  const match = text && text.match(/requires-python\s*=\s*["'][^0-9]*(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

function versionFromVenv(folder) {
  for (const name of ['env', '.venv', 'venv']) {
    const config = readText(path.join(folder, name, 'pyvenv.cfg'));
    if (!config) continue;
    const version = (config.match(/^version\s*=\s*(\d+\.\d+(?:\.\d+)?)/m) || [])[1];
    const executable = (config.match(/^executable\s*=\s*(.+)$/m) || [])[1];
    const bin = executable && executable.trim();
    if (!version) continue;
    if (bin && !fs.existsSync(bin)) continue;
    return version;
  }
  return null;
}

function detectPythonVersion(folder) {
  const dirs = [folder, path.dirname(folder)];
  for (const dir of dirs) {
    const version = versionFromPythonVersionFile(dir) || versionFromPyproject(dir);
    if (version) return version;
  }
  for (const dir of dirs) {
    const version = versionFromVenv(dir);
    if (version) return version;
  }
  return null;
}

function pythonBin(venvDir) {
  return path.join(venvDir, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

function commandWithPython(bin, command) {
  const trimmed = String(command || '').trim();
  if (!trimmed) return `${bin} -m uvicorn`;
  if (trimmed.startsWith(bin)) return trimmed;
  const wrapped = trimmed.match(/^(?:python3(?:\.\d+)?|python)\s+([\s\S]+)$/);
  if (wrapped) return `${bin} ${wrapped[1]}`;
  if (/^(uvicorn|flask|gunicorn)\b/.test(trimmed)) return `${bin} -m ${trimmed}`;
  return `${bin} ${trimmed}`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.VIRTUAL_ENV;
    delete env.PYTHONHOME;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new ServiceError(500, `${command} took too long.`));
    }, options.timeout || 300000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `${command} failed`;
        reject(new ServiceError(500, detail.slice(0, 500)));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function createVenv(venvDir, version, run) {
  const minor = version.split('.').slice(0, 2).join('.');
  let installed = false;
  try {
    await run('uv', ['python', 'find', minor]);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new ServiceError(500, 'uv is not installed, so Launchpad cannot create a Python environment for this service.');
    }
    await run('uv', ['python', 'install', minor]);
    installed = true;
  }
  const args = ['venv', '--python', minor, venvDir];
  if (fs.existsSync(path.join(venvDir, 'pyvenv.cfg'))) args.push('--allow-existing');
  await run('uv', args);
  return installed;
}

async function installRequirements(venvDir, requirements, run) {
  const bin = pythonBin(venvDir);
  try {
    await run('uv', ['pip', 'install', '-r', requirements, '--python', bin]);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      await run(bin, ['-m', 'pip', 'install', '-r', requirements]);
      return;
    }
    throw err;
  }
}

async function preparePythonService(input, workspaceRoot, options = {}) {
  const run = options.run || runCommand;
  const service = normalizeService(input, workspaceRoot);
  if (!isPythonService(service)) return { service, pythonEnv: null };

  const version = detectPythonVersion(service.path) || '3.12';
  const venvDir = path.join(service.path, `.venv-${service.name}`);
  await createVenv(venvDir, version, run);
  const requirements = path.join(service.path, 'requirements.txt');
  const hasRequirements = fs.existsSync(requirements);
  if (hasRequirements) await installRequirements(venvDir, requirements, run);

  const bin = pythonBin(venvDir);
  return {
    service: { ...service, command: commandWithPython(bin, service.command) },
    pythonEnv: {
      version,
      venvDir,
      requirements: hasRequirements,
    },
  };
}

module.exports = {
  commandWithPython,
  detectPythonVersion,
  isPythonService,
  preparePythonService,
};
