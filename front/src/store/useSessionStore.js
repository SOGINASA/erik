import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, setAuth } from '../lib/api';

// Кто я на этом устройстве. Персист: язык и личность (deviceId/имя/телефон).
// token/loggedIn/role живут в памяти — демо начинается с лендинга.
const newDeviceId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'dev-' + Math.random().toString(36).slice(2));

export const useSessionStore = create(
  persist(
    (set, get) => ({
      lang: 'ru',
      deviceId: newDeviceId(),
      name: null,
      phone: null,
      loggedIn: false,
      role: null,
      token: null,

      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === 'ru' ? 'kz' : 'ru' })),
      setRole: (role) => set({ role }),
      setIdentity: (name, phone) => set({ name, phone }),

      // Поднять device-сессию (получить токен). Безопасно к офлайну — на моках работаем и так.
      boot: async () => {
        const { deviceId, name, role } = get();
        setAuth({ deviceId });
        try {
          const res = await api.session({
            deviceId,
            name: name || undefined,
            role: role || undefined,
          });
          setAuth({ token: res.token });
          set({
            token: res.token,
            name: res.user.full_name || name,
            role: res.user.role || role || 'vol',
          });
          return res;
        } catch (_) {
          return null; // бэкенд недоступен — продолжаем на демо-данных
        }
      },

      login: async () => {
        await get().boot();
        set((s) => ({ loggedIn: true, role: s.role || 'vol' }));
      },

      logout: () => {
        setAuth({ token: null });
        set({ loggedIn: false, token: null });
      },
    }),
    {
      name: 'erik-session',
      partialize: (s) => ({ lang: s.lang, deviceId: s.deviceId, name: s.name, phone: s.phone }),
    }
  )
);

// Сразу отдаём deviceId клиенту API (в т.ч. после регидратации persist).
setAuth({ deviceId: useSessionStore.getState().deviceId });
useSessionStore.persist?.onFinishHydration?.(() =>
  setAuth({ deviceId: useSessionStore.getState().deviceId })
);
