import { create } from 'zustand';
import { CITIES, ORGS, EVENTS, VOLUNTEERS, ME, BADGES, CHARITY } from '../lib/data';
import { api } from '../lib/api';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const toast = (text) => useUiStore.getState().showToast(text);

// Грубое относительное время из ISO (для карточек уведомлений).
const rel = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'сейчас';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч';
  return Math.floor(diff / 86400) + ' дн';
};

// API отдаёт целочисленные id; фронт-экраны и роутинг ждут строковые id с мок-префиксом
// ('e1','o1','ch1','c1','r1') — они идут в React-ключи и в URL. map-функции добавляют
// префикс, но РЯДОМ кладут sid — серверный id ВЕРБАТИМ. Мутации шлют в API именно sid,
// снятия префикса (replace) больше нет. У демо-записей из lib/data поля sid нет — это и
// есть явный признак источника (как source:'demo' в useOrganizerStore): по таким записям
// мутации в сеть НЕ уходят, чтобы демо-'o1'/'ch1' не попали в ЧУЖОЙ реальный объект №1.
const mapEvent = (e) => ({ ...e, id: 'e' + e.id, orgId: e.orgId != null ? 'o' + e.orgId : null });
const mapOrg = (o) => ({ ...o, id: 'o' + o.id, sid: o.id });
const mapCharity = (c) => ({ ...c, id: 'ch' + c.id, sid: c.id, org: c.org != null ? 'o' + c.org : null });
const mapConvo = (c) => ({
  id: 'c' + c.id, sid: c.id, name: c.name, role: c.role,
  msgs: (c.msgs || []).map((m) => ({ me: m.me, txt: m.txt, t: rel(m.created_at) })),
});

