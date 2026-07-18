import { useNavigate, useParams } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useGatheringStore } from '../store/useGatheringStore';
import { THEMES, initialOf } from '../lib/data';
import { Container, BackButton } from '../components/Container';
import Icon from '../components/Icon';
import EventCard from '../components/EventCard';
import { EmptyState } from '../components/ui/feedback';

// Страница НКО: шапка, описание, статы, подписка и события организации.
export default function Org() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const { id } = useParams();
  const orgs = usePlatformStore((s) => s.orgs);
  const events = usePlatformStore((s) => s.events);
  const followedMap = usePlatformStore((s) => s.followed);
  const toggleFollow = usePlatformStore((s) => s.toggleFollow);
  const regs = useGatheringStore((s) => s.regs);

  const org = orgs.find((o) => o.id === id) || orgs[0];
  const T = THEMES[org.cat] || { ru: '', kz: '', tint: '#eee', ink: '#333' };
  const followed = !!followedMap[org.id];
  const orgEvents = events.filter((e) => e.orgId === org.id);

  const secTitle = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '28px 0 12px' };
  const statNum = { fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' };
  const statLbl = { fontSize: 13, color: 'var(--ink-3)' };

  return (
    <Container style={{ paddingTop: 20, paddingBottom: 48 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <BackButton onClick={() => navigate('/feed')} label={isRu ? 'Назад' : 'Артқа'} />

        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, margin: '8px 0 18px' }}>
          <span style={{ width: 64, height: 64, flex: 'none', borderRadius: 'var(--r-m)', background: T.tint, color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 26 }}>{initialOf(org.name)}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 23, letterSpacing: '-.02em', margin: 0 }}>{org.name}</h1>
              {org.verified && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 11, fontWeight: 500 }}>
                  <Icon name="check" size={12} stroke={2.4} />{t.verifiedLabel}
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 3 }}>{isRu ? T.ru : T.kz} · {org.city}</div>
          </div>
        </div>

        {/* Описание */}
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink)', margin: '0 0 18px' }}>{isRu ? org.aboutRu : org.aboutKz}</p>

        {/* Статы: события · волонтёры */}
        <div style={{ display: 'flex', gap: 22, marginBottom: 18 }}>
          <div><span style={statNum}>{org.events}</span> <span style={statLbl}>{t.profileEvents}</span></div>
          <div><span style={statNum}>{org.vol}</span> <span style={statLbl}>{t.volWord}</span></div>
        </div>

        {/* Подписка */}
        <button
          type="button"
          className="erik-btn"
          onClick={() => toggleFollow(org.id)}
          style={{ height: 44, padding: '0 22px', borderRadius: 'var(--r-m)', border: followed ? '1px solid var(--line)' : '1px solid transparent', background: followed ? 'var(--surface)' : 'var(--yard)', color: followed ? 'var(--ink)' : '#fff', fontFamily: 'var(--fb)', fontWeight: 500, fontSize: 15, cursor: 'pointer', transition: 'all var(--t-fast)' }}
        >
          {followed ? (isRu ? 'Вы подписаны' : 'Жазылдыңыз') : (isRu ? 'Подписаться' : 'Жазылу')}
        </button>

        {/* События организации */}
        <div style={secTitle}>{t.orgEventsTitle}</div>
        {orgEvents.length === 0 ? (
          <EmptyState icon="calendar" title={isRu ? 'Пока нет событий' : 'Әзірге іс-шара жоқ'} sub={isRu ? 'Скоро здесь появятся новые сборы.' : 'Жақында жаңа жиындар пайда болады.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orgEvents.map((e) => (
              <EventCard key={e.id} event={e} reg={regs[e.id]} onOpen={() => navigate(`/e/${e.id}`)} />
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
