import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container } from '../components/Container';
import { usePlatformStore } from '../store/usePlatformStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { useIsDesktop } from '../lib/nav';
import Icon from '../components/Icon';
import { ADMIN_SECTIONS } from '../components/admin/nav';

import AdminOverview from '../components/admin/AdminOverview';
import AdminUsers from '../components/admin/AdminUsers';
import AdminOrgs from '../components/admin/AdminOrgs';
import AdminEvents from '../components/admin/AdminEvents';
import AdminModeration from '../components/admin/AdminModeration';
import AdminCharity from '../components/admin/AdminCharity';
import AdminCities from '../components/admin/AdminCities';
import AdminBroadcast from '../components/admin/AdminBroadcast';
import AdminAnalytics from '../components/admin/AdminAnalytics';

const SECTION = {
  overview: AdminOverview, users: AdminUsers, orgs: AdminOrgs, events: AdminEvents,
  moderation: AdminModeration, charity: AdminCharity, cities: AdminCities, broadcast: AdminBroadcast, analytics: AdminAnalytics,
};

// Админ-панель: каждый раздел — свой роут /admin/<id>. Навигация — в сайдбаре
// (desktop) или горизонтальной лентой сверху (mobile).
export default function Admin() {
  const { section } = useParams();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const orgs = usePlatformStore((s) => s.orgs);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const showToast = useUiStore((s) => s.showToast);
  const pending = orgs.filter((o) => !o.verified).length + 2;

  // Гейт по роли: не-админа (в т.ч. по прямому URL) уводим на ленту.
  useEffect(() => {
    if (!isAdmin) {
      showToast('Доступ только для администраторов');
      navigate('/feed', { replace: true });
    }
  }, [isAdmin, navigate, showToast]);
  if (!isAdmin) return null;

  const cur = SECTION[section] ? section : 'overview';
  const Section = SECTION[cur];
  const meta = ADMIN_SECTIONS.find((s) => s.id === cur) || ADMIN_SECTIONS[0];

  return (
    <Container style={{ paddingTop: 20, paddingBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, background: 'var(--yard-soft)', color: 'var(--yard)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={meta.icon} size={20} /></span>
        <div>
          <div style={{ fontFamily: 'var(--fm)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Админ-панель</div>
          <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 24, letterSpacing: '-.02em', margin: 0 }}>{meta.label}</h1>
        </div>
      </div>

      {/* мобильная навигация по разделам (на десктопе — сайдбар) */}
      {!desktop && (
        <div className="erik-scroll" style={{ display: 'flex', gap: 2, overflowX: 'auto', margin: '18px 0 22px', borderBottom: '1px solid var(--line)' }}>
          {ADMIN_SECTIONS.map((s) => {
            const on = s.id === cur;
            return (
              <button
                key={s.id}
                type="button"
                className="erik-btn"
                onClick={() => navigate(s.path)}
                style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 14px', border: 'none', background: 'transparent', color: on ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--fb)', fontWeight: on ? 600 : 500, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: `2px solid ${on ? 'var(--yard)' : 'transparent'}`, marginBottom: -1, flex: 'none' }}
              >
                <Icon name={s.icon} size={17} />
                {s.label}
                {s.id === 'moderation' && pending > 0 && (
                  <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--maybe)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pending}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="erik-anim-fade" key={cur} style={{ marginTop: desktop ? 22 : 0 }}>
        <Section />
      </div>
    </Container>
  );
}
