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

// --- офлайн-отметка явки: очередь операций + снапшот сбора в localStorage (ТЗ §5.5) ---
const CI_Q = (gid) => `erik-ci-q-${gid}`;   // очередь несинканных отметок
const CI_G = (gid) => `erik-ci-g-${gid}`;   // снапшот сбора (для перезагрузки офлайн)
const readJSON = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* quota */ } };
const dropKey = (k) => { try { localStorage.removeItem(k); } catch (_) { /* noop */ } };
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
// op = { clientMarkId, pid?, present, ts, guestName? }; дедуп по clientMarkId (последнее состояние).
const upsertOp = (queue, op) => {
  const i = queue.findIndex((x) => x.clientMarkId === op.clientMarkId);
  const n = queue.slice();
  if (i >= 0) n[i] = op; else n.push(op);
  return n;
};

// Данные текущего сбора + отметки явки + анимация числа прогноза.
// Оптимистичные мутации: сначала локально, затем в API; при офлайне остаёмся на моках.
export const useGatheringStore = create((set, get) => ({
  gathering: buildGathering(),
  marks: {},
  displayE: null,
  polled: false,
  regs: {}, // ответы на события ленты: { [eventId]: 'yes'|'maybe'|'no' }
  mlForecast: null, // компаньон-прогноз ML: { available, expected, participants[] } | { available:false }
  checkinQueue: [], // несинканные офлайн-отметки явки
  syncing: false,   // идёт batch-синк
  online: isOnline(),

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
    set({ mlForecast: null }); // сбрасываем ML прошлого сбора
    const numeric = String(id).replace(/^\D+/, ''); // 'e5' из ленты → '5'
    try {
      const res = await api.getGathering(numeric);
      const gid = res.gathering.id;
      const queue = readJSON(CI_Q(gid), []);
      // накатываем несинканные офлайн-отметки поверх серверной правды
      let participants = res.gathering.participants;
      for (const op of queue) {
        if (op.pid != null) participants = participants.map((p) => (p.id === op.pid ? { ...p, presence: op.present ? 'came' : null } : p));
      }
      const gathering = { ...res.gathering, participants };
      writeJSON(CI_G(gid), gathering); // снапшот для перезагрузки офлайн
      set({ gathering, marks: deriveMarks(participants), checkinQueue: queue, polled: false });
      if (queue.length) get().flushCheckin();
    } catch (_) {
      // офлайн: восстанавливаем сбор и очередь из localStorage
      const snap = readJSON(CI_G(numeric), null);
      if (snap) set({ gathering: snap, marks: deriveMarks(snap.participants), checkinQueue: readJSON(CI_Q(numeric), []) });
    }
  },

  // Компаньон-прогноз ML (обучаемая модель). Мягко: недоступна → { available:false }.
  loadMlForecast: async () => {
    try {
      const r = await api.mlForecast(String(get().gathering.id).replace(/^\D+/, ''));
      set({ mlForecast: r });
    } catch (_) {
      set({ mlForecast: { available: false } });
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

  // Отметка явки — офлайн-first: пишем в очередь (localStorage), затем пытаемся синкнуть.
  toggleMark: (id) => {
    const willMark = !get().marks[id];
    const gid = get().gathering.id;
    set((s) => {
      const m = { ...s.marks };
      if (willMark) m[id] = 'came'; else delete m[id];
      const participants = s.gathering.participants.map((p) => (p.id === id ? { ...p, presence: willMark ? 'came' : null } : p));
      const q = upsertOp(s.checkinQueue, { clientMarkId: `m-${gid}-${id}`, pid: id, present: willMark, ts: Date.now() });
      writeJSON(CI_Q(gid), q);
      const gathering = { ...s.gathering, participants };
      writeJSON(CI_G(gid), gathering);
      return { marks: m, gathering, checkinQueue: q };
    });
    get().flushCheckin();
  },

  addGuestMark: (name) => {
    const nm = (name || '').trim();
    if (!nm) return;
    const gid = get().gathering.id;
    const tempId = 'g' + Date.now();
    const cmid = 'g-' + tempId;
    set((s) => {
      const q = upsertOp(s.checkinQueue, { clientMarkId: cmid, guestName: nm, present: true, ts: Date.now() });
      writeJSON(CI_Q(gid), q);
      const gathering = {
        ...s.gathering,
        participants: [
          ...s.gathering.participants,
          { id: tempId, name: nm, phone: null, answer: 'yes', presence: 'came', isGuest: true, history: { total: 0, came: 0 }, cmid },
        ],
      };
      writeJSON(CI_G(gid), gathering);
      return { gathering, marks: { ...s.marks, [tempId]: 'came' }, checkinQueue: q };
    });
    toast(isRu() ? 'Добавлен и отмечен' : 'Қосылды және белгіленді');
    get().flushCheckin();
  },

  // Синк очереди отметок идемпотентным batch-эндпоинтом. Гости: temp id → реальный pid.
  flushCheckin: async () => {
    const st = get();
    if (st.syncing || !st.checkinQueue.length || !isOnline()) return;
    const gid = st.gathering.id;
    const flushed = new Set(st.checkinQueue.map((o) => o.clientMarkId));
    set({ syncing: true });
    try {
      const res = await api.presenceBatch(gid, st.checkinQueue, st.gathering.revision);
      set((s) => {
        let participants = s.gathering.participants;
        const marks = { ...s.marks };
        for (const a of res.applied || []) {
          if (a.clientMarkId && a.clientMarkId.startsWith('g-')) {
            participants = participants.map((p) => (p.cmid === a.clientMarkId ? { ...p, id: a.pid, cmid: undefined } : p));
            const tempId = a.clientMarkId.slice(2);
            if (marks[tempId]) { delete marks[tempId]; marks[a.pid] = 'came'; }
          }
        }
        const remaining = s.checkinQueue.filter((o) => !flushed.has(o.clientMarkId));
        writeJSON(CI_Q(gid), remaining);
        const gathering = { ...s.gathering, participants, revision: typeof res.revision === 'number' ? res.revision : s.gathering.revision };
        writeJSON(CI_G(gid), gathering);
        return { gathering, marks, checkinQueue: remaining, syncing: false };
      });
      if (get().checkinQueue.length) get().flushCheckin(); // накопилось за время синка
    } catch (_) {
      set({ syncing: false }); // офлайн — очередь ждёт события 'online'
    }
  },

  removeParticipant: (id) => {
    set((s) => ({
      gathering: { ...s.gathering, participants: s.gathering.participants.filter((p) => p.id !== id) },
    }));
    toast(isRu() ? 'Убран из сбора' : 'Жиыннан алынды');
    api.removeParticipant(get().gathering.id, id).catch(() => {});
  },

  finishGathering: async () => {
    await get().flushCheckin(); // синкаем отметки ПЕРЕД финализацией
    set((s) => {
      const parts = s.gathering.participants.map((p) => ({
        ...p,
        presence: s.marks[p.id] ? 'came' : p.answer !== 'no' ? 'missed' : null,
      }));
      return { gathering: { ...s.gathering, participants: parts, status: 'done' } };
    });
    toast(isRu() ? 'Сбор завершён' : 'Жиын аяқталды');
    const gid = get().gathering.id;
    dropKey(CI_Q(gid)); dropKey(CI_G(gid)); // сбор закрыт — чистим офлайн-кэш
    api.finalize(gid).catch(() => {});
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

// Появилась сеть → флашим офлайн-очередь отметок; пропала → помечаем офлайн.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useGatheringStore.setState({ online: true });
    useGatheringStore.getState().flushCheckin();
  });
  window.addEventListener('offline', () => useGatheringStore.setState({ online: false }));
}
