import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { api } from './api';
import { useLang } from '../i18n';

// Роуты, требующие входа. Гость видит ленту, карту, событие, НКО — остальное просит войти.
// 'forecastQuality' сюда НЕ входит намеренно: паспорт модели прогноза открыт всем
// (эндпоинт /api/forecast/quality тоже публичный). Там нет ничего персонального —
// только метрики модели на отложенном тесте, и любой должен иметь возможность
// проверить, чем считается число, не заводя аккаунт.
export const GATED_ROUTES = new Set([
  'me', 'myEvents', 'messages', 'convo', 'notifications', 'leaderboard',
  'coord', 'check', 'new', 'admin', 'profile',
  'manage', 'manageRequests', 'manageVolunteers', 'manageOrg',
]);

// Роуты штаба организатора — мало войти, нужна роль coord/org.
// 'new' (создание сбора) входит сюда: волонтёр записывается на сборы, а проводит их
// координатор или НКО — это и проверяет бэк (POST /api/gatherings → 403 не-организатору,
// backend/routes/gatherings.py:create_gathering). Раньше роут был открыт всем, потому что
// бэк молча повышал vol → coord на первом сборе; повышения больше нет, и открытый роут
// стал бы формой, которая гарантированно упирается в отказ сервера.
// Сознательно НЕ входят:
//   'coord'/'check' — доступ решает владение конкретным сбором, а не роль;
//                    это уже честно проверяет бэк (gathering_owner_required → 403).
export const ORGANIZER_ROUTES = new Set(['new', 'manage', 'manageRequests', 'manageVolunteers']);

// Контур НКО — отдельный кабинет организации ('/manage/org'). Гейт не по «организатор
// вообще» (coord/org), а именно по роли 'org': это кабинет НКО, координатору сюда не нужно.
export const ORG_ROUTES = new Set(['manageOrg']);

// Роуты админки — нужен isAdmin() (аккаунт-админ или демо-вход role='admin').
export const ADMIN_ROUTES = new Set(['admin']);

const ORGANIZER_ROLES = new Set(['coord', 'org']);
export const isOrganizerRole = (role) => ORGANIZER_ROLES.has(role);

// Имя роута из URL.
export function routeName(pathname) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/onboarding')) return 'onboarding';
  if (pathname.startsWith('/g/')) return 'guest';
  if (pathname === '/orgs') return 'orgs';
  if (pathname.startsWith('/feed')) return 'feed';
  if (pathname.startsWith('/map')) return 'map';
  if (pathname.startsWith('/e/')) return 'event';
  if (pathname.startsWith('/new')) return 'new';
  if (pathname.match(/^\/c\/[^/]+\/check/)) return 'check';
  if (pathname.startsWith('/c/')) return 'coord';
  if (pathname === '/me') return 'me';
  if (pathname.startsWith('/my-events')) return 'myEvents';
  if (pathname.startsWith('/manage/requests')) return 'manageRequests';
  if (pathname.startsWith('/manage/volunteers')) return 'manageVolunteers';
  if (pathname.startsWith('/manage/org')) return 'manageOrg';
  if (pathname.startsWith('/manage')) return 'manage';
  if (pathname.startsWith('/u/')) return 'profile';
  if (pathname.startsWith('/o/')) return 'org';
  if (pathname.startsWith('/forecast-quality')) return 'forecastQuality';
  if (pathname.startsWith('/leaderboard')) return 'leaderboard';
  if (pathname.match(/^\/messages\/[^/]+/)) return 'convo';
  if (pathname.startsWith('/messages')) return 'messages';
  if (pathname.startsWith('/notifications')) return 'notifications';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'notfound';
}

// Ссылка на публичный профиль пользователя — или null, если открывать нечего.
// Проверка на целое число не формальность: сторы стартуют с демо-данных, где id
// строковые ('v1', 'ov1'), и такая строка увела бы на /u/v1 → «Профиль не найден».
// Гости сборов и заявки без аккаунта приходят с userId === null — тоже null.
export function profileHref(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? `/u/${n}` : null;
}