// Данные платформы (лента, карта, НКО, рейтинг, помощь, сообщения, уведомления)
// и их интерактивное состояние.
export const usePlatformStore = create((set, get) => ({
  cities: CITIES,
  orgs: ORGS,
  events: EVENTS,
  volunteers: VOLUNTEERS,
  me: ME,
  badges: BADGES,
  // Уведомления и диалоги — профильные: гостю их не грузим и НЕ показываем мок.
  // Реальные приходят из API (loadNotifications/loadConversations) после входа.
  notifs: [],
  convos: [],
  charity: CHARITY,
  reports: [], // жалобы приходят только из API (loadReports); без выдуманных записей
  pendingEvents: [],   // сборы, ожидающие модерации админом (для AdminModeration)
  myEvents: [],        // события, на которые волонтёр записался (для «Мои мероприятия»)

  followed: {},
  notifRead: {},
  fCity: 'all',
  fTheme: 'all',
  fFormat: 'all',
  leaderTab: 'vol',
  donateId: 'ch1',
  donateAmt: 2000,
  msgDraft: '',

  setFeedFilter: (patch) => set(patch),
  setLeaderTab: (leaderTab) => set({ leaderTab }),
  setDonateAmt: (donateAmt) => set({ donateAmt }),
  setDonateId: (donateId) => set({ donateId }),
  setMsgDraft: (msgDraft) => set({ msgDraft }),

  // Обновить счётчик «идут» у события ленты после RSVP (оптимистично / по ответу сервера).
  setEventGoing: (eventId, going) => set((s) => ({
    events: s.events.map((e) => (e.id === eventId ? { ...e, going } : e)),
  })),

  // Загрузка платформы из API (мок-фолбэк: пусто/офлайн — остаёмся на демо-данных).
  loadPlatform: async () => {
    const jobs = [
      ['cities', api.getCities(), 'cities', null],
      ['orgs', api.getOrgs(), 'orgs', mapOrg],
      ['events', api.getEvents(), 'events', mapEvent],
      ['volunteers', api.leaderboardVolunteers(), 'volunteers', null],
      ['charity', api.getCharity(), 'charity', mapCharity],
      ['badges', api.getBadges(), 'badges', null],
    ];
    await Promise.allSettled(
      jobs.map(async ([key, p, respKey, mapFn]) => {
        try {
          const res = await p;
          const arr = res[respKey];
          // Успех (даже пустой массив) заменяет мок; мок остаётся только при ошибке/офлайне.
          if (Array.isArray(arr)) set({ [key]: mapFn ? arr.map(mapFn) : arr });
        } catch (_) {
          /* офлайн/ошибка — оставляем демо-данные */
        }
      })
    );
  },

  loadFollows: async () => {
    try {
      const res = await api.myFollows();
      const map = {};
      (res.follows || []).forEach((id) => { map['o' + id] = true; });
      set({ followed: map });
    } catch (_) {
      /* keep mock */
    }
  },

  // Профиль текущего пользователя (реальные часы/надёжность/бейджи/история).
  // Мок остаётся, только если пользователь без имени (сохраняем демо-ME).
  loadMe: async () => {
    try {
      const res = await api.userMe();
      if (res.user && res.user.name) {
        set({ me: { ...res.user, historyRu: res.user.history || [] } });
      }
    } catch (_) {
      /* keep mock */
    }
  },

  toggleFollow: (id) => {
    const willFollow = !get().followed[id];
    set((s) => ({ followed: { ...s.followed, [id]: willFollow } }));
    // sid есть только у серверной НКО (mapOrg); демо-НКО (офлайн-фолбэк) в API не шлём.
    const org = get().orgs.find((o) => o.id === id);
    if (org && org.sid != null) {
      (willFollow ? api.followOrg(org.sid) : api.unfollowOrg(org.sid)).catch(() => {});
    }
  },

  // Модерация (admin): жалобы из API (мок-фолбэк), одобрение/отклонение НКО, проверка жалоб.
  loadReports: async () => {
    try {
      const res = await api.adminReports();
      if (Array.isArray(res.reports)) set({ reports: res.reports.map((r) => ({ ...r, id: 'r' + r.id, sid: r.id })) });
    } catch (_) {
      /* не админ/офлайн — оставляем демо-жалобы */
    }
  },

  // Сборы на модерации (admin): очередь, одобрение (→ публикуем в ленту) и отклонение.
  loadPendingEvents: async () => {
    try {
      const res = await api.adminEvents('?status=pending');
      if (Array.isArray(res.events)) set({ pendingEvents: res.events });
    } catch (_) {
      /* не админ/офлайн */
    }
  },

  // Пересобрать ленту событий из API (после одобрения сбора — чтобы он сразу появился).
  loadEvents: async () => {
    try {
      const res = await api.getEvents();
      if (Array.isArray(res.events)) set({ events: res.events.map(mapEvent) });
    } catch (_) { /* офлайн — оставляем как есть */ }
  },

  // Отклонение сбора живёт в AdminModeration.doReject (спрашивает причину и шлёт её в тело
  // POST .../reject). Одобрение — здесь: НЕ глотаем ошибку (иначе админ думает «одобрено», а
  // на бэк не ушло и сбор навсегда виснет в pending) и рефетчим ленту, чтобы он появился.
  approveEvent: async (eventId) => {
    const ev = get().pendingEvents.find((e) => e.id === eventId);
    set((s) => ({ pendingEvents: s.pendingEvents.filter((e) => e.id !== eventId) }));
    try {
      await api.approveEvent(eventId);   // id вербатим (adminEvents отдаёт числовой id)
      toast(isRu() ? 'Сбор одобрен и опубликован' : 'Жиын мақұлданып, жарияланды');
      get().loadEvents();                // одобренный сбор теперь в ленте
    } catch (_) {
      if (ev) set((s) => ({ pendingEvents: [ev, ...s.pendingEvents.filter((e) => e.id !== ev.id)] }));
      toast(isRu() ? 'Не удалось одобрить — попробуйте снова' : 'Мақұлдау мүмкін болмады — қайталаңыз');
    }
  },

  approveOrg: (orgId) => {
    const org = get().orgs.find((o) => o.id === orgId);
    set((s) => ({ orgs: s.orgs.map((o) => (o.id === orgId ? { ...o, verified: true } : o)) }));
    toast(isRu() ? 'Организация одобрена' : 'Ұйым мақұлданды');
    if (org && org.sid != null) api.approveOrg(org.sid).catch(() => {}); // демо-НКО в API не уходит
  },

  rejectOrg: (orgId) => {
    const org = get().orgs.find((o) => o.id === orgId); // sid берём ДО удаления из списка
    set((s) => ({ orgs: s.orgs.filter((o) => o.id !== orgId) }));
    toast(isRu() ? 'Отклонено' : 'Қабылданбады');
    if (org && org.sid != null) api.rejectOrg(org.sid).catch(() => {});
  },

  reviewReport: (reportId) => {
    const rep = get().reports.find((r) => r.id === reportId);
    set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: 'reviewing' } : r)) }));
    toast(isRu() ? 'Отправлено на проверку' : 'Тексеруге жіберілді');
    if (rep && rep.sid != null) api.reviewReport(rep.sid).catch(() => {});
  },

  resolveReport: (reportId) => {
    const rep = get().reports.find((r) => r.id === reportId);
    set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: 'resolved' } : r)) }));
    toast(isRu() ? 'Жалоба закрыта' : 'Шағым жабылды');
    if (rep && rep.sid != null) api.resolveReport(rep.sid).catch(() => {});
  },

  // Закрыть благотворительную кампанию (админ). Модель без статуса → отмечаем достигнутой.
  closeCharity: (charityId) => {
    const item = get().charity.find((c) => c.id === charityId);
    set((s) => ({ charity: s.charity.map((c) => (c.id === charityId ? { ...c, raised: c.goal, closed: true } : c)) }));
    toast(isRu() ? 'Кампания закрыта' : 'Науқан жабылды');
    if (item && item.sid != null) api.closeCharity(item.sid).catch(() => {}); // демо-сбор в API не уходит
  },

  // Реальные уведомления из API; пусто/офлайн — остаёмся на демо-моках.
  loadNotifications: async () => {
    try {
      const res = await api.notifications();
      const list = (res.notifications || []).map((n) => ({
        id: n.id, type: n.type, ru: n.ru, kz: n.kz, read: n.read, time: rel(n.created_at),
      }));
      // Успех (даже пусто) — берём серверные; мок остаётся только при ошибке/офлайне.
      set({ notifs: list, notifRead: {} });
    } catch (_) {
      /* офлайн/ошибка — оставляем демо-уведомления */
    }
  },

  markAllRead: () => {
    set((s) => {
      const r = { ...s.notifRead };
      s.notifs.forEach((n) => (r[n.id] = true));
      return { notifRead: r };
    });
    api.readAllNotifications().catch(() => {});
  },

  // Отметить одно уведомление прочитанным (клик по карточке).
  markRead: (id) => {
    if (get().notifRead[id]) return;
    set((s) => ({ notifRead: { ...s.notifRead, [id]: true } }));
    api.readNotification(id).catch(() => {}); // уведомления только серверные (id: n.id) — id вербатим
  },

  unreadCount: () => {
    const s = get();
    return s.notifs.filter((n) => !n.read && !s.notifRead[n.id]).length;
  },

  loadConversations: async () => {
    try {
      const res = await api.getConversations();
      if (Array.isArray(res.conversations)) set({ convos: res.conversations.map(mapConvo) });
    } catch (_) {
      /* офлайн/ошибка — оставляем демо-диалоги */
    }
  },

  // События, на которые волонтёр записался («Мои мероприятия»). Пусто/офлайн — пустой экран.
  loadMyEvents: async () => {
    try {
      const res = await api.myEvents();
      if (Array.isArray(res.events)) set({ myEvents: res.events });
    } catch (_) {
      /* не залогинен/офлайн — оставляем пусто */
    }
  },

  // Начать (или открыть существующий) диалог с найденным пользователем.
  // Возвращает локальный id диалога ('c'+id) для навигации; null при ошибке/офлайне.
  startConversation: async (peerUserId) => {
    try {
      const res = await api.createConversation(peerUserId);
      if (res && res.conversation) {
        const c = mapConvo(res.conversation);
        set((s) => ({ convos: [c, ...s.convos.filter((x) => x.id !== c.id)] }));
        return c.id;
      }
    } catch (_) { /* офлайн/ошибка */ }
    return null;
  },

  sendMsg: (convoId) => {
    const d = (get().msgDraft || '').trim();
    if (!d) return;
    const convo = get().convos.find((c) => c.id === convoId);
    set((s) => ({
      convos: s.convos.map((c) =>
        c.id === convoId ? { ...c, msgs: [...c.msgs, { me: true, txt: d, t: 'сейчас' }] } : c
      ),
      msgDraft: '',
    }));
    // sid — серверный id диалога ВЕРБАТИМ (mapConvo). Демо-диалога в сторе нет; будь он
    // (без sid) — сообщение в ЧУЖОЙ реальный диалог №1 НЕ ушло бы.
    if (convo && convo.sid != null) api.sendConversationMessage(convo.sid, d).catch(() => {});
  },

  // НКО создаёт сбор помощи — на бэк и в начало списка (карточки на странице «Помощь»).
  createCharity: async (form) => {
    try {
      const res = await api.createCharity(form);
      if (res && res.charity) {
        const c = mapCharity(res.charity);
        set((s) => ({ charity: [c, ...s.charity] }));
        return c;
      }
    } catch (_) {
      toast(isRu() ? 'Не удалось создать сбор помощи' : 'Көмек жинағын құру мүмкін болмады');
    }
    return null;
  },

  donate: () => {
    const { donateId, donateAmt } = get();
    const item = get().charity.find((c) => c.id === donateId);
    set((s) => ({
      charity: s.charity.map((c) =>
        c.id === donateId
          ? { ...c, raised: Math.min(c.goal, c.raised + (c.kind === 'money' ? donateAmt : 1)) }
          : c
      ),
    }));
    toast(isRu() ? 'Спасибо за помощь!' : 'Көмегіңізге рахмет!');
    const body = item && item.kind === 'money' ? { amount: donateAmt } : { quantity: 1 };
    if (item && item.sid != null) api.donateCharity(item.sid, body).catch(() => {}); // демо-сбор в API не уходит
  },
}));
