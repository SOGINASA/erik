import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, setAuth, onAuthRefresh } from '../lib/api';

// Кто я на этом устройстве. Персист: язык, личность (deviceId/имя/телефон) и сама
// сессия (loggedIn/role/token) — чтобы F5 не выкидывал из /manage. userType — в памяти.
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
      booted: false,           // boot() ответил; до этого userType ещё не известен
      roleDirty: false,        // роль выбрана в онбординге и ещё не доехала до бэка

      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === 'ru' ? 'kz' : 'ru' })),
      setRole: (role) => set({ role, roleDirty: true }),
      setIdentity: (name, phone) => set({ name, phone }),
      // Доступ к админке: реальный аккаунт-админ (userType) или явный демо-вход (role='admin').
      isAdmin: () => {
        const s = get();
        return s.userType === 'admin' || s.role === 'admin';
      },

      // Готова ли сессия для профильных запросов. Зеркалит серверный
      // User.has_profile: нужен токен И непустое имя — иначе @profiled_required
      // ответит 403 «Заполните имя», а мёртвый токен (юзера удалили/база
      // пересоздана) — 404 «Пользователь не найден».
      //
      // loggedIn для этого не годится: он ПЕРСИСТИТСЯ, поэтому после F5 страницы
      // монтируются с loggedIn=true ещё до ответа boot() и успевают дёрнуть
      // /me/events, /gatherings/mine, /me/orgs старым токеном — пачкой 403/404
      // в консоли. Тот же предикат уже стоит в App.jsx на профильных загрузках.
      hasProfile: () => {
        const s = get();
        return !!s.token && !!(s.name || '').trim();
      },

      // Поднять сессию. Безопасно к офлайну — на моках работаем и так.
      // Персистнутый токен на первом boot() (booted=false) рехайдрируем через GET /me:
      // кто мы — решает JWT. POST /session нашёл бы юзера по deviceId и подменил бы
      // аккаунт-вход device-личностью: /auth/login device_id к аккаунту не привязывает
      // (routes/auth.py, только register), так что это была бы другая строка User.
      // Гостевая сессия не отправляет имя/роль из локального хранилища:
      // создание профиля требует явных подтверждений при регистрации.
      boot: async () => {
        const { deviceId, name, role, token, booted } = get();
        setAuth({ deviceId });
        if (!token && !name) {
          set({ loggedIn: false, booted: true });
          return null;
        }
        if (!booted && token) {
          try {
            const res = await api.me();
            set({
              name: res.user.full_name || name,
              role: res.user.role || role || 'vol',
              userType: res.user.user_type || null,   // вернули из токена, а не из deviceId
              booted: true,
            });
            return res;
          } catch (e) {
            // Бэкенд не ответил или сломался (сетевая ошибка / 5xx) — про личность мы ничего
            // не узнали. Состояние не трогаем и на device-путь НЕ падаем: POST /session нашёл
            // бы юзера по deviceId и подменил бы личность (ровно то, чего избегаем).
            if (!e || (e.status !== 401 && e.status !== 422 && e.status !== 404)) {
              set({ booted: true });
              return null;
            }
            // Отвергнутый токен не заменяем новой device-личностью.
            setAuth({ token: null, refreshToken: null });
            set({ loggedIn: false, token: null, refreshToken: null, userType: null,
              name: null, phone: null, role: null, roleDirty: false, booted: true });
            return null;
          }
        }
        try {
          const res = await api.session({ deviceId });
          setAuth({ token: res.token, refreshToken: res.refreshToken || null });
          set({
            token: res.token,
            refreshToken: res.refreshToken || null,
            name: res.user.full_name || null,
            loggedIn: !!res.user.full_name,
            role: res.user.role || role || 'vol',
            userType: res.user.user_type || null,   // для гейта админки (demo-coord = 'admin')
            roleDirty: false,
          });
          return res;
        } catch (_) {
          return null; // бэкенд недоступен — продолжаем на демо-данных
        } finally {
          set({ booted: true });
        }
      },

      login: async () => {
        const res = await get().boot();
        if (!res?.user?.full_name || !get().token) throw new Error('Зарегистрируйтесь, чтобы продолжить.');
        set((s) => ({ loggedIn: true, role: s.role || 'vol' }));
      },

      // Демо-вход как конкретная засеянная личность (по её deviceId): demo-coord (админ+
      // координатор), demo-v0 (волонтёр), demo-org1 (НКО). Токен — этой личности, поэтому
      // роль/user_type/имя приходят с бэка настоящими (в т.ч. admin для demo-coord).
      // deviceId устройства НЕ подменяем (остаётся в persist) — переопределяем лишь тело сессии.
      loginAsDevice: async (deviceId) => {
        const res = await api.session({ deviceId });
        setAuth({ token: res.token, refreshToken: res.refreshToken || null });
        set({
          token: res.token,
          refreshToken: res.refreshToken || null,
          loggedIn: true,
          userType: res.user.user_type || 'user',
          role: res.user.role || 'vol',
          name: res.user.full_name || null,
        });
        return res;
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

      // Профиль и журнал подтверждений создаются одним запросом. До успеха
      // сервера форма (в том числе пароль) не попадает в сохраняемый стор.
      registerAccount: async ({ identifier, email, nickname, password, full_name, role, phone, cityId, interests, legal }) => {
        setAuth({ deviceId: get().deviceId });
        const res = await api.register({ identifier, email, nickname, password, full_name, role, phone, cityId, interests, legal });
        setAuth({ token: res.access_token, refreshToken: res.refresh_token || null });
        set((s) => ({
          token: res.access_token,
          refreshToken: res.refresh_token || null,
          loggedIn: true,
          userType: (res.user && res.user.user_type) || 'user',
          role: (res.user && res.user.role) || role || 'vol',
          name: (res.user && res.user.full_name) || full_name || s.name,
          phone: (res.user && res.user.phone) || phone || null,
          roleDirty: false,
          booted: true,
        }));
        return res;
      },

      // Выход → чистое гостевое состояние. deviceId ПЕРЕВЫПУСКАЕМ: со старым boot() на
      // следующем запуске (POST /session по сохранённому deviceId) заново резолвил бы ту же
      // серверную строку User (имя+токен) и грузил бы её приватные уведомления/диалоги —
      // «выход» откатывался после перезагрузки, а на общем устройстве утекали чужие данные.
      logout: async () => {
        // Keep credentials until the server confirms revocation; callers can retry offline.
        if (get().token) {
          try { await api.logout(); }
          catch (e) { if (e.status !== 401) throw e; } // already revoked
        }
        const fresh = newDeviceId();
        setAuth({ deviceId: fresh, token: null, refreshToken: null });
        set({ deviceId: fresh, loggedIn: false, token: null, userType: null, refreshToken: null,
              name: null, role: null, phone: null, roleDirty: false });
      },
    }),
    {
      name: 'erik-session',
      // userType НЕ персистим: его задаёт boot() из актуальной сессии (иначе после
      // перезагрузки бывший админ мельком видел бы админ-навигацию до ответа boot()).
      // loggedIn/role/token персистим: без них F5 на /manage ронял сессию и Shell уводил
      // на /feed. Демо это не ломает — лендинг '/' не в GATED_ROUTES и не гейтится вообще,
      // так что персист лишь удерживает пользователя там, где он уже был.
      // Протухший за перезагрузку access-токен не страшен: api обновит его по refreshToken
      // (onAuthRefresh). Если мёртв и refresh — boot() честно сбросит loggedIn/token.
      partialize: (s) => ({
        lang: s.lang, deviceId: s.deviceId, name: s.name, phone: s.phone,
        loggedIn: s.loggedIn, role: s.role, token: s.token, refreshToken: s.refreshToken,
      }),
    }
  )
);

// Реактивная версия hasProfile() для компонентов. Геттер из стора здесь не годится:
// страница, смонтированная до ответа boot(), обязана догрузиться САМА, когда имя
// доедет, — а для этого подписка на изменение обязательна.
export const useSessionReady = () =>
  useSessionStore((s) => !!s.token && !!(s.name || '').trim());

// Сразу отдаём клиенту API deviceId и регидратированные токены. Без token
// восстановленный loggedIn был бы ложью: стор считает, что мы вошли, а запросы
// до ответа boot() уходили бы без Authorization.
const pushAuth = () => {
  const s = useSessionStore.getState();
  setAuth({ deviceId: s.deviceId, token: s.token, refreshToken: s.refreshToken });
};
pushAuth();
useSessionStore.persist?.onFinishHydration?.(pushAuth);
// Обновлённый по refresh access-токен пробрасываем обратно в стор.
onAuthRefresh((token, refreshToken) => useSessionStore.setState({ token, refreshToken }));
