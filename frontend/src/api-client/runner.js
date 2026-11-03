export function listRequests(items) {
  const requests = [];
  (items || []).forEach((item) => {
    if (item.type === 'folder') {
      requests.push(...listRequests(item.items));
      return;
    }
    if (item.type === 'request') requests.push(item);
  });
  return requests;
}
