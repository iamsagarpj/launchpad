# Launchpad

Local dashboard for multi-service projects. Choose a repo folder, detect how to run it, start every service with Tilt, and follow the logs.

Copyright (c) 2026 Sagar Jadhav. See `LICENSE`.

## Run

Install [Tilt](https://tilt.dev/) and Node.js 20.

```bash
npm install
npm install --prefix frontend
npm run build --prefix frontend
npm start
```

Open http://localhost:4040

## CloudWatch

Log groups and AWS profiles stay on your machine. Copy the example and edit it:

```bash
cp data/cloudwatch.example.json data/cloudwatch.json
```

`data/cloudwatch.json` is gitignored.
