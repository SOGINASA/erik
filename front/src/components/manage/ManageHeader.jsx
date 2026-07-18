import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { useOrganizerStore } from '../../store/useOrganizerStore';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useIsDesktop } from '../../lib/nav';
import Button from '../ui/Button';

// Шапка штаба: eyebrow + имя организатора + вкладки (Обзор · Заявки · Волонтёры).
// active: 'overview' | 'requests' | 'volunteers'.
export default function ManageHeader({ active }) {
  const t = useT();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const me = usePlatformStore((s) => s.me);
  const pending = useOrganizerStore((s) => s.pendingCount());

  const tabs = [
    { k: 'overview', label: t.mgTabOverview, path: '/manage' },
    { k: 'requests', label: t.mgTabRequests, path: '/manage/requests', badge: pending },
    { k: 'volunteers', label: t.mgTabVolunteers, path: '/manage/volunteers' },
  ];

  return (
    <div style={{ margin: '8px 0 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>{t.manageEyebrow}</div>
          <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.12, letterSpacing: '-.02em', margin: 0 }}>{me.name}</h1>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 4 }}>{me.city}</div>
        </div>
        {desktop && (
          <Button icon="plus" onClick={() => navigate('/new')} style={{ flex: 'none' }}>{t.create}</Button>
        )}
      </div>

      <div className="erik-scroll" style={{ display: 'flex', gap: 4, marginTop: 20, borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
        {tabs.map((tab) => {
          const on = tab.k === active;
          return (
            <button
              key={tab.k}
              type="button"
              className="erik-btn"
              onClick={() => navigate(tab.path)}
              style={{
                position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none',
                padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--fb)', fontWeight: 500, fontSize: 15, color: on ? 'var(--ink)' : 'var(--ink-3)',
                borderBottom: `2px solid ${on ? 'var(--yard)' : 'transparent'}`, marginBottom: -1,
              }}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: on ? 'var(--yard)' : 'var(--maybe)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
