import { Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Icon from '../Icon';
import Avatar from '../ui/Avatar';
import { Logo, LangToggle } from './Brand';
import { useT } from '../../i18n';
import { useSessionStore } from '../../store/useSessionStore';
import { useUiStore } from '../../store/useUiStore';
import { usePlatformStore } from '../../store/usePlatformStore';
import { routeName, useIsDesktop, useGuardedNav, useUnread, GATED_ROUTES } from '../../lib/nav';
import { ADMIN_SECTIONS, adminSectionId } from '../admin/nav';

// Шелл приложения: сайдбар (десктоп) / шапка + таббар (мобиль) вокруг страниц.
export default function Shell() {
  const location = useLocation();
  const route = routeName(location.pathname);
  const desktop = useIsDesktop();
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const openSheet = useUiStore((s) => s.openSheet);

  // Бэкстоп для прямых ссылок на закрытые роуты: гостя просим войти.
  useEffect(() => {
    if (!loggedIn && GATED_ROUTES.has(route)) openSheet('auth');
  }, [loggedIn, route, openSheet]);
  if (!loggedIn && GATED_ROUTES.has(route)) return <Navigate to="/feed" replace />;

  const showGuestBanner = !loggedIn && (route === 'feed' || route === 'map' || route === 'event');

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--paper)', overflowX: 'hidden' }}>
      {desktop && (route === 'admin' ? <AdminSidebar pathname={location.pathname} /> : <Sidebar route={route} />)}
      <div
        style={{
          minHeight: '100dvh',
          paddingLeft: desktop ? 248 : 0,
          paddingBottom: desktop ? 0 : 'calc(66px + env(safe-area-inset-bottom))',
        }}
      >
        {!desktop && <MobileHeader />}
        {showGuestBanner && <GuestBanner />}
        <Outlet />
      </div>
      {!desktop && <Tabbar route={route} />}
    </div>
  );
}

function Sidebar({ route }) {
  const t = useT();
  const go = useGuardedNav();
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const role = useSessionStore((s) => s.role);
  const isOrganizer = role === 'coord' || role === 'org';
  const me = usePlatformStore((s) => s.me);
  const unread = useUnread();

  const item = (on) => ({
    display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 14px', borderRadius: 'var(--r-m)',
    border: 'none', background: on ? 'var(--yard-soft)' : 'transparent', color: on ? 'var(--yard)' : 'var(--ink-2)',
    fontWeight: 500, fontSize: 15, cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'var(--fb)',
    transition: 'background var(--t-fast), color var(--t-fast)',
  });
  const NavBtn = ({ icon, label, active, onClick, badge }) => (
    <button className="erik-row-hover" onClick={onClick} style={item(active)}>
      <Icon name={icon} size={20} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--maybe)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>
      )}
    </button>
  );

  return (
    <aside className="erik-scroll" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 248, background: 'var(--surface)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: '22px 16px', zIndex: 30, overflowY: 'auto' }}>
      <div style={{ padding: '4px 10px', marginBottom: 22 }}>
        <Logo size={24} onClick={() => go('/feed', 'feed')} />
      </div>
      {isOrganizer && (
        <button className="erik-btn erik-btn-primary" onClick={() => go('/new', 'new')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, border: 'none', borderRadius: 'var(--r-m)', background: 'var(--yard)', color: '#fff', fontWeight: 500, fontSize: 15, cursor: 'pointer', marginBottom: 20 }}>
          <Icon name="plus" size={18} stroke={1.9} />
          {t.navCreate}
        </button>
      )}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavBtn icon="feed" label={t.navFeed} active={route === 'feed'} onClick={() => go('/feed', 'feed')} />
        <NavBtn icon="map" label={t.navMap} active={route === 'map'} onClick={() => go('/map', 'map')} />
        {isOrganizer && (
          <NavBtn icon="calendar" label={t.mgNav} active={route === 'manage' || route === 'manageRequests' || route === 'manageVolunteers'} onClick={() => go('/manage', 'manage')} />
        )}
        {isOrganizer && (
          <NavBtn icon="list" label={t.myGatherings} active={route === 'me'} onClick={() => go('/me', 'me')} />
        )}
        <NavBtn icon="message" label={t.navMessages} active={route === 'messages' || route === 'convo'} onClick={() => go('/messages', 'messages')} />
        <NavBtn icon="bell" label={t.navNotif} active={route === 'notifications'} onClick={() => go('/notifications', 'notifications')} badge={unread} />
        <NavBtn icon="trophy" label={t.navLeader} active={route === 'leaderboard'} onClick={() => go('/leaderboard', 'leaderboard')} />
        <NavBtn icon="heart" label={t.navCharity} active={route === 'charity'} onClick={() => go('/charity', 'charity')} />
        {isAdmin && (
          <NavBtn icon="shield" label={t.navAdmin} active={route === 'admin'} onClick={() => go('/admin', 'admin')} />
        )}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 14 }}>
        {loggedIn ? (
          <button className="erik-row-hover" onClick={() => go('/u/me', 'profile')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px 8px', borderRadius: 'var(--r-m)', textAlign: 'left' }}>
            <Avatar name={me.name} size={38} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>{me.city}</span>
            </span>
          </button>
        ) : (
          <button className="erik-btn erik-btn-primary" onClick={() => go('/register')} style={{ width: '100%', height: 44, border: 'none', borderRadius: 'var(--r-m)', background: 'var(--yard)', color: '#fff', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.mStart}</button>
        )}
        <div style={{ marginTop: 8 }}>
          <LangToggle surface="var(--paper)" />
        </div>
      </div>
    </aside>
  );
}

