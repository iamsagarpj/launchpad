'use strict';

const { spawn } = require('node:child_process');
const { ServiceError } = require('./serviceInput');

function startPicker(spawnFn, platform) {
  if (platform === 'darwin') {
    return spawnFn('osascript', ['-e', 'POSIX path of (choose folder with prompt "Select the service folder")']);
  }
  if (platform === 'linux') {
    return spawnFn('zenity', ['--file-selection', '--directory', '--title=Select the service folder']);
  }
  if (platform === 'win32') {
    return spawnFn('powershell', [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "Select the service folder"; if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }; Write-Output $dialog.SelectedPath',
    ]);
  }
  return null;
}

function chooseFolder({ spawnFn = spawn, platform = process.platform } = {}) {
  const child = startPicker(spawnFn, platform);
  if (!child) {
    return Promise.reject(new ServiceError(400, 'Folder picker is not available on this system.'));
  }
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new ServiceError(400, 'Folder selection timed out.'));
    }, 3 * 60 * 1000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new ServiceError(500, 'Could not open the folder picker.'));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const folder = stdout.trim().replace(/[\\/]+$/, '');
        if (!folder) {
          reject(new ServiceError(400, 'No folder was selected.'));
          return;
        }
        resolve(folder);
        return;
      }
      if (code === 1 || /cancel/i.test(stderr)) {
        const cancelled = new ServiceError(400, 'Folder selection was cancelled.');
        cancelled.cancelled = true;
        reject(cancelled);
        return;
      }
      reject(new ServiceError(500, 'Could not open the folder picker.'));
    });
  });
}

module.exports = { chooseFolder };
