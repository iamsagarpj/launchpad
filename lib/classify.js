'use strict';

const TECH_TAG_OVERRIDES = {
  fastapi: 'FastAPI',
  dotnet: '.NET',
  php: 'PHP',
  r: 'R',
  ocaml: 'OCaml',
};

function techTagFromLabels(labels) {
  const fwLabelKey = Object.keys(labels).find((key) => key.startsWith('fw-'));
  if (!fwLabelKey) {
    return null;
  }
  const raw = fwLabelKey.slice(3);
  if (TECH_TAG_OVERRIDES[raw]) {
    return TECH_TAG_OVERRIDES[raw];
  }
  return raw
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function classifyResource(uiResource) {
  const name = uiResource.metadata.name;
  const labels = uiResource.metadata.labels || {};
  const status = uiResource.status || {};

  const section = labels.backend || labels.frontend ? 'services' : 'infra';

  const pid = status.localResourceInfo && status.localResourceInfo.pid;
  const kind = pid ? 'process' : 'check';

  const disableState = status.disableStatus && status.disableStatus.state;
  let health;
  if (disableState === 'Disabled') {
    health = 'disabled';
  } else {
    const healthField = kind === 'process' ? status.runtimeStatus : status.updateStatus;
    if (healthField === 'ok') {
      health = 'healthy';
    } else if (healthField === 'error') {
      health = 'error';
    } else {
      health = 'starting';
    }
  }

  const links = (status.endpointLinks || []).map((link) => ({
    name: link.name,
    url: link.url,
  }));

  const since = status.lastDeployTime || null;
  const techTag = techTagFromLabels(labels);

  // buildHistory is newest-first, so [0] is the build that produced the
  // current error status. Without this, a resource blocked by a failed
  // resource_deps (e.g. aws-creds) just shows a red dot and a generic
  // "Re-check" button, with no clue that the real fix is e.g. "run aws sso
  // login" - that reason only lives in Tilt's own UI/logs otherwise.
  const lastError = health === 'error' ? ((status.buildHistory || [])[0] || {}).error || null : null;

  return { name, section, kind, status: health, links, since, techTag, lastError };
}

module.exports = { classifyResource };
