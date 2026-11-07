'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveFolder } = require('./serviceInput');
const { applyReadme } = require('./readmeLaunchpad');
const { buildRunSuggestions } = require('./runSuggestions');

const DEFAULT_PORTS = {
  vite: 5173,
  next: 3000,
  react: 3000,
  vue: 8080,
  nuxt: 3000,
  angular: 4200,
  'spring-boot': 8080,
  quarkus: 8080,
  micronaut: 8080,
  django: 8000,
  fastapi: 8000,
  flask: 5000,
  rails: 3000,
  laravel: 8000,
  phoenix: 4000,
  puma: 9292,
  flutter: 8080,
};

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return null;
  }
}

function readJson(file) {
  const text = readText(file);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function hasFile(folder, name) {
  return fs.existsSync(path.join(folder, name));
}

function findFile(folder, pattern) {
  let names = [];
  try {
    names = fs.readdirSync(folder);
  } catch (err) {
    return null;
  }
  return names.find((name) => pattern.test(name)) || null;
}

function hasDep(pkg, name) {
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  return Object.prototype.hasOwnProperty.call(deps, name);
}

function suggestName(folder) {
  return path.basename(folder).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63);
}

function asPort(value) {
  const port = Number(value);
  if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  return null;
}

function portFromText(text) {
  if (!text) return null;
  const patterns = [
    /--port(?:=|\s+)(\d{2,5})/,
    /--web-port(?:=|\s+)(\d{2,5})/,
    /(?:^|[\s"'])-p\s+(\d{2,5})/,
    /\bPORT=(?:["']?)(\d{2,5})/,
    /\bVITE_PORT=(?:["']?)(\d{2,5})/,
    /server\.port\s*=\s*(\d{2,5})/,
    /(?:localhost|127\.0\.0\.1):(\d{2,5})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const port = match && asPort(match[1]);
    if (port) return port;
  }
  return null;
}

function portFromSpringYaml(text) {
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^server:\s*$/.test(lines[index])) continue;
    for (let next = index + 1; next < Math.min(lines.length, index + 8); next += 1) {
      if (lines[next] && !/^\s/.test(lines[next])) break;
      const match = lines[next].match(/^\s+port:\s*(\d{2,5})\s*$/);
      const port = match && asPort(match[1]);
      if (port) return port;
    }
  }
  return null;
}

function portFromViteConfig(folder) {
  const names = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
  for (const name of names) {
    const text = readText(path.join(folder, name));
    const match = text && text.match(/port\s*:\s*(\d{2,5})/);
    const port = match && asPort(match[1]);
    if (port) return port;
  }
  return null;
}

function portFromEnv(folder) {
  const names = ['.env', '.env.local', '.env.development', '.env.development.local'];
  for (const name of names) {
    const port = portFromText(readText(path.join(folder, name)));
    if (port) return port;
  }
  return null;
}

function portFromSpring(folder) {
  const files = [
    'src/main/resources/application.properties',
    'src/main/resources/application-local.properties',
    'src/main/resources/application.yml',
    'src/main/resources/application.yaml',
    'src/main/resources/application-local.yml',
  ];
  for (const file of files) {
    const text = readText(path.join(folder, file));
    if (!text) continue;
    const port = portFromText(text) || portFromSpringYaml(text);
    if (port) return port;
  }
  return null;
}

function portFromLaunchSettings(folder) {
  const text = readText(path.join(folder, 'Properties', 'launchSettings.json'));
  if (!text) return null;
  const http = text.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/);
  if (http) return asPort(http[1]);
  const any = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/);
  return any && asPort(any[1]);
}

function portFromCompose(text) {
  if (!text) return null;
  const match = text.match(/ports:\s*\n\s*-\s*["']?(\d{2,5})\s*:/);
  return match && asPort(match[1]);
}

function portFromListen(text) {
  if (!text) return null;
  const match = text.match(/:(\d{2,5})\b/);
  return match && asPort(match[1]);
}

function makefileRun(text) {
  const match = text.match(/^run\s*:[^\n]*\n((?:(?:\t|[ ]{2,}).*(?:\n|$))*)/m);
  return match ? match[1] : '';
}

function nodeKind(pkg) {
  if (hasDep(pkg, 'next')) return { framework: 'next', section: 'frontend' };
  if (hasDep(pkg, 'nuxt') || hasDep(pkg, 'nuxt3')) return { framework: 'nuxt', section: 'frontend' };
  if (hasDep(pkg, 'vite')) return { framework: 'vite', section: 'frontend' };
  if (hasDep(pkg, '@vue/cli-service') || hasDep(pkg, 'vue')) return { framework: 'vue', section: 'frontend' };
  if (hasDep(pkg, 'react-scripts')) return { framework: 'react', section: 'frontend' };
  if (hasDep(pkg, '@angular/cli')) return { framework: 'angular', section: 'frontend' };
  if (hasDep(pkg, '@nestjs/core')) return { framework: 'nest', section: 'backend' };
  if (hasDep(pkg, 'express') || hasDep(pkg, 'fastify')) return { framework: 'node', section: 'backend' };
  return { framework: 'node', section: 'backend' };
}

function fromNode(folder) {
  const pkg = readJson(path.join(folder, 'package.json'));
  if (!pkg) return null;
  const kind = nodeKind(pkg);
  let command = null;
  let scriptText = '';
  if (pkg.scripts && pkg.scripts.dev) {
    command = 'npm run dev';
    scriptText = String(pkg.scripts.dev);
  } else if (pkg.scripts && pkg.scripts.start) {
    command = 'npm start';
    scriptText = String(pkg.scripts.start);
  }
  let { framework, section } = kind;
  if ((hasDep(pkg, 'express') || hasDep(pkg, 'fastify') || hasDep(pkg, '@nestjs/core')) && /node|nodemon|nest|tsx|ts-node/.test(scriptText)) {
    section = 'backend';
    framework = hasDep(pkg, '@nestjs/core') ? 'nest' : 'node';
  }
  return { command, framework, section, scriptText, port: null };
}

function fromDeno(folder) {
  const config = readJson(path.join(folder, 'deno.json')) || readJson(path.join(folder, 'deno.jsonc'));
  if (!config && !hasFile(folder, 'deno.json') && !hasFile(folder, 'deno.jsonc')) return null;
  const tasks = (config && config.tasks) || {};
  if (tasks.dev) return { command: 'deno task dev', framework: 'deno', section: 'backend', scriptText: String(tasks.dev), port: null };
  if (tasks.start) return { command: 'deno task start', framework: 'deno', section: 'backend', scriptText: String(tasks.start), port: null };
  return { command: null, framework: 'deno', section: 'backend', scriptText: '', port: null };
}

function fromGo(folder) {
  if (!hasFile(folder, 'go.mod')) return null;
  const main = readText(path.join(folder, 'main.go')) || '';
  return { command: 'go run .', framework: 'go', section: 'backend', scriptText: '', port: portFromListen(main) };
}

function fromRust(folder) {
  if (!hasFile(folder, 'Cargo.toml')) return null;
  return { command: 'cargo run', framework: 'rust', section: 'backend', scriptText: '', port: null };
}

function fromJava(folder) {
  const pom = readText(path.join(folder, 'pom.xml'));
  if (!pom) return null;
  if (/quarkus/i.test(pom)) return { command: 'mvn quarkus:dev', framework: 'quarkus', section: 'backend', scriptText: '', port: null };
  if (/micronaut/i.test(pom)) return { command: 'mvn mn:run', framework: 'micronaut', section: 'backend', scriptText: '', port: null };
  if (/spring-boot/i.test(pom)) return { command: 'mvn spring-boot:run', framework: 'spring-boot', section: 'backend', scriptText: '', port: null };
  return { command: 'mvn -q compile exec:java', framework: 'java', section: 'backend', scriptText: '', port: null };
}

function fromGradle(folder) {
  const script = readText(path.join(folder, 'build.gradle.kts')) || readText(path.join(folder, 'build.gradle'));
  if (!script) return null;
  const runner = hasFile(folder, 'gradlew') ? './gradlew' : 'gradle';
  if (/spring-boot|org\.springframework\.boot/.test(script)) {
    return { command: `${runner} bootRun`, framework: 'spring-boot', section: 'backend', scriptText: '', port: null };
  }
  return { command: `${runner} run`, framework: 'gradle', section: 'backend', scriptText: '', port: null };
}

function fromDotnet(folder) {
  if (!findFile(folder, /\.(csproj|fsproj|vbproj|sln)$/i)) return null;
  return { command: 'dotnet run', framework: 'dotnet', section: 'backend', scriptText: '', port: portFromLaunchSettings(folder) };
}

function fromElixir(folder) {
  const mix = readText(path.join(folder, 'mix.exs'));
  if (!mix) return null;
  if (/phoenix/i.test(mix)) return { command: 'mix phx.server', framework: 'phoenix', section: 'backend', scriptText: '', port: null };
  return { command: 'mix run --no-halt', framework: 'elixir', section: 'backend', scriptText: '', port: null };
}

function fromRuby(folder) {
  const gemfile = readText(path.join(folder, 'Gemfile'));
  if (!gemfile) return null;
  if (/rails/.test(gemfile) || hasFile(folder, path.join('bin', 'rails'))) {
    return { command: 'bin/rails server', framework: 'rails', section: 'backend', scriptText: '', port: null };
  }
  if (hasFile(folder, 'config.ru')) return { command: 'bundle exec puma', framework: 'puma', section: 'backend', scriptText: '', port: null };
  return { command: null, framework: 'ruby', section: 'backend', scriptText: '', port: null };
}

function fromPhp(folder) {
  if (hasFile(folder, 'artisan')) return { command: 'php artisan serve', framework: 'laravel', section: 'backend', scriptText: '', port: null };
  if (!hasFile(folder, 'composer.json') || hasFile(folder, 'package.json')) return null;
  const composer = readJson(path.join(folder, 'composer.json'));
  if (composer && composer.scripts && composer.scripts.start) {
    return { command: 'composer start', framework: 'php', section: 'backend', scriptText: String(composer.scripts.start), port: null };
  }
  if (hasFile(folder, path.join('public', 'index.php'))) {
    return { command: 'php -S localhost:8080 -t public', framework: 'php', section: 'backend', scriptText: 'localhost:8080', port: null };
  }
  return { command: null, framework: 'php', section: 'backend', scriptText: '', port: null };
}

function fromDart(folder) {
  const pubspec = readText(path.join(folder, 'pubspec.yaml'));
  if (!pubspec) return null;
  if (/sdk:\s*flutter/.test(pubspec)) {
    return { command: 'flutter run -d web-server --web-port 8080', framework: 'flutter', section: 'frontend', scriptText: '--web-port 8080', port: null };
  }
  return { command: 'dart run', framework: 'dart', section: 'backend', scriptText: '', port: null };
}

function fromSwift(folder) {
  if (!hasFile(folder, 'Package.swift')) return null;
  return { command: 'swift run', framework: 'swift', section: 'backend', scriptText: '', port: null };
}

function fromScala(folder) {
  if (!hasFile(folder, 'build.sbt')) return null;
  return { command: 'sbt run', framework: 'scala', section: 'backend', scriptText: '', port: null };
}

function fromClojure(folder) {
  if (hasFile(folder, 'project.clj')) return { command: 'lein run', framework: 'clojure', section: 'backend', scriptText: '', port: null };
  if (hasFile(folder, 'deps.edn')) return { command: 'clojure -M:run', framework: 'clojure', section: 'backend', scriptText: '', port: null };
  return null;
}

function fromHaskell(folder) {
  if (hasFile(folder, 'stack.yaml')) return { command: 'stack run', framework: 'haskell', section: 'backend', scriptText: '', port: null };
  if (findFile(folder, /\.cabal$/) || hasFile(folder, 'package.yaml')) {
    return { command: 'cabal run', framework: 'haskell', section: 'backend', scriptText: '', port: null };
  }
  return null;
}

function fromCrystal(folder) {
  if (!hasFile(folder, 'shard.yml')) return null;
  return { command: 'shards run', framework: 'crystal', section: 'backend', scriptText: '', port: null };
}

function fromNim(folder) {
  if (!findFile(folder, /\.nimble$/)) return null;
  return { command: 'nimble run', framework: 'nim', section: 'backend', scriptText: '', port: null };
}

function fromZig(folder) {
  if (!hasFile(folder, 'build.zig')) return null;
  return { command: 'zig build run', framework: 'zig', section: 'backend', scriptText: '', port: null };
}

function fromOcaml(folder) {
  if (!hasFile(folder, 'dune-project')) return null;
  return { command: 'dune build', framework: 'ocaml', section: 'backend', scriptText: '', port: null };
}

function fromR(folder) {
  const description = readText(path.join(folder, 'DESCRIPTION')) || '';
  const shiny = /shiny/i.test(description) || hasFile(folder, 'app.R') || hasFile(folder, 'server.R');
  if (!shiny && !description) return null;
  if (shiny) {
    return { command: 'Rscript -e "shiny::runApp(port=3838)"', framework: 'r', section: 'frontend', scriptText: '', port: 3838 };
  }
  return { command: null, framework: 'r', section: 'backend', scriptText: '', port: null };
}

function fromPerl(folder) {
  if (hasFile(folder, 'app.psgi')) return { command: 'plackup', framework: 'perl', section: 'backend', scriptText: '', port: 5000 };
  if (hasFile(folder, 'cpanfile') || hasFile(folder, 'Makefile.PL')) {
    return { command: null, framework: 'perl', section: 'backend', scriptText: '', port: null };
  }
  return null;
}

function fromCmake(folder) {
  if (!hasFile(folder, 'CMakeLists.txt')) return null;
  return { command: 'cmake -S . -B build && cmake --build build', framework: 'cmake', section: 'backend', scriptText: '', port: null };
}

function fromCompose(folder) {
  const name = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find((file) => hasFile(folder, file));
  if (!name) return null;
  const text = readText(path.join(folder, name));
  return { command: 'docker compose up', framework: 'docker', section: 'backend', scriptText: '', port: portFromCompose(text) };
}

function fromDjango(folder) {
  if (!hasFile(folder, 'manage.py')) return null;
  return { command: 'python manage.py runserver', framework: 'django', section: 'backend', scriptText: '', port: null };
}

function pythonEntrypoint(folder, assignPattern) {
  const files = ['app/main.py', 'main.py', 'app.py', 'src/main.py', 'src/app.py', 'server.py'];
  for (const rel of files) {
    const text = readText(path.join(folder, rel));
    if (!text) continue;
    const match = text.match(assignPattern);
    if (!match) continue;
    return {
      entrypoint: `${rel.replace(/\.py$/, '').split('/').join('.')}:${match[1]}`,
      scriptText: text,
    };
  }
  return null;
}

function fromPython(folder) {
  const pythonText = `${readText(path.join(folder, 'requirements.txt')) || ''}\n${readText(path.join(folder, 'pyproject.toml')) || ''}\n${readText(path.join(folder, 'Pipfile')) || ''}`;
  const fastapiApp = pythonEntrypoint(folder, /^(\w+)\s*=\s*FastAPI\s*\(/m);
  const flaskApp = pythonEntrypoint(folder, /^(\w+)\s*=\s*Flask\s*\(/m);
  if (!pythonText.trim() && !fastapiApp && !flaskApp && !hasFile(folder, 'app.py')) return null;
  if (/fastapi/i.test(pythonText) || fastapiApp) {
    const app = fastapiApp || { entrypoint: 'main:app', scriptText: '' };
    return {
      command: `python -m uvicorn ${app.entrypoint} --reload`,
      framework: 'fastapi',
      section: 'backend',
      scriptText: app.scriptText,
      port: null,
      entrypoint: app.entrypoint,
    };
  }
  if (/flask/i.test(pythonText) || flaskApp) {
    const app = flaskApp || { entrypoint: 'app:app', scriptText: '' };
    return {
      command: `flask --app ${app.entrypoint.split(':')[0]} run`,
      framework: 'flask',
      section: 'backend',
      scriptText: app.scriptText,
      port: null,
      entrypoint: app.entrypoint,
    };
  }
  if (hasFile(folder, 'app.py')) return { command: 'python app.py', framework: 'python', section: 'backend', scriptText: '', port: null, entrypoint: 'app.py' };
  return { command: null, framework: 'python', section: 'backend', scriptText: '', port: null };
}

function fromMake(folder) {
  const makefile = readText(path.join(folder, 'Makefile'));
  if (!makefile || !/^run\s*:/m.test(makefile)) return null;
  return { command: 'make run', framework: 'make', section: 'backend', scriptText: makefileRun(makefile), port: null };
}

function fromStatic(folder) {
  if (!hasFile(folder, 'index.html')) return null;
  return { command: 'python3 -m http.server 8080', framework: 'static', section: 'frontend', scriptText: '', port: 8080 };
}

const DETECTORS = [
  fromGo,
  fromRust,
  fromJava,
  fromGradle,
  fromDotnet,
  fromElixir,
  fromRuby,
  fromPhp,
  fromDjango,
  fromDart,
  fromSwift,
  fromScala,
  fromClojure,
  fromHaskell,
  fromCrystal,
  fromNim,
  fromZig,
  fromOcaml,
  fromR,
  fromNode,
  fromDeno,
  fromPerl,
  fromCmake,
  fromCompose,
  fromPython,
  fromMake,
  fromStatic,
];

function detectFolder(folder) {
  const found = DETECTORS.map((detect) => detect(folder)).find(Boolean) || {
    command: null,
    framework: null,
    section: 'backend',
    scriptText: '',
    port: null,
  };
  const makefile = readText(path.join(folder, 'Makefile'));
  const port = portFromText(found.scriptText)
    || portFromText(makefile && makefileRun(makefile))
    || portFromViteConfig(folder)
    || portFromEnv(folder)
    || portFromSpring(folder)
    || portFromLaunchSettings(folder)
    || found.port
    || (found.command && found.framework && DEFAULT_PORTS[found.framework])
    || null;

  const suggested = buildRunSuggestions({
    framework: found.framework,
    command: found.command,
    port,
    entrypoint: found.entrypoint || null,
  });
  const command = found.framework === 'fastapi' && suggested.suggestions[0]
    ? suggested.suggestions[0].command
    : found.command;

  return {
    path: folder,
    name: suggestName(folder),
    command,
    framework: found.framework,
    section: found.section,
    port,
    suggestions: suggested.suggestions,
    hint: suggested.hint,
  };
}

function detectService(rawPath, workspaceRoot) {
  const folder = resolveFolder(rawPath, workspaceRoot);
  return applyReadme(folder, detectFolder(folder), workspaceRoot, detectFolder);
}

module.exports = { detectService };
