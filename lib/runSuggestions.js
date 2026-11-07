'use strict';

const HINTS = {
  fastapi: 'FastAPI. python -m uvicorn uses the Python on your PATH. uvicorn runs the uvicorn script, which breaks when that script points at an old virtualenv.',
  flask: 'Flask. python -m flask uses the Python on your PATH. flask runs the flask script.',
  django: 'Django. python and python3 both call manage.py runserver.',
  python: 'Python. python and python3 run the same file with whichever interpreter is on your PATH.',
  vite: 'Vite. npm run dev uses the script in package.json. npx vite starts Vite directly.',
  next: 'Next.js. npm run dev uses package.json. npx next dev starts Next directly.',
  react: 'Create React App. npm run dev uses package.json. npx react-scripts start starts it directly.',
  vue: 'Vue. npm run dev uses package.json. npx vue-cli-service serve starts the CLI directly.',
  nuxt: 'Nuxt. npm run dev uses package.json. npx nuxt dev starts Nuxt directly.',
  angular: 'Angular. npm run dev uses package.json. npx ng serve starts the CLI directly.',
  nest: 'Nest. npm run dev uses package.json. npx nest start --watch starts the CLI directly.',
  node: 'Node. npm run dev uses package.json. node runs the server file directly.',
  deno: 'Deno. deno task runs the task in deno.json. deno run starts the file directly.',
  go: 'Go. go run . runs this module. go run ./... runs every main package under it.',
  rust: 'Rust. cargo run builds and starts the binary.',
  'spring-boot': 'Spring Boot. Maven and Gradle both have a run task. Use the wrapper (mvnw or gradlew) when the repo has one.',
  quarkus: 'Quarkus. mvn quarkus:dev starts dev mode. ./mvnw is the same task through the repo wrapper.',
  micronaut: 'Micronaut. mvn mn:run starts it. ./mvnw is the same task through the repo wrapper.',
  java: 'Java. Maven runs the exec plugin. ./mvnw is the same task through the repo wrapper.',
  gradle: 'Gradle. ./gradlew uses the repo wrapper. gradle uses a Gradle installed on your PATH.',
  dotnet: '.NET. dotnet run starts the project. dotnet watch run restarts it when files change.',
  rails: 'Rails. bin/rails server uses the repo binstub. bundle exec rails server uses the Gemfile.',
  puma: 'Puma. bundle exec puma uses the Gemfile. puma runs the puma script on your PATH.',
  ruby: 'Ruby. bundle exec runs the Gemfile. ruby runs a script directly.',
  laravel: 'Laravel. php artisan serve is the framework server. php -S is PHP’s built-in server.',
  php: 'PHP. composer start uses composer.json. php -S is PHP’s built-in server.',
  phoenix: 'Phoenix. mix phx.server starts the endpoint. iex -S mix phx.server starts it inside a shell.',
  elixir: 'Elixir. mix run --no-halt keeps the application up.',
  flutter: 'Flutter. flutter run starts the app. dart run starts a Dart program.',
  dart: 'Dart. dart run starts the package. flutter run is the Flutter toolchain form.',
  swift: 'Swift. swift run builds and starts the package.',
  scala: 'Scala. sbt run starts the project.',
  clojure: 'Clojure. lein run and clojure -M:run are the two usual starters.',
  haskell: 'Haskell. stack run and cabal run are the two usual starters.',
  crystal: 'Crystal. shards run starts the project.',
  nim: 'Nim. nimble run starts the project.',
  zig: 'Zig. zig build run runs the build.zig run step.',
  ocaml: 'OCaml. dune exec runs the package. dune build only compiles it.',
  r: 'R. Rscript starts the Shiny app.',
  perl: 'Perl. plackup starts a PSGI app.',
  cmake: 'CMake. The first command configures and builds. cmake --build repeats the build.',
  docker: 'Docker Compose. docker compose is the current CLI. docker-compose is the older binary.',
  make: 'Make. make run uses the run target. make runs the default target.',
  static: 'Static files. python and python3 both serve the folder over HTTP.',
};

function withFlag(command, port, flag) {
  if (!command || !port) return command;
  if (new RegExp(`${flag}(?:=|\\s+)`).test(command)) return command;
  return `${command} ${flag} ${port}`;
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || !item.command || seen.has(item.command)) return false;
    seen.add(item.command);
    return true;
  });
}

