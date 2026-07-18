import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Shell from './components/shell/Shell';
import Sheets from './sheets/Sheets';
import { Toast } from './components/ui/feedback';
import { useSessionStore } from './store/useSessionStore';
import { usePlatformStore } from './store/usePlatformStore';
import { useGatheringStore } from './store/useGatheringStore';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Feed from './pages/Feed';
import MapPage from './pages/MapPage';
import Event from './pages/Event';
import NewGathering from './pages/NewGathering';
import GuestGathering from './pages/GuestGathering';
import CoordGathering from './pages/CoordGathering';
import CheckIn from './pages/CheckIn';
import MyGatherings from './pages/MyGatherings';
import Profile from './pages/Profile';
import Org from './pages/Org';
import Leaderboard from './pages/Leaderboard';
import Charity from './pages/Charity';
import Messages from './pages/Messages';
import Convo from './pages/Convo';
import Notifications from './pages/Notifications';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

export default function App() {
  // Поднимаем device-сессию один раз при загрузке (нужно и гостю для RSVP),
  // затем подтягиваем данные платформы, уведомления, подписки и ответы на события.
  useEffect(() => {
    useSessionStore.getState().boot().finally(() => {
      const p = usePlatformStore.getState();
      p.loadPlatform();
      p.loadNotifications();
      p.loadFollows();
      p.loadMe();
      p.loadConversations();
      useGatheringStore.getState().loadRegistrations();
    });
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/g/:code" element={<GuestGathering />} />
        <Route element={<Shell />}>
          <Route path="/feed" element={<Feed />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/e/:id" element={<Event />} />
          <Route path="/new" element={<NewGathering />} />
          <Route path="/c/:id" element={<CoordGathering />} />
          <Route path="/c/:id/check" element={<CheckIn />} />
          <Route path="/me" element={<MyGatherings />} />
          <Route path="/u/:id" element={<Profile />} />
          <Route path="/o/:id" element={<Org />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/charity" element={<Charity />} />
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
