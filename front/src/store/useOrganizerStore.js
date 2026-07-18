import { create } from 'zustand';
import { buildOrgEvents, buildApplications, buildOrgVolunteers, estimateAttendance } from '../lib/data';
import { api } from '../lib/api';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const toast = (text) => useUiStore.getState().showToast(text);

// Штаб организатора: его сборы, входящие заявки волонтёров и база волонтёров.
// Оптимистичные мутации: сначала локально, затем в API; офлайн — остаёмся на моках.
export const useOrganizerStore = create((set, get) => ({
  events: buildOrgEvents(),
  applications: buildApplications(),
  volunteers: buildOrgVolunteers(),
  volSort: 'reliability', // 'reliability' | 'hours' | 'events'
  reqFilter: 'pending',   // 'pending' | 'all' | 'done'

  // --- производные ---
  // Заявки, ждущие решения организатора.
  pendingCount: () => get().applications.filter((a) => a.status === 'pending').length,

  // Прогноз явки по одному сбору (агрегатная оценка).
  forecastFor: (e) => estimateAttendance(e.yes, e.maybe),

  setVolSort: (volSort) => set({ volSort }),
  setReqFilter: (reqFilter) => set({ reqFilter }),

  // --- загрузка (мягкий фолбэк на моки) ---
  load: async () => {
    await Promise.allSettled([
      (async () => {
        try {
          const res = await api.orgEvents();
          if (Array.isArray(res.events) && res.events.length) set({ events: res.events });
        } catch (_) { /* оставляем демо */ }
      })(),
      (async () => {
        try {
          const res = await api.myApplications();
          if (Array.isArray(res.applications)) set({ applications: res.applications });
        } catch (_) { /* оставляем демо */ }
      })(),
      (async () => {
        try {
          const res = await api.orgVolunteers();
          if (Array.isArray(res.volunteers) && res.volunteers.length) set({ volunteers: res.volunteers });
        } catch (_) { /* оставляем демо */ }
      })(),
    ]);
  },

  // --- решения по заявкам ---
  acceptApplication: (id) => {
    const a = get().applications.find((x) => x.id === id);
    set((s) => ({
      applications: s.applications.map((x) => (x.id === id ? { ...x, status: 'accepted' } : x)),
      // принятый волонтёр пополняет «подтвердивших» своего сбора
      events: a ? s.events.map((e) => (e.id === a.eventId ? { ...e, yes: e.yes + 1, applied: Math.max(0, e.applied - 1) } : e)) : s.events,
    }));
    useUiStore.getState().closeSheet();
    toast(isRu() ? 'Заявка принята' : 'Өтінім қабылданды');
    api.actOnApplication(String(id).replace(/^\D+/, ''), 'accept').catch(() => {});
  },

  declineApplication: (id) => {
    const a = get().applications.find((x) => x.id === id);
    set((s) => ({
      applications: s.applications.map((x) => (x.id === id ? { ...x, status: 'declined' } : x)),
      events: a ? s.events.map((e) => (e.id === a.eventId ? { ...e, applied: Math.max(0, e.applied - 1) } : e)) : s.events,
    }));
    useUiStore.getState().closeSheet();
    toast(isRu() ? 'Заявка отклонена' : 'Өтінім қабылданбады');
    api.actOnApplication(String(id).replace(/^\D+/, ''), 'decline').catch(() => {});
  },

  // Заявка волонтёра из карточки события (встречный поток).
  addApplication: ({ eventId, name, phone, city, skills, message }) => {
    const id = 'a' + Date.now();
    const entry = {
      id, eventId,
      name: (name || '').trim() || (isRu() ? 'Волонтёр' : 'Волонтёр'),
      phone: phone || null,
      city: city || '',
      skills: skills || [],
      messageRu: message || '', messageKz: message || '',
      reliability: null, history: { came: 0, total: 0 },
      agoRu: 'только что', agoKz: 'жаңа ғана',
      status: 'pending',
    };
    set((s) => ({
      applications: [entry, ...s.applications],
      events: s.events.map((e) => (e.id === eventId ? { ...e, applied: e.applied + 1 } : e)),
    }));
    api.createApplication(String(eventId).replace(/^\D+/, ''), { skills: entry.skills, message }).catch(() => {});
    return entry;
  },
}));
