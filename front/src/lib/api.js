// Клиент REST API бэкенда erik.
// Личность по устройству: X-Device-Id + Bearer-токен (см. useSessionStore).

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Держатель авторизации — заполняется из useSessionStore, чтобы не было
// циклического импорта (store → api → store).
let _auth = { token: null, deviceId: null };
export function setAuth(patch) {
  _auth = { ..._auth, ...patch };
}
export function getAuth() {
  return _auth;
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (_auth.deviceId) headers['X-Device-Id'] = _auth.deviceId;
  if (auth && _auth.token) headers['Authorization'] = 'Bearer ' + _auth.token;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* пустое тело */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Ошибка запроса');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // сессия / профиль
  session: (payload) => request('/session', { method: 'POST', body: payload, auth: false }),
  me: () => request('/me'),
  updateMe: (patch) => request('/me', { method: 'PATCH', body: patch }),

  // сборы (координатор)
  createGathering: (body) => request('/gatherings', { method: 'POST', body }),
  getGathering: (id) => request(`/gatherings/${id}`),
  forecast: (id) => request(`/gatherings/${id}/forecast`),
  mlForecast: (id) => request(`/gatherings/${id}/ml-forecast`),
  poll: (id, since) => request(`/gatherings/${id}/poll?since=${since}`),
  patchGathering: (id, body) => request(`/gatherings/${id}`, { method: 'PATCH', body }),
  deleteGathering: (id) => request(`/gatherings/${id}`, { method: 'DELETE' }),
  finalize: (id) => request(`/gatherings/${id}/finalize`, { method: 'POST' }),
  share: (id) => request(`/gatherings/${id}/share`),
  myGatherings: () => request('/gatherings/mine'),

  // ростер (координатор)
  setAnswer: (id, pid, answer) =>
    request(`/gatherings/${id}/participants/${pid}`, { method: 'PATCH', body: { answer } }),
  removeParticipant: (id, pid) =>
    request(`/gatherings/${id}/participants/${pid}`, { method: 'DELETE' }),
  addGuest: (id, body) => request(`/gatherings/${id}/participants`, { method: 'POST', body }),

  // отметка явки
  setPresence: (id, pid, present, clientMarkId) =>
    request(`/gatherings/${id}/participants/${pid}/presence`, {
      method: 'PUT',
      body: { present, clientMarkId },
    }),
  presenceBatch: (id, ops, baseRevision) =>
    request(`/gatherings/${id}/presence/batch`, { method: 'POST', body: { ops, baseRevision } }),

  // участник
  guestView: (code) => request(`/g/${code}`),
  getRsvp: (code) => request(`/g/${code}/rsvp`),
  putRsvp: (code, answer, extra = {}) =>
    request(`/g/${code}/rsvp`, { method: 'PUT', body: { answer, ...extra } }),

  // напоминания и уведомления (P1)
  remind: (id, body) => request(`/gatherings/${id}/remind`, { method: 'POST', body }),
  notifications: () => request('/notifications'),
  unreadCount: () => request('/notifications/unread-count'),
  readNotification: (nid) => request(`/notifications/${nid}/read`, { method: 'POST' }),
  readAllNotifications: () => request('/notifications/read-all', { method: 'POST' }),

  // платформа (P2a): каталог, лента, НКО, помощь, рейтинг, подписки
  getCities: () => request('/cities'),
  getThemes: () => request('/themes'),
  getBadges: () => request('/badges'),
  getEvents: (qs = '') => request('/events' + qs),
  getEvent: (id) => request(`/events/${id}`),
  eventParticipants: (id, limit = 7) => request(`/events/${id}/participants?limit=${limit}`),
  setEventReg: (id, answer) => request(`/events/${id}/registration`, { method: 'PUT', body: { answer } }),
  myRegistrations: () => request('/me/registrations'),
  getOrgs: () => request('/orgs'),
  getOrg: (id) => request(`/orgs/${id}`),
  followOrg: (id) => request(`/orgs/${id}/follow`, { method: 'POST' }),
  unfollowOrg: (id) => request(`/orgs/${id}/follow`, { method: 'DELETE' }),
  myFollows: () => request('/me/follows'),
  getCharity: () => request('/charity'),
  donateCharity: (id, body) => request(`/charity/${id}/donate`, { method: 'POST', body }),
  leaderboardVolunteers: () => request('/leaderboard/volunteers'),
  userPublic: (id) => request(`/users/${id}`),

  // штаб организатора (P2b): сборы, заявки волонтёров, база волонтёров
  orgEvents: () => request('/org/events'),
  orgVolunteers: () => request('/org/volunteers'),
  myApplications: () => request('/org/applications'),
  actOnApplication: (id, action) => request(`/org/applications/${id}`, { method: 'POST', body: { action } }),
  createApplication: (eventId, body) => request(`/events/${eventId}/applications`, { method: 'POST', body }),
};

export { BASE };
