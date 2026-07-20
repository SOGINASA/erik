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

      // Поднять сессию. Безопасно к офлайну — на моках работаем и так.
      // Персистнутый токен на первом boot() (booted=false) рехайдрируем через GET /me:
      // кто мы — решает JWT. POST /session нашёл бы юзера по deviceId и подменил бы
      // аккаунт-вход device-личностью: /auth/login device_id к аккаунту не привязывает
      // (routes/auth.py, только register), так что это была бы другая строка User.
      // Повторные boot() (из login()) идут device-путём — там надо донести name/role.
      boot: async () => {
        const { deviceId, name, role, roleDirty, token, booted } = get();
        setAuth({ deviceId });
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
            // Личность отвергнута (токен мёртв, refresh не выручил — onAuthRefresh):
            // восстанавливать нечего. Гасим сессию и идём на device-путь гостем — иначе
            // остались бы «залогинены», но уже чужой личностью.
            setAuth({ token: null, refreshToken: null });
            set({ loggedIn: false, token: null, refreshToken: null, userType: null });
          }
        }
        try {
          const res = await api.session({
            deviceId,
            name: name || undefined,
            // Роль шлём только сразу после выбора в онбординге: POST /session затирает
            // серверную роль присланной (identity.py:_fill_existing), а серверная бывает
            // свежее — бэк сам повышает vol→coord на первом сборе. Слать персистнутую
            // роль на каждый F5 значило бы откатывать это повышение.
            role: roleDirty && role ? role : undefined,
          });
          setAuth({ token: res.token, refreshToken: res.refreshToken || null });
          set({
            token: res.token,
            refreshToken: res.refreshToken || null,
            name: res.user.full_name || name,
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
        await get().boot();
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

      // Выход → чистое гостевое состояние (deviceId сохраняем как якорь устройства).
      logout: () => {
        setAuth({ token: null, refreshToken: null });
        set({ loggedIn: false, token: null, userType: null, refreshToken: null,
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
onAuthRefresh((token) => useSessionStore.setState({ token }));
