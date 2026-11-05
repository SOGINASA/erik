import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Shell from './components/shell/Shell';
import Sheets from './sheets/Sheets';
import { Toast } from './components/ui/feedback';
import { useSessionStore } from './store/useSessionStore';
import { usePlatformStore } from './store/usePlatformStore';
import { useGatheringStore } from './store/useGatheringStore';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import OAuthCallback from './pages/OAuthCallback';
import Legal from './pages/Legal';
import Feed from './pages/Feed';
import MapPage from './pages/MapPage';
import Event from './pages/Event';
import NewGathering from './pages/NewGathering';
import GuestGathering from './pages/GuestGathering';
import CoordGathering from './pages/CoordGathering';
import CheckIn from './pages/CheckIn';
import AttendanceConfirm from './pages/AttendanceConfirm';
import MyGatherings from './pages/MyGatherings';
import MyEvents from './pages/MyEvents';
import Manage from './pages/Manage';
import ManageRequests from './pages/ManageRequests';
import ManageVolunteers from './pages/ManageVolunteers';
import ManageOrg from './pages/ManageOrg';
import Profile from './pages/Profile';
import Org from './pages/Org';
import Organizations from './pages/Organizations';
import Leaderboard from './pages/Leaderboard';
import ForecastQuality from './pages/ForecastQuality';
import Messages from './pages/Messages';
import Convo from './pages/Convo';
import Notifications from './pages/Notifications';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';
import ProjectRights from './pages/ProjectRights';

export default function App() {
  const oauthCallback = useLocation().pathname === '/oauth/callback';
  // Поднимаем device-сессию один раз при загрузке (нужно и гостю для RSVP),
  // затем подтягиваем данные платформы, уведомления, подписки и ответы на события.
  // Поднимаем device-сессию + публичные данные (лента/НКО/города/рейтинг) — можно и гостю.
  useEffect(() => {
    if (oauthCallback) return;
    useSessionStore.getState().boot().finally(() => {
      usePlatformStore.getState().loadPlatform();
    });
  }, [oauthCallback]);

  // Профильные данные (уведомления/подписки/диалоги/ответы) — только когда есть
  // токен И имя (@profiled_required). Реактивно: срабатывает и после входа/онбординга,
  // и НЕ дёргает 403 для гостя.
  const token = useSessionStore((s) => s.token);
  const name = useSessionStore((s) => s.name);
  const booted = useSessionStore((s) => s.booted);
  const userType = useSessionStore((s) => s.userType);
  useEffect(() => {
    if (oauthCallback || !token || !name) return;
    const p = usePlatformStore.getState();
    p.loadNotifications();
    p.loadFollows();
    p.loadMe();
    p.loadConversations();
    useGatheringStore.getState().loadRegistrations();
  }, [token, name, oauthCallback]);

  // Живые уведомления/сообщения: лёгкий поллинг каждые 25с (только с профилем, видимая вкладка).
  useEffect(() => {
    const tick = () => {
      if (oauthCallback) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const s = useSessionStore.getState();
      if (!s.token || !s.name) return; // профильные эндпоинты требуют имя
      const p = usePlatformStore.getState();
      p.loadNotifications();
      p.loadConversations();
    };
    const iv = setInterval(tick, 25000);
    return () => clearInterval(iv);
  }, [oauthCallback]);

  // userType is deliberately not persisted. Wait for /me before choosing the
  // workspace so refreshing an admin session never flashes volunteer navigation.
  if (!oauthCallback && token && !booted) return <div role="status" style={{ padding: 40, color: 'var(--ink-2)' }}>Проверяем доступ…</div>;

  const admin = userType === 'admin';
  return (
    <>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/" element={admin ? <Navigate to="/admin" replace /> : <Home />} />
        <Route path="/login" element={admin ? <Navigate to="/admin" replace /> : <Login />} />
        <Route path="/register" element={admin ? <Navigate to="/admin" replace /> : <Register />} />
        <Route path="/onboarding" element={<Navigate to="/register" replace />} />
        <Route path="/terms" element={<Legal documentKey="terms" />} />
        <Route path="/privacy" element={<Legal documentKey="privacy" />} />
        <Route path="/consent" element={<Legal documentKey="consent" />} />
        <Route path="/legal" element={<Navigate to="/privacy" replace />} />
        <Route path="/project-rights" element={<ProjectRights />} />
        <Route path="/charity/*" element={<Navigate to="/feed" replace />} />
        <Route path="/admin/charity/*" element={<Navigate to="/admin" replace />} />
        <Route path="/g/:code" element={<GuestGathering />} />
        <Route path="/attendance/:id" element={<AttendanceConfirm />} />
        <Route element={<Shell />}>
          <Route path="/feed" element={<Feed />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/e/:id" element={<Event />} />
          <Route path="/new" element={<NewGathering />} />
          <Route path="/c/:id" element={<CoordGathering />} />
          <Route path="/c/:id/check" element={<CheckIn />} />
          <Route path="/me" element={<MyGatherings />} />
          <Route path="/my-events" element={<MyEvents />} />
          <Route path="/manage" element={<Manage />} />
          <Route path="/manage/requests" element={<ManageRequests />} />
          <Route path="/manage/volunteers" element={<ManageVolunteers />} />
          <Route path="/manage/org" element={<ManageOrg />} />
          <Route path="/u/:id" element={<Profile />} />
          <Route path="/orgs" element={<Organizations />} />
          <Route path="/o/:id" element={<Org />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/forecast-quality" element={<ForecastQuality />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:id" element={<Convo />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/:section" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Sheets />
      <Toast />
    </>
  );
}
