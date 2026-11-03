# Launchpad

Launchpad is a local dashboard for people who run more than one service on their machine. Point it at a repo folder. It detects the stack, the start command, and the port, then starts the services with [Tilt](https://tilt.dev/) and streams the logs.

It also includes an API client and a set of small developer tools. CloudWatch logs are optional and stay on your machine.

Copyright 2026 Sagar Jadhav. Licensed under the Apache License 2.0. See `LICENSE` and `NOTICE`.

## What you can do

**Dashboard.** Register a repo, start or stop every service, and read local logs. Launchpad does not scan your disk. You choose the folder.

**Remote Logs.** Read recent CloudWatch logs for the environments you configure. Nothing is fetched until you click Load Logs. Leave this empty if you do not use AWS.

**Tools.** An API client, plus formatters and converters for everyday debugging. Requests run from your machine.

## Requirements

- [Node.js](https://nodejs.org/) 20
- [Tilt](https://tilt.dev/) 0.37 or newer
- macOS, Linux, or Windows

The folder picker uses the native dialog on each system, so the path comes from the folder you select.

## Install

```bash
git clone https://github.com/iamsagarpj/launchpad.git
cd launchpad
npm install
npm install --prefix frontend
npm run build --prefix frontend
npm start
```

Open http://localhost:4040

From the GitHub page you can also use **Code**, then **Download ZIP**, and run the same install commands inside that folder.

## Register a service

1. Open **Register repo**.
2. Choose the project folder.
3. Launchpad fills the name, stack, start command, port, and whether it is a frontend or a backend.
4. Change any of those fields if you want, then save.
5. Press **Start All**.

Start All starts services marked frontend or backend. A saved service can be edited later from the same dialog. If the folder has no recognizable project file, the path is kept and you type the start command yourself.

Choosing a folder looks for the usual project file:

| Project file | Stack | Start command |
|---|---|---|
| `package.json` | vite, next, react, vue, nuxt, angular, express, or node | the `dev` or `start` script |
| `deno.json` | deno | the first task |
| `go.mod` | go | `go run .` |
| `Cargo.toml` | rust | `cargo run` |
| `pom.xml` or Gradle | spring-boot, quarkus, micronaut, java, or gradle | the matching Maven or Gradle task |
| `*.csproj` or `*.sln` | dotnet | `dotnet run` |
| `mix.exs` | phoenix or elixir | `mix phx.server` or `mix run` |
| `Gemfile` | rails, puma, or ruby | `bin/rails server` or Puma |
| `composer.json` or `artisan` | laravel or php | `php artisan serve` or `composer start` |
| `pubspec.yaml` | flutter or dart | `flutter run` or `dart run` |
| Swift, Scala, Clojure, Haskell, Crystal, Nim, Zig, OCaml | the matching stack | `swift run`, `sbt run`, `lein run`, and the others |
| Shiny `app.R` | r | `Rscript` with `shiny::runApp` |
| `CMakeLists.txt`, Compose file, Perl | cmake, compose, or perl | a CMake build, `docker compose up`, or `plackup` |
| `manage.py`, FastAPI, Flask, `app.py` | django, fastapi, flask, or python | `runserver`, `uvicorn`, `flask run`, or `python app.py` |
| `Makefile` or `index.html` | make or static | `make run` or a local static server |

If a folder contains both `package.json` and a server marker such as `go.mod`, `artisan`, or `manage.py`, the server marker wins. The port is read from the project when it is written down. Otherwise Launchpad uses the usual port for that stack, such as 5173 for Vite, 8080 for Spring, 8000 for Django and Laravel, and 3000 for Rails.

AWS credentials are optional. Turn **Needs AWS** on only for a service that should wait for an `aws-creds` resource you already have in your Tiltfile.

## Remote logs

Copy the example and add your own profile, region, and log group:

```bash
cp data/cloudwatch.example.json data/cloudwatch.json
```

`data/cloudwatch.json` is gitignored. Launchpad never ships your AWS account details.

## Tools

| Tool | What it does |
|---|---|
| API Client | Send HTTP requests with headers, auth, environments, scripts, and cURL import |
| cURL Cleaner | Strip browser noise from a copied cURL command and redact tokens |
| OpenAPI Viewer | List the endpoints in an OpenAPI or Swagger file |
| JSON Viewer | Format, validate, repair, compare, and convert JSON |
| Log Viewer | Filter plain-text or JSON logs |
| Env File Tool | Compare two `.env` files key by key |
| JWT Decoder | Read a JWT header and payload. It does not verify the signature |
| Hash, Base64, URL, UUID, Timestamp | Encode, decode, and convert the usual values |
| Regex, Text Diff, XML, YAML | Test a pattern, diff text, and format XML or YAML |

## Develop

```bash
npm test
npm test --prefix frontend
```

The server listens on port 4040. The React app is built into `public/` by `npm run build --prefix frontend`.

If Launchpad saves you time, star the repository so other people can find it.
