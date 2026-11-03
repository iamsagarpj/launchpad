'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyResource } = require('../lib/classify');

// Fixture: data-service, a healthy long-running backend resource.
// Captured verbatim (trimmed) from `tilt get uiresources data-service -o json` on 2026-10-11.
// lastDeployTime and the fw-spring-boot label reflect this plan's Task 3 changes.
const HEALTHY_PROCESS = {
  metadata: { name: 'data-service', labels: { backend: 'backend', 'fw-spring-boot': 'fw-spring-boot' } },
  status: {
    runtimeStatus: 'ok',
    updateStatus: 'not_applicable',
    disableStatus: { disabledCount: 0, enabledCount: 1, state: 'Enabled' },
    localResourceInfo: { pid: 95019 },
    endpointLinks: [{ name: 'Swagger', url: 'http://localhost:8080/swagger-ui.html' }],
    lastDeployTime: '2026-10-11T10:56:51.427783Z',
  },
};

// Fixture: ui, a healthy long-running frontend resource with a different label.
const HEALTHY_FRONTEND = {
  metadata: { name: 'ui', labels: { frontend: 'frontend', 'fw-vite': 'fw-vite' } },
  status: {
    runtimeStatus: 'ok',
    updateStatus: 'not_applicable',
    disableStatus: { disabledCount: 0, enabledCount: 1, state: 'Enabled' },
    localResourceInfo: { pid: 64009 },
    endpointLinks: [{ name: 'Studio UI', url: 'https://localhost:8085' }],
    lastDeployTime: '2026-10-11T17:41:00.000000Z',
  },
};

// Fixture: a new FastAPI-backed service, exercising the "fastapi" -> "FastAPI" override
// (plain hyphen-split title-case would otherwise produce "Fastapi", not what the design calls for).
const FASTAPI_SERVICE = {
  metadata: { name: 'external-api-services', labels: { backend: 'backend', 'fw-fastapi': 'fw-fastapi' } },
  status: {
    runtimeStatus: 'ok',
    updateStatus: 'not_applicable',
    disableStatus: { disabledCount: 0, enabledCount: 1, state: 'Enabled' },
    localResourceInfo: { pid: 12345 },
    endpointLinks: [],
    lastDeployTime: '2026-10-11T18:00:00.000000Z',
  },
};

// Fixture: aws-creds, a healthy one-shot check resource (no pid, infra label, no fw- label).
const HEALTHY_CHECK = {
  metadata: { name: 'aws-creds', labels: { infra: 'infra' } },
  status: {
    runtimeStatus: 'not_applicable',
    updateStatus: 'ok',
    disableStatus: { disabledCount: 0, enabledCount: 1, state: 'Enabled' },
    localResourceInfo: {},
    endpointLinks: [],
    lastDeployTime: '2026-10-11T10:40:58.000184Z',
  },
};

// Fixture: same check resource, disabled.
const DISABLED_CHECK = {
  metadata: { name: 'aws-creds', labels: { infra: 'infra' } },
  status: {
    runtimeStatus: 'none',
    updateStatus: 'none',
    disableStatus: { disabledCount: 1, enabledCount: 0, state: 'Disabled' },
    localResourceInfo: {},
    endpointLinks: [],
  },
};

// Fixture: a check resource whose last run failed.
// Captured verbatim from a deliberately-failing scratch resource (`cmd='exit 1'`) on 2026-10-11.
const ERRORED_CHECK = {
  metadata: { name: 'plan-scratch-test', labels: { infra: 'infra' } },
  status: {
    runtimeStatus: 'not_applicable',
    updateStatus: 'error',
    disableStatus: { disabledCount: 0, enabledCount: 1, state: 'Enabled' },
    localResourceInfo: {},
    endpointLinks: [],
    buildHistory: [{ error: 'Command "exit 1" failed: exit status 1' }],
  },
};

// Fixture: a resource with no recognized label at all (future-proofing: must not vanish).
const UNLABELED = {
  metadata: { name: 'mystery-resource', labels: {} },
  status: {
    runtimeStatus: 'ok',
    updateStatus: 'not_applicable',
    disableStatus: { disabledCount: 0, enabledCount: 1, state: 'Enabled' },
    localResourceInfo: { pid: 1 },
    endpointLinks: [],
  },
};

test('healthy process resource classifies as services/process/healthy, with since and techTag', () => {
  const result = classifyResource(HEALTHY_PROCESS);
  assert.deepEqual(result, {
    name: 'data-service',
    section: 'services',
    kind: 'process',
    status: 'healthy',
    links: [{ name: 'Swagger', url: 'http://localhost:8080/swagger-ui.html' }],
    since: '2026-10-11T10:56:51.427783Z',
    techTag: 'Spring Boot',
    lastError: null,
  });
});

test('frontend label also counts as services section, vite tech tag', () => {
  const result = classifyResource(HEALTHY_FRONTEND);
  assert.equal(result.section, 'services');
  assert.equal(result.kind, 'process');
  assert.equal(result.status, 'healthy');
  assert.equal(result.techTag, 'Vite');
  assert.equal(result.since, '2026-10-11T17:41:00.000000Z');
});

test('fastapi label uses the FastAPI override, not naive title-case', () => {
  const result = classifyResource(FASTAPI_SERVICE);
  assert.equal(result.techTag, 'FastAPI');
});

test('healthy check resource classifies as infra/check/healthy, no tech tag', () => {
  const result = classifyResource(HEALTHY_CHECK);
  assert.deepEqual(result, {
    name: 'aws-creds',
    section: 'infra',
    kind: 'check',
    status: 'healthy',
    links: [],
    since: '2026-10-11T10:40:58.000184Z',
    techTag: null,
    lastError: null,
  });
});

test('disabled resource reports status disabled regardless of other fields', () => {
  const result = classifyResource(DISABLED_CHECK);
  assert.equal(result.status, 'disabled');
  assert.equal(result.since, null);
});

test('errored check resource reports status error', () => {
  const result = classifyResource(ERRORED_CHECK);
  assert.equal(result.status, 'error');
  assert.equal(result.kind, 'check');
});

test('errored check resource surfaces the real failure message from buildHistory', () => {
  const result = classifyResource(ERRORED_CHECK);
  assert.equal(result.lastError, 'Command "exit 1" failed: exit status 1');
});

test('buildHistory is newest-first: lastError comes from index 0, not the oldest entry', () => {
  const result = classifyResource({
    ...ERRORED_CHECK,
    status: {
      ...ERRORED_CHECK.status,
      buildHistory: [
        { error: 'latest failure' },
        { error: 'older failure' },
      ],
    },
  });
  assert.equal(result.lastError, 'latest failure');
});

test('a resource that has since recovered does not surface a stale error from buildHistory', () => {
  const result = classifyResource({
    ...HEALTHY_CHECK,
    status: {
      ...HEALTHY_CHECK.status,
      buildHistory: [{}, { error: 'AWS session expired or not configured. Run: aws sso login --profile default' }],
    },
  });
  assert.equal(result.status, 'healthy');
  assert.equal(result.lastError, null);
});

test('unlabeled resource falls into infra section, not dropped, no tech tag, no since', () => {
  const result = classifyResource(UNLABELED);
  assert.equal(result.section, 'infra');
  assert.equal(result.kind, 'process');
  assert.equal(result.techTag, null);
  assert.equal(result.since, null);
});
