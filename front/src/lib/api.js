// Клиент REST API бэкенда erik.
// Личность по устройству: X-Device-Id + Bearer-токен (см. useSessionStore).

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Держатель авторизации — заполняется из useSessionStore, чтобы не было
// циклического импорта (store → api → store).
let _auth = { token: null, deviceId: null, refreshToken: null };
export function setAuth(patch) {
  _auth = { ..._auth, ...patch };
}
export function getAuth() {
  return _auth;
}

// Колбэк для проброса обновлённого access-токена в стор сессии (без цикл. импорта).
let _onAuthRefresh = null;
export function onAuthRefresh(cb) {
  _onAuthRefresh = cb;
}

let _refreshing = null; // общий in-flight refresh, чтобы не гонять его параллельно

async function request(path, opts = {}) {
  const { method = 'GET', body, auth = true, bearer, _retry = false } = opts;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (_auth.deviceId) headers['X-Device-Id'] = _auth.deviceId;
  // bearer перебивает device-токен — нужно для /auth/refresh (там шлём refresh-токен).
  const token = bearer || _auth.token;
  if (auth && token) headers['Authorization'] = 'Bearer ' + token;

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
    // Истёк access → один раз пробуем обновить его по refresh-токену и повторить.
    if (res.status === 401 && auth && !bearer && !_retry && _auth.refreshToken && path !== '/auth/refresh') {
      try {
        if (!_refreshing) _refreshing = api.refresh(_auth.refreshToken).finally(() => { _refreshing = null; });
        const r = await _refreshing;
        if (r && r.access_token) {
          _auth.token = r.access_token;
          if (_onAuthRefresh) _onAuthRefresh(r.access_token);
          return request(path, { ...opts, _retry: true });
        }
      } catch (_) {
        /* refresh не удался — пробрасываем исходную 401 */
      }
    }
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
  pushSubscribe: (body) => request('/push/subscribe', { method: 'POST', body }), // {endpoint, keys:{p256dh,auth}}

  // платформа (P2a): каталог, лента, НКО, помощь, рейтинг, подписки
  getCities: () => request('/cities'),
  getThemes: () => request('/themes'),
  getBadges: () => request('/badges'),
  getEvents: (qs = '') => request('/events' + qs),
  getEvent: (id) => request(`/events/${id}`),
  eventParticipants: (id, limit = 7) => request(`/events/${id}/participants?limit=${limit}`),
  setEventReg: (id, answer) => request(`/events/${id}/registration`, { method: 'PUT', body: { answer } }),
  deleteEventReg: (id) => request(`/events/${id}/registration`, { method: 'DELETE' }),
  myRegistrations: () => request('/me/registrations'),
  getOrgs: () => request('/orgs'),
  createOrg: (body) => request('/orgs', { method: 'POST', body }), // {name,cat,cityId,aboutRu,aboutKz}
  getOrg: (id) => request(`/orgs/${id}`),
  followOrg: (id) => request(`/orgs/${id}/follow`, { method: 'POST' }),
  unfollowOrg: (id) => request(`/orgs/${id}/follow`, { method: 'DELETE' }),
  myFollows: () => request('/me/follows'),
  getCharity: () => request('/charity'),
  donateCharity: (id, body) => request(`/charity/${id}/donate`, { method: 'POST', body }),
  leaderboardVolunteers: () => request('/leaderboard/volunteers'),
  userPublic: (id) => request(`/users/${id}`),
  userMe: () => request('/users/me'),
  getConversations: () => request('/conversations'),
  createConversation: (peerUserId) => request('/conversations', { method: 'POST', body: { peerUserId } }),
  sendConversationMessage: (id, text) => request(`/conversations/${id}/messages`, { method: 'POST', body: { text } }),
  readConversation: (id) => request(`/conversations/${id}/read`, { method: 'POST' }),

  // жалобы (пользовательская модерация)
  submitReport: (body) => request('/reports', { method: 'POST', body }), // {targetType,targetId,reason}

  // модерация (admin)
  adminReports: () => request('/admin/reports'),
  approveOrg: (id) => request(`/admin/orgs/${id}/approve`, { method: 'POST' }),
  rejectOrg: (id) => request(`/admin/orgs/${id}/reject`, { method: 'POST' }),
  reviewReport: (id) => request(`/admin/reports/${id}/review`, { method: 'POST' }),

  // ── организатор / штаб (Manage HQ) ──
  // Бэкенд отдаёт целочисленные id — стор снимает мок-префиксы перед вызовом.
  orgEvents: () => request('/me/org/events'),
  myApplications: () => request('/me/org/applications'),
  orgVolunteers: () => request('/me/org/volunteers'),
  createApplication: (eventId, body) => request(`/events/${eventId}/applications`, { method: 'POST', body }),
  actOnApplication: (id, action) => request(`/applications/${id}/${action}`, { method: 'POST' }), // action=accept|decline

  // ── админ-панель (под уже существующие и новые роуты) ──
  adminUsers: (page = 1, search = '') => request(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`),
  updateUser: (id, patch) => request(`/admin/users/${id}`, { method: 'PATCH', body: patch }),
  adminStats: () => request('/admin/stats'),
  adminOrgs: (status = 'all') => request(`/admin/orgs?status=${status}`),
  resolveReport: (id) => request(`/admin/reports/${id}/resolve`, { method: 'POST' }),
  adminEvents: (qs = '') => request('/admin/events' + qs),
  unpublishEvent: (id) => request(`/admin/events/${id}/unpublish`, { method: 'POST' }),
  sendBroadcast: (body) => request('/admin/broadcast', { method: 'POST', body }), // {segment, title, textRu, textKz, cityId?}
  adminAnalytics: () => request('/admin/analytics'),
  closeCharity: (id) => request(`/admin/charity/${id}/close`, { method: 'POST' }),

  // ── аккаунт-авторизация (email/пароль) — сосуществует с device-сессией ──
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),        // {identifier, password}
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),   // {identifier|email|nickname, password, full_name}
  refresh: (refreshToken) => request('/auth/refresh', { method: 'POST', bearer: refreshToken }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
};

export { BASE };
