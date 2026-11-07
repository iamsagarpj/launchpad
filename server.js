'use strict';

const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const tilt = require('./lib/tilt');
const remoteLogs = require('./lib/remoteLogs');
const proxy = require('./lib/proxy');
const { openServiceStore } = require('./lib/serviceStore');
const { detectService } = require('./lib/detectService');
const { chooseFolder } = require('./lib/chooseFolder');
const { publishUserServices, triggerTiltfileReload } = require('./lib/publishUserServices');
const { preparePythonService } = require('./lib/pythonEnv');

const PORT = 4040;
const workspaceRoot = path.join(__dirname, '..');
const serviceStore = openServiceStore(path.join(__dirname, 'data', 'launchpad.db'));
const userTiltfilePath = path.join(__dirname, 'data', 'user-services.tiltfile');
const EXCLUDED_RESOURCES = ['(Tiltfile)', 'dashboard'];
// Must match Tiltfile's AWS_PROFILE and the resource name of its aws-creds local_resource.
const AWS_PROFILE = 'default';
const AWS_LOGIN_RESOURCE = 'aws-creds';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '8mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/resources', async (req, res) => {
  try {
    const resources = await tilt.getResources(EXCLUDED_RESOURCES);
    res.json({ resources });
  } catch (err) {
    res.status(503).json({ error: 'Tilt is not reachable. Start it with `tilt up`.' });
  }
});

app.post('/api/toggle/:name', async (req, res) => {
  const result = await tilt.toggleResource(req.params.name);
  if (!result.ok) {
    res.status(500).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/trigger/:name', async (req, res) => {
  const result = await tilt.triggerResource(req.params.name);
  if (!result.ok) {
    res.status(500).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/start-all', async (req, res) => {
  try {
    const resources = await tilt.getResources(EXCLUDED_RESOURCES);
    const names = resources.filter((r) => r.section === 'services').map((r) => r.name);
    const result = await tilt.enableAll(names);
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: 'Tilt is not reachable.' });
  }
});

app.post('/api/stop-all', async (req, res) => {
  try {
    const resources = await tilt.getResources(EXCLUDED_RESOURCES);
    const names = resources.filter((r) => r.section === 'services').map((r) => r.name);
    const result = await tilt.disableAll(names);
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: 'Tilt is not reachable.' });
  }
});

// API Client proxy - see lib/proxy.js for the SSRF-via-CSRF rationale.
// Origin-checked so only this app's own UI can use it, not any other page
// the developer happens to have open in another tab.
app.post('/api/proxy', async (req, res) => {
  if (!proxy.isAllowedOrigin(req.headers.origin, PORT)) {
    res.status(403).json({ ok: false, error: 'Forbidden: this proxy only accepts requests from the Launchpad UI itself.' });
    return;
  }
  const result = await proxy.performProxyRequest(req.body || {});
  res.json(result);
});

function sendServiceError(res, err) {
  const status = err && err.status ? err.status : 500;
  const message = status === 500 ? 'Failed to save the service.' : err.message;
  res.status(status).json({ error: message });
}

function publishRegisteredServices() {
  publishUserServices(serviceStore.list(), userTiltfilePath, triggerTiltfileReload);
}

app.get('/api/services', (req, res) => {
  res.json({ services: serviceStore.list() });
});

app.post('/api/services/detect', (req, res) => {
  try {
    res.json(detectService((req.body || {}).path, workspaceRoot));
  } catch (err) {
    sendServiceError(res, err);
  }
});

app.post('/api/services/pick', async (req, res) => {
  try {
    const folder = await chooseFolder();
    res.json(detectService(folder, workspaceRoot));
  } catch (err) {
    if (err && err.cancelled) {
      res.json({ cancelled: true });
      return;
    }
    sendServiceError(res, err);
  }
});

app.post('/api/services', async (req, res) => {
  try {
    const prepared = await preparePythonService(req.body || {}, workspaceRoot);
    const service = serviceStore.create(prepared.service, workspaceRoot);
    publishRegisteredServices();
    res.status(201).json({ service, pythonEnv: prepared.pythonEnv });
  } catch (err) {
    sendServiceError(res, err);
  }
});

