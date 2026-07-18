import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { Container } from '../components/Container';
import Avatar from '../components/ui/Avatar';

// Рейтинг: волонтёры / города / НКО. Табы, строки с рангом-медалью и метрикой.
export default function Leaderboard() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const volunteers = usePlatformStore((s) => s.volunteers);
  const cities = usePlatformStore((s) => s.cities);
  const orgs = usePlatformStore((s) => s.orgs);
  const leaderTab = usePlatformStore((s) => s.leaderTab);
  const setLeaderTab = usePlatformStore((s) => s.setLeaderTab);

  // Цвет медали: 1-е золото, 2-е серебро, 3-е бронза, дальше — приглушённый.
  const medal = (i) => (i === 0 ? '#C8842B' : i === 1 ? '#9aa4a0' : i === 2 ? '#a97f4e' : 'var(--ink-3)');

  const tabs = [
    { value: 'vol', label: t.leaderVol },
    { value: 'city', label: t.leaderCity },
    { value: 'org', label: t.leaderOrg },
  ];
  const segTab = (on) => ({
    flex: 1, border: 'none', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-3)',
    fontWeight: 500, fontSize: 14, padding: '9px 0', borderRadius: 9, cursor: 'pointer', transition: 'all var(--t-fast)',
    boxShadow: on ? '0 1px 2px rgba(20,24,26,.09)' : 'none',
  });

  // Общие ячейки строки рейтинга.
  const rankCell = (color, n) => (
    <span style={{ width: 26, fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 16, color, textAlign: 'center' }}>{n}</span>
  );
  const nameCell = (name, sub) => (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{name}</span>
      <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>{sub}</span>
    </span>
  );
  const metricCell = (v) => (
    <span style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{v}</span>
  );

  const cityRows = [...cities].sort((a, b) => b.vol - a.vol);
  const orgRows = [...orgs].sort((a, b) => b.vol - a.vol);

  return (
    <Container style={{ maxWidth: 720, paddingTop: 24, paddingBottom: 48 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 4px' }}>{t.leaderTitle}</h1>
      <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '0 0 18px' }}>{t.leaderNote}</p>

      <div style={{ display: 'flex', gap: 2, padding: 4, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, marginBottom: 20 }}>
        {tabs.map((tab) => (
          <button key={tab.value} type="button" className="erik-btn" onClick={() => setLeaderTab(tab.value)} style={segTab(leaderTab === tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>

      {leaderTab === 'vol' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {volunteers.map((v, i) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px', borderBottom: '1px solid var(--line)' }}>
              {rankCell(medal(i), i + 1)}
              <Avatar name={v.name} size={38} />
              {nameCell(v.name, `${v.city} · ${v.events}${isRu ? ' сборов' : ' жиын'}`)}
              {metricCell(`${v.hours}${isRu ? ' ч' : ' сағ'}`)}
            </div>
          ))}
        </div>
      )}

      {leaderTab === 'city' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {cityRows.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderBottom: '1px solid var(--line)' }}>
              {rankCell(medal(i), i + 1)}
              {nameCell(isRu ? c.ru : c.kz, `${c.active}${isRu ? ' сборов' : ' жиын'}`)}
              {metricCell(c.vol.toLocaleString('ru-RU'))}
            </div>
          ))}
        </div>
      )}

      {leaderTab === 'org' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {orgRows.map((o, i) => (
            <button
              key={o.id}
              type="button"
              className="erik-btn"
              onClick={() => navigate(`/o/${o.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              {rankCell(medal(i), i + 1)}
              {nameCell(o.name, `${o.events}${isRu ? ' событий' : ' іс-шара'}`)}
              {metricCell(`${o.vol}${isRu ? ' волонт.' : ' волонтёр'}`)}
            </button>
          ))}
        </div>
      )}
    </Container>
  );
}
