'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detectService } = require('../lib/detectService');
const { renderUserTiltfile } = require('../lib/renderUserTiltfile');
const { openServiceStore } = require('../lib/serviceStore');
const { publishUserServices } = require('../lib/publishUserServices');
const { ServiceError } = require('../lib/serviceInput');
const { chooseFolder } = require('../lib/chooseFolder');
const { EventEmitter } = require('node:events');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-services-'));
}

test('detectService reads an npm dev script and treats Vite as frontend', () => {
  const root = tempDir();
  const app = path.join(root, 'acme web');
  fs.mkdirSync(app);
  fs.writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '5.0.0' } })
  );

  const found = detectService(app, root);
  assert.equal(found.command, 'npm run dev');
  assert.equal(found.framework, 'vite');
  assert.equal(found.section, 'frontend');
  assert.equal(found.name, 'acme-web');
  assert.equal(found.port, 5173);
});

test('detectService prefers an explicit port over the framework default', () => {
  const root = tempDir();
  const app = path.join(root, 'web');
  fs.mkdirSync(app);
  fs.writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({ scripts: { dev: 'vite --port 8085' }, devDependencies: { vite: '5.0.0' } })
  );
  fs.writeFileSync(path.join(app, 'vite.config.js'), 'export default { server: { port: 5173 } }\n');

  const found = detectService(app, root);
  assert.equal(found.port, 8085);
  assert.equal(found.section, 'frontend');
});

test('detectService reads a Spring Boot port from application.properties', () => {
  const root = tempDir();
  const app = path.join(root, 'data-service');
  fs.mkdirSync(path.join(app, 'src', 'main', 'resources'), { recursive: true });
  fs.writeFileSync(path.join(app, 'pom.xml'), '<project><artifact>spring-boot</artifact></project>');
  fs.writeFileSync(path.join(app, 'src', 'main', 'resources', 'application.properties'), 'server.port=8080\n');

  const found = detectService(app, root);
  assert.equal(found.command, 'mvn spring-boot:run');
  assert.equal(found.framework, 'spring-boot');
  assert.equal(found.section, 'backend');
  assert.equal(found.port, 8080);
});

test('detectService reads a Make run target when there is no package.json', () => {
  const root = tempDir();
  const app = path.join(root, 'worker');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'Makefile'), 'run:\n\tpython app.py\n');

  const found = detectService('worker', root);
  assert.equal(found.command, 'make run');
  assert.equal(found.path, fs.realpathSync(app));
});

test('detectService leaves the port empty for a Node server that does not name one', () => {
  const root = tempDir();
  const app = path.join(root, 'api');
  fs.mkdirSync(app);
  fs.writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '4.0.0' } })
  );

  const found = detectService(app, root);
  assert.equal(found.command, 'npm start');
  assert.equal(found.section, 'backend');
  assert.equal(found.port, null);
});

