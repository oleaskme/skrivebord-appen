// Enkel wrapper for kall til backend API-endepunkter
async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'API-feil')
  return data
}

export const api = {
  gmail: {
    search: (userId, q = '', pageToken) =>
      apiFetch(`/api/gmail/search?userId=${userId}&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`),
    getMessage: (userId, messageId) =>
      apiFetch(`/api/gmail/message?userId=${userId}&messageId=${messageId}`),
  },
  drive: {
    files: (userId, q = '') =>
      apiFetch(`/api/drive/files?userId=${userId}&q=${encodeURIComponent(q)}`),
    read: (userId, fileId) =>
      apiFetch(`/api/drive/read?userId=${userId}&fileId=${fileId}`),
  },
  calendar: {
    events: (userId) =>
      apiFetch(`/api/calendar/events?userId=${userId}`),
    create: (userId, body) =>
      apiFetch(`/api/calendar/events?userId=${userId}`, { method: 'POST', body }),
  },
  tasks: {
    getLists: (userId) =>
      apiFetch(`/api/tasks/lists?userId=${userId}`),
    createList: (userId, title) =>
      apiFetch(`/api/tasks/lists?userId=${userId}`, { method: 'POST', body: { title } }),
    getItems: (userId, listId) =>
      apiFetch(`/api/tasks/items?userId=${userId}&listId=${listId}`),
    createItem: (userId, listId, title, due) =>
      apiFetch(`/api/tasks/items?userId=${userId}&listId=${listId}`, { method: 'POST', body: { title, due } }),
    updateItem: (userId, listId, taskId, patch) =>
      apiFetch(`/api/tasks/items?userId=${userId}&listId=${listId}&taskId=${taskId}`, { method: 'PATCH', body: patch }),
    deleteItem: (userId, listId, taskId) =>
      apiFetch(`/api/tasks/items?userId=${userId}&listId=${listId}&taskId=${taskId}`, { method: 'DELETE' }),
  },
}
