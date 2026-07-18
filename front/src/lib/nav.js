import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { usePlatformStore } from '../store/usePlatformStore';

// Роуты, которые «внутри приложения» — вокруг них показывается шелл
// (сайдбар на десктопе, шапка+таббар на мобиле).
export const APP_ROUTES = new Set([
  'feed', 'map', 'event', 'profile', 'org', 'leaderboard', 'charity',
  'messages', 'convo', 'notifications', 'new', 'coord', 'check', 'me', 'notfound', 'admin',
]);

// Роуты, требующие входа. Гость видит ленту, карту, событие, НКО — остальное просит войти.
export const GATED_ROUTES = new Set([
  'me', 'messages', 'convo', 'notifications', 'leaderboard', 'charity',
  'coord', 'check', 'new', 'admin', 'profile',
]);

// Имя роута из URL.
export function routeName(pathname) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/onboarding')) return 'onboarding';
  if (pathname.startsWith('/g/')) return 'guest';
  if (pathname.startsWith('/feed')) return 'feed';
  if (pathname.startsWith('/map')) return 'map';
  if (pathname.startsWith('/e/')) return 'event';
  if (pathname.startsWith('/new')) return 'new';
  if (pathname.match(/^\/c\/[^/]+\/check/)) return 'check';
  if (pathname.startsWith('/c/')) return 'coord';
  if (pathname === '/me') return 'me';
  if (pathname.startsWith('/u/')) return 'profile';
  if (pathname.startsWith('/o/')) return 'org';
  if (pathname.startsWith('/leaderboard')) return 'leaderboard';
  if (pathname.startsWith('/charity')) return 'charity';
  if (pathname.match(/^\/messages\/[^/]+/)) return 'convo';
  if (pathname.startsWith('/messages')) return 'messages';
  if (pathname.startsWith('/notifications')) return 'notifications';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'notfound';
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

// Навигация с проверкой входа: на закрытый роут гостя ведём в лист авторизации.
export function useGuardedNav() {
  const navigate = useNavigate();
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const openSheet = useUiStore((s) => s.openSheet);
  return (path, route) => {
    if (!loggedIn && route && GATED_ROUTES.has(route)) {
      openSheet('auth');
      return;
    }
    navigate(path);
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };
}

// Число непрочитанных уведомлений.
export function useUnread() {
  return usePlatformStore((s) => s.notifs.filter((n) => !n.read && !s.notifRead[n.id]).length);
}