function labeled(command, label) {
  return command ? { label, command } : null;
}

function pythonModule(entrypoint) {
  return String(entrypoint || 'app:app').split(':')[0];
}

function commandsFor(input) {
  const framework = input.framework;
  const command = input.command;
  const port = input.port;
  const entry = input.entrypoint || 'main:app';
  const moduleName = pythonModule(entry);
  const uvicornBase = `uvicorn ${entry} --reload`;
  const pythonUvicorn = `python -m uvicorn ${entry} --reload`;
  const python3Uvicorn = `python3 -m uvicorn ${entry} --reload`;

  if (framework === 'fastapi') {
    return [
      labeled(withFlag(pythonUvicorn, port, '--port'), 'python -m uvicorn'),
      labeled(withFlag(python3Uvicorn, port, '--port'), 'python3 -m uvicorn'),
      labeled(withFlag(uvicornBase, port, '--port'), 'uvicorn'),
    ];
  }
  if (framework === 'flask') {
    const flask = `flask --app ${moduleName} run`;
    return [
      labeled(withFlag(`python -m ${flask}`, port, '--port'), 'python -m flask'),
      labeled(withFlag(`python3 -m ${flask}`, port, '--port'), 'python3 -m flask'),
      labeled(withFlag(flask, port, '--port'), 'flask'),
    ];
  }
  if (framework === 'django') {
    return [
      labeled(port ? `python manage.py runserver ${port}` : 'python manage.py runserver', 'python'),
      labeled(port ? `python3 manage.py runserver ${port}` : 'python3 manage.py runserver', 'python3'),
    ];
  }
  if (framework === 'python') {
    const file = input.entrypoint || 'app.py';
    return [
      labeled(command || `python ${file}`, 'python'),
      labeled(`python3 ${file}`, 'python3'),
    ];
  }
  if (framework === 'laravel') {
    return [
      labeled(port ? `php artisan serve --port=${port}` : 'php artisan serve', 'php artisan'),
      labeled(port ? `php -S localhost:${port} -t public` : 'php -S localhost:8000 -t public', 'php -S'),
    ];
  }
  if (framework === 'php') {
    return [
      labeled(command || 'composer start', 'composer'),
      labeled(port ? `php -S localhost:${port} -t public` : 'php -S localhost:8080 -t public', 'php -S'),
    ];
  }
  if (framework === 'go') {
    return [labeled('go run .', 'go run .'), labeled('go run ./...', 'go run ./...')];
  }
  if (framework === 'rust') {
    return [labeled('cargo run', 'cargo run'), labeled('cargo run --release', 'cargo run --release')];
  }
  if (framework === 'dotnet') {
    return [labeled('dotnet run', 'dotnet run'), labeled('dotnet watch run', 'dotnet watch')];
  }
  if (framework === 'rails') {
    const portFlag = port ? ` -p ${port}` : '';
    return [
      labeled(`bin/rails server${portFlag}`, 'bin/rails'),
      labeled(`bundle exec rails server${portFlag}`, 'bundle exec'),
    ];
  }
  if (framework === 'puma') {
    return [
      labeled(port ? `bundle exec puma -p ${port}` : 'bundle exec puma', 'bundle exec puma'),
      labeled(port ? `puma -p ${port}` : 'puma', 'puma'),
    ];
  }
  if (framework === 'phoenix') {
    return [labeled('mix phx.server', 'mix phx.server'), labeled('iex -S mix phx.server', 'iex')];
  }
  if (framework === 'elixir') {
    return [labeled('mix run --no-halt', 'mix run'), labeled('iex -S mix run --no-halt', 'iex')];
  }
  if (framework === 'flutter') {
    return [
      labeled(port ? `flutter run -d web-server --web-port ${port}` : 'flutter run -d web-server --web-port 8080', 'flutter run'),
      labeled('dart run', 'dart run'),
    ];
  }
  if (framework === 'dart') {
    return [labeled('dart run', 'dart run'), labeled('flutter run', 'flutter run')];
  }
  if (framework === 'docker') {
    return [labeled('docker compose up', 'docker compose'), labeled('docker-compose up', 'docker-compose')];
  }
  if (framework === 'static') {
    const listen = port || 8080;
    return [
      labeled(`python -m http.server ${listen}`, 'python'),
      labeled(`python3 -m http.server ${listen}`, 'python3'),
    ];
  }
  if (framework === 'deno') {
    return [labeled(command || 'deno task dev', 'deno task'), labeled('deno run --watch main.ts', 'deno run')];
  }
  if (framework === 'vite') return [labeled(command || 'npm run dev', 'npm run dev'), labeled(port ? `npx vite --port ${port}` : 'npx vite', 'npx vite')];
  if (framework === 'next') return [labeled(command || 'npm run dev', 'npm run dev'), labeled(port ? `npx next dev -p ${port}` : 'npx next dev', 'npx next')];
  if (framework === 'react') return [labeled(command || 'npm start', 'npm'), labeled('npx react-scripts start', 'npx react-scripts')];
  if (framework === 'vue') return [labeled(command || 'npm run dev', 'npm run dev'), labeled(port ? `npx vue-cli-service serve --port ${port}` : 'npx vue-cli-service serve', 'npx vue-cli-service')];
  if (framework === 'nuxt') return [labeled(command || 'npm run dev', 'npm run dev'), labeled(port ? `npx nuxt dev --port ${port}` : 'npx nuxt dev', 'npx nuxt')];
  if (framework === 'angular') return [labeled(command || 'npm start', 'npm'), labeled(port ? `npx ng serve --port ${port}` : 'npx ng serve', 'npx ng')];
  if (framework === 'nest') return [labeled(command || 'npm run dev', 'npm run dev'), labeled('npx nest start --watch', 'npx nest')];
  if (framework === 'node') return [labeled(command || 'npm start', 'npm'), labeled('node server.js', 'node')];
  if (framework === 'swift') return [labeled('swift run', 'swift run')];
  if (framework === 'scala') return [labeled('sbt run', 'sbt run')];
  if (framework === 'clojure') return [labeled(command || 'lein run', 'lein'), labeled('clojure -M:run', 'clojure')];
  if (framework === 'haskell') return [labeled(command || 'stack run', 'stack'), labeled('cabal run', 'cabal')];
  if (framework === 'crystal') return [labeled('shards run', 'shards run')];
  if (framework === 'nim') return [labeled('nimble run', 'nimble run')];
  if (framework === 'zig') return [labeled('zig build run', 'zig build run')];
  if (framework === 'ocaml') return [labeled('dune exec .', 'dune exec'), labeled('dune build', 'dune build')];
  if (framework === 'r') return [labeled(command || 'Rscript -e "shiny::runApp(port=3838)"', 'Rscript')];
  if (framework === 'perl') return [labeled(command || 'plackup', 'plackup')];
  if (framework === 'cmake') {
    return [
      labeled('cmake -S . -B build && cmake --build build', 'configure and build'),
      labeled('cmake --build build', 'cmake --build'),
    ];
  }
  if (framework === 'make') return [labeled('make run', 'make run'), labeled('make', 'make')];
  if (command && command.startsWith('./gradlew ')) {
    return [labeled(command, './gradlew'), labeled(command.replace('./gradlew ', 'gradle '), 'gradle')];
  }
  if (command && command.startsWith('gradle ')) {
    return [labeled(command, 'gradle'), labeled(command.replace('gradle ', './gradlew '), './gradlew')];
  }
  if (command && command.startsWith('mvn ')) {
    return [labeled(command, 'mvn'), labeled(command.replace('mvn ', './mvnw '), './mvnw')];
  }
  if (command && command.startsWith('./mvnw ')) {
    return [labeled(command, './mvnw'), labeled(command.replace('./mvnw ', 'mvn '), 'mvn')];
  }
  return [labeled(command, 'detected')];
}

function buildRunSuggestions(input) {
  const framework = input && input.framework;
  const suggestions = unique(commandsFor(input || {}));
  if (input && input.command && !suggestions.some((item) => item.command === input.command || item.command.startsWith(`${input.command} `))) {
    suggestions.unshift({ label: 'detected', command: input.command });
  }
  return {
    hint: HINTS[framework] || (framework ? `${framework}. Pick the command that matches how you start this project.` : ''),
    suggestions,
  };
}

module.exports = { buildRunSuggestions, HINTS };