test('detectService recognizes common language projects', () => {
  const cases = [
    {
      files: { 'go.mod': 'module example.com/api\n', 'main.go': 'ListenAndServe(":9090", nil)\n' },
      command: 'go run .',
      framework: 'go',
      section: 'backend',
      port: 9090,
    },
    {
      files: { 'Cargo.toml': '[package]\nname = "api"\n' },
      command: 'cargo run',
      framework: 'rust',
      section: 'backend',
      port: null,
    },
    {
      files: { 'api.csproj': '<Project />', 'Properties/launchSettings.json': '{ "profiles": { "api": { "applicationUrl": "http://localhost:5000" } } }' },
      command: 'dotnet run',
      framework: 'dotnet',
      section: 'backend',
      port: 5000,
    },
    {
      files: { Gemfile: "gem 'rails'\n" },
      command: 'bin/rails server',
      framework: 'rails',
      section: 'backend',
      port: 3000,
    },
    {
      files: { 'composer.json': '{}', artisan: '' },
      command: 'php artisan serve',
      framework: 'laravel',
      section: 'backend',
      port: 8000,
    },
    {
      files: { 'pubspec.yaml': 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n' },
      command: 'flutter run -d web-server --web-port 8080',
      framework: 'flutter',
      section: 'frontend',
      port: 8080,
    },
    {
      files: { 'pom.xml': '<project><dependency>quarkus</dependency></project>' },
      command: 'mvn quarkus:dev',
      framework: 'quarkus',
      section: 'backend',
      port: 8080,
    },
    {
      files: { 'mix.exs': 'def project, do: [app: :api, deps: [:phoenix]]\n' },
      command: 'mix phx.server',
      framework: 'phoenix',
      section: 'backend',
      port: 4000,
    },
  ];

  cases.forEach((sample) => {
    const root = tempDir();
    const app = path.join(root, 'service');
    fs.mkdirSync(app);
    Object.entries(sample.files).forEach(([name, contents]) => {
      const file = path.join(app, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    });
    const found = detectService(app, root);
    assert.equal(found.command, sample.command, nameOf(sample));
    assert.equal(found.framework, sample.framework, nameOf(sample));
    assert.equal(found.section, sample.section, nameOf(sample));
    assert.equal(found.port, sample.port, nameOf(sample));
  });

  function nameOf(sample) {
    return sample.framework;
  }
});

test('detectService reports no command for an empty folder', () => {
  const root = tempDir();
  const app = path.join(root, 'notes');
  fs.mkdirSync(app);
  const found = detectService(app, root);
  assert.equal(found.command, null);
  assert.equal(found.fromReadme, undefined);
});

test('detectService suggests python -m uvicorn and uvicorn for a FastAPI app', () => {
  const root = tempDir();
  const app = path.join(root, 'backend');
  fs.mkdirSync(path.join(app, 'app'), { recursive: true });
  fs.writeFileSync(path.join(app, 'requirements.txt'), 'fastapi\nuvicorn\n');
  fs.writeFileSync(
    path.join(app, 'app', 'main.py'),
    'from fastapi import FastAPI\napp = FastAPI()\n# uvicorn app.main:app --reload --port 8010\n'
  );

  const found = detectService(app, root);
  assert.equal(found.framework, 'fastapi');
  assert.equal(found.port, 8010);
  assert.equal(found.command, 'python -m uvicorn app.main:app --reload --port 8010');
  assert.deepEqual(
    found.suggestions.map((item) => item.command),
    [
      'python -m uvicorn app.main:app --reload --port 8010',
      'python3 -m uvicorn app.main:app --reload --port 8010',
      'uvicorn app.main:app --reload --port 8010',
    ]
  );
});

test('detectService keeps the detected command and adds the other starter', () => {
  const root = tempDir();
  const app = path.join(root, 'worker');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'go.mod'), 'module example.com/worker\n\ngo 1.22\n');

  const found = detectService(app, root);
  assert.equal(found.command, 'go run .');
  assert.deepEqual(
    found.suggestions.map((item) => item.label),
    ['go run .', 'go run ./...']
  );
});

test('detectService lets a launchpad block in README.md override detection', () => {
  const root = tempDir();
  const app = path.join(root, 'shop');
  fs.mkdirSync(app);
  fs.writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '5.0.0' } })
  );
  fs.writeFileSync(
    path.join(app, 'README.md'),
    [
      '# Shop',
      '',
      '```launchpad',
      'name: shop-api',
      'command: npm start',
      'port: 4010',
      'section: backend',
      'stack: express',
      'needsAws: true',
      '```',
      '',
    ].join('\n')
  );

  const found = detectService(app, root);
  assert.equal(found.fromReadme, true);
  assert.equal(found.name, 'shop-api');
  assert.equal(found.command, 'npm start');
  assert.equal(found.port, 4010);
  assert.equal(found.section, 'backend');
  assert.equal(found.framework, 'express');
  assert.equal(found.needsAws, true);
  assert.equal(found.services, undefined);
});

