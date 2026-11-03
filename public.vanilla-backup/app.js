'use strict';

const servicesList = document.getElementById('services-list');
const infraList = document.getElementById('infra-list');
const banner = document.getElementById('banner');
const detailPlaceholder = document.getElementById('detail-placeholder');
const detailContent = document.getElementById('detail-content');
const detailName = document.getElementById('detail-name');
const detailStatusPill = document.getElementById('detail-status-pill');
const detailTags = document.getElementById('detail-tags');
const detailLinks = document.getElementById('detail-links');
const logPanelBody = document.getElementById('log-panel-body');

let selectedName = null;
let activeSocket = null;
let latestResources = [];
const cardErrors = {};

const STATUS_LABELS = {
  healthy: 'Healthy',
  starting: 'Starting',
  error: 'Error',
  disabled: 'Disabled',
};

function formatUptime(sinceIso) {
  if (!sinceIso) {
    return null;
  }
  const ms = Date.now() - new Date(sinceIso).getTime();
  if (Number.isNaN(ms) || ms < 0) {
    return null;
  }
  const sec = Math.floor(ms / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) {
    return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
  }
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

function parsePort(url) {
  if (!url) {
    return null;
  }
  const match = url.match(/:(\d+)/);
  return match ? match[1] : null;
}

function renderDetailHeader(resource) {
  detailName.textContent = resource.name;

  detailStatusPill.innerHTML = '';
  detailStatusPill.className = `status-pill status-pill-${resource.status}`;
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  const label = document.createElement('span');
  label.textContent = STATUS_LABELS[resource.status] || resource.status;
  detailStatusPill.appendChild(dot);
  detailStatusPill.appendChild(label);

  detailTags.innerHTML = '';
  const port = resource.links.length > 0 ? parsePort(resource.links[0].url) : null;
  const uptime = formatUptime(resource.since);
  if (port) {
    const portTag = document.createElement('span');
    portTag.className = 'tag tag-port';
    portTag.textContent = `:${port}`;
    detailTags.appendChild(portTag);
  }
  if (resource.techTag) {
    const techTagEl = document.createElement('span');
    techTagEl.className = 'tag tag-tech';
    techTagEl.textContent = resource.techTag;
    detailTags.appendChild(techTagEl);
  }
  if (uptime) {
    const uptimeTag = document.createElement('span');
    uptimeTag.className = 'tag tag-uptime';
    uptimeTag.textContent = uptime;
    detailTags.appendChild(uptimeTag);
  }

  detailLinks.innerHTML = '';
  resource.links.forEach((link) => {
    const a = document.createElement('a');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = link.name;
    detailLinks.appendChild(a);
  });
}

function selectResource(name) {
  if (selectedName === name) {
    return;
  }
  if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }
  selectedName = name;
  logPanelBody.textContent = '';
  detailPlaceholder.hidden = true;
  detailContent.hidden = false;

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  activeSocket = new WebSocket(`${proto}://${window.location.host}/ws/logs/${name}`);
  activeSocket.addEventListener('message', (event) => {
    if (selectedName !== name) {
      return;
    }
    logPanelBody.textContent += event.data + '\n';
    logPanelBody.scrollTop = logPanelBody.scrollHeight;
  });
  activeSocket.addEventListener('close', () => {
    if (selectedName === name) {
      logPanelBody.textContent += '\n[service stopped]\n';
    }
  });

  const resource = latestResources.find((r) => r.name === name);
  if (resource) {
    renderDetailHeader(resource);
  }
}

function renderRow(resource) {
  if (resource.status === 'healthy') {
    cardErrors[resource.name] = null;
  }

  const row = document.createElement('div');
  row.className = `resource-row status-${resource.status}`;
  if (resource.name === selectedName) {
    row.classList.add('selected');
  }
  row.addEventListener('click', () => selectResource(resource.name));

  const top = document.createElement('div');
  top.className = 'resource-row-top';
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  const nameEl = document.createElement('span');
  nameEl.className = 'resource-row-name';
  nameEl.textContent = resource.name;
  top.appendChild(dot);
  top.appendChild(nameEl);
  row.appendChild(top);

  if (resource.kind === 'process') {
    const toggle = document.createElement('button');
    toggle.className = `toggle ${resource.status !== 'disabled' ? 'on' : ''}`;
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      fetch(`/api/toggle/${resource.name}`, { method: 'POST' })
        .then((res) => res.json().then((body) => ({ res, body })))
        .then(({ res, body }) => {
          cardErrors[resource.name] = res.ok ? null : body.error || 'toggle failed';
          refresh();
        });
    });
    row.appendChild(toggle);
  } else {
    const recheck = document.createElement('button');
    recheck.className = 'recheck-btn';
    recheck.textContent = 'Re-check';
    recheck.addEventListener('click', (event) => {
      event.stopPropagation();
      fetch(`/api/trigger/${resource.name}`, { method: 'POST' })
        .then((res) => res.json().then((body) => ({ res, body })))
        .then(({ res, body }) => {
          cardErrors[resource.name] = res.ok ? null : body.error || 'trigger failed';
          refresh();
        });
    });
    row.appendChild(recheck);
  }

  if (cardErrors[resource.name]) {
    const errorEl = document.createElement('div');
    errorEl.className = 'card-error';
    errorEl.textContent = cardErrors[resource.name];
    row.appendChild(errorEl);
  }

  return row;
}

async function refresh() {
  let data;
  try {
    const response = await fetch('/api/resources');
    if (!response.ok) {
      throw new Error('not ok');
    }
    data = await response.json();
  } catch (err) {
    banner.hidden = false;
    banner.textContent = "Tilt isn't running — start it with `tilt up`.";
    return;
  }
  banner.hidden = true;
  latestResources = data.resources;

  servicesList.innerHTML = '';
  infraList.innerHTML = '';

  data.resources.forEach((resource) => {
    const row = renderRow(resource);
    if (resource.section === 'services') {
      servicesList.appendChild(row);
    } else {
      infraList.appendChild(row);
    }
  });

  if (selectedName) {
    const resource = data.resources.find((r) => r.name === selectedName);
    if (resource) {
      renderDetailHeader(resource);
    }
  }
}

function applyBulkResults(body) {
  (body.results || []).forEach((r) => {
    cardErrors[r.name] = r.ok ? null : r.error || 'failed';
  });
  refresh();
}

document.getElementById('start-all').addEventListener('click', () => {
  fetch('/api/start-all', { method: 'POST' })
    .then((res) => res.json())
    .then(applyBulkResults);
});

document.getElementById('stop-all').addEventListener('click', () => {
  fetch('/api/stop-all', { method: 'POST' })
    .then((res) => res.json())
    .then(applyBulkResults);
});

refresh();
setInterval(refresh, 2000);
