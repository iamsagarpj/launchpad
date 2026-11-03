const MAX_HISTORY = 30;

function snapshotRequest(request) {
  return {
    ...request,
    formParams: (request.formParams || []).map((row) => (row.dataBase64 ? { ...row, dataBase64: '' } : row)),
  };
}

export function pushHistory(history, entry) {
  const next = [
    {
      id: entry.id || crypto.randomUUID(),
      at: entry.at || Date.now(),
      method: entry.method,
      url: entry.url,
      status: entry.status,
      ok: entry.ok,
      request: snapshotRequest(entry.request || {}),
    },
    ...(history || []),
  ];
  return next.slice(0, MAX_HISTORY);
}
