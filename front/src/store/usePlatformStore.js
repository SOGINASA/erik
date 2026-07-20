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

// API отдаёт целочисленные id; фронт-экраны ждут строковые id мока ('e1','o1','ch1').
// Адаптер переводит один в другой; мутации снимают префикс обратно.
const numId = (id) => String(id).replace(/^\D+/, '');
const mapEvent = (e) => ({ ...e, id: 'e' + e.id, orgId: e.orgId != null ? 'o' + e.orgId : null });
const mapOrg = (o) => ({ ...o, id: 'o' + o.id });
const mapCharity = (c) => ({ ...c, id: 'ch' + c.id, org: c.org != null ? 'o' + c.org : null });
const mapConvo = (c) => ({
  id: 'c' + c.id, name: c.name, role: c.role,
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
    (willFollow ? api.followOrg(numId(id)) : api.unfollowOrg(numId(id))).catch(() => {});
  },

  // Модерация (admin): жалобы из API (мок-фолбэк), одобрение/отклонение НКО, проверка жалоб.
  loadReports: async () => {
    try {
      const res = await api.adminReports();
      if (Array.isArray(res.reports)) set({ reports: res.reports.map((r) => ({ ...r, id: 'r' + r.id })) });
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

  approveEvent: (eventId) => {
    set((s) => ({ pendingEvents: s.pendingEvents.filter((e) => e.id !== eventId) }));
    toast(isRu() ? 'Сбор одобрен и опубликован' : 'Жиын мақұлданып, жарияланды');
    api.approveEvent(numId(eventId)).catch(() => {});
  },

  rejectEvent: (eventId) => {
    set((s) => ({ pendingEvents: s.pendingEvents.filter((e) => e.id !== eventId) }));
    toast(isRu() ? 'Сбор отклонён' : 'Жиын қабылданбады');
    api.rejectEvent(numId(eventId)).catch(() => {});
  },

  approveOrg: (orgId) => {
    set((s) => ({ orgs: s.orgs.map((o) => (o.id === orgId ? { ...o, verified: true } : o)) }));
    toast(isRu() ? 'Организация одобрена' : 'Ұйым мақұлданды');
    api.approveOrg(numId(orgId)).catch(() => {});
  },

  rejectOrg: (orgId) => {
    set((s) => ({ orgs: s.orgs.filter((o) => o.id !== orgId) }));
    toast(isRu() ? 'Отклонено' : 'Қабылданбады');
    api.rejectOrg(numId(orgId)).catch(() => {});
  },

  reviewReport: (reportId) => {
    set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: 'reviewing' } : r)) }));
    toast(isRu() ? 'Отправлено на проверку' : 'Тексеруге жіберілді');
    api.reviewReport(numId(reportId)).catch(() => {});
  },

  resolveReport: (reportId) => {
    set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: 'resolved' } : r)) }));
    toast(isRu() ? 'Жалоба закрыта' : 'Шағым жабылды');
    api.resolveReport(numId(reportId)).catch(() => {});
  },

  // Закрыть благотворительную кампанию (админ). Модель без статуса → отмечаем достигнутой.
  closeCharity: (charityId) => {
    set((s) => ({ charity: s.charity.map((c) => (c.id === charityId ? { ...c, raised: c.goal, closed: true } : c)) }));
    toast(isRu() ? 'Кампания закрыта' : 'Науқан жабылды');
    api.closeCharity(numId(charityId)).catch(() => {});
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
    api.readNotification(numId(id)).catch(() => {});
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

  sendMsg: (convoId) => {
    const d = (get().msgDraft || '').trim();
    if (!d) return;
    set((s) => ({
      convos: s.convos.map((c) =>
        c.id === convoId ? { ...c, msgs: [...c.msgs, { me: true, txt: d, t: 'сейчас' }] } : c
      ),
      msgDraft: '',
    }));
    api.sendConversationMessage(String(convoId).replace(/^\D+/, ''), d).catch(() => {});
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
    api.donateCharity(numId(donateId), body).catch(() => {});
  },
}));
