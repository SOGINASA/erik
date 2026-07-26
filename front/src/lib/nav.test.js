// Проверяем чистую политику доступа, а не хуки. react-router-dom (v7) нужен nav.js
// только ради useNavigate в useGuardedNav, но его подпакет 'react-router/dom' не
// резолвится jest-ом CRA (тот не читает exports-мапы package.json) — модуль просто
// не импортировался бы. Мок снимает эту зависимость, ничего не подменяя по существу.
jest.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));

import { routeAccess, isOrganizerRole, GATED_ROUTES, ORGANIZER_ROUTES, ADMIN_ROUTES } from './nav';

// Роли, которые реально приходят с бэка (models.USER_ROLES). 'admin' сюда не входит:
// админство живёт в user_type, а не в User.role.
const ROLES = ['vol', 'coord', 'org'];

// routeAccess уже знает роль и админство — состояние «ещё грузится» тут не проверяем.
const resolved = { role: true, admin: true };
const as = (role, { admin = false } = {}) =>
  ({ loggedIn: true, role, isAdmin: admin, resolved });
const guest = { loggedIn: false, role: null, isAdmin: false, resolved };

describe('routeAccess — кто куда пущен', () => {
  test('гостя пускают только в публичное', () => {
    expect(routeAccess('feed', guest)).toBe('ok');
    expect(routeAccess('map', guest)).toBe('ok');
    expect(routeAccess('event', guest)).toBe('ok');
    expect(routeAccess('forecastQuality', guest)).toBe('ok');   // паспорт модели открыт всем
    expect(routeAccess('me', guest)).toBe('guest');
    expect(routeAccess('admin', guest)).toBe('guest');
  });

  test('штаб организатора — только coord/org', () => {
    expect(routeAccess('manage', as('coord'))).toBe('ok');
    expect(routeAccess('manage', as('org'))).toBe('ok');
    expect(routeAccess('manage', as('vol'))).toBe('role');
  });

  test('админка — только по isAdmin, роль ни при чём', () => {
    ROLES.forEach((r) => {
      expect(routeAccess('admin', as(r))).toBe('admin');
      expect(routeAccess('admin', as(r, { admin: true }))).toBe('ok');
    });
  });

  test('роль ещё не доехала — не пускаем, но и не выгоняем', () => {
    const pending = { role: false, admin: false };
    expect(routeAccess('manage', { loggedIn: true, role: null, isAdmin: false, resolved: pending })).toBe('pending');
    expect(routeAccess('admin', { loggedIn: true, role: null, isAdmin: false, resolved: pending })).toBe('pending');
  });
});

// Регрессия на пункт сайдбара: «Мои мероприятия» прятались под
// role === 'vol' && !isAdmin, из-за чего координатор, НКО и админ теряли доступ к
// СВОИМ ЖЕ записям. Роль в erik — прогрессия (vol → coord → org), а не режим:
// координатор продолжает ходить волонтёром на чужие сборы.
// Тест фиксирует не сам сайдбар, а правило, которому он обязан следовать: доступ к
// роуту. Меню строже гейта — всегда баг, пункт становится недостижим.
describe('«Мои мероприятия» — свои RSVP доступны любой роли', () => {
  test('маршрут открыт всем вошедшим, включая админа', () => {
    ROLES.forEach((r) => {
      expect(routeAccess('myEvents', as(r))).toBe('ok');
      expect(routeAccess('myEvents', as(r, { admin: true }))).toBe('ok');
    });
  });

  test('вход всё же нужен', () => {
    expect(routeAccess('myEvents', guest)).toBe('guest');
    expect(GATED_ROUTES.has('myEvents')).toBe(true);
  });

  test('это не роут штаба — гейт по роли к нему не применяется', () => {
    expect(ORGANIZER_ROUTES.has('myEvents')).toBe(false);
    expect(ADMIN_ROUTES.has('myEvents')).toBe(false);
  });
});

describe('«Мои сборы» и создание сбора открыты волонтёру', () => {
  test('/me — любому вошедшему: это точка входа к первому сбору', () => {
    ROLES.forEach((r) => expect(routeAccess('me', as(r))).toBe('ok'));
  });

  test('/new не гейтится ролью — бэк сам повышает vol → coord', () => {
    expect(routeAccess('new', as('vol'))).toBe('ok');
    expect(ORGANIZER_ROUTES.has('new')).toBe(false);
  });

  test('кабинет НКО открыт и не-НКО: create_org повышает до org сам', () => {
    ROLES.forEach((r) => expect(routeAccess('manageOrg', as(r))).toBe('ok'));
  });
});

describe('isOrganizerRole', () => {
  test('организатор — это coord и org', () => {
    expect(isOrganizerRole('coord')).toBe(true);
    expect(isOrganizerRole('org')).toBe(true);
    expect(isOrganizerRole('vol')).toBe(false);
    expect(isOrganizerRole(null)).toBe(false);
    expect(isOrganizerRole('admin')).toBe(false);   // 'admin' не значение User.role
  });
});
