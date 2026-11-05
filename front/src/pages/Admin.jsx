import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container } from '../components/Container';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import Icon from '../components/Icon';
import { ADMIN_SECTIONS } from '../components/admin/nav';

import AdminOverview from '../components/admin/AdminOverview';
import AdminUsers from '../components/admin/AdminUsers';
import AdminOrgs from '../components/admin/AdminOrgs';
import AdminEvents from '../components/admin/AdminEvents';
import AdminModeration from '../components/admin/AdminModeration';
import AdminCities from '../components/admin/AdminCities';
import AdminBroadcast from '../components/admin/AdminBroadcast';
import AdminAnalytics from '../components/admin/AdminAnalytics';

const SECTION = {
  overview: AdminOverview, users: AdminUsers, orgs: AdminOrgs, events: AdminEvents,
  moderation: AdminModeration, cities: AdminCities, broadcast: AdminBroadcast, analytics: AdminAnalytics,
};

// Админ-панель: каждый раздел — свой роут /admin/<id>. Навигация — в сайдбаре
// AdminLayout — на широком и узком экране.
export default function Admin() {
  const { section } = useParams();
  const navigate = useNavigate();
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const showToast = useUiStore((s) => s.showToast);

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

      <div className="erik-anim-fade" key={cur} style={{ marginTop: 22 }}>
        <Section />
      </div>
    </Container>
  );
}
