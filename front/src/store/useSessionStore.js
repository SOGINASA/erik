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
      // Аккаунт-авторизация (email/пароль). Сосуществует с device-личностью:
      // device — якорь; аккаунт добавляет user_type (для гейта админки) и refresh.
      userType: null,          // user | admin
      refreshToken: null,

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

      // Вход по паролю (аккаунт). Бросает при 401 — Login.submit ловит и тостит.
      // deviceId остаётся (X-Device-Id), сверху ставим account-токен.
      loginWithPassword: async ({ identifier, password }) => {
        setAuth({ deviceId: get().deviceId });
        const res = await api.login({ identifier, password });
        setAuth({ token: res.access_token });
        set((s) => ({
          token: res.access_token,
          refreshToken: res.refresh_token || null,
          loggedIn: true,
          userType: (res.user && res.user.user_type) || 'user',
          role: (res.user && res.user.role) || s.role || 'vol',
          name: (res.user && res.user.full_name) || s.name,
        }));
        return res;
      },

      // Регистрация аккаунта. identifier — email ИЛИ nickname (бэк разберёт).
      registerAccount: async ({ identifier, email, nickname, password, full_name }) => {
        setAuth({ deviceId: get().deviceId });
        const res = await api.register({ identifier, email, nickname, password, full_name });
        setAuth({ token: res.access_token });
        set((s) => ({
          token: res.access_token,
          refreshToken: res.refresh_token || null,
          loggedIn: true,
          userType: (res.user && res.user.user_type) || 'user',
          role: (res.user && res.user.role) || s.role || 'vol',
          name: (res.user && res.user.full_name) || full_name || s.name,
        }));
        return res;
      },

      logout: () => {
        setAuth({ token: null });
        set({ loggedIn: false, token: null, userType: null, refreshToken: null });
      },
    }),
    {
      name: 'erik-session',
      // refreshToken/userType переживают перезагрузку (device-токен по-прежнему опускаем —
      // демо стартует с лендинга и переподнимает device-сессию через boot()).
      partialize: (s) => ({
        lang: s.lang, deviceId: s.deviceId, name: s.name, phone: s.phone,
        refreshToken: s.refreshToken, userType: s.userType,
      }),
    }
  )
);

// Сразу отдаём deviceId клиенту API (в т.ч. после регидратации persist).
setAuth({ deviceId: useSessionStore.getState().deviceId });
useSessionStore.persist?.onFinishHydration?.(() =>
  setAuth({ deviceId: useSessionStore.getState().deviceId })
);