// Десктоп = ширина ≥ 900px.
export function useIsDesktop() {
  const get = () => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true);
  const [desktop, setDesktop] = useState(get);
  useEffect(() => {
    const onResize = () => setDesktop(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return desktop;
}

// Сколько ждём ответа boot(), прежде чем решать без него (см. useRoleResolved).
const ROLE_WAIT_MS = 2500;

// Готовность к вердикту — отдельно для роли и для админства: их данные живут по-разному.
//   role      персистится → после F5 известна сразу, ждать нечего;
//   userType  НЕ персистится СОЗНАТЕЛЬНО (иначе бывший админ мельком видел бы админ-меню),
//             то есть приходит только с ответом boot(). Поэтому «не админ» до boot()
//             ещё не значит «не админ»: настоящего админа, обновившего /admin, нельзя
//             выкидывать, пока boot() не ответил.
// Ждать вечно тоже нельзя: если бэкенд лежит, boot() молча вернёт null и ответа не будет
// никогда — через ROLE_WAIT_MS решаем по тому, что есть.
export function useRoleResolved() {
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const role = useSessionStore((s) => s.role);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const booted = useSessionStore((s) => s.booted);
  const roleKnown = !loggedIn || role != null;
  // false до завершения boot() ещё может означать «данные аккаунта не загружены».
  const adminKnown = !loggedIn || isAdmin || booted;
  const known = roleKnown && adminKnown;
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (known) { setWaited(false); return undefined; } // сброс, иначе следующий вход гейтился бы сразу
    const id = setTimeout(() => setWaited(true), ROLE_WAIT_MS);
    return () => clearTimeout(id);
  }, [known]);
  return { role: roleKnown || waited, admin: adminKnown || waited };
}

// Вердикт доступа к роуту. Чистая функция — её же зовёт useGuardedNav для роута,
// который известен только в момент клика.
//   'ok' | 'guest' (нужен вход) | 'role' (нужен организатор) | 'admin' (нужен админ)
//   'pending' — роль ещё грузится, решение отложено: не редиректим и не пускаем.
export function routeAccess(route, { loggedIn, role, isAdmin, resolved }) {
  if (!route) return 'ok';
  if (!loggedIn && GATED_ROUTES.has(route)) return 'guest';
  if (ADMIN_ROUTES.has(route)) {
    if (isAdmin) return 'ok';
    return resolved.admin ? 'admin' : 'pending';
  }
  // Кабинет НКО открыт вошедшим: там можно создать карточку организации
  // и отправить заявку на роль представителя НКО администрации.
  if (ORG_ROUTES.has(route)) return 'ok';
  if (!ORGANIZER_ROUTES.has(route)) return 'ok';
  if (!resolved.role) return 'pending';
  return isOrganizerRole(role) ? 'ok' : 'role';
}

// Роль на клиенте умеет протухать без перезагрузки: бэк повышает пользователя до 'org'
// при заведении НКО (backend/routes/platform.py:create_org), а фронт сессию после этого
// не перечитывает — и персистнутая 'vol' считается известной сразу (roleKnown=true, ждать
// нечего). Отказ штаба такому организатору чинился бы только полной перезагрузкой
// (boot() перечитает роль).
// Поэтому перед отказом ОДИН раз перечитываем свою роль у бэка. Именно GET /me: он только
// читает и не создаёт новую device-сессию.
// setState, а не setRole: роль пришла ОТ бэка, и roleDirty («выбрана в онбординге, ещё не
// доехала до бэка», useSessionStore.js:27) тут был бы враньём — POST /session её затрёт.
// Молчащий бэк подвешивать экран не должен: на ошибке решаем по тому, что есть.
function useRefetchedRole(needed) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!needed) { setDone(false); return undefined; } // ушли с роута — следующий отказ снова перепроверим
    let alive = true;
    api.me().then(
      (r) => { if (r && r.user && r.user.role) useSessionStore.setState({ role: r.user.role, roleDirty: false }); },
      () => { /* офлайн — роль оставляем как есть */ },
    ).then(() => { if (alive) setDone(true); });
    return () => { alive = false; };
  }, [needed]);
  return done;
}