app.put('/api/services/:name', async (req, res) => {
  try {
    const prepared = await preparePythonService(Object.assign({}, req.body, { name: req.params.name }), workspaceRoot);
    const service = serviceStore.update(req.params.name, prepared.service, workspaceRoot);
    publishRegisteredServices();
    res.json({ service, pythonEnv: prepared.pythonEnv });
  } catch (err) {
    sendServiceError(res, err);
  }
});

app.delete('/api/services/:name', (req, res) => {
  try {
    serviceStore.remove(req.params.name);
    publishRegisteredServices();
    res.json({ ok: true });
  } catch (err) {
    sendServiceError(res, err);
  }
});

app.post('/api/aws-login', async (req, res) => {
  // Fire-and-forget: `aws sso login` blocks on the browser flow, which can take as
  // long as the user takes. The frontend already polls /api/resources every 2s and
  // will see aws-creds flip healthy on its own once loginAws's own re-check fires.
  tilt.loginAws(AWS_PROFILE, AWS_LOGIN_RESOURCE);
  res.json({ ok: true, started: true });
});

app.get('/api/remote-logs/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const environments = Object.entries(remoteLogs.ENVIRONMENTS).map(([id, entry]) => ({ id, label: entry.label }));
  const services = Object.keys(remoteLogs.SERVICE_LOG_GROUPS).map((id) => ({ id, label: id }));
  res.json({ region: remoteLogs.REGION, environments, services });
});

app.get('/api/remote-logs/:env/:service', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await remoteLogs.fetchRemoteLogs(req.params.env, req.params.service, req.query.minutes);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ events: result.events, truncated: result.truncated });
});

// SPA fallback: any GET request that didn't match a static file or an API
// route above (e.g. a direct navigation or refresh on /json-viewer) gets
// index.html, so React Router can take over client-side routing. Must stay
// registered AFTER every route and after express.static above - Express
// matches in registration order, so placing this any earlier would swallow
// /health, /api/*, and real static assets before they're ever reached.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
// Note: `ws`'s built-in `path` option does an exact match against req.url
// (see node_modules/ws/lib/websocket-server.js shouldHandle()), so it cannot
// match a dynamic segment like `/ws/logs/data-service`. Use `verifyClient`
// to accept anything under the `/ws/logs/` prefix instead; the exact
// resource name is still parsed out of the URL in the `connection` handler.
const wss = new WebSocketServer({
  server,
  verifyClient: ({ req }) => new URL(req.url, 'http://localhost').pathname.startsWith('/ws/logs/'),
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname.replace('/ws/logs/', '');
  if (!name) {
    ws.close(1008, 'missing resource name');
    return;
  }
  const stopStreaming = tilt.streamLogs(name, (line) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(line);
    }
  });
  ws.on('close', () => {
    stopStreaming();
  });
  ws.on('error', () => {
    stopStreaming();
  });
});

// `tilt up` normally launches this file itself (as the dashboard resource's
// serve_cmd), so by the time that happens Tilt's own API is already up and this
// branch just starts the server as usual. But someone running `node server.js`
// directly, before `tilt up`, used to leave every *other* service (data-service,
// ui, etc.) never started - and worse, left a process squatting on port 4040 that
// Tilt's own managed instance could never bind to (see the EADDRINUSE incident this
// was built to prevent). So: if Tilt isn't up yet, hand off to `tilt up` instead of
// binding the port ourselves - inherited stdio/signals, not detached, so it dies
// with this process rather than becoming another orphan.
if (require.main === module) {
  tilt.isRunning().then((running) => {
    if (running) {
      server.listen(PORT, () => {
        console.log(`Launchpad listening on http://localhost:${PORT}`);
      });
      return;
    }
    console.log('Tilt is not running yet - starting `tilt up` so every service comes up together...');
    const repoRoot = path.join(__dirname, '..');
    const tiltUp = spawn('tilt', ['up'], { cwd: repoRoot, stdio: 'inherit' });
    tiltUp.on('exit', (code) => process.exit(code == null ? 0 : code));
    process.on('SIGINT', () => tiltUp.kill('SIGINT'));
    process.on('SIGTERM', () => tiltUp.kill('SIGTERM'));
  });
}

module.exports = { app, server, EXCLUDED_RESOURCES };
