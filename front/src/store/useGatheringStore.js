import { create } from 'zustand';
import { buildGathering } from '../lib/data';
import { forecast, counts } from '../lib/forecast';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const toast = (text) => useUiStore.getState().showToast(text);

let rafId = null;
let cuFallback = null;
let pollTimer = null;

// Данные текущего сбора + отметки явки + анимация числа прогноза.
export const useGatheringStore = create((set, get) => ({
  gathering: buildGathering(),
  marks: {},
  displayE: null,
  polled: false,
  regs: {}, // ответы на события ленты: { [eventId]: 'yes'|'maybe'|'no' }

  // --- производные ---
  forecast: () => forecast(get().gathering.participants, get().gathering.ctx),
  counts: () => counts(get().gathering.participants),

  // --- мутации сбора ---
  changeAnswerFor: (id, a) => {
    set((s) => ({
      gathering: {
        ...s.gathering,
        participants: s.gathering.participants.map((p) => (p.id === id ? { ...p, answer: a } : p)),
      },
      sheetPayload_: null,
    }));
    const p = get().gathering.participants.find((x) => x.id === id);
    if (p) useUiStore.getState().setSheetPayload(p);
    get().animateForecast(false);
  },

  toggleMark: (id) =>
    set((s) => {
      const m = { ...s.marks };
      if (m[id]) delete m[id];
      else m[id] = 'came';
      return { marks: m };
    }),

  addGuestMark: (name) => {
    const nm = (name || '').trim();
    if (!nm) return;
    const id = 'g' + Date.now();
    set((s) => ({
      gathering: {
        ...s.gathering,
        participants: [
          ...s.gathering.participants,
          { id, name: nm, phone: null, answer: 'yes', presence: 'came', history: { total: 0, came: 0 } },
        ],
      },
      marks: { ...s.marks, [id]: 'came' },
    }));
    toast(isRu() ? 'Добавлен и отмечен' : 'Қосылды және белгіленді');
  },

  removeParticipant: (id) => {
    set((s) => ({
      gathering: { ...s.gathering, participants: s.gathering.participants.filter((p) => p.id !== id) },
    }));
    toast(isRu() ? 'Убран из сбора' : 'Жиыннан алынды');
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
  },

  deleteGathering: () => {
    toast(isRu() ? 'Сбор удалён' : 'Жиын жойылды');
  },

  setNeeded: (n) => set((s) => ({ gathering: { ...s.gathering, needed: Math.max(1, Math.min(200, n)) } })),
  incNeeded: () => set((s) => ({ gathering: { ...s.gathering, needed: Math.min(200, s.gathering.needed + 1) } })),
  decNeeded: () => set((s) => ({ gathering: { ...s.gathering, needed: Math.max(1, s.gathering.needed - 1) } })),
  setTitle: (v) => set((s) => ({ gathering: { ...s.gathering, titleRu: v, titleKz: v } })),
  setPlace: (v) => set((s) => ({ gathering: { ...s.gathering, placeRu: v, placeKz: v } })),

  registerEvent: (eventId, a) => {
    set((s) => ({ regs: { ...s.regs, [eventId]: a } }));
    toast(isRu() ? 'Ответ сохранён' : 'Жауап сақталды');
  },

  // --- анимация числа прогноза (единственная «дорогая» анимация продукта) ---
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

  // --- polling: раз имитируем новый ответ (maybe -> yes) ---
  startPoll: () => {
    if (get().polled) return;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => {
      let name = '';
      set((s) => {
        const parts = s.gathering.participants.slice();
        const idx = parts.findIndex((x) => x.answer === 'maybe');
        if (idx < 0) return { polled: true };
        name = parts[idx].name;
        parts[idx] = { ...parts[idx], answer: 'yes' };
        return { gathering: { ...s.gathering, participants: parts }, polled: true };
      });
      if (name) {
        get().animateForecast(false);
        toast(isRu() ? name + ' теперь придёт' : name + ' енді келеді');
      }
    }, 5200);
  },
  stopPoll: () => {
    if (pollTimer) clearTimeout(pollTimer);
  },
}));