export function useRouteAccess(route) {
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const role = useSessionStore((s) => s.role);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const resolved = useRoleResolved();
  const verdict = routeAccess(route, { loggedIn, role, isAdmin, resolved });
  // Отказ по роли откладываем до перепроверки — до её ответа роут 'pending' (см. useRefetchedRole).
  const refetched = useRefetchedRole(verdict === 'role');
  return verdict === 'role' && !refetched ? 'pending' : verdict;
}

// Текст отказа для тоста. Раньше здесь советовали «создайте свой сбор, чтобы получить
// роль» — это было правдой, пока бэк повышал vol → coord на первом сборе. Теперь совет
// стал бы кругом: сбор и есть то, что не пускают создать. Указываем, что нужна
// подтверждённая роль; подать заявку и проверить её статус можно в «Моих сборах».
export function accessDeniedText(verdict, isRu) {
  if (verdict === 'admin') {
    return isRu ? 'Раздел доступен только администраторам' : 'Бөлім тек әкімшілерге қолжетімді';
  }
  return isRu
    ? 'Для создания сборов нужна подтверждённая роль координатора или НКО. Заявка и её статус — в «Моих сборах»'
    : 'Жиын құру үшін үйлестіруші немесе ҮЕҰ рөлін әкімші растауы керек. Өтінім мен оның күйі «Менің жиындарым» бөлімінде';
}

// Навигация с проверкой доступа: гостя на закрытый роут ведём в лист авторизации,
// без нужной роли — тостим и остаёмся на месте (та же логика, что и при прямом заходе).
export function useGuardedNav() {
  const navigate = useNavigate();
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const role = useSessionStore((s) => s.role);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const resolved = useRoleResolved();
  const openSheet = useUiStore((s) => s.openSheet);
  const showToast = useUiStore((s) => s.showToast);
  const isRu = useLang() === 'ru';
  return async (path, route) => {
    let verdict = routeAccess(route, { loggedIn, role, isAdmin, resolved });
    if (verdict === 'guest') {
      openSheet('auth');
      return;
    }
    // При клике действует та же перепроверка, что и при прямом открытии URL.
    // Иначе устаревшая vol блокирует координатора ещё до входа в Shell.
    if (verdict === 'role') {
      const token = useSessionStore.getState().token;
      try {
        const res = await api.me();
        const session = useSessionStore.getState();
        if (!session.loggedIn || session.token !== token) return;
        if (res?.user?.role) useSessionStore.setState({ role: res.user.role, roleDirty: false });
      } catch (_) { /* на ошибке решаем по известной роли */ }
      const session = useSessionStore.getState();
      if (!session.loggedIn || session.token !== token) return;
      verdict = routeAccess(route, { loggedIn: session.loggedIn, role: session.role, isAdmin: session.isAdmin(), resolved });
    }
    if (verdict === 'role' || verdict === 'admin') {
      showToast(accessDeniedText(verdict, isRu));
      return;
    }
    // 'pending' пропускаем: роль ещё грузится, дальше решит гейт в Shell.
    navigate(path);
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };
}

// Число непрочитанных уведомлений. Серверный полный счётчик (serverUnread) авторитетнее
// подсчёта по одной загруженной странице (список отдаёт лишь первые 30) — берём максимум,
// чтобы бейдж не занижался при большом объёме и работал на демо (serverUnread=0).
export function useUnread() {
  return usePlatformStore((s) => Math.max(s.serverUnread || 0, s.notifs.filter((n) => !n.read && !s.notifRead[n.id]).length));
}
