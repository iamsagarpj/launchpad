'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { fromIni } = require('@aws-sdk/credential-providers');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'cloudwatch.json');
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MIN_MINUTES = 1;
const MAX_MINUTES = 60;
const DEFAULT_MINUTES = 15;
const MAX_EVENTS = 1000;

let region = '';
let environments = Object.create(null);
let logGroups = Object.create(null);

function applyConfig(config) {
  const src = config && typeof config === 'object' ? config : {};
  region = typeof src.region === 'string' ? src.region : '';
  environments = Object.create(null);
  logGroups = Object.create(null);
  const envSrc = src.environments && typeof src.environments === 'object' ? src.environments : {};
  Object.keys(envSrc).forEach((key) => {
    if (BLOCKED_KEYS.has(key)) return;
    const entry = envSrc[key];
    if (!entry || typeof entry.profile !== 'string' || typeof entry.label !== 'string') return;
    if (!entry.profile || !entry.label) return;
    environments[key] = { label: entry.label, profile: entry.profile };
  });
  const groupSrc = src.logGroups && typeof src.logGroups === 'object' ? src.logGroups : {};
  Object.keys(groupSrc).forEach((key) => {
    if (BLOCKED_KEYS.has(key)) return;
    if (typeof groupSrc[key] !== 'string' || !groupSrc[key]) return;
    logGroups[key] = groupSrc[key];
  });
}

function loadConfigFromDisk(filePath = CONFIG_PATH) {
  try {
    applyConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (err) {
    if (err && err.code !== 'ENOENT') applyConfig({});
    else applyConfig({});
  }
}

loadConfigFromDisk();

function validateEnv(env) {
  return Object.prototype.hasOwnProperty.call(environments, env);
}

function validateService(service) {
  return Object.prototype.hasOwnProperty.call(logGroups, service);
}

function clampMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n)) {
    return DEFAULT_MINUTES;
  }
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(n)));
}

function mapEvents(awsEvents) {
  return (awsEvents || []).map((e) => ({ timestamp: e.timestamp, message: e.message }));
}

function mapError(err, profile) {
  const message = String((err && err.message) || '');
  const isCredentialError =
    Boolean(err) && (err.name === 'CredentialsProviderError' || /sso|token|credentials|expired/i.test(message));
  if (isCredentialError) {
    return {
      status: 401,
      error: `AWS session expired or not configured for profile "${profile}". Run: aws sso login --profile ${profile}`,
    };
  }
  if (err && err.name === 'ResourceNotFoundException') {
    return { status: 404, error: 'Log group not found for this service in this environment.' };
  }
  return { status: 502, error: 'Failed to fetch logs from CloudWatch.' };
}

function defaultClientFactory(profile) {
  return new CloudWatchLogsClient({ region, credentials: fromIni({ profile }) });
}

async function fetchRemoteLogs(env, service, minutes, clientFactory = defaultClientFactory) {
  if (!validateEnv(env)) {
    return { ok: false, status: 400, error: 'Unknown environment.' };
  }
  if (!validateService(service)) {
    return { ok: false, status: 400, error: 'Unknown service.' };
  }

  const boundedMinutes = clampMinutes(minutes);
  const profile = environments[env].profile;
  const logGroupName = logGroups[service];
  const endTime = Date.now();
  const startTime = endTime - boundedMinutes * 60 * 1000;

  const client = clientFactory(profile);
  try {
    const response = await client.send(
      new FilterLogEventsCommand({ logGroupName, startTime, endTime, limit: MAX_EVENTS })
    );
    return {
      ok: true,
      events: mapEvents(response.events),
      truncated: Boolean(response.nextToken),
    };
  } catch (err) {
    const mapped = mapError(err, profile);
    return { ok: false, status: mapped.status, error: mapped.error };
  }
}

module.exports = {
  get REGION() {
    return region;
  },
  get ENVIRONMENTS() {
    return environments;
  },
  get SERVICE_LOG_GROUPS() {
    return logGroups;
  },
  MIN_MINUTES,
  MAX_MINUTES,
  DEFAULT_MINUTES,
  MAX_EVENTS,
  applyConfig,
  loadConfigFromDisk,
  validateEnv,
  validateService,
  clampMinutes,
  mapEvents,
  mapError,
  fetchRemoteLogs,
};
