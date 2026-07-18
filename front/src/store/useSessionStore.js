import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Кто я на этом устройстве. Персист: язык и личность (deviceId/имя/телефон).
// loggedIn и role живут в памяти — демо всегда начинается с лендинга.
const newDeviceId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'dev-' + Math.random().toString(36).slice(2));

export const useSessionStore = create(
  persist(
    (set) => ({
      lang: 'ru',
      deviceId: newDeviceId(),
      name: null,
      phone: null,
      loggedIn: false,
      role: null,

      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === 'ru' ? 'kz' : 'ru' })),
      setRole: (role) => set({ role }),
      setIdentity: (name, phone) => set({ name, phone }),
      login: () => set((s) => ({ loggedIn: true, role: s.role || 'vol' })),
      logout: () => set({ loggedIn: false }),
    }),
    {
      name: 'erik-session',
      partialize: (s) => ({ lang: s.lang, deviceId: s.deviceId, name: s.name, phone: s.phone }),
    }
  )
);