// Сайдбар админ-области: разделы админки как отдельные пункты.
function AdminSidebar({ pathname }) {
  const navigate = useNavigate();
  const me = usePlatformStore((s) => s.me);
  const orgs = usePlatformStore((s) => s.orgs);
  const pending = orgs.filter((o) => !o.verified).length + 2;
  const active = adminSectionId(pathname);

  const item = (on) => ({
    display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 14px', borderRadius: 'var(--r-m)',
    border: 'none', background: on ? 'var(--yard-soft)' : 'transparent', color: on ? 'var(--yard)' : 'var(--ink-2)',
    fontWeight: 500, fontSize: 15, cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'var(--fb)',
    transition: 'background var(--t-fast), color var(--t-fast)',
  });

  return (
    <aside className="erik-scroll" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 248, background: 'var(--surface)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: '22px 16px', zIndex: 30, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', marginBottom: 20 }}>
        <Logo size={24} onClick={() => navigate('/admin')} />
        <span style={{ height: 18, padding: '0 7px', display: 'flex', alignItems: 'center', borderRadius: 999, background: 'var(--ink)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.04em' }}>АДМИН</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ADMIN_SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <button key={s.id} className="erik-row-hover" onClick={() => navigate(s.path)} style={item(on)}>
              <Icon name={s.icon} size={20} />
              <span style={{ flex: 1 }}>{s.label}</span>
              {s.id === 'moderation' && pending > 0 && (
                <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--maybe)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pending}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 14 }}>
        <button className="erik-row-hover" onClick={() => navigate('/feed')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px 12px', borderRadius: 'var(--r-m)', color: 'var(--ink-2)', fontFamily: 'var(--fb)', fontWeight: 500, fontSize: 14, textAlign: 'left' }}>
          <Icon name="back" size={18} /> В приложение
        </button>
        <button className="erik-row-hover" onClick={() => navigate('/u/me')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px 8px', borderRadius: 'var(--r-m)', textAlign: 'left', marginTop: 4 }}>
          <Avatar name={me.name} size={38} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>Администратор</span>
          </span>
        </button>
        <div style={{ marginTop: 8 }}>
          <LangToggle surface="var(--paper)" />
        </div>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const go = useGuardedNav();
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const me = usePlatformStore((s) => s.me);
  const t = useT();
  const unread = useUnread();
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(244,245,241,.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--line)' }}>
      <Logo size={22} onClick={() => go('/feed', 'feed')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LangToggle />
        {loggedIn && (
          <button className="erik-btn" onClick={() => go('/notifications', 'notifications')} aria-label={t.navNotif} style={{ position: 'relative', width: 40, height: 40, border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink)' }}>
            <Icon name="bell" size={19} />
            {unread > 0 && <span style={{ position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 999, background: 'var(--maybe)', border: '1.5px solid var(--surface)' }} />}
          </button>
        )}
        {loggedIn ? (
          <button className="erik-btn" onClick={() => go('/u/me', 'profile')} aria-label={t.navProfile} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
            <Avatar name={me.name} size={40} />
          </button>
        ) : (
          <button className="erik-btn erik-btn-primary" onClick={() => go('/register')} style={{ height: 40, padding: '0 14px', border: 'none', borderRadius: 999, background: 'var(--yard)', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>{t.mStart}</button>
        )}
      </div>
    </header>
  );
}

function Tabbar({ route }) {
  const t = useT();
  const go = useGuardedNav();
  const openSheet = useUiStore((s) => s.openSheet);
  const unread = useUnread();
  const role = useSessionStore((s) => s.role);
  const isOrganizer = role === 'coord' || role === 'org';

  const tab = (on) => ({
    position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    flex: 1, border: 'none', background: 'transparent', color: on ? 'var(--yard)' : 'var(--ink-3)', fontSize: 10, fontWeight: 600,
    letterSpacing: '.01em', cursor: 'pointer', height: '100%', fontFamily: 'var(--fb)', transform: on ? 'translateY(-1px)' : 'none',
    transition: 'color var(--t-fast), transform var(--t-fast)',
  });
  const moreActive = ['profile', 'me', 'leaderboard', 'charity', 'admin', 'coord', 'check', 'org', 'manage', 'manageRequests', 'manageVolunteers'].includes(route) || (isOrganizer && route === 'notifications');

  return (
    <nav className="erik-tap" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)', display: 'flex', alignItems: 'stretch', background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)', borderTop: '1px solid var(--line)', boxShadow: '0 -1px 12px rgba(20,24,26,.04)' }}>
      <button style={tab(route === 'feed')} onClick={() => go('/feed', 'feed')}><Icon name="feed" size={23} /><span>{t.navFeed}</span></button>
      <button style={tab(route === 'map')} onClick={() => go('/map', 'map')}><Icon name="map" size={23} /><span>{t.navMap}</span></button>
      {isOrganizer ? (
        <button className="erik-press erik-tap" aria-label={t.navCreate} onClick={() => go('/new', 'new')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 6, gap: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <span style={{ width: 50, height: 50, marginTop: -16, borderRadius: 999, background: 'var(--yard)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(47,111,79,.4), 0 0 0 4px var(--paper)' }}>
            <Icon name="plus" size={24} stroke={2} />
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)' }}>{t.navCreate}</span>
        </button>
      ) : (
        <button style={tab(route === 'notifications')} onClick={() => go('/notifications', 'notifications')}>
          <span style={{ position: 'relative', display: 'flex' }}>
            <Icon name="bell" size={23} />
            {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -6, minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999, background: 'var(--maybe)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--surface)' }}>{unread}</span>}
          </span>
          <span>{t.navNotif}</span>
        </button>
      )}
      <button style={tab(route === 'messages' || route === 'convo')} onClick={() => go('/messages', 'messages')}><Icon name="message" size={23} /><span>{t.navMessages}</span></button>
      <button style={tab(moreActive)} onClick={() => openSheet('more')}>
        <Icon name="more" size={23} /><span>{t.navMore}</span>
        {unread > 0 && <span style={{ position: 'absolute', top: 8, right: 'calc(50% - 20px)', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--maybe)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--surface)' }}>{unread}</span>}
      </button>
    </nav>
  );
}

function GuestBanner() {
  const t = useT();
  const go = useGuardedNav();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '9px 20px', background: 'var(--ink)', color: '#fff', fontSize: 13 }}>
      <span style={{ opacity: 0.85 }}>{t.guestMode}</span>
      <button className="erik-btn" onClick={() => go('/register')} style={{ height: 28, padding: '0 14px', border: 'none', borderRadius: 999, background: '#fff', color: 'var(--ink)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{t.guestCta}</button>
    </div>
  );
}