test('detectService reads every service listed in the README block', () => {
  const root = tempDir();
  const app = path.join(root, 'suite');
  const api = path.join(app, 'api');
  const web = path.join(app, 'web');
  fs.mkdirSync(api, { recursive: true });
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(api, 'go.mod'), 'module example.com/api\n\ngo 1.22\n');
  fs.writeFileSync(
    path.join(app, 'Readme.md'),
    [
      '```launchpad',
      'name: api',
      'path: api',
      'port: 8088',
      '',
      'name: web',
      'path: web',
      'command: npm run dev',
      'port: 5173',
      'section: frontend',
      'stack: vite',
      '```',
      '',
    ].join('\n')
  );

  const found = detectService(app, root);
  assert.equal(found.services.length, 2);
  assert.equal(found.services[0].name, 'api');
  assert.equal(found.services[0].command, 'go run .');
  assert.equal(found.services[0].port, 8088);
  assert.equal(found.services[0].path, fs.realpathSync(api));
  assert.equal(found.services[1].name, 'web');
  assert.equal(found.services[1].command, 'npm run dev');
  assert.equal(found.services[1].section, 'frontend');
  assert.equal(found.services[1].framework, 'vite');
});

test('renderUserTiltfile leaves AWS out unless the service asks for it', () => {
  const text = renderUserTiltfile([
    {
      name: 'api',
      path: '/Users/ada/code/api',
      command: 'npm run dev',
      port: 3000,
      section: 'backend',
      framework: 'node',
      needsAws: false,
    },
  ]);
  assert.match(text, /serve_dir="\/Users\/ada\/code\/api"/);
  assert.match(text, /tcp_socket_action\(port=3000\)/);
  assert.match(text, /labels=\["backend", "fw-node"\]/);
  assert.equal(text.includes('aws-creds'), false);
});

test('renderUserTiltfile adds the aws-creds dependency only when requested', () => {
  const text = renderUserTiltfile([
    {
      name: 'billing',
      path: "/Users/ada/code/it's-billing",
      command: 'make run',
      port: null,
      section: 'backend',
      framework: null,
      needsAws: true,
    },
  ]);
  assert.match(text, /resource_deps=\['aws-creds'\]/);
  assert.match(text, /serve_dir="\/Users\/ada\/code\/it's-billing"/);
  assert.equal(text.includes('tcp_socket_action'), false);
});

test('sqlite store saves a repo path and rejects a Tiltfile name', () => {
  const root = tempDir();
  const app = path.join(root, 'api');
  fs.mkdirSync(app);
  const store = openServiceStore(path.join(root, 'data', 'launchpad.db'));
  try {
    const saved = store.create(
      { name: 'api', path: app, command: 'npm run dev', section: 'backend', port: 3000, needsAws: false },
      root
    );
    assert.equal(saved.path, fs.realpathSync(app));
    assert.equal(saved.needsAws, false);
    assert.equal(store.list().length, 1);
    assert.throws(
      () => store.create({ name: 'dashboard', path: app, command: 'make run', section: 'backend' }, root),
      (err) => err instanceof ServiceError && err.status === 409
    );
  } finally {
    store.close();
  }
});

function fakePicker(stdout, code, stderr) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    process.nextTick(() => {
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('exit', code);
    });
    return child;
  };
}

test('chooseFolder returns the macOS folder without a trailing slash', async () => {
  const folder = await chooseFolder({ spawnFn: fakePicker('/Users/ada/code/api/\n', 0), platform: 'darwin' });
  assert.equal(folder, '/Users/ada/code/api');
});

test('chooseFolder reports a cancelled picker instead of a failure', async () => {
  await assert.rejects(
    () => chooseFolder({ spawnFn: fakePicker('', 1, 'User canceled.\n'), platform: 'darwin' }),
    (err) => err instanceof ServiceError && err.cancelled === true
  );
});

test('publishUserServices writes the tilt snippet once and reloads only when it changes', () => {
  const root = tempDir();
  const tiltfile = path.join(root, 'user-services.tiltfile');
  const services = [
    { name: 'api', path: '/tmp/api', command: 'npm run dev', port: null, section: 'backend', framework: null, needsAws: false },
  ];
  let triggers = 0;
  const first = publishUserServices(services, tiltfile, () => {
    triggers += 1;
  });
  const second = publishUserServices(services, tiltfile, () => {
    triggers += 1;
  });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(triggers, 1);
  assert.match(fs.readFileSync(tiltfile, 'utf8'), /local_resource/);
});
