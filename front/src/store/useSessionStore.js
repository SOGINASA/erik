import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, setAuth, onAuthRefresh } from '../lib/api';

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
      // Доступ к админке: реальный аккаунт-админ (userType) или явный демо-вход (role='admin').
      isAdmin: () => {
        const s = get();
        return s.userType === 'admin' || s.role === 'admin';
      },

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
          setAuth({ token: res.token, refreshToken: res.refreshToken || null });
          set({
            token: res.token,
            refreshToken: res.refreshToken || null,
            name: res.user.full_name || name,
            role: res.user.role || role || 'vol',
            userType: res.user.user_type || null,   // для гейта админки (demo-coord = 'admin')
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
        setAuth({ token: res.access_token, refreshToken: res.refresh_token || null });
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
      // role/phone/cityId дозаполняются в профиль через PATCH /me (у /auth/register их нет).
      registerAccount: async ({ identifier, email, nickname, password, full_name, role, phone, cityId }) => {
        setAuth({ deviceId: get().deviceId });
        const res = await api.register({ identifier, email, nickname, password, full_name });
        setAuth({ token: res.access_token, refreshToken: res.refresh_token || null });
        set((s) => ({
          token: res.access_token,
          refreshToken: res.refresh_token || null,
          loggedIn: true,
          userType: (res.user && res.user.user_type) || 'user',
          role: role || (res.user && res.user.role) || s.role || 'vol',
          name: (res.user && res.user.full_name) || full_name || s.name,
          phone: phone || s.phone,
        }));
        // профильные данные онбординга (город/роль/телефон) — в свой профиль
        const patch = {};
        if (role) patch.role = role;
        if (phone) patch.phone = phone;
        if (cityId) patch.cityId = cityId;
        if (Object.keys(patch).length) {
          try { await api.updateMe(patch); } catch (_) { /* не блокируем регистрацию */ }
        }
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

// Сразу отдаём deviceId и (регидратированный) refreshToken клиенту API.
setAuth({ deviceId: useSessionStore.getState().deviceId, refreshToken: useSessionStore.getState().refreshToken });
useSessionStore.persist?.onFinishHydration?.(() =>
  setAuth({ deviceId: useSessionStore.getState().deviceId, refreshToken: useSessionStore.getState().refreshToken })
);
// Обновлённый по refresh access-токен пробрасываем обратно в стор.
onAuthRefresh((token) => useSessionStore.setState({ token }));
