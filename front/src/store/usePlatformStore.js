import { create } from 'zustand';
import { CITIES, ORGS, EVENTS, VOLUNTEERS, ME, BADGES, NOTIFS, CONVOS, CHARITY } from '../lib/data';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const toast = (text) => useUiStore.getState().showToast(text);

// Данные платформы (лента, карта, НКО, рейтинг, помощь, сообщения, уведомления)
// и их интерактивное состояние.
export const usePlatformStore = create((set, get) => ({
  cities: CITIES,
  orgs: ORGS,
  events: EVENTS,
  volunteers: VOLUNTEERS,
  me: ME,
  badges: BADGES,
  notifs: NOTIFS,
  convos: CONVOS,
  charity: CHARITY,

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

  toggleFollow: (id) => set((s) => ({ followed: { ...s.followed, [id]: !s.followed[id] } })),

  markAllRead: () =>
    set((s) => {
      const r = { ...s.notifRead };
      s.notifs.forEach((n) => (r[n.id] = true));
      return { notifRead: r };
    }),

  unreadCount: () => {
    const s = get();
    return s.notifs.filter((n) => !n.read && !s.notifRead[n.id]).length;
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
  },

  donate: () => {
    const { donateId, donateAmt } = get();
    set((s) => ({
      charity: s.charity.map((c) =>
        c.id === donateId
          ? { ...c, raised: Math.min(c.goal, c.raised + (c.kind === 'money' ? donateAmt : 1)) }
          : c
      ),
    }));
    toast(isRu() ? 'Спасибо за помощь!' : 'Көмегіңізге рахмет!');
  },
}));
