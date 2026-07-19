import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import { EmptyState } from '../components/ui/feedback';

// Фон круглой иконки по типу уведомления (из platformVals notifIconBg).
const NOTIF_ICON_BG = { answer: 'var(--yard-soft)', reminder: 'var(--maybe-soft)', badge: '#EDE6E8', event: '#E4EAEE', system: '#EEF0EC' };
// Подходящая иконка по типу.
const NOTIF_ICON = { answer: 'check', reminder: 'bell', badge: 'heart', event: 'calendar', system: 'shield' };

export default function Notifications() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const notifs = usePlatformStore((s) => s.notifs);
  const notifRead = usePlatformStore((s) => s.notifRead);
  const markAllRead = usePlatformStore((s) => s.markAllRead);
  const markRead = usePlatformStore((s) => s.markRead);

  return (
    <Container style={{ maxWidth: 720, paddingTop: 24, paddingBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: 0 }}>{t.notifTitle}</h1>
        <button type="button" onClick={markAllRead} style={{ border: 'none', background: 'transparent', color: 'var(--yard)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.markAllReadLabel}</button>
      </div>

      {notifs.length === 0 ? (
        <EmptyState icon="bell" title={t.emptyNotif} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {notifs.map((n) => {
            const unread = !n.read && !notifRead[n.id];
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => unread && markRead(n.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' && unread) markRead(n.id); }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 4px', borderBottom: '1px solid var(--line)', cursor: unread ? 'pointer' : 'default' }}
              >
                <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', background: NOTIF_ICON_BG[n.type] || '#EEF0EC' }}>
                  <Icon name={NOTIF_ICON[n.type] || 'bell'} size={18} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, color: 'var(--ink)', lineHeight: 1.4 }}>{isRu ? n.ru : n.kz}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{n.time}</span>
                </span>
                {unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--maybe)', flex: 'none', marginTop: 6 }} />}
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
