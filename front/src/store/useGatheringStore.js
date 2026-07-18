import { create } from 'zustand';
import { buildGathering } from '../lib/data';
import { forecast, counts } from '../lib/forecast';
import { api } from '../lib/api';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const toast = (text) => useUiStore.getState().showToast(text);

let rafId = null;
let cuFallback = null;
let pollTimer = null;

// marks из отметок явки участников (presence === 'came').
const deriveMarks = (participants = []) => {
  const m = {};
  for (const p of participants) if (p.presence === 'came') m[p.id] = 'came';
  return m;
};

// Слить обновлённые строки (poll) в текущий ростер по id.
const mergeChanged = (current = [], changed = []) => {
  const byId = new Map(current.map((p) => [p.id, p]));
  for (const c of changed) byId.set(c.id, { ...(byId.get(c.id) || {}), ...c });
  return Array.from(byId.values());
};

// Данные текущего сбора + отметки явки + анимация числа прогноза.
// Оптимистичные мутации: сначала локально, затем в API; при офлайне остаёмся на моках.
export const useGatheringStore = create((set, get) => ({
  gathering: buildGathering(),
  marks: {},
  displayE: null,
  polled: false,
  regs: {}, // ответы на события ленты: { [eventId]: 'yes'|'maybe'|'no' }

  // --- производные ---
  forecast: () => forecast(get().gathering.participants || [], get().gathering.ctx),
  counts: () => counts(get().gathering.participants || []),

  // --- загрузка/создание ---
  create: async (form) => {
    const body = {
      what: form.what, where: form.where, date: form.date, time: form.time,
      needed: form.needed, name: (form.name || '').trim() || undefined,
    };
    if (body.name) useSessionStore.getState().setIdentity(body.name, useSessionStore.getState().phone);
    try {
      const res = await api.createGathering(body);
      set({ gathering: res.gathering, marks: deriveMarks(res.gathering.participants), displayE: null, polled: false });
      return res;
    } catch (_) {
      // офлайн-фолбэк: применяем поля к текущему сбору
      set((s) => ({
        gathering: {
          ...s.gathering,
          titleRu: form.what || s.gathering.titleRu, titleKz: form.what || s.gathering.titleKz,
          placeRu: form.where || s.gathering.placeRu, placeKz: form.where || s.gathering.placeKz,
          needed: form.needed,
        },
      }));
      return null;
    }
  },

  loadCoord: async (id) => {
    try {
      // id может прийти как 'e5' из ленты — снимаем префикс
      const res = await api.getGathering(String(id).replace(/^\D+/, ''));
      set({ gathering: res.gathering, marks: deriveMarks(res.gathering.participants), polled: false });
    } catch (_) {
      /* оставляем текущий сбор (мок или прошлую загрузку) */
    }
  },

  loadRegistrations: async () => {
    try {
      const res = await api.myRegistrations();
      const map = {};
      Object.entries(res.registrations || {}).forEach(([gid, ans]) => { map['e' + gid] = ans; });
      if (Object.keys(map).length) set({ regs: map });
    } catch (_) {
      /* keep mock */
    }
  },

  loadGuest: async (code) => {
    try {
      const res = await api.guestView(code);
      set({ gathering: { ...res.gathering, participants: res.gathering.participants || [] } });
    } catch (_) {
      /* оставляем мок */
    }
  },

  rsvp: async (code, answer) => {
    try {
      const res = await api.putRsvp(code, answer);
      set((s) => ({ gathering: { ...s.gathering, comingCount: res.comingCount, myAnswer: answer } }));
      return res;
    } catch (_) {
      return null;
    }
  },

  // --- мутации сбора (оптимистично + API) ---
  changeAnswerFor: (id, a) => {
    set((s) => ({
      gathering: {
        ...s.gathering,
        participants: s.gathering.participants.map((p) => (p.id === id ? { ...p, answer: a } : p)),
      },
    }));
    const p = get().gathering.participants.find((x) => x.id === id);
    if (p) useUiStore.getState().setSheetPayload(p);
    get().animateForecast(false);
    api.setAnswer(get().gathering.id, id, a).catch(() => {});
  },

  toggleMark: (id) => {
    const willMark = !get().marks[id];
    set((s) => {
      const m = { ...s.marks };
      if (willMark) m[id] = 'came';
      else delete m[id];
      return {
        marks: m,
        gathering: {
          ...s.gathering,
          participants: s.gathering.participants.map((p) => (p.id === id ? { ...p, presence: willMark ? 'came' : null } : p)),
        },
      };
    });
    const gid = get().gathering.id;
    api.setPresence(gid, id, willMark, `m-${gid}-${id}`).catch(() => {});
  },

  addGuestMark: async (name) => {
    const nm = (name || '').trim();
    if (!nm) return;
    const gid = get().gathering.id;
    const tempId = 'g' + Date.now();
    set((s) => ({
      gathering: {
        ...s.gathering,
        participants: [
          ...s.gathering.participants,
          { id: tempId, name: nm, phone: null, answer: 'yes', presence: 'came', isGuest: true, history: { total: 0, came: 0 } },
        ],
      },
      marks: { ...s.marks, [tempId]: 'came' },
    }));
    toast(isRu() ? 'Добавлен и отмечен' : 'Қосылды және белгіленді');
    try {
      const res = await api.addGuest(gid, { name: nm, present: true, clientMarkId: 'g-' + tempId });
      const real = res.participant;
      set((s) => {
        const m = { ...s.marks };
        delete m[tempId];
        m[real.id] = 'came';
        return {
          gathering: {
            ...s.gathering,
            participants: s.gathering.participants.map((p) => (p.id === tempId ? { ...p, id: real.id } : p)),
          },
          marks: m,
        };
      });
    } catch (_) {
      /* остаёмся с временным id */
    }
  },

  removeParticipant: (id) => {
    set((s) => ({
      gathering: { ...s.gathering, participants: s.gathering.participants.filter((p) => p.id !== id) },
    }));
    toast(isRu() ? 'Убран из сбора' : 'Жиыннан алынды');
    api.removeParticipant(get().gathering.id, id).catch(() => {});
  },

  finishGathering: () => {
    set((s) => {
      const parts = s.gathering.participants.map((p) => ({
        ...p,
        presence: s.marks[p.id] ? 'came' : p.answer !== 'no' ? 'missed' : null,
      }));
      return { gathering: { ...s.gathering, participants: parts, status: 'done' } };
    });
    toast(isRu() ? 'Сбор завершён' : 'Жиын аяқталды');
    api.finalize(get().gathering.id).catch(() => {});
  },

  deleteGathering: () => {
    toast(isRu() ? 'Сбор удалён' : 'Жиын жойылды');
    api.deleteGathering(get().gathering.id).catch(() => {});
  },

  saveGathering: () => {
    const g = get().gathering;
    api.patchGathering(g.id, { what: g.titleRu, where: g.placeRu, needed: g.needed }).catch(() => {});
    toast(isRu() ? 'Изменения сохранены' : 'Өзгерістер сақталды');
  },

  remind: async (text, audience = 'maybe') => {
    try {
      return await api.remind(get().gathering.id, { audience, text_ru: text, text_kz: text });
    } catch (_) {
      return null;
    }
  },

  setNeeded: (n) => set((s) => ({ gathering: { ...s.gathering, needed: Math.max(1, Math.min(200, n)) } })),
  incNeeded: () => set((s) => ({ gathering: { ...s.gathering, needed: Math.min(200, s.gathering.needed + 1) } })),
  decNeeded: () => set((s) => ({ gathering: { ...s.gathering, needed: Math.max(1, s.gathering.needed - 1) } })),
  setTitle: (v) => set((s) => ({ gathering: { ...s.gathering, titleRu: v, titleKz: v } })),
  setPlace: (v) => set((s) => ({ gathering: { ...s.gathering, placeRu: v, placeKz: v } })),

  registerEvent: (eventId, a) => {
    set((s) => ({ regs: { ...s.regs, [eventId]: a } }));
    toast(isRu() ? 'Ответ сохранён' : 'Жауап сақталды');
    api.setEventReg(String(eventId).replace(/^\D+/, ''), a).catch(() => {});
  },

  // --- анимация числа прогноза ---
  animateForecast: (fromZero) => {
    const target = get().forecast().E;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      set({ displayE: target });
      return;
    }
    if (rafId) cancelAnimationFrame(rafId);
    if (cuFallback) clearTimeout(cuFallback);
    const cur = get().displayE;
    const from = fromZero ? 0 : cur == null ? target : cur;
    const dur = fromZero ? 640 : 420;
    const start = performance.now();
    set({ displayE: from });
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) set({ displayE: target });
      else {
        set({ displayE: from + (target - from) * e });
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    cuFallback = setTimeout(() => set({ displayE: target }), dur + 240);
  },

  // --- реальный polling каждые 10с (delta по revision) ---
  startPoll: () => {
    if (pollTimer) clearTimeout(pollTimer);
    const tick = async () => {
      const g = get().gathering;
      const since = g.revision == null ? -1 : g.revision;
      try {
        const res = await api.poll(g.id, since);
        if (res && res.changed && res.changed.length) {
          set((s) => ({
            gathering: { ...s.gathering, participants: mergeChanged(s.gathering.participants, res.changed), revision: res.revision },
          }));
          get().animateForecast(false);
        } else if (res && typeof res.revision === 'number') {
          set((s) => ({ gathering: { ...s.gathering, revision: res.revision } }));
        }
      } catch (_) {
        /* офлайн — тихо ждём следующего тика */
      }
      pollTimer = setTimeout(tick, 10000);
    };
    pollTimer = setTimeout(tick, 10000);
  },
  stopPoll: () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  },
}));
